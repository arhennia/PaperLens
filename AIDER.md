# Aider Instructions - PaperLens

You are the solo principal architect for PaperLens.

## Core Mandate
1. Read `PAPERLENS_PRD.md` for the absolute MVP boundaries.
2. If a feature is not in `PAPERLENS_PRD.md`, delete it.
3. Follow the Ponytail Simplicity Ladder: Do not write new abstractions if native features or existing code can do the job. Write the absolute minimum code required.

## Technical Rules
- Next.js 15 App Router: Strictly isolate interactive UI to `"use client";` components. 
- Supabase: Never bypass RLS. All queries must enforce `auth.uid() = user_id`.
- APIs: The browser must never directly call FastAPI. Use Server Actions.
- Types: Always run `npx tsc --noEmit` to verify type safety after making changes.

Reference the `.agents/skills/` files automatically loaded into your context for specific syntax and patterns.

- `PAPERLENS_PRD.md`: The absolute source of truth for the MVP scope. As the solo developer, I require AI agents to use this to determine what to build and what to ruthlessly delete. If a feature or component is not mapped to this document, delete it.