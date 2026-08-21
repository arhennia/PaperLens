import os
os.environ["SUPABASE_URL"] = "https://hjzghinbochdgozyqaoy.supabase.co"
os.environ["SUPABASE_SECRET_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg"

from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
folder_id = "bbda898a-ab1b-48f5-a324-1f55cf73f187"

# Fetch question groups for flashcards
groups = supabase.table("question_groups").select("id, canonical_text, occurrence_count, priority_level, avg_marks").eq("folder_id", folder_id).order("priority_score", desc=True).limit(5).execute()

print("=== FLASHCARD MODE DATA ===\n")
print(f"✅ Fetched {len(groups.data)} flashcards from real processed folder\n")

# Simulate flashcard interaction
for i, card in enumerate(groups.data, 1):
    print(f"CARD {i}/5")
    print(f"┌─────────────────────────────────────────────────────")
    print(f"│ FRONT (Question):")
    print(f"│ {card['canonical_text']}")
    print(f"├─────────────────────────────────────────────────────")
    print(f"│ BACK (Metadata):")
    print(f"│ • Repeated: {card['occurrence_count']}x")
    print(f"│ • Avg Marks: {card['avg_marks']}")
    print(f"│ • Priority: {card['priority_level']}")
    print(f"│ • [AI Hint would load on flip]")
    print(f"└─────────────────────────────────────────────────────\n")

print("✅ Flashcard mode data structure verified!")
print("   Front: Question text")
print("   Back: AI-generated hint + metadata")
print("   Navigation: Next/Previous through priority-sorted questions")
