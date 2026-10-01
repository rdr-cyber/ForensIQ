-- ForensiQ migration 0004b — fix RLS infinite recursion.
-- 0004 made case_members policies read `cases` while cases policies read
-- `case_members` -> Postgres 42P17 "infinite recursion detected in policy".
-- Fix: one SECURITY DEFINER helper owns all access decisions; policies call
-- the function instead of querying protected tables directly. As definer it
-- runs with table-owner rights (no RLS re-entry) and is stable per statement.

create or replace function public.can_access_case(p_case_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.cases c
    where c.id = p_case_id and c.created_by = auth.uid()
  ) or exists (
    select 1 from public.case_members m
    where m.case_id = p_case_id and m.analyst_id = auth.uid()
  )
$$;

-- replace every policy that could recurse with the helper
drop policy if exists "case_members_select" on public.case_members;
create policy "case_members_select" on public.case_members
  for select to authenticated
  using (public.can_access_case(case_id) or analyst_id = auth.uid());

drop policy if exists "case_members_insert" on public.case_members;
create policy "case_members_insert" on public.case_members
  for insert to authenticated
  with check (
    exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid())
  );

drop policy if exists "case_members_delete" on public.case_members;
create policy "case_members_delete" on public.case_members
  for delete to authenticated
  using (
    exists (select 1 from public.cases c where c.id = case_id and c.created_by = auth.uid())
  );

drop policy if exists "cases_select_member" on public.cases;
create policy "cases_select_member" on public.cases
  for select to authenticated
  using (public.can_access_case(id));

drop policy if exists "scripts_select_member" on public.scripts;
create policy "scripts_select_member" on public.scripts
  for select to authenticated
  using (public.can_access_case(case_id));

drop policy if exists "scripts_insert_member" on public.scripts;
create policy "scripts_insert_member" on public.scripts
  for insert to authenticated
  with check (public.can_access_case(case_id));

drop policy if exists "audit_logs_select_member" on public.audit_logs;
create policy "audit_logs_select_member" on public.audit_logs
  for select to authenticated
  using (public.can_access_case(case_id));

drop policy if exists "audit_logs_insert_member" on public.audit_logs
;
create policy "audit_logs_insert_member" on public.audit_logs
  for insert to authenticated
  with check (public.can_access_case(case_id));
