-- Private storage bucket and ownership policies (D-016).
--
-- One bucket, `exam-pdfs`, never public. Paths are server-generated only:
--
--   {user_id}/{folder_id}/{paper_id}.pdf     exam papers
--   {user_id}/{folder_id}/syllabus.pdf       syllabus
--
-- Putting user_id first makes ownership a prefix comparison, which is the only
-- storage predicate Postgres can evaluate cheaply, and it reads unambiguously in
-- the Supabase dashboard.
--
-- The original filename is stored in papers.original_filename as metadata and is
-- NEVER used to build a path. That is the fix for the verified path-traversal
-- defect in the old upload handler (AUDIT.md 4.6): with no user input in the
-- path, the entire class of attack is unreachable rather than filtered.
--
-- Note the bucket name: `exam-pdfs`, per AGENTS.md. The old `.env.example` said
-- `exam-papers`; AGENTS.md is the authority (D-007) and .env.example is
-- corrected to match.
--
-- Rollback: safe to re-run. To undo, drop the four policies and
-- `delete from storage.buckets where id = 'exam-pdfs'` -- which requires the
-- bucket to be empty first.

insert into storage.buckets (id, name, public)
values ('exam-pdfs', 'exam-pdfs', false)
on conflict (id) do update set public = false;

grant usage on schema storage to authenticated, service_role;
grant select, insert, update, delete on table storage.objects to authenticated;
grant all on table storage.objects to service_role;

-- All four operations get a policy. `select` and `insert` alone are not enough:
-- a Supabase upsert issues an update, and an update with no policy fails in a
-- way that looks like a silent no-op rather than an error.

drop policy if exists exam_pdfs_select on storage.objects;
create policy exam_pdfs_select on storage.objects for select
  to authenticated
  using (
    bucket_id = 'exam-pdfs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists exam_pdfs_insert on storage.objects;
create policy exam_pdfs_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'exam-pdfs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists exam_pdfs_update on storage.objects;
create policy exam_pdfs_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'exam-pdfs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'exam-pdfs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists exam_pdfs_delete on storage.objects;
create policy exam_pdfs_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'exam-pdfs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
