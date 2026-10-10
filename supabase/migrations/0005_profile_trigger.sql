-- ============================================================================
-- Migration 0005: auto-create a profile row for every new auth user.
-- profiles has RLS with no INSERT policy, so the magic-link callback couldn't
-- create the row (→ "forbidden" on staff-gated actions). A SECURITY DEFINER
-- trigger on auth.users creates it reliably, regardless of the sign-in path.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'front_desk')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
