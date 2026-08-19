-- Row Level Security for all 17 user-data tables (D-015).
--
-- Four rules hold everywhere, without exception:
--
--   1. `(select auth.uid())` is wrapped in a subquery so Postgres evaluates it
--      once per query instead of once per row.
--   2. Every policy names `to authenticated`. Role alone is never the check --
--      an ownership predicate is always present as well.
--   3. Every update policy carries BOTH `using` and `with check`, so a row's
--      user_id cannot be reassigned to another user.
--   4. Every table has an index on user_id (see the schema migration): the
--      predicate is only cheap if indexed.
--
-- The `anon` role gets NO policies on ANY table. Public sharing is served
-- exclusively by a server route holding the secret key, which applies an
-- explicit field allowlist (D-017). A policy granting `anon` read access to a
-- table would expose every column added to that table in future by default;
-- an allowlist fails the other way round, hiding new fields until someone
-- deliberately publishes them.
--
-- Policies are dropped before creation so this file is safe to re-run
-- (Postgres has no `create policy if not exists`).
--
-- Rollback: safe to re-run. To undo, `alter table <t> disable row level
-- security` -- but note that leaves the tables world-readable to any role with
-- table grants, so never do it on a project holding real data.

-- ============================================================================
-- profiles -- ownership column is `id`, not `user_id` (it IS the auth.users id)
-- ============================================================================
alter table profiles enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  to authenticated using ((select auth.uid()) = id);

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert
  to authenticated with check ((select auth.uid()) = id);

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  to authenticated using ((select auth.uid()) = id)
              with check ((select auth.uid()) = id);

drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles for delete
  to authenticated using ((select auth.uid()) = id);

-- ============================================================================
-- folders
-- ============================================================================
alter table folders enable row level security;

drop policy if exists folders_select on folders;
create policy folders_select on folders for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists folders_insert on folders;
create policy folders_insert on folders for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists folders_update on folders;
create policy folders_update on folders for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists folders_delete on folders;
create policy folders_delete on folders for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- papers
-- ============================================================================
alter table papers enable row level security;

drop policy if exists papers_select on papers;
create policy papers_select on papers for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists papers_insert on papers;
create policy papers_insert on papers for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists papers_update on papers;
create policy papers_update on papers for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists papers_delete on papers;
create policy papers_delete on papers for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- paper_pages
-- ============================================================================
alter table paper_pages enable row level security;

drop policy if exists paper_pages_select on paper_pages;
create policy paper_pages_select on paper_pages for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists paper_pages_insert on paper_pages;
create policy paper_pages_insert on paper_pages for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists paper_pages_update on paper_pages;
create policy paper_pages_update on paper_pages for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists paper_pages_delete on paper_pages;
create policy paper_pages_delete on paper_pages for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- questions
-- ============================================================================
alter table questions enable row level security;

drop policy if exists questions_select on questions;
create policy questions_select on questions for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists questions_insert on questions;
create policy questions_insert on questions for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists questions_update on questions;
create policy questions_update on questions for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists questions_delete on questions;
create policy questions_delete on questions for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- question_groups
-- ============================================================================
alter table question_groups enable row level security;

drop policy if exists question_groups_select on question_groups;
create policy question_groups_select on question_groups for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists question_groups_insert on question_groups;
create policy question_groups_insert on question_groups for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists question_groups_update on question_groups;
create policy question_groups_update on question_groups for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists question_groups_delete on question_groups;
create policy question_groups_delete on question_groups for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- similarity_clusters
-- ============================================================================
alter table similarity_clusters enable row level security;

drop policy if exists similarity_clusters_select on similarity_clusters;
create policy similarity_clusters_select on similarity_clusters for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists similarity_clusters_insert on similarity_clusters;
create policy similarity_clusters_insert on similarity_clusters for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists similarity_clusters_update on similarity_clusters;
create policy similarity_clusters_update on similarity_clusters for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists similarity_clusters_delete on similarity_clusters;
create policy similarity_clusters_delete on similarity_clusters for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- cluster_members
-- ============================================================================
alter table cluster_members enable row level security;

drop policy if exists cluster_members_select on cluster_members;
create policy cluster_members_select on cluster_members for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists cluster_members_insert on cluster_members;
create policy cluster_members_insert on cluster_members for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists cluster_members_update on cluster_members;
create policy cluster_members_update on cluster_members for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists cluster_members_delete on cluster_members;
create policy cluster_members_delete on cluster_members for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- topics
-- ============================================================================
alter table topics enable row level security;

drop policy if exists topics_select on topics;
create policy topics_select on topics for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists topics_insert on topics;
create policy topics_insert on topics for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists topics_update on topics;
create policy topics_update on topics for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists topics_delete on topics;
create policy topics_delete on topics for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- folder_analytics
-- ============================================================================
alter table folder_analytics enable row level security;

drop policy if exists folder_analytics_select on folder_analytics;
create policy folder_analytics_select on folder_analytics for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists folder_analytics_insert on folder_analytics;
create policy folder_analytics_insert on folder_analytics for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists folder_analytics_update on folder_analytics;
create policy folder_analytics_update on folder_analytics for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists folder_analytics_delete on folder_analytics;
create policy folder_analytics_delete on folder_analytics for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- question_corrections
-- ============================================================================
alter table question_corrections enable row level security;

drop policy if exists question_corrections_select on question_corrections;
create policy question_corrections_select on question_corrections for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists question_corrections_insert on question_corrections;
create policy question_corrections_insert on question_corrections for insert
  to authenticated with check ((select auth.uid()) = user_id);

-- Corrections are an append-only audit trail (D-012): a user may withdraw one
-- by deleting it, but editing history in place would defeat the point, so no
-- update policy exists. Without a permissive update policy, RLS denies updates.
drop policy if exists question_corrections_update on question_corrections;

drop policy if exists question_corrections_delete on question_corrections;
create policy question_corrections_delete on question_corrections for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- group_overrides
-- ============================================================================
alter table group_overrides enable row level security;

drop policy if exists group_overrides_select on group_overrides;
create policy group_overrides_select on group_overrides for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists group_overrides_insert on group_overrides;
create policy group_overrides_insert on group_overrides for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists group_overrides_update on group_overrides;
create policy group_overrides_update on group_overrides for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists group_overrides_delete on group_overrides;
create policy group_overrides_delete on group_overrides for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- share_links
--
-- Note what is NOT here: no `anon` select policy. A public viewer never reads
-- this table directly. The server route hashes the incoming token, looks the row
-- up with the secret key, and returns a hand-built projection (D-017).
-- ============================================================================
alter table share_links enable row level security;

drop policy if exists share_links_select on share_links;
create policy share_links_select on share_links for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists share_links_insert on share_links;
create policy share_links_insert on share_links for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists share_links_update on share_links;
create policy share_links_update on share_links for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists share_links_delete on share_links;
create policy share_links_delete on share_links for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- processing_jobs
--
-- Select is what lets the browser watch job progress over Realtime, scoped to
-- the owner's own rows (D-018). Inserts and status transitions are performed by
-- the server and worker with the secret key, which bypasses RLS; the write
-- policies below exist so ownership is still enforced if a user-scoped client
-- ever writes here.
-- ============================================================================
alter table processing_jobs enable row level security;

drop policy if exists processing_jobs_select on processing_jobs;
create policy processing_jobs_select on processing_jobs for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists processing_jobs_insert on processing_jobs;
create policy processing_jobs_insert on processing_jobs for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists processing_jobs_update on processing_jobs;
create policy processing_jobs_update on processing_jobs for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists processing_jobs_delete on processing_jobs;
create policy processing_jobs_delete on processing_jobs for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- llm_cache
-- ============================================================================
alter table llm_cache enable row level security;

drop policy if exists llm_cache_select on llm_cache;
create policy llm_cache_select on llm_cache for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists llm_cache_insert on llm_cache;
create policy llm_cache_insert on llm_cache for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists llm_cache_update on llm_cache;
create policy llm_cache_update on llm_cache for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists llm_cache_delete on llm_cache;
create policy llm_cache_delete on llm_cache for delete
  to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- llm_usage
--
-- Read-only to the user: they may see their own spend, but a user who could
-- write their own usage counters could reset them and bypass the daily budget
-- (D-023). Only the server, using the secret key, increments these.
-- ============================================================================
alter table llm_usage enable row level security;

drop policy if exists llm_usage_select on llm_usage;
create policy llm_usage_select on llm_usage for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists llm_usage_insert on llm_usage;
drop policy if exists llm_usage_update on llm_usage;
drop policy if exists llm_usage_delete on llm_usage;

-- ============================================================================
-- generated_artifacts
-- ============================================================================
alter table generated_artifacts enable row level security;

drop policy if exists generated_artifacts_select on generated_artifacts;
create policy generated_artifacts_select on generated_artifacts for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists generated_artifacts_insert on generated_artifacts;
create policy generated_artifacts_insert on generated_artifacts for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists generated_artifacts_update on generated_artifacts;
create policy generated_artifacts_update on generated_artifacts for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);

drop policy if exists generated_artifacts_delete on generated_artifacts;
create policy generated_artifacts_delete on generated_artifacts for delete
  to authenticated using ((select auth.uid()) = user_id);
