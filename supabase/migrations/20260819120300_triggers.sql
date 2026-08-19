-- Triggers: profile creation, updated_at maintenance, Realtime publication.
--
-- Rollback: safe to re-run. To undo, drop the triggers then the functions.

-- ============================================================================
-- Profile creation
--
-- A profiles row is created by the database when an auth.users row appears,
-- rather than by application code after signup. Doing it in a trigger means a
-- user cannot exist without a profile even if a signup flow is interrupted or a
-- new auth provider is added later.
--
-- `security definer` is required here: the trigger runs during signup, when
-- there is no authenticated user yet to satisfy the profiles insert policy. This
-- is the one sanctioned use -- D-015 rejects security definer for ownership
-- *checks*, where a mistake would silently remove access control. Here the
-- function takes no caller input, writes exactly one row keyed to new.id, and
-- has a pinned empty search_path so it cannot be hijacked by a shadowed object.
-- ============================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  -- Keeps a retried or replayed signup from failing.
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- updated_at maintenance
--
-- Set in the database so the column cannot drift when a write path forgets it.
-- ============================================================================
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function touch_updated_at();

drop trigger if exists folders_touch_updated_at on folders;
create trigger folders_touch_updated_at
  before update on folders
  for each row execute function touch_updated_at();

drop trigger if exists papers_touch_updated_at on papers;
create trigger papers_touch_updated_at
  before update on papers
  for each row execute function touch_updated_at();

drop trigger if exists processing_jobs_touch_updated_at on processing_jobs;
create trigger processing_jobs_touch_updated_at
  before update on processing_jobs
  for each row execute function touch_updated_at();

drop trigger if exists llm_usage_touch_updated_at on llm_usage;
create trigger llm_usage_touch_updated_at
  before update on llm_usage
  for each row execute function touch_updated_at();

-- ============================================================================
-- Realtime on processing_jobs
--
-- Lets the browser watch job progress without polling (D-018). Rows are still
-- filtered by the processing_jobs select policy, so a subscriber only ever
-- receives their own jobs.
--
-- Guarded twice: the publication does not exist on a plain Postgres (so this
-- file stays runnable outside Supabase), and Postgres has no
-- `alter publication ... add table if not exists`.
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'processing_jobs'
     )
  then
    alter publication supabase_realtime add table processing_jobs;
  end if;
end $$;
