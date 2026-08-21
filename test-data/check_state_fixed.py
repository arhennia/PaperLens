import os
os.environ["SUPABASE_URL"] = "https://hjzghinbochdgozyqaoy.supabase.co"
os.environ["SUPABASE_SECRET_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg"

from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
folder_id = "bbda898a-ab1b-48f5-a324-1f55cf73f187"

print("=== FOLDER DATA STATE ===\n")

# Papers
papers = supabase.table("papers").select("*").eq("folder_id", folder_id).execute()
print(f"✅ Papers: {len(papers.data)}")
if papers.data:
    print(f"   Status: {papers.data[0]['extraction_status']}")

# Questions (correct table name)
questions = supabase.table("questions").select("id").eq("folder_id", folder_id).execute()
print(f"\n✅ Questions: {len(questions.data)}")

# Question Groups  
groups = supabase.table("question_groups").select("id, canonical_text").eq("folder_id", folder_id).execute()
print(f"\n✅ Question Groups: {len(groups.data)}")
if groups.data:
    print(f"   First: {groups.data[0]['canonical_text'][:60]}...")

# Topics
topics = supabase.table("topics").select("id, name").eq("folder_id", folder_id).execute()
print(f"\n✅ Topics: {len(topics.data)}")
for t in topics.data[:3]:
    print(f"   - {t['name']}")

# Analytics - THIS IS THE KEY ONE
analytics = supabase.table("folder_analytics").select("*").eq("folder_id", folder_id).execute()
print(f"\n📊 Analytics Table: {len(analytics.data)} record(s)")

if not analytics.data:
    print("\n❌ PROBLEM FOUND: NO ANALYTICS!")
    print("   This is why frontend shows 'extracted' but no analysis")
    print("   Solution: Trigger analyze job")
else:
    print("\n✅ Analytics exist - checking payload...")
    payload = analytics.data[0].get('payload')
    if payload:
        print(f"   Total Questions: {payload.get('total_questions')}")
        print(f"   Total Papers: {payload.get('total_papers')}")
    else:
        print("   ❌ Payload is null/empty")
