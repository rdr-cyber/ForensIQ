# Jocky

A minimal, auditable scripting language (`.fzq`) for computer & network
forensic analysis.

> Hackathon prototype for Smart India Hackathon problem statement
> **SIH26148 (NTRO)**: *"Creation of scripts/functions with a new programming
> language to conduct computer & network forensic analysis without triggering
> security solutions."*

## The problem: false positives, not evasion

Forensic responders run analysis tools **on live, protected systems** — often
during an incident. General-purpose tools (Python interpreters, PowerShell,
compiled utilities) trip AV/EDR heuristics because they inherently exhibit
low-level behaviors:

| Heuristic trigger                  | Why generic tools do it              |
|------------------------------------|--------------------------------------|
| Raw memory read/write / injection  | Interpreters, debuggers, `mmap` use  |
| Unsigned / ad-hoc binaries         | Any custom EXE dropped on a host     |
| Obfuscated or dynamic execution    | `eval`, encoded commands, JIT        |
| Unusual child-process chains       | Script interpreters spawning shells  |

The result: the responder's own tooling gets quarantined mid-analysis, alerts
fire on the very host under investigation, and the chain of evidence is
polluted.

**Jocky is not an evasion tool.** It is a *purpose-built* language whose
operations are, by design, the ones EDRs allowlist: plain file reads, streamed
hashing, structured log parsing. No memory access, no process manipulation,
no packed code — and **every action is recorded in a tamper-evident audit
log**, because attribution is a forensic requirement, not an afterthought.

## Design principles

1. **Deliberately boring surface.** The interpreter only does read-only,
   allowlist-style operations (`hash`, `log`, `parse`, ...).
2. **Everything is audited.** Each action appends a hash-chained entry —
   `SHA-256(seq ‖ ts ‖ action ‖ detail ‖ prev_hash)` — so any later edit to
   the log breaks the chain visibly.
3. **No dynamic execution.** No `eval`, no dynamic imports, no self-modifying
   behavior. The whole runtime is a single readable pass: lexer → parser →
   interpreter.
4. **Line-oriented, keyword DSL.** Scripts are trivially reviewable by a
   human before execution.

## Quick start

```bash
python -m forensiq.main run examples/hash_sweep.fzq --verbose
```

Script (`examples/hash_sweep.fzq`):

```
acquire file "C:/target.txt"
hash sha256
log "hash computed"
```

Output:

```
sha256(C:/target.txt) = 3a5f...
audit: 3 entries, chain INTACT
```

The audit log lands in `audit.jsonl` (override with `--audit path.jsonl`).

## Evidence Bundle

A `report` statement turns the run into a self-contained, tamper-evident
evidence bundle. Before writing anything, the interpreter re-verifies the
audit hash chain and **refuses to emit a report if it is broken** — a report
on a tampered log would itself be tainted evidence.

```
acquire file "C:/target.txt"
hash sha256
log "hash computed"
report "hash_sweep_report.json"
```

```json
{
  "report_version": "1.0",
  "generated_at": "2026-09-30T08:14:03.102000+00:00",
  "script_file": "examples/hash_sweep.fzq",
  "script_hash": "9f2c...",
  "chain_status": "INTACT",
  "audit_chain": [
    {"seq": 1, "ts": "...", "action": "acquire", "detail": {...}, "prev_hash": "...", "hash": "..."},
    {"seq": 2, "ts": "...", "action": "hash",    "detail": {...}, "prev_hash": "...", "hash": "..."},
    {"seq": 3, "ts": "...", "action": "log",     "detail": {...}, "prev_hash": "...", "hash": "..."},
    {"seq": 4, "ts": "...", "action": "report",  "detail": {"output_path": "hash_sweep_report.json", "line": 4}, "prev_hash": "...", "hash": "..."}
  ],
  "results": {
    "acquired": {"target": "file", "path": "C:/target.txt"},
    "hashes": [{"path": "C:/target.txt", "algorithm": "sha256", "digest": "3a5f..."}]
  }
}
```

`script_hash` is the SHA-256 of the exact `.fzq` bytes executed, so the
bundle binds *what ran* to *what was recorded*.

## Signing & Verification

Every bundle is **signed with Ed25519** before it touches disk. The first
`report` generates an operator keypair in `.forensiq/` (private key chmod
600 on POSIX); the private key never leaves the machine and the public key
is embedded in each bundle.

The signature covers the canonical JSON of the bundle (sorted keys, no
whitespace ambiguity) *without* the signature field itself. Anyone can
re-canonicalize the received bundle the same way and verify against the
embedded public key:

```bash
python -m forensiq.main verify-report hash_sweep_report.json
# SIGNATURE VALID
```

If a single character of the bundle changes after signing, the canonical
bytes change and verification fails:

```
SIGNATURE INVALID / bundle has been modified since signing
```

This closes the remaining gap of the hash chain alone: a chain proves the
log wasn't edited after the fact, but anyone with the source could
regenerate a "valid" chain — a signature binds the bundle to the operator's
key, so post-signing tampering is detectable without trusting the machine
that produced it.

## Known Issues & Fixes

Found during end-to-end live testing (Supabase + web UI + service), kept
here deliberately — these are the failure modes that only appear past the
happy path:

1. **Timestamp normalization silently broke hash chains.** The interpreter
   computes `hash = SHA-256(seq ‖ ts ‖ action ‖ detail ‖ prev_hash)` over the
   *exact* timestamp string it generated, e.g. `…26.628750+00:00`. Storing
   `ts` as Postgres `timestamptz` made the database round-trip rewrite that
   string (`…26.62875+00:00` — trailing fractional zeros trimmed), so any
   entry whose microseconds ended in `0` no longer verified. **Fix:** store
   `audit_logs.ts` as `text` (migration `0002`). Design rule learned: *hash
   what you store, store what you hashed* — never let a typed column
   re-serialize evidence.
2. **Per-run chains interleave in a case-level listing.** Every script
   execution starts a fresh chain (seq 1, rooted at `SHA-256("GENESIS")`),
   so a case holds several chains. Ordered by `seq`, rows from different
   runs interleave (run1:1, run2:1, run1:2 …), which made a naive verifier
   splice two runs together and report a false BROKEN. **Fix:** the verifier
   rebuilds chains by following `prev_hash → hash` links from each genesis
   root — order-independent — and reports orphan rows as breaks.
3. **Hand-inserting `auth.users` rows breaks Supabase Auth.** Seeding an
   analyst via raw SQL (even with a correct bcrypt hash and a matching
   `auth.identities` row) caused GoTrue to 500 on password grant.
   **Fix:** seed users through the Auth signup API (or dashboard), then
   attach the profile row — never hand-craft auth internals.
4. **RLS can't protect a column — any user could self-promote to admin.**
   `analysts_update_own` (0001) allowed `for update` on the whole row, so
   `PATCH /rest/v1/analysts?id=eq.<own>` with `{"role": "admin"}` succeeded
   — verified by replaying the exact authenticated context (JWT claim GUCs
   + `set local role authenticated`) in a rolled-back transaction. RLS is
   row-granular by design; column rules need SQL privileges. **Fix**
   (migration `0006`): `revoke update … from authenticated` +
   `grant update (name)` — the privilege layer now rejects the promotion
   with `42501 permission denied` *before* RLS evaluates. Admin policy
   paths then ride on a `security definer` `is_admin()` (same pattern as
   `can_access_case()` from 0004b), and admins get **no** write path into
   `audit_logs` — even an admin can only read the chain.

5. **Report generation is not atomic against a Storage failure.** In
   `/api/generate-report` the signing + DB writes (`scripts`, `audit_logs`,
   `signed_manifest`) commit *before* the signed bundle is uploaded to the
   `evidence-bundles` bucket. A hard Storage outage returns a clear
   `500 bundle upload failed` and skips the `evidence_bundles` index row, but
   the earlier commits are already durable — leaving a script whose chain is
   INTACT and carries a `signed_manifest` yet has **no downloadable bundle**
   until retried. **Mitigation today:** the upload path is deterministic
   (`{case_id}/{script_id}.json`) with `upsert`, so re-running *Generate
   Report* heals cleanly. **Open item:** fold the persistence steps into one
   `service_role` transaction for true atomicity (see `SYSTEM_DESIGN.md` §5.1).

## Running the full stack (web demo)

Backend interpreter + signer: this repo's `forensiq/` package, exposed over
HTTP by the FastAPI service; persistence and auth in Supabase (project
"maverick Project", ref `dniozvrtlvxgpxlnaxqp`).

1. **Database** — apply the migrations in `supabase/migrations/` in order:
   `0001` schema + RLS · `0002` `audit_logs.ts` → `text` (hash stability) ·
   `0003` analysts.role + auto-provision trigger · `0004`/`0004b` case
   members + recursion-free `can_access_case()` · `0005` evidence-bundle
   storage bucket + table · `0006` admin role (`is_admin()`, separate admin
   RLS paths, no self-service promotion).
2. **Env** — copy `web/.env.local.example` to `web/.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase →
   Project Settings → API) and `FORENSIQ_SERVICE_URL`.
3. **Interpreter service** —
   ```bash
   pip install -r service/requirements.txt
   uvicorn service.main:app --host 127.0.0.1 --port 8000
   ```
4. **Frontend** —
   ```bash
   cd web && npm install && npm run dev
   ```
5. **Demo login** — a seeded analyst account
   `analyst2@forensiq.dev` / `<DEMO_PASSWORD>` (password redacted here; set
   at seed time via the Auth signup endpoint). The seeded case is
   "SIH demo — workstation 12 disk sweep". RLS ensures that analyst sees
   only cases assigned to them.
6. **Optional: Google sign-in** — enable the Google provider under
   Authentication → Providers with your own Google Cloud OAuth client
   (web application; authorized redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`), and allow-list
   your dev origin under Authentication → URL Configuration. The
   "Continue with Google" buttons on `/login` and `/signup` then work with
   no further code changes; new users get an `analysts` row with
   `role='analyst'` via the 0003 trigger. Admins are promoted manually via
   SQL (never in-app) and manage everything through `/admin`.
7. **Temporary public access (Cloudflare Tunnel)** — to open Jocky from any
   device, tunnel the Next.js server only. Never expose port 8000: the
   browser never talks to FastAPI directly — the API routes under
   `web/src/app/api/*` proxy server-side via `FORENSIQ_SERVICE_URL`, so one
   tunnel on the Next.js port is enough (and keeps CORS trivially same-origin).
   ```bash
   # 1. production build + start; read the real port from the
   #    "Local:" line — it drifts every restart, never assume 3000
   cd web && npm run build && npm run start

   # 2. tunnel pointed at the port Next.js printed
   cloudflared tunnel --url http://localhost:<nextjs-port>
   ```
   `cloudflared` prints a one-off `https://<random>.trycloudflare.com` URL;
   it changes on every restart, so don't persist it anywhere. The same
   URL works on phones — log in, run a script, and verify the chain from
   the public link. If you test Google sign-in through the tunnel, first
   add the tunnel origin under Authentication → URL Configuration (the
   app builds redirects from `window.location.origin`).
8. **Reboot-proof setup: Windows services + stable hostname** —
   ```bash
   # one-time: project venv (the services run under LocalSystem,
   # which cannot see per-user pip installs)
   python -m venv .venv
   .venv\Scripts\python -m pip install -r service/requirements.txt

   # from an ELEVATED prompt — idempotent, safe to re-run
   tools\install-jocky-services.bat
   ```
   Registers two NSSM services (install NSSM first:
   `winget install --id NSSM.NSSM`): **JockyFastAPI** (uvicorn on
   127.0.0.1:8000) and **JockyWeb** (Next.js prod pinned to port 3000,
   `DependOnService JockyFastAPI`), both `SERVICE_AUTO_START` with
   5s crash-restart and rotating logs
   (`service/uvicorn-service.log`, `web/next-service.log`). Manage with
   `sc query|stop|start JockyFastAPI|JockyWeb`.

   The public URL comes from the **Cloudflared agent** service
   (remotely-managed tunnel, already installed and reboot-proof): in the
   Cloudflare Zero Trust dashboard → Networks → Tunnels → select the
   account's tunnel → Public Hostname → add subdomain `jocky`, your zone,
   service `HTTP://localhost:3000`. Never expose :8000 — the browser
   never talks to FastAPI directly. The resulting `https://jocky.<zone>`
   survives reboots; no URL is persisted in this repo. (CLI alternative:
   `cloudflared tunnel login` → `tunnel create jocky` →
   `tunnel route dns jocky jocky.<zone>` → `tunnel run` via
   `cloudflared service install`.)

Every run from the UI persists a `scripts` row plus the run's audit chain
(`audit_logs`), and `Generate Report` stores the Ed25519-signed bundle in
`scripts.signed_manifest`.

## Project layout

```
forensiq/            # interpreter core (CLI: python -m forensiq.main)
  lexer.py parser.py interpreter.py audit.py signing.py main.py stdlib/
service/             # FastAPI wrapper: /health /run /report (stateless sandbox)
web/                 # Next.js 14 App Router frontend (login/dashboard/case/audit)
supabase/migrations/ # schema + RLS policies (0001_init, 0002_ts_text)
examples/            # demo .fzq scripts
```

## Roadmap

- [ ] `stdlib/`: `strings`, `entropy`, `yara-lite` pattern match (pure read)
- [ ] `acquire mem --process <pid>` via sanctioned OS APIs (no injection)
- [ ] `parse evtx`, `parse pcap` structured log analysis
- [x] `report` statement producing tamper-evident JSON evidence bundles
      (chain verified before write; Ed25519-signed)
- [ ] Script signing: `.fzq` files carry an operator signature the runtime
      verifies before executing (trust the *script*, not just the tool)

## Status

Hackathon prototype (v0). Interpreter: standard library only; service layer
adds FastAPI; web adds Supabase — see `requirements.txt` files.
