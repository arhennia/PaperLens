"""Quick diagnostic: check what data exists in Supabase and verify RLS."""
import os
os.environ.setdefault("SUPABASE_URL", "https://hjzghinbochdgozyqaoy.supabase.co")
os.environ.setdefault("SUPABASE_SECRET_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg")

ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTY0ODcsImV4cCI6MjEwMjc3MjQ4N30.4F7dNs5sajjLRagk1swXfDfUbPw0oPYoumlGZlX9qHo"

import sys
from pathlib import Path
workspace_root = Path(__file__).resolve().parent
sys.path = [e for e in sys.path if Path(e or ".").resolve() != workspace_root]
from supabase import create_client
sys.path.insert(0, str(workspace_root))

URL = os.environ["SUPABASE_URL"]
SECRET = os.environ["SUPABASE_SECRET_KEY"]

# 1. Service-role client (bypasses RLS)
admin = create_client(URL, SECRET)

print("=" * 70)
print("SERVICE-ROLE CHECK (bypasses RLS)")
print("=" * 70)

# Check folders
folders = admin.table("folders").select("id, name, user_id").execute()
print(f"\nFolders ({len(folders.data)}):")
for f in folders.data:
    print(f"  {f['name']} | user_id={f['user_id']} | id={f['id']}")

# Check questions count per folder
for f in folders.data:
    fid = f["id"]
    uid = f["user_id"]
    
    q_count = admin.table("questions").select("id", count="exact").eq("folder_id", fid).execute()
    qg_count = admin.table("question_groups").select("id", count="exact").eq("folder_id", fid).execute()
    t_count = admin.table("topics").select("id", count="exact").eq("folder_id", fid).execute()
    a_count = admin.table("folder_analytics").select("folder_id", count="exact").eq("folder_id", fid).execute()
    
    print(f"\n  Folder '{f['name']}':")
    print(f"    questions:       {q_count.count}")
    print(f"    question_groups: {qg_count.count}")
    print(f"    topics:          {t_count.count}")
    print(f"    analytics:       {a_count.count}")
    
    # Check if user_id matches on child records
    if qg_count.count and qg_count.count > 0:
        qg_sample = admin.table("question_groups").select("id, user_id, folder_id").eq("folder_id", fid).limit(1).execute()
        if qg_sample.data:
            row = qg_sample.data[0]
            match = "✓ MATCH" if row["user_id"] == uid else f"✗ MISMATCH (group user_id={row['user_id']}, folder user_id={uid})"
            print(f"    question_groups user_id: {match}")
    
    if t_count.count and t_count.count > 0:
        t_sample = admin.table("topics").select("id, user_id, folder_id").eq("folder_id", fid).limit(1).execute()
        if t_sample.data:
            row = t_sample.data[0]
            match = "✓ MATCH" if row["user_id"] == uid else f"✗ MISMATCH (topic user_id={row['user_id']}, folder user_id={uid})"
            print(f"    topics user_id:          {match}")
    
    if a_count.count and a_count.count > 0:
        a_sample = admin.table("folder_analytics").select("folder_id, user_id").eq("folder_id", fid).limit(1).execute()
        if a_sample.data:
            row = a_sample.data[0]
            match = "✓ MATCH" if row["user_id"] == uid else f"✗ MISMATCH (analytics user_id={row['user_id']}, folder user_id={uid})"
            print(f"    analytics user_id:       {match}")

# Check processing jobs
print("\n\nProcessing jobs:")
jobs = admin.table("processing_jobs").select("id, folder_id, user_id, job_type, status, last_error").order("created_at", desc=True).limit(10).execute()
for j in jobs.data:
    print(f"  {j['job_type']:8s} | {j['status']:10s} | folder={j['folder_id'][:8]}... | error={j.get('last_error', '')[:80] if j.get('last_error') else 'none'}")

# 2. Now test with anon key (RLS applies) - but we'd need a user session
# Let's check what auth users exist
print("\n\nAuth users (from admin API):")
users = admin.auth.admin.list_users()
for u in users:
    print(f"  {u.email} | id={u.id}")

# 3. Check the relational query the frontend uses
print("\n\nTesting the exact frontend query: question_groups with nested questions...")
for f in folders.data:
    fid = f["id"]
    try:
        result = admin.table("question_groups").select(
            "*, questions(question_label, page_number, confidence, question_type, difficulty, marks)"
        ).eq("folder_id", fid).order("priority_score", desc=True).execute()
        
        print(f"\n  Folder '{f['name']}': {len(result.data)} groups")
        if result.data:
            g = result.data[0]
            print(f"    First group: '{g.get('canonical_text', '')[:60]}...'")
            print(f"    Questions nested: {len(g.get('questions', []))}")
            print(f"    priority_score: {g.get('priority_score')}")
            print(f"    topic_id: {g.get('topic_id')}")
    except Exception as e:
        print(f"\n  Folder '{f['name']}': QUERY ERROR: {e}")
