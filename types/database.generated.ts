/**
 * Database types for the PaperLens schema.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS HAND-MAINTAINED FOR NOW, AND SHOULD NOT BE.
 *
 * D-027 specifies generating it with the Supabase CLI and treating it as
 * read-only. No Supabase CLI is installed on this machine and no Supabase
 * project exists yet, so it could not be generated (D-031). It was written by
 * hand to match `supabase/migrations/`, which means it can drift from the
 * schema — exactly the failure mode D-027 exists to prevent.
 *
 * Replace it as soon as a project exists:
 *
 *     npx supabase gen types typescript --local > types/database.generated.ts
 *
 * After that, never edit it by hand; regenerate after every migration.
 * ---------------------------------------------------------------------------
 *
 * Shape note: the CLI emits explicit Row/Insert/Update blocks per table. Here,
 * Insert and Update are derived from Row with the `Insertable`/`Updatable`
 * helpers below, so a column cannot be listed in one place and forgotten in
 * another. The public API is identical either way —
 * `Database["public"]["Tables"]["papers"]["Row"]` resolves the same — so
 * regenerating is a drop-in replacement.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Columns the database fills in itself, so they are optional on insert. */
type DatabaseDefaulted = "id" | "created_at" | "updated_at" | "computed_at";

/**
 * Insert shape: database-defaulted columns and nullable columns are optional;
 * everything else is required.
 */
type Insertable<Row, ExtraOptional extends keyof Row = never> = Omit<
  Row,
  (DatabaseDefaulted & keyof Row) | ExtraOptional
> &
  Partial<Pick<Row, (DatabaseDefaulted & keyof Row) | ExtraOptional>>;

/** Update shape: every column optional. */
type Updatable<Row> = Partial<Row>;

// ---------------------------------------------------------------------------
// Row types, one per table, in migration order.
// ---------------------------------------------------------------------------

export type ProfilesRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type FoldersRow = {
  id: string;
  user_id: string;
  name: string;
  subject: string | null;
  exam_name: string | null;
  exam_type: string | null;
  total_marks: number | null;
  question_pattern: string | null;
  reference_year: number | null;
  syllabus_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

export type PaperExtractionStatus =
  | "queued"
  | "extracting"
  | "extracted"
  | "needs_year"
  | "failed"
  | "quarantined";

export type ExtractionMethod = "text" | "ocr" | "hybrid";

export type YearSource = "filename" | "document_text" | "manual";

export type PapersRow = {
  id: string;
  folder_id: string;
  user_id: string;
  storage_path: string;
  original_filename: string;
  year: number | null;
  year_source: YearSource | null;
  content_hash: string | null;
  page_count: number | null;
  extraction_status: PaperExtractionStatus;
  extraction_method: ExtractionMethod | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

/** Per-page provenance. `ocr_failed` is what makes degradation visible (D-013). */
export type PageExtractionMethod = "text" | "ocr" | "ocr_failed";

export type PaperPagesRow = {
  id: string;
  paper_id: string;
  user_id: string;
  page_number: number;
  extraction_method: PageExtractionMethod;
  char_count: number;
  ocr_confidence: number | null;
  created_at: string;
};

export type QuestionStatus = "accepted" | "rejected" | "tombstoned";

export type QuestionType =
  | "numerical"
  | "derivation"
  | "diagram"
  | "short_note"
  | "descriptive";

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionsRow = {
  id: string;
  paper_id: string;
  folder_id: string;
  user_id: string;
  question_label: string | null;
  label_path: string;
  text_extracted: string;
  text_normalized: string;
  normalized_hash: string;
  normalizer_version: number;
  marks: number | null;
  section: string | null;
  page_number: number | null;
  question_type: QuestionType | null;
  difficulty: Difficulty | null;
  confidence: number | null;
  status: QuestionStatus;
  reject_reason: string | null;
  group_id: string | null;
  created_at: string;
};

export type PriorityLevel =
  | "critical"
  | "very_high"
  | "high"
  | "medium"
  | "low";

export type QuestionGroupsRow = {
  id: string;
  folder_id: string;
  user_id: string;
  normalized_hash: string;
  canonical_text: string;
  normalizer_version: number;
  occurrence_count: number;
  distinct_years: number;
  avg_marks: number | null;
  max_marks: number | null;
  first_year: number | null;
  last_year: number | null;
  year_span: number;
  topic_id: string | null;
  priority_score: number | null;
  priority_level: PriorityLevel | null;
  factors: Json;
  priority_reason: string | null;
  reference_year: number | null;
  algo_version: number;
  computed_at: string | null;
};

export type SimilarityClustersRow = {
  id: string;
  folder_id: string;
  user_id: string;
  representative_group_id: string | null;
  method: string;
  threshold: number;
  group_count: number;
  algo_version: number;
  computed_at: string | null;
};

export type ClusterMembersRow = {
  id: string;
  cluster_id: string;
  group_id: string;
  user_id: string;
  score: number;
  is_seed: boolean;
};

export type TopicSource = "syllabus" | "user" | "default";

export type TopicsRow = {
  id: string;
  folder_id: string;
  user_id: string;
  name: string;
  ordinal: number;
  keywords: Json;
  source: TopicSource;
  created_at: string;
};

export type FolderAnalyticsRow = {
  folder_id: string;
  user_id: string;
  fingerprint: string;
  reference_year: number | null;
  algo_version: number;
  payload: Json;
  computed_at: string;
};

/** The approved correctable field list (D-012). */
export type CorrectableField =
  | "text"
  | "marks"
  | "question_type"
  | "difficulty"
  | "topic"
  | "group_membership";

export type QuestionCorrectionsRow = {
  id: string;
  question_id: string;
  folder_id: string;
  user_id: string;
  field: CorrectableField;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export type GroupOverridesRow = {
  id: string;
  folder_id: string;
  user_id: string;
  action: "merge" | "split";
  source_group_id: string | null;
  target_group_id: string | null;
  question_id: string | null;
  created_at: string;
};

export type ShareLinksRow = {
  id: string;
  folder_id: string;
  user_id: string;
  /** SHA-256 of the token. The token itself is never stored (D-017). */
  token_hash: string;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type JobType = "extract" | "analyze";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type ProcessingJobsRow = {
  id: string;
  folder_id: string;
  user_id: string;
  job_type: JobType;
  payload: Json;
  status: JobStatus;
  progress: number;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type LlmCacheRow = {
  id: string;
  folder_id: string;
  user_id: string;
  feature: string;
  model: string;
  prompt_version: number;
  input_fingerprint: string;
  payload: Json;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
};

export type LlmUsageRow = {
  id: string;
  user_id: string;
  usage_date: string;
  feature: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  updated_at: string;
};

export type ArtifactKind =
  | "flashcards"
  | "mock_paper"
  | "checklist"
  | "study_guide";

export type GeneratedArtifactsRow = {
  id: string;
  folder_id: string;
  user_id: string;
  kind: ArtifactKind;
  fingerprint: string;
  payload: Json;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Database interface, in the shape @supabase/supabase-js expects.
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfilesRow;
        Insert: Insertable<ProfilesRow, "email" | "display_name">;
        Update: Updatable<ProfilesRow>;
        Relationships: [];
      };
      folders: {
        Row: FoldersRow;
        Insert: Insertable<
          FoldersRow,
          | "subject"
          | "exam_name"
          | "exam_type"
          | "total_marks"
          | "question_pattern"
          | "reference_year"
          | "syllabus_storage_path"
        >;
        Update: Updatable<FoldersRow>;
        Relationships: [];
      };
      papers: {
        Row: PapersRow;
        Insert: Insertable<
          PapersRow,
          | "year"
          | "year_source"
          | "content_hash"
          | "page_count"
          | "extraction_status"
          | "extraction_method"
          | "error_message"
        >;
        Update: Updatable<PapersRow>;
        Relationships: [];
      };
      paper_pages: {
        Row: PaperPagesRow;
        Insert: Insertable<PaperPagesRow, "char_count" | "ocr_confidence">;
        Update: Updatable<PaperPagesRow>;
        Relationships: [];
      };
      questions: {
        Row: QuestionsRow;
        Insert: Insertable<
          QuestionsRow,
          | "question_label"
          | "normalizer_version"
          | "marks"
          | "section"
          | "page_number"
          | "question_type"
          | "difficulty"
          | "confidence"
          | "status"
          | "reject_reason"
          | "group_id"
        >;
        Update: Updatable<QuestionsRow>;
        Relationships: [];
      };
      question_groups: {
        Row: QuestionGroupsRow;
        Insert: Insertable<
          QuestionGroupsRow,
          | "normalizer_version"
          | "occurrence_count"
          | "distinct_years"
          | "avg_marks"
          | "max_marks"
          | "first_year"
          | "last_year"
          | "year_span"
          | "topic_id"
          | "priority_score"
          | "priority_level"
          | "factors"
          | "priority_reason"
          | "reference_year"
          | "algo_version"
        >;
        Update: Updatable<QuestionGroupsRow>;
        Relationships: [];
      };
      similarity_clusters: {
        Row: SimilarityClustersRow;
        Insert: Insertable<
          SimilarityClustersRow,
          "representative_group_id" | "method" | "group_count" | "algo_version"
        >;
        Update: Updatable<SimilarityClustersRow>;
        Relationships: [];
      };
      cluster_members: {
        Row: ClusterMembersRow;
        Insert: Insertable<ClusterMembersRow, "is_seed">;
        Update: Updatable<ClusterMembersRow>;
        Relationships: [];
      };
      topics: {
        Row: TopicsRow;
        Insert: Insertable<TopicsRow, "ordinal" | "keywords" | "source">;
        Update: Updatable<TopicsRow>;
        Relationships: [];
      };
      folder_analytics: {
        Row: FolderAnalyticsRow;
        Insert: Insertable<
          FolderAnalyticsRow,
          "reference_year" | "algo_version"
        >;
        Update: Updatable<FolderAnalyticsRow>;
        Relationships: [];
      };
      question_corrections: {
        Row: QuestionCorrectionsRow;
        Insert: Insertable<QuestionCorrectionsRow, "old_value" | "new_value">;
        Update: Updatable<QuestionCorrectionsRow>;
        Relationships: [];
      };
      group_overrides: {
        Row: GroupOverridesRow;
        Insert: Insertable<
          GroupOverridesRow,
          "source_group_id" | "target_group_id" | "question_id"
        >;
        Update: Updatable<GroupOverridesRow>;
        Relationships: [];
      };
      share_links: {
        Row: ShareLinksRow;
        Insert: Insertable<ShareLinksRow, "revoked_at" | "expires_at">;
        Update: Updatable<ShareLinksRow>;
        Relationships: [];
      };
      processing_jobs: {
        Row: ProcessingJobsRow;
        Insert: Insertable<
          ProcessingJobsRow,
          | "payload"
          | "status"
          | "progress"
          | "attempts"
          | "max_attempts"
          | "locked_at"
          | "locked_by"
          | "last_error"
        >;
        Update: Updatable<ProcessingJobsRow>;
        Relationships: [];
      };
      llm_cache: {
        Row: LlmCacheRow;
        Insert: Insertable<
          LlmCacheRow,
          "prompt_version" | "tokens_in" | "tokens_out"
        >;
        Update: Updatable<LlmCacheRow>;
        Relationships: [];
      };
      llm_usage: {
        Row: LlmUsageRow;
        Insert: Insertable<
          LlmUsageRow,
          "usage_date" | "calls" | "tokens_in" | "tokens_out"
        >;
        Update: Updatable<LlmUsageRow>;
        Relationships: [];
      };
      generated_artifacts: {
        Row: GeneratedArtifactsRow;
        Insert: Insertable<GeneratedArtifactsRow>;
        Update: Updatable<GeneratedArtifactsRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
