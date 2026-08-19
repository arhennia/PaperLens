import os
import logging
from typing import Optional, Any, Dict, List

logger = logging.getLogger("paperlens.db_service")

# ==============================================================================
# Supabase Client Configuration & Initialization
# ==============================================================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "exam-papers")

_supabase_client = None

def get_supabase_client():
    """
    Returns the initialized Supabase client instance.
    If credentials are not yet configured in the environment, logs a warning
    and returns None without throwing boot-time fatal crashes.
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    if not SUPABASE_URL or not SUPABASE_KEY or SUPABASE_URL == "your_supabase_project_url":
        logger.warning(
            "Supabase credentials (SUPABASE_URL / SUPABASE_KEY) are not configured. "
            "Database operations requiring live Supabase connection will be stubbed."
        )
        return None

    try:
        from supabase import create_client, Client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully.")
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        return None


# ==============================================================================
# Storage Path Helper
# Format: {user_id}/{folder_id}/{paper_id}.pdf
# ==============================================================================
def build_storage_path(user_id: str, folder_id: str, paper_id: str, filename: Optional[str] = None) -> str:
    """
    Constructs the canonical Supabase Storage path for an exam paper PDF.
    Format: {user_id}/{folder_id}/{paper_id}.pdf
    """
    u_id = user_id or "anonymous"
    f_id = folder_id or "default"
    p_id = paper_id or "paper"
    return f"{u_id}/{f_id}/{p_id}.pdf"


# ==============================================================================
# Profiles Service Stub (Auth & User Metadata)
# ==============================================================================
class ProfilesDB:
    @staticmethod
    def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("profiles").select("*").eq("id", user_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def create_profile(profile_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("profiles").insert(profile_data).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def update_profile(user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("profiles").update(updates).eq("id", user_id).execute()
        return response.data[0] if response.data else None


# ==============================================================================
# Folders Service Stub (Organization & Subject Bundles)
# ==============================================================================
class FoldersDB:
    @staticmethod
    def create_folder(folder_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("folders").insert(folder_data).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_user_folders(user_id: str) -> List[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return []
        response = client.table("folders").select("*").eq("user_id", user_id).order("created_at").execute()
        return response.data or []

    @staticmethod
    def get_folder(folder_id: str) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("folders").select("*").eq("id", folder_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def delete_folder(folder_id: str) -> bool:
        client = get_supabase_client()
        if not client:
            return False
        client.table("folders").delete().eq("id", folder_id).execute()
        return True


# ==============================================================================
# Analysis Sessions Service Stub
# ==============================================================================
class SessionsDB:
    @staticmethod
    def create_session(session_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("analysis_sessions").insert(session_data).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_session(session_id: str) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("analysis_sessions").select("*").eq("id", session_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def update_session(session_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("analysis_sessions").update(updates).eq("id", session_id).execute()
        return response.data[0] if response.data else None


# ==============================================================================
# Papers Service Stub (Storage Path & Extraction State)
# ==============================================================================
class PapersDB:
    @staticmethod
    def create_paper(paper_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("papers").insert(paper_data).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_paper(paper_id: str) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("papers").select("*").eq("id", paper_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_papers_by_session(session_id: str) -> List[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return []
        response = client.table("papers").select("*").eq("session_id", session_id).execute()
        return response.data or []

    @staticmethod
    def update_paper(paper_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("papers").update(updates).eq("id", paper_id).execute()
        return response.data[0] if response.data else None


# ==============================================================================
# Questions & Analysis DB Service Stub
# ==============================================================================
class QuestionsDB:
    @staticmethod
    def insert_raw_questions(questions: List[Dict[str, Any]]) -> bool:
        client = get_supabase_client()
        if not client or not questions:
            return False
        client.table("raw_questions").insert(questions).execute()
        return True

    @staticmethod
    def get_raw_questions(session_id: str) -> List[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return []
        response = client.table("raw_questions").select("*, papers!inner(session_id)").eq("papers.session_id", session_id).execute()
        return response.data or []

    @staticmethod
    def insert_question_groups(groups: List[Dict[str, Any]]) -> bool:
        client = get_supabase_client()
        if not client or not groups:
            return False
        client.table("question_groups").insert(groups).execute()
        return True

    @staticmethod
    def get_question_groups(session_id: str) -> List[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return []
        response = client.table("question_groups").select("*, topics(name)").eq("session_id", session_id).order("priority_score", desc=True).execute()
        return response.data or []

    @staticmethod
    def insert_rejected_questions(rejected_list: List[Dict[str, Any]]) -> bool:
        client = get_supabase_client()
        if not client or not rejected_list:
            return False
        client.table("rejected_questions").insert(rejected_list).execute()
        return True

    @staticmethod
    def get_rejected_questions(session_id: str) -> List[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return []
        response = client.table("rejected_questions").select("*, papers!inner(session_id, filename)").eq("papers.session_id", session_id).execute()
        return response.data or []


# ==============================================================================
# Shared Links Service Stub (Public / Read-Only Sharing)
# ==============================================================================
class SharedLinksDB:
    @staticmethod
    def create_shared_link(link_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("shared_links").insert(link_data).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def get_shared_link(link_id: str) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        if not client:
            return None
        response = client.table("shared_links").select("*").eq("id", link_id).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def revoke_shared_link(link_id: str) -> bool:
        client = get_supabase_client()
        if not client:
            return False
        client.table("shared_links").delete().eq("id", link_id).execute()
        return True


# ==============================================================================
# Legacy get_db stub (Safe fallback to prevent import crashes during handoff)
# ==============================================================================
class _StubConnection:
    def execute(self, *args, **kwargs):
        return self
    def executemany(self, *args, **kwargs):
        return self
    def fetchone(self):
        return None
    def fetchall(self):
        return []
    def commit(self):
        pass
    def rollback(self):
        pass
    def close(self):
        pass

from contextlib import contextmanager
@contextmanager
def get_db():
    """
    Transition stub context manager.
    Enables existing pipeline modules to import smoothly while team members
    (Swayam & Harshit) wire live Supabase operations via the DB service stubs above.
    """
    conn = _StubConnection()
    try:
        yield conn
    finally:
        pass
