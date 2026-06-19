# PaperLens

AI-powered question paper analyzer that identifies recurring topics, exam trends, and subject-wise weightage from previous-year papers.

## Features

* **Multi-PDF Upload**: Upload multiple previous year question papers at once.
* **OCR & Text Extraction**: Extracts text from PDFs accurately.
* **Question Extraction**: Segments and extracts individual questions using advanced hierarchical parsing.
* **Quality Filtering & Validation**: 
  * Filters out non-question text (e.g., exam instructions, page headers, footers).
  * Tolerates mathematical and programming expressions (e.g., `x=x+1`) to prevent false positives.
  * Rejects low-confidence extractions and OCR garbage, auditing them in a dedicated rejection list for review.
* **Repeated Question Detection**: Identifies how many times a question or topic has appeared across years.
* **Analytics Dashboard**: View subject-wise breakdown, trends, and top repeated questions via interactive charts.

## Architecture Highlights

* **Frontend**: React/Next.js dashboard with a multi-file upload system and comprehensive charts.
* **Backend**: FastAPI providing robust endpoints for OCR extraction, validation, and analytics.
* **Database**: SQLite incorporating a `rejected_questions` table for auditability and `raw_questions` for validated items.
* **Validation Layer**: Heuristic-based filtering including metadata blacklisting, suspicious-word ratio calculations, and math-tolerant logic to maintain high-quality question datasets.

## Getting Started

1. **Backend**: 
   ```bash
   cd backend
   python -m uvicorn main:app --reload
   ```
2. **Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

## Auditing Rejected Questions
You can view rejected extractions (useful for debugging OCR issues) via the backend endpoint:
`GET /api/sessions/{session_id}/rejected`
