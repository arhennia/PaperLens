"""Configuration for the PaperLens processing service.

Everything tunable lives here so it can be found in one place and changed
without hunting through the pipeline. Two categories:

* **Environment** — credentials and deployment-specific values. Read at import.
* **Pinned constants** — algorithm versions and thresholds. These are code, not
  environment, because analytics must be reproducible: a threshold that varied
  per deployment would make two installs disagree about the same papers
  (D-014).

The service holds ``SUPABASE_SECRET_KEY`` for job-scoped database work and
receives no end-user credentials (D-021).
"""

import os
from pathlib import Path


def _load_local_env() -> None:
    """Load local env files for the worker without overriding process values."""
    candidates = (
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parent.parent / ".env.local",
    )
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip().strip('"').strip("'")
            if name and name not in os.environ:
                os.environ[name] = value


_load_local_env()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name, str(default)).lower()
    return raw in {"1", "true", "yes", "on"}


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

SUPABASE_URL = _env("SUPABASE_URL")

# Service-role key. Bypasses RLS, so every query this service makes must scope
# itself explicitly by the job's user_id and folder_id.
SUPABASE_SECRET_KEY = _env("SUPABASE_SECRET_KEY")

# Shared secret that proves a caller is trusted Next.js server code (D-021).
# FastAPI verifies *callers*, not *users*.
PROCESSING_SERVICE_TOKEN = _env("PROCESSING_SERVICE_TOKEN")

STORAGE_BUCKET = _env("SUPABASE_STORAGE_BUCKET", "exam-pdfs")

TESSERACT_CMD = _env("TESSERACT_CMD")

# Verbose per-question rejection logging. Defaults to False: it used to default
# to True, which meant debug output was the normal case (D-019).
DEBUG_MODE = _env_bool("PAPERLENS_DEBUG", False)

# Which institution pattern set to use for extraction (D-028).
INSTITUTION_PROFILE = _env("INSTITUTION_PROFILE", "default")


def require_supabase_config() -> None:
    """Fail loudly if database configuration is missing.

    Called by the worker and by routes that touch the database, not at import
    time, so the module stays importable in tests that only exercise the pure
    extraction and analysis functions.
    """
    missing = [
        name
        for name, value in (
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SECRET_KEY", SUPABASE_SECRET_KEY),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Missing required environment variables: "
            + ", ".join(missing)
            + ". Copy .env.example to backend/.env and fill it in."
        )


# ---------------------------------------------------------------------------
# Pinned algorithm versions
#
# Stored on every derived row so a score can be explained and reproduced, and so
# a change is an explicit migrated event rather than silent drift (D-011, D-014).
# ---------------------------------------------------------------------------

# Bump when normalization rules change. Changing this changes every question
# hash, so it requires a migration that recomputes hashes and remaps
# corrections.
NORMALIZER_VERSION = 1

# Bump when scoring weights, factors, or clustering change. Bumping it changes
# every analytics fingerprint, which invalidates every cache row automatically.
ALGO_VERSION = 1

# ---------------------------------------------------------------------------
# Analysis thresholds
# ---------------------------------------------------------------------------

# Advisory similarity threshold (D-024). NOT VALIDATED: 0.84 was an untested
# constant in the previous implementation and is retained only as a starting
# point. It may group and badge; it must never merge two question identities.
# Stored with every cluster row so a change is detectable after the fact.
SIMILARITY_THRESHOLD = float(_env("SIMILARITY_THRESHOLD", "0.84") or "0.84")

# Six-factor priority weights. Sum to 1.0.
SCORING_WEIGHTS = {
    "frequency": 0.30,
    "recency": 0.25,
    "marks": 0.20,
    "spread": 0.15,
    "cluster": 0.07,
    "chapter": 0.03,
}

# Points lost per year of age, measured against the folder's stored
# reference_year rather than the clock (D-014).
RECENCY_DECAY_PER_YEAR = 20.0

# Score thresholds for priority buckets, highest first.
PRIORITY_LEVELS = (
    (85.0, "critical"),
    (70.0, "very_high"),
    (50.0, "high"),
    (30.0, "medium"),
    (0.0, "low"),
)

# ---------------------------------------------------------------------------
# Extraction thresholds
# ---------------------------------------------------------------------------

# A page with less text than this is treated as scanned and sent to OCR.
OCR_CHAR_THRESHOLD = 100

# A page containing images needs more text than this to be trusted as native.
OCR_CHAR_THRESHOLD_WITH_IMAGES = 250

# Rendering resolution for OCR.
OCR_DPI = 150

# Below this mean per-word confidence, a page is flagged so the UI can tell the
# student to check the original rather than trusting the text (D-013).
OCR_LOW_CONFIDENCE_THRESHOLD = 70.0

# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------

# A job whose worker died mid-flight is reclaimable after this long (D-018).
JOB_STALE_LOCK_MINUTES = 15

JOB_MAX_ATTEMPTS = 3

# Seconds between polls when the queue is empty.
WORKER_POLL_SECONDS = 5.0
