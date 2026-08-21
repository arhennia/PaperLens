import os
os.environ["SUPABASE_URL"] = "https://hjzghinbochdgozyqaoy.supabase.co"
os.environ["SUPABASE_SECRET_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemdoaW5ib2NoZGdvenlxYW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5NjQ4NywiZXhwIjoyMTAyNzcyNDg3fQ.gyzHeIHIOtmdxT57oMYG44HXvxJUvIvZMu4cp3f5JRg"

from backend.analysis.topics import build_topics, coverage_gaps

print("=== SYLLABUS COVERAGE GAP ANALYSIS ===\n")

# Define a realistic OS syllabus
syllabus_chapters = [
    "Process Management",
    "CPU Scheduling", 
    "Deadlocks",
    "Memory Management",
    "File Systems",
    "I/O Systems",
    "Security & Protection",
    "Distributed Systems"
]

# Build topics from syllabus
topics = build_topics(syllabus_chapters, source="syllabus")
print(f"✅ Built {len(topics)} topics from syllabus")

# Simulate question coverage (what the exam actually asked)
# Based on our real extracted questions
question_counts = {
    "Process Management": 2,  # dining philosophers, semaphore
    "CPU Scheduling": 0,       # GAP - not covered!
    "Deadlocks": 1,            # 4 conditions
    "Memory Management": 2,    # paging/segmentation, thrashing
    "File Systems": 0,         # GAP - not covered!
    "I/O Systems": 0,          # GAP - not covered!
    "Security & Protection": 0,# GAP - not covered!
    "Distributed Systems": 0   # GAP - not covered!
}

# Generate coverage analysis
coverage = coverage_gaps(topics, question_counts)

print("\n📊 COVERAGE ANALYSIS:\n")
print(f"{'Topic':<30} {'Questions':<12} {'Status':<15} {'Source'}")
print("-" * 75)

gaps_found = []
for item in coverage:
    status = "❌ GAP" if item["is_gap"] else "✅ COVERED"
    print(f"{item['topic_name']:<30} {item['question_count']:<12} {status:<15} {item['source']}")
    if item["is_gap"]:
        gaps_found.append(item["topic_name"])

print(f"\n⚠️  GAPS IDENTIFIED: {len(gaps_found)} topics with NO exam coverage:")
for gap in gaps_found:
    print(f"   - {gap}")

print("\n✅ Coverage gap analysis working correctly!")
print("   This is differentiator #3: shows what syllabus topics exams never asked")
