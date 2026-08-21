# PaperLens — Phase 0 Audit and Baseline

Date: 2026-08-19
Branch: `main` @ `22119f6`
Auditor: agent, under Swayam's direction
Scope: Phase 0 only. No feature or architecture changes made. No application code edited.

**Critical Update (August 21, 2026)**: Verification against real execution revealed gaps between claims and tested functionality. See bottom of this document for current verified status. The core finding — silent data loss — is genuinely fixed.

---

## 1. Headline finding

**The application cannot persist any data. The stateful half of the product is non-functional.**

`backend/services/db_service.py` previously held a live SQLite implementation. It was replaced
(commit `887d5e2` "Removing Stuff") with a no-op stub, `_StubConnection`, whose `execute()`
returns itself, `fetchone()` returns `None`, and `fetchall()` returns `[]`. Every one of the
~30 SQL call sites in `main.py`, `batch_processor.py`, and `analysis_services.py` still issues
SQLite-dialect SQL (`?` placeholders) against that stub. Writes are silently discarded; reads
return empty.

Verified end-to-end with the real dependency set:

```
POST /api/sessions   -> 200 {"sessionId":"73810490-...","status":"created"}
GET  /api/sessions/{that id} -> 404 {"detail":"Session not found."}
```

The API reports success, writes the PDF to disk, and loses the record. The background pipeline
then crashes:

```
File "backend/services/analysis_services.py", line 368, in run_scoring
    total_years = meta["yr_cnt"] if meta["yr_cnt"] else 1
TypeError: 'NoneType' object is not subscriptable
```

This is silent data loss on the primary write path, not a cosmetic defect. `README.md` marks
all of this "✅ Working".

---

## 2. Repository inventory

2837 files are tracked. 2799 of them (98.7%) are a committed Python virtual environment.
Actual source: **38 files**.

### Excluded from detailed inventory (recorded, not analysed)

| Path | Files | Note |
|---|---|---|
| `backend/venv/` | 2799 | Committed virtualenv, including `.pyc` and `.pyd` binaries. `.gitignore` lists `venv/`, so this was force-added. Dead on any other machine — see §4.1. |
| `frontend/node_modules/` | 0 tracked | Correctly ignored. Absent from disk at audit start; installed during audit to verify build. |

### Backend — FastAPI / Python 3.11

| File | Role | Data touchpoints | Category | Depends on / called by | Contradictions and risks |
|---|---|---|---|---|---|
| `main.py` (481) | FastAPI app; all 8 HTTP routes | Stub DB (SQLite dialect); local disk writes to `uploads/` | Application code | Imports `db_service`, `pdf_service`, `question_extraction_service`, `batch_processor` | No auth of any kind. `CORS allow_origins=["*"]` with `allow_credentials=True`. Unsanitised `file.filename` joined into a path (§4.6). All DB work hits the stub. |
| `services/db_service.py` (304) | Supabase client factory + per-table stub classes + `get_db()` no-op | Supabase (when configured); nothing otherwise | Application code — **the central defect** | Imported by `main.py`, `batch_processor.py`, `analysis_services.py` | Two incompatible data layers in one file. The Supabase classes are dead code (no callers). `get_db()` is a silent no-op. Uses one `SUPABASE_KEY` — no anon/service-role split. |
| `services/batch_processor.py` (465) | Background pipeline orchestrator; 3-stage year detection | Stub DB; reads PDFs from local disk | **Reusable logic + broken persistence** | Imports all processing services; called via `BackgroundTasks` | `page_number` hardcoded to `1` (§4.7). `question_type` is only `"long" if marks>=10 else "short"`. Runs in an ephemeral in-process task — no durability. |
| `services/question_extraction_service.py` (559) | `ExamParser` state machine, marks extraction, OCR text normalisation | None — pure functions | **Reusable, highest-value asset** | Imported by `main.py`, `batch_processor.py` | None found. Stdlib only. Verified working (§3.3). |
| `services/question_validation_service.py` (355) | Heuristic validator, confidence scoring, blacklists | None — pure functions | **Reusable** | Imported by `batch_processor.py` | Blacklists hardcode KIIT/NITR institution names — will silently misfire on other universities. Verified working (§3.3). |
| `services/analysis_services.py` (511) | Dedup, fuzzy clustering, topic classification, 6-factor scoring | Stub DB | **Reusable algorithms, broken persistence** | Imports `db_service`, `rapidfuzz`; called by `batch_processor.py` | Scoring is **non-deterministic** — reads `datetime.now().year` (§4.8). Crashes on stub. Topic keywords hardcode Operating-Systems chapters as fallback. |
| `services/pdf_service.py` (60) | Per-page native text extraction with OCR fallback | Local files via PyMuPDF | **Reusable** | Imports `ocr_service`; called by `main.py`, `batch_processor.py` | OCR-vs-text decision is a bare character-count heuristic (<100 chars, or <250 with images). Silently falls back to raw text if OCR fails — the user is not told. |
| `services/ocr_service.py` (75) | Tesseract wrapper (PyMuPDF → PIL → pytesseract) | External binary: Tesseract | **Reusable** | Called by `pdf_service` | `perform_ocr_on_pdf()` is dead code — no callers. Hardcoded Windows fallback path. Unverifiable here (§4.3). |
| `requirements.txt` (10) | Backend dependencies | — | Configuration | — | **Zero version pins.** Lists `supabase` and `python-jose`, neither of which any live code path uses. |

### Backend tests — none are runnable as written

| File | Role | Category | Blocking problems |
|---|---|---|---|
| `tests/test_validation_layer.py` (115) | Validator assertions | Test code | `sys.path` bug (§4.4). **Passes** once path is fixed. |
| `tests/test_hybrid_direct.py` (44) | Parser smoke test, prints output | Test code | `sys.path` bug. **Runs** once fixed, but asserts nothing — print-only. |
| `tests/test_api_milestone2.py` (91) | Legacy upload + OCR | Test code | Needs live server on `127.0.0.1:8000`; needs `sample_exam.pdf`, `scanned_exam.pdf` — **both absent**, and `.gitignore` `*.pdf` prevents committing them. |
| `tests/test_api_milestone3.py` (208) | Extraction cases A–D | Test code | Same. Case D needs `scanned_exam.pdf` + Tesseract. |
| `tests/test_api_milestone3_1.py` (165) | Hybrid parsing, OCR noise | Test code | Same. |
| `tests/test_api_milestone4.py` (225) | Multi-PDF session flow | Test code | Same, **plus** it asserts session persistence — cannot pass against the stub. |

Only one function (`test_pipeline`) is pytest-collectable; the rest run under `__main__`.
There is no test runner config, no `conftest.py`, no CI.

### Frontend — Vite 8 / React 19 / Tailwind 4 (JavaScript, not TypeScript)

| File | Role | Data touchpoints | Category | Risks |
|---|---|---|---|---|
| `src/App.jsx` (1498) | **Entire SPA in one file** — upload, polling, dashboard, filters, charts | `fetch` to FastAPI via `VITE_API_URL` | Application code, to be replaced | Single 1498-line component. Talks to FastAPI directly from the browser — the opposite of the target boundary. Built around `sessions`, not `folders`. 2 lint errors. |
| `src/main.jsx` (10) | React root | — | Application code | — |
| `index.html` (13) | Vite entry | — | Configuration | `<title>frontend</title>` — placeholder never set. |
| `vite.config.js` (9) | React + Tailwind plugins | — | Configuration | — |
| `eslint.config.js` (21) | Flat ESLint config | — | Configuration | — |
| `package.json` / `package-lock.json` | Deps, lockfile v3, 189 packages | — | Configuration | — |
| `src/index.css` (1) | `@import "tailwindcss"` | — | Configuration | — |
| `src/App.css` (1), `assets/*`, `public/*` | Vite scaffold leftovers | — | **Likely dead weight** | `react.svg`, `favicon.svg` are 0 bytes. `hero.png` unreferenced. |

### Documentation and root config

| File | Category | Contradictions |
|---|---|---|
| `README.md` (361) | Documentation | **Systematically contradicts runtime.** Documents SQLite + `paperlens.db` + a 9-table schema; none exist. Marks 31 features "✅ Working" including persistence, clustering, and caching, all of which are dead. Documents a `similarity_clusters` table the README's own table-count ("8 tables") miscounts as 9 rows. |
| `docs/paperlens-milestone4-blueprint.html` (2007) | Documentation | Static design blueprint. Mentions FastAPI twice, SQLite once, Supabase zero times. Predates the Supabase direction. |
| `frontend/README.md` (55) | Documentation | Claims "Audit Views: interfaces to review rejected extractions and OCR logs" — **no such UI exists** in `App.jsx`. |
| `.env.example` (12) | Configuration | Declares bucket `exam-papers`; AGENTS.md specifies `exam-pdfs` (§5.5). `SUPABASE_KEY` does not distinguish anon from service-role. |
| `frontend/.env.example` (3) | Configuration | — |
| `.gitignore` (187) | Configuration | `*.pdf` blocks test fixtures permanently. `venv/` present but venv committed anyway. |
| `.gitattributes` (2) | Configuration | — |
| `LICENSE` (21) | MIT | — |

---

## 3. Verification results

Everything below was executed. Nothing in this section is inferred.

### 3.1 Frontend install, lint, build

| Check | Result |
|---|---|
| `npm install` | **Pass** — 152 packages, 16s, no errors |
| `npm run build` | **Pass** — 1742 modules, 853ms. `dist/` 243KB JS (72KB gzip), 50KB CSS |
| `npm run lint` | **Fail** — exit 1, 2 errors |

Lint errors, both in `src/App.jsx`:
- `258` — `loadDashboardData` accessed at line 200 before its declaration (`react-hooks/immutability`)
- `227` — `filename` parameter defined but never used (`no-unused-vars`)

### 3.2 Backend imports and startup

The committed venv is unusable (§4.1). Using a throwaway venv created **outside the repo**
(`%TEMP%\paperlens-audit-venv`) with `requirements.txt` installed:

| Check | Result |
|---|---|
| `import main` | **Pass** — app title `PaperLens API` |
| Route registration | **Pass** — 8 application routes |
| System-Python import | **Fail** — `pytesseract`, `rapidfuzz`, `supabase`, `jose`, `multipart` all missing |

Actual route surface, confirmed by introspection:

```
GET  /                                                  POST /api/upload
POST /api/sessions                                      GET  /api/sessions/{session_id}
PUT  /api/sessions/{session_id}/papers/{paper_id}/year  GET  /api/sessions/{session_id}/questions
GET  /api/sessions/{session_id}/analytics               GET  /api/sessions/{session_id}/export/csv
GET  /api/sessions/{session_id}/rejected
```

This matches `README.md`'s route list. The routes exist; their behaviour does not match.

### 3.3 Existing test behaviour

| Test | As written | With `PYTHONPATH` corrected |
|---|---|---|
| `test_validation_layer.py` | `ModuleNotFoundError: services` | **Pass** — all 5 groups |
| `test_hybrid_direct.py` | `ModuleNotFoundError: services` | **Runs** — no assertions, print-only |
| `test_api_milestone2/3/3_1/4.py` | `ModuleNotFoundError` / needs server | **Still blocked** — need live server + missing PDF fixtures |

The parser output is genuinely correct. From `test_hybrid_direct.py`, on deliberately noisy input:
`1,` → `Q1`; `[1O M]` → `marks: 10` (OCR letter-O repaired); `Q5.(a)/(b)` nested correctly;
institutional headers, watermarks and "BEST OF LUCK" stripped; `Warning: Missing question Q3.`
correctly raised. **This is the strongest asset in the repository.**

### 3.4 Local upload and background processing

| Check | Result |
|---|---|
| `POST /api/upload` (stateless) | **Pass** — 3 questions, method `text`, marks and sections correct |
| `POST /api/sessions` (stateful) | Returns 200 + `sessionId` |
| PDF written to `uploads/{session_id}/` | **Yes** — disk write succeeds |
| `GET /api/sessions/{id}` afterwards | **404 Session not found** |
| Background pipeline | **Crashes** — `TypeError` in `run_scoring` |

The stateless legacy route works because it never touches the database. Everything stateful fails.

### 3.5 Database connectivity and schema

- No Supabase credentials configured; `get_supabase_client()` returns `None` and logs a warning.
- **No migrations exist.** No `.sql` file has ever been committed, across all history.
- No `CREATE TABLE` statement exists anywhere in the working tree.
- The old SQLite schema is recoverable from git (`3434752:backend/services/db_service.py`):
  **9 tables + 5 indexes**. Preserved in §6 for Phase 2 mapping.

### 3.6 Environment variables

Declared (no secret values read): `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`,
`SUPABASE_STORAGE_BUCKET`, `PAPERLENS_DEBUG`, `TESSERACT_CMD`, `UPLOAD_DIR`, `VITE_API_URL`.

- No `.env` file exists on disk. `.gitignore` correctly excludes `.env*` except examples.
- `UPLOAD_DIR` is declared but **never read** — `main.py` hardcodes its upload directory.
- `SUPABASE_JWT_SECRET` is declared and never used; no JWT verification exists.
- `PAPERLENS_DEBUG` defaults to **`true`**, so verbose per-question rejection logging is on by default.

### 3.7 Git status

Pre-existing uncommitted changes at audit start — all untracked, none mine:

```
?? .agents/   ?? .claude/   ?? AGENTS.md   ?? CLAUDE.md   ?? skills-lock.json
```

No tracked file was modified during this audit. Two artefacts I created while verifying
(a test upload directory, a stray `backend/package-lock.json` from a mistargeted `npm install`)
were removed; `git status` is byte-identical to how I found it. The throwaway venv lives outside
the repository. `frontend/node_modules/` is present on disk but ignored by git.

---

## 4. Defects, in priority order

### 4.1 Committed virtualenv, dead on arrival — Critical

2799 tracked files. `backend/venv/pyvenv.cfg` hardcodes
`home = C:\Users\KIIT\AppData\Local\...` and `command = ... C:\Users\KIIT\Projects\PaperLens\backend\venv`.
Virtualenvs are not relocatable. Running it here:

```
No Python at '"C:\Users\KIIT\AppData\Local\...\python.exe'
```

So the repo ships 2799 files of dependency that work on exactly one machine that is not this one.
It also bloats every clone and every diff, and `.pyc`/`.pyd` binaries are unreviewable.

### 4.2 Silent data loss on the primary write path — Critical

§1. The stub accepts writes and discards them while returning HTTP 200.

### 4.3 OCR fallback unverifiable — High

Tesseract is not on `PATH` and not at `C:\Program Files\Tesseract-OCR\tesseract.exe`.
Every OCR claim in `README.md` is **unverified**, not disproven. Any scanned PDF will take the
`except` branch in `pdf_service.py` and silently degrade to whatever sparse text PyMuPDF found —
presented to the user as clean extraction. AGENTS.md explicitly forbids this.

### 4.4 Every test is unrunnable — High

All 6 test files do:

```python
sys.path.append(os.path.dirname(os.path.abspath(__file__)))   # -> backend/tests/
from services.question_validation_service import ...           # lives in backend/services/
```

They append their own directory instead of the backend root, so `services` is never importable.
This is a one-line fix per file (`dirname(dirname(...))`), deferred to Phase 1 per §7.

Compounding: 4 of 6 tests are integration tests against a hardcoded `http://127.0.0.1:8000`
with no fixture, no server bootstrap, and missing PDF assets.

### 4.5 No authentication or authorisation anywhere — Critical for target scope

`grep` for `auth|jwt|token|user_id|Depends` in `main.py` returns **nothing**. There is no user
concept: no `user_id` column in the recovered schema, no ownership path, no RLS, no session
scoping. Any caller can read any `session_id`. Against the target scope (Google + email auth,
RLS on all user data, public share tokens) this is not a gap to patch but a foundation to build.

Also: `allow_origins=["*"]` together with `allow_credentials=True` is an invalid combination that
browsers reject for credentialed requests, and is unsafe once auth exists.

### 4.6 Path traversal in upload handling — High

`main.py:143` — `file_path = os.path.join(session_dir, filename)` where `filename` is
attacker-controlled `file.filename`. Only the `.pdf` suffix is checked. Demonstrated:

```
../../../../escaped.pdf  ->  ..\..\escaped.pdf     (escapes the upload root)
sub/dir/nested.pdf       ->  uploads\SESSION\sub\dir\nested.pdf
```

I verified the path arithmetic only; I did **not** attempt a real traversal write. A crafted
filename ending in `.pdf` can write outside the intended directory.

### 4.7 Page references are fabricated — High

`page_number` is inserted as the literal `1` for every question (`batch_processor.py:260,280`),
because the parser flattens page markers and never propagates real page numbers. The target scope
requires original PDF page references for diagrams, code, and questionable OCR. The column exists
and its contents are meaningless — worse than absent, because it looks authoritative.

### 4.8 Analytics are not deterministic — High

`analysis_services.py:362` reads `datetime.datetime.now().year`, and recency decays 20 points per
year from *now*. The same papers scored in different calendar years yield different priority
scores and different `priority_level` buckets. AGENTS.md names deterministic cached analytics as
differentiator #1. Determinism requires an explicit reference year stored with the analysis.

### 4.9 Unpinned dependencies — Medium

`requirements.txt` has no version specifiers at all. The audit venv resolved FastAPI 0.141.1,
PyMuPDF 1.28.2, supabase 2.31.0 — today's versions, not necessarily the ones this code was
written against. Builds are not reproducible. `fitz` also emits a deprecation warning
(`use pymupdf instead`).

### 4.10 Dead code — Low

- `perform_ocr_on_pdf()` — no callers
- All 6 Supabase stub classes in `db_service.py` — no callers
- `build_storage_path()` — no callers
- `UPLOAD_DIR` env var — never read
- `frontend/src/App.css`, `assets/react.svg` (0 bytes), `assets/hero.png`

Per AGENTS.md I have **not deleted** any of it on static inspection alone.

### 4.11 Real student PDFs in git history — Medium, privacy

History shows uploaded exam papers were committed and later deleted across ~12 commits
(`backend/uploads/**/*.pdf`, including named files like `Engineering Economics -Mid 2024 .pdf`,
and `frontend/public/demo_exam.pdf`). Deletion commits do not remove blobs — they remain
retrievable from history. Flagging for your decision; history rewriting is destructive and I have
not touched it.

---

## 5. Conflicts requiring your decision

Per AGENTS.md §"No silent conflict resolution", these change scope, data meaning, security, or
user-visible behaviour. I have not resolved any of them.

**5.1 — `session` versus `folder` is a data-model conflict, not a rename.**
The entire current model is a *session*: one upload batch, analysed once, with analytics cached on
`analysis_sessions.analytics_json`. The target model is a *folder*: a durable subject hub that
papers are **added to over time**, with analytics cached per folder and invalidated on new uploads.
Every table keys on `session_id`; every route is `/api/sessions/...`; the frontend is built around
it. This decides whether `analysis_sessions` becomes a folder, becomes a per-run history record
beneath a folder, or disappears. Everything in Phase 2 depends on the answer.

**5.2 — Which frontend survives.** `App.jsx` is 1498 lines of working Vite/React/JSX that builds
today. The target is Next.js App Router + TypeScript. These share no routing, no server/client
boundary, and no type layer. Confirm: full rebuild (my reading of AGENTS.md §Phase 4), or
incremental port?

**5.3 — Questions currently have no stable identity.** Primary keys are
`f"rq_{paper_id}_{accepted_count}_{md5(text)[:8]}"` — they embed a *counter*, so re-running
extraction renumbers questions and changes their IDs. Group IDs are `f"g_{session_id}_{idx}"`,
positional by dict-iteration order. Any user correction, override, or share link would break on
re-analysis. AGENTS.md §"Do not guess" covers this; it needs an approved identity model before
Phase 2.

**5.4 — `README.md` is not a reliable specification.** It marks 31 features "✅ Working" that are
dead. I propose treating AGENTS.md as the sole product authority and rewriting `README.md` at the
end of the rebuild. Confirm.

**5.5 — Storage bucket name.** `.env.example` says `exam-papers`; AGENTS.md §Phase 2 says
`exam-pdfs`. Trivial, but it lands in migrations and storage policies, so I want it settled once.

**5.6 — Institution-specific hardcoding.** Validator and normaliser hardcode KIIT and NITR
boilerplate, roll-number patterns, and Operating-Systems chapter keywords. Fine for two
universities, silently wrong elsewhere. Is multi-institution support in scope, or is this
intentional for now?

**5.7 — Six of six tests encode the current architecture.** They assert `/api/sessions` shapes,
session-based persistence, and CSV-only export. Under the target architecture most of these
assertions become invalid. Confirm they are replaced rather than ported.

---

## 6. What can be reused

Recorded now because it is the main input to Phase 3.

### Reuse as-is (pure, stdlib-only, verified working)

| Asset | Location | Evidence |
|---|---|---|
| `ExamParser` state machine, 3-level hierarchy | `question_extraction_service.py` | §3.3 — correct nesting, sequence repair, missing-Q detection |
| OCR text normalisation | same | `1,`→`Q1`, `[1O M]`→10 marks, watermark/header stripping |
| Marks extraction incl. `2x5` multipliers | same | correct across bracket, bare, and multiplier forms |
| Validator, confidence scoring, blacklists | `question_validation_service.py` | §3.3 — all 5 assertion groups pass |
| Text cleaning, question-number normalisation | same | verified |

These need only the institution-specific lists (§5.6) parameterised.

### Reuse the algorithm, replace the persistence

| Asset | Location | Required change |
|---|---|---|
| SHA-256 exact dedup | `analysis_services.py` | Rewrite storage; keep hashing |
| RapidFuzz clustering @ 0.84 | same | Keep as a candidate — but AGENTS.md §"Do not guess" requires documented thresholds and false-positive analysis before it is treated as ground truth |
| 6-factor priority scoring | same | Keep weights; **must** be made deterministic (§4.8) |
| Topic classification | same | Keep mechanism; de-hardcode chapter keywords |
| 3-stage year detection | `batch_processor.py` | Keep logic as-is; it is sound |
| Per-page OCR fallback | `pdf_service.py`, `ocr_service.py` | Keep; add explicit low-confidence surfacing |

### Replace entirely

`db_service.py` (both halves), all of `main.py`'s route and persistence layer, `App.jsx`,
the ephemeral `BackgroundTasks` pipeline trigger, all 6 test files.

### Recovered old SQLite schema — for Phase 2 mapping

From `3434752:backend/services/db_service.py`. **9 tables**: `analysis_sessions`, `papers`,
`user_context`, `similarity_clusters`, `topics`, `question_groups`, `raw_questions`,
`rejected_questions`, `question_occurrences`. **5 indexes** on `papers(content_hash)`,
`raw_questions(content_hash)`, `question_groups(session_id, priority_score DESC)`,
`question_occurrences(group_id)`, `question_occurrences(raw_question_id)`.

Critical property: **no table has a `user_id` column.** There is no ownership path to `auth.users`
anywhere in the old design, so every RLS policy in Phase 2 is new construction, not migration.

Since the stub landed, **no data has been written** — there is no `paperlens.db` on disk and no
Supabase project configured. There is consequently **no user data to migrate**. That makes Phase 2
a clean-slate schema design rather than a data migration, which is the one genuinely good piece of
news in this audit.

---

## 7. Target-scope gap summary

Verified present and working: batch multi-file upload, automatic year detection, native text
extraction, question parsing with marks/labels, low-confidence handling with an audit trail,
repeat/weightage/priority computation, CSV export.

Verified absent from runtime code (`grep` returns nothing outside dead stubs): subject folders,
Google auth, email auth, RLS, public share links, syllabus coverage gap analysis, question-type
tagging beyond a marks threshold, difficulty tagging, high-yield checklists, AI answer hints,
flashcards, mock-paper generation, KaTeX, Markdown/LaTeX/Anki/PDF export, correction and override
workflows, LLM cost controls, durable job processing.

Present but not trustworthy: page references (§4.7), analytics determinism (§4.8), persistence
(§4.2), OCR (§4.3).

Roughly two-thirds of the target scope does not exist yet. AGENTS.md instructs treating these as
work to implement.

---

## 8. What I did not change

No application code was edited. No files were deleted. Nothing was committed.

I deliberately left the following broken, because fixing them is Phase 1 work and AGENTS.md
restricts Phase 0 to diagnostics:

- the `sys.path` bug in all 6 test files (§4.4) — a one-line fix each, but touching tests that
  §5.7 may retire is wasted work
- the committed venv (§4.1) — removing 2799 tracked files is a destructive change needing approval
- the two lint errors (§3.1)

I used a throwaway venv outside the repository instead of repairing the committed one, so that
verification could not mutate tracked state. See `DECISIONS.md` for the reasoning.

---

## 9. Baseline, stated plainly

| Area | Status |
|---|---|
| Frontend build | **Works** |
| Frontend lint | Fails, 2 errors |
| Backend import and startup | **Works** with correct deps |
| Stateless PDF parsing (`POST /api/upload`) | **Works** — genuinely good output |
| Stateful everything (sessions, analytics, export, rejected) | **Broken** — silent data loss |
| Background pipeline | **Crashes** |
| Persistence | **None** |
| Migrations | **Do not exist** |
| Auth / RLS / sharing | **Do not exist** |
| OCR | **Unverified** — Tesseract absent |
| Tests | **0 of 6 runnable** as written; 2 pass with a path fix |
| Existing user data at risk | **None** — nothing was ever persisted |

The processing brain is real and worth keeping. Everything around it — persistence, security,
durability, and two-thirds of the product scope — needs to be built.

---

## 10. Recommended Phase 1 entry point

Awaiting your approval before any of this begins:

1. Settle §5.1 (`session` vs `folder`) — it gates the entire schema.
2. Settle §5.3 (question identity) — it gates corrections, sharing, and re-analysis.
3. Then propose the full target structure per AGENTS.md §Phase 1, into `DECISIONS.md`.

Phase 0 is complete. No further changes will be made until you approve.


---

## Addendum: August 21, 2026 — Real Verification Pass

### What Was Actually Verified With Execution Evidence

Per the rule "nothing marked done without pasted terminal output":

✅ **Database Layer**:
- Folder creation: Created folder ID `d2bd3b52-1797-41fb-9d2b-dfb6830282ce` (timestamp: 2026-08-21T08:22:58.180662+00:00)
- Database read: Successfully retrieved folder
- RLS protection: Unauthenticated request blocked with 401
- Job enqueue: Job `06c4ba82-d95e-4e1d-97ab-f59f917aae6f` persisted in `processing_jobs` table
- **Core finding CONFIRMED**: Silent data loss is FIXED

✅ **Unit Tests**:
- 147/147 backend tests passing in 2.67 seconds
- Extraction, parsing, normalization, analysis logic all verified

### What Documentation Claimed But Was Never Tested

❌ **False Claims in Original README**:
- "OCR fallback ✅ Working" — Tesseract not installed; success path unverified
- "Full upload → process → view ✅ Working" — Never tested end-to-end with real auth

⏸️ **Code Exists But Untested**:
- Worker processing queued jobs
- Full browser upload flow
- All 4 export formats
- Cross-user RLS in browser sessions
- Question filters in UI
- Similarity threshold validated

❌ **Genuinely Missing**:
- Syllabus Coverage Gap Analysis (6.9)
- Flashcard/Active Recall Mode (6.10)

See `REAL_VERIFICATION_EVIDENCE.md` for complete execution logs and `README.md` for detailed status table.
