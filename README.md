# PaperLens

PaperLens is a full-stack exam-paper analysis workspace. Students upload past exam PDFs into subject folders, extract and group questions, inspect deterministic repeat and topic-weightage analytics, use study tools, and share a read-only analyzed view.

## Architecture

- **Next.js 15 App Router**: server-rendered routes, authenticated server actions, and client components for interactive controls.
- **TypeScript**: shared database and public-share contracts in `types/`.
- **Tailwind CSS v4**: existing design tokens and component styling.
- **Supabase Postgres**: folders, papers, questions, topics, cached analytics, jobs, study artifacts, and share links. Row-Level Security protects user-owned data.
- **Supabase Storage**: private `exam-pdfs` bucket for uploaded papers.
- **KaTeX**: math rendering through `components/ui/math-text.tsx` and `lib/math.ts`.
- **FastAPI and Python**: server-side PDF extraction, OCR fallback, parsing, normalization, deduplication, topic analysis, scoring, and durable job processing.

The browser never calls FastAPI. Authenticated Next.js server actions authorize folder ownership through Supabase, then enqueue internal FastAPI jobs with `PROCESSING_SERVICE_TOKEN`. Public share routes resolve hashed tokens and expose only the allowlisted result of `lib/share-projection.ts`.

## Repository Layout

```text
app/                 Next.js routes and authenticated server actions
components/          Client UI and reusable display components
lib/                 Auth, Supabase clients, processing bridge, math, and projection
supabase/migrations/ Postgres schema, RLS, storage, triggers, and queue functions
types/               Database and public-share TypeScript contracts
backend/             FastAPI service, worker, extraction, analysis, and database access
tests/               Application and integration tests
```

## Data Flow

1. A signed-in student creates a subject folder.
2. PDFs are recorded under an owner-scoped path and uploaded to private Supabase Storage.
3. Next.js enqueues extraction through the internal FastAPI service.
4. The worker extracts text or OCR, records page provenance, parses questions, and updates Supabase.
5. Deterministic grouping, topic coverage, repeat counts, marks weightage, and priority analytics are cached per folder.
6. The private workspace reads authorized records; processing status is polled through a server action.
7. A share token resolves to a read-only projection with no user IDs, storage paths, private notes, or job internals.

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- Supabase CLI or a configured Supabase project
- Tesseract OCR for scanned PDFs

### Frontend

```bash
npm install
npm run dev
```

Configure `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
PROCESSING_SERVICE_URL=http://127.0.0.1:8000
PROCESSING_SERVICE_TOKEN=...
LLM_API_KEY=...
LLM_MODEL=...
```

Apply the migrations with the Supabase CLI, then run `npm run typecheck` and `npm test`.

### Processing Service

```bash
cd backend
python -m venv venv
venv\\Scripts\\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

The internal service exposes only extraction enqueue, analysis enqueue, and health routes. It requires its configured processing service token for internal job requests.

## Security Boundaries

- All user-owned database tables use RLS and an ownership path to `auth.users`.
- The service-role key, processing token, and LLM credentials remain server-side.
- Uploaded PDFs stay in a private storage bucket.
- `/share/[token]` is read-only and uses `lib/share-projection.ts` as its complete public surface.
- Cached analytics are served from Supabase rather than recomputed on every page load.

## License

MIT. See [LICENSE](LICENSE).
