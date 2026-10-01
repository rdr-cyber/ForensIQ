-- ForensiQ migration 0003 — auth roles + auto-provisioning.
-- 1) analysts.role: 'analyst' (default) or 'admin'. Role changes are made
--    by admins via SQL/console, never self-service in the app.
-- 2) handle_new_user(): SECURITY DEFINER trigger on auth.users insert so
--    every signup gets an analysts profile without hand-crafted inserts
--    (see README "Known Issues & Fixes" #3). Runs as the table owner, so
--    it bypasses the analysts RLS policies safely.

alter table public.analysts
  add column if not exists role text not null default 'analyst'
  check (role in ('analyst', 'admin'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analysts (id, name, role)
  values (
    new.id,
    split_part(coalesce(new.email, 'analyst'), '@', 1),
    'analyst'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
