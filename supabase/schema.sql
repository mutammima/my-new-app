-- ============================================================================
-- DuoNotes — Supabase schema (prefixed tables in the `public` schema)
-- ----------------------------------------------------------------------------
-- Safe to run inside a Supabase project you already use for another app: every
-- object is prefixed with `duonotes_`, so it can't collide with your other
-- app's tables, and NOTHING here touches `auth.users` or your existing data.
--
-- We use the `public` schema (always reachable by the Data API) with a name
-- prefix, rather than a custom schema, so there's no "expose schema" step.
--
-- Run this once:
--   Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Re-running is safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.duonotes_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique not null,
  name        text not null default '',
  partner_id  uuid references public.duonotes_profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.duonotes_notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.duonotes_profiles (id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  lock_type   text not null default 'none' check (lock_type in ('none', 'pin', 'biometric')),
  is_shared   boolean not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists duonotes_notes_owner_id_idx on public.duonotes_notes (owner_id);

grant all on public.duonotes_profiles to authenticated, service_role;
grant all on public.duonotes_notes    to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.duonotes_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists duonotes_notes_touch_updated_at on public.duonotes_notes;
create trigger duonotes_notes_touch_updated_at
  before update on public.duonotes_notes
  for each row execute function public.duonotes_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Link two accounts as partners (by email), both directions
-- (No trigger on auth.users — the app creates its own profile row on sign-in,
--  so this never interferes with your other app.)
-- ---------------------------------------------------------------------------
create or replace function public.duonotes_link_partner(partner_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  pid uuid;
begin
  -- Without this, an anon caller reached the updates below with `me` NULL: the
  -- `pid = me` guard compares against NULL, which is NULL rather than true, so
  -- it does not fire, and `set partner_id = me where id = pid` then wiped the
  -- target's partner link. SECURITY DEFINER bypasses RLS, so nothing else
  -- stopped it. The revoke below is the outer gate; this is the inner one.
  if me is null then
    raise exception 'Not signed in';
  end if;
  select id into pid from public.duonotes_profiles where email = lower(trim(partner_email));
  if pid is null then
    raise exception 'No DuoNotes account found for %', partner_email;
  end if;
  if pid = me then
    raise exception 'You cannot link to yourself';
  end if;
  update public.duonotes_profiles set partner_id = pid where id = me;
  update public.duonotes_profiles set partner_id = me  where id = pid;
end;
$$;

-- `revoke from public` is not enough on its own: Supabase sets default
-- privileges that grant EXECUTE to anon, so anon must be named explicitly.
-- This function was missed when the other two were revoked, which left it
-- callable unauthenticated — an email-enumeration oracle, since "No DuoNotes
-- account found for %" distinguishes a registered address from an unknown one.
revoke all on function public.duonotes_link_partner(text) from public;
revoke all on function public.duonotes_link_partner(text) from anon;
grant execute on function public.duonotes_link_partner(text) to authenticated;

-- duonotes_my_partner_id() exists so the profiles read policy below can name the
-- caller's partner without recursing: a policy ON duonotes_profiles that
-- sub-selects FROM duonotes_profiles loops forever. Reading the row inside a
-- SECURITY DEFINER function bypasses RLS and breaks that cycle.
create or replace function public.duonotes_my_partner_id()
returns uuid language sql security definer stable set search_path = public as $$
  select partner_id from public.duonotes_profiles where id = auth.uid()
$$;

-- `revoke from public` is not enough on its own: Supabase sets default
-- privileges that grant EXECUTE to anon, so anon must be named explicitly.
-- Verified by probe — before this, an anon caller could execute both of these.
-- Neither leaks anything (each is guarded by auth.uid(), which is null for
-- anon), but the guard should be the second line of defence, not the only one.
revoke all on function public.duonotes_my_partner_id() from public;
revoke all on function public.duonotes_my_partner_id() from anon;
grant execute on function public.duonotes_my_partner_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.duonotes_profiles enable row level security;
alter table public.duonotes_notes    enable row level security;

-- Profiles. Users may edit only their own.
-- Read your own profile and your partner's — NOT everyone's. This was
-- `using (true)`, which let any signed-in user read every profile row, email
-- addresses included, making the table an email-enumeration endpoint. Harmless
-- while the only two users are a couple; a data leak the moment strangers have
-- accounts. Linking still works because duonotes_link_partner is SECURITY
-- DEFINER and resolves the email with RLS bypassed, so the client never needs to
-- read a stranger's row.
drop policy if exists duonotes_profiles_select on public.duonotes_profiles;
create policy duonotes_profiles_select on public.duonotes_profiles
  for select to authenticated using (
    id = auth.uid()
    or id = public.duonotes_my_partner_id()
    -- Covers a half-linked state, where the partner has linked you but the
    -- reverse update has not landed yet.
    or partner_id = auth.uid()
  );

drop policy if exists duonotes_profiles_update on public.duonotes_profiles;
create policy duonotes_profiles_update on public.duonotes_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists duonotes_profiles_insert on public.duonotes_profiles;
create policy duonotes_profiles_insert on public.duonotes_profiles
  for insert to authenticated with check (id = auth.uid());

-- Notes: you can see your own notes, plus notes your partner has shared.
drop policy if exists duonotes_notes_select on public.duonotes_notes;
create policy duonotes_notes_select on public.duonotes_notes
  for select to authenticated using (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.duonotes_profiles where id = auth.uid())
    )
  );

drop policy if exists duonotes_notes_insert on public.duonotes_notes;
create policy duonotes_notes_insert on public.duonotes_notes
  for insert to authenticated with check (owner_id = auth.uid());

-- Both partners may edit a shared note (simple last-write-wins collaboration).
drop policy if exists duonotes_notes_update on public.duonotes_notes;
create policy duonotes_notes_update on public.duonotes_notes
  for update to authenticated using (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.duonotes_profiles where id = auth.uid())
    )
  ) with check (
    owner_id = auth.uid()
    or (
      is_shared
      and owner_id = (select partner_id from public.duonotes_profiles where id = auth.uid())
    )
  );

-- Only the owner may delete.
drop policy if exists duonotes_notes_delete on public.duonotes_notes;
create policy duonotes_notes_delete on public.duonotes_notes
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: stream note changes to connected clients
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'duonotes_notes'
  ) then
    alter publication supabase_realtime add table public.duonotes_notes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Optional cleanup: if you ran the earlier custom-schema version, you can
-- remove that now-unused schema (it's empty). Uncomment to run:
-- drop schema if exists duonotes cascade;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Account deletion
--
-- App Store guideline 5.1.1(v): an app that lets people create an account must
-- let them delete it from inside the app.
--
-- One delete is enough, because everything already cascades off auth.users:
--   auth.users        --cascade---->  duonotes_profiles
--   duonotes_profiles --cascade---->  duonotes_notes
--   duonotes_profiles --set null-->   the partner's partner_id
-- so the partner is unlinked automatically and keeps their own notes. Notes the
-- deleted user OWNED go with them, including ones they had shared: those were
-- never the partner's rows to keep.
--
-- SECURITY DEFINER because the `authenticated` role cannot touch auth.users. It
-- hard-codes auth.uid(), so it can only ever delete the caller — there is no
-- argument to point it at somebody else.
-- ---------------------------------------------------------------------------
create or replace function public.duonotes_delete_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = me;
end;
$$;

-- `revoke from public` is not enough on its own: Supabase sets default
-- privileges that grant EXECUTE to anon, so anon must be named explicitly.
-- Verified by probe — before this, an anon caller could execute both of these.
-- Neither leaks anything (each is guarded by auth.uid(), which is null for
-- anon), but the guard should be the second line of defence, not the only one.
revoke all on function public.duonotes_delete_account() from public;
revoke all on function public.duonotes_delete_account() from anon;
grant execute on function public.duonotes_delete_account() to authenticated;
