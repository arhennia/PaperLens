import os
os.environ["SUPABASE_URL"] = "https://hjzghinbochdgozyqaoy.supabase.co"
os.environ["SUPABASE_SECRET_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg"

from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
folder_id = "bbda898a-ab1b-48f5-a324-1f55cf73f187"

print("=== DEBUGGING FRONTEND DATA FETCHING ===\n")

# Test the nested query that the page uses
print("1. Testing question_groups with nested questions...")
try:
    groups_result = supabase.table("question_groups").select("*, questions(question_label, page_number, confidence)").eq("folder_id", folder_id).execute()
    print(f"   ✅ Query succeeded: {len(groups_result.data)} groups")
    if groups_result.data:
        print(f"   First group has questions: {groups_result.data[0].get('questions', 'NO QUESTIONS KEY')}")
except Exception as e:
    print(f"   ❌ Query failed: {e}")
    print("   This is likely the problem!")

print("\n2. Testing simpler query without nested select...")
try:
    groups_simple = supabase.table("question_groups").select("*").eq("folder_id", folder_id).execute()
    print(f"   ✅ Simple query works: {len(groups_simple.data)} groups")
except Exception as e:
    print(f"   ❌ Simple query also failed: {e}")

print("\n3. Checking if there's a relationship defined...")
try:
    # Check if questions table has group_id
    questions = supabase.table("questions").select("id, group_id").eq("folder_id", folder_id).limit(1).execute()
    if questions.data:
        print(f"   ✅ Questions have group_id: {questions.data[0].get('group_id', 'NO group_id FIELD')}")
    else:
        print("   ❌ No questions found")
except Exception as e:
    print(f"   ❌ Cannot query questions: {e}")

print("\n4. Checking analytics...")
try:
    analytics = supabase.table("folder_analytics").select("payload").eq("folder_id", folder_id).single().execute()
    if analytics.data:
        print(f"   ✅ Analytics exist")
        print(f"   Payload keys: {list(analytics.data.get('payload', {}).keys())}")
    else:
        print("   ❌ No analytics")
except Exception as e:
    print(f"   ❌ Analytics query failed: {e}")
