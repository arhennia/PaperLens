import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "paperlens.db")

@contextmanager
def get_db():
    """
    Context manager to yield a thread-safe connection to the SQLite database.
    Automatically handles commit/rollback and connection closing.
    Enables WAL mode and foreign key constraints.
    """
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    """
    Initializes the database tables and standard indexes for Milestone 4.
    """
    schema = [
        """
        CREATE TABLE IF NOT EXISTS analysis_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL, -- 'created', 'extracting', 'merging', 'analyzing', 'complete', 'failed'
            error_message TEXT,
            analytics_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            year INTEGER,
            year_source TEXT, -- 'filename', 'document_text', 'manual'
            file_path TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            total_pages INTEGER DEFAULT 0,
            total_questions INTEGER DEFAULT 0,
            extraction_status TEXT NOT NULL, -- 'queued', 'extracting', 'extracted', 'failed', 'needs_year'
            error_message TEXT,
            FOREIGN KEY (session_id) REFERENCES analysis_sessions(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS user_context (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            subject TEXT,
            exam_name TEXT,
            exam_type TEXT, -- 'mid_sem', 'end_sem', 'internal', 'competitive'
            total_marks INTEGER,
            question_pattern TEXT,
            chapters_json TEXT, -- JSON array of strings
            FOREIGN KEY (session_id) REFERENCES analysis_sessions(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS similarity_clusters (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            representative_group_id TEXT, -- Will set or update later
            method TEXT NOT NULL, -- 'fuzzy', 'tfidf', 'embeddings'
            similarity_threshold REAL NOT NULL,
            group_count INTEGER DEFAULT 1,
            FOREIGN KEY (session_id) REFERENCES analysis_sessions(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            name TEXT NOT NULL,
            chapter_number INTEGER,
            keywords_json TEXT, -- JSON list of strings
            FOREIGN KEY (session_id) REFERENCES analysis_sessions(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS question_groups (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            canonical_text TEXT NOT NULL,
            cluster_id TEXT,
            topic_id TEXT,
            avg_marks REAL,
            max_marks REAL,
            first_year INTEGER,
            last_year INTEGER,
            year_span INTEGER,
            priority_score REAL DEFAULT 0.0,
            priority_level TEXT DEFAULT 'low',
            f_freq REAL DEFAULT 0.0,
            f_recency REAL DEFAULT 0.0,
            f_marks REAL DEFAULT 0.0,
            f_spread REAL DEFAULT 0.0,
            f_cluster REAL DEFAULT 0.0,
            f_chapter REAL DEFAULT 0.0,
            priority_reason TEXT,
            similarity_confidence REAL DEFAULT 1.0,
            question_types_json TEXT, -- e.g. JSON array of strings: ["short", "long"]
            score_computed_at TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES analysis_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (cluster_id) REFERENCES similarity_clusters(id) ON DELETE SET NULL,
            FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS raw_questions (
            id TEXT PRIMARY KEY,
            paper_id TEXT NOT NULL,
            question_text TEXT NOT NULL,
            question_text_normalized TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            marks REAL,
            section TEXT,
            question_type TEXT,
            question_number TEXT,
            page_number INTEGER,
            group_id TEXT,
            FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES question_groups(id) ON DELETE SET NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS question_occurrences (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL,
            raw_question_id TEXT NOT NULL,
            paper_id TEXT NOT NULL,
            year INTEGER,
            marks REAL,
            FOREIGN KEY (group_id) REFERENCES question_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (raw_question_id) REFERENCES raw_questions(id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
        );
        """
    ]
    
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_papers_hash ON papers(content_hash);",
        "CREATE INDEX IF NOT EXISTS idx_raw_q_hash ON raw_questions(content_hash);",
        "CREATE INDEX IF NOT EXISTS idx_q_groups_priority ON question_groups(session_id, priority_score DESC);",
        "CREATE INDEX IF NOT EXISTS idx_occurrences_group ON question_occurrences(group_id);",
        "CREATE INDEX IF NOT EXISTS idx_occurrences_raw ON question_occurrences(raw_question_id);"
    ]
    
    with get_db() as conn:
        for query in schema:
            conn.execute(query)
        for idx in indexes:
            conn.execute(idx)

# Initialize on module load
init_db()
