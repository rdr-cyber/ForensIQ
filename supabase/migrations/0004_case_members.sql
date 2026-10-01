-- ForensiQ migration 0004 — shared case membership.
-- A case's owner (cases.created_by) keeps full access; additional analysts
-- are granted access through case_members. Policies below are OR-composed
-- with the existing created_by policies from 0001.

create table public.case_members (
  case_id    uuid not null references public.cases(id) on delete cascade,
  analyst_id uuid not null references public.analysts(id) on delete cascade,
  role       text not null default 'member' check (role in ('member', 'lead')),
  created_at timestamptz not null default now(),
  primary key (case_id, analyst_id)
);

alter table public.case_members enable row level security;

-- members see the membership rows of cases they can already access
create policy "case_members_select" on public.case_members
  for select to authenticated
  using (
    analyst_id = auth.uid()
    or exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid())
  );

-- case owners can add members
create policy "case_members_insert" on public.case_members
  for insert to authenticated
  with check (
    exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid())
  );

-- case owners can remove members
create policy "case_members_delete" on public.case_members
  for delete to authenticated
  using (
    exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid())
  );

-- ------------- widened access for shared cases (OR with created_by) -------

create policy "cases_select_member" on public.cases
  for select to authenticated
  using (
    exists (select 1 from public.case_members m where m.case_id = id and m.analyst_id = auth.uid())
  );

create policy "scripts_select_member" on public.scripts
  for select to authenticated
  using (
    exists (select 1 from public.case_members m where m.case_id = case_id and m.analyst_id = auth.uid())
  );

create policy "scripts_insert_member" on public.scripts
  for insert to authenticated
  with check (
    exists (select 1 from public.case_members m where m.case_id = case_id and m.analyst_id = auth.uid())
  );

create policy "audit_logs_select_member" on public.audit_logs
  for select to authenticated
  using (
    exists (select 1 from public.case_members m where m.case_id = case_id and m.analyst_id = auth.uid())
  );

create policy "audit_logs_insert_member" on public.audit_logs
  for insert to authenticated
  with check (
    exists (select 1 from public.case_members m where m.case_id = case_id and m.analyst_id = auth.uid())
  );
