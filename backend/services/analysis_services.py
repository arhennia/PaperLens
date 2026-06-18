import re
import hashlib
import json
from abc import ABC, abstractmethod
import datetime
from services.db_service import get_db

# ==========================================
# 1. Similarity Provider Abstraction (ABC)
# ==========================================
class SimilarityProvider(ABC):
    @abstractmethod
    def compute_similarity(self, text1: str, text2: str) -> float:
        """
        Computes similarity between two strings.
        Returns a float between 0.0 (no similarity) and 1.0 (identical).
        """
        pass

# Default RapidFuzz Provider
class RapidFuzzSimilarityProvider(SimilarityProvider):
    def __init__(self):
        try:
            # pyrefly: ignore [missing-import]
            from rapidfuzz import fuzz
            self.fuzz = fuzz
        except ImportError:
            raise ImportError("RapidFuzz library is not installed. Please install it to use RapidFuzzSimilarityProvider.")

    def compute_similarity(self, text1: str, text2: str) -> float:
        if not text1 or not text2:
            return 0.0
        # Use token_set_ratio as recommended for paraphrasing
        return self.fuzz.token_set_ratio(text1, text2) / 100.0

# ==========================================
# 2. Text Normalization Utilities
# ==========================================
def clean_and_normalize_text(text: str) -> str:
    """
    Lowercase, strip punctuation (except parenthesized labels), collapse whitespace,
    and strip question number prefixes (like Q1., (a), 1.iv etc.).
    """
    if not text:
        return ""
    
    # Lowercase
    text = text.lower()
    
    # Strip question number prefixes
    text = re.sub(r'^\s*(?:q|question)\s*\d+[\s\.\:\,\-]*', '', text)
    text = re.sub(r'^\s*\d+[\.\:\-]+\s*', '', text)
    text = re.sub(r'^\s*(?:\([a-z0-9]+\)|[a-z0-9]+[\)\.\:\-])\s*', '', text)
    
    # Collapse multiple whitespaces and newlines
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Strip punctuation except parenthesis
    text = re.sub(r'[^\w\s\(\)]', '', text)
    
    return text.strip()

def compute_text_hash(normalized_text: str) -> str:
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()

# ==========================================
# 3. Deduplication Service
# ==========================================
class DeduplicationService:
    @staticmethod
    def run_deduplication(session_id: str):
        """
        Reads raw_questions for the session, hashes them, performs exact deduplication,
        creates question_groups, and registers occurrences.
        """
        with get_db() as conn:
            # 1. Fetch raw questions
            cursor = conn.execute(
                """
                SELECT rq.id, rq.question_text, rq.marks, p.year, rq.section, rq.question_type, rq.question_number
                FROM raw_questions rq
                JOIN papers p ON rq.paper_id = p.id
                WHERE p.session_id = ?
                """,
                (session_id,)
            )
            raw_qs = cursor.fetchall()
            if not raw_qs:
                return
            
            # 2. Update normalized texts and hashes in raw_questions
            updates = []
            for rq in raw_qs:
                norm = clean_and_normalize_text(rq["question_text"])
                chash = compute_text_hash(norm)
                updates.append((norm, chash, rq["id"]))
            
            conn.executemany(
                """
                UPDATE raw_questions
                SET question_text_normalized = ?, content_hash = ?
                WHERE id = ?
                """,
                updates
            )
            
            # 3. Group by hash
            # Refetch updated questions
            cursor = conn.execute(
                """
                SELECT rq.id, rq.question_text, rq.question_text_normalized, rq.content_hash, rq.marks, p.year, p.id as paper_id
                FROM raw_questions rq
                JOIN papers p ON rq.paper_id = p.id
                WHERE p.session_id = ?
                """,
                (session_id,)
            )
            all_questions = cursor.fetchall()
            
            # Group them by hash
            groups = {}
            for q in all_questions:
                chash = q["content_hash"]
                if chash not in groups:
                    groups[chash] = []
                groups[chash].append(q)
                
            # Clear existing groups and occurrences for this session to ensure idempotency
            conn.execute(
                "DELETE FROM question_occurrences WHERE group_id IN (SELECT id FROM question_groups WHERE session_id = ?)",
                (session_id,)
            )
            conn.execute("DELETE FROM question_groups WHERE session_id = ?", (session_id,))
            
            # Create new groups and occurrences
            for idx, (chash, occurrences) in enumerate(groups.items()):
                group_id = f"g_{session_id}_{idx}"
                
                # Choose canonical text (longest verbatim text)
                canonical_text = max(occurrences, key=lambda x: len(x["question_text"]))["question_text"]
                
                # Compute aggregates
                marks_list = [o["marks"] for o in occurrences if o["marks"] is not None]
                avg_marks = sum(marks_list) / len(marks_list) if marks_list else None
                max_marks = max(marks_list) if marks_list else None
                
                years = [o["year"] for o in occurrences if o["year"] is not None]
                first_year = min(years) if years else None
                last_year = max(years) if years else None
                year_span = (last_year - first_year) if (last_year and first_year) else 0
                
                # Question types
                types = list(set([o["question_text"].strip() for o in occurrences])) # default placeholder
                # let's infer simple type mix from length or context
                
                conn.execute(
                    """
                    INSERT INTO question_groups (
                        id, session_id, canonical_text, avg_marks, max_marks, 
                        first_year, last_year, year_span, question_types_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (group_id, session_id, canonical_text, avg_marks, max_marks,
                     first_year, last_year, year_span, json.dumps([]))
                )
                
                # Update raw questions group links
                for o in occurrences:
                    conn.execute(
                        "UPDATE raw_questions SET group_id = ? WHERE id = ?",
                        (group_id, o["id"])
                    )
                    
                    # Insert occurrence record
                    occ_id = f"occ_{o['id']}"
                    conn.execute(
                        """
                        INSERT INTO question_occurrences (id, group_id, raw_question_id, paper_id, year, marks)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (occ_id, group_id, o["id"], o["paper_id"], o["year"], o["marks"])
                    )

# ==========================================
# 4. Similarity Service (Clustering)
# ==========================================
class SimilarityService:
    def __init__(self, provider: SimilarityProvider = None):
        self.provider = provider or RapidFuzzSimilarityProvider()

    def run_clustering(self, session_id: str, threshold: float = 0.84):
        """
        Groups question groups into similarity clusters.
        Sets cluster_id and similarity_confidence on question_groups.
        """
        with get_db() as conn:
            # Clear existing clusters for this session
            conn.execute(
                "UPDATE question_groups SET cluster_id = NULL, similarity_confidence = 1.0 WHERE session_id = ?",
                (session_id,)
            )
            conn.execute("DELETE FROM similarity_clusters WHERE session_id = ?", (session_id,))
            
            # Fetch all question groups for this session
            cursor = conn.execute(
                "SELECT id, canonical_text FROM question_groups WHERE session_id = ?",
                (session_id,)
            )
            groups = cursor.fetchall()
            if not groups:
                return
            
            unclustered = list(groups)
            cluster_index = 0
            
            while unclustered:
                # Take the first group as the representative/seed of a new cluster
                seed = unclustered.pop(0)
                cluster_id = f"c_{session_id}_{cluster_index}"
                cluster_index += 1
                
                # Gather items similar to seed
                cluster_members = [(seed["id"], 1.0)] # (group_id, similarity_confidence)
                
                # Compare against all remaining unclustered groups
                still_unclustered = []
                for g in unclustered:
                    score = self.provider.compute_similarity(seed["canonical_text"], g["canonical_text"])
                    if score >= threshold:
                        cluster_members.append((g["id"], score))
                    else:
                        still_unclustered.append(g)
                unclustered = still_unclustered
                
                # Create the similarity cluster row
                # We find the group with the longest canonical_text in the cluster to represent it
                rep_group_id = seed["id"]
                longest_len = len(seed["canonical_text"])
                for member_id, score in cluster_members:
                    # Let's find group's canonical text length
                    m_group = next(x for x in groups if x["id"] == member_id)
                    if len(m_group["canonical_text"]) > longest_len:
                        rep_group_id = member_id
                        longest_len = len(m_group["canonical_text"])
                
                # Insert cluster
                conn.execute(
                    """
                    INSERT INTO similarity_clusters (id, session_id, representative_group_id, method, similarity_threshold, group_count)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (cluster_id, session_id, rep_group_id, "fuzzy", threshold, len(cluster_members))
                )
                
                # Update groups in the cluster
                for member_id, score in cluster_members:
                    # Persist similarity_confidence and link to cluster
                    conn.execute(
                        """
                        UPDATE question_groups
                        SET cluster_id = ?, similarity_confidence = ?
                        WHERE id = ?
                        """,
                        (cluster_id, score, member_id)
                    )

# ==========================================
# 5. Topic Classification Service
# ==========================================
class TopicClassificationService:
    @staticmethod
    def run_classification(session_id: str):
        """
        Reads user_context chapters, initializes topics table, and classifies question_groups.
        """
        with get_db() as conn:
            # 1. Fetch user context chapters
            cursor = conn.execute("SELECT chapters_json FROM user_context WHERE session_id = ?", (session_id,))
            row = cursor.fetchone()
            
            chapters = []
            if row and row["chapters_json"]:
                try:
                    chapters = json.loads(row["chapters_json"])
                except Exception:
                    pass
            
            # If no chapters, we initialize default chapters for Operating Systems / generic computer science topics
            if not chapters:
                chapters = ["Process Management", "CPU Scheduling", "Deadlocks", "Memory Management", "File Systems & Storage", "General & Intro"]
            
            # Refresh topics in DB
            conn.execute("DELETE FROM topics WHERE session_id = ?", (session_id,))
            
            # Insert topics
            topic_map = {}
            for idx, ch in enumerate(chapters):
                topic_id = f"t_{session_id}_{idx}"
                # In real keyword mapping, we tokenize chapters to build keywords
                keywords = [w.lower() for w in re.findall(r'\b\w{3,}\b', ch)]
                # Add typical sub-terms
                if "scheduling" in ch.lower():
                    keywords.extend(["quantum", "priority", "round robin", "fcfs", "sjf", "srtf", "scheduler"])
                if "deadlock" in ch.lower():
                    keywords.extend(["avoidance", "banker", "prevention", "semaphore", "safe state", "resource allocation"])
                if "memory" in ch.lower():
                    keywords.extend(["paging", "segmentation", "thrashing", "virtual memory", "page fault", "replacement", "fragmentation"])
                if "process" in ch.lower():
                    keywords.extend(["thread", "semaphore", "mutex", "critical section", "synchronization", "ipc", "concurrency"])
                if "file" in ch.lower():
                    keywords.extend(["inode", "directory", "disk", "raid", "allocation", "sector", "access control"])
                
                conn.execute(
                    """
                    INSERT INTO topics (id, session_id, name, chapter_number, keywords_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (topic_id, session_id, ch, idx + 1, json.dumps(keywords))
                )
                topic_map[topic_id] = (ch, keywords)
                
            # Classify question groups
            cursor = conn.execute("SELECT id, canonical_text FROM question_groups WHERE session_id = ?", (session_id,))
            groups = cursor.fetchall()
            
            for g in groups:
                text_lower = g["canonical_text"].lower()
                best_topic_id = None
                max_matches = 0
                
                for t_id, (name, keywords) in topic_map.items():
                    matches = sum(1 for kw in keywords if kw in text_lower)
                    if matches > max_matches:
                        max_matches = matches
                        best_topic_id = t_id
                
                # If no keyword matches, match direct topic name as a substring
                if not best_topic_id:
                    for t_id, (name, keywords) in topic_map.items():
                        if name.lower() in text_lower:
                            best_topic_id = t_id
                            break
                            
                # Fallback to the last topic (General / Intro) if nothing matched
                if not best_topic_id:
                    best_topic_id = list(topic_map.keys())[-1]
                    
                conn.execute(
                    "UPDATE question_groups SET topic_id = ? WHERE id = ?",
                    (best_topic_id, g["id"])
                )

# ==========================================
# 6. Priority Scoring Service
# ==========================================
class PriorityScoreService:
    @staticmethod
    def run_scoring(session_id: str):
        """
        Computes composite priority score (0-100) and priority reasons for all question groups in the session.
        """
        current_year = datetime.datetime.now().year
        
        with get_db() as conn:
            # 1. Fetch total years and papers count in this session
            cursor = conn.execute("SELECT COUNT(DISTINCT year) as yr_cnt, COUNT(id) as paper_cnt FROM papers WHERE session_id = ?", (session_id,))
            meta = cursor.fetchone()
            total_years = meta["yr_cnt"] if meta["yr_cnt"] else 1
            total_papers = meta["paper_cnt"] if meta["paper_cnt"] else 1
            
            # Fetch max occurrences of any group in this session
            cursor = conn.execute(
                """
                SELECT MAX(cnt) as max_occ FROM (
                    SELECT COUNT(*) as cnt FROM question_occurrences q_o
                    JOIN question_groups qg ON q_o.group_id = qg.id
                    WHERE qg.session_id = ?
                    GROUP BY q_o.group_id
                )
                """,
                (session_id,)
            )
            row_max = cursor.fetchone()
            max_occ = row_max["max_occ"] if row_max and row_max["max_occ"] else 1
            
            # Fetch max marks in session to normalize if paper total_marks unavailable
            cursor = conn.execute(
                "SELECT MAX(max_marks) as mm FROM question_groups WHERE session_id = ?",
                (session_id,)
            )
            max_marks_in_session = cursor.fetchone()["mm"] or 10.0
            
            # Fetch user context total_marks
            cursor = conn.execute("SELECT total_marks FROM user_context WHERE session_id = ?", (session_id,))
            uc_row = cursor.fetchone()
            context_total_marks = uc_row["total_marks"] if uc_row and uc_row["total_marks"] else None
            
            # 2. Fetch all groups with their aggregations
            cursor = conn.execute(
                """
                SELECT qg.id, qg.canonical_text, qg.avg_marks, qg.last_year, qg.year_span, qg.cluster_id,
                       t.name as topic_name,
                       (SELECT COUNT(*) FROM question_occurrences WHERE group_id = qg.id) as occ_count,
                       (SELECT COUNT(DISTINCT year) FROM question_occurrences WHERE group_id = qg.id) as distinct_years_count,
                       (SELECT group_count FROM similarity_clusters WHERE id = qg.cluster_id) as cluster_size
                FROM question_groups qg
                LEFT JOIN topics t ON qg.topic_id = t.id
                WHERE qg.session_id = ?
                """,
                (session_id,)
            )
            groups = cursor.fetchall()
            
            updates = []
            for g in groups:
                # F_freq (30%)
                f_freq = (g["occ_count"] / max_occ) * 100.0
                
                # F_recency (25%)
                if g["last_year"]:
                    f_recency = max(0.0, 100.0 - (current_year - g["last_year"]) * 20.0)
                else:
                    f_recency = 0.0
                    
                # F_marks (20%)
                if g["avg_marks"]:
                    denom = context_total_marks if context_total_marks else max_marks_in_session
                    f_marks = min(100.0, (g["avg_marks"] / denom) * 100.0)
                else:
                    f_marks = 50.0 # Neutral fallback
                    
                # F_spread (15%)
                f_spread = (g["distinct_years_count"] / total_years) * 100.0
                
                # F_cluster (7%)
                c_size = g["cluster_size"] if g["cluster_size"] else 1
                f_cluster = min(100.0, (c_size - 1) * 25.0)
                
                # F_chapter (3%) - Default to 50.0 (neutral) for MVP
                f_chapter = 50.0
                
                # Final composite score
                score = (
                    (f_freq * 0.30) +
                    (f_recency * 0.25) +
                    (f_marks * 0.20) +
                    (f_spread * 0.15) +
                    (f_cluster * 0.07) +
                    (f_chapter * 0.03)
                )
                
                # Round to 1 decimal place
                score = round(score, 1)
                
                # Map to priority levels
                if score >= 85.0:
                    level = "critical"
                elif score >= 70.0:
                    level = "very_high"
                elif score >= 50.0:
                    level = "high"
                elif score >= 30.0:
                    level = "medium"
                else:
                    level = "low"
                    
                # Generate explanation reason
                reasons = []
                if f_freq >= 80.0:
                    reasons.append("is extremely frequent across papers")
                elif f_freq >= 50.0:
                    reasons.append("has appeared multiple times")
                    
                if f_recency >= 80.0:
                    reasons.append(f"was asked recently (last in {g['last_year']})")
                elif f_recency >= 50.0:
                    reasons.append(f"was asked in recent years")
                    
                if f_spread >= 60.0:
                    reasons.append("shows high consistency across multiple years")
                    
                if g["avg_marks"] and g["avg_marks"] >= 8.0:
                    reasons.append(f"carries high weightage ({int(g['avg_marks'])} marks on average)")
                    
                if c_size > 1:
                    reasons.append(f"appears in {c_size} similar variations")
                    
                # Formulate paragraph
                if reasons:
                    explanation = f"Ranked {level.replace('_', ' ').title()} because it " + ", ".join(reasons[:-1])
                    if len(reasons) > 1:
                        explanation += ", and " + reasons[-1]
                    explanation += "."
                else:
                    explanation = f"Ranked {level.title()} based on standard frequency and spacing factors."
                
                updates.append((
                    score, level, f_freq, f_recency, f_marks, f_spread, f_cluster, f_chapter, explanation,
                    datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), g["id"]
                ))
                
            conn.executemany(
                """
                UPDATE question_groups
                SET priority_score = ?, priority_level = ?,
                    f_freq = ?, f_recency = ?, f_marks = ?, f_spread = ?, f_cluster = ?, f_chapter = ?,
                    priority_reason = ?, score_computed_at = ?
                WHERE id = ?
                """,
                updates
            )
