"""Download a real DSA paper and show what the extractor sees."""
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

# Download the 2019 paper
path = "c99631f9-1580-4741-8c3b-f47b5cc31711/76bb5680-7d73-45e5-b654-a239b46d2cae/b8d1a658-c56a-4694-a4bd-ffa3d5e4ec91.pdf"
pdf_bytes = admin.storage.from_("exam-pdfs").download(path)
print(f"Downloaded {len(pdf_bytes)} bytes")

# Extract text
from backend.extraction.pdf import extract_pdf
extraction = extract_pdf(pdf_bytes)
print(f"\nExtraction method: {extraction.method}")
print(f"Page count: {extraction.page_count}")
print(f"\n--- EXTRACTED TEXT (first 3000 chars) ---")
print(extraction.text[:3000])

# Try parsing
from backend.extraction.parser import parse_questions, flatten_leaf_questions
from backend.extraction.patterns import get_profile

profile = get_profile("default")
parsed, sections, warnings = parse_questions(extraction.text, profile)
leaves = flatten_leaf_questions(parsed)

print(f"\n--- PARSE RESULT ---")
print(f"Parsed blocks: {len(parsed)}")
print(f"Sections: {sections}")
print(f"Warnings: {warnings}")
print(f"Leaves: {len(leaves)}")

if leaves:
    for i, leaf in enumerate(leaves[:5]):
        print(f"\n  Leaf {i}: label={leaf.get('label_path')}, marks={leaf.get('marks')}")
        print(f"  Text: {leaf.get('text', '')[:100]}")
else:
    print("\nNo questions found! The parser cannot handle this paper format.")
    print("\nShowing raw text structure for analysis:")
    lines = extraction.text.split('\n')
    for i, line in enumerate(lines[:60]):
        print(f"  L{i+1:3d}: {line.rstrip()}")
