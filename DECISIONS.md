# PaperLens — Decision Record

Technical record of non-trivial decisions, per `AGENTS.md` §"Decisions That Require Documentation".
Plain-language companion: `WORK_BY_SWAYAM.md`. Starting-state analysis: `AUDIT.md`.

Approver for all entries: **Swayam** (sole approver).

---

## Phase 0 — Audit and baseline

No repairs were made during Phase 0. `AGENTS.md` §"No silent conflict resolution" requires
recording repairs here; there are none to record. The decisions below are all about *audit method*
and *deliberate restraint*, not about changing the product.

---

### D-001 — Verify the backend in a throwaway virtualenv created outside the repository

**Decision.** Create a disposable Python environment at `%TEMP%\paperlens-audit-venv`, install
`backend/requirements.txt` into it, and run all backend verification from there. Leave the
committed `backend/venv/` untouched.

**Context.** `backend/venv/` is tracked in git (2799 of 2837 tracked files). Its `pyvenv.cfg`
hardcodes `home = C:\Users\KIIT\AppData\Local\...` and was built for
`C:\Users\KIIT\Projects\PaperLens\backend\venv`. Virtualenvs are not relocatable, so invoking its
interpreter fails outright: `No Python at '"C:\Users\KIIT\...\python.exe'`. Separately, the
machine's system Python has `fastapi`, `uvicorn`, `fitz`, `PIL` and `pytest` but is missing
`pytesseract`, `rapidfuzz`, `supabase`, `python-jose` and `python-multipart` — enough to block
`import main` at `services/ocr_service.py`.

**Reasoning.** Establishing a reliable baseline requires the real dependency set — a stubbed import
graph proves nothing about startup or route registration. Installing into the committed venv would
have written thousands of files into tracked paths, making `git status` unreadable and risking
exactly the destructive mutation Phase 0 forbids. An external venv gives full fidelity at zero
cost to tracked state.

**Alternatives considered.**
1. Repair the committed venv in place (recreate it at `backend/venv/`).
2. Install the missing packages into the machine's system Python.
3. Stub the missing modules in memory and inspect the import graph without real dependencies.
4. Skip backend runtime verification and audit statically.

**Rejected alternatives and reasons.**
- (1) Rejected: writes into a tracked directory, produces an enormous phantom diff, and pre-empts
  the still-unapproved decision to remove the venv from version control (see D-004).
- (2) Rejected: mutates the developer's global environment as a side effect of an audit; not
  reversible without care, and not the agent's environment to change.
- (3) Attempted and rejected as insufficient. Stubbing `pytesseract` and `rapidfuzz` still failed
  at `python-multipart`, which FastAPI requires at decorator-evaluation time for `Form`/`File`
  parameters — so the app object could not be constructed. It also would have left the OCR and
  fuzzy-matching paths unverified while appearing verified.
- (4) Rejected: `AGENTS.md` §"Audit before destructive refactoring" requires verifying backend
  imports and startup, and explicitly warns against trusting documentation over runtime.

**Consequences.** Backend startup and the 8-route surface are confirmed against real dependencies
(`AUDIT.md` §3.2). The committed venv remains broken and tracked — a known, documented defect
(`AUDIT.md` §4.1) rather than a silently patched one. Resolved dependency versions are recorded in
`AUDIT.md` §4.9 as evidence that `requirements.txt` pins nothing.

**Follow-up / validation required.** Phase 1 must decide whether `backend/venv/` is removed from
version control (D-004) and whether `requirements.txt` gains version pins. The throwaway venv is
outside the repo and needs no cleanup commitment.

---

### D-002 — Verify request behaviour with FastAPI `TestClient`, in-process, rather than a live server

**Decision.** Exercise `POST /api/upload`, `POST /api/sessions` and `GET /api/sessions/{id}`
through `fastapi.testclient.TestClient` against the imported app object, generating PDF fixtures
in memory with PyMuPDF.

**Context.** The four existing integration tests all target a hardcoded `http://127.0.0.1:8000`
and depend on `sample_exam.pdf` / `scanned_exam.pdf`, which are absent from the repository and
permanently un-committable because `.gitignore` excludes `*.pdf`. The central open question was
whether the stubbed data layer causes silent data loss — which requires actually issuing requests.

**Reasoning.** `TestClient` executes the real ASGI app, real routing, real dependency resolution
and real `BackgroundTasks`, so it answers the persistence question with full fidelity. It needs no
port binding, no process lifecycle management, and no committed binary fixtures. Generating PDFs in
memory sidesteps the missing-fixture blocker entirely without adding files to the repo.

**Alternatives considered.**
1. Start `uvicorn` in the background and run the existing integration tests against it.
2. Create the missing PDF fixtures on disk and run the existing tests.
3. Reason about the stub statically and not issue requests at all.

**Rejected alternatives and reasons.**
- (1) Rejected as insufficient on its own: the tests would still fail at import (`AUDIT.md` §4.4)
  and at the missing fixtures, so a live server would not have produced a verdict without also
  editing test files — new work in a phase restricted to diagnostics.
- (2) Rejected: creates untracked binary artefacts that `.gitignore` guarantees cannot become part
  of the test suite, so the effort produces no durable value.
- (3) Rejected: `AGENTS.md` §Delivery Requirements forbids claiming behaviour without an executable
  check. The headline finding of this audit is too consequential to assert from reading code.

**Consequences.** Silent data loss is **proven**, not inferred: `POST /api/sessions` returns
HTTP 200 with a `sessionId`, writes the PDF to disk, and a subsequent `GET` of that exact id
returns 404; the background pipeline then raises
`TypeError: 'NoneType' object is not subscriptable` in `PriorityScoreService.run_scoring`
(`AUDIT.md` §1, §3.4). The stateless legacy route is confirmed genuinely working. One test upload
directory was created under `backend/uploads/` as a side effect and was removed (D-006).

**Follow-up / validation required.** Phase 1 test-organisation planning should adopt in-process
`TestClient` plus generated fixtures as the default pattern, replacing live-server integration
tests against absent binaries. Carry this into the §5.7 decision on retiring the existing suite.

---

### D-003 — Leave the test-suite `sys.path` bug unfixed

**Decision.** Diagnose the import failure, prove the affected tests pass once the path is correct
by setting `PYTHONPATH` at invocation time, and do **not** edit the test files.

**Context.** All six test files call
`sys.path.append(os.path.dirname(os.path.abspath(__file__)))`, which appends `backend/tests/`.
The `services` package lives at `backend/services/`, so every import fails with
`ModuleNotFoundError: No module named 'services'`. The fix is one line per file
(`dirname(dirname(...))`).

**Reasoning.** `AGENTS.md` §Phase 0 permits baseline repair "when necessary to run the application
or verify findings" — and setting `PYTHONPATH` externally achieved exactly that verification
without touching tracked files. Editing them would therefore have been unnecessary to the audit's
purpose. It would also likely have been wasted work: `AUDIT.md` §5.7 flags that all six tests
encode the current session-based architecture and probably get replaced, so repairing files headed
for deletion spends review budget for no lasting gain.

**Alternatives considered.**
1. Fix the one-line path bug in all six files now.
2. Add a `conftest.py` or `pytest.ini` at `backend/` to put the root on `sys.path` for all tests.
3. Leave the tests entirely unverified and report only that they fail to import.

**Rejected alternatives and reasons.**
- (1) Rejected: unnecessary for verification, and touches files whose fate is an open conflict.
  Deferred, not refused — recorded as a Phase 1 candidate.
- (2) Rejected: adding test infrastructure is new project structure, which `AGENTS.md` reserves for
  Phase 1 §"Test organization". Doing it inside the audit would pre-empt an approval gate.
- (3) Rejected: it would have left the actual quality of the parser and validator unknown, and
  their reusability is the single most important input to Phase 3.

**Consequences.** The path defect is documented with its exact cause and fix (`AUDIT.md` §4.4),
and the underlying logic is verified: `test_validation_layer.py` passes all five assertion groups,
and `test_hybrid_direct.py` runs and produces demonstrably correct parser output on deliberately
noisy input (`AUDIT.md` §3.3). This is what justifies classifying the parser and validator as
reuse-as-is assets. No tracked file was modified.

**Follow-up / validation required.** Resolve `AUDIT.md` §5.7 (replace vs port the suite). If any
existing test is retained, apply the one-line path fix and add proper test configuration in Phase 1.

---

### D-004 — Do not delete the committed virtualenv, dead code, or any other file

**Decision.** Report the committed venv, five dead code paths, and Vite scaffold leftovers as
findings. Delete nothing.

**Context.** `backend/venv/` is 98.7% of tracked files and is non-functional on this machine.
`perform_ocr_on_pdf()`, all six Supabase stub classes in `db_service.py`, `build_storage_path()`,
the `UPLOAD_DIR` environment variable, and several zero-byte frontend assets have no callers or
readers (`AUDIT.md` §4.10).

**Reasoning.** `AGENTS.md` §"Audit before destructive refactoring" states plainly: "Do not delete
existing code based only on static inspection." Zero callers in this repository is not proof of
zero value — the Supabase stub classes in particular read as a deliberate, if incomplete, handoff
scaffold for the very migration Phase 2 will perform, and are likely to inform that design rather
than be discarded. Removing 2799 tracked files is also a large, hard-to-review, history-affecting
change that belongs behind an explicit approval gate.

**Alternatives considered.**
1. Delete `backend/venv/` from tracking now and add it to `.gitignore` enforcement.
2. Delete the obviously-unreachable functions now.
3. Report and defer everything.

**Rejected alternatives and reasons.**
- (1) Rejected: destructive, high-blast-radius, and explicitly gated by the audit rules. It is also
  a judgement call about repository history that is the owner's to make.
- (2) Rejected: same rule, and the Supabase stubs are plausibly load-bearing for Phase 2 design
  even though they are unreachable at runtime today.

**Consequences.** The repository is left exactly as found, at the cost of remaining bloated and
carrying dead code into Phase 1. Every candidate for removal is inventoried with evidence, so the
deletion decision can be made quickly and deliberately rather than discovered mid-refactor.

**Follow-up / validation required.** Phase 1 should propose, for approval: removing
`backend/venv/` from version control; pinning `requirements.txt`; and a reviewed dead-code deletion
list. `AUDIT.md` §4.11 (real student exam PDFs recoverable from git history) additionally needs an
owner decision, since remediation means rewriting history.

---

### D-005 — Recover the deleted SQLite schema from git history into documentation, not into code

**Decision.** Extract the pre-stub schema from `3434752:backend/services/db_service.py` and record
its 9 tables and 5 indexes in `AUDIT.md` §6. Do not restore the file or reintroduce SQLite.

**Context.** Commit `887d5e2` ("Removing Stuff") replaced a working SQLite implementation —
including `init_db()` with 9 `CREATE TABLE` statements — with a no-op stub. No `.sql` file has ever
been committed in the repository's history, and no `CREATE TABLE` statement exists anywhere in the
working tree. `AGENTS.md` §Phase 2 requires explicitly mapping every retained, renamed, merged, or
removed table from the old SQLite design.

**Reasoning.** That mapping is impossible without the old schema, and the only surviving copy is in
git history — which is precisely the kind of fact `AGENTS.md` warns will not be discoverable from
filenames or the README. Capturing it in the audit makes it durable and reviewable. Restoring the
code, by contrast, would reintroduce an abandoned data layer and directly contradict the approved
Supabase Postgres target.

**Alternatives considered.**
1. Restore `db_service.py` to its pre-stub SQLite state to get a working baseline.
2. Reconstruct the intended schema from `README.md`'s documentation instead.
3. Leave the schema in history and look it up during Phase 2.

**Rejected alternatives and reasons.**
- (1) Rejected: contradicts the target architecture, and constitutes broad architectural change
  inside Phase 0. It would also make the audit's central finding harder to see, not easier.
- (2) Rejected: `README.md` is demonstrably unreliable (it documents 31 working features that are
  dead, and miscounts its own table list). Verified source beats documentation, per `AGENTS.md`.
- (3) Rejected: history is easy to lose track of across a rebuild, and the audit is meant to stand
  alone as a project-history document.

**Consequences.** Phase 2 has a verified starting schema to map from. One finding falls directly
out of the recovery and materially shapes Phase 2: **no old table has a `user_id` column**, so
there is no ownership path to `auth.users` anywhere in the prior design. Every RLS policy is new
construction rather than migration. Combined with the verification that nothing was ever persisted
(no `paperlens.db` on disk, no Supabase project configured), Phase 2 is a clean-slate schema design
with **no user data to migrate**.

**Follow-up / validation required.** Phase 2 must still produce the explicit old→new table mapping
and a data-disposition statement, even though the disposition is expected to be "no data exists".
Confirm the absence of a production Supabase project before relying on that conclusion.

---

### D-006 — Confirm path-traversal exposure by path arithmetic only, and remove all audit artefacts

**Decision.** Demonstrate the unsanitised-filename defect by evaluating `os.path.join` /
`normpath` on hostile filenames in isolation. Do not attempt a real traversal write. Delete the
two filesystem artefacts the audit produced.

**Context.** `main.py:143` joins attacker-controlled `file.filename` into an upload path, checking
only the `.pdf` suffix. Verification of `POST /api/sessions` (D-002) created
`backend/uploads/73810490-.../`. A mistargeted `npm install` — my error, run before I noticed the
shell's working directory had persisted into `backend/` — created a stray
`backend/package-lock.json`.

**Reasoning.** The path arithmetic alone is sufficient proof: `../../../../escaped.pdf` normalises
to `..\..\escaped.pdf`, outside the upload root. Actually writing a file outside the intended
directory would risk clobbering unrelated files on the developer's machine for no additional
evidentiary value. Separately, an audit that alters the tree it is auditing undermines its own
baseline, so artefacts had to go.

**Alternatives considered.**
1. Execute a real traversal write into a scratch location to prove exploitability end to end.
2. Leave the audit artefacts in place as evidence.

**Rejected alternatives and reasons.**
- (1) Rejected: writing outside a designated directory on the user's machine is a destructive act
  with no proportionate benefit; the vulnerability is already established from the path semantics.
  Note the limitation honestly: exploitability is demonstrated at the path level, not by a
  completed write.
- (2) Rejected: `AGENTS.md` §Delivery Requirements is explicit about not leaving stray changes, and
  the artefacts are reproducible on demand from the commands recorded in `AUDIT.md` §3.

**Consequences.** The traversal defect is documented as High severity with its exact mechanism and
the scope of what was and was not tested (`AUDIT.md` §4.6). `git status` at the end of Phase 0 is
byte-identical to its state at the start — the same five untracked entries (`.agents/`, `.claude/`,
`AGENTS.md`, `CLAUDE.md`, `skills-lock.json`), none created by this audit. `frontend/node_modules/`
exists on disk from the build verification but is git-ignored.

**Follow-up / validation required.** Phase 4 upload handling must derive storage paths from
server-generated identifiers (per the `{user_id}/{folder_id}/{paper_id}.pdf` convention) and never
from client-supplied filenames; the original filename should be stored as metadata only. Add an
explicit traversal-rejection test in Phase 5.

---

### D-007 — Use `AGENTS.md` as the scope baseline for gap analysis, treating `README.md` as an unverified claim

**Decision.** Measure the target-scope gap (`AUDIT.md` §7) against `AGENTS.md` §Product Definition,
and treat `README.md`'s feature claims as assertions to be tested rather than as specification.

**Context.** `README.md` marks 31 features "✅ Working", including multi-PDF session persistence,
clustering, topic classification, analytics caching and CSV export. Verification shows the entire
stateful subset of that list is non-functional. `frontend/README.md` similarly claims audit UI
views that do not exist in `App.jsx`. `AGENTS.md` §"Audit before destructive refactoring" directs
verifying facts instead of trusting the README or filenames.

**Reasoning.** Two documents disagree about what the product is and what works. Only one is
designated authoritative by the working rules, and only one survived contact with the runtime.
Anchoring gap analysis to the README would have produced a comfortable and wrong conclusion — that
the product is nearly complete — and would have hidden that roughly two-thirds of target scope is
absent.

**Alternatives considered.**
1. Treat `README.md` as the specification and audit against it.
2. Rewrite `README.md` during Phase 0 to match reality.
3. Audit against both and report two separate gap lists.

**Rejected alternatives and reasons.**
- (1) Rejected: contradicted by evidence and by the working rules.
- (2) Rejected: `README.md` is user-facing product documentation, and rewriting it encodes
  still-unapproved answers to the open conflicts in `AUDIT.md` §5 — most importantly
  `session` vs `folder`. Deferred to the end of the rebuild.
- (3) Rejected as noise: it would present a discredited baseline alongside the authoritative one as
  if the two were comparable.

**Consequences.** The gap analysis reflects the real target scope. This decision is **scoped to
audit methodology only** — the permanent question of whether `README.md` is rewritten and when is
raised as open conflict `AUDIT.md` §5.4 and awaits Swayam's approval. Six further conflicts are
surfaced rather than silently resolved, per `AGENTS.md` §"No silent conflict resolution": data
model (§5.1), frontend disposition (§5.2), question identity (§5.3), storage bucket name (§5.5),
institution-specific hardcoding (§5.6), and test-suite disposition (§5.7).

**Follow-up / validation required.** Swayam to resolve §5.1 and §5.3 before Phase 1 structure
design begins — both gate the schema. Remaining conflicts can be resolved during Phase 1.

---

## Phase 1 — Target structure and decisions

Status: **proposed, awaiting Swayam's approval.** Nothing in this section is implemented. No
migrations were written, no files deleted, no dependencies installed.

This section has two parts. **Part A** is the target structure: directories, routes, boundaries,
schema, environment. **Part B** is the numbered decision record for every judgement call, in the
format `AGENTS.md` §"Decisions That Require Documentation" requires.

Decisions that `AGENTS.md` §"Do Not Guess on These Areas" reserves for the owner are marked
**⚠ APPROVAL REQUIRED**. They are written as concrete recommendations with alternatives, not as
settled facts, and no Phase 2 work should begin on them until Swayam confirms.

---

# Part A — Target structure

## A.1 Repository layout

One Next.js application at the repository root, one Python service in `backend/`. Two runtimes,
two deployables, no shared build tooling.

```
paperlens/
├── app/                          # Next.js App Router: routes only
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── callback/route.ts      # OAuth code exchange
│   ├── (dashboard)/
│   │   ├── layout.tsx             # sidebar shell; auth-gated
│   │   ├── folders/page.tsx       # folder grid
│   │   └── folders/[folderId]/
│   │       ├── page.tsx           # overview + analytics
│   │       ├── upload/page.tsx
│   │       ├── questions/page.tsx
│   │       ├── coverage/page.tsx
│   │       ├── study/page.tsx
│   │       └── settings/page.tsx  # rename, share, delete
│   ├── share/[token]/page.tsx     # public, no login
│   ├── api/                       # server routes (see A.3)
│   ├── layout.tsx
│   └── page.tsx                   # marketing / redirect
│
├── components/
│   ├── ui/                        # button, dialog, badge, skeleton
│   ├── folders/  papers/  questions/  analytics/  study/  share/
│
├── lib/
│   ├── supabase/                  # client.ts, server.ts, admin.ts, middleware.ts
│   ├── auth.ts                    # session reading, route guards
│   ├── api/                       # typed fetchers; FastAPI client
│   └── utils/                     # format.ts, katex.ts, cn.ts
│
├── types/                         # database.generated.ts + hand-written shared types
│
├── supabase/
│   ├── migrations/                # numbered, idempotent SQL
│   ├── seed.sql
│   └── tests/                     # pgTAP: RLS and storage policy tests
│
├── backend/                       # FastAPI processing service
│   ├── main.py                    # app + routes only
│   ├── worker.py                  # durable job loop
│   ├── config.py
│   ├── extraction/                # pdf, ocr, parser, marks, validation
│   ├── analysis/                  # dedup, similarity, topics, scoring
│   ├── db/                        # supabase-py data access
│   ├── auth.py                    # verifies the internal service token
│   └── tests/
│
├── e2e/                           # Playwright: cross-user and share-link tests
├── public/
└── middleware.ts, next.config.ts, tailwind.config.ts, package.json, .env.example
```

### What belongs in each directory, and what does not

| Directory | Belongs | Does **not** belong |
|---|---|---|
| `app/` | Routes, layouts, `page.tsx`, route handlers, per-route loading/error states | Reusable components, business logic, DB queries written inline. A `page.tsx` composes and fetches; it does not implement. |
| `app/api/` | Server routes the browser calls: uploads, job triggers, LLM calls, share resolution | Anything the browser could call Supabase directly for under RLS. Do not proxy plain reads. |
| `components/` | Presentational and interactive UI, grouped by feature | Data fetching from the DB, secrets, direct FastAPI calls. Feature folders hold that feature's UI only; anything used by three or more features moves to `ui/`. |
| `components/ui/` | Generic primitives with no PaperLens domain knowledge | Anything naming a folder, paper, question, or topic. |
| `lib/` | Server/data/integration utilities: Supabase clients, typed fetchers, formatting | React components, JSX. No `lib/services/` or `lib/helpers/` grab-bags — if a file's name doesn't say what's inside, it's in the wrong place. `lib/utils/` is not an exception to that rule: every file in it is named for one purpose (`format.ts`, `katex.ts`, `cn.ts`), and anything with a more specific home belongs there instead, not here. |
| `types/` | The generated database types and types shared across features | Types used in one file (declare them locally). No re-export barrels. |
| `supabase/` | Migrations, seed, policy tests | Application code, TypeScript. |
| `backend/` | PDF/OCR/analysis, the job worker, its own data access | HTTP routes for the browser, user-session auth, anything the browser talks to directly. |
| `e2e/` | Cross-boundary tests that need a real browser and two real users | Unit tests (they live beside their code). |

Deliberately absent: `domain/`, `application/`, `infrastructure/`, `repositories/`, `factories/`,
`providers/`, `hooks/` as a top-level, `services/` on the Next.js side. None of them answers a
question this project has. See D-020.

## A.2 Server and client component boundaries

Server Components are the default. A component becomes `"use client"` only when it needs state,
effects, or event handlers.

| Server | Client |
|---|---|
| Folder grid, paper lists, question lists | Upload dropzone (drag state, progress) |
| Analytics dashboard shell and data fetch | Charts (Recharts needs the DOM) |
| Topic accordions, coverage view | Accordion open/closed state, filter controls |
| Public share page | Flashcard flip, checklist ticks |
| All Supabase reads for initial paint | Realtime job-status subscription |

Rule: fetch on the server, pass plain serialisable props down, keep interactivity in small leaf
clients. Charts receive computed arrays, never raw rows. KaTeX renders server-side where the
content is static; sanitise before render.

## A.3 Route structure

Pages are listed in A.1. Server routes:

| Route | Method | Purpose |
|---|---|---|
| `/auth/callback` | GET | OAuth code → session cookie |
| `/api/folders/[folderId]/upload` | POST | Issue signed upload URLs, insert `papers` rows, enqueue job |
| `/api/folders/[folderId]/analyze` | POST | Enqueue analysis; idempotent per fingerprint |
| `/api/folders/[folderId]/jobs/[jobId]` | GET | Job status (fallback when Realtime is unavailable) |
| `/api/questions/[questionId]/correction` | POST | Record a user correction |
| `/api/folders/[folderId]/share` | POST / DELETE | Create or revoke a share link |
| `/api/share/[token]` | GET | Resolve token → public projection |
| `/api/folders/[folderId]/hints/[groupId]` | POST | LLM answer hint, cached, rate-limited |
| `/api/folders/[folderId]/mock-paper` | POST | LLM mock paper, cached, rate-limited |
| `/api/folders/[folderId]/export/[format]` | GET | Markdown, LaTeX, Anki, PDF |

Plain authenticated reads do **not** get API routes — Server Components query Supabase directly
under RLS. An API route exists only where there is a secret, a privileged write, an external
service, or a projection to enforce.

## A.4 Supabase client structure

Four files in `lib/supabase/`, distinguished by who they act as:

| File | Key | Runs in | Use |
|---|---|---|---|
| `client.ts` | publishable | browser | Realtime subscriptions, user-scoped reads under RLS |
| `server.ts` | publishable + session cookie | Server Components, route handlers | All authenticated server reads/writes as the user |
| `admin.ts` | **secret / service-role** | route handlers only | Share-token resolution, job enqueue. Never imported into a Client Component. |
| `middleware.ts` | publishable | Next.js middleware | Session refresh |

`admin.ts` starts with a server-only guard so an accidental client import fails at build, not in
production. The service-role key is never referenced under a `NEXT_PUBLIC_` name.

## A.5 Authentication flow

Google and email, both via Supabase Auth.

1. `/login` posts to Supabase Auth (client) or redirects to Google.
2. Google returns to `/auth/callback`, which exchanges the code for a session and sets HTTP-only
   cookies.
3. `middleware.ts` refreshes the session on every request and redirects unauthenticated users away
   from `(dashboard)`.
4. `(dashboard)/layout.tsx` calls `getUser()` server-side and redirects if absent. Middleware is
   convenience; the layout check and RLS are the enforcement.
5. A database trigger inserts a `profiles` row on `auth.users` insert.
6. `share/[token]` is outside the dashboard group and never requires a session.

Three independent layers guard user data: middleware redirect, server-side session check, and RLS.
Only the third is authoritative.

## A.6 Database schema

17 tables. Every user-data table carries `user_id` referencing `auth.users`, so every policy is a
single indexed predicate (D-015).

**Ownership root**
- `profiles` — `id` → `auth.users(id)`, email, display name.
- `folders` — the subject hub. `user_id`, name, subject, exam metadata, `reference_year`,
  `syllabus_storage_path`. Carries `unique (id, user_id)` so children can enforce ownership by
  composite FK.

**Papers and extraction**
- `papers` — `folder_id`, `user_id`, `storage_path`, `original_filename`, `year`, `year_source`,
  `content_hash`, `page_count`, `extraction_status`, `extraction_method`, `error_message`.
- `paper_pages` — per page: `page_number`, `extraction_method` (`text`/`ocr`/`ocr_failed`),
  `char_count`, `ocr_confidence`. This is what makes OCR degradation visible instead of silent
  (D-013).
- `questions` — one row per extracted question, accepted or rejected. `paper_id`, `folder_id`,
  `user_id`, `question_label`, `label_path`, `text_extracted`, `text_normalized`,
  `normalized_hash`, `marks`, `section`, `page_number`, `question_type`, `difficulty`,
  `confidence`, `status` (`accepted`/`rejected`/`tombstoned`), `reject_reason`, `group_id`.

**Analysis**
- `question_groups` — the concept. `unique (folder_id, normalized_hash)` **is** its identity
  (D-011). Aggregates, `topic_id`, `priority_score`, `priority_level`, `factors` jsonb,
  `priority_reason`, `reference_year`, `algo_version`.
- `similarity_clusters` + `cluster_members` — advisory grouping over `question_groups`, with method,
  threshold, and per-member score. Never identity.
- `topics` — `folder_id`, name, ordinal, `keywords` jsonb, `source` (`syllabus`/`user`/`default`).
- `folder_analytics` — cached deterministic analytics: `folder_id`, `fingerprint`, `reference_year`,
  `algo_version`, `payload` jsonb, `computed_at` (D-014).

**User intent**
- `question_corrections` — append-only overlay: `question_id`, `field`, `old_value`, `new_value`.
  Extraction output is never edited in place (D-012).
- `group_overrides` — user merge/split of groups, so similarity output can be corrected (D-011).

**Delivery**
- `share_links` — `folder_id`, `token_hash`, `revoked_at`, `expires_at` (D-017).
- `jobs` — durable queue: type, `payload`, `status`, `attempts`, `locked_at`, `locked_by`,
  `idempotency_key` (D-018).
- `llm_cache` and `llm_usage` — response cache and per-user budget counters (D-023).
- `generated_artifacts` — flashcards, mock papers, checklists: `kind`, `payload`, `fingerprint`.

Two tables from the old design are deliberately merged away: `question_occurrences` (derivable from
`questions.group_id`) and `rejected_questions` (a `status` value). Full mapping in D-025.

## A.7 FastAPI service structure

```
backend/
├── main.py          # 3 routes: POST /internal/jobs/extract, /internal/jobs/analyze, GET /health
├── worker.py        # claim → process → release loop
├── auth.py          # verify internal service token; reject anything else
├── config.py        # env, pinned thresholds, algo_version
├── extraction/      pdf.py  ocr.py  parser.py  marks.py  validation.py  normalize.py
├── analysis/        dedup.py  similarity.py  topics.py  scoring.py  analytics.py
├── db/              client.py  papers.py  questions.py  groups.py  jobs.py
└── tests/
```

`extraction/` and `analysis/` are pure: text and dicts in, dicts out, no database imports. That is
what makes them testable without a database and is the single biggest structural change from
today's code, where `analysis_services.py` interleaves SQL with scoring. All persistence lives in
`db/`.

## A.8 Environment variables

| Variable | Where | Secret |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js, browser | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Next.js, browser | no |
| `SUPABASE_SECRET_KEY` | Next.js server only | **yes** |
| `PROCESSING_SERVICE_URL` | Next.js server | no |
| `PROCESSING_SERVICE_TOKEN` | Next.js server + FastAPI | **yes** |
| `LLM_API_KEY` | Next.js server only | **yes** |
| `LLM_MODEL`, `LLM_MAX_TOKENS`, `LLM_DAILY_TOKEN_BUDGET` | Next.js server | no |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | FastAPI | **yes** |
| `SUPABASE_STORAGE_BUCKET` = `exam-pdfs` | both | no |
| `TESSERACT_CMD` | FastAPI | no |

Rules: no secret ever carries a `NEXT_PUBLIC_` prefix; FastAPI receives no end-user credentials;
`UPLOAD_DIR` and `SUPABASE_JWT_SECRET` are retired (D-019).

## A.9 Testing structure

| Layer | Location | Runner | Covers |
|---|---|---|---|
| Extraction/analysis units | `backend/tests/` | pytest | Parser, marks, validation, dedup, scoring determinism. Pure functions, no DB. |
| FastAPI routes | `backend/tests/` | pytest + `TestClient` | Job routes, token rejection. In-process, fixtures generated in memory (D-002). |
| RLS and storage policies | `supabase/tests/` | pgTAP | Per-table select/insert/update/delete as two distinct users; storage paths. |
| Next.js units | beside source | Vitest | Formatting, projection allowlist, fingerprint computation. |
| End-to-end | `e2e/` | Playwright | Upload → analysis → cached results → share; cross-user isolation; revoked links. |

PDF fixtures are generated in memory by PyMuPDF, never committed — `.gitignore` excludes `*.pdf`
and that stays (D-022).

---

# Part B — Decision record

Phase 0 used D-001 to D-007. Phase 1 continues at D-008.

---

### D-008 — Next.js at the repository root, FastAPI stays a separate service in `backend/`

**Decision.** Put the Next.js app at the repository root (`app/`, `components/`, `lib/`, `types/`)
and keep the Python service in `backend/`. Two deployables, no shared build tooling, no monorepo tool.

**Context.** Today `frontend/` is a Vite SPA and `backend/` is FastAPI. `AGENTS.md` §Target
Architecture requires the FastAPI service stay separate and states PyMuPDF and Tesseract have no
trustworthy Node replacements.

**Reasoning.** Root-level Next.js is what every Next.js tutorial, deployment guide, and hosting
default assumes — a beginner searching for help finds answers that match the tree in front of them.
The two runtimes share no code and no types worth generating across the boundary, so a monorepo tool
would add configuration without removing duplication.

**Alternatives considered.** (1) Keep Next.js in `frontend/`. (2) pnpm/Turborepo monorepo with
`apps/web` + `apps/api`. (3) Port PDF/OCR to Node and drop Python.

**Rejected alternatives and reasons.** (1) Rejected: every Next.js convention assumes root, so a
nested app means fighting defaults for no gain. (2) Rejected: monorepo tooling pays off when packages
share code; these two share nothing but an HTTP contract. (3) Rejected: contradicts `AGENTS.md`, and
discards the repository's strongest verified asset.

**Consequences.** `frontend/` disappears as a directory (D-009). Two deploy targets to configure.
Python and TypeScript dependency sets stay fully independent.

**Follow-up / validation required.** Confirm the hosting plan can run both. Decide whether FastAPI
deploys as a web service plus worker, or one process running both (D-018).

---

### D-009 — Replace the Vite frontend entirely rather than porting it

**Decision.** Rebuild the UI as Next.js App Router + TypeScript. Retire `frontend/` wholesale. Keep
`App.jsx` readable in git history as a UX reference; delete it from the working tree in Phase 4, not
now.

**Context.** Resolves `AUDIT.md` §5.2. `frontend/src/App.jsx` is 1498 lines in a single component,
builds successfully, fails lint with 2 errors, and calls FastAPI directly from the browser
(`App.jsx:27,164,191,232,261,267` — verified). It is built around `sessions`, not folders, and has no
type layer.

**Reasoning.** The target and the current implementation share no routing model, no server/client
boundary, no type system, and no data model. Direct browser→FastAPI calls are precisely the boundary
`AGENTS.md` forbids, so every fetch call would need rewriting regardless. Porting one 1498-line
component into ~30 server and client components is a rewrite whichever word is used for it; calling it
a port would only obscure the scope.

**Alternatives considered.** (1) Incremental port, screen by screen, running both frontends.
(2) Copy `App.jsx` into a Next.js client component and split later. (3) Keep Vite, add a Node BFF.

**Rejected alternatives and reasons.** (1) Rejected: needs two auth integrations and two API clients
alive at once, which is more total work than the rebuild. (2) Rejected: one giant `"use client"`
component forfeits Server Components, the main reason to adopt App Router, and "split it later"
reliably does not happen. (3) Rejected: adds a third runtime to avoid rewriting a frontend that must
be rewritten anyway.

**Consequences.** Phase 4 is a full build, not a migration. The visual design and interaction ideas in
`App.jsx` and `docs/paperlens-milestone4-blueprint.html` remain the starting reference. The two lint
errors become moot and are not worth fixing (`AUDIT.md` §3.1).

**Follow-up / validation required.** Before deleting, inventory the UX decisions worth keeping —
filter set, progress display, dashboard layout. Deletion happens in Phase 4 with Swayam's approval.

---

### D-010 — ⚠ APPROVAL REQUIRED — A folder is the durable hub; `analysis_sessions` is retired and split into `jobs` + `folder_analytics`

**Decision.** Model the subject folder as the long-lived owner of papers, questions, topics, and
cached analytics. Papers are added over time. Do not carry `analysis_sessions` forward: its two real
responsibilities split into `jobs` (one durable row per processing run) and `folder_analytics` (one
cached deterministic result per folder).

**Context.** Resolves `AUDIT.md` §5.1, which gates the whole schema. Today every table keys on
`session_id`, every route is `/api/sessions/...`, and analytics cache on
`analysis_sessions.analytics_json` (verified at `batch_processor.py:462`). `AGENTS.md` requires
folders that papers are added to over time, with per-folder cached analytics.

**Reasoning.** Session and folder are not two names for one thing: a session is a batch analysed once,
a folder accumulates papers and is re-analysed. Keeping both would leave two plausible parents for
`papers` and two places analytics could live, and a new teammate would have to guess. Splitting by
responsibility is clearer than renaming: run *history* is a queue concern, cached *results* are a
folder attribute.

**Alternatives considered.** (1) Rename `analysis_sessions` → `folders`. (2) Keep both: folders own
papers, sessions record each analysis run. (3) Keep sessions as the only model, treat folders as UI
grouping.

**Rejected alternatives and reasons.** (1) Rejected: a rename leaves per-run fields (`status`,
`error_message`) on a durable entity, so "folder status" becomes ambiguous once a folder has been
analysed five times. (2) Rejected as the closest call — it is a legitimate design, and if Swayam wants
a visible per-run audit trail it is the right one. Rejected for now because `jobs` already records
exactly that (type, status, attempts, timestamps), so a parallel `analysis_sessions` table would
duplicate the queue. (3) Rejected: contradicts `AGENTS.md`, and per-folder cached analytics have
nowhere to live.

**Consequences.** Every table keys on `folder_id`, not `session_id`. Routes become
`/folders/[folderId]/...`. Analytics move from a JSON column on the run to a fingerprinted cache row
per folder (D-014). Adding papers to an existing folder becomes a first-class flow rather than a new
batch. The old `user_context` table collapses into columns on `folders`.

**Follow-up / validation required.** **Swayam must confirm before Phase 2.** Specifically: is a
visible per-run history ("analysed 3 times, here is each run") a product requirement? If yes,
alternative (2) is correct and `jobs` gains a user-facing projection instead.

---

### D-011 — ⚠ APPROVAL REQUIRED — Question and group identity is content-addressed, never positional; similarity never changes identity

**Decision.** Derive identity from normalized content, not position or a counter.

- `question_groups` identity: `unique (folder_id, normalized_hash)`, where `normalized_hash` is
  SHA-256 of normalized question text. A surrogate `uuid` primary key carries foreign keys.
- `questions` identity: `unique (paper_id, label_path, normalized_hash)`. No counter.
- Store `normalizer_version` and `algo_version` on every derived row.
- **Similarity clustering is advisory only.** It may group, badge, and rank; it may never merge two
  `question_groups` into one identity.

**Context.** Resolves `AUDIT.md` §5.3; `AGENTS.md` §"Do Not Guess" reserves this decision. Verified
against source, and worse than the audit reported: the main path mints
`rq_{paper_id}_{accepted_count}_{md5[:8]}` (`batch_processor.py:272`) which embeds a counter, while
the duplicate-copy branch mints `rq_{paper_id}_{md5[:8]}` (`batch_processor.py:145`) with no counter —
so the *same paper* produces different question IDs depending on which branch runs. Group IDs are
`g_{session_id}_{idx}`, positional by dict iteration order (`analysis_services.py:137`).

**Reasoning.** Identity must survive re-analysis, because corrections, share links, and flashcards all
point at it. A counter guarantees it will not. Content addressing makes re-extraction of unchanged
text a no-op: the same paper yields the same hashes, so re-running is idempotent by construction
rather than by careful bookkeeping.

The critical separation is that **identity is deterministic and grouping is fuzzy**. If similarity
could rewrite identity, then tuning the threshold later would silently detach every user correction
attached to a group. Keeping fuzzy output in `cluster_members` with a score column means the algorithm
can be tuned, or replaced with embeddings, without touching a single identity.

The real weakness of content addressing is that changing the normalizer changes every hash. That is
why `normalizer_version` is stored: a normalizer change becomes an explicit, migrated, reviewable
event rather than silent drift.

**Alternatives considered.** (1) Keep positional IDs, add a stable alias table. (2) Embedding-based
identity with a vector index. (3) Fuzzy-match identity: cluster first, treat the cluster as identity.
(4) Human-confirmed identity: user approves every merge.

**Rejected alternatives and reasons.** (1) Rejected: keeps the instability and adds indirection to
hide it. (2) Rejected: identity would depend on a model version and an approximate-nearest-neighbour
threshold, so upgrading the model would silently re-identify content — and `AGENTS.md` forbids
selecting an embedding model silently. Viable later as an *additional* advisory grouping signal.
(3) Rejected: this is the trap the decision exists to avoid — it makes ground truth depend on a 0.84
threshold that has never been validated (D-024). (4) Rejected as the default: too much friction for a
study tool. Retained as the *override* path (D-012), which is the right place for human input.

**Consequences.** Re-analysis is idempotent and cheap. Corrections and share links survive
re-processing. Two genuinely different questions whose normalized text collides would merge — a false
positive whose likelihood depends entirely on how aggressive normalization is, which needs
measurement. Changing the normalizer requires a migration that recomputes hashes and remaps
corrections.

**Follow-up / validation required.** **Swayam must approve before Phase 2.** Then in Phase 3: measure
collision behaviour on real papers across at least 3 years, and confirm current normalization
(`clean_and_normalize_text`, `analysis_services.py:39`, which lowercases and strips all punctuation)
is not so aggressive that distinct questions collide — stripping punctuation entirely means
`f(x) = x^2` and `f(x) = x2` normalize identically, which may be desirable or may not.

---

### D-012 — ⚠ APPROVAL REQUIRED — User corrections are an append-only overlay; extraction output is never edited in place

**Decision.** Store corrections in `question_corrections` (`question_id`, `field`, `old_value`,
`new_value`, `created_at`) and `group_overrides` (user merge/split of groups). Reads apply the newest
correction per field over the extracted value. Never `UPDATE` extracted text, marks, type, difficulty,
or topic in place. Correctable: OCR text, marks, question type, difficulty, topic, group membership.

**Context.** `AGENTS.md` §"Correction and override workflows" requires deciding this and forbids
presenting uncertain classification as final. Today nothing is correctable: `question_type` is
`"long" if marks >= 10 else "short"` (`batch_processor.py:280`), difficulty does not exist, and topic
classification falls back to hardcoded Operating-Systems chapters (`analysis_services.py:290`).

**Reasoning.** Re-analysis must be free to recompute everything derived from a PDF; if a user's fix
lives in the same column, the next run destroys it. An overlay makes the precedence rule explicit and
one-directional: extraction proposes, the user decides, and re-extraction cannot overwrite a decision.
Append-only additionally gives an audit trail, a trivial undo, and the ability to answer "did the
parser get this right, or did a human fix it?" — exactly the feedback needed to improve the parser.

**Alternatives considered.** (1) Edit extracted rows in place, set a `user_edited` flag, skip those
rows on re-analysis. (2) Store corrections as a jsonb blob on `questions`. (3) No corrections; improve
the parser instead.

**Rejected alternatives and reasons.** (1) Rejected: every re-analysis path must then remember to
check the flag, and one forgotten check silently destroys user data. Losing a correction is
unrecoverable, so the safe default belongs in the schema, not in the discipline of every future query.
(2) Rejected: no history, no per-field timestamps, and jsonb is harder to query for "which fields do
users correct most". (3) Rejected: contradicts `AGENTS.md`, and OCR on scanned papers will never be
perfect enough.

**Consequences.** Reads need a resolution step (a view, or a join in `lib/`) — a real cost, paid once.
`folder_analytics` must invalidate when a correction lands, since corrections change marks and topics
(D-014). Corrections are keyed on question identity, which is why D-011 must hold.

**Follow-up / validation required.** **Swayam to confirm the correctable field list**, and whether
corrections on a shared folder are visible to public viewers. Merge/split UX needs design in Phase 4.

---

### D-013 — OCR degradation and page provenance become visible data, not silent fallbacks

**Decision.** Add `paper_pages` (one row per page: `page_number`, `extraction_method`, `char_count`,
`ocr_confidence`), recording `text`, `ocr`, or `ocr_failed` per page. Propagate real page numbers onto
every question, and surface low confidence and OCR failure in the UI with a link to the original PDF
page.

**Context.** `AGENTS.md` §Phase 3 forbids silently presenting low-confidence OCR as clean text and
requires original page references. Two verified defects block this. `pdf_service.py:42-45` catches
bare `Exception` and substitutes whatever sparse text PyMuPDF found, telling nobody (`AUDIT.md` §4.3).
And `page_number` is inserted as the literal `1` for every question
(`batch_processor.py:260,280`).

**Reasoning.** Both are trust defects rather than cosmetic bugs: a fabricated page reference is worse
than a missing one, because a student turns to page 1 and concludes the tool is broken. Per-page rows
are the natural grain — extraction method genuinely varies page to page, which is why
`pdf_service.py` already computes a `hybrid` method.

On cost: the audit reports page numbers are unrecoverable because the parser "flattens page markers
and never propagates real page numbers." **That diagnosis is wrong, and the fix is much cheaper than
it implies.** `pdf_service.py:36,47` injects `--- Page N ---` markers into the text stream, and the
noise filter that strips page furniture anchors on `^\s*Page`
(`question_extraction_service.py:156`), so `--- Page 1 ---` does not match and passes through
untouched. Verified by running that regex against the actual marker strings. The markers reach the
parser loop intact — `ExamParser.parse` simply never reads them. Propagating real page numbers means
tracking a counter in the existing line loop, not restructuring extraction.

**Alternatives considered.** (1) Store extraction method per paper only. (2) Drop page references
entirely. (3) Re-architect extraction to return structured per-page objects.

**Rejected alternatives and reasons.** (1) Rejected: loses which page was OCR'd, so the UI cannot flag
the specific questionable question. (2) Rejected: `AGENTS.md` requires them for diagrams and code.
(3) Rejected as unnecessary given the finding above — the markers already carry the information.

**Consequences.** One new table, and a `page_number` that means something. OCR failure becomes a
visible per-page state, so a scanned paper that fails OCR reports honestly instead of yielding
near-empty questions. The bare `except` in `pdf_service.py` must record `ocr_failed` rather than
swallow.

**Follow-up / validation required.** Tesseract is absent from this machine, so every OCR path remains
**unverified**, not disproven (`AUDIT.md` §4.3). Phase 3 must install Tesseract and verify on a
genuinely scanned PDF. Confidence thresholds for the "questionable extraction" badge need tuning
against real papers.

---

### D-014 — Deterministic analytics: pin a reference year, sort before clustering, invalidate by content fingerprint

**Decision.** Make analysis a pure function of stored inputs.

- Store `reference_year` on `folders`; scoring reads it instead of the clock.
- Sort inputs by a stable key before any greedy grouping.
- Store `algo_version` on every derived row.
- Cache in `folder_analytics` keyed by `fingerprint` = hash of (sorted paper content hashes, sorted
  correction ids, `reference_year`, `algo_version`, thresholds).
- Serve the cache to all authorized viewers, including public share viewers. Recompute only when the
  fingerprint changes.

**Context.** `AGENTS.md` names deterministic cached analytics as differentiator #1 and requires
analytics computed once and served without per-viewer recomputation.

**Reasoning.** Determinism has two independent enemies here and the audit found only one. `AUDIT.md`
§4.8 correctly identifies `datetime.now().year` (`analysis_services.py:362`) driving a
20-points-per-year recency decay (`:421`). But clustering is also **order-dependent**:
`run_clustering` pops seeds off an unordered result set (`unclustered.pop(0)`,
`analysis_services.py:216-233`) and greedily attaches everything above threshold to whichever seed it
reached first. Postgres does not guarantee row order, so cluster membership — and therefore the
`f_cluster` factor, and therefore every priority score — can vary between two runs over identical
data. **Pinning the year alone would not make analytics deterministic**, and would produce a
convincing but false claim of determinism.

Fingerprint-based invalidation is preferred over event-based because it is self-correcting: if a code
path forgets to invalidate, the fingerprint still differs and the cache still misses. An event-based
scheme fails silently in exactly the case that matters — serving stale analytics after new papers
arrive.

**Alternatives considered.** (1) Timestamp invalidation (`updated_at` newer than `computed_at`).
(2) Explicit invalidation calls at each mutation site. (3) Recompute per request, no caching.

**Rejected alternatives and reasons.** (1) Rejected: cannot distinguish a change that affects
analytics from one that does not, so it over-invalidates and re-runs the pipeline on a folder rename.
(2) Rejected: correctness depends on never forgetting a call site, and the failure mode is silent
stale data. (3) Rejected: contradicts `AGENTS.md`, and would run the whole pipeline per page load.

**Consequences.** Same inputs always yield the same scores, so results are reproducible and testable.
`reference_year` must be set at folder creation — defaulting to the latest paper year is the natural
rule, and it must be stored, not inferred at read time. Fingerprint computation needs one well-tested
function; a bug there causes either stale results or thrashing recomputation.

**Follow-up / validation required.** Phase 3 must add a determinism test: run the pipeline twice over
identical input and assert byte-identical scores, then run with rows shuffled and assert the same.
Confirm with Swayam whether `reference_year` is user-visible and editable.

---

### D-015 — ⚠ APPROVAL REQUIRED — RLS: denormalize `user_id` onto every user table; no `anon` policies anywhere

**Decision.** Every user-data table carries its own `user_id uuid not null references auth.users(id)`,
and every policy is one indexed predicate:

```sql
alter table papers enable row level security;

create policy papers_select on papers for select
  to authenticated using ((select auth.uid()) = user_id);

create policy papers_update on papers for update
  to authenticated using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);
```

Four rules hold across the schema:

1. `select auth.uid()` is wrapped in a subquery so it evaluates once per query, not once per row.
2. Every policy names `to authenticated`. Role alone is never the check — an ownership predicate is
   always present.
3. `update` policies always carry **both** `using` and `with check`, so a row's `user_id` cannot be
   reassigned to another user.
4. `create index ... on <table> (user_id)` on every table, since the predicate is only cheap if indexed.

Child ownership is additionally enforced structurally: `folders` declares `unique (id, user_id)` and
children declare `foreign key (folder_id, user_id) references folders(id, user_id)`. A paper therefore
*cannot* reference a folder belonging to a different user, even if application code is wrong.

**The `anon` role gets no policies on any user table.** Public sharing is served exclusively by a
server route using the secret key, which applies an explicit field allowlist (D-017).

**Context.** `AGENTS.md` §Phase 2 requires an explicit ownership path to `auth.users` for every
user-data table. The recovered old schema has **no `user_id` column on any table** (`AUDIT.md` §6), so
all of this is new construction. Verified: `grep` for auth/user concepts in `main.py` returns nothing.

**Reasoning.** The alternative to denormalizing is joining up the parent chain inside each policy —
`questions` → `papers` → `folders` → `user_id`. That makes the deepest tables' policies the most
expensive, on the largest tables, in the hottest read path. Denormalizing trades a little redundancy
for policies that are uniform and indexed everywhere, and uniform policies are also *reviewable*: a
security reviewer can confirm 17 tables at a glance instead of tracing 17 different join paths. The
composite foreign key is what makes the redundancy safe — it is impossible for `papers.user_id` to
disagree with its folder's owner, so the denormalized column cannot drift.

Refusing `anon` table policies is the single highest-leverage sharing decision. A public policy like
`using (folder_id in (select folder_id from share_links where ...))` grants the `anon` role read access
to a *table*, and every future column added to that table is exposed by default. An allowlisted
projection fails the other way: a new column is invisible until someone deliberately adds it.

**Alternatives considered.** (1) Join to the parent chain in each policy; no denormalized `user_id`.
(2) `security definer` helper functions for ownership checks. (3) Denormalize `user_id` but skip the
composite FK. (4) Grant `anon` select policies gated on a valid share token.

**Rejected alternatives and reasons.** (1) Rejected: worst performance exactly where the rows are most
numerous, and 17 distinct join paths to audit. (2) Rejected: `security definer` bypasses RLS by design
and any mistake silently removes access control; unnecessary when a plain indexed column works. Not
needed here because there is no team/shared-ownership model. (3) Rejected: without the composite FK,
`papers.user_id` could disagree with `folders.user_id`, and the denormalized column would become a
second source of truth that can drift. (4) Rejected: table-level exposure with default-open behaviour
for future columns; `AGENTS.md` §Phase 5 requires verifying that shares leak no private fields, and an
allowlist is testable while a policy over a widening table is not.

**Consequences.** Writes must set `user_id`, which the server does from the session, never from client
input. 17 tables × 4 operations of policy to write and test. Public sharing depends on one server route
being correct, which concentrates the risk in one reviewable, testable place. Any view added later must
use `with (security_invoker = true)`, since views bypass RLS by default.

**Follow-up / validation required.** **Swayam to approve the no-`anon`-policy model**, because it makes
public sharing depend on a service-role route rather than on RLS. Phase 2 must add pgTAP tests
asserting, per table, that user A sees zero of user B's rows for select/insert/update/delete — presence
of a policy is not evidence it works.

---

### D-016 — Storage: one private bucket, server-generated paths, ownership enforced by path prefix

**Decision.** One private bucket `exam-pdfs`. Paths are server-generated only:

```
{user_id}/{folder_id}/{paper_id}.pdf          exam papers
{user_id}/{folder_id}/syllabus.pdf            syllabus
```

The original filename is stored as metadata in `papers.original_filename` and never used to build a
path. Uploads use short-lived signed upload URLs issued by a server route after it verifies folder
ownership; downloads use short-lived signed URLs. The bucket is never public. Storage policies gate on
the first path segment:

```sql
create policy exam_pdfs_select on storage.objects for select
  to authenticated
  using (bucket_id = 'exam-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

`insert`, `update`, and `select` policies are all created, because Supabase upsert silently fails with
`insert` alone.

**Context.** `AGENTS.md` specifies a private bucket and that exact path shape. `AUDIT.md` §5.5 flags a
naming conflict: `.env.example:7` says `exam-papers`, `AGENTS.md` says `exam-pdfs`. Verified: the dead
`build_storage_path()` in `db_service.py:48-56` already implements this exact convention — prior intent
that agrees with the target.

**Reasoning.** Putting `user_id` first makes ownership a prefix check, which is the only storage
predicate Supabase can evaluate cheaply, and it reads unambiguously in the dashboard. Server-generated
paths are also the fix for the verified path-traversal defect: `main.py:143` joins attacker-controlled
`file.filename` into a filesystem path, and `../../../../escaped.pdf` normalises outside the upload root
(`AUDIT.md` §4.6, D-006). Deriving the path from a server-side UUID makes the entire class of attack
unreachable rather than filtered — there is no user input in the path to sanitise.

Signed upload URLs keep large PDFs off the Next.js server: the browser uploads straight to Storage, but
only after the server has authorized it and chosen the path.

**Alternatives considered.** (1) Keep `exam-papers` from `.env.example`. (2) Public bucket with
unguessable paths. (3) Proxy every upload and download through Next.js. (4) Path `{folder_id}/{paper_id}.pdf`
without the user prefix.

**Rejected alternatives and reasons.** (1) Rejected: `AGENTS.md` is the product authority per D-007, so
`exam-pdfs` wins and `.env.example` is corrected. Trivial, but it lands in migrations and policies, so
it is settled here once. (2) Rejected: security by obscurity, and a leaked URL is permanent. Also
`AGENTS.md` requires a private bucket. (3) Rejected for uploads: needlessly routes large files through
the app server and risks request-size limits. Retained for *downloads of public share pages*, where the
server must mediate anyway. (4) Rejected: ownership then requires a database lookup per object instead
of a prefix comparison.

**Consequences.** `.env.example` must change `exam-papers` → `exam-pdfs`. The local `uploads/`
directory and the `UPLOAD_DIR` variable disappear (D-019). Storage policies must be tested separately
from table policies, as `AGENTS.md` §Phase 2 requires. Public share pages need server-mediated PDF page
access, since anon users cannot hold signed URLs to a private bucket.

**Follow-up / validation required.** Phase 2 must test that user A cannot read, upload to, or overwrite
a path under user B's prefix. Decide signed-URL TTL (60 minutes is the working default). Decide whether
public share viewers may view original PDF pages at all, which affects D-017's projection.

---

### D-017 — ⚠ APPROVAL REQUIRED — Share links store a token hash; the public projection is an explicit server-side allowlist

**Decision.** `share_links` stores `token_hash` (SHA-256 of a 32-byte random token), never the token
itself. The raw token appears once, in the URL handed to the owner. `/api/share/[token]` hashes the
incoming token, looks up a row that is not revoked and not expired, and returns a hand-built object
containing only:

- folder name and subject
- exam years covered
- question groups: canonical text, marks, repeat count, topic name, priority level and badge
- topic weightage percentages and cached analytics payload
- syllabus coverage gaps

Explicitly excluded: `user_id`, `profiles` in any form, `storage_path`, signed URLs, `original_filename`,
`error_message`, `jobs` rows, `question_corrections` history, `llm_usage`, `token_hash`,
`normalized_hash`, `confidence` scores, rejected questions, and every `created_at`/`updated_at`.

The route is the only reader, using the secret key. No `anon` RLS policy exists on any user table
(D-015). Revocation sets `revoked_at`, which takes effect on the next request; links are not deleted, so
revocation is auditable.

**Context.** `AGENTS.md` names public read-only shared workspaces as differentiator #2, and §Phase 5
requires verifying a share link leaks no private notes, history, storage paths, credentials, or internal
metadata. Nothing exists today: `grep` finds no share concept in runtime code (`AUDIT.md` §7).

**Reasoning.** Hashing the token means a database read — a leaked backup, an over-broad support query, a
future logging mistake — does not yield working share links. The cost is that tokens cannot be listed
back to the owner in plaintext, which is acceptable: the owner copies the link at creation, and losing it
means rotating rather than recovering.

Building the projection by hand in one route, rather than selecting from a table, inverts the default
failure mode. With a view or an `anon` policy, a column added in six months is exposed until someone
notices. With an allowlist, it is hidden until someone deliberately adds it. For the one boundary in this
product where a mistake is publicly visible and irreversible, default-closed is worth the manual
maintenance. It is also directly testable: one test asserts the response's key set equals the expected
set, and it fails the moment a field leaks.

`confidence` and `normalized_hash` are excluded deliberately even though they seem harmless. Confidence
scores expose extraction quality the owner may not want published, and hashes let a viewer confirm
whether a specific question text exists in a private folder.

**Alternatives considered.** (1) Store the raw token with a unique index. (2) A Postgres view with
`security_invoker` and an `anon` select policy. (3) Signed JWT share links with no database row.
(4) Return the internal question shape and strip fields in the UI.

**Rejected alternatives and reasons.** (1) Rejected: a database leak hands over live share links, and
the only thing gained is showing the owner an old link. (2) Rejected: exposes table shape to `anon` and
inherits every future column, which is exactly the failure `AGENTS.md` §Phase 5 tests for. (3) Rejected:
revocation requires either short expiry or a denylist, which reintroduces the table with worse
ergonomics. (4) Rejected: private data would already be over the wire — stripping in the UI is not a
security boundary at all.

**Consequences.** One route handler is the entire public attack surface, and it must be reviewed
carefully. Adding a field to the public view is a deliberate code change. Public viewers read cached
analytics (D-014) and never trigger recomputation. If public viewers should see original PDF pages, that
needs a separate server-mediated, token-scoped endpoint — not a signed URL.

**Follow-up / validation required.** **Swayam to confirm the field list above**, in particular: should
public viewers see per-question confidence or OCR warnings? Should they see the original PDF pages? Are
user corrections visible publicly (interacts with D-012)? Phase 5 must test the response key set exactly,
plus revoked and expired tokens.

---

### D-018 — Durable jobs: a Postgres `jobs` table claimed with `for update skip locked`

**Decision.** Replace `BackgroundTasks` with a `jobs` table and a worker loop in the FastAPI service.
Rows carry `type`, `payload` jsonb, `status` (`queued`/`running`/`succeeded`/`failed`), `attempts`,
`max_attempts`, `idempotency_key` (unique), `locked_at`, `locked_by`, `last_error`. The worker claims
work atomically:

```sql
update jobs set status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
where id = (
  select id from jobs
  where status = 'queued' and (locked_at is null or locked_at < now() - interval '15 minutes')
  order by created_at
  limit 1
  for update skip locked
)
returning *;
```

The client observes progress through Supabase Realtime on `jobs`, with `GET /api/folders/[id]/jobs/[jobId]`
as fallback. Enqueue is idempotent on `idempotency_key`, derived from folder id plus the content
fingerprint (D-014), so a double-click or a retried request does not queue duplicate work.

**Context.** `AGENTS.md` requires that long-running processing not depend on an ephemeral in-process web
request. Today `main.py:166` calls `background_tasks.add_task(run_batch_processing, ...)`, so the
pipeline dies with the process, and its first act is a stub write that is silently discarded
(`AUDIT.md` §1). The pipeline also crashes on the stub with
`TypeError: 'NoneType' object is not subscriptable` at `analysis_services.py:368`.

**Reasoning.** The requirement is durability, retry, and idempotency — a table already provides all
three, and Postgres is already a required dependency. `for update skip locked` is the standard
non-blocking claim pattern: concurrent workers skip locked rows instead of serialising behind them, so
adding a second worker needs no coordination. The stale-lock interval recovers jobs whose worker died
mid-flight, which is the failure `BackgroundTasks` handles by losing the work.

A dedicated queue (pgmq, Redis, SQS) buys throughput this product does not need — the work is minutes of
CPU per paper for a handful of papers, not thousands of messages per second — and costs an operational
dependency plus a second place to look when a job is stuck. A plain table is inspectable with the same
SQL as everything else, which matters more here than throughput.

**Alternatives considered.** (1) Supabase Queues / pgmq. (2) Redis + Celery or RQ. (3) Keep
`BackgroundTasks`. (4) Supabase Edge Function on a cron schedule.

**Rejected alternatives and reasons.** (1) Rejected for now: a real option, and the natural upgrade if
volume grows, but it adds an extension and an API to learn for a workload one table handles. (2)
Rejected: a whole broker plus worker framework to run a handful of PDF jobs; more moving parts than the
product justifies. (3) Rejected: not durable, contradicts `AGENTS.md`, and is the current defect.
(4) Rejected: PyMuPDF and Tesseract are not available in a Deno Edge runtime.

**Consequences.** The FastAPI deployment needs a worker process (or a thread in the web process for
development). Retries need per-stage idempotency, which D-011's content-addressed identity provides —
re-running extraction over unchanged text produces identical rows. Job state is queryable, so a stuck
folder is diagnosable instead of invisible. `jobs.payload` must never carry secrets, since it is
readable by anyone who can read the row.

**Follow-up / validation required.** Decide `max_attempts` and backoff. Decide whether the worker runs
as a separate process in production (recommended) or a thread. Phase 5 must test a killed mid-job worker
resuming, and a duplicate enqueue producing exactly one job. Confirm Realtime is enabled on `jobs` with
an RLS policy restricting rows to their owner.

---

### D-019 — Secrets stay server-side by construction; retire `UPLOAD_DIR` and `SUPABASE_JWT_SECRET`

**Decision.** Split keys by trust boundary as in A.8. Only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` reach the browser. `SUPABASE_SECRET_KEY`,
`PROCESSING_SERVICE_TOKEN`, and `LLM_API_KEY` are server-only and never carry a `NEXT_PUBLIC_` prefix.
`lib/supabase/admin.ts` begins with a server-only guard so an accidental client import fails the build.
Retire `UPLOAD_DIR` (no local disk in the target) and `SUPABASE_JWT_SECRET` (nothing verifies end-user
JWTs; see D-021). Replace the single `SUPABASE_KEY` with an explicit publishable/secret split.

**Context.** `AGENTS.md` requires server-side-only AI orchestration and that the browser never receive
API keys. Verified from `.env.example`: one undifferentiated `SUPABASE_KEY` (line 3), a declared-but-unused
`SUPABASE_JWT_SECRET` (line 4), and `UPLOAD_DIR` (line 12) which `main.py:29` ignores in favour of a
hardcoded path. `PAPERLENS_DEBUG` defaults to `true`, so verbose per-question rejection logging is on by
default (`AUDIT.md` §3.6).

**Reasoning.** In Next.js the `NEXT_PUBLIC_` prefix is the entire boundary between secret and public, so
the naming convention *is* the security control and must be treated as such. One `SUPABASE_KEY` used for
both anon and service-role work — as `db_service.py:11` does today — makes it impossible to tell from a
call site whether RLS applies. Deleting unused secret-shaped variables matters too: a declared
`SUPABASE_JWT_SECRET` implies JWT verification exists somewhere, and a future contributor may assume a
protection that was never built.

**Alternatives considered.** (1) Keep one `SUPABASE_KEY`. (2) Keep `SUPABASE_JWT_SECRET` for later use.
(3) Put secrets in a runtime secret manager now.

**Rejected alternatives and reasons.** (1) Rejected: ambiguous privilege at every call site, and the
service-role key would inevitably be used where anon was intended. (2) Rejected: an unused secret
variable is misleading documentation; reintroduce it if end-user JWT verification is ever needed.
(3) Rejected as premature — platform environment variables are sufficient at this scale; revisit at
production hardening.

**Consequences.** `.env.example` is rewritten (bucket name, key split, removals). `PAPERLENS_DEBUG`
defaults to `false` so verbose rejection logging is opt-in. Two files may import `admin.ts`; a review rule
plus the runtime guard keeps that true.

**Follow-up / validation required.** Phase 5 must grep the client bundle for the secret key and the LLM
key as an executable check, not an assumption. Confirm the hosting platform's secret handling.

---

### D-020 — Deliberately flat structure: no `domain/`, `repositories/`, `factories/`, or `providers/`

**Decision.** Four top-level TypeScript directories — `app/`, `components/`, `lib/`, `types/` — plus
`supabase/`, `backend/`, `e2e/`, `public/`. Group by feature, not by architectural layer. No abstraction
gets introduced until a second real implementation exists.

**Context.** `CLAUDE.md` §Codebase organization and the Phase 1 brief both require a boring, predictable
structure for developers with mixed experience, and explicitly forbid
domain/application/infrastructure/repositories/factories/providers layering without demonstrated need.

**Reasoning.** The test is whether a new teammate can answer "where is the code for X?" without
understanding the whole system. Feature grouping answers it directly: question UI is in
`components/questions/`, question types are in `types/`, question routes are under
`app/(dashboard)/folders/[folderId]/questions/`. Layer grouping answers it only after the reader has
learned the layering convention, and one feature's code ends up smeared across four directories.

There is direct evidence from this codebase that speculative abstraction does not pay off here.
`db_service.py` contains six carefully written Supabase wrapper classes with **zero callers** —
`ProfilesDB`, `FoldersDB`, `SessionsDB`, `PapersDB`, `QuestionsDB`, `SharedLinksDB` (verified, and
recorded in `AUDIT.md` §4.10). A full repository layer was written for a data layer that was never wired
up. `analysis_services.py:11-34` similarly defines an abstract `SimilarityProvider` base class with a
single implementation. The right lesson is that this project's failure mode is over-abstraction, not
under-abstraction.

**Alternatives considered.** (1) Layered `domain/application/infrastructure`. (2) `features/` with
self-contained slices. (3) A `repositories/` layer wrapping Supabase queries.

**Rejected alternatives and reasons.** (1) Rejected: explicitly forbidden by the brief, and it answers a
question — swapping infrastructure — that this project will not ask. (2) Rejected as the closest call:
vertical slices are defensible, but they conflict with App Router's convention that routes live in
`app/`, so components would live in two places. (3) Rejected: the Supabase client is already a data
access layer, and wrapping it duplicates its types while hiding RLS behaviour. This project already tried
it, unused, and the wrappers are the dead code above.

**Consequences.** Some cross-feature helpers land in `lib/utils/` and it must not become a junk drawer —
if a file's name does not say what is inside, it is wrong. A future need for real abstraction will
require a refactor, which is the correct trade: refactoring proven duplication is cheap, and removing
wrong abstraction is expensive.

**Follow-up / validation required.** Revisit if a second storage backend or a second similarity provider
becomes a real requirement rather than a hypothetical.

---

### D-021 — Next.js → FastAPI is an internal, service-token boundary; the browser never reaches FastAPI

**Decision.** FastAPI exposes only `POST /internal/jobs/extract`, `POST /internal/jobs/analyze`, and
`GET /health`. Every `/internal/*` request requires `Authorization: Bearer $PROCESSING_SERVICE_TOKEN`,
compared with a constant-time comparison. Next.js authenticates the user, authorizes the folder, then
calls FastAPI server-to-server. FastAPI holds its own `SUPABASE_SECRET_KEY` for job-scoped database work
and receives **no end-user credentials**. CORS on FastAPI allows **no browser origins** — it is not a
browser-facing service. The browser's only processing-related calls are to Next.js routes.

**Context.** `AGENTS.md`: the browser must never call FastAPI directly and must never receive API keys;
Next.js server code must authenticate and authorize before contacting FastAPI; and §Phase 3 requires
defining how worker credentials differ from end-user credentials. Today the opposite holds: `App.jsx`
calls FastAPI directly from the browser (verified, six call sites), and `main.py:21-27` sets
`allow_origins=["*"]` with `allow_credentials=True` — a combination browsers reject for credentialed
requests and which is unsafe once auth exists (`AUDIT.md` §4.5).

**Reasoning.** Authorization needs to happen exactly once, in the tier that owns the user session.
Next.js has the session cookie and RLS; giving FastAPI a second, parallel notion of user identity would
mean two authorization implementations that must agree forever. A shared service token instead makes the
boundary's meaning precise: "a trusted caller has already authorized this work." FastAPI then verifies
*callers*, not *users*, which is a much smaller thing to get right — and it explains why
`SUPABASE_JWT_SECRET` is retired (D-019).

The tradeoff is honest: the token is a single shared secret, so leaking it means anyone can enqueue
processing. That is contained by never exposing FastAPI publicly where the platform allows it, and by the
fact that job payloads reference server-side identifiers rather than carrying data.

**Alternatives considered.** (1) Forward the user's Supabase JWT and have FastAPI verify it with
`SUPABASE_JWT_SECRET`. (2) Browser calls FastAPI directly with its user JWT. (3) mTLS between services.
(4) Skip HTTP: Next.js writes the `jobs` row, the worker polls, no FastAPI HTTP surface at all.

**Rejected alternatives and reasons.** (1) Rejected: duplicates authorization in two languages, and
FastAPI would need per-user Supabase clients while also needing service-role access for job bookkeeping —
two credential paths in one request. Worth revisiting only if FastAPI ever serves user-initiated reads.
(2) Rejected: explicitly forbidden by `AGENTS.md`, and it is the current defect. (3) Rejected as
disproportionate operational complexity at this stage; a bearer token over TLS is adequate. (4) Rejected
as the closest call, and genuinely tempting — it removes the HTTP surface entirely. Rejected because
polling-only adds latency to the common case and leaves no synchronous way to report "the service is
down" at enqueue time. The `jobs` table remains the durable record either way (D-018), so this can be
adopted later without schema change.

**Consequences.** `PROCESSING_SERVICE_TOKEN` must be shared by two deployments and rotatable. FastAPI's
CORS middleware is removed rather than reconfigured. All eight current `/api/sessions/*` routes are
replaced. Local development needs both processes running.

**Follow-up / validation required.** Phase 5 must verify `/internal/*` rejects an absent, wrong, and
malformed token, and that the browser bundle contains no reference to `PROCESSING_SERVICE_URL`. Decide
whether the platform can keep FastAPI on a private network.

---

### D-022 — Retire all six existing tests; generate PDF fixtures in memory; test policies with pgTAP

**Decision.** Replace the existing suite rather than porting it. Adopt four layers as in A.9: pytest for
pure extraction/analysis functions, pytest + `TestClient` for FastAPI routes, **pgTAP for RLS and storage
policies**, Vitest for TypeScript units, and Playwright for cross-user and share-link flows. PDF fixtures
are generated in memory with PyMuPDF at test time and never committed. Add `backend/conftest.py` so the
`sys.path` bug cannot recur.

**Context.** Resolves `AUDIT.md` §5.7. All six test files assert `/api/sessions` shapes and
session-based persistence, which D-010 retires. All six are unrunnable as written due to a `sys.path`
bug, and four additionally require a live server on `127.0.0.1:8000` plus `sample_exam.pdf` /
`scanned_exam.pdf`, which are absent and permanently un-committable because `.gitignore` excludes
`*.pdf` (`AUDIT.md` §4.4). Two pass once `PYTHONPATH` is corrected (D-003).

**Reasoning.** Their assertions encode the architecture being replaced, so porting them would preserve
the session model in test form — the tests would fail for correct reasons and someone would "fix" them
back toward the old design. The two genuinely valuable ones,
`test_validation_layer.py` and `test_hybrid_direct.py`, are valuable for their *cases* rather than their
code: the noisy-input expectations (`1,`→`Q1`, `[1O M]`→10 marks, nested `Q5.(a)/(b)`, missing-Q3
detection) are exactly the regression suite the rewritten parser needs, and those cases carry forward
even though the files do not.

pgTAP is the notable addition. `AGENTS.md` §Phase 2 requires RLS policies be tested rather than merely
present, and §Phase 5 requires proving user A cannot read user B's data. That is a database-level claim,
so it needs a database-level test that runs as two distinct roles; asserting it through the application
only proves the application's query was scoped, not that the policy would stop a different query.

Generating fixtures in memory resolves the `.gitignore` conflict permanently instead of arguing with it,
and has the side benefit that a fixture's content is visible in the test that builds it. It is also the
approach already proven during Phase 0 (D-002).

**Alternatives considered.** (1) Port all six tests to the new architecture. (2) Commit PDF fixtures and
narrow `.gitignore`. (3) Test RLS only through the application client. (4) Keep the live-server
integration style with a fixture that boots `uvicorn`.

**Rejected alternatives and reasons.** (1) Rejected: their assertions contradict the target data model.
(2) Rejected: real exam PDFs are student data, and committing them repeats the privacy problem in
`AUDIT.md` §4.11. (3) Rejected: proves application queries are scoped, not that policies hold — which is
the actual requirement. (4) Rejected: `TestClient` gives the same fidelity in-process with no port
binding or process lifecycle (D-002).

**Consequences.** Six files are deleted in Phase 3, not now. Their test *cases* must be transcribed
first, or the parser loses its regression coverage. pgTAP requires local Supabase via the CLI. The
`sys.path` fix (`AUDIT.md` §4.4) becomes moot.

**Follow-up / validation required.** Transcribe the noisy-input cases into the new parser suite **before**
deleting the old files. Confirm the Supabase CLI is available locally for pgTAP.

---

### D-023 — ⚠ APPROVAL REQUIRED — LLM: cache by content fingerprint, cap tokens per call, budget per user per day, degrade visibly

**Decision.** Gate every LLM call behind five controls before any AI feature ships.

1. **Cache first.** `llm_cache` keyed by `hash(feature, model, prompt_version, input_fingerprint)`.
   Answer hints are per question group, so a hint is generated once and served to every viewer of that
   folder, including public share viewers. Mock papers key on the folder fingerprint (D-014).
2. **Token caps per call.** `LLM_MAX_TOKENS` bounds output. Inputs are truncated to a fixed question
   count for mock papers rather than sending an unbounded folder.
3. **Per-user daily budget.** `llm_usage` accumulates `(user_id, date, tokens_in, tokens_out, calls)`.
   Exceeding `LLM_DAILY_TOKEN_BUDGET` returns a clear "daily limit reached" state, not a silent failure.
4. **Rate limit.** Per user, per feature, enforced server-side in the route handler.
5. **No retry storms.** One retry on a 5xx or timeout, then fail and surface it. Never retry a 4xx.

All calls originate in Next.js route handlers using `LLM_API_KEY` server-side. FastAPI makes no LLM
calls. **Deterministic analytics never depend on an LLM** — repetition, weightage, and priority stay
pure functions of stored data (D-014), so a budget exhaustion or provider outage degrades study tools
while leaving the three core differentiators fully working.

**Context.** `AGENTS.md` §"LLM cost and abuse control" requires defining caching, rate limiting, retry
behaviour, model selection, token limits, failure handling, and per-user or per-folder cost controls
*before* implementing answer hints or mock-paper generation. It separately requires that per-folder
deterministic analytics be computed once, cached, and served to all authorized viewers without
recomputation per viewer.

**Reasoning.** The cost risk here is structural, not incidental: answer hints are per question, a folder
holds hundreds of questions, and a public share link can be opened by an unbounded number of classmates.
Without caching, one shared folder is a bill multiplier — and the public route has no authenticated user
to bill or rate-limit, which makes cache-by-fingerprint the only workable design rather than an
optimization.

Caching on content fingerprint rather than question id means an edited or corrected question naturally
misses and regenerates, while unchanged questions never regenerate. Keeping `prompt_version` in the key
makes prompt iteration safe: a new prompt yields new entries instead of silently mixing outputs from two
prompt generations.

Model choice is intentionally an environment variable rather than a code constant so it can be changed
without a deploy, and pinned rather than "latest" so output does not drift under a cache key that
assumes stability.

**Alternatives considered.** (1) No caching; generate per request. (2) Cache in memory or Redis.
(3) Per-folder budget instead of per-user. (4) Generate hints for all questions eagerly at analysis time.
(5) Let the LLM compute topic classification and difficulty.

**Rejected alternatives and reasons.** (1) Rejected: unbounded cost on public shares, and it violates
the "computed once, served to all viewers" requirement. (2) Rejected: a cold start loses the cache and
re-bills; Postgres is already present and durable. (3) Rejected as primary: the owner of a widely shared
folder would be penalised for its popularity, and an anonymous viewer has no budget to charge. Retained
as a possible secondary cap. (4) Rejected: pays for hundreds of hints a student may never open;
generate on first request, then cache forever. (5) Rejected: it would make the deterministic
differentiators depend on a non-deterministic service, directly contradicting D-014. Topic
classification stays keyword-based and deterministic; an LLM may *suggest* topics for user confirmation
(D-012), but never write them silently.

**Consequences.** Two new tables. Every AI feature route has the same five-step preamble, so it belongs
in one shared helper in `lib/api/` rather than copied per route. Public share viewers read cached hints
but can never trigger generation — an important consequence to state explicitly, since it means a share
link cannot be used to spend the owner's budget.

**Follow-up / validation required.** **Swayam to set the actual numbers**: model, `LLM_MAX_TOKENS`, daily
token budget, rate limit, and whether public viewers see cached hints at all (interacts with D-017's
field list). Phase 5 must test budget exhaustion, cache hit behaviour, and that a public share link
cannot trigger generation.

---

### D-024 — ⚠ APPROVAL REQUIRED — Exact deduplication is authoritative; RapidFuzz at 0.84 is an unvalidated advisory default

**Decision.** Two distinct mechanisms, never conflated.

- **Exact dedup (authoritative).** SHA-256 over normalized text. Two questions with the same
  `normalized_hash` in a folder are the same `question_group`. This drives repeat counts, weightage, and
  priority.
- **Similarity grouping (advisory).** RapidFuzz `token_set_ratio` at a **provisional** 0.84 threshold,
  stored in `similarity_clusters` / `cluster_members` with the per-pair score and the threshold used.
  It may show "3 similar variations" and contribute the small `f_cluster` factor. It may **never** merge
  identities (D-011).

The threshold is explicitly **not approved as ground truth**, and the current implementation must change
in two ways before it is trustworthy: sort inputs before seeding (D-014), and store the threshold with
the result so a change is detectable.

**Known risks, stated rather than assumed away.**

*False positives.* `token_set_ratio` ignores word order and duplicate tokens, so "Explain paging in
virtual memory" and "Explain virtual memory paging" score ~100 — correct here, but the same property
makes "Compare FCFS and SJF scheduling" and "Compare SJF and FCFS scheduling" identical to it even if a
course treats them as distinct. More seriously, short questions are unstable: two 4-word questions
sharing 3 tokens can exceed 0.84 while asking different things. Consequence if wrong: two distinct
concepts show a single inflated repeat badge, which directly corrupts differentiator #1.

*False negatives.* The same concept phrased with different vocabulary ("Explain thrashing" vs "What
causes excessive page swapping") scores far below 0.84, because `token_set_ratio` is lexical and has no
notion of meaning. Consequence: a genuinely repeated concept appears twice with lower repeat counts, and
a high-yield topic is under-ranked. This is the more likely failure in practice and the harder one to
notice.

*Order dependence.* Verified in the current code: `run_clustering` seeds greedily via
`unclustered.pop(0)` over an unordered result set (`analysis_services.py:216-233`), so membership can
differ between runs on identical data. Greedy single-pass clustering is also not transitive — A~B and
B~C does not give A~C — so which item seeds first changes the outcome.

**Context.** `AGENTS.md` §"Do Not Guess" states the existing exact-hash-plus-fuzzy approach "is not
automatically a trustworthy concept identity system" and requires documented candidates, risks,
thresholds, and override requirements before similarity output is treated as ground truth.

**Reasoning.** Exact hashing is the right authority because it is deterministic, cheap, explainable to a
student ("these are the same question"), and has zero false positives by construction. Fuzzy matching is
genuinely useful for surfacing near-duplicates across years, which is a real product need — but its
output is a *suggestion*, and the architecture should encode that. Storing the score and threshold per
member is what makes later tuning safe: raising the threshold reclusters advisory data and touches no
identity, no correction, and no share link.

0.84 appears to be an untested constant. It is retained as a starting point because changing it without
measurement would be equally arbitrary, but it must not be presented to users as truth until validated.

**Alternatives considered.** (1) Sentence embeddings + cosine similarity. (2) TF-IDF + cosine.
(3) Trigram similarity via `pg_trgm` in Postgres. (4) Fuzzy as identity (current behaviour).
(5) Require user confirmation for every similarity group.

**Rejected alternatives and reasons.** (1) Rejected for now, strongest future candidate: it fixes the
false-negative case that lexical matching cannot, but adds a model dependency, a vector index, per-call
cost, and a version that silently changes results — `AGENTS.md` forbids choosing one silently. Revisit
with measured evidence. (2) Rejected: better than nothing on vocabulary overlap, still lexical, and
corpus-dependent scores are harder to explain than a fixed ratio. (3) Rejected: character-trigram
similarity is weaker than token-set on reordered wording, though attractive for needing no Python.
(4) Rejected: the trap D-011 exists to prevent. (5) Rejected as the default: far too much friction;
retained as the override path (D-012).

**Consequences.** Repeat badges and weightage rest on exact hashing, so they are defensible and
reproducible. Near-duplicates across years may under-group until similarity is validated or replaced —
an honest limitation that should be visible in the UI as "similar" rather than "same". `f_cluster` is
weighted at only 7% in the existing scoring, which usefully limits how much unvalidated similarity can
distort a priority score.

**Follow-up / validation required.** **Swayam must approve before similarity output is user-visible as
truth.** Phase 3 must: hand-label a sample of question pairs from real papers across ≥3 years; measure
false-positive and false-negative rates at 0.80/0.84/0.88/0.92; check short-question instability
specifically; and confirm the sorted-seed fix makes clustering reproducible. Report measured numbers
before the badge ships.

---

### D-025 — SQLite is retired with no data migration; every old table is explicitly mapped

**Decision.** No SQLite-to-Postgres data migration. Nothing was ever persisted, so there is no data to
move. Delete `paperlens.db` handling entirely; do not restore the pre-stub implementation. Map all nine
old tables explicitly:

| Old SQLite table | Disposition | Notes |
|---|---|---|
| `analysis_sessions` | **Removed**, split | → `jobs` (per-run state) + `folder_analytics` (cached results). D-010. |
| `user_context` | **Merged** | → columns on `folders` (subject, exam name/type, total marks, pattern). Chapters → `topics`. |
| `papers` | **Retained**, re-keyed | `session_id` → `folder_id`; adds `user_id`, `storage_path`; drops `file_path`. |
| — | **New** | `paper_pages`. Per-page extraction method and OCR confidence. D-013. |
| `raw_questions` | **Renamed and merged** | → `questions`. Absorbs `rejected_questions` via `status`. Adds `user_id`, `folder_id`, real `page_number`, `difficulty`, `label_path`. |
| `rejected_questions` | **Merged away** | → `questions` with `status = 'rejected'` + `reject_reason`. |
| `question_groups` | **Retained**, re-identified | Identity becomes `unique (folder_id, normalized_hash)`. Adds `reference_year`, `algo_version`. Factor columns → `factors` jsonb. |
| `question_occurrences` | **Removed** | Fully derivable from `questions.group_id`; it duplicated `year` and `marks` from parents. |
| `similarity_clusters` | **Retained**, split | → `similarity_clusters` + `cluster_members`, with per-member score. Advisory only. D-024. |
| `topics` | **Retained**, re-keyed | `session_id` → `folder_id`; adds `source` to distinguish syllabus/user/default. |
| — | **New** | `profiles`, `share_links`, `question_corrections`, `group_overrides`, `jobs`, `folder_analytics`, `llm_cache`, `llm_usage`, `generated_artifacts`. |

**Context.** `AGENTS.md` §Phase 2 requires explicitly mapping every retained, renamed, merged, or removed
table before writing migrations, plus a data-disposition plan. Verified in Phase 0: no `paperlens.db` on
disk, no `.sql` file in any commit, no Supabase project configured, and the stub has discarded every
write since commit `887d5e2` (`AUDIT.md` §3.5, §6, D-005).

**Reasoning.** A data migration with no data is theatre — it would add risk and code for zero benefit.
The valuable half of the requirement is the *mapping*, because it forces each old table's fate to be a
decision rather than an accident. Two removals deserve their reasoning stated: `question_occurrences`
existed to link a group to its raw questions, which `questions.group_id` already does — keeping it means
storing `year` and `marks` in two places and needing them to agree. `rejected_questions` duplicated
nearly every column of `raw_questions`, so a rejected question could not be reviewed and accepted
without moving rows between tables; as a `status` value, "accept this rejected question" becomes a
field update and fits the correction model (D-012).

**Alternatives considered.** (1) Restore the SQLite layer, run it, then migrate real data.
(2) Write a migration script for hypothetical future SQLite data. (3) Keep `question_occurrences` and
`rejected_questions` for a closer 1:1 mapping.

**Rejected alternatives and reasons.** (1) Rejected: contradicts the Supabase target and would generate
data purely to migrate it. (2) Rejected: speculative code for data that cannot exist. (3) Rejected:
preserves normalization mistakes for the sake of resemblance; the mapping table above documents the
change instead.

**Consequences.** Phase 2 is clean-slate schema design — the one genuinely favourable finding in the
audit. Old table names survive only in this mapping and in git history. Anyone comparing `README.md`'s
9-table schema to the new 17 tables needs this table to reconcile them.

**Follow-up / validation required.** Confirm with Swayam that **no production Supabase project exists**
with real data, since the whole disposition rests on that. Re-verify no `paperlens.db` exists on any
teammate's machine before Phase 2.

---

### D-026 — Numbered idempotent migrations, forward-only, with a documented rollback per migration

**Decision.** Plain SQL files in `supabase/migrations/`, timestamp-prefixed and applied in order, created
via `supabase migration new <name>` rather than hand-named. Every migration is idempotent: `create table
if not exists`, `create index if not exists`, and `do $$ ... end $$` guards for constraints and policies,
because Postgres has no `add constraint if not exists`. Order: extensions and enums → tables → indexes →
RLS enable + policies → storage policies → triggers → views. One concern per file.

Rollback is **forward-only by default**: a mistake ships a new corrective migration rather than a `down`
script. Each migration file carries a comment stating its rollback: either "safe to re-run" or the exact
corrective SQL. Before Phase 2 applies anything to a shared project, a snapshot is taken.

**Context.** `AGENTS.md` §Phase 2 requires versioned idempotent migrations plus rollback considerations
and cache invalidation rules. Verified: **no `.sql` file exists in any commit in the repository's
history**, and no `CREATE TABLE` exists anywhere in the working tree (`AUDIT.md` §3.5). The old schema
was created by Python calling `init_db()` on module import.

**Reasoning.** Idempotency is what makes a migration safe to re-run against a partially-applied database,
which is the realistic failure mode with multiple developers and no CI. Forward-only avoids maintaining
two code paths where the reverse path is rarely tested and often impossible — a `down` migration cannot
restore dropped data, so its safety is largely illusory. Documenting the rollback in a comment keeps the
useful part (knowing how to undo) without the false confidence of an untested script.

Declarative schemas were considered and are attractive for review, since a diff shows intent rather than
a delta. Imperative files are chosen because RLS policies, storage policies, and pgTAP tests are the bulk
of this schema's risk, and those are clearest written out explicitly.

**Alternatives considered.** (1) Declarative schema in `supabase/schemas/` with generated migrations.
(2) `up`/`down` pairs. (3) An ORM's migration tool. (4) Keep `init_db()` in Python.

**Rejected alternatives and reasons.** (1) Rejected for now: good for table shape, less direct for
policies, and it adds a generation step between intent and applied SQL while the team is learning RLS.
(2) Rejected: reverse scripts are rarely exercised and cannot undo data loss. (3) Rejected: no ORM is in
the target stack, and it would add one to manage SQL that is already plain SQL. (4) Rejected: schema
creation on import is invisible, unversioned, and how the current schema became undiscoverable.

**Consequences.** Migrations are reviewable as plain SQL. Applying twice is a no-op. Fixing a shipped
mistake means a new file, so history is append-only and readable as a record. Cache invalidation needs no
migration hooks, since `folder_analytics` invalidates on fingerprint (D-014) — a schema change bumps
`algo_version`, which changes every fingerprint, which invalidates every cache row automatically.

**Follow-up / validation required.** Confirm the Supabase CLI version supports the intended commands.
Take a snapshot before the first apply. Run `supabase db advisors` after policies land and fix what it
reports.

---

### D-027 — Generate database types from the schema; hand-write only what the schema cannot express

**Decision.** Generate `types/database.generated.ts` with the Supabase CLI, commit it, and treat it as
read-only. Hand-write only types the schema cannot express: the public share projection (D-017), FastAPI
request/response contracts, and derived view models. Regenerating is a checklist step in every migration.

**Context.** `AGENTS.md` §Phase 1 requires deciding shared or generated database types. Nothing exists
today — the frontend is JavaScript with no type layer (`AUDIT.md` §Frontend).

**Reasoning.** Hand-written row types drift from the schema silently, and the drift surfaces as a runtime
`undefined` rather than a compile error. Generated types make a column rename a build failure, which is
where a rename should fail. Committing the file means CI and a fresh clone do not need database access to
type-check.

The exceptions matter as much as the rule. The public share projection is deliberately **not** derived
from a table type, because deriving it would mean a new column joins the public shape automatically —
precisely the default-open failure D-017 exists to prevent. That type is hand-written so adding a public
field is a visible edit.

**Alternatives considered.** (1) Hand-write all types. (2) Generate at build time, do not commit.
(3) Zod schemas as the single source, inferring types. (4) `any` at the boundary.

**Rejected alternatives and reasons.** (1) Rejected: guaranteed drift. (2) Rejected: build now needs
database credentials, and type-checking breaks when the database is unreachable. (3) Rejected as the
primary source: duplicates the schema in TypeScript, so two definitions must agree. Worth adding *later*
for runtime validation at API boundaries, where the schema genuinely cannot help. (4) Rejected:
forfeits the reason TypeScript is in the target stack.

**Consequences.** One generated file must be regenerated after each migration, and a stale commit causes
confusing errors — so it belongs in the migration checklist, not in memory. The generated types describe
the *database*, not the API; the projection types are the API contract.

**Follow-up / validation required.** Confirm the CLI type-generation command for the installed version.
Consider a check that fails if generated types differ from the schema.

---

### D-028 — ⚠ APPROVAL REQUIRED — Institution-specific patterns move to configuration; scope of multi-institution support is Swayam's call

**Decision.** Extract the hardcoded institution patterns into a configuration module in
`backend/extraction/`, defaulting to the current KIIT/NITR behaviour so nothing regresses. Structure
allows other institutions; **whether to actually support them is Swayam's decision** and is not resolved
here.

**Context.** Resolves `AUDIT.md` §5.6. Verified: `question_validation_service.py:31` blacklists `\bkiit\b`;
`question_extraction_service.py:158-159` strips `NITR` and `NATIONAL INSTITUTE OF TECHNOLOGY ROURKELA`;
`analysis_services.py:290` falls back to Operating-Systems chapters
(`Process Management`, `CPU Scheduling`, `Deadlocks`, ...) when no chapters are supplied.

There is a subtler problem worth surfacing. `METADATA_BLACKLIST`
(`question_validation_service.py:26-48`) rejects any text matching `\bcourse\b`, `\bsemester\b`,
`\bdegree\b`, `\btech\b`, `\bspring\b`, or `\bautumn\b`. These are generic English words, not institution
markers. A legitimate question — "Explain the semester system's effect on scheduling" or a networking
question mentioning "course of a packet" — is silently rejected as university metadata. The blacklist is
tuned to header text but applied to question text.

**Reasoning.** Moving patterns to configuration is safe, mechanical, and improves testability regardless
of the scope answer, so it can proceed either way. Whether PaperLens targets two universities or many is
a product decision with real consequences for validation strategy, so `AGENTS.md` §"No silent conflict
resolution" requires asking rather than assuming. The blacklist over-matching is a separate defect and is
flagged as such: it is a correctness bug in a heuristic, not a scope question, but fixing it changes which
questions are accepted, so it should not be changed silently either.

**Alternatives considered.** (1) Leave hardcoded. (2) Remove institution patterns entirely and rely on
generic heuristics. (3) Build per-institution profiles now.

**Rejected alternatives and reasons.** (1) Rejected: silently wrong for any other university, and
untestable. (2) Rejected: would regress the verified-good behaviour on KIIT/NITR papers, which is real
value (`AUDIT.md` §3.3). (3) Rejected as speculative until scope is confirmed — exactly the premature
generalization D-020 warns against.

**Consequences.** Default behaviour is unchanged, so no regression on current papers. The Operating-Systems
chapter fallback becomes an explicit default rather than a hidden surprise; better still, topics should
come from the syllabus PDF when one is uploaded.

**Follow-up / validation required.** **Swayam to answer two questions.** (a) Is multi-institution support
in scope for this rebuild? (b) Should the over-broad blacklist terms (`course`, `semester`, `degree`,
`tech`, `spring`, `autumn`) be narrowed to header-position matching? Changing them alters which questions
are accepted, so it needs approval. Phase 3 should measure rejection rates before and after.

---

### D-029 — Repository hygiene deferred to explicit, individually-approved actions

**Decision.** Propose, do not perform. Each item below is listed with its blast radius so Swayam can
approve them independently.

| Item | Proposal | Reversible |
|---|---|---|
| `backend/venv/` — 2799 tracked files, 98.7% of the repo, hardcoded to `C:\Users\KIIT\...`, non-functional here | `git rm -r --cached backend/venv/`; keep `.gitignore` entry | Yes — blobs stay in history |
| `requirements.txt` — zero version pins | Pin all nine to the versions verified in `AUDIT.md` §4.9 | Yes |
| `README.md` — marks 31 dead features "✅ Working" | Rewrite at the end of the rebuild, not now (§5.4) | Yes |
| Dead code — `perform_ocr_on_pdf`, six unused Supabase classes, `build_storage_path`, `App.css`, 0-byte assets | Delete during the phase that replaces the file | Yes |
| Real student exam PDFs in git history (~12 commits) | **Owner decision required.** History rewrite is destructive and coordinated | **No** |

**Context.** `AUDIT.md` §4.1, §4.9, §4.10, §4.11 and §5.4. D-004 deferred all of it to Phase 1. Verified
the history claim independently: `git log --diff-filter=A -- '*.pdf'` lists named student files including
`Engineering Economics -Mid 2024 .pdf` and multiple `backend/uploads/**` PDFs across distinct session
directories.

**Reasoning.** These are unrelated changes with very different risk, and bundling them into one "cleanup"
commit would make the riskiest item ride along with the safest. Removing the venv from tracking is
mechanically safe and immediately valuable — it makes every future diff reviewable — but it is still 2799
tracked files disappearing, which the owner should see coming. Pinning dependencies is a prerequisite for
reproducible builds and should happen early, since `AUDIT.md` §4.9 shows the audit resolved today's
versions rather than the ones the code was written against.

The history rewrite is categorically different: it is irreversible, invalidates every existing clone, and
concerns real students' exam papers. `.gitignore` already excludes `*.pdf`, so the exposure is historical
rather than ongoing. Flagged, not acted on.

**Alternatives considered.** (1) One cleanup commit for everything. (2) Defer all of it to the end.
(3) Rewrite history now while the project is small.

**Rejected alternatives and reasons.** (1) Rejected: mixes a destructive irreversible action with
mechanical ones. (2) Rejected: the venv makes every diff in Phases 2–5 harder to review, so deferring it
taxes all remaining work. (3) Rejected: irreversible and the owner's call, per `AGENTS.md` and D-004.

**Consequences.** Until the venv is untracked, `git status` and diffs stay noisy. Until dependencies are
pinned, builds are not reproducible. `README.md` stays misleading until the rebuild completes — acceptable
only because `AGENTS.md` is the designated authority (D-007), and worth noting as a real risk for any new
contributor who reads `README.md` first.

**Follow-up / validation required.** Swayam to approve the venv removal and dependency pinning as the
first Phase 2 actions, and to decide separately on the history rewrite.

---

## Phase 1 — Consistency check against `AGENTS.md` and the Phase 0 audit

Verified before submitting.

| `AGENTS.md` requirement | Where satisfied |
|---|---|
| Next.js App Router, TypeScript, Tailwind, KaTeX | A.1, A.2, D-009 |
| Supabase Postgres / Auth / Storage / RLS | A.4–A.6, D-015, D-016 |
| FastAPI stays separate; PyMuPDF + Tesseract kept | A.7, D-008, D-021 |
| Browser never calls FastAPI; never receives keys | D-019, D-021 |
| Server-side-only AI orchestration | D-023 |
| Private bucket, `{user_id}/{folder_id}/{paper_id}.pdf` | D-016 |
| Durable jobs, not ephemeral requests; Realtime or status endpoint | D-018 |
| Ownership path to `auth.users` on every user table | D-015 |
| RLS tested for select/insert/update/delete | D-015, D-022 |
| Storage policies tested separately | D-016, D-022 |
| Service-role credential narrowly scoped, server-only | A.4, D-019 |
| Old→new table mapping + data disposition | D-025 |
| Deterministic, cached, per-folder analytics (differentiator #1) | D-014 |
| Public read-only shared workspaces (differentiator #2) | D-017 |
| Syllabus coverage gap analysis (differentiator #3) | A.1 `coverage/`, A.6 `topics.source` |
| Question identity / dedup not guessed | D-011, D-024 — both ⚠ approval-gated |
| Correction and override workflow defined | D-012 |
| LLM caching, limits, cost controls defined first | D-023 |
| Low-confidence OCR and page refs never silently clean | D-013 |
| Test organization | A.9, D-022 |

**Audit conflicts resolved, each as an approval-gated proposal:** §5.1 → D-010; §5.2 → D-009;
§5.3 → D-011; §5.4 → D-029; §5.5 → D-016 (`exam-pdfs` wins); §5.6 → D-028; §5.7 → D-022.

**Audit defects addressed:** §4.1 → D-029; §4.2 → D-010/D-025 (real persistence); §4.3 → D-013;
§4.4 → D-022; §4.5 → D-015/D-021; §4.6 → D-016 (server-generated paths); §4.7 → D-013; §4.8 → D-014;
§4.9 → D-029; §4.10 → D-029; §4.11 → D-029 (owner decision).

**Three audit claims corrected during Phase 1 verification.** Each changed a design decision, so they are
recorded rather than silently fixed:

1. **§4.7 misidentifies the cause.** The audit states the parser "flattens page markers and never
   propagates real page numbers." In fact `pdf_service.py:36,47` injects `--- Page N ---` into the text
   and the noise filter anchors on `^\s*Page` (`question_extraction_service.py:156`), so the marker
   survives normalization — verified by running that regex against the actual marker strings. The parser
   loop simply never reads it. Real page numbers are a cheap fix, not an extraction rewrite (D-013).
2. **§5.3 understates the identity defect.** Beyond the counter at `batch_processor.py:272`, the
   duplicate-copy branch at `:145` mints IDs in a *different* format with no counter, so the same paper
   yields different question IDs depending on which branch runs (D-011).
3. **§4.8 understates non-determinism.** It names only `datetime.now().year`. Clustering is *also*
   order-dependent via `unclustered.pop(0)` over unordered rows (`analysis_services.py:216-233`), so
   pinning the reference year alone would not achieve determinism — and would have produced a false claim
   of it (D-014, D-024).

**Internal consistency.** Storage bucket is `exam-pdfs` in A.8 and D-016. The table count is 17 in A.6
and matches D-025's mapping. Identity (D-011) is consistent with corrections keyed on question id
(D-012), share links keyed on folder (D-017), and fingerprints over content hashes (D-014). Analytics
never depend on the LLM (D-014, D-023). No decision grants the `anon` role a table policy (D-015, D-017).

**Not designed in Phase 1, deliberately.** Concrete SQL DDL (Phase 2), UI component APIs and visual
design (Phase 4), export format specifics (Phase 4), and hosting topology (needs a deployment target).

---

## Phase 1 — Open questions for Swayam

Blocking Phase 2, in dependency order:

1. **D-010** — Folder as durable hub, `analysis_sessions` retired? Is a user-visible per-run history
   required? *Gates the entire schema.*
2. **D-011** — Content-addressed identity, similarity strictly advisory? *Gates corrections, sharing,
   re-analysis.*
3. **D-015** — RLS with denormalized `user_id` and **no `anon` policies**, so public sharing runs through
   a service-role route?
4. **D-017** — Is the public projection field list correct? Confidence scores, OCR warnings, original PDF
   pages, user corrections: public or private?
5. **D-024** — Accept 0.84 as an *unvalidated* provisional default, with measurement required before
   similarity is shown as truth?

Non-blocking, needed during Phase 2–3:

6. **D-012** — Confirm the correctable field list.
7. **D-023** — Set model, token cap, daily budget, rate limit.
8. **D-028** — Is multi-institution support in scope? Narrow the over-broad blacklist terms?
9. **D-029** — Approve venv untracking and dependency pinning; decide on the git-history rewrite.

Phase 1 stops here. No implementation, migrations, deletions, or dependency changes were made.

---

## Phase 2 — Database and Supabase foundation, Phase 3 — Backend and processing pipeline

Status: **implemented.** Swayam approved D-010, D-011, D-012, D-015, D-017, D-023, D-024, D-028 and
D-029 on 2026-08-19, with two refinements to the approved text recorded below (D-033, and the
normalization rule now folded into D-011's implementation).

Everything in this section was executed and verified. Test evidence is named per decision rather than
asserted: 147 pytest tests, 9 doctests, 6 Vitest tests, and 66 SQL assertions against a real
PostgreSQL 16 container.

Phase 1 used D-008 to D-029. Implementation continues at D-030.

---

### D-030 — Policy tests are plain SQL assertions against a throwaway Postgres container, not pgTAP

**Decision.** Keep D-022's requirement that RLS and storage policies be *tested*, but implement the
tests as plain SQL assertions run by `psql` against a disposable `postgres:16-alpine` container, driven
by `supabase/tests/run_tests.sh`. A shim at `supabase/tests/00_local_supabase_shim.sql` supplies the
`auth.users` table, `auth.uid()`, `storage.objects`, `storage.foldername()` and the
`anon`/`authenticated`/`service_role` roles that a stock Postgres lacks.

**Context.** D-022 specified pgTAP. pgTAP ships with the Supabase CLI's local stack, and **no Supabase
CLI is installed on this machine** — `supabase --version` is not found, and `npx supabase` refuses to
install unattended. Docker 29.5.3 *is* available. AGENTS.md §Phase 2 requires that policies be tested
rather than merely present, and §Delivery Requirements forbids claiming a feature works without an
executable check.

**Reasoning.** The requirement is that a policy provably blocks cross-user access; pgTAP is a
convenience for expressing that, not the substance of it. RLS is enforced by Postgres, so a real
Postgres is the thing that must be tested, and a container provides one. Each assertion raises on
failure, so `psql -v ON_ERROR_STOP=1` aborts and the runner exits non-zero — the same pass/fail
behaviour a TAP harness would give.

The critical detail is not the harness at all: every test switches to `set local role authenticated`
and sets `request.jwt.claim.sub`. A table owner or superuser **bypasses RLS**, so a test that stayed as
`postgres` would pass while proving nothing. That property holds identically under pgTAP or plain SQL.

**Alternatives considered.** (1) Install the Supabase CLI. (2) Install the pgTAP extension into the
container. (3) Test policies only through the application client. (4) Write the SQL and leave it
unverified until a CLI exists.

**Rejected alternatives and reasons.** (1) Rejected: installing global developer tooling as a side
effect of implementation work is not the agent's call, and it needs Docker anyway. Recommended as a
follow-up. (2) Rejected as unnecessary ceremony for the same assertions — pgTAP would add an extension
install to every run for nicer output. (3) Rejected, as D-022 already argued: it proves the
application's query was scoped, not that the policy would stop a different query. (4) Rejected:
unverified security claims are exactly what AGENTS.md forbids, and the schema is the foundation
everything else was built on.

**Consequences.** 66 assertions run in about 40 seconds with no dependency beyond Docker, and they
verified real defects would have been caught — see the results below. The runner also re-applies every
migration a second time, which is how D-026's idempotency requirement became an executable check rather
than a claim. Verified: cross-user select/insert/update/delete all blocked; `anon` sees zero rows in
every table; composite foreign keys reject cross-user references *even as superuser*; storage prefix
isolation holds for read, write, overwrite and delete; corrections cannot be rewritten;
`llm_usage` is not user-writable; and every table in `public` has RLS enabled.

The shim is the one real risk and is contained deliberately: it lives in `supabase/tests/`, never in
`supabase/migrations/`, so `supabase db push` cannot apply it, and its header states plainly that
applying it to a live project would create a counterfeit auth schema.

**Follow-up / validation required.** When the Supabase CLI is available, run `supabase db reset`
against these migrations to confirm they apply cleanly through the real toolchain, and consider porting
the assertions to pgTAP for nicer reporting. The claims tested would not change. Also run
`supabase db advisors` once a project exists, per D-026.

---

### D-031 — `types/database.generated.ts` is hand-written for now, and marked as a defect

**Decision.** Write `types/database.generated.ts` by hand to match the migrations, in the shape the
Supabase CLI emits, with a header stating that it is hand-maintained and should not be. Replace it with
`supabase gen types typescript` output as soon as a project exists.

**Context.** D-027 requires generating this file and treating it as read-only, precisely because
hand-written row types drift from the schema silently and surface as a runtime `undefined` rather than
a compile error. Generation needs either the Supabase CLI (absent, D-030) or a live project (none
exists). The file is imported by all four Supabase clients, so building the foundation without it was
not an option.

**Reasoning. This is the weakest artefact in the phase and is labelled as such in the file itself.** It
carries exactly the drift risk D-027 exists to prevent. It was written anyway because the alternative
was leaving the Supabase clients untyped, which forfeits the reason TypeScript is in the stack, and
because a typed file matching the migrations is strictly better than `any` even if it can rot.

Two things reduce the risk. `Insert` and `Update` are derived from `Row` with `Insertable`/`Updatable`
helpers rather than written out three times, so a column cannot be listed in one block and forgotten in
another. And the public API is identical to the CLI's output —
`Database["public"]["Tables"]["papers"]["Row"]` resolves the same — so regenerating is a drop-in
replacement rather than a refactor.

**Alternatives considered.** (1) Skip the type layer; use `any` at the Supabase boundary. (2) Derive
types from Zod schemas. (3) Parse the migration SQL to generate types locally. (4) Defer the entire
Next.js foundation until a project exists.

**Rejected alternatives and reasons.** (1) Rejected: forfeits compile-time safety on every database
call. (2) Rejected as D-027 already did — it duplicates the schema in TypeScript, so two definitions
must agree, which is the same drift problem wearing a different hat. (3) Rejected: writing a SQL parser
to avoid hand-writing types is more code, more risk, and would be thrown away the moment the CLI is
available. (4) Rejected: the instruction covers Phase 2 and Phase 3 together, and the backend work does
not depend on a live project.

**Consequences.** `npx tsc --noEmit` passes clean across the whole foundation. The types are correct as
of these migrations and will drift the moment someone writes a migration without updating them.
Regeneration is a checklist step in D-027 and needs enforcing.

**Follow-up / validation required.** Regenerate from the real schema before Phase 4 writes any query.
Consider a CI check that fails when generated types differ from the schema.

---

### D-032 — The job claim is a `security definer` Postgres function called by RPC

**Decision.** Implement D-018's `for update skip locked` claim as three database functions —
`claim_next_job`, `complete_job`, `update_job_progress` — in
`supabase/migrations/20260819120400_job_queue_functions.sql`, called from Python via
`client.rpc(...)`. Revoke execute from `public` and grant it only to `service_role`.

**Context.** D-018 specified the claim as SQL. `supabase-py` talks to PostgREST, which cannot express
`for update skip locked`, `order by ... limit 1` inside an `update ... where id = (...)`, or row-level
locking of any kind. So the claim had to live somewhere that speaks real SQL.

**Reasoning.** Putting it in the database is better than the alternative rather than merely necessary.
A read-then-write from Python — select a queued job, then update it — has a gap between the two
statements in which a second worker can claim the same row. That race is rare enough to survive testing
and would appear in production as silently duplicated processing. As a single statement inside a
function, the claim is atomic by construction.

`security definer` is required because the functions are called by the worker's `service_role`
connection, which already bypasses RLS — the marker changes nothing about what the worker can reach.
Each function pins `set search_path = ''` so it cannot be hijacked by a shadowed object.

The `revoke all ... from public` is load-bearing and easy to miss: **Postgres grants execute on new
functions to `PUBLIC` by default.** Without the revoke, any authenticated user could call
`claim_next_job` — and because the functions are `security definer`, they would succeed, handing that
user another user's job payload. The test at `supabase/tests/02_job_queue_test.sql` asserts an
authenticated caller is refused.

**Alternatives considered.** (1) Read-then-write from Python. (2) A direct `psycopg` connection
alongside `supabase-py`. (3) `pgmq` / Supabase Queues. (4) Advisory locks.

**Rejected alternatives and reasons.** (1) Rejected: the race above. (2) Rejected as the closest call —
it would allow arbitrary SQL, but it means two connection pools, two credential paths, and two places
to look when the database misbehaves, to run one query. (3) Rejected for now, as D-018 already argued:
a real option and the natural upgrade if volume grows, but an extension and an API to learn for a
workload one table handles. (4) Rejected: advisory locks are not visible in the job row, so a stuck job
would be undiagnosable — the opposite of what D-018 wants.

**Consequences.** Job claiming is atomic, verified by 30 assertions: the oldest queued job is claimed
first, two workers never receive the same job, a job locked beyond the stale window is reclaimed while
one inside it is not, a failed job requeues until `max_attempts` and then stays failed with its error,
an exhausted job is never reclaimed, progress is clamped to 0–100, and the functions reject
authenticated callers. Migrations now depend on being applied in order, which D-026's numbering already
guarantees.

**Follow-up / validation required.** Confirm `service_role` exists with the expected name on a real
Supabase project — the grant is wrapped in an existence check, so it silently skips if not, which would
leave the functions callable by nobody. Test a killed mid-job worker against a real project, per
D-018.

---

### D-033 — The queue table is `processing_jobs`, not `jobs`

**Decision.** Name the durable queue table `processing_jobs` throughout, superseding D-018's proposed
`jobs`.

**Context.** Swayam's approval of D-010 named the split as `processing_jobs` + `folder_analytics`.
D-018 had proposed `jobs`.

**Reasoning.** The approval is explicit and the owner's naming is authoritative. It is also the better
name: `jobs` is a word a study product might plausibly want for something user-facing, and
`processing_jobs` says what the rows are without ambiguity.

**Consequences.** `processing_jobs` appears in the schema, RLS policies, the queue functions,
`backend/db/jobs.py`, the Realtime publication, and `types/database.generated.ts`. D-018's text still
says `jobs`; this entry is the reconciliation. The Python *module* stays `backend/db/jobs.py`, since
the directory already scopes it.

**Follow-up / validation required.** None.

---

### D-034 — Re-analysis upserts on identity and tombstones stale rows; it never deletes

**Decision.** Questions upsert on `(paper_id, label_path, normalized_hash)` and question groups on
`(folder_id, normalized_hash)`. A question that re-extraction no longer produces is set to
`status = 'tombstoned'` rather than deleted. Advisory similarity clusters, by contrast, *are* deleted
and rebuilt.

**Context.** D-011 gives questions and groups content-addressed identity, and D-012 keys corrections on
question id. The previous implementation deleted and recreated groups on every run
(`analysis_services.py:129-133`), which is why its positional ids changed and why nothing could safely
reference them. `group_overrides` references group uuids, and `question_corrections` references question
uuids, both with `on delete cascade`.

**Reasoning.** Those cascades make the delete-and-recreate pattern actively dangerous rather than
merely wasteful: re-analysing a folder would delete every group, cascade to every override, and destroy
the user's merge/split decisions with no error and no trace. Upserting on the identity key means a
group's uuid survives re-analysis, which is what makes it safe for other tables to point at it — and it
is the property that turns D-011's content addressing from a nice idea into working idempotency.

Tombstoning rather than deleting stale questions follows the same logic one level down. A question can
legitimately disappear from re-extraction — the PDF was replaced, or normalization changed — and
deleting it would cascade to its corrections. A student's correction is unrecoverable work; a stale row
excluded from analysis costs a little storage. `list_folder_questions` filters
`status != 'tombstoned'`, so tombstoned rows never reach analysis.

Clusters are the deliberate exception, and the asymmetry is the point of D-024: fuzzy output is
advisory, nothing references a cluster by id, so rebuilding them cannot orphan anything. That is
precisely why the threshold can be retuned freely.

**Alternatives considered.** (1) Delete and recreate everything, as before. (2) Hard-delete stale
questions and accept correction loss. (3) Reference groups by `(folder_id, normalized_hash)` instead of
uuid, so identity is the only key.

**Rejected alternatives and reasons.** (1) Rejected: silently destroys user data via cascade.
(2) Rejected: the failure is invisible and unrecoverable, which D-012 exists to prevent. (3) Rejected
as the closest call — it is arguably purer, since identity *is* the hash. Rejected because a composite
text key on every child table is heavier to index and join than a uuid, and because a normalizer change
would then rewrite every foreign key rather than one column. Recorded because it is the design to
revisit if group uuids ever prove unstable.

**Consequences.** Re-processing an unchanged folder is a genuine no-op. The schema comment on
`group_overrides` states this dependency explicitly, so a future change to delete-then-insert has a
warning attached at the place it would break. `_tombstone_missing` issues one update per stale row,
which is fine at a folder's scale and would need batching at a much larger one.

**Follow-up / validation required.** Integration-test the full cycle against a real project: extract,
correct, re-extract, and assert the correction survives and still resolves to the same question. This is
the most important untested claim in the phase — the logic is written but has never run against a real
database (see "remaining inconsistencies").

---

### D-035 — `reference_year` is set once from the newest paper and does not drift upward

**Decision.** `folders.reference_year` is set the first time analysis runs, from the most recent paper
year, and then left alone — including when newer papers are added. Changing it is a deliberate user
action.

**Context.** D-014 requires recency be measured against a stored reference year rather than the clock,
and notes the year "must be set at folder creation — defaulting to the latest paper year is the natural
rule". It did not say what happens when a newer paper arrives.

**Reasoning.** Recomputing it on every upload would reintroduce the same problem D-014 fixed, in a
subtler form. If the reference year tracked the newest paper, adding a 2026 paper to a folder would
rescore every question in it, and a student who had learned that a topic was high-priority would find
it silently demoted — not because the exams changed, but because the yardstick moved. That is the same
class of defect as reading the clock: results changing without the inputs changing.

Storing it also has to be real storage, not inference at read time. An inferred value would vary with
the folder's contents and produce exactly the drift above.

**Alternatives considered.** (1) Track the newest paper year automatically. (2) Always use the current
year. (3) Require the user to set it at folder creation.

**Rejected alternatives and reasons.** (1) Rejected: silent rescoring, as above. (2) Rejected: this is
the AUDIT.md §4.8 defect. (3) Rejected as friction at the least informed moment — a student creating a
folder has not uploaded anything yet, so there is nothing to base the answer on. Deriving it on first
analysis and letting the user change it later is the same outcome without the upfront question.

**Consequences.** Scores are stable as a folder grows. A folder whose reference year is genuinely stale
needs a user action to update it, so Phase 4 must expose it. `ensure_reference_year` returns `None` when
no paper has a year yet, and scoring then uses its neutral recency value rather than consulting the
clock — verified by `test_missing_reference_year_falls_back_to_neutral`.

**Follow-up / validation required.** Phase 4 must make `reference_year` visible and editable, per
D-014's open question. Confirm with Swayam whether adding a paper newer than the reference year should
prompt the user to update it.

---

### D-036 — `llm_cache` is scoped per folder; `llm_usage` is not user-writable

**Decision.** Key `llm_cache` on `(folder_id, feature, model, prompt_version, input_fingerprint)` with
a `user_id` column and normal RLS, rather than a global content-addressed cache. Give `llm_usage` a
select policy only — no insert, update or delete for `authenticated`.

**Context.** D-023 specifies a cache keyed on `hash(feature, model, prompt_version, input_fingerprint)`
and per-user daily budget counters, with both tables created now and limits left as environment
configuration.

**Reasoning.** A cache keyed purely on content, shared across users, would be cheaper — the same
question asked at two universities would be generated once. It would also be an inference channel: a
user could submit a fingerprint and learn from a cache hit that some other user's folder contains that
exact question text. That is the same reasoning D-017 uses to keep `normalized_hash` out of the public
share projection, so applying it inconsistently here would undermine it. Per-folder scoping keeps the
"generated once, served to every viewer of that folder including public share viewers" property that
D-023 actually requires, and gives up only cross-user reuse.

`llm_usage` being read-only to users is the difference between a budget and a suggestion. A user who
could write their own counters could reset them, and D-023's daily budget would enforce nothing. Users
can see their own spend; only the server, with the secret key, increments it. Verified by
`test_llm_usage_is_not_user_writable`.

`question_corrections` follows the same shape for the same reason: it has select, insert and delete
policies but deliberately no update policy, so an append-only audit trail cannot be rewritten in place
(D-012). Verified by asserting an owner's own update affects zero rows.

**Alternatives considered.** (1) A global cross-user cache keyed on content only. (2) Let users write
`llm_usage` and trust the application. (3) No cache tables until Phase 4 builds the features.

**Rejected alternatives and reasons.** (1) Rejected: the inference channel above. (2) Rejected: a
bypassable budget is not a cost control. (3) Rejected: Swayam approved creating both tables now.

**Consequences.** Two tables exist with policies and no code using them yet, which is intended — D-023
requires the controls to be defined before any AI feature ships. A popular question is generated once
per folder rather than once globally, an accepted cost.

**Follow-up / validation required.** Phase 4 must set the actual numbers (model, token cap, daily
budget, rate limit), per D-023, and must test that a public share link cannot trigger generation.

---

### D-037 — Question type and difficulty are keyword-and-marks heuristics, ordered most-specific-first

**Decision.** Implement `question_type` and `difficulty` in `backend/analysis/tagging.py` as
deterministic keyword and marks heuristics. Type checks run most-specific-first and the first match
wins; difficulty combines cognitive-demand keywords, marks, and question type into a small score. Both
return `None` when there is no signal, and both are user-correctable.

**Context.** AGENTS.md requires question-type tagging (Numerical, Derivation, Diagram/Pipeline, Short
Note) and difficulty tagging (Easy, Medium, Hard). The previous implementation had
`"long" if marks >= 10 else "short"` (`batch_processor.py:280`), which describes length rather than
type and matches none of the required categories; difficulty did not exist. D-012 makes both
correctable, and D-023 forbids the deterministic core depending on an LLM.

**Reasoning.** An LLM would classify more flexibly, but D-014 and D-023 rule it out for anything
feeding the deterministic differentiators, and difficulty feeds nothing while type feeds the UI — so a
cheap deterministic rule that a student can override beats an opaque one that is right slightly more
often and cannot be reproduced.

Ordering is the substantive decision. "Derive the formula and draw the circuit" legitimately matches
both `derivation` and `diagram`, so something has to break the tie. Most-specific-first with
first-match-wins is predictable and explainable to a student; counting keyword matches would make the
outcome depend on how many synonyms each category happens to list, which is an artefact of the word
lists rather than a property of the question.

Returning `None` rather than guessing matters for the same reason page numbers do (D-013): an untagged
question is honest, a confidently mistagged one is not.

**Alternatives considered.** (1) Keep the marks threshold. (2) LLM classification. (3) Highest
keyword count wins. (4) Leave both columns null until Phase 4.

**Rejected alternatives and reasons.** (1) Rejected: does not answer the question asked, and the
categories do not match the product. (2) Rejected: contradicts D-023; an LLM may *suggest* for user
confirmation but never write silently. (3) Rejected: outcome depends on word-list length, and ties
resolve unpredictably. (4) Rejected: both are in approved scope and the schema has the columns.

**Consequences.** Every extracted question gets a type and usually a difficulty, computed at extraction
time with no per-call cost. The keyword lists are computer-science-centric, which is a real limitation
for other subjects and is stated in the module docstring. Both fields are in D-012's correctable list,
so a wrong tag is fixable.

**Follow-up / validation required.** Measure tagging accuracy against real papers alongside D-024's
similarity measurement. Phase 4 must expose the correction UI, or the heuristics are unfixable in
practice.

---

### D-038 — The D-028 blacklist narrowing is implemented as header-position matching

**Decision.** Split the metadata blacklist into `STRONG_METADATA`, which rejects anywhere, and
`WEAK_METADATA` (`course`, `semester`, `degree`, `tech`, `autumn`, `spring`, `branch`), which rejects
only when `looks_like_header()` agrees. Header detection uses three signals in priority order: a
question cue or question mark means it is a question and wins outright; a short `Label: value` line is a
header; text of six words or fewer with no question cue is treated as a header.

**Context.** Swayam approved moving institution patterns to configuration and narrowing the over-broad
terms (D-028). D-028 identified the defect — the blacklist was tuned against page headers but applied to
question text, so "Explain the semester system's effect on scheduling" was silently discarded — but did
not specify the mechanism.

**Reasoning.** Position is the signal that actually distinguishes the two cases. "Semester: 4th" is a
form field; "Explain the semester system" is a question, and what separates them is not the word
`semester` but the shape of the surrounding text. Making the question cue authoritative means a false
negative is preferred to a false positive: keeping a header costs one junk row a student can ignore,
while dropping a real question loses content silently, which is the failure D-028 set out to fix.

The six-word threshold is a judgement call, chosen because a genuine exam question needs roughly that
many words to ask anything, and it only applies when no question cue is present.

**Alternatives considered.** (1) Remove the weak terms entirely. (2) Reject weak terms only in the
first N lines of a document. (3) Require two weak matches before rejecting.

**Rejected alternatives and reasons.** (1) Rejected: readmits genuine header noise the blacklist was
built for, regressing extraction quality on the KIIT/NITR papers the parser was verified against.
(2) Rejected: headers repeat mid-document on multi-page scans, and the parser sees a flattened stream,
so "first N lines" is not meaningful. (3) Rejected: "Course: Database Management Systems" contains one
weak term and is unambiguously a header.

**Consequences.** Verified in both directions: questions mentioning `semester`, `course`, `degree` and
`tech` are kept; `Course: Database Management Systems (CS-204)` and `Semester: 4th` are still rejected;
strong markers like `Registration No` reject regardless of shape. The KIIT pattern is verified to come
from the profile rather than the code — the `default` profile rejects a sentence mentioning KIIT and the
`generic` profile does not, which is the executable proof that D-028's parameterization is real.

**Follow-up / validation required.** D-028 asks for rejection rates measured before and after on real
papers. Not done: no real papers are available in this environment, and using student PDFs from git
history would compound the privacy problem in AUDIT.md §4.11.

---

### D-039 — Patch transitive dependency vulnerabilities with `overrides` rather than upgrading to Next.js 16

**Decision.** Pin `next@15.5.23` and `vitest@3.2.7`, and add npm `overrides` forcing `sharp@0.35.3` and
`postcss@8.5.26`. Do not take `next@16`.

**Context.** My initial pins were `next@15.5.4` and `vitest@3.2.4`. `npm audit` reported 4
vulnerabilities including 2 critical: `next@15.5.4` carries a long list of advisories up to and
including RCE via the React flight protocol, and `vitest@3.2.4` allows arbitrary file read and
execution when its UI server is listening. **These were introduced by my own version choices**, not
inherited from the repository, which had no `package.json` at all.

Two transitive packages remained after the direct upgrades. `next@15.5.23` pins `postcss` at exactly
`8.4.31`, and takes `sharp ^0.34.3` as an optional dependency; both versions carry advisories. npm's
only offered fix was `next@16.3.1`, flagged `isSemVerMajor`.

**Reasoning.** A security patch should not smuggle in a breaking framework upgrade. Overriding pulls
both transitive packages to patched versions inside the same major line, which is low-risk and widely
exercised — `vite` already resolves `postcss@8.5.26` independently, so the combination is in normal use.
`sharp` is an optional dependency used for `next/image` optimization, so a minor bump has a small blast
radius. Taking `next@16` would be a Phase 4 decision about the framework, made deliberately, not a side
effect of running `audit fix --force` during Phase 2.

**Alternatives considered.** (1) `npm audit fix --force`, accepting `next@16`. (2) Leave the transitive
advisories and document them. (3) Drop `next/image` usage so `sharp` is unnecessary.

**Rejected alternatives and reasons.** (1) Rejected: a breaking major upgrade taken for the wrong
reason, and untested against a codebase with no UI yet. Worth doing deliberately in Phase 4. (2)
Rejected: a high-severity path-traversal advisory in the CSS toolchain is not something to carry
knowingly when a one-line override fixes it. (3) Rejected: pre-emptively giving up a framework feature
to avoid a dependency bump.

**Consequences.** `npm audit` reports **0 vulnerabilities**. The overrides are annotated in
`package.json` with why they exist and the instruction to re-check on every Next.js upgrade — an
override that outlives its reason silently pins a stale dependency. `npx tsc --noEmit` and the 6 Vitest
tests pass on these versions.

I also removed the `lint` script I had written, which referenced `eslint` without adding it or a config
— a script that cannot run is worse than an absent one, because it reports a false pass when skipped.

**Follow-up / validation required.** Phase 4 should evaluate `next@16` on its merits and drop the
overrides if it resolves them. Add ESLint with the Next.js config when there is UI code to lint.

---

### D-040 — `requirements.txt` pins are labelled by whether they were actually verified

**Decision.** Pin all nine dependencies exactly (D-029), and annotate each with `[verified]` or
`[not installed]` according to whether the local environment actually has it. Drop `python-jose`
entirely.

**Context.** D-029 approved pinning to "the versions verified in AUDIT.md §4.9". Those versions were
resolved in a throwaway venv during Phase 0 and are not what this machine has: `fastapi`, `uvicorn`,
`pymupdf`, `pillow`, `pytest` and `httpx` are present at specific versions, while `pytesseract`,
`rapidfuzz`, `supabase` and `python-multipart` are absent.

**Reasoning.** Pinning a version I have not executed and presenting it as verified would be a false
claim of the kind AGENTS.md §Delivery Requirements forbids. The honest form is to pin all of them —
reproducibility is the point — while marking which pins carry test evidence. The six `[verified]`
packages are the versions the 147-test suite actually passed against. The four `[not installed]`
packages are resolved from PyPI and unexercised here.

`python-jose` is dropped rather than pinned because D-019 and D-021 retire end-user JWT verification
entirely: this service authenticates *callers* with a shared token, never users. Keeping a JWT library
would imply a protection that does not exist, which is the same reasoning that retired
`SUPABASE_JWT_SECRET`.

**Consequences.** Builds are reproducible. The four unverified pins are the ones to re-check after a
clean install, and the file says so. Notably, the absence of `rapidfuzz` and `supabase` locally is what
forced the graceful-degradation and lazy-import designs to be real rather than theoretical: the backend
imports and its full test suite passes without either package.

**Follow-up / validation required.** Run a clean `pip install -r backend/requirements.txt` in a fresh
venv and re-run the suite, to convert the four `[not installed]` pins to verified.

---

## Phase 2 and 3 — verification results

Every claim below was executed. Nothing here is inferred.

| Check | Command | Result |
|---|---|---|
| Backend unit and integration tests | `python -m pytest backend/tests/ -q` | **147 passed** |
| Doctests in pure modules | `python -m pytest --doctest-modules ...` | **9 passed** |
| Schema, RLS, storage, job queue | `bash supabase/tests/run_tests.sh` | **66 assertions passed** |
| Migration idempotency | second pass in the same runner | **clean no-op** |
| TypeScript | `npx tsc --noEmit` | **exit 0** |
| Share projection allowlist | `npx vitest run` | **6 passed** |
| Dependency audit | `npm audit` | **0 vulnerabilities** |
| Service imports without optional deps | `import backend.main, backend.worker` | **OK** — 3 routes registered |

**What is verified and what is not.** The pure extraction and analysis logic, the schema, all RLS and
storage policies, and the job queue mechanics are tested against real PostgreSQL 16. The `backend/db/`
layer and the worker pipelines are **written but never executed against a real Supabase project**,
because none exists and `supabase-py` is not installed locally. Real OCR is **unverified** — Tesseract
is absent, so the success path is covered only with an injected fake, and the failure path is what the
image-only-PDF test actually exercises. RapidFuzz is absent, so clustering is tested with injected
scorers and the 0.84 threshold remains unmeasured, exactly as D-024 requires it be treated.


---

## Phase 4 and 5 � Frontend and Public Share Architecture

### D-016 � Folder Workspace Assembly via Server Components

**Decision.** The main workspace at \pp/(dashboard)/folders/[id]/page.tsx\ is built as a unified Server Component that fetches the folder data, cached analytics, and study groups in one pass. It renders Client Components (\UploadZone\, \TopicAccordions\, \StudyTools\) as children to retain maximum interactivity without passing fetching responsibilities to the client.

**Context.** We needed to pull together analytics, question groups, file uploads, and study tools into a single coherent workspace.

**Reasoning.** Doing data fetching at the route level in a Server Component guarantees security via Supabase RLS and minimizes client-side payload. The client receives only what it needs to render.

### D-017 � The Public Share Projection Boundary

**Decision.** The public share page at \pp/(public)/share/[token]/page.tsx\ acts as a strict projection boundary. It resolves the hashed share token using a privileged admin client, fetches all folder data, and filters it via a pure function \uildSharedFolder\ before passing it to the UI.

**Context.** Students need to share folders publicly without requiring classmates to log in, but without leaking private paths, internal IDs, or exposing other folders.

**Reasoning.** By having the Server Component do the privileged read and immediately mapping the data into a safe \SharedFolder\ interface, we guarantee zero accidental data leakage. Any field not explicitly added to the projection interface will simply not exist in the public output.

### D-018 — Frontend Reference Architecture and Design System Unification

**Decision.** Unified all reference screen components from `frontend/Ref/` into a cohesive Next.js App Router frontend architecture. Placed the official branding logo (`/logo.png`) in the top application header, constructed a docked navigation rail (`SideNav`), standardized the design system on a developer-grade academic intelligence theme (Inter + JetBrains Mono, Tailwind v4 tokens), and assembled the Exam Hub dashboard, Question Intelligence workspace, High-Yield Checklist with a 25-minute Pomodoro study session timer, AI Predicted Mock Paper Generator, and 3D flashcard active recall mode.

**Context.** The reference folder contained 6 disparate design bundles with alignment discrepancies, disjointed header placements, and isolated screen mockups. We needed a production-ready, standardized layout adhering to strict geometric equilibrium.

**Reasoning.** Integrating all individual modes into unified Server and Client components under shared layout shells ensures complete type safety, responsive desktop and mobile flexibility, zero TypeScript errors, and seamless user interaction without navigation friction.
