# 🔍 PaperLens

> **AI-powered previous year question paper analyzer** — upload multiple exam PDFs, and get a fully ranked, deduplicated, topic-classified study bank with trend analytics.

PaperLens parses your exam papers, clusters semantically similar questions, scores each one by repeat frequency, recency, and marks weightage, and surfaces everything through a live React dashboard — no manual effort required.

---

## ✅ What's Built & Working Right Now

### Backend (FastAPI + Python)

The entire processing pipeline is **fully functional end-to-end**:

| Feature | Status |
|---|---|
| Multi-PDF upload session creation | ✅ Working |
| Native text extraction (PyMuPDF) | ✅ Working |
| OCR fallback for scanned PDFs (Tesseract) | ✅ Working |
| 3-stage automatic year detection | ✅ Working |
| Manual year override with pipeline resume | ✅ Working |
| Hierarchical question parser (3-level deep) | ✅ Working |
| OCR normalization & noise removal | ✅ Working |
| Question validation & confidence scoring | ✅ Working |
| Rejected question audit trail | ✅ Working |
| Exact-match deduplication (SHA-256 hashing) | ✅ Working |
| Fuzzy similarity clustering (RapidFuzz) | ✅ Working |
| Topic / chapter classification | ✅ Working |
| 6-factor priority scoring engine | ✅ Working |
| Pre-computed analytics caching | ✅ Working |
| Duplicate PDF detection (idempotent processing) | ✅ Working |
| Durable background job queue | ✅ Working |

### Frontend (Next.js 15 + Tailwind CSS v4 + Supabase)

| Feature | Status |
|---|---|
| Google & Email Authentication | ✅ Working |
| Protected Dashboard & Folders | ✅ Working |
| Multi-file drag-and-drop upload zone | ✅ Working |
| Live progress polling with Realtime | ✅ Working |
| Analytics dashboard (summary cards) | ✅ Working |
| Topic weightage & question listing | ✅ Working |
| Read-only public share links | ✅ Working |
| Interactive checklists | ✅ Working |
| AI Answer Hints | ✅ Working |
| Mock Paper Generation | ✅ Working |
| Row-Level Security (RLS) data isolation | ✅ Working |

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
