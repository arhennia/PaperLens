import os
os.environ["SUPABASE_URL"] = "https://hjzghinbochdgozyqaoy.supabase.co"
os.environ["SUPABASE_SECRET_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg"

from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
folder_id = "bbda898a-ab1b-48f5-a324-1f55cf73f187"

# Get folder
folder = supabase.table("folders").select("*").eq("id", folder_id).single().execute()
print(f"Folder: {folder.data['name']}")

# Get groups
groups = supabase.table("question_groups").select("*").eq("folder_id", folder_id).order("priority_score", desc=True).execute()
print(f"Groups: {len(groups.data)} questions")

# Generate Markdown
print("\n=== MARKDOWN EXPORT ===")
md = f"# {folder.data['name']}\n\n"
md += f"**Subject:** {folder.data['subject']}\n\n"
md += "## Questions\n\n"
for i, g in enumerate(groups.data[:5], 1):
    md += f"{i}. **{g['canonical_text']}**\n"
    md += f"   - Repeated: {g['occurrence_count']}x\n"
    md += f"   - Priority: {g['priority_level']} ({g['priority_score']:.1f})\n\n"

print(md[:500])

# Generate CSV for Anki
print("\n=== ANKI CSV EXPORT ===")
csv = "Front,Back,Tags\n"
for g in groups.data[:5]:
    front = g["canonical_text"].replace('"', '""')
    back = f"Repeated {g['occurrence_count']}x | Priority: {g['priority_level']}"
    tags = f"{folder.data['subject']}_{g['priority_level']}"
    csv += f'"{front}","{back}",{tags}\n'

print(csv[:400])

print("\n✅ Export generation successful!")
