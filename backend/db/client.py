"""The Supabase client, and PDF download from Storage.

The client is created once and reused: each ``create_client`` call builds a new
connection pool, and a worker creating one per job would leak them.
"""

from functools import lru_cache
from pathlib import Path
import sys

from backend.config import (
    STORAGE_BUCKET,
    SUPABASE_SECRET_KEY,
    SUPABASE_URL,
    require_supabase_config,
)


@lru_cache(maxsize=1)
def get_client():
    """Return the shared service-role Supabase client.

    **Bypasses RLS.** Every caller must scope its queries by ``user_id``.

    ``supabase`` is imported lazily so the extraction and analysis modules stay
    importable — and testable — on a machine without the package installed. A
    top-level import here is what made the whole service unimportable during the
    audit.
    """
    require_supabase_config()

    try:
        # The repository also has a top-level `supabase/` migrations directory.
        # When the worker starts from the project root, that namespace shadows
        # the installed Python SDK, so import the SDK with the workspace path
        # temporarily removed.
        workspace_root = Path(__file__).resolve().parents[2]
        original_path = sys.path[:]
        sys.path = [
            entry
            for entry in sys.path
            if Path(entry or ".").resolve() != workspace_root
        ]
        from supabase import create_client  # noqa: PLC0415 -- lazy, see docstring
    except ImportError as exc:
        raise RuntimeError(
            "The supabase package is not installed. Install backend/requirements.txt."
        ) from exc
    finally:
        sys.path = original_path

    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


def download_pdf(storage_path: str) -> bytes:
    """Download a PDF from the private bucket.

    Args:
        storage_path: Path within the bucket, always server-generated as
            ``{user_id}/{folder_id}/{paper_id}.pdf`` (D-016).

    Returns:
        The file's bytes.

    Raises:
        RuntimeError: The object is missing or unreadable.
    """
    client = get_client()
    try:
        return client.storage.from_(STORAGE_BUCKET).download(storage_path)
    except Exception as exc:
        raise RuntimeError(
            f"Could not download '{storage_path}' from bucket '{STORAGE_BUCKET}': {exc}"
        ) from exc
