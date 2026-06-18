import os
import re
import hashlib
import json
import traceback
# pyrefly: ignore [missing-import]
import fitz 
from services.db_service import get_db
from services.pdf_service import extract_text_from_pdf_bytes
from services.question_extraction_service import parse_questions_from_text
from services.analysis_services import DeduplicationService, SimilarityService, TopicClassificationService, PriorityScoreService

def detect_year_from_pdf(file_path: str, filename: str) -> tuple[int | None, str]:
    """
    3-Stage Year Detection Pipeline:
    1. Extract year from filename.
    2. If unavailable, scan first-page text.
    3. If confidence is low, return None and source 'manual'.
    """
    # Stage 1: Filename check
    # Match any 4-digit number starting with 199 or 20 (range 1990 - 2035)
    fn_match = re.search(r'\b(20[0-3]\d|199\d)\b', filename)
    if fn_match:
        return int(fn_match.group(1)), "filename"
        
    # Stage 2: First-page text scan
    try:
        if os.path.exists(file_path):
            doc = fitz.open(file_path)
            if len(doc) > 0:
                first_page = doc.load_page(0)
                text = first_page.get_text()
                # Find all potential year matches in first page text
                matches = re.findall(r'\b(20[0-3]\d|199\d)\b', text)
                if matches:
                    # Filter out common roll numbers, reg numbers, or course codes
                    # Heuristic: standard exam years are usually 2010 to 2032.
                    valid_years = [int(y) for y in matches if 2010 <= int(y) <= 2032]
                    if valid_years:
                        # Return the most frequent year or first one
                        return valid_years[0], "document_text"
            doc.close()
    except Exception as e:
        print(f"Error reading first page of {filename} for year detection: {e}")
        
    # Stage 3: Low confidence, fallback to manual override
    return None, "manual"

def run_batch_processing(session_id: str, years_override: dict = None):
    """
    Background worker that executes the complete multi-PDF analysis pipeline.
    """
    if years_override is None:
        years_override = {}
        
    try:
        # 1. Update session status to 'extracting'
        with get_db() as conn:
            conn.execute(
                "UPDATE analysis_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ("extracting", session_id)
            )
            
            # Fetch all papers in session
            cursor = conn.execute(
                "SELECT id, filename, file_path, year, year_source FROM papers WHERE session_id = ?",
                (session_id,)
            )
            papers = cursor.fetchall()
            
        # 2. Extract and parse each paper
        for p in papers:
            paper_id = p["id"]
            filename = p["filename"]
            file_path = p["file_path"]
            
            # Update paper status to extracting
            with get_db() as conn:
                conn.execute(
                    "UPDATE papers SET extraction_status = ? WHERE id = ?",
                    ("extracting", paper_id)
                )
                
            try:
                # Retrieve year
                year = p["year"]
                year_source = p["year_source"]
                
                # Check for manual overrides from the client payload
                if filename in years_override:
                    year = int(years_override[filename])
                    year_source = "manual"
                elif not year:
                    # Run 3-stage year detection
                    year, year_source = detect_year_from_pdf(file_path, filename)
                    
                if not year:
                    # If we still don't have a year, block and prompt manual override
                    with get_db() as conn:
                        conn.execute(
                            "UPDATE papers SET extraction_status = ? WHERE id = ?",
                            ("needs_year", paper_id)
                        )
                        conn.execute(
                            "UPDATE analysis_sessions SET status = ?, error_message = ? WHERE id = ?",
                            ("failed", f"Year not detected for file: {filename}", session_id)
                        )
                    return
                
                # Update year information in DB
                with get_db() as conn:
                    conn.execute(
                        "UPDATE papers SET year = ?, year_source = ? WHERE id = ?",
                        (year, year_source, paper_id)
                    )
                    
                # Read PDF bytes
                with open(file_path, "rb") as f:
                    pdf_bytes = f.read()
                    
                # Idempotency / Hash check
                content_hash = hashlib.sha256(pdf_bytes).hexdigest()
                
                # Check if this content hash was already extracted globally within this session
                # If so, copy the raw questions and skip parsing
                with get_db() as conn:
                    conn.execute("UPDATE papers SET content_hash = ? WHERE id = ?", (content_hash, paper_id))
                    
                    cursor = conn.execute(
                        """
                        SELECT id FROM papers 
                        WHERE content_hash = ? AND session_id = ? AND id != ? AND extraction_status = 'extracted'
                        """,
                        (content_hash, session_id, paper_id)
                    )
                    duplicate_paper = cursor.fetchone()
                    
                    if duplicate_paper:
                        # Copy raw questions from duplicate paper
                        dup_id = duplicate_paper["id"]
                        cursor_q = conn.execute("SELECT question_text, marks, section, question_type, question_number, page_number FROM raw_questions WHERE paper_id = ?", (dup_id,))
                        dup_qs = cursor_q.fetchall()
                        for dq in dup_qs:
                            q_id = f"rq_{paper_id}_{hashlib.md5(dq['question_text'].encode('utf-8')).hexdigest()[:8]}"
                            conn.execute(
                                """
                                INSERT INTO raw_questions (id, paper_id, question_text, question_text_normalized, content_hash, marks, section, question_type, question_number, page_number)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (q_id, paper_id, dq["question_text"], "", "", dq["marks"], dq["section"], dq["question_type"], dq["question_number"], dq["page_number"])
                            )
                        conn.execute(
                            "UPDATE papers SET extraction_status = ?, total_questions = ? WHERE id = ?",
                            ("extracted", len(dup_qs), paper_id)
                        )
                        continue
                
                # Extract text using existing PDF service
                raw_text, method, page_count = extract_text_from_pdf_bytes(pdf_bytes)
                
                # Segment questions hierarchically
                questions, sections_found, warnings = parse_questions_from_text(raw_text)
                
                # Save raw questions into database (flatten hierarchical questions for storage)
                with get_db() as conn:
                    # Clear any stale raw questions for this paper
                    conn.execute("DELETE FROM raw_questions WHERE paper_id = ?", (paper_id,))
                    
                    total_questions = 0
                    
                    def save_recursive(q_list, parent_number=None, section=None):
                        nonlocal total_questions
                        for q in q_list:
                            q_num = q.get("questionNumber")
                            q_text = q.get("questionText", "")
                            q_marks = q.get("marks")
                            q_sec = q.get("section", section)
                            
                            # Clean details
                            # Generate unique PK
                            q_uuid = f"rq_{paper_id}_{total_questions}_{hashlib.md5(q_text.encode('utf-8')).hexdigest()[:8]}"
                            conn.execute(
                                """
                                INSERT INTO raw_questions (
                                    id, paper_id, question_text, question_text_normalized, content_hash, 
                                    marks, section, question_type, question_number, page_number
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (q_uuid, paper_id, q_text, "", "", q_marks, q_sec, "long" if q_marks and q_marks >= 10 else "short", q_num, 1)
                            )
                            total_questions += 1
                            
                            # Save subquestions
                            if q.get("subquestions"):
                                save_recursive(q["subquestions"], q_num, q_sec)
                                
                    save_recursive(questions)
                    
                    # Update paper metadata
                    conn.execute(
                        "UPDATE papers SET extraction_status = ?, total_pages = ?, total_questions = ? WHERE id = ?",
                        ("extracted", page_count, total_questions, paper_id)
                    )
            except Exception as e:
                traceback.print_exc()
                with get_db() as conn:
                    conn.execute(
                        "UPDATE papers SET extraction_status = ?, error_message = ? WHERE id = ?",
                        ("failed", str(e), paper_id)
                    )
                    conn.execute(
                        "UPDATE analysis_sessions SET status = ?, error_message = ? WHERE id = ?",
                        ("failed", f"Failed processing {filename}: {str(e)}", session_id)
                    )
                return
                
        # 3. Merging Phase
        with get_db() as conn:
            conn.execute(
                "UPDATE analysis_sessions SET status = ? WHERE id = ?",
                ("merging", session_id)
            )
        DeduplicationService.run_deduplication(session_id)
        
        # 4. Analyzing Phase
        with get_db() as conn:
            conn.execute(
                "UPDATE analysis_sessions SET status = ? WHERE id = ?",
                ("analyzing", session_id)
            )
        # Clustering, topic classification, and priority scoring
        SimilarityService().run_clustering(session_id)
        TopicClassificationService.run_classification(session_id)
        PriorityScoreService.run_scoring(session_id)
        
        # 5. Precompute and cache analytics dashboard metrics
        precompute_and_cache_analytics(session_id)
        
        # 6. Complete Session
        with get_db() as conn:
            conn.execute(
                "UPDATE analysis_sessions SET status = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ("complete", session_id)
            )
            
    except Exception as e:
        traceback.print_exc()
        with get_db() as conn:
            conn.execute(
                "UPDATE analysis_sessions SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ("failed", f"Internal processing error: {str(e)}", session_id)
            )

def precompute_and_cache_analytics(session_id: str):
    """
    Computes summary stats, priority distribution, chapter weightages, and year trends,
    then saves the final JSON structure in analysis_sessions.analytics_json.
    """
    with get_db() as conn:
        # 1. Total papers and raw questions
        cursor = conn.execute("SELECT COUNT(id) as cnt FROM papers WHERE session_id = ?", (session_id,))
        total_papers = cursor.fetchone()["cnt"]
        
        cursor = conn.execute("SELECT COUNT(rq.id) as cnt FROM raw_questions rq JOIN papers p ON rq.paper_id = p.id WHERE p.session_id = ?", (session_id,))
        total_raw_questions = cursor.fetchone()["cnt"]
        
        # 2. Total unique questions (conceptually unique, counting distinct clusters/groups)
        cursor = conn.execute(
            """
            SELECT COUNT(DISTINCT COALESCE(cluster_id, id)) as cnt 
            FROM question_groups 
            WHERE session_id = ?
            """,
            (session_id,)
        )
        total_unique_questions = cursor.fetchone()["cnt"]
        
        # 3. Repeat Rate: 100 * (1 - Unique Groups / Total Raw Questions)
        repeat_rate = 0.0
        if total_raw_questions > 0:
            repeat_rate = round(100.0 * (1.0 - (total_unique_questions / total_raw_questions)), 1)
            
        # 4. Priority Distribution counts
        cursor = conn.execute(
            """
            SELECT priority_level, COUNT(*) as cnt 
            FROM question_groups 
            WHERE session_id = ? 
            GROUP BY priority_level
            """,
            (session_id,)
        )
        dist_rows = cursor.fetchall()
        distribution = {"critical": 0, "very_high": 0, "high": 0, "medium": 0, "low": 0}
        for dr in dist_rows:
            distribution[dr["priority_level"]] = dr["cnt"]
            
        # 5. Exam Focus Areas / Topic Weightage
        # Returns: topic_id, name, freq_pct, marks_pct, count
        cursor = conn.execute(
            """
            SELECT t.id, t.name, COUNT(qo.id) as occ_count, SUM(qo.marks) as total_marks
            FROM topics t
            LEFT JOIN question_groups qg ON qg.topic_id = t.id
            LEFT JOIN question_occurrences qo ON qo.group_id = qg.id
            WHERE t.session_id = ?
            GROUP BY t.id, t.name
            """,
            (session_id,)
        )
        topic_rows = cursor.fetchall()
        
        # Find totals to calculate percentages
        total_occs = sum(tr["occ_count"] for tr in topic_rows) or 1
        total_topic_marks = sum(tr["total_marks"] for tr in topic_rows if tr["total_marks"] is not None) or 1
        
        focus_areas = []
        for tr in topic_rows:
            occ_cnt = tr["occ_count"]
            t_marks = tr["total_marks"] if tr["total_marks"] is not None else 0.0
            
            freq_pct = round(100.0 * (occ_cnt / total_occs), 1)
            marks_pct = round(100.0 * (t_marks / total_topic_marks), 1)
            
            focus_areas.append({
                "topic_id": tr["id"],
                "name": tr["name"],
                "count": occ_cnt,
                "freq_pct": freq_pct,
                "marks_pct": marks_pct
            })
        # Sort focus areas by count descending
        focus_areas.sort(key=lambda x: x["count"], reverse=True)
        
        # 6. Year-wise Question Frequency trend
        cursor = conn.execute(
            """
            SELECT year, COUNT(*) as cnt 
            FROM question_occurrences qo
            JOIN question_groups qg ON qo.group_id = qg.id
            WHERE qg.session_id = ? AND year IS NOT NULL
            GROUP BY year
            ORDER BY year ASC
            """,
            (session_id,)
        )
        year_rows = cursor.fetchall()
        year_trends = [{"year": yr["year"], "count": yr["cnt"]} for yr in year_rows]
        
        # 7. Summary metrics
        analytics_data = {
            "total_papers": total_papers,
            "total_raw_questions": total_raw_questions,
            "total_unique_questions": total_unique_questions,
            "repeat_rate": repeat_rate,
            "priority_distribution": distribution,
            "focus_areas": focus_areas,
            "year_trends": year_trends
        }
        
        # Save cache back to database
        conn.execute(
            "UPDATE analysis_sessions SET analytics_json = ? WHERE id = ?",
            (json.dumps(analytics_data), session_id)
        )
