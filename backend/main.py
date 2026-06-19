# pyrefly: ignore [missing-import]
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.responses import StreamingResponse
import os
import uuid
import json
import csv
import io
import datetime
from services.db_service import get_db
from services.pdf_service import extract_text_from_pdf_bytes
from services.question_extraction_service import parse_questions_from_text, validate_extracted_questions
from services.batch_processor import run_batch_processing

app = FastAPI(title="PaperLens API", description="Milestone 4 - Multi-PDF Analysis Engine")

# Enable CORS for the local frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/")
def read_root():
    return {
        "message": "PaperLens Multi-PDF Analysis Engine is running. Use POST /api/sessions to analyze multiple PDFs."
    }

# ========================================================
# Milestone 3 Backwards-Compatible Single Upload Endpoint
# ========================================================
@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    filename = file.filename
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF files are supported."
        )
    
    try:
        pdf_bytes = await file.read()
        raw_text, method, page_count = extract_text_from_pdf_bytes(pdf_bytes)
        questions, sections_found, parser_warnings = parse_questions_from_text(raw_text)
        warnings = validate_extracted_questions(questions, page_count, parser_warnings)
        
        return {
            "filename": filename,
            "pageCount": page_count,
            "extractionMethod": method,
            "questionCount": len(questions),
            "sectionsFound": sections_found,
            "questions": questions,
            "warnings": warnings,
            "extractedText": raw_text
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while processing the PDF: {str(e)}"
        )

# ========================================================
# Milestone 4 Multi-PDF Session Endpoints
# ========================================================
@app.post("/api/sessions")
async def create_session(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    subject: str = Form(None),
    examName: str = Form(None),
    examType: str = Form("end_sem"),
    totalMarks: int = Form(None),
    questionPattern: str = Form(None),
    chapters: str = Form(None), # JSON list of chapter strings
    years: str = Form(None) # JSON dictionary mapping filename -> year
):
    """
    Accepts N PDF files, creates an analysis session, saves the files,
    persists meta information, and triggers the processing pipeline in the background.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file format in '{file.filename}'. Only PDF files are supported."
            )
            
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    # Parse years dictionary and chapters list
    years_override = {}
    if years:
        try:
            years_override = json.loads(years)
        except Exception:
            pass
            
    chapters_list = []
    if chapters:
        try:
            chapters_list = json.loads(chapters)
        except Exception:
            pass
            
    with get_db() as conn:
        # 1. Create analysis session
        conn.execute(
            "INSERT INTO analysis_sessions (id, name, status) VALUES (?, ?, ?)",
            (session_id, subject or f"Exam Session - {datetime.datetime.now().strftime('%Y-%m-%d')}", "created")
        )
        
        # 2. Create user context
        context_id = f"ctx_{session_id}"
        conn.execute(
            """
            INSERT INTO user_context (id, session_id, subject, exam_name, exam_type, total_marks, question_pattern, chapters_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (context_id, session_id, subject, examName, examType, totalMarks, questionPattern, json.dumps(chapters_list))
        )
        
        # 3. Save files and insert paper rows
        filename_list = []
        for file in files:
            filename = file.filename
            file_path = os.path.join(session_dir, filename)
            
            # Read and save bytes
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
                
            paper_id = f"p_{session_id}_{str(uuid.uuid4())[:8]}"
            
            # Determine year from overrides or leave empty for pipeline detection
            year = int(years_override[filename]) if filename in years_override else None
            year_source = "manual" if year else None
            
            conn.execute(
                """
                INSERT INTO papers (id, session_id, filename, year, year_source, file_path, content_hash, extraction_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (paper_id, session_id, filename, year, year_source, file_path, "", "queued")
            )
            filename_list.append(filename)
            
    # Trigger background processor task
    background_tasks.add_task(run_batch_processing, session_id, years_override)
    
    return {
        "sessionId": session_id,
        "status": "created",
        "filenames": filename_list
    }

@app.get("/api/sessions/{session_id}")
def get_session_status(session_id: str):
    """
    Polls the processing status of a session and its associated papers.
    """
    with get_db() as conn:
        cursor = conn.execute(
            "SELECT id, name, status, error_message, created_at, updated_at FROM analysis_sessions WHERE id = ?",
            (session_id,)
        )
        session = cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found.")
            
        cursor = conn.execute(
            "SELECT id, filename, year, year_source, extraction_status, total_questions, total_pages, error_message FROM papers WHERE session_id = ?",
            (session_id,)
        )
        papers = cursor.fetchall()
        
    paper_list = []
    for p in papers:
        paper_list.append({
            "id": p["id"],
            "filename": p["filename"],
            "year": p["year"],
            "yearSource": p["year_source"],
            "status": p["extraction_status"],
            "questionsFound": p["total_questions"],
            "pageCount": p["total_pages"],
            "error": p["error_message"]
        })
        
    return {
        "sessionId": session["id"],
        "name": session["name"],
        "status": session["status"],
        "error": session["error_message"],
        "createdAt": session["created_at"],
        "updatedAt": session["updated_at"],
        "papers": paper_list
    }

@app.put("/api/sessions/{session_id}/papers/{paper_id}/year")
def override_paper_year(session_id: str, paper_id: str, payload: dict, background_tasks: BackgroundTasks):
    """
    Supplies or overrides a paper's year and resumes the batch processing.
    """
    year = payload.get("year")
    if not year:
        raise HTTPException(status_code=400, detail="Year is required in request body.")
        
    with get_db() as conn:
        cursor = conn.execute("SELECT id FROM papers WHERE id = ? AND session_id = ?", (paper_id, session_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Paper not found in this session.")
            
        conn.execute(
            "UPDATE papers SET year = ?, year_source = 'manual', extraction_status = 'queued' WHERE id = ?",
            (int(year), paper_id)
        )
        conn.execute(
            "UPDATE analysis_sessions SET status = 'created', error_message = NULL WHERE id = ?",
            (session_id,)
        )
        
    background_tasks.add_task(run_batch_processing, session_id)
    return {"message": "Paper year updated and batch processing resumed successfully."}

@app.get("/api/sessions/{session_id}/questions")
def get_session_questions(
    session_id: str,
    priority_level: str = None,
    topic_id: str = None,
    min_marks: float = None,
    repeated_only: bool = False,
    search: str = None
):
    """
    Retrieves the ranked question bank for a session, supporting filtration and including
    reasons, factors, similarity confidence tags, and chronological question text evolution.
    """
    with get_db() as conn:
        # Check if session exists and is complete
        cursor = conn.execute("SELECT status FROM analysis_sessions WHERE id = ?", (session_id,))
        s_row = cursor.fetchone()
        if not s_row:
            raise HTTPException(status_code=404, detail="Session not found.")
        if s_row["status"] != "complete":
            return {"status": s_row["status"], "questions": []}
            
        # Build query
        query = """
            SELECT qg.id, qg.canonical_text, qg.priority_score, qg.priority_level, qg.cluster_id,
                   qg.avg_marks, qg.max_marks, qg.first_year, qg.last_year, qg.year_span,
                   qg.f_freq, qg.f_recency, qg.f_marks, qg.f_spread, qg.f_cluster, qg.f_chapter,
                   qg.priority_reason, qg.similarity_confidence, t.name as topic_name, t.id as topic_id,
                   (SELECT COUNT(*) FROM question_occurrences WHERE group_id = qg.id) as occurrences_count
            FROM question_groups qg
            LEFT JOIN topics t ON qg.topic_id = t.id
            WHERE qg.session_id = ?
        """
        params = [session_id]
        
        if priority_level:
            query += " AND qg.priority_level = ?"
            params.append(priority_level)
            
        if topic_id:
            query += " AND qg.topic_id = ?"
            params.append(topic_id)
            
        if min_marks is not None:
            query += " AND qg.max_marks >= ?"
            params.append(min_marks)
            
        if repeated_only:
            query += " AND (SELECT COUNT(*) FROM question_occurrences WHERE group_id = qg.id) > 1"
            
        if search:
            query += " AND qg.canonical_text LIKE ?"
            params.append(f"%{search}%")
            
        query += " ORDER BY qg.priority_score DESC"
        
        cursor = conn.execute(query, params)
        groups = cursor.fetchall()
        
        question_list = []
        for g in groups:
            group_id = g["id"]
            
            # Fetch evolution timeline (chronological list of verbatim question texts from occurrences)
            # If the group belongs to a cluster, fetch all occurrences from all groups in that cluster
            if g["cluster_id"]:
                cursor_occ = conn.execute(
                    """
                    SELECT qo.year, qo.marks, rq.question_text, rq.question_number, p.filename
                    FROM question_occurrences qo
                    JOIN raw_questions rq ON qo.raw_question_id = rq.id
                    JOIN papers p ON qo.paper_id = p.id
                    JOIN question_groups qg ON qo.group_id = qg.id
                    WHERE qg.cluster_id = ?
                    ORDER BY qo.year ASC
                    """,
                    (g["cluster_id"],)
                )
            else:
                cursor_occ = conn.execute(
                    """
                    SELECT qo.year, qo.marks, rq.question_text, rq.question_number, p.filename
                    FROM question_occurrences qo
                    JOIN raw_questions rq ON qo.raw_question_id = rq.id
                    JOIN papers p ON qo.paper_id = p.id
                    WHERE qo.group_id = ?
                    ORDER BY qo.year ASC
                    """,
                    (group_id,)
                )
            occs = cursor_occ.fetchall()
            
            evolution = []
            for o in occs:
                evolution.append({
                    "year": o["year"],
                    "marks": o["marks"],
                    "verbatimText": o["question_text"],
                    "questionNumber": o["question_number"],
                    "filename": o["filename"]
                })
                
            question_list.append({
                "id": g["id"],
                "canonicalText": g["canonical_text"],
                "priorityScore": g["priority_score"],
                "priorityLevel": g["priority_level"],
                "priorityReason": g["priority_reason"],
                "similarityConfidence": g["similarity_confidence"],
                "topicName": g["topic_name"] or "Uncategorized",
                "topicId": g["topic_id"],
                "occurrencesCount": g["occurrences_count"],
                "avgMarks": g["avg_marks"],
                "maxMarks": g["max_marks"],
                "firstYear": g["first_year"],
                "lastYear": g["last_year"],
                "yearSpan": g["year_span"],
                "factors": {
                    "frequency": g["f_freq"],
                    "recency": g["f_recency"],
                    "marks": g["f_marks"],
                    "spread": g["f_spread"],
                    "cluster": g["f_cluster"],
                    "chapter": g["f_chapter"]
                },
                "evolution": evolution
            })
            
    return {"status": "complete", "questions": question_list}

@app.get("/api/sessions/{session_id}/analytics")
def get_session_analytics(session_id: str):
    """
    Returns cached dashboard analytics containing summary cards,
    priority donuts, year trends, and topic focus weights.
    """
    with get_db() as conn:
        cursor = conn.execute("SELECT status, analytics_json FROM analysis_sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found.")
            
        status = row["status"]
        if status != "complete":
            return {"status": status, "analytics": None}
            
        analytics = json.loads(row["analytics_json"]) if row["analytics_json"] else {}
        
    return {"status": status, "analytics": analytics}

@app.get("/api/sessions/{session_id}/export/csv")
def export_session_questions_csv(session_id: str):
    """
    Exports the ranked question bank in CSV format.
    """
    with get_db() as conn:
        cursor = conn.execute("SELECT status FROM analysis_sessions WHERE id = ?", (session_id,))
        s_row = cursor.fetchone()
        if not s_row:
            raise HTTPException(status_code=404, detail="Session not found.")
        if s_row["status"] != "complete":
            raise HTTPException(status_code=400, detail="Cannot export incomplete sessions.")
            
        cursor = conn.execute(
            """
            SELECT qg.canonical_text, qg.priority_level, qg.priority_score, qg.avg_marks,
                   (SELECT COUNT(*) FROM question_occurrences WHERE group_id = qg.id) as occ_count,
                   t.name as topic_name, qg.priority_reason
            FROM question_groups qg
            LEFT JOIN topics t ON qg.topic_id = t.id
            WHERE qg.session_id = ?
            ORDER BY qg.priority_score DESC
            """,
            (session_id,)
        )
        groups = cursor.fetchall()
        
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow([
        "Question Wording", "Priority Level", "Priority Score (0-100)", 
        "Average Marks", "Occurrence Count", "Topic/Chapter", "Priority Analysis Reason"
    ])
    
    for g in groups:
        writer.writerow([
            g["canonical_text"], g["priority_level"], g["priority_score"],
            g["avg_marks"], g["occ_count"], g["topic_name"] or "Uncategorized",
            g["priority_reason"]
        ])
        
    output.seek(0)
    
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=ranked_questions_session_{session_id[:8]}.csv"
    return response

@app.get("/api/sessions/{session_id}/rejected")
def get_session_rejected_questions(session_id: str):
    """
    Retrieves the rejected questions for a session, useful for debugging.
    """
    with get_db() as conn:
        cursor = conn.execute("SELECT status FROM analysis_sessions WHERE id = ?", (session_id,))
        s_row = cursor.fetchone()
        if not s_row:
            raise HTTPException(status_code=404, detail="Session not found.")
            
        cursor = conn.execute(
            """
            SELECT rj.id, rj.question_text, rj.confidence, rj.reason, rj.question_number, rj.page_number, rj.section, rj.marks, p.filename
            FROM rejected_questions rj
            JOIN papers p ON rj.paper_id = p.id
            WHERE p.session_id = ?
            ORDER BY rj.confidence DESC
            """,
            (session_id,)
        )
        rejected = cursor.fetchall()
        
    return {
        "sessionId": session_id,
        "rejectedQuestions": [
            {
                "id": r["id"],
                "questionText": r["question_text"],
                "confidence": r["confidence"],
                "reason": r["reason"],
                "questionNumber": r["question_number"],
                "pageNumber": r["page_number"],
                "section": r["section"],
                "marks": r["marks"],
                "filename": r["filename"]
            }
            for r in rejected
        ]
    }
