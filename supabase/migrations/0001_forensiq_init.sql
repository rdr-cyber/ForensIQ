-- ForensiQ initial schema — SIH26148
-- Project: maverick Project (dniozvrtlvxgpxlnaxqp), applied 2026-09-30
-- Tables: analysts, cases, scripts, audit_logs — RLS enabled on all.
--
-- audit_logs uses the exact column names the frontend expects:
--   seq, action, ts, hash, prev_hash, detail
-- (web/src/app/case/[id]/audit/page.tsx and web/src/app/api/verify-chain/route.ts)

create type public.case_status as enum ('open', 'under_review', 'closed');

-- ------------------------------------------------------------------ --
-- analysts: profile linked 1:1 with a Supabase auth user
-- ------------------------------------------------------------------ --
create table public.analysts (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null default 'analyst'
             check (role in ('analyst', 'lead', 'admin')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ --
-- cases
-- ------------------------------------------------------------------ --
create table public.cases (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      public.case_status not null default 'open',
  created_by  uuid not null references public.analysts(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index cases_created_by_idx on public.cases (created_by);

-- ------------------------------------------------------------------ --
-- scripts: one row per saved/run version of a .fzq script
-- ------------------------------------------------------------------ --
create table public.scripts (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.cases(id) on delete cascade,
  name            text,
  source_code     text not null,
  signed_manifest jsonb,
  created_by      uuid references public.analysts(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index scripts_case_id_idx on public.scripts (case_id);

-- ------------------------------------------------------------------ --
-- audit_logs: the hash chain, one row per interpreter action
-- ------------------------------------------------------------------ --
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  script_id  uuid references public.scripts(id) on delete set null,
  action     text not null,
  seq        integer not null check (seq >= 1),
  ts         timestamptz not null,
  hash       text not null,
  prev_hash  text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_case_seq_idx on public.audit_logs (case_id, seq);

-- ------------------------------------------------------------------ #
-- Row Level Security
-- Rule: an analyst sees only rows belonging to cases they created.
-- Cases policies check created_by directly; scripts/audit_logs policies
-- resolve ownership through the parent case.
-- ------------------------------------------------------------------ #

alter table public.analysts   enable row level security;
alter table public.cases      enable row level security;
alter table public.scripts    enable row level security;
alter table public.audit_logs enable row level security;

-- analysts: a user manages only their own profile row
create policy "analysts_select_own" on public.analysts
  for select to authenticated using (id = auth.uid());
create policy "analysts_insert_own" on public.analysts
  for insert to authenticated with check (id = auth.uid());
create policy "analysts_update_own" on public.analysts
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- cases: only the creator
create policy "cases_select_own" on public.cases
  for select to authenticated using (created_by = auth.uid());
create policy "cases_insert_own" on public.cases
  for insert to authenticated with check (created_by = auth.uid());
create policy "cases_update_own" on public.cases
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

-- scripts: only via an owned case
create policy "scripts_select_own_case" on public.scripts
  for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid()));
create policy "scripts_insert_own_case" on public.scripts
  for insert to authenticated
  with check (exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid()));
create policy "scripts_update_own_case" on public.scripts
  for update to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid()))
  with check (exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid()));

-- audit_logs: only via an owned case
create policy "audit_logs_select_own_case" on public.audit_logs
  for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid()));
create policy "audit_logs_insert_own_case" on public.audit_logs
  for insert to authenticated
  with check (exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid()));
