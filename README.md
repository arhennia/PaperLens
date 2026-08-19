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
| CSV export of ranked question bank | ✅ Working |
| Duplicate PDF detection (idempotent processing) | ✅ Working |

### Frontend (React + Vite + Tailwind)

| Feature | Status |
|---|---|
| Multi-file drag-and-drop upload zone | ✅ Working |
| Per-file year picker with auto-detection | ✅ Working |
| Optional exam context form (subject, type, marks, chapters) | ✅ Working |
| Live progress polling with per-paper status | ✅ Working |
| Missing year resolution UI | ✅ Working |
| Analytics dashboard (summary cards) | ✅ Working |
| Priority distribution display | ✅ Working |
| Year-over-year question frequency trend chart | ✅ Working |
| Chapter/topic focus weight bars | ✅ Working |
| Ranked question bank with full filters | ✅ Working |
| Question evolution timeline (year-by-year verbatim view) | ✅ Working |
| Search, chapter filter, priority filter, marks filter | ✅ Working |
| Repeated-only toggle filter | ✅ Working |
| One-click copy to clipboard | ✅ Working |
| CSV export button | ✅ Working |

---

## 🏗️ Architecture

```
PaperLens/
├── backend/
│   ├── main.py                             # FastAPI app + all API routes
│   ├── paperlens.db                        # SQLite database
│   ├── uploads/                            # Uploaded PDF storage (per session)
│   ├── requirements.txt
│   └── services/
│       ├── db_service.py                   # SQLite schema + context manager
│       ├── pdf_service.py                  # PDF text extraction (native + OCR fallback)
│       ├── ocr_service.py                  # Tesseract OCR wrapper (PyMuPDF → PIL → pytesseract)
│       ├── question_extraction_service.py  # State-machine exam parser
│       ├── question_validation_service.py  # Heuristic question validator
│       ├── analysis_services.py            # Dedup, clustering, topic classification, scoring
│       └── batch_processor.py             # Background pipeline orchestrator
└── frontend/
    ├── src/
    │   ├── App.jsx                         # Full single-page React app (~1500 lines)
    │   └── index.css
    ├── .env.example
    └── package.json
```

### Data Flow

```
PDF Upload(s)
     │
     ▼
[3-Stage Year Detection]
  1. Filename regex  →  2. First-page scan  →  3. Manual override prompt
     │
     ▼
[PDF Text Extraction]
  Native text (PyMuPDF)  →  fallback: OCR (Tesseract @ 150dpi)
     │
     ▼
[OCR Normalization]
  Noise removal, OCR character fixes, marker normalization
     │
     ▼
[Hierarchical Question Parser]
  3-level: Main Q → Sub Q (a,b,c) → Sub-Sub Q (i,ii,iii)
  Sequence tracking + broken-sequence repair
     │
     ▼
[Validation & Confidence Scoring]
  Accept / Review / Reject  →  rejected items go to audit table
     │
     ▼
[Deduplication]
  SHA-256 hash grouping → question_groups + occurrences
     │
     ▼
[Fuzzy Similarity Clustering]
  RapidFuzz token_set_ratio @ 84% threshold → similarity_clusters
     │
     ▼
[Topic Classification]
  Keyword matching against user-supplied chapters
     │
     ▼
[Priority Scoring]
  6-factor composite (0–100):
  freq(30%) + recency(25%) + marks(20%) + spread(15%) + cluster(7%) + chapter(3%)
     │
     ▼
[Analytics Pre-computation]
  Summary cards, priority distribution, focus areas, year trends → cached JSON
     │
     ▼
[React Dashboard]
  Ranked question bank + charts + filters + CSV export
```

---

## 🗃️ Database Schema

The SQLite database (`paperlens.db`) has 8 tables:

| Table | Purpose |
|---|---|
| `analysis_sessions` | One row per upload batch; tracks status + cached analytics JSON |
| `papers` | One row per PDF file in a session; tracks year, extraction status |
| `user_context` | Subject, exam type, total marks, chapters JSON for a session |
| `raw_questions` | All validated questions extracted from PDFs |
| `rejected_questions` | Questions rejected by the validation layer (for auditing) |
| `question_groups` | Deduplicated + scored question groups (canonical text, priority) |
| `question_occurrences` | Links raw questions → groups; stores year + marks per occurrence |
| `similarity_clusters` | Groups of semantically similar question groups |
| `topics` | Chapter/topic rows with keyword lists for classification |

---

## 🔌 API Reference

Base URL: `http://127.0.0.1:8000`

### Session Lifecycle

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/sessions` | Create a new analysis session, upload PDFs, trigger background pipeline |
| `GET` | `/api/sessions/{session_id}` | Poll session status + per-paper progress |
| `PUT` | `/api/sessions/{session_id}/papers/{paper_id}/year` | Supply/override a paper's exam year and resume processing |

### Results

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sessions/{session_id}/analytics` | Fetch pre-computed dashboard metrics (summary cards, trends, focus areas) |
| `GET` | `/api/sessions/{session_id}/questions` | Fetch ranked question bank; supports filters: `priority_level`, `topic_id`, `min_marks`, `repeated_only`, `search` |
| `GET` | `/api/sessions/{session_id}/export/csv` | Download the ranked question bank as a CSV file |

### Debugging

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sessions/{session_id}/rejected` | View all questions rejected by the validation layer |
| `POST` | `/api/upload` | Legacy single-PDF upload (Milestone 3 compatible) |

### Session Status Flow

```
created → extracting → merging → analyzing → complete
                                            ↘ failed
```

---

## ⚙️ How the Question Parser Works

The `ExamParser` is a state-machine-based hierarchical parser that handles real-world exam PDFs:

- **3-level depth**: Main questions (`Q1`, `1.`) → sub-questions (`(a)`, `a)`) → sub-sub-questions (`(i)`, `i.`)
- **Sequence tracking**: Uses typed `SequenceTracker` objects per level; auto-resolves ambiguous overlap characters (e.g. `i` is roman numeral or alpha depending on context)
- **Broken sequence repair**: Detects duplicate or skipped sub-question labels and corrects them with a warning
- **Marks extraction**: Parses `[5 marks]`, `(10)`, `2x5` multiplier patterns and distributes marks to sub-questions
- **OCR normalization**: Fixes common OCR mistakes — `l)` → `1)`, `1O marks` → `10 marks`, strips page headers/footers/watermarks, NITR boilerplate, roll numbers, etc.

---

## 🛡️ How the Validation Layer Works

Every extracted question goes through `validate_question()` before being saved:

| Check | What it does |
|---|---|
| **OCR Garbage** | Non-alphanumeric ratio > 18%, suspicious vowel-less words > 35% → reject |
| **Length** | < 10 non-space chars → reject (unless it is a `Define RAM` style 2-word question) |
| **Word count** | < 2 words → reject |
| **Metadata blacklist** | Matches university boilerplate (semester, department, registration) → reject |
| **Instruction blacklist** | Matches exam instructions (answer all, attempt any, full marks) → reject |
| **Page blacklist** | Matches page numbers → reject |
| **Confidence scoring** | +25 for action verb, +25 for `?`, +15 for marks pattern, +12 for length; −25 for missing all cues; −20 for ALL CAPS |
| **Threshold** | < 40 → rejected; 40–60 → review; > 60 → accepted |

Math expressions like `x = x + 1` are explicitly allowed to prevent false positives on CS/programming questions.

---

## 📊 Priority Scoring Formula

Each question group receives a composite score from 0–100:

```
Priority Score = (Frequency × 0.30)
              + (Recency   × 0.25)
              + (Marks     × 0.20)
              + (Spread    × 0.15)
              + (Cluster   × 0.07)
              + (Chapter   × 0.03)
```

| Factor | Meaning |
|---|---|
| **Frequency** | How often it appeared relative to the most-repeated question in the session |
| **Recency** | How recently it was asked (decays 20 points per year from today) |
| **Marks** | Average marks relative to total exam marks (or max marks in session) |
| **Spread** | How many distinct years it appeared across |
| **Cluster** | Whether there are paraphrased/similar variants across papers |
| **Chapter** | Reserved for chapter-priority weighting (currently neutral at 50) |

**Priority levels**: `critical` (≥ 85) · `very_high` (≥ 70) · `high` (≥ 50) · `medium` (≥ 30) · `low` (< 30)

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Tesseract OCR** — required for scanned/image-based PDFs
  - Windows: Download from [UB-Mannheim Tesseract](https://github.com/UB-Mannheim/tesseract/wiki)
  - Default expected path: `C:\Program Files\Tesseract-OCR\tesseract.exe`
  - Or override via environment variable: `TESSERACT_CMD=<path>`

### 1. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start the API server
python -m uvicorn main:app --reload
```

The API runs at `http://127.0.0.1:8000`  
Interactive Swagger docs: `http://127.0.0.1:8000/docs`

### 2. Frontend

```bash
cd frontend

# Copy and configure environment
cp .env.example .env

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app runs at `http://localhost:5173`

---

## 🔧 Environment Variables

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://127.0.0.1:8000
```

### Backend (optional)

```env
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
PAPERLENS_DEBUG=true    # Enables verbose validation report logging per paper
```

---

## 📦 Dependencies

### Backend (`requirements.txt`)

| Package | Purpose |
|---|---|
| `fastapi` | Web framework + async API |
| `uvicorn` | ASGI server |
| `pymupdf` | PDF text extraction + page rendering for OCR |
| `pytesseract` | Tesseract OCR Python binding |
| `pillow` | Image processing for OCR pipeline |
| `rapidfuzz` | Fast fuzzy string matching for similarity clustering |
| `python-multipart` | Multipart form data parsing (file upload) |

### Frontend (`package.json`)

| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI framework |
| `vite` | Dev server + build tool |
| `tailwindcss` | Utility-first CSS framework |
| `lucide-react` | Icon library |

---

## 🗺️ Roadmap

Current build is **Milestone 4**. Planned:

- **AI Question Generation** — LLM-powered predicted questions based on trend analysis
- **AI Answer Hints** — Auto-generate brief answer outlines for top-ranked questions
- **Smart Chapter Auto-detection** — Infer chapter names from question text automatically
- **User Accounts + Session History** — Persist and revisit past sessions
- **PDF Study Guide Export** — Export a formatted PDF with ranked questions
- **Collaborative Mode** — Share session links with classmates

---

## 🐛 Debugging

- **Rejected questions**: `GET /api/sessions/{session_id}/rejected`
- **Verbose logs**: Set `PAPERLENS_DEBUG=true` in your shell before starting the backend
- **Per-paper errors**: `GET /api/sessions/{session_id}` → check `papers[].error` field

---

## 📄 License

MIT — see [LICENSE](LICENSE).
