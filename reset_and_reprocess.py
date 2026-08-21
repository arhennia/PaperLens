"""Reset the real user's papers to 'queued' and enqueue fresh extraction jobs."""
import os
os.environ.setdefault("SUPABASE_URL", "https://hjzghinbochdgozyqaoy.supabase.co")
os.environ.setdefault("SUPABASE_SECRET_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg")

import sys
from pathlib import Path
workspace_root = Path(__file__).resolve().parent
sys.path = [e for e in sys.path if Path(e or ".").resolve() != workspace_root]
from supabase import create_client
sys.path.insert(0, str(workspace_root))

URL = os.environ["SUPABASE_URL"]
SECRET = os.environ["SUPABASE_SECRET_KEY"]
admin = create_client(URL, SECRET)

REAL_USER = "c99631f9-1580-4741-8c3b-f47b5cc31711"
DSA_FOLDER = "76bb5680-7d73-45e5-b654-a239b46d2cae"

print("Resetting papers to 'queued' for re-extraction...")
result = (
    admin.table("papers")
    .update({"extraction_status": "queued", "extraction_method": None, "error_message": None})
    .eq("folder_id", DSA_FOLDER)
    .eq("user_id", REAL_USER)
    .execute()
)
print(f"  Updated {len(result.data)} papers")

# Delete old stale processing jobs for this folder to clear idempotency keys
print("Clearing old processing jobs...")
del_result = (
    admin.table("processing_jobs")
    .delete()
    .eq("folder_id", DSA_FOLDER)
    .eq("user_id", REAL_USER)
    .execute()
)
print(f"  Deleted {len(del_result.data)} old jobs")

# Create a fresh extract job
import hashlib
idem_key = hashlib.sha256(f"extract:{DSA_FOLDER}:{REAL_USER}".encode()).hexdigest()
print(f"Enqueuing extract job with idempotency_key: {idem_key[:16]}...")
job_result = (
    admin.table("processing_jobs")
    .insert({
        "folder_id": DSA_FOLDER,
        "user_id": REAL_USER,
        "job_type": "extract",
        "idempotency_key": idem_key,
    })
    .execute()
)
print(f"  Created job: {job_result.data[0]['id']}")
print("\nDone! Start the worker with: python -m backend.worker")
