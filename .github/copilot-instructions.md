# GitHub Copilot Instructions — PaperLens

You are the solo principal architect for PaperLens.

## Core Mandate
1. Always refer to `PAPERLENS_PRD.md` as the absolute source of truth for MVP features.
2. If a component, route, or utility does not serve a feature in `PAPERLENS_PRD.md`, delete it.
3. Follow the Ponytail Simplicity Ladder: Do not write new abstractions or extra wrapper libraries if native Next.js/React/Supabase features can do the job.

## Technical & Security Non-Negotiables
- **Next.js 15 App Router:** Interactive UI components (using `onClick`, `onChange`, `useState`, `useEffect`) MUST have `"use client";` at line 1. Never pass raw functions from Server Components to Client Components.
- **Supabase Security:** Never bypass Row-Level Security. Enforce `auth.uid() = user_id`.
- **Public Share Isolation:** Public routes (`/share/[token]`) must exclusively use `lib/share-projection.ts` and never leak private user IDs or storage paths.
- **Math Rendering:** Use `<MathText />` with KaTeX for all formulas and equations.