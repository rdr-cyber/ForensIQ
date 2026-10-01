# Jocky — System Design

> SIH26148 (NTRO). Purpose-built forensic scripting language (`.fzq`) + web
> console. This document describes the **system as built**. Where a capability
> is designed but not yet implemented it is explicitly tagged
> **`PLANNED — not built`**.

Every statement below is traceable to source: the interpreter in `forensiq/`,
the HTTP wrapper in `service/main.py`, the SQL in `supabase/migrations/`, and
the UI in `web/src/`. File references are given inline.

---

## 1. Components & data-flow

Four cooperating tiers. The frontend never shells out to Python and the
FastAPI service never holds database credentials — persistence is confined to
Next.js API route handlers running under the **caller's own bearer token**, so
Row Level Security is evaluated as the signed-in analyst.

```
                                   ┌──────────────────────────┐
   Browser (Next.js 14 App Router) │   Google OAuth           │  Auth provider
   ┌────────────────────────────┐  │   (Supabase Auth         │  (signInWithOAuth
   │ login / signup ────────────┼──┤    provider="google")    │   "google")
   │ dashboard · case · audit   │  │   handle_new_user()      │  → auto-provision
   │ /admin · /admin/denied     │  │   trigger → analysts row │  analysts profile
   └──────────┬─────────────────┘  └──────────────────────────┘
              │ fetch /api/*  (Authorization: Bearer <access_token>)
              ▼
   ┌───────────────────────────────────────────────────────────┐
   │ Next.js API route handlers  (web/src/app/api)              │
   │   /run-script  /generate-report  /verify-chain  /bundle-url│
   │   createRouteClient(auth) → Supabase client w/ caller JWT   │
   │   ── the ONLY tier that writes to the database ──           │
   └───────┬──────────────────────────────┬─────────────────────┘
           │ POST /run, /report           │ Postgres / Storage via RLS
           ▼                              ▼
   ┌──────────────────────┐   ┌───────────────────────────────────┐
   │ FastAPI service      │   │ Supabase                          │
   │ service/main.py      │   │  • Postgres (analysts, cases,     │
   │  lexer→parser→       │   │    scripts, audit_logs,           │
   │  interpreter→audit   │   │    case_members, evidence_bundles)│
   │  Ed25519 sign        │   │  • Storage: evidence-bundles      │
   │  stateless sandbox   │   │    (private bucket)               │
   │  (temp dir per run)  │   │  • Realtime: audit_logs channel   │
   │  NO DB credentials   │   │    ── PLANNED — not built ──       │
   └──────────────────────┘   └───────────────────────────────────┘
```

**New/extended components since the original design:**

| Component | Tier | Built? | Source of truth |
|---|---|---|---|
| Google OAuth (Supabase Auth provider) | Auth | ✅ | `web/src/app/login/page.tsx`, `signup/page.tsx` (`signInWithOAuth`) |
| Trigger-based `analysts` provisioning | DB | ✅ | migration `0003` `handle_new_user()` |
| Supabase Storage `evidence-bundles` (private) | DB/Storage | ✅ | migration `0005`, `api/generate-report/route.ts` (upload), `api/bundle-url/route.ts` (signed URL) |
| Supabase Realtime `audit_logs` subscription | DB/Realtime | ❌ **PLANNED** | none — audit page refetches manually (`case/[id]/audit/page.tsx`) |
| `/admin` surface + `admin/denied` | UI + RLS | ✅ | `web/src/app/admin/page.tsx`, migration `0006` |
| `case_members` shared access | DB | ✅ | migration `0004` + `0004b` |

---

## 2. Data model

Six tables, all with RLS enabled. Solid lines are hard FKs; the owning
relationship for scripts/audit/bundles is resolved **through the parent case**.

```
 auth.users (Supabase-managed)
     │ 1:1  (id FK, ON DELETE CASCADE)
     ▼
┌───────────┐        ┌──────────────┐   created_by   ┌─────────────────┐
│ analysts  │◀───────│    cases     │───────────────▶│   case_members  │
│ id (PK)   │  FK    │ id (PK)      │   uuid→analysts│ case_id (PK,FK) │
│ name      │  (1:N) │ title        │  on delete     │ analyst_id(PK,FK│
│ role      │        │ description  │   cascade      │   →analysts)    │
│  'analyst'│        │ status enum  │                │ role 'member'   │
│  |'admin'  │        │  (open /     │                │  |'lead'        │
│ created_at│        │  under_review│                │ created_at      │
└───────────┘        │  /closed)    │                └─────────────────┘
                     │ created_by FK│
                     └──────┬───────┘
              ┌─────────────┼─────────────────┐
              │ case_id FK  │ case_id FK      │ case_id FK
              ▼             ▼                 ▼
        ┌───────────┐  ┌──────────────┐  ┌────────────────────┐
        │ scripts   │  │ audit_logs   │  │ evidence_bundles   │
        │ id (PK)   │  │ id (PK)      │  │ id (PK)            │
        │ case_id FK│  │ case_id FK   │  │ case_id FK         │
        │ name      │  │ script_id FK │  │ script_id FK       │
        │ source_   │  │ action       │  │ storage_path  UNIQ │
        │  code     │  │ seq ≥ 1      │  │ sha256             │
        │ signed_   │  │ ts  TEXT     │  │ created_at         │
        │  manifest │  │ hash         │  └─────────┬──────────┘
        │  (jsonb)  │  │ prev_hash    │            │ storage_path
        │ created_by│  │ detail jsonb │            ▼
        │  FK       │  │ created_at   │   storage.objects (bucket
        └───────────┘  └──────────────┘   'evidence-bundles', private)
```

Notes traceable to migrations:
- `audit_logs.ts` is **`text`, not `timestamptz`** (migration `0002`). A typed
  column re-serialized the microsecond string on round-trip and silently broke
  hash chains. Rule: *hash what you store, store what you hashed.*
- `evidence_bundles.storage_path` follows `{case_id}/{script_id}.json`; the
  first path segment is the RLS decision key (see `0005`).
- `analysts.role` is constrained to `('analyst','admin')` in `0003`; `0001`'s
  broader `('analyst','lead','admin')` enum-check is superseded by the role
  column added in `0003`.

### 2.1 RLS policies and their governing helpers

Two **`SECURITY DEFINER`** functions own every cross-table access decision:

- **`can_access_case(p_case_id uuid)`** — `0004b`. True if the caller is the
  case creator **or** a `case_members` row exists for them.
- **`is_admin()`** — `0006`. True if the caller's `analysts.role = 'admin'`.

| Table | Read policy | Write policy | Governed by |
|---|---|---|---|
| `analysts` | own row (`id = auth.uid()`, `0001`) + `analysts_select_admin` (`0006`) | insert own (`0001`); **UPDATE limited to `name`** via column grants (`0006`) | `auth.uid()`, `is_admin()` |
| `cases` | `cases_select_own`/`_update_own` (`0001`) + `cases_select_member`→`can_access_case` (`0004b`) + `cases_select_admin` (`0006`) | creator or admin | `created_by`, `can_access_case()`, `is_admin()` |
| `case_members` | `case_members_select` = `can_access_case(case_id) OR analyst_id = auth.uid()` (`0004b`) | owner adds/removes members (`0004` insert/delete check on `created_by`) | `can_access_case()` |
| `scripts` | `scripts_select_own_case` (`0001`) + `scripts_select_member`→`can_access_case` (`0004b`) + `scripts_select_admin` (`0006`) | insert via accessible case | `can_access_case()`, `is_admin()` |
| `audit_logs` | own/member/admin select paths (`0001`/`0004b`/`0006`) | **insert only** via `can_access_case` (member path `0004b`); **no admin write path, no update/delete policy at all** | `can_access_case()` (write), `is_admin()` (read) |
| `evidence_bundles` | `evidence_bundles_select`→`can_access_case` (`0005`) + `_select_admin` (`0006`) | insert via `can_access_case` (`0005`) | `can_access_case()`, `is_admin()` |
| `storage.objects` | object read gated on `bucket_id='evidence-bundles'` + first-segment uuid `can_access_case` (`0005`) + admin read (`0006`) | object insert gated same way (`0005`) | `can_access_case()`, `is_admin()` |

### 2.2 Why these helpers are `SECURITY DEFINER` — the recursion lesson

Migration `0004` first wrote membership policies that read the *other* table
directly: `case_members` policies queried `cases`, while the widened `cases`
policy queried `case_members`. Under Postgres this triggered
**`42P17 infinite recursion detected in policy`** — RLS policies on one
protected table invoking RLS on another re-enter without end.

The fix (`0004b`, reused by `0005`/`0006`) factors the decision into **one
owner-rights function** the policies *call* instead of inlining a query:

- As `SECURITY DEFINER` it runs with the **table owner's** rights, so its
  internal `SELECT` on `cases`/`case_members` does **not** re-trigger RLS —
  the recursion is structurally impossible, not just dodged.
- `set search_path = public` pins resolution so the definer can't be hijacked
  by a shadowed object; `stable` lets Postgres cache it per statement.

**Documented lesson, not merely a fix:** when RLS rules on table A must consult
table B (which is itself RLS-protected), do **not** inline the cross-table
predicate — centralize it in a `SECURITY DEFINER` helper owned by the table
role. Both `can_access_case()` and `is_admin()` exist for this reason.

---

## 3. Trust boundaries

Jocky defends four **independent** layers (detailed in §6). RLS and the
admin role live entirely in layer 1; the audit chain (layer 3) and the
signature (layer 4) are computed in the interpreter/signer and are structurally
unaware of who is querying the database.

### 3.1 The admin role (`0006`)

"Admin" is defined as a **layer-1, read-visibility** privilege and nothing more.

**What admin access bypasses (RLS / row visibility only):**
- Case **ownership** and **membership** checks: `cases_select_admin`,
  `scripts_select_admin` let admins list **all** cases and scripts, not just
  their own.
- `analysts_select_admin` lets admins read every analyst profile — needed to
  show creator names as attribution in the `/admin` console.
- `audit_logs_select_admin` + `evidence_bundles_select_admin` + the admin
  `storage.objects` read let an admin **read** any case's trail and bundles.

**What admin access still CANNOT bypass:**
- **No admin write path into `audit_logs`.** `0006` deliberately creates only a
  *select* policy for admins — there is no admin insert/update/delete on
  `audit_logs` at all, and no update policy exists for **any** role. Even an
  admin can only *read* the chain.
- **No admin path into the signature layer.** Bundles are signed by the
  operator Ed25519 key inside the interpreter service (`service/main.py`,
  `forensiq/signing.py`) before persistence. `is_admin()` is consulted only in
  Postgres policies; it has zero bearing on key material, canonicalization, or
  verification. An admin cannot produce a bundle that verifies under a key they
  do not hold.

**Explicit invariant:** *"admin" means "can see more data," never "can forge a
valid chain or signature."* Chain integrity and signature validity are
verified independently of RLS (`/api/verify-chain` re-walks the hash chain from
genesis; `verify-report` verifies Ed25519) — neither asks the database who the
caller is.

**No self-service promotion.** `0006` revokes all `UPDATE` on `analysts` from
`authenticated` then grants back only `UPDATE(name)`, so the row-level
`analysts_update_own` policy can no longer be used to set one's own `role`
(PG rejects the column write with `42501` before RLS even evaluates). Admin
roles are granted only by the table owner via console / `service_role` SQL.

---

## 4. Request lifecycle

### 4.1 Run a script (persist + execute, no report)
`case/[id]/page.tsx` → `POST /api/run-script`

```
analyst → /api/run-script {case_id, content}   (Bearer access_token)
  → createRouteClient(auth)                    # caller-scoped client
  → scripts.insert(...)                         # RLS: 403 if case not accessible
  → POST service:8000/run {script, files}       # fresh temp-dir sandbox
  ← {ok, stdout, chain_status, audit_entries}
  → audit_logs.insert(entries[])                 # RLS: can_access_case
  → 200 {..., script_id}                          # audit page refetches (no push)
```

### 4.2 Generate a signed evidence bundle
`case/[id]/page.tsx` → `POST /api/generate-report` → Storage

```
analyst → /api/generate-report                  (Bearer access_token)
  → scripts.insert → service:8000/report        # interpreter re-verifies chain,
                                                # refuses to emit if BROKEN,
                                                # then Ed25519-signs
  → audit_logs.insert(entries)
  → scripts.update(signed_manifest)
  → storage.upload('evidence-bundles', {case_id}/{script_id}.json)
  → evidence_bundles.insert(storage_path, sha256)
  → 200 {..., script_id}
  # later: /api/bundle-url → createSignedUrl(300s) → browser opens download
```

### 4.3 Analyst signs up via Google OAuth *(new sequence)*

```
visitor → /login or /signup → "Continue with Google"
  → supabase.auth.signInWithOAuth({provider:'google', redirectTo:'/dashboard'})
  → Google consent → Supabase callback
  → GoTrue creates/links auth.users row (+ auth.identities)
  → INSERT trigger on_auth_user_created fires handle_new_user()   [0003]
      → analysts.insert(id, name=email-local-part, role='analyst')
        SECURITY DEFINER so it bypasses analysts RLS safely (runs as owner)
  → session established → /dashboard  (RLS now scopes every query to this id)
```
The app inserts **nothing** itself on signup — the profile is created by the
trigger, exactly as for password signups. Hand-inserting `auth.users` rows is
forbidden (README Known Issue #3: it breaks GoTrue).

### 4.4 Admin views another analyst's case *(new sequence)*

```
admin → /admin
  → reads own analysts row (role column)        # client-side gate ONLY
  → if role != 'admin': redirect /admin/denied   # UX, not security
  → cases.select(all)                            # RLS: cases_select_admin→is_admin()
  → analysts.select(id,name)                      # RLS: analysts_select_admin
  → click case → audit_logs.select(case_id)       # RLS: audit_logs_select_admin
                                                   #   (READ-ONLY, no write policy)
```
The `role` check in the page decides *what to render*; the **RLS policies decide
what data can be fetched**. A client that tampers with `role` still gets an
empty/rejected result set, because `is_admin()` is evaluated server-side from
`auth.uid()` on every query.

---

## 5. Failure modes

| Failure | Observed behavior | Recovery / note |
|---|---|---|
| Interpreter service down | `/run-script`,`/generate-report` catch fetch throw → **502** `forensiq service unreachable` | Frontend shows error inline; no partial DB write beyond the `scripts` row |
| Script lex/parse/interp error | Service returns `ok:false` + `error`; `/report` raises **422** | stdout up to failure preserved; chain status reported |
| Broken chain at report time | Interpreter **refuses** to emit the bundle (raises `report: audit chain BROKEN`) | No unsigned/tampered bundle is ever stored — by design |
| Storage upload failure | **Fails with a clear error, not silently:** handler returns **500** `bundle upload failed` and does **not** insert the `evidence_bundles` index row. | ⚠️ **Not fully atomic:** the `scripts` row, `audit_logs` rows, and `signed_manifest` update are already committed before the upload attempt. A failed upload leaves a signed manifest on the script but no Storage object / index row. See §5.1. |
| Bundle index insert failure | Returns **500** `bundle index failed` (upload already succeeded → orphan object) | Same non-atomic caveat; path is `upsert:true` so a retry heals it |
| Google OAuth provider down | `signInWithOAuth` resolves with an `error` (provider unreachable / not enabled) | Login/signup surface it inline (`setError(error.message)`), stay on page; **password login + existing sessions keep working** — OAuth is one of two paths, not the sole entry |
| RLS rejects a write (case not accessible) | `scripts/audit_logs` insert errors → **403** `script persistence failed` | Expected path for a non-member; nothing leaked |
| Realtime disconnect | **N/A — Realtime is not implemented** (`PLANNED`). Audit rows are loaded once and refetched only on "Verify Chain"; there is no subscription to drop. | When built, this row becomes live; today the view is pull-only, so it is stale-until-refresh, never "connected/disconnected." |

### 5.1 Storage-failure atomicity — explicit answer
The question *"does report generation still succeed with a clear error, or fail
atomically?"* → **It succeeds the run and fails the *storage* step with a clear
error, but the operation is NOT atomic.** Signing and DB writes (scripts,
audit_logs, signed_manifest) commit first; the Storage upload and
`evidence_bundles` index are the last two steps and each returns its own
`500` on failure. Consequence: a hard Storage outage yields a case whose script
row shows `chain INTACT` and holds a `signed_manifest`, but has **no downloadable
Storage bundle** until retried. Because `upload` uses `upsert:true` and the path
is deterministic (`{case_id}/{script_id}.json`), a re-report heals cleanly. If
strict atomicity is desired, the persistence steps should move into a single
`service_role` RPC / transaction (open item).

---

## 6. Security model — four independent layers

Jocky's guarantee is the **conjunction of four layers, each independently
sufficient to catch a different class of tampering**. Crucially, **privilege —
including the admin role — touches only layer 1** and has no interaction with
layers 2–4:

1. **RLS — *who can see which row.*** Enforced in Postgres for every query,
   evaluated from `auth.uid()`. Governs visibility and cross-case isolation, and
   is the **only** layer the admin role modifies (`is_admin()` widens *read*
   scope). It says nothing about whether the evidence is genuine.
2. **Sandboxing — *what a script can touch.*** Each run executes in a fresh
   temp directory with CWD pinned inside it (`service/main.py`); `acquire`
   targets resolve only against that sandbox, and `os.path.basename` blocks path
   traversal on input files. The interpreter exposes read-only, allowlist
   primitives (`hash`, `log`, `parse`) — no memory access, no process spawn, no
   `eval`. Independent of who the caller is.
3. **The audit chain — *was anything edited mid-run?*** Every action appends a
   hash-chained entry `SHA-256(seq ‖ ts ‖ action ‖ canonical_json(detail) ‖
   prev_hash)` rooted at `SHA-256("GENESIS")`. Editing/inserting any historical
   entry breaks every downstream hash. Verified independently by the interpreter
   (`forensiq/audit.py`) and re-walked server-side by `/api/verify-chain` — the
   verifier rebuilds each run by following `prev_hash→hash` links (order-
   independent), never trusting row order.
4. **The signature — *was the bundle edited after signing?*** The whole bundle
   (minus the signature field) is canonicalized and Ed25519-signed by the
   operator key (`forensiq/signing.py`) before it reaches disk or Storage. The
   chain proves the log wasn't edited after the fact but could be regenerated by
   anyone with the source; the signature binds the bundle to a key the producer
   alone holds, so post-signing tampering is detectable without trusting the
   producing machine.

**Layer independence, stated plainly:** admin privilege is a layer-1 concept.
Granting `is_admin()` changes what rows a caller can *read*; it cannot edit the
audit chain (no write policy exists for admins at all, and chain verification
never consults the DB for identity), and it cannot forge a signature (key
material never leaves the service's `FORENSIQ_KEY_DIR`, and verification is
pure cryptography over the canonical bundle bytes). "Admin" therefore always
means **"can see more data,"** never **"can produce evidence that appears valid
but isn't."**

---

## 7. Roadmap / known gaps

- **Supabase Realtime `audit_logs` subscription — `PLANNED — not built`.** The
  intended design is a `postgres_changes` channel filtered on the case's
  `audit_logs` inserts, surfaced in the UI as a small "live" pulse dot that
  appears only while the subscription is connected and falls back **silently**
  to the current pull-on-verify behavior if not. Until then the audit view is
  intentionally pull-only.
- Strict atomicity for report persistence (see §5.1) via a single `service_role`
  transaction.
- `stdlib/`: `strings`, `entropy`, `yara-lite`; `acquire mem` via sanctioned OS
  APIs; `parse evtx`/`parse pcap` (see README roadmap).
- Script signing: `.fzq` files carry an operator signature verified before
  execution (trust the *script*, not just the tool).
