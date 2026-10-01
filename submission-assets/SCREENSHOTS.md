# SIH26148 — Screenshot capture guide

Take these 4 screenshots (Windows: `Win+Shift+S`) and save them in this
folder with these exact names, ready to drop into the PPT:

| File | State |
|---|---|
| `01-dashboard.png` | /dashboard showing the seeded case |
| `02-run-intact.png` | /case/[id] after Run Script — CHAIN: INTACT |
| `03-audit-intact.png` | /case/[id]/audit — green INTACT pill, genesis roots |
| `04-audit-broken.png` | /case/[id]/audit — red BROKEN pill + tampered row |

## Setup (one time)

1. FastAPI service:  `uvicorn service.main:app --host 127.0.0.1 --port 8000`
2. Frontend:         `cd web && npm run dev`  → note the printed port (52904 last time)
3. Log in at `/login` with the demo analyst (see project notes).

## Shots

**01 — Dashboard:** open `http://localhost:52904/dashboard`.
Frame: case row "SIH demo — workstation 12 disk sweep", OPEN badge,
"rows filtered by RLS to your assigned cases" subtitle.

**02 — Run:** open the case from the dashboard, click **Run Script**,
wait for output: `CHAIN: INTACT`, sha256 line, "audit entries captured: 4".
Frame: editor on the left, output + green pill on the right.

**03 — Audit INTACT:** click **Audit log →**, then **Verify Chain**.
Frame: green `CHAIN: INTACT` pill, table with `genesis ↴` roots and
green `←———` links.

**04 — Audit BROKEN (tamper):** in the Supabase table editor open
`audit_logs`, pick the **newest** run's seq-1 `acquire` row, change the
first character of `hash` from `8` to `X`, save. Back on the audit page
click **Verify Chain**.
Frame: red `CHAIN: BROKEN` pill, the tampered `X…` hash visible, the
downstream row highlighted red with the broken `←⨯` link.

Tamper SQL equivalent (Supabase SQL editor), newest run first row:

```sql
update public.audit_logs
set hash = 'X' || substring(hash from 2)
where id = (
  select id from public.audit_logs
  where case_id = 'fc3cf89b-a9e7-4724-9618-577287cbf404'
    and prev_hash = '901131d838b17aac0f7885b81e03cbdc9f5157a00343d30ab22083685ed1416a'
  order by created_at desc limit 1
)
returning seq, action, hash;
```

Revert after the demo video:

```sql
update public.audit_logs
set hash = '8' || substring(hash from 2)
where hash like 'X%';
```
