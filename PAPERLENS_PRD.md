# PaperLens: Core Product Requirements (MVP)

**Role Context:** This project is maintained by a single full-stack solo developer (Swayam). All previous team delegations are obsolete.
**AI Mandate:** AI agents (Aider, Gemini, Claude) reading this document must treat it as the absolute boundary of the MVP. Any existing code, UI component, or backend route that does not serve a feature explicitly listed below is considered clutter and must be ruthlessly deleted.

---

## 1. Product Purpose
PaperLens allows students to upload multiple years of past university exam papers (and syllabus PDFs) into dedicated Subject Folders. It automatically extracts, deduplicates, and categorizes questions by topic, displaying weightage, repeat frequency, and syllabus gaps, while generating AI-powered study materials.

---

## 2. Tech Stack & Architecture
* **Frontend:** Next.js 15 (App Router), React Server Components (RSC), TypeScript, Tailwind CSS v4.
* **Database & Auth:** Supabase PostgreSQL, Supabase Auth (Email/Google), Supabase Storage (private `exam-pdfs` bucket), strict Row-Level Security (RLS).
* **AI & Processing Backend:** Python FastAPI microservice (PyMuPDF, Tesseract OCR, RapidFuzz deduplication, LLM APIs).
* **Math Rendering:** KaTeX (`lib/math.ts` & `<MathText />`).

### Strict Data Flow Rules:
* The browser **never** talks directly to FastAPI.
* Next.js Server Actions handle all data fetching and trigger FastAPI via an internal `PROCESSING_SERVICE_TOKEN`.
* **Zero Public Data Leakage:** All public share links route exclusively through `lib/share-projection.ts` (strictly allowlisting fields, hiding user IDs and raw file paths).

---

## 3. Core MVP Scope (The "Keep" List)

### A. Authentication & App Shell
* Email/Password & Google OAuth via Supabase SSR.
* Global App Shell with a clean left-hand sidebar (User Profile, Subject Folders, Logout).

### B. Subject Folders (The Dashboard)
* Grid view of all user-owned folders (e.g., "Operating Systems", "Data Structures").
* Folder creation modal.
* **Empty State:** Clean prompt to "Create your first Subject Folder" when 0 folders exist.

### C. Workspace & PDF Pipeline
* Batch drag-and-drop PDF upload zone inside a folder.
* Automatic upload to Supabase Storage (`{user_id}/{folder_id}/{paper_id}.pdf`).
* Real-time or polled progress bar observing the FastAPI processing job.
* **Empty State:** Clean prompt to "Upload past exam PDFs" when 0 papers exist in a folder.

### D. Analytics & Analysis UI
* **Topic Accordions:** Structured grouping of questions by extracted chapters/topics.
* **Question Rendering:** Every question displays original marks, year tags, exact PDF page references, and cleanly rendered KaTeX math formulas.
* **Badges:** Question Type (Numerical, Derivation, Theory), Difficulty (Easy/Med/Hard), OCR Confidence warnings.
* **Analytics Summary:** Cached deterministic stats on topic weightage % and critical repeat frequency (e.g., "Repeated 3x").

### E. Interactive Study Tools
* **High-Yield Checklist:** Interactive checkboxes tracking topic mastery.
* **Active Recall / Flashcards:** Flip-card UI for self-testing.
* **AI Predicted Mock Paper:** Generated mock exam based on historical weightage, with collapsible step-by-step AI answer hints.
* **Syllabus Coverage Gap Analysis:** Visual map comparing syllabus topics against historically tested topics (Covered, Underrepresented, Gap).
* **Export Suite:** Client-side buttons to Copy Markdown/LaTeX, Download Anki CSV, and trigger a Printable Study Guide (`window.print()`).

### F. Shareable Public Workspaces
* Share modal to generate/revoke a public link for a specific folder.
* Read-only public route (`/share/[token]`) allowing non-logged-in peers to view the analyzed paper hub safely.

---

## 4. Architectural Non-Negotiables
1. **RSC Boundaries:** Interactive UI (`onClick`, `useState`) MUST be segregated into client components (`"use client";`). Server Components must not pass event handlers as props.
2. **YAGNI (You Aren't Gonna Need It):** No abstract factories, no over-engineered context providers, no speculative features. Keep the code boring, readable, and direct.
3. **Graceful Degradation:** If the LLM key is missing, PDF extraction and topic deduplication must still work perfectly. If OCR fails, fallback to raw text but flag it with a low-confidence badge.