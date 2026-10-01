-- ForensiQ migration 0006 — admin role & access control.
-- 1) is_admin(): SECURITY DEFINER helper, same pattern as can_access_case()
--    (0004b) — one owner-rights function owns the decision, policies call it
--    instead of querying protected tables, so no 42P17 recursion returns.
-- 2) No self-service promotion: role changes happen ONLY via direct SQL run
--    by the owner (console / service_role). BEFORE this migration any user
--    could PATCH their own analysts.role through analysts_update_own (0001
--    had no column restriction) — verified exploitable, see README. The fix
--    is column-level privileges: authenticated keeps UPDATE(name) and loses
--    every other column on their own row.
-- 3) Separate admin policy paths: admins see ALL cases/scripts and their
--    bundles + audit trails. audit_logs, evidence_bundles and the storage
--    objects stay SELECT-only for admins on purpose — the product's core
--    promise is that a signed audit chain cannot be rewritten, so even an
--    admin gets no write path into it. Cases/scripts keep manage rights for
--    admin workflows (creating/reassigning cases, curating scripts).

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.analysts a
    where a.id = auth.uid() and a.role = 'admin'
  )
$$;

-- ------------------------------------------------------------------ --
-- no self-service role changes (column privilege fix)
-- ------------------------------------------------------------------ --
revoke update on public.analysts from authenticated;
grant update (name) on public.analysts to authenticated;

-- admins may read every analyst profile (attribution in /admin: creator
-- names on cases they don't own); write access stays own-row only.
drop policy if exists "analysts_select_admin" on public.analysts;
create policy "analysts_select_admin" on public.analysts
  for select to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------------ --
-- cases: admins see and manage all
-- ------------------------------------------------------------------ --
drop policy if exists "cases_select_admin" on public.cases;
create policy "cases_select_admin" on public.cases
  for select to authenticated
  using (public.is_admin());

drop policy if exists "cases_insert_admin" on public.cases;
create policy "cases_insert_admin" on public.cases
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "cases_update_admin" on public.cases;
create policy "cases_update_admin" on public.cases
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------------ --
-- scripts: admins see and manage all
-- ------------------------------------------------------------------ --
drop policy if exists "scripts_select_admin" on public.scripts;
create policy "scripts_select_admin" on public.scripts
  for select to authenticated
  using (public.is_admin());

drop policy if exists "scripts_insert_admin" on public.scripts;
create policy "scripts_insert_admin" on public.scripts
  for insert to authenticated
  with check (public.is_admin());

-- ------------------------------------------------------------------ --
-- audit_logs: admins see every case's trail — READ-ONLY by design.
-- No admin insert/update/delete policy: chain integrity outranks
-- admin convenience (member insert path from 0004b stays as-is).
-- ------------------------------------------------------------------ --
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------------ --
-- evidence_bundles + storage: admin visibility, read-only
-- ------------------------------------------------------------------ --
drop policy if exists "evidence_bundles_select_admin" on public.evidence_bundles;
create policy "evidence_bundles_select_admin" on public.evidence_bundles
  for select to authenticated
  using (public.is_admin());

drop policy if exists "evidence_bundles_obj_select_admin" on storage.objects;
create policy "evidence_bundles_obj_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence-bundles' and public.is_admin());
