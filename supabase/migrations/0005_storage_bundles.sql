-- ForensiQ migration 0005 — evidence bundle persistence.
-- Signed report bundles are uploaded to a PRIVATE storage bucket (path
-- convention {case_id}/{script_id}.json) and indexed in evidence_bundles
-- for per-case listing. Access reuses the can_access_case() helper from
-- 0004b so sharing rules stay identical across tables and storage.

insert into storage.buckets (id, name, public)
values ('evidence-bundles', 'evidence-bundles', false)
on conflict (id) do nothing;

create table if not exists public.evidence_bundles (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  script_id    uuid references public.scripts(id) on delete set null,
  storage_path text not null unique,
  sha256       text not null,
  created_at   timestamptz not null default now()
);

create index if not exists evidence_bundles_case_idx
  on public.evidence_bundles (case_id, created_at desc);

alter table public.evidence_bundles enable row level security;

create policy "evidence_bundles_select" on public.evidence_bundles
  for select to authenticated
  using (public.can_access_case(case_id));

create policy "evidence_bundles_insert" on public.evidence_bundles
  for insert to authenticated
  with check (public.can_access_case(case_id));

-- storage.objects policies: first path segment must be a case the caller
-- can access. Regex guard keeps the uuid cast safe on foreign rows.
create policy "evidence_bundles_obj_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence-bundles'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    and public.can_access_case(split_part(name, '/', 1)::uuid)
  );

create policy "evidence_bundles_obj_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence-bundles'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    and public.can_access_case(split_part(name, '/', 1)::uuid)
  );
