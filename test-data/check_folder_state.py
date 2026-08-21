import os
os.environ["SUPABASE_URL"] = "https://hjzghinbochdgozyqaoy.supabase.co"
os.environ["SUPABASE_SECRET_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg"

from supabase import create_client
import json

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
folder_id = "bbda898a-ab1b-48f5-a324-1f55cf73f187"

print("Checking folder state for:", folder_id)
print("")

# Check papers
papers = supabase.table("papers").select("id, original_filename, extraction_status, year").eq("folder_id", folder_id).execute()
print(f"📄 Papers: {len(papers.data)}")
for p in papers.data:
    print(f"   - {p['original_filename']}: {p['extraction_status']} (year: {p['year']})")

# Check questions
questions = supabase.table("raw_questions").select("id, status").eq("folder_id", folder_id).execute()
accepted = [q for q in questions.data if q['status'] == 'accepted']
print(f"\n❓ Questions: {len(questions.data)} total, {len(accepted)} accepted")

# Check question groups
groups = supabase.table("question_groups").select("id, canonical_text, priority_score").eq("folder_id", folder_id).execute()
print(f"\n🎯 Question Groups: {len(groups.data)}")
if groups.data:
    for g in groups.data[:3]:
        print(f"   - {g['canonical_text'][:50]}... (score: {g['priority_score']})")

# Check analytics (THIS IS KEY!)
analytics = supabase.table("folder_analytics").select("*").eq("folder_id", folder_id).execute()
print(f"\n📊 Analytics: {len(analytics.data)} record(s)")
if analytics.data:
    print("   ✅ Analytics exist!")
    if analytics.data[0].get('payload'):
        payload = analytics.data[0]['payload']
        print(f"   - Total Questions: {payload.get('total_questions', 'N/A')}")
        print(f"   - Total Papers: {payload.get('total_papers', 'N/A')}")
        print(f"   - Topics: {len(payload.get('weightage_by_topic', []))}")
else:
    print("   ❌ NO ANALYTICS FOUND - This is why frontend shows nothing!")
    print("   Need to trigger analyze job")

# Check topics
topics = supabase.table("topics").select("id, name").eq("folder_id", folder_id).execute()
print(f"\n📚 Topics: {len(topics.data)}")
for t in topics.data[:5]:
    print(f"   - {t['name']}")
