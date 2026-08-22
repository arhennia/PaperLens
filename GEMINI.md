# PaperLens — Gemini Instructions

Read `AGENTS.md` and `DECISIONS.md` before making architectural changes.

## Current Project State
Phases 0 through 5 are implemented:
- Supabase SQL migrations with RLS are live.
- FastAPI backend extraction/analysis pipeline is built.
- Next.js 15 App Router frontend is built.

**Current Task:** Integration verification, fixing runtime/RSC boundary errors, and local deployment testing.

## Code Quality & Conventions
Prefer:
- Simple, readable, concise code
- Explicit data flow and descriptive variable names
- Clean React Server / Client component boundaries (`"use client";` on interactive components)
- Direct imports over unnecessary abstraction layers
- Strict type-checking with TypeScript (`npx tsc --noEmit`)

Avoid:
- Premature abstractions, factories, or wrapper grab-bags
- Exposing server secrets or calling FastAPI directly from the browser
- Giant unreadable files
- Modifying sound extraction logic in `backend/extraction/` without reason

## Security Rules
- All user queries must respect Supabase RLS (`auth.uid() = user_id`).
- Public share views (`/share/[token]`) must use `lib/share-projection.ts` with the allowlist projection and NEVER leak private user IDs, file paths, or internal logs.
- Secret keys (`SUPABASE_SECRET_KEY`, `PROCESSING_SERVICE_TOKEN`, `LLM_API_KEY`) are server-only.

## Skills & Reference
Reference rules and guidelines in `.agents/skills/` when writing React or Supabase code.

## Key Project Documents
- `AGENTS.md`: The core architecture constitution, product definition, and security rules.
- `DECISIONS.md`: The technical record of all architectural decisions (D-001 to D-040+). Append technical reasoning for new non-trivial changes here.
- `WORK_BY_SWAYAM.md`: The human-readable changelog written in plain language (no unexplained jargon) for non-technical teammates explaining what changed, why, and what a user notices.
- `AUDIT.md`: The historical Phase 0 baseline audit (read-only reference; do not edit).

- `PAPERLENS_PRD.md`: The absolute source of truth for the MVP scope. As the solo developer, I require AI agents to use this to determine what to build and what to ruthlessly delete. If a feature or component is not mapped to this document, delete it.