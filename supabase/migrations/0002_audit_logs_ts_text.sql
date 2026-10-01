-- ForensiQ migration 0002 — audit_logs.ts must be byte-exact.
-- The interpreter hashes the *exact* timestamp string it generated.
-- timestamptz re-serializes on round-trip (trailing fractional zeros are
-- trimmed), which silently breaks chain verification for any entry whose
-- microseconds end in 0. Storing text preserves the hashed string.
-- See README "Known Issues & Fixes" #1.

alter table public.audit_logs alter column ts type text using ts::text;
