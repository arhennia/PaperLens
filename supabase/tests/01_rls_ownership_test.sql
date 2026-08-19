-- Proves RLS and storage policies actually BLOCK cross-user access.
--
-- AGENTS.md requires that policies be tested rather than merely present, and
-- that "user A cannot read, modify, or infer user B's data" be verified. The
-- presence of a `create policy` statement is not evidence that it works.
--
-- Written as plain SQL assertions rather than pgTAP: pgTAP is not present in a
-- stock Postgres image and no Supabase CLI is installed on this machine, so
-- plain assertions are what can actually be executed here (see D-030). The
-- claims asserted are the same ones pgTAP would make, and this file can be
-- ported to pgTAP unchanged in meaning.
--
-- Run with: supabase/tests/run_tests.sh
--
-- Critical detail: every test switches to the `authenticated` role. A table
-- owner or superuser BYPASSES row level security, so a test that stays as
-- `postgres` would pass while proving nothing at all.

\set ON_ERROR_STOP on

create schema if not exists tests;

-- A newly created schema grants USAGE to nobody but its owner, so the
-- authenticated/anon roles could not call tests.assert without this.
grant usage on schema tests to authenticated, anon;

-- Raises on failure, so psql with ON_ERROR_STOP aborts and the runner reports a
-- non-zero exit code.
create or replace function tests.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is null or not condition then
    raise exception 'FAIL: %', message;
  end if;
  raise notice '  ok: %', message;
end $$;

-- The `authenticated` role needs ordinary table grants; RLS narrows access, it
-- does not confer it. Supabase grants these by default.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to anon;

-- ============================================================================
-- Seed two users, as superuser (bypasses RLS by design).
-- Fixed uuids so failures are readable.
-- ============================================================================
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@example.test')
on conflict (id) do nothing;

-- The signup trigger should have created both profiles.
do $$
begin
  perform tests.assert(
    (select count(*) from profiles where id in (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) = 2,
    'handle_new_user trigger created a profile for each auth.users row'
  );
end $$;

insert into folders (id, user_id, name, subject, reference_year) values
  ('f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice OS', 'Operating Systems', 2025),
  ('f2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob DBMS', 'Databases', 2025)
on conflict (id) do nothing;

insert into papers (id, folder_id, user_id, storage_path, original_filename, year, year_source) values
  ('a1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1111111-1111-1111-1111-111111111111/a1111111-1111-1111-1111-111111111111.pdf',
   'alice-2025.pdf', 2025, 'filename'),
  ('b2222222-2222-2222-2222-222222222222', 'f2222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/f2222222-2222-2222-2222-222222222222/b2222222-2222-2222-2222-222222222222.pdf',
   'bob-2025.pdf', 2025, 'filename')
on conflict (id) do nothing;

insert into questions (
  id, paper_id, folder_id, user_id, label_path, text_extracted, text_normalized, normalized_hash, marks, page_number
) values
  ('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Q1', 'Explain paging.', 'explain paging', 'hash_alice_1', 10, 1),
  ('c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222',
   'f2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Q1', 'Explain ACID.', 'explain acid', 'hash_bob_1', 10, 1)
on conflict do nothing;

insert into storage.objects (bucket_id, name) values
  ('exam-pdfs', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1111111-1111-1111-1111-111111111111/a1111111-1111-1111-1111-111111111111.pdf'),
  ('exam-pdfs', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/f2222222-2222-2222-2222-222222222222/b2222222-2222-2222-2222-222222222222.pdf')
on conflict do nothing;

-- ============================================================================
-- SELECT isolation
-- ============================================================================
\echo '== select isolation =='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  do $$
  begin
    perform tests.assert((select count(*) from folders) = 1,
      'alice sees exactly 1 folder (her own), not both');
    perform tests.assert(
      (select count(*) from folders where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 0,
      'alice sees 0 of bob''s folders');
    perform tests.assert((select count(*) from papers) = 1,
      'alice sees only her own paper');
    perform tests.assert((select count(*) from questions) = 1,
      'alice sees only her own questions');
    perform tests.assert((select count(*) from profiles) = 1,
      'alice sees only her own profile, not bob''s email');
  end $$;
commit;

-- ============================================================================
-- Anon sees nothing at all
--
-- This is the load-bearing assertion behind D-017: because no table grants the
-- anon role a policy, public sharing MUST go through the server route's explicit
-- allowlist. If this test ever fails, an anon policy has been added and the
-- public projection is no longer the only public surface.
-- ============================================================================
\echo '== anon has no table access =='
begin;
  set local role anon;

  do $$
  begin
    perform tests.assert((select count(*) from folders) = 0, 'anon sees 0 folders');
    perform tests.assert((select count(*) from papers) = 0, 'anon sees 0 papers');
    perform tests.assert((select count(*) from questions) = 0, 'anon sees 0 questions');
    perform tests.assert((select count(*) from profiles) = 0, 'anon sees 0 profiles');
    perform tests.assert((select count(*) from share_links) = 0, 'anon sees 0 share_links');
    perform tests.assert((select count(*) from question_groups) = 0, 'anon sees 0 question_groups');
    perform tests.assert((select count(*) from folder_analytics) = 0, 'anon sees 0 folder_analytics');
  end $$;
commit;

-- ============================================================================
-- UPDATE and DELETE cannot reach another user's rows
-- ============================================================================
\echo '== update/delete isolation =='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  do $$
  declare
    affected integer;
  begin
    update folders set name = 'HACKED' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    get diagnostics affected = row_count;
    perform tests.assert(affected = 0, 'alice''s update of bob''s folder affects 0 rows');

    update questions set text_extracted = 'HACKED'
      where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    get diagnostics affected = row_count;
    perform tests.assert(affected = 0, 'alice''s update of bob''s question affects 0 rows');

    delete from folders where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    get diagnostics affected = row_count;
    perform tests.assert(affected = 0, 'alice''s delete of bob''s folder affects 0 rows');

    delete from papers where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    get diagnostics affected = row_count;
    perform tests.assert(affected = 0, 'alice''s delete of bob''s paper affects 0 rows');
  end $$;
rollback;

-- Confirm bob's data really is intact, read as bob.
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  do $$
  begin
    perform tests.assert(
      (select name from folders where id = 'f2222222-2222-2222-2222-222222222222') = 'Bob DBMS',
      'bob''s folder name survived alice''s attempted update');
  end $$;
commit;

-- ============================================================================
-- INSERT cannot forge ownership
-- ============================================================================
\echo '== insert cannot forge user_id =='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  do $$
  begin
    begin
      insert into folders (user_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Forged');
      perform tests.assert(false, 'alice inserting a folder owned by bob must be rejected');
    exception when insufficient_privilege then
      perform tests.assert(true, 'alice cannot insert a folder owned by bob (with check blocked it)');
    end;
  end $$;
rollback;

-- ============================================================================
-- UPDATE cannot hand a row to another user
--
-- This is what the `with check` half of every update policy is for. Without it,
-- `using` alone would allow a user to reassign their own row's user_id.
-- ============================================================================
\echo '== update cannot reassign ownership =='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  do $$
  begin
    begin
      update folders set user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        where id = 'f1111111-1111-1111-1111-111111111111';
      perform tests.assert(false, 'alice reassigning her folder to bob must be rejected');
    exception when insufficient_privilege then
      perform tests.assert(true, 'alice cannot reassign her folder''s user_id to bob');
    end;
  end $$;
rollback;

-- ============================================================================
-- Composite foreign keys make cross-user references structurally impossible
--
-- Belt and braces alongside RLS (D-015): even a privileged write path -- the
-- worker using the secret key, which bypasses RLS entirely -- cannot attach a
-- paper to a folder owned by someone else.
-- ============================================================================
\echo '== composite FK blocks cross-user references (even as superuser) =='
begin;
  do $$
  begin
    begin
      insert into papers (folder_id, user_id, storage_path, original_filename)
      values ('f2222222-2222-2222-2222-222222222222',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              'forged/path.pdf', 'forged.pdf');
      perform tests.assert(false,
        'a paper claiming alice as owner but pointing at bob''s folder must be rejected');
    exception when foreign_key_violation then
      perform tests.assert(true,
        'composite FK rejects a paper whose user_id disagrees with its folder''s owner');
    end;

    begin
      insert into questions (paper_id, folder_id, user_id, label_path,
                             text_extracted, text_normalized, normalized_hash)
      values ('b2222222-2222-2222-2222-222222222222',
              'f1111111-1111-1111-1111-111111111111',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              'Q9', 'x', 'x', 'h');
      perform tests.assert(false,
        'a question pointing at bob''s paper but alice''s folder must be rejected');
    exception when foreign_key_violation then
      perform tests.assert(true,
        'composite FK rejects a question whose paper and folder have different owners');
    end;
  end $$;
rollback;

-- ============================================================================
-- Storage ownership by path prefix
-- ============================================================================
\echo '== storage isolation =='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  do $$
  declare
    affected integer;
  begin
    perform tests.assert((select count(*) from storage.objects) = 1,
      'alice sees exactly 1 storage object (her own prefix)');

    perform tests.assert(
      (select count(*) from storage.objects
       where name like 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/%') = 0,
      'alice sees 0 objects under bob''s prefix');

    begin
      insert into storage.objects (bucket_id, name)
      values ('exam-pdfs', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/injected.pdf');
      perform tests.assert(false, 'alice uploading under bob''s prefix must be rejected');
    exception when insufficient_privilege then
      perform tests.assert(true, 'alice cannot upload under bob''s prefix');
    end;

    -- Overwriting another user's object is an update, which is why the update
    -- policy exists and is not optional (D-016).
    update storage.objects set name = name
      where name like 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/%';
    get diagnostics affected = row_count;
    perform tests.assert(affected = 0, 'alice cannot overwrite an object under bob''s prefix');

    delete from storage.objects where name like 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/%';
    get diagnostics affected = row_count;
    perform tests.assert(affected = 0, 'alice cannot delete an object under bob''s prefix');
  end $$;
rollback;

\echo '== anon has no storage access =='
begin;
  set local role anon;
  do $$
  begin
    perform tests.assert((select count(*) from storage.objects) = 0,
      'anon sees 0 storage objects: the bucket is private');
  end $$;
commit;

-- ============================================================================
-- The bucket must be private. A public bucket would make every storage policy
-- above irrelevant.
-- ============================================================================
do $$
begin
  perform tests.assert(
    (select not public from storage.buckets where id = 'exam-pdfs'),
    'exam-pdfs bucket is private'
  );
end $$;

-- ============================================================================
-- Corrections are append-only (D-012): no update policy exists, so an update
-- must affect nothing even for the row's own owner.
-- ============================================================================
\echo '== corrections are append-only =='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  do $$
  declare
    affected integer;
  begin
    insert into question_corrections (question_id, folder_id, user_id, field, old_value, new_value)
    values ('c1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'marks', '10', '12');
    perform tests.assert(true, 'alice can append a correction to her own question');

    update question_corrections set new_value = 'rewritten'
      where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    get diagnostics affected = row_count;
    perform tests.assert(affected = 0,
      'no update policy exists on question_corrections, so history cannot be rewritten');

    begin
      insert into question_corrections (question_id, folder_id, user_id, field, new_value)
      values ('c1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'not_a_field', 'x');
      perform tests.assert(false, 'a correction to an unapproved field must be rejected');
    exception when check_violation then
      perform tests.assert(true, 'only the approved correctable fields are accepted');
    end;
  end $$;
rollback;

-- ============================================================================
-- llm_usage is read-only to users: a user who could write their own counters
-- could reset them and bypass the daily budget (D-023).
-- ============================================================================
\echo '== llm_usage is not user-writable =='
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  do $$
  begin
    begin
      insert into llm_usage (user_id, feature, calls)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hint', 0);
      perform tests.assert(false, 'a user inserting their own usage row must be rejected');
    exception when insufficient_privilege then
      perform tests.assert(true, 'users cannot write llm_usage; only the server may');
    end;
  end $$;
rollback;

-- ============================================================================
-- Every public table must have RLS enabled. Catches a future table added
-- without it -- the failure mode that silently exposes everything.
-- ============================================================================
do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ')
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  perform tests.assert(unprotected is null,
    'every table in the public schema has RLS enabled (unprotected: ' ||
    coalesce(unprotected, 'none') || ')');
end $$;

\echo ''
\echo 'ALL RLS AND STORAGE OWNERSHIP TESTS PASSED'
