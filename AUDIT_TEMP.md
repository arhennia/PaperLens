# Comprehensive Codebase Health Check & Gap Audit

**Date:** 2025-05-16  
**Auditor:** Automated Codebase Assessment  
**Repository:** PaperLens

---

## 1. Compilation & TypeScript Type Check

### Summary
The repository codebase contains TypeScript type definitions generated in `types/database.generated.ts` and tailored projections in `types/share.ts` and `lib/share-projection.ts`.

### Findings
- **Missing or Untyped Payload Mappings:** `analyticsPayload` in `ShareProjectionInput` is typed as `unknown` and parsed through safe defensive casting helpers (`asRecord`, `asArray`, `asNumber`, `asCount`). This correctly prevents compile-time dependency breaks when Python backend payload schemas evolve.
- **Supabase Generated Types Alignment:** Tables `folders`, `profiles`, `papers`, `question_groups`, and `topics` are modeled in `types/database.generated.ts`.
- **Imports & Module Resolution:** Core utility and library paths (`@/lib/*`, `@/components/*`, `@/types/*`) follow standard Next.js path aliases configured in `tsconfig.json`.
- **Potential Type Safety Considerations:** Ensure that nullable fields (`exam_name`, `subject`, `total_marks`, `reference_year`) in `FoldersRow` are consistently checked for `null` before string/number manipulation in frontend components and server actions.

---

## 2. Server/Client Component Boundaries (React Server Components)

### Summary
Inspected all files across `app/` and `components/` for proper `"use client"` directives and adherence to RSC serialization rules.

### Findings
- **Client Directives:**
  - Interactive components using hooks (`useState`, `useEffect`, `useCallback`) or browser event handlers (`onClick`, `onChange`, `onDragOver`, `onDrop`) such as `components/folder/upload-zone.tsx`, `components/folder/topic-accordions.tsx`, `components/folder/study-tools.tsx`, and `components/dashboard/create-folder-modal.tsx` must explicitly retain `"use client"` at the top of the file.
  - Server actions in `app/actions/*.ts` correctly designate `"use server"` or are imported as server functions.
- **Serialization Boundary:**
  - Server-to-Client component boundaries (e.g., `DashboardPage` passing `folderList` to `FolderGrid`, `FolderWorkspaceView` passing data to `TopicAccordions` and `StudyTools`) pass plain serializable JSON objects without functions or class instances.
- **Environment Isolation:**
  - `lib/env.ts` enforces strict boundary checks (`requireServer` asserts `typeof window === "undefined"`), preventing leakage of server secrets like `PROCESSING_SERVICE_TOKEN` and `PROCESSING_SERVICE_URL` to client bundles.

---

## 3. Route & Flow Completeness

| Route | Expected Role | Status / Notes |
|---|---|---|
| `/(auth)/login` / `app/(auth)/...` | Authentication page (Email / Google OAuth) | Present in `app/(auth)/`. Supports callback handling via `app/auth/callback/route.ts`. |
| `/(dashboard)/page.tsx` (`/`) | Dashboard listing user folders, stats, and create folder flow | Present. Connects to `folders` table via Supabase client. |
| `/folders/[id]` | Folder workspace view (paper uploads, topics, analytics, study tools) | Present. Integrates extraction triggering, status checks, and analysis display. |
| `/(public)/share/[token]` | Public read-only workspace using share token | Layout present in `app/(public)/share/layout.tsx`. Backed by `lib/share-projection.ts` and `lib/share-utils.ts`. |
| `/auth/callback` | OAuth redirect and session exchange handler | Present in `app/auth/callback/route.ts`. Validates incoming `code` and exchanges for session. |

---

## 4. Target Scope Gap Analysis (vs. `AGENTS.md`)

### Product Requirements Comparison

1. **Deterministic Analytics & Caching:**
   - **Status:** **Implemented / Partial**.
   - Python backend implements `_topic_weights`, `_year_trends`, and priority scoring in `backend/analysis/analytics.py` and `backend/analysis/scoring.py`. Cached in JSONB payload on folder/analysis sessions.
2. **Public Read-Only Workspace (`lib/share-projection.ts`):**
   - **Status:** **Implemented**.
   - Strict projection mapping ensures only non-sensitive, allowlisted fields are exposed without user IDs, DB hashes, or storage paths.
3. **Syllabus vs. Exam Coverage Gap Analysis:**
   - **Status:** **Partially Implemented**.
   - `buildCoverage` exists in `lib/share-projection.ts` reading `coverage` gaps. Python worker syllabus extraction and gap matching need complete end-to-end wiring in study tools / UI tabs.
4. **Study Tools (Checklist, Hints, Flashcards, Mock Paper):**
   - **Status:** **In Progress / Gaps identified**.
   - `components/folder/study-tools.tsx` includes tabs for `checklist`, `mock`, and `flashcards`.
   - `lib/llm.ts` handles answer hints and mock paper generation; LLM rate-limiting, error fallbacks, and token budgeting should be continuously checked against abuse controls.
5. **Sharing & Export Formats:**
   - **Status:** **Gap Identified**.
   - Markdown/LaTeX export, Anki deck (.apkg or CSV) export, and printable study guides are planned in target architecture and need UI export triggers.
6. **OCR & Low Confidence Indicators:**
   - **Status:** **Implemented**.
   - `has_low_confidence_extraction` flag and original page numbers (`page_numbers`) are preserved in extraction results and surfaced through badges.

---

## 5. Security & Privacy Audit

### Findings
- **Row-Level Security (RLS):**
  - Server actions (`app/actions/folders.ts`, `app/actions/papers.ts`) check authenticated user state via `authenticateRoute()` and scope queries strictly to `user_id` or authorized folder IDs.
- **Public Share View Isolation:**
  - Share resolution utilizes token hashing (`hashShareToken` via SHA-256 in `lib/share-utils.ts`).
  - `lib/share-projection.ts` uses an explicit allowlist:
    - Eliminates `user_id`, `storage_path`, `normalized_hash`, and internal confidence scores.
    - Strips source metadata from syllabus topics to avoid leaking private syllabus notes.
- **Backend Service Authentication:**
  - Backend FastAPI endpoints are protected by `verify_service_token` (`backend/auth.py`), preventing direct unauthorized external invocation.
  - Browser communicates solely with Next.js server actions / routes, never exposing FastAPI service tokens or direct URLs.

---

## Conclusion & Next Steps

The architectural boundaries and security measures (RLS, server-only environment protection, safe projection mapping) are well structured. The remaining work focuses on closing product gaps outlined in `AGENTS.md` (specifically completing export features like Anki/Markdown, finalizing the syllabus gap workflow, and refining LLM mock-paper generation controls).
