-- PaperLens initial schema
--
-- 17 tables. Every user-owned table carries its own user_id (D-015) so that each
-- RLS policy is a single indexed predicate instead of a join up the parent chain.
--
-- Children of `folders` additionally declare a composite foreign key
-- (folder_id, user_id) -> folders(id, user_id). That makes it structurally
-- impossible for a row to reference a folder owned by somebody else, so the
-- denormalized user_id cannot drift from its folder's owner even if application
-- code is wrong.
--
-- Old SQLite -> new mapping: DECISIONS.md D-025.
-- RLS policies: 20260819120100_row_level_security.sql.
--
-- Rollback: safe to re-run. To undo entirely, drop the tables in reverse
-- dependency order (generated_artifacts .. profiles); there is no data to
-- preserve on a fresh project (D-025).

-- gen_random_uuid()
create extension if not exists pgcrypto;

-- ============================================================================
-- Ownership root
-- ============================================================================

-- One row per authenticated user, created by trigger on auth.users insert
-- (see the triggers migration).
create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The subject hub. Papers are added over time; analytics are cached per folder
-- (D-010). Absorbs the old `user_context` table's columns (D-025).
create table if not exists folders (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  name                  text not null,
  subject               text,
  exam_name             text,
  exam_type             text,
  total_marks           numeric,
  question_pattern      text,
  -- Scoring measures recency against this year, never against the clock, so the
  -- same papers always produce the same scores (D-014).
  reference_year        integer,
  syllabus_storage_path text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint folders_name_not_blank check (length(btrim(name)) > 0),
  -- Required so children can enforce ownership by composite foreign key.
  constraint folders_id_user_id_key unique (id, user_id)
);

-- ============================================================================
-- Papers and extraction
-- ============================================================================

create table if not exists papers (
  id                uuid primary key default gen_random_uuid(),
  folder_id         uuid not null,
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- Server-generated: {user_id}/{folder_id}/{paper_id}.pdf. Never built from a
  -- client-supplied filename (D-016).
  storage_path      text not null,
  original_filename text not null,
  year              integer,
  year_source       text,
  content_hash      text,
  page_count        integer,
  extraction_status text not null default 'queued',
  extraction_method text,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint papers_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint papers_year_source_check check (
    year_source is null or year_source in ('filename', 'document_text', 'manual')
  ),
  constraint papers_extraction_status_check check (
    extraction_status in ('queued', 'extracting', 'extracted', 'needs_year', 'failed', 'quarantined')
  ),
  constraint papers_extraction_method_check check (
    extraction_method is null or extraction_method in ('text', 'ocr', 'hybrid')
  ),
  constraint papers_year_range check (year is null or (year between 1990 and 2100)),
  constraint papers_storage_path_key unique (storage_path),
  constraint papers_id_user_id_key unique (id, user_id)
);

-- One row per page. This is what makes OCR degradation visible instead of
-- silent: a page whose OCR failed records 'ocr_failed' rather than quietly
-- substituting whatever sparse text the PDF layer found (D-013).
create table if not exists paper_pages (
  id                uuid primary key default gen_random_uuid(),
  paper_id          uuid not null,
  user_id           uuid not null references auth.users (id) on delete cascade,
  page_number       integer not null,
  extraction_method text not null,
  char_count        integer not null default 0,
  ocr_confidence    numeric,
  created_at        timestamptz not null default now(),
  constraint paper_pages_paper_fk foreign key (paper_id, user_id)
    references papers (id, user_id) on delete cascade,
  constraint paper_pages_method_check check (
    extraction_method in ('text', 'ocr', 'ocr_failed')
  ),
  constraint paper_pages_page_number_positive check (page_number >= 1),
  constraint paper_pages_confidence_range check (
    ocr_confidence is null or (ocr_confidence between 0 and 100)
  ),
  constraint paper_pages_paper_page_key unique (paper_id, page_number)
);

-- One row per extracted question, accepted or rejected. The old
-- `rejected_questions` table is merged in here as status = 'rejected' (D-025),
-- so accepting a rejected question is a field update rather than a row move.
create table if not exists questions (
  id                 uuid primary key default gen_random_uuid(),
  paper_id           uuid not null,
  folder_id          uuid not null,
  user_id            uuid not null references auth.users (id) on delete cascade,
  question_label     text,
  -- Full hierarchical path, e.g. 'Q5(a)(ii)'. Part of question identity.
  label_path         text not null,
  text_extracted     text not null,
  text_normalized    text not null,
  -- SHA-256 of text_normalized. Identity is content-addressed, never
  -- positional: no counters anywhere (D-011).
  normalized_hash    text not null,
  normalizer_version integer not null default 1,
  marks              numeric,
  section            text,
  -- Real page number propagated from the extractor, not a hardcoded 1 (D-013).
  page_number        integer,
  question_type      text,
  difficulty         text,
  confidence         numeric,
  status             text not null default 'accepted',
  reject_reason      text,
  group_id           uuid,
  created_at         timestamptz not null default now(),
  constraint questions_paper_fk foreign key (paper_id, user_id)
    references papers (id, user_id) on delete cascade,
  constraint questions_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint questions_status_check check (
    status in ('accepted', 'rejected', 'tombstoned')
  ),
  constraint questions_type_check check (
    question_type is null or question_type in ('numerical', 'derivation', 'diagram', 'short_note', 'descriptive')
  ),
  constraint questions_difficulty_check check (
    difficulty is null or difficulty in ('easy', 'medium', 'hard')
  ),
  constraint questions_confidence_range check (
    confidence is null or (confidence between 0 and 100)
  ),
  constraint questions_page_number_positive check (page_number is null or page_number >= 1),
  -- Content-addressed identity (D-011). Re-extracting an unchanged paper
  -- produces the same rows, which is what makes re-processing idempotent.
  constraint questions_identity_key unique (paper_id, label_path, normalized_hash),
  constraint questions_id_user_id_key unique (id, user_id)
);

-- ============================================================================
-- Analysis
-- ============================================================================

-- The concept. `unique (folder_id, normalized_hash)` IS its identity (D-011):
-- exact hashing is authoritative and has no false positives by construction.
create table if not exists question_groups (
  id                 uuid primary key default gen_random_uuid(),
  folder_id          uuid not null,
  user_id            uuid not null references auth.users (id) on delete cascade,
  normalized_hash    text not null,
  canonical_text     text not null,
  normalizer_version integer not null default 1,
  occurrence_count   integer not null default 0,
  distinct_years     integer not null default 0,
  avg_marks          numeric,
  max_marks          numeric,
  first_year         integer,
  last_year          integer,
  year_span          integer not null default 0,
  topic_id           uuid,
  priority_score     numeric,
  priority_level     text,
  -- Per-factor contributions, kept as jsonb so adding a factor does not
  -- require a migration. Replaces the old f_freq/f_recency/... columns.
  factors            jsonb not null default '{}'::jsonb,
  priority_reason    text,
  -- The year recency was measured against, and the scoring version. Stored so a
  -- score can always be explained and reproduced (D-014).
  reference_year     integer,
  algo_version       integer not null default 1,
  computed_at        timestamptz,
  constraint question_groups_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint question_groups_priority_level_check check (
    priority_level is null or priority_level in ('critical', 'very_high', 'high', 'medium', 'low')
  ),
  constraint question_groups_priority_score_range check (
    priority_score is null or (priority_score between 0 and 100)
  ),
  constraint question_groups_identity_key unique (folder_id, normalized_hash),
  constraint question_groups_id_user_id_key unique (id, user_id)
);

alter table questions
  drop constraint if exists questions_group_fk;
alter table questions
  add constraint questions_group_fk foreign key (group_id, user_id)
    references question_groups (id, user_id) on delete set null;

-- Advisory grouping over question_groups. Fuzzy output lives here and never
-- touches identity, so the threshold can be retuned (or the whole method
-- replaced with embeddings) without detaching a single user correction (D-024).
create table if not exists similarity_clusters (
  id                     uuid primary key default gen_random_uuid(),
  folder_id              uuid not null,
  user_id                uuid not null references auth.users (id) on delete cascade,
  representative_group_id uuid,
  method                 text not null default 'rapidfuzz_token_set_ratio',
  -- Stored with the result so a threshold change is detectable after the fact.
  threshold              numeric not null,
  group_count            integer not null default 0,
  algo_version           integer not null default 1,
  computed_at            timestamptz,
  constraint similarity_clusters_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint similarity_clusters_threshold_range check (threshold between 0 and 1),
  constraint similarity_clusters_id_user_id_key unique (id, user_id)
);

create table if not exists cluster_members (
  id         uuid primary key default gen_random_uuid(),
  cluster_id uuid not null,
  group_id   uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Per-pair score against the cluster seed. Advisory, shown as "similar",
  -- never as "same".
  score      numeric not null,
  is_seed    boolean not null default false,
  constraint cluster_members_cluster_fk foreign key (cluster_id, user_id)
    references similarity_clusters (id, user_id) on delete cascade,
  constraint cluster_members_group_fk foreign key (group_id, user_id)
    references question_groups (id, user_id) on delete cascade,
  constraint cluster_members_score_range check (score between 0 and 1),
  constraint cluster_members_cluster_group_key unique (cluster_id, group_id)
);

create table if not exists topics (
  id        uuid primary key default gen_random_uuid(),
  folder_id uuid not null,
  user_id   uuid not null references auth.users (id) on delete cascade,
  name      text not null,
  ordinal   integer not null default 0,
  keywords  jsonb not null default '[]'::jsonb,
  -- Where this topic came from: parsed from an uploaded syllabus, typed by the
  -- user, or a built-in default. Makes the old hidden Operating-Systems
  -- fallback explicit (D-028).
  source    text not null default 'default',
  created_at timestamptz not null default now(),
  constraint topics_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint topics_source_check check (source in ('syllabus', 'user', 'default')),
  constraint topics_name_not_blank check (length(btrim(name)) > 0),
  constraint topics_folder_name_key unique (folder_id, name),
  constraint topics_id_user_id_key unique (id, user_id)
);

alter table question_groups
  drop constraint if exists question_groups_topic_fk;
alter table question_groups
  add constraint question_groups_topic_fk foreign key (topic_id, user_id)
    references topics (id, user_id) on delete set null;

-- Declared after question_groups exists. Composite so a cluster cannot name a
-- representative group belonging to a different user.
alter table similarity_clusters
  drop constraint if exists similarity_clusters_representative_fk;
alter table similarity_clusters
  add constraint similarity_clusters_representative_fk
    foreign key (representative_group_id, user_id)
    references question_groups (id, user_id) on delete set null;

-- Cached deterministic analytics, one row per folder (D-010 requires no
-- multi-run history, so a recompute overwrites). `fingerprint` is a hash of
-- everything the computation depends on; a mismatch means recompute, so a code
-- path that forgets to invalidate still misses the cache (D-014).
create table if not exists folder_analytics (
  folder_id      uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  fingerprint    text not null,
  reference_year integer,
  algo_version   integer not null default 1,
  payload        jsonb not null,
  computed_at    timestamptz not null default now(),
  constraint folder_analytics_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade
);

-- ============================================================================
-- User intent
-- ============================================================================

-- Append-only overlay. Extraction output is never edited in place, so
-- re-processing recomputes the machine's answer and cannot destroy a person's
-- correction (D-012). Reads apply the newest correction per field.
create table if not exists question_corrections (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  folder_id   uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  field       text not null,
  old_value   text,
  new_value   text,
  created_at  timestamptz not null default now(),
  constraint question_corrections_question_fk foreign key (question_id, user_id)
    references questions (id, user_id) on delete cascade,
  constraint question_corrections_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  -- The approved correctable field list (D-012).
  constraint question_corrections_field_check check (
    field in ('text', 'marks', 'question_type', 'difficulty', 'topic', 'group_membership')
  )
);

-- User merge/split of groups, so advisory similarity output can be corrected by
-- a human rather than being presented as final (D-011, D-012).
--
-- These reference group uuids rather than (folder_id, normalized_hash). That is
-- only safe because re-analysis upserts question_groups on their identity key
-- instead of deleting and recreating them, so a group's uuid is stable across
-- runs. See analysis/dedup.py -- if that ever changes to delete-then-insert,
-- these overrides would be orphaned.
create table if not exists group_overrides (
  id             uuid primary key default gen_random_uuid(),
  folder_id      uuid not null,
  user_id        uuid not null references auth.users (id) on delete cascade,
  action         text not null,
  source_group_id uuid,
  target_group_id uuid,
  question_id    uuid,
  created_at     timestamptz not null default now(),
  constraint group_overrides_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint group_overrides_action_check check (action in ('merge', 'split'))
);

-- Declared after questions and question_groups exist. Composite so an override
-- cannot reference another user's group or question.
alter table group_overrides
  drop constraint if exists group_overrides_source_group_fk;
alter table group_overrides
  add constraint group_overrides_source_group_fk
    foreign key (source_group_id, user_id)
    references question_groups (id, user_id) on delete cascade;

alter table group_overrides
  drop constraint if exists group_overrides_target_group_fk;
alter table group_overrides
  add constraint group_overrides_target_group_fk
    foreign key (target_group_id, user_id)
    references question_groups (id, user_id) on delete cascade;

alter table group_overrides
  drop constraint if exists group_overrides_question_fk;
alter table group_overrides
  add constraint group_overrides_question_fk
    foreign key (question_id, user_id)
    references questions (id, user_id) on delete cascade;

-- ============================================================================
-- Delivery
-- ============================================================================

-- Stores only the SHA-256 of the token, never the token itself, so a leaked
-- database backup does not yield working share links. Revocation sets
-- revoked_at rather than deleting, keeping it auditable (D-017).
create table if not exists share_links (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  token_hash text not null,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint share_links_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint share_links_token_hash_key unique (token_hash)
);

-- Durable queue. Replaces FastAPI BackgroundTasks, which died with the web
-- process and lost the work (D-018). Claimed with `for update skip locked`.
create table if not exists processing_jobs (
  id              uuid primary key default gen_random_uuid(),
  folder_id       uuid not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  job_type        text not null,
  -- Must never contain secrets: anyone who can read the row can read this.
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'queued',
  progress        integer not null default 0,
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  -- Derived from folder id + content fingerprint, so a double-click or a
  -- retried request cannot queue the same work twice (D-018).
  idempotency_key text not null,
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint processing_jobs_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint processing_jobs_type_check check (job_type in ('extract', 'analyze')),
  constraint processing_jobs_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed')
  ),
  constraint processing_jobs_progress_range check (progress between 0 and 100),
  constraint processing_jobs_idempotency_key_key unique (idempotency_key)
);

-- LLM response cache, scoped to a folder so a hint is generated once and served
-- to every viewer of that folder including public share viewers (D-023).
-- Deliberately not global across users: a shared cache keyed on content would
-- let one user confirm whether specific text exists in another user's folder.
create table if not exists llm_cache (
  id                uuid primary key default gen_random_uuid(),
  folder_id         uuid not null,
  user_id           uuid not null references auth.users (id) on delete cascade,
  feature           text not null,
  model             text not null,
  prompt_version    integer not null default 1,
  input_fingerprint text not null,
  payload           jsonb not null,
  tokens_in         integer,
  tokens_out        integer,
  created_at        timestamptz not null default now(),
  constraint llm_cache_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint llm_cache_key unique (folder_id, feature, model, prompt_version, input_fingerprint)
);

-- Per-user daily budget counters. Limits themselves are environment
-- configuration, not schema (D-023).
create table if not exists llm_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default current_date,
  feature    text not null,
  calls      integer not null default 0,
  tokens_in  integer not null default 0,
  tokens_out integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint llm_usage_key unique (user_id, usage_date, feature)
);

-- Flashcards, mock papers, checklists. Fingerprinted so they regenerate when
-- their inputs change and are otherwise reused.
create table if not exists generated_artifacts (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,
  fingerprint text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  constraint generated_artifacts_folder_fk foreign key (folder_id, user_id)
    references folders (id, user_id) on delete cascade,
  constraint generated_artifacts_kind_check check (
    kind in ('flashcards', 'mock_paper', 'checklist', 'study_guide')
  ),
  constraint generated_artifacts_key unique (folder_id, kind, fingerprint)
);

-- ============================================================================
-- Indexes
--
-- Every table gets an index on user_id: the RLS predicate is only cheap if
-- indexed (D-015). Remaining indexes follow the read paths the app actually
-- uses -- folder listings, per-paper question lookups, ranked question banks,
-- and the worker's job claim.
-- ============================================================================

create index if not exists folders_user_id_idx on folders (user_id);
create index if not exists papers_user_id_idx on papers (user_id);
create index if not exists papers_folder_id_idx on papers (folder_id);
create index if not exists papers_content_hash_idx on papers (content_hash);
create index if not exists paper_pages_user_id_idx on paper_pages (user_id);
create index if not exists paper_pages_paper_id_idx on paper_pages (paper_id);
create index if not exists questions_user_id_idx on questions (user_id);
create index if not exists questions_paper_id_idx on questions (paper_id);
create index if not exists questions_folder_id_idx on questions (folder_id);
create index if not exists questions_group_id_idx on questions (group_id);
create index if not exists questions_normalized_hash_idx on questions (folder_id, normalized_hash);
create index if not exists question_groups_user_id_idx on question_groups (user_id);
create index if not exists question_groups_folder_priority_idx
  on question_groups (folder_id, priority_score desc);
create index if not exists question_groups_topic_id_idx on question_groups (topic_id);
create index if not exists similarity_clusters_user_id_idx on similarity_clusters (user_id);
create index if not exists similarity_clusters_folder_id_idx on similarity_clusters (folder_id);
create index if not exists cluster_members_user_id_idx on cluster_members (user_id);
create index if not exists cluster_members_cluster_id_idx on cluster_members (cluster_id);
create index if not exists cluster_members_group_id_idx on cluster_members (group_id);
create index if not exists topics_user_id_idx on topics (user_id);
create index if not exists topics_folder_id_idx on topics (folder_id);
create index if not exists folder_analytics_user_id_idx on folder_analytics (user_id);
create index if not exists question_corrections_user_id_idx on question_corrections (user_id);
create index if not exists question_corrections_question_id_idx
  on question_corrections (question_id, created_at desc);
create index if not exists group_overrides_user_id_idx on group_overrides (user_id);
create index if not exists group_overrides_folder_id_idx on group_overrides (folder_id);
create index if not exists share_links_user_id_idx on share_links (user_id);
create index if not exists share_links_folder_id_idx on share_links (folder_id);
create index if not exists processing_jobs_user_id_idx on processing_jobs (user_id);
create index if not exists processing_jobs_folder_id_idx on processing_jobs (folder_id);
-- Supports the worker's claim query: oldest queued job first.
create index if not exists processing_jobs_claim_idx
  on processing_jobs (status, created_at) where status = 'queued';
create index if not exists llm_cache_user_id_idx on llm_cache (user_id);
create index if not exists llm_cache_folder_id_idx on llm_cache (folder_id);
create index if not exists llm_usage_user_id_idx on llm_usage (user_id);
create index if not exists generated_artifacts_user_id_idx on generated_artifacts (user_id);
create index if not exists generated_artifacts_folder_id_idx on generated_artifacts (folder_id);
