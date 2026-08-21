import logging
import sys
import os

# Set up environment
os.environ["SUPABASE_URL"] = "https://hjzghinbochdgozyqaoy.supabase.co"
os.environ["SUPABASE_SECRET_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg"

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)

logger = logging.getLogger("test")

# Test claim directly
logger.info("Testing claim_next_job RPC call...")

from backend.db import jobs as jobs_db

try:
    job = jobs_db.claim_next_job("test-worker")
    if job:
        logger.info(f"✅ Claimed job: {job.id} ({job.job_type})")
    else:
        logger.info("No jobs available to claim")
except Exception as e:
    logger.error(f"❌ Failed to claim: {e}", exc_info=True)
