-- Job queue claim and release functions.
--
-- D-018 specifies claiming work with `for update skip locked`. That cannot be
-- expressed through PostgREST, which is the only interface supabase-py has, so
-- the claim lives in a database function the worker calls by RPC (D-032).
--
-- Putting it here rather than in Python has a second benefit: the claim is
-- atomic by construction. A read-then-write from the worker could hand the same
-- job to two workers between the two statements, and that race would be rare
-- enough to survive testing and appear in production as duplicated processing.
--
-- These functions are `security definer` because the worker connects with the
-- service role, which already bypasses RLS -- the marker changes nothing about
-- what the worker can reach. They are NOT granted to `authenticated` or `anon`:
-- only the service role may claim or release jobs.
--
-- Rollback: safe to re-run (create or replace). To undo, drop both functions.

-- Claims the oldest queued job and marks it running.
--
-- `for update skip locked` is what makes concurrent workers safe: a second
-- worker skips a locked row instead of blocking behind it, so adding workers
-- needs no coordination.
--
-- The stale-lock window reclaims jobs whose worker died mid-flight -- the exact
-- failure the previous BackgroundTasks implementation handled by losing the work.
create or replace function claim_next_job(
  worker_id text,
  stale_lock_minutes integer default 15
)
returns table (
  id              uuid,
  folder_id       uuid,
  user_id         uuid,
  job_type        text,
  payload         jsonb,
  attempts        integer,
  max_attempts    integer,
  idempotency_key text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.processing_jobs j
  set status = 'running',
      locked_at = now(),
      locked_by = worker_id,
      attempts = j.attempts + 1,
      updated_at = now()
  where j.id = (
    select candidate.id
    from public.processing_jobs candidate
    where (
        candidate.status = 'queued'
        -- Reclaim a job whose worker died holding it.
        or (
          candidate.status = 'running'
          and candidate.locked_at < now() - make_interval(mins => stale_lock_minutes)
        )
      )
      -- Never exceed the retry budget: a job that has used its attempts is
      -- failed by the worker, not retried forever.
      and candidate.attempts < candidate.max_attempts
    order by candidate.created_at
    limit 1
    for update skip locked
  )
  returning j.id, j.folder_id, j.user_id, j.job_type, j.payload,
            j.attempts, j.max_attempts, j.idempotency_key;
end;
$$;

-- Marks a claimed job finished, successfully or not.
--
-- A failed job goes back to 'queued' while it has attempts left, so the same
-- claim query picks it up again; once exhausted it stays 'failed' with its error
-- preserved, so a stuck folder is diagnosable rather than invisible.
create or replace function complete_job(
  job_id  uuid,
  success boolean,
  error   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_attempts integer;
begin
  if success then
    update public.processing_jobs
    set status = 'succeeded',
        progress = 100,
        locked_at = null,
        locked_by = null,
        last_error = null,
        updated_at = now()
    where id = job_id;
    return;
  end if;

  select (max_attempts - attempts) into remaining_attempts
  from public.processing_jobs
  where id = job_id;

  update public.processing_jobs
  set status = case when coalesce(remaining_attempts, 0) > 0 then 'queued' else 'failed' end,
      locked_at = null,
      locked_by = null,
      last_error = error,
      updated_at = now()
  where id = job_id;
end;
$$;

-- Reports incremental progress so the UI can show a live percentage over
-- Realtime instead of an indeterminate spinner.
create or replace function update_job_progress(job_id uuid, new_progress integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.processing_jobs
  set progress = greatest(0, least(100, new_progress)),
      updated_at = now()
  where id = job_id;
end;
$$;

-- Only the service role may run these. `revoke from public` is required because
-- Postgres grants execute on new functions to PUBLIC by default -- without it,
-- any authenticated user could claim jobs, including other users' jobs, since
-- these functions are security definer.
revoke all on function claim_next_job(text, integer) from public;
revoke all on function complete_job(uuid, boolean, text) from public;
revoke all on function update_job_progress(uuid, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function claim_next_job(text, integer) to service_role;
    grant execute on function complete_job(uuid, boolean, text) to service_role;
    grant execute on function update_job_progress(uuid, integer) to service_role;
  end if;
end $$;
