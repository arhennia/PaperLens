# PaperLens Agent Working Guidelines

## Purpose

PaperLens is being re-architected as an existing product, not treated as a blank-slate demo. Preserve the product intent and required feature scope while replacing the current fragile implementation with a maintainable system.

The current repository may be incomplete or broken. The agent is allowed and expected to diagnose and repair broken code when needed. Do not preserve broken behavior merely because it already exists.

Do not silently add unrelated features, remove required features, or make major product decisions that are not documented.

## Product Definition

PaperLens lets students upload multiple years of past exam papers for a subject, automatically parse and organize them, identify repeated concepts, analyze topic weightage, generate study materials, and share a read-only analyzed workspace.

Three capabilities are core product differentiators and must not be deprioritized in favor of flashier AI features:

1. Deterministic, cached, cross-year analytics for repetition and weightage
2. Public read-only shared workspaces
3. Syllabus-versus-exam coverage gap analysis

The following is the target product scope. Treat missing items as work to implement, not as evidence that they should be removed:

### Organization

- Subject folders or exam hubs
- Batch multi-file PDF upload
- Automatic exam-year detection

### Processing

- Native PDF text extraction
- OCR fallback for scanned or image-based PDFs
- OCR typo correction and normalization
- Topic-wise question grouping
- Question labels, marks, and year tags
- Question type tagging: Numerical, Derivation, Diagram/Pipeline, Short Note
- Difficulty tagging: Easy, Medium, Hard
- Low-confidence extraction handling
- Original PDF page references for diagrams, code, and questionable OCR

### Analysis

- Repeat-frequency badges such as `Repeated 3x`
- Critical-topic indicators
- Topic weightage as a percentage of total marks
- Syllabus PDF versus exam-topic coverage gap analysis
- Deterministic, cached per-folder analysis results

### Study Tools

- Interactive high-yield checklists per topic
- Collapsible AI answer hints with math and code awareness
- Flashcard and active-recall mode
- AI-predicted mock paper generation based on frequency, recency, and mark distribution

### Sharing and Export

- Markdown and LaTeX copy/export
- Anki deck export
- Printable PDF study guide
- Public read-only shareable link per folder

### Authentication and Access

- Google authentication
- Email authentication
- Row-Level Security for all user-owned data
- Public share routes that work without login for valid share tokens
- Public views that expose only intentionally public fields

## Target Architecture

- Frontend: Next.js App Router, TypeScript, Tailwind CSS, and KaTeX for math rendering
- Database: Supabase Postgres
- Authentication: Supabase Auth with Google and email providers
- Authorization: Supabase Row-Level Security
- File storage: private Supabase Storage bucket, with paths such as `{user_id}/{folder_id}/{paper_id}.pdf`
- Heavy processing: separate Python FastAPI service
- PDF/OCR stack: PyMuPDF, Tesseract, and existing sound processing logic where appropriate
- AI/API orchestration: server-side only

The FastAPI service remains separate unless the owner explicitly approves a change. PyMuPDF and Tesseract are not assumed to have trustworthy Node replacements.

The browser must never call FastAPI directly and must never receive API keys. Next.js server code should authenticate and authorize requests before contacting FastAPI.

Long-running processing must not depend on an ephemeral in-process web request. Use a durable job or queue approach appropriate to the deployment environment. The client may observe job state through Supabase Realtime or a server-mediated status endpoint.

Repository layout and what belongs in each directory: see `DECISIONS.md` A.1.

## Working Rules

### Audit before destructive refactoring

Start by auditing the current repository and tracing load-bearing behavior before deleting or replacing it. The repository may contain broken code, incomplete migrations, dead code, or documentation that disagrees with runtime behavior. Verify facts instead of trusting the README or filenames.

The audit may include necessary repair work such as fixing a startup blocker, adding a missing diagnostic, or making a test runnable. Do not implement new product behavior or perform broad refactoring during the audit unless required to establish a reliable baseline.

Inventory every tracked source, configuration, documentation, migration, and test file. Exclude virtual environments, caches, generated artifacts, and dependency folders from detailed source inventory, but record their presence separately.

For each relevant file, record:

- Actual framework or runtime used
- Its role in the system
- Whether it touches SQLite, Supabase, local files, or external APIs
- Whether it is reusable processing logic, application code, test code, configuration, or likely dead weight
- Important dependencies and callers
- Known contradictions, runtime risks, or missing behavior

The audit must also verify, where possible:

- Frontend install, lint, and build status
- Backend imports and startup status
- Existing test behavior
- Actual API routes and request contracts
- Environment variables without exposing secret values
- Database connectivity and schema availability
- Local upload and background-processing behavior
- Git status and pre-existing uncommitted changes

Write the findings to `AUDIT.md`. Documentation files may be created or updated during the audit. Do not delete existing code based only on static inspection.

After `AUDIT.md` is complete, stop for explicit approval before beginning the planned re-architecture or deleting existing implementation, unless the owner has already granted approval in the current instruction.

### No silent conflict resolution

If the brief, current implementation, tests, or product decisions conflict, document the conflict and ask the owner when it changes scope, data meaning, security, or user-visible behavior.

Examples of conflicts that must be surfaced:

- README claims SQLite but runtime code uses Supabase stubs or a different database
- Existing behavior disagrees with the target product definition
- A feature in the target scope does not exist in the current repo
- Tests expect behavior that the product brief rejects
- A migration would destroy data or change question identity

The agent may repair objectively broken infrastructure, security defects, build failures, and incomplete wiring without waiting for product clarification when the intended behavior is unambiguous. Record the repair in `DECISIONS.md`.

## Required Phases

### Phase 0: Audit and baseline

Produce `AUDIT.md` using the process above. Establish what currently works, what is broken, what can be reused, and what must be replaced.

Do not make broad feature or architecture changes in this phase. Small diagnostic or baseline-repair edits are allowed when necessary to run the application or verify findings.

### Phase 1: Target structure and decisions

Before generating the new implementation, propose the full target structure, including:

- Next.js App Router layout
- Server and client component boundaries
- Authentication and authorization boundaries
- Supabase schema and migration layout
- Storage and upload flow
- FastAPI service structure
- Job/queue lifecycle
- Shared types or generated database types
- Test organization

Write the proposal and tradeoffs to `DECISIONS.md` or a dedicated structure document. Obtain approval before proceeding if the structure changes product behavior, security boundaries, or migration strategy.

### Phase 2: Supabase migration

Create versioned, idempotent SQL migrations for the approved schema. Include:

- Profiles
- Folders
- Shared links
- Papers
- Analysis sessions
- Raw or extracted questions
- Question groups
- Question occurrences
- Topics
- Rejected or low-confidence questions
- Syllabus and coverage data where required
- Cached analytics
- Generated study-tool data where required

Before writing migrations, define the canonical schema and explicitly map every retained, renamed, merged, or removed table from the old SQLite design.

Every user-data table must have an explicit ownership path to `auth.users`. Add and test RLS policies for select, insert, update, and delete operations.

Configure a private `exam-pdfs` storage bucket and storage policies for user-owned paths. Test storage policies separately from database table policies.

Use a narrowly scoped server-side service-role credential only where the worker must perform trusted processing. Never expose it to the browser.

Include a SQLite-to-Postgres migration or data-disposition plan, seed strategy, rollback considerations, and cache invalidation rules.

### Phase 3: FastAPI processing service

Keep and reuse sound logic for:

- PDF text extraction
- OCR fallback
- Year detection
- Question parsing
- Marks extraction
- OCR normalization
- Validation and confidence scoring
- Exact deduplication where appropriate
- Similarity grouping
- Topic classification
- Deterministic scoring

Refactor it into clear modules with explicit input/output contracts. Connect it to Supabase using `supabase-py` or an approved server-side data-access approach.

Validate Supabase JWTs or otherwise verify authenticated job ownership at the service boundary. Define how worker credentials differ from end-user credentials.

Preserve original paper and page references. Low-confidence OCR, diagrams, circuit drawings, handwritten annotations, and code blocks must not be silently presented as clean extracted text.

Reject or quarantine obvious non-exam PDFs instead of processing them as valid papers.

### Phase 4: Next.js frontend

Rebuild the frontend modularly while preserving the approved feature scope. Use appropriate server/client boundaries and keep secrets and privileged queries server-side.

Expected areas include:

- Authentication UI
- Sidebar and folder navigation
- Folder grid or exam hub
- Upload zone and year resolution
- Processing status view
- Topic accordions
- Analytics dashboard
- Syllabus coverage view
- High-yield checklist
- Flashcard mode
- Mock-paper view
- Answer-hint panel
- Share-link modal
- Public read-only route
- Export controls

Use KaTeX for math content and sanitize rendered content appropriately.

### Phase 5: Integration and security testing

Test the full workflow from upload through cached results and sharing. Include:

- Multiple PDFs and duplicate uploads
- Missing or conflicting year metadata
- Non-exam PDFs
- Shifted question numbering across years
- Low-confidence OCR
- Mixed-language content
- Diagrams, handwritten annotations, and code blocks
- New papers added to existing folders
- Cache invalidation and recomputation
- Large files and failed processing jobs
- Retry and idempotency behavior
- Authenticated access
- RLS isolation
- Storage isolation
- Revoked share links
- Public share access without login
- Public response field allowlisting
- Server-only API-key handling

Explicitly verify that User A cannot read, modify, or infer User B's folders, papers, questions, analysis results, or private fields.

Explicitly verify that a public share link exposes only its intended read-only projection and leaks no private notes, history, storage paths, credentials, or internal metadata.

## Decisions That Require Documentation

For every non-trivial architecture or implementation decision, append an entry to `DECISIONS.md` containing:

- Decision
- Context
- Reasoning
- Alternatives considered
- Rejected alternative and reason
- Consequences
- Follow-up or validation required

This includes database design, RLS design, storage paths, job processing, caching, deduplication, OCR confidence, LLM usage, public data projections, and migration choices.

## Do Not Guess on These Areas

### Question identity and deduplication

The current algorithm may use exact hashes and fuzzy similarity, but that is not automatically a trustworthy concept identity system. Do not select a final embedding, fuzzy, or human-confirmation model silently.

Document candidate algorithms, false-positive/false-negative risks, confidence thresholds, and user override requirements. Get approval before treating similarity output as ground truth.

### Correction and override workflows

Determine how users can correct OCR, merge or split questions, and override topic, type, difficulty, or marks. Do not present uncertain classification as final without an approved correction model.

### LLM cost and abuse control

Before implementing unrestricted answer hints or mock-paper generation, define caching, rate limiting, retry behavior, model selection, token limits, failure handling, and per-user or per-folder cost controls.

Per-folder deterministic analytics must be computed once and cached. They must be served to all authorized viewers without recomputation on every page load or viewer request.

## Delivery Requirements

- Do not commit changes unless explicitly requested.
- Do not delete or overwrite user changes.
- Keep application code, migrations, tests, and documentation changes reviewable.
- Run focused validation after every substantive edit.
- Do not claim a feature works without an executable check or clearly state that it remains unverified.
- Keep `AUDIT.md` and `DECISIONS.md` readable as standalone project-history documents.
- Preserve the decision and audit history in repository history.

## Definition of Done

The work is complete only when:

- Every approved feature in the product scope is implemented or explicitly marked blocked
- Existing load-bearing processing behavior is preserved or intentionally replaced with documented reasoning
- Supabase migrations are reproducible
- RLS and storage policies are tested, not merely present
- Cross-user access is prevented and verified
- Public sharing works while exposing only an approved read-only projection
- Long-running processing is durable and idempotent
- Per-folder analytics are cached and invalidated correctly
- Server-side API keys never reach client code
- Low-confidence and original-page fallback behavior is visible to users
- Integration tests cover the documented edge cases
- `AUDIT.md` explains the starting repository
- `DECISIONS.md` explains the resulting architecture and tradeoffs
