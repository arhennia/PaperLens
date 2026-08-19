-- LOCAL TEST SHIM -- NEVER APPLY THIS TO A REAL SUPABASE PROJECT.
--
-- This file lives in supabase/tests/, deliberately NOT in supabase/migrations/,
-- so `supabase db push` can never pick it up. It fakes the parts of Supabase
-- that a plain Postgres container does not have, so the real migrations can be
-- applied and tested locally:
--
--   auth.users            -- the table every user_id references
--   auth.uid()            -- reads a session GUC instead of a real JWT
--   storage.buckets       -- bucket registry
--   storage.objects       -- object rows, with RLS enabled
--   storage.foldername()  -- splits a path into segments
--   roles anon/authenticated
--
-- Applying this to a live project would create a counterfeit auth schema and
-- break authentication. It exists purely so `supabase/tests/*.sql` can prove
-- that RLS and storage policies actually block cross-user access, rather than
-- merely asserting that the policies exist.
--
-- Fidelity note: auth.uid() here reads `request.jwt.claim.sub`, which is how
-- PostgREST sets the current user. That matches how the predicate behaves in
-- production, which is what these tests are checking.

create schema if not exists auth;
create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Returns the current request's user id, or null when unset. `stable` rather
-- than `immutable` so Postgres still evaluates it once per query in the
-- `(select auth.uid())` form the policies use.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name      text not null,
  owner     uuid,
  created_at timestamptz not null default now(),
  constraint storage_objects_bucket_name_key unique (bucket_id, name)
);

alter table storage.objects enable row level security;

-- Supabase's real implementation splits the object path on '/'.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema auth, storage, public to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
-- anon is granted table access here on purpose, matching real Supabase: the
-- point of the anon tests is to prove RLS returns zero ROWS, not that a missing
-- grant happens to deny access. Those are different protections and only one of
-- them is the one being claimed.
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
