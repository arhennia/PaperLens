# 🔍 PaperLens

> **AI-powered previous year question paper analyzer** — upload multiple exam PDFs, and get a fully ranked, deduplicated, topic-classified study bank with trend analytics.

PaperLens parses your exam papers, clusters semantically similar questions, scores each one by repeat frequency, recency, and marks weightage, and surfaces everything through a live React dashboard — no manual effort required.

---

## Status: Verified vs. Unverified (August 21, 2026)

**Rule**: Nothing marked verified without real execution evidence (terminal output, extracted text, or actual API responses). See `REAL_VERIFICATION_EVIDENCE.md` for complete proof.

### Backend Processing (FastAPI + Python)

| Feature | Status | Evidence |
|---|---|---|
| Hierarchical question parser (3-level deep) | ✅ Verified | 147/147 unit tests passing |
| OCR normalization & noise removal | ✅ Verified | Tests pass, correct output on synthetic data |
| Question validation & confidence scoring | ✅ Verified | Tests pass |
| Exact-match deduplication (SHA-256 hashing) | ✅ Verified | Tests pass |
| Fuzzy similarity clustering (RapidFuzz) | ✅ Verified | Algorithm works; threshold unvalidated |
| Topic classification | ✅ Verified | Tests pass |
| 6-factor priority scoring engine | ✅ Verified | Tests pass; deterministic |
| 3-stage automatic year detection | ✅ Verified | Tests pass |
| Native text extraction (PyMuPDF) | ✅ Verified | Tests pass with generated PDFs |
| OCR fallback for scanned PDFs (Tesseract) | ⚠️ **Unverified** | **Tesseract not installed; failure path works, success path untested** |
| Durable background job queue | ✅ Verified | Job enqueued and persisted in DB (real API call) |
| Job worker processing | ⏸️ Untested | Code exists, not executed end-to-end |
| Duplicate PDF detection (idempotency) | ⏸️ Untested | Logic verified in tests, not live |

### Database & Infrastructure (Supabase)

| Feature | Status | Evidence |
|---|---|---|
| Database writes (folders, papers, jobs) | ✅ Verified | Created folder ID `d2bd3b52-1797-41fb-9d2b-dfb6830282ce` |
| Database reads | ✅ Verified | Retrieved folder successfully |
| RLS blocks unauthenticated access | ✅ Verified | Got 401 Unauthorized with anon key |
| Foreign key constraints enforced | ✅ Verified | Rejected invalid user_id with FK error |
| Job queue persistence | ✅ Verified | Job `06c4ba82-d95e-4e1d-97ab-f59f917aae6f` in `processing_jobs` |
| Supabase Storage uploads | ⏸️ Untested | Storage bucket exists; upload flow not executed |
| RLS cross-user isolation (live sessions) | ⏸️ Untested | pgTAP tests pass; browser sessions not tested |

### Frontend (Next.js 15 + Tailwind CSS v4)

| Feature | Status | Evidence |
|---|---|---|
| Frontend builds successfully | ✅ Verified | `npm run build` succeeded, 7 routes compiled |
| Authentication UI exists | ✅ Verified | `/login` page source code reviewed |
| Google & Email Authentication flow | ⏸️ Untested | Auth code exists, not executed end-to-end |
| Protected Dashboard & Folders | ⏸️ Untested | Routes exist, not tested with real auth |
| Multi-file drag-and-drop upload zone | ⏸️ Untested | UI exists, upload → storage → process not tested |
| Live progress polling with Realtime | ⏸️ Untested | Code exists, not tested |
| Analytics dashboard | ⏸️ Untested | Components exist, not tested with real data |
| Topic weightage & question listing | ⏸️ Untested | Components exist, not tested |
| Read-only public share links | ⏸️ Untested | Code exists, not tested |
| Interactive checklists | ⏸️ Untested | Code exists, not tested |
| AI Answer Hints | ⏸️ Untested | Code exists, not tested |
| Mock Paper Generation | ⏸️ Untested | Code exists, not tested |

### Export Formats

| Feature | Status | Evidence |
|---|---|---|
| Markdown export | ⏸️ Untested | Need to verify route exists and generates valid file |
| LaTeX export | ⏸️ Untested | Need to verify route exists and generates valid file |
| Anki CSV export | ⏸️ Untested | Need to verify route exists and generates valid file |
| Printable PDF export | ⏸️ Untested | Need to verify route exists and generates valid file |

### Missing Features (Not Implemented)

| Feature | Status |
|---|---|
| Syllabus Coverage Gap Analysis (6.9) | ❌ Missing |
| Flashcard/Active Recall Mode (6.10) | ❌ Missing |

### Legend
- ✅ **Verified**: Proven with real execution evidence
- ⏸️ **Untested**: Code exists but not executed/verified
- ⚠️ **Unverified**: Missing dependencies or blocked by environment
- ❌ **Missing**: Not implemented

---

## 🏗️ Architecture

```
PaperLens/
├── app/                          # Next.js App Router (Frontend + API Routes)
│   ├── (auth)/                   # Authentication flows
│   ├── (dashboard)/              # Protected user workspaces
│   ├── (public)/                 # Public read-only share views
│   └── api/                      # Job triggers, webhooks, auth
├── components/                   # UI primitives and feature components
├── lib/                          # Supabase clients (client, server, admin) and utils
├── supabase/
│   ├── migrations/               # PostgreSQL schema migrations
│   └── seed.sql                  # Initial database seed
├── backend/                      # Python FastAPI (Processing Engine)
│   ├── main.py                   # API routes for background jobs
│   ├── worker.py                 # Durable background processing loop
│   ├── extraction/               # PDF, OCR, Parsing logic
│   └── analysis/                 # Dedup, Similarity, Topics, Scoring
└── .env.example
```

### Data Flow

```
PDF Upload(s) via Next.js
     │
     ▼
[Supabase Storage + Database]
  PDFs saved to private `exam-pdfs` bucket, tracking row created
     │
     ▼
[FastAPI Job Queue]
  Next.js triggers FastAPI `/internal/jobs/extract` endpoint
     │
     ▼
[PDF Text Extraction & Parsing]
  Native text (PyMuPDF)  →  fallback: OCR (Tesseract @ 150dpi)
  3-level Question Parser → OCR Normalization → Validation
     │
     ▼
[Deduplication & Clustering]
  SHA-256 hash grouping → RapidFuzz clustering
     │
     ▼
[Priority Scoring & Analytics]
  6-factor composite scoring → pre-computed analytics caching
     │
     ▼
[Next.js Dashboard]
  Realtime UI updates → Ranked question bank + charts + study tools
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**
- **Python 3.10+**
- **Supabase CLI** (for local database)
- **Tesseract OCR** (for scanned PDFs)

### 1. Database Setup

```bash
# Start local Supabase instance
npx supabase start

# Apply migrations
npx supabase db push
```

### 2. Frontend

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# (Fill in your Supabase URL, Anon Key, Service Role Key, and LLM API Key)

# Start dev server
npm run dev
```

### 3. Backend (FastAPI)

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Start the API server
python -m uvicorn main:app --reload --port 8000
```

---

## 🔧 Environment Variables

### `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

PROCESSING_SERVICE_URL=http://127.0.0.1:8000
PROCESSING_SERVICE_TOKEN=dev-secret-token

LLM_API_KEY=your-gemini-api-key
LLM_MODEL=gemini-1.5-pro
```

### `backend/.env`

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=your-service-role-key
API_TOKEN=dev-secret-token
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).
