"""Deeper check: what happened with the real user's papers and jobs."""
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

print(f"Real user: {REAL_USER}")
print(f"DSA folder: {DSA_FOLDER}")
print()

# Check papers in this folder
papers = admin.table("papers").select("id, original_filename, year, extraction_status, extraction_method, error_message, storage_path").eq("folder_id", DSA_FOLDER).execute()
print(f"Papers in DSA folder ({len(papers.data)}):")
for p in papers.data:
    print(f"  {p['original_filename']} | status={p['extraction_status']} | method={p.get('extraction_method')} | year={p.get('year')} | error={p.get('error_message', 'none')[:80] if p.get('error_message') else 'none'}")
    print(f"    storage_path: {p['storage_path']}")

# Check questions for this folder  
questions = admin.table("questions").select("id, paper_id, status, folder_id, user_id").eq("folder_id", DSA_FOLDER).execute()
print(f"\nQuestions in DSA folder: {len(questions.data)}")

# Check all questions for this user
all_q = admin.table("questions").select("id, folder_id, user_id, status").eq("user_id", REAL_USER).execute()
print(f"Questions for user across all folders: {len(all_q.data)}")

# Check processing jobs for this user/folder
jobs = admin.table("processing_jobs").select("*").eq("user_id", REAL_USER).order("created_at", desc=True).execute()
print(f"\nProcessing jobs for user ({len(jobs.data)}):")
for j in jobs.data:
    folder_name = "?"
    for f in admin.table("folders").select("name").eq("id", j["folder_id"]).execute().data:
        folder_name = f["name"]
    print(f"  {j['job_type']:8s} | {j['status']:10s} | folder={folder_name} ({j['folder_id'][:8]}...) | attempts={j['attempts']} | error={j.get('last_error', '')[:100] if j.get('last_error') else 'none'}")

# Check ALL processing jobs
print("\nALL processing jobs:")
all_jobs = admin.table("processing_jobs").select("id, folder_id, user_id, job_type, status, attempts, last_error").order("created_at", desc=True).execute()
for j in all_jobs.data:
    print(f"  {j['job_type']:8s} | {j['status']:10s} | user={j['user_id'][:8]}... | folder={j['folder_id'][:8]}... | attempts={j['attempts']} | error={j.get('last_error', '')[:100] if j.get('last_error') else 'none'}")

# Check paper_pages for proof extraction actually ran
pages = admin.table("paper_pages").select("id, paper_id, user_id").eq("user_id", REAL_USER).execute()
print(f"\nPaper pages for user: {len(pages.data)}")
