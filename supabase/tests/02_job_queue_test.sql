-- Proves the durable job queue behaves as D-018 requires.
--
-- Four claims, each of which was a real failure mode of the previous
-- BackgroundTasks implementation:
--
--   1. A duplicate enqueue produces exactly one job (idempotency_key).
--   2. Claiming is atomic: two workers never get the same job.
--   3. A job whose worker died is reclaimed after the stale-lock window.
--   4. A failed job retries until max_attempts, then stays failed with its error.
--
-- Run via supabase/tests/run_tests.sh, after 01_rls_ownership_test.sql.

\set ON_ERROR_STOP on

-- Seeded fresh here so this file can be read and run on its own.
insert into auth.users (id, email) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@example.test')
on conflict (id) do nothing;

insert into folders (id, user_id, name) values
  ('f3333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Carol Networks')
on conflict (id) do nothing;

-- ============================================================================
-- 1. Duplicate enqueue is a no-op
--
-- The idempotency key is derived from folder id + content fingerprint, so a
-- double-clicked button or a retried HTTP request must not queue the work twice.
-- ============================================================================
\echo '== duplicate enqueue is idempotent =='
begin;
  insert into processing_jobs (folder_id, user_id, job_type, idempotency_key)
  values ('f3333333-3333-3333-3333-333333333333',
          'cccccccc-cccc-cccc-cccc-cccccccccccc', 'extract', 'fingerprint-abc');

  do $$
  begin
    -- What the enqueue path actually issues: on conflict do nothing.
    insert into processing_jobs (folder_id, user_id, job_type, idempotency_key)
    values ('f3333333-3333-3333-3333-333333333333',
            'cccccccc-cccc-cccc-cccc-cccccccccccc', 'extract', 'fingerprint-abc')
    on conflict (idempotency_key) do nothing;

    perform tests.assert(
      (select count(*) from processing_jobs where idempotency_key = 'fingerprint-abc') = 1,
      'enqueuing the same idempotency_key twice leaves exactly one job'
    );
  end $$;

  -- Without `on conflict`, the unique constraint must reject it outright: the
  -- guarantee lives in the schema, not in the caller remembering the clause.
  do $$
  begin
    begin
      insert into processing_jobs (folder_id, user_id, job_type, idempotency_key)
      values ('f3333333-3333-3333-3333-333333333333',
              'cccccccc-cccc-cccc-cccc-cccccccccccc', 'extract', 'fingerprint-abc');
      perform tests.assert(false, 'a duplicate idempotency_key must be rejected');
    exception when unique_violation then
      perform tests.assert(true, 'unique constraint rejects a duplicate idempotency_key');
    end;
  end $$;
rollback;

-- ============================================================================
-- 2. Claiming hands each job to exactly one worker
-- ============================================================================
\echo '== claim is exclusive and ordered =='
begin;
  insert into processing_jobs (id, folder_id, user_id, job_type, idempotency_key, created_at)
  values
    ('11111111-0000-0000-0000-000000000001', 'f3333333-3333-3333-3333-333333333333',
     'cccccccc-cccc-cccc-cccc-cccccccccccc', 'extract', 'job-1', now() - interval '2 minutes'),
    ('11111111-0000-0000-0000-000000000002', 'f3333333-3333-3333-3333-333333333333',
     'cccccccc-cccc-cccc-cccc-cccccccccccc', 'analyze', 'job-2', now() - interval '1 minute');

  do $$
  declare
    first_id  uuid;
    second_id uuid;
    third_id  uuid;
  begin
    select id into first_id from claim_next_job('worker-a');
    perform tests.assert(first_id = '11111111-0000-0000-0000-000000000001',
      'the oldest queued job is claimed first');

    select id into second_id from claim_next_job('worker-b');
    perform tests.assert(second_id = '11111111-0000-0000-0000-000000000002',
      'a second worker claims the next job, not the same one');

    perform tests.assert(first_id <> second_id,
      'two workers never receive the same job');

    -- Queue drained: a claim must return no row rather than a running job.
    select id into third_id from claim_next_job('worker-c');
    perform tests.assert(third_id is null,
      'claiming an empty queue returns nothing');

    perform tests.assert(
      (select count(*) from processing_jobs where status = 'running') = 2,
      'both claimed jobs are marked running');
    perform tests.assert(
      (select locked_by from processing_jobs where id = first_id) = 'worker-a',
      'the claiming worker is recorded on the job');
    perform tests.assert(
      (select attempts from processing_jobs where id = first_id) = 1,
      'claiming increments the attempt counter');
  end $$;
rollback;

-- ============================================================================
-- 3. A job whose worker died is reclaimed
--
-- This is the case BackgroundTasks handled by losing the work entirely.
-- ============================================================================
\echo '== stale locks are reclaimed =='
begin;
  -- A job left 'running' by a worker that never came back.
  insert into processing_jobs (
    id, folder_id, user_id, job_type, idempotency_key,
    status, locked_at, locked_by, attempts
  )
  values ('22222222-0000-0000-0000-000000000001', 'f3333333-3333-3333-3333-333333333333',
          'cccccccc-cccc-cccc-cccc-cccccccccccc', 'extract', 'stale-job',
          'running', now() - interval '30 minutes', 'dead-worker', 1);

  do $$
  declare
    claimed uuid;
  begin
    -- Still inside the window: must NOT be stolen from a worker that may be alive.
    select id into claimed from claim_next_job('worker-new', 60);
    perform tests.assert(claimed is null,
      'a job locked 30 minutes ago is not reclaimed under a 60-minute window');

    -- Past the window: the worker is presumed dead and the job is recoverable.
    select id into claimed from claim_next_job('worker-new', 15);
    perform tests.assert(claimed = '22222222-0000-0000-0000-000000000001',
      'a job locked beyond the stale window is reclaimed');
    perform tests.assert(
      (select locked_by from processing_jobs where id = claimed) = 'worker-new',
      'the reclaiming worker takes ownership');
    perform tests.assert(
      (select attempts from processing_jobs where id = claimed) = 2,
      'reclaiming counts as another attempt, so retries stay bounded');
  end $$;
rollback;

-- ============================================================================
-- 4. Retry budget, then permanent failure
-- ============================================================================
\echo '== failures retry then stop =='
begin;
  insert into processing_jobs (
    id, folder_id, user_id, job_type, idempotency_key, max_attempts
  )
  values ('33333333-0000-0000-0000-000000000001', 'f3333333-3333-3333-3333-333333333333',
          'cccccccc-cccc-cccc-cccc-cccccccccccc', 'extract', 'retry-job', 2);

  do $$
  declare
    claimed uuid;
  begin
    select id into claimed from claim_next_job('worker-a');
    perform complete_job(claimed, false, 'first failure');

    perform tests.assert(
      (select status from processing_jobs where id = claimed) = 'queued',
      'a failed job with attempts remaining returns to the queue');
    perform tests.assert(
      (select last_error from processing_jobs where id = claimed) = 'first failure',
      'the error is preserved for diagnosis');
    perform tests.assert(
      (select locked_by from processing_jobs where id = claimed) is null,
      'the lock is released so another worker can retry');

    -- Second and final attempt.
    select id into claimed from claim_next_job('worker-a');
    perform tests.assert(claimed = '33333333-0000-0000-0000-000000000001',
      'the requeued job is claimable again');
    perform complete_job(claimed, false, 'final failure');

    perform tests.assert(
      (select status from processing_jobs where id = claimed) = 'failed',
      'a job that exhausts max_attempts stays failed');
    perform tests.assert(
      (select last_error from processing_jobs where id = claimed) = 'final failure',
      'the final error is retained');

    -- Exhausted jobs must not be picked up again: that would retry forever.
    perform tests.assert(
      (select id from claim_next_job('worker-b')) is null,
      'an exhausted job is not reclaimed');
  end $$;
rollback;

-- ============================================================================
-- Success path and progress reporting
-- ============================================================================
\echo '== success and progress =='
begin;
  insert into processing_jobs (id, folder_id, user_id, job_type, idempotency_key)
  values ('44444444-0000-0000-0000-000000000001', 'f3333333-3333-3333-3333-333333333333',
          'cccccccc-cccc-cccc-cccc-cccccccccccc', 'analyze', 'ok-job');

  do $$
  declare
    claimed uuid;
  begin
    select id into claimed from claim_next_job('worker-a');

    perform update_job_progress(claimed, 40);
    perform tests.assert(
      (select progress from processing_jobs where id = claimed) = 40,
      'progress is recorded so the UI can show a real percentage');

    -- Out-of-range values are clamped rather than violating the check constraint
    -- and failing the whole job over a reporting detail.
    perform update_job_progress(claimed, 150);
    perform tests.assert(
      (select progress from processing_jobs where id = claimed) = 100,
      'progress above 100 is clamped');
    perform update_job_progress(claimed, -10);
    perform tests.assert(
      (select progress from processing_jobs where id = claimed) = 0,
      'progress below 0 is clamped');

    perform complete_job(claimed, true);
    perform tests.assert(
      (select status from processing_jobs where id = claimed) = 'succeeded',
      'a successful job is marked succeeded');
    perform tests.assert(
      (select progress from processing_jobs where id = claimed) = 100,
      'a successful job reports 100% progress');
    perform tests.assert(
      (select locked_by from processing_jobs where id = claimed) is null,
      'a finished job holds no lock');
  end $$;
rollback;

-- ============================================================================
-- The queue functions are security definer, so they must not be callable by
-- ordinary users. If they were, any authenticated user could claim -- and see the
-- payload of -- another user's jobs.
-- ============================================================================
\echo '== queue functions are service-role only =='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  do $$
  begin
    begin
      perform claim_next_job('malicious-worker');
      perform tests.assert(false, 'an authenticated user must not be able to claim jobs');
    exception when insufficient_privilege then
      perform tests.assert(true, 'claim_next_job is not executable by authenticated users');
    end;

    begin
      perform complete_job('44444444-0000-0000-0000-000000000001', true);
      perform tests.assert(false, 'an authenticated user must not be able to complete jobs');
    exception when insufficient_privilege then
      perform tests.assert(true, 'complete_job is not executable by authenticated users');
    end;
  end $$;
rollback;

\echo ''
\echo 'ALL JOB QUEUE TESTS PASSED'
