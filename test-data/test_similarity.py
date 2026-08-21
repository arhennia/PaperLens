"""
Test similarity threshold against known repeated questions.
Requires actual PDF processing through backend.
"""
import sys
sys.path.insert(0, 'F:\\Aiproject\\PaperLens')

from backend.extraction import parser, normalization
from backend.analysis import dedup, similarity

# Known repeated questions from our test PDFs
questions_2022 = [
    "Explain the concept of thrashing in operating systems.",
    "What is a semaphore? Explain with an example.",
    "Describe the difference between paging and segmentation.",
    "Write a program to solve the producer-consumer problem.",
    "What are the conditions for deadlock? Explain each.",
]

questions_2023 = [
    "Explain thrashing and how to prevent it in virtual memory systems.",  # Same as 2022 #1
    "Define semaphore. Give an example of its usage in synchronization.",  # Same as 2022 #2
    "Compare and contrast paging with segmentation memory management.",    # Same as 2022 #3
    "Discuss the dining philosophers problem and its solution.",           # Different
    "List and explain all four necessary conditions for deadlock.",        # Same as 2022 #5
]

questions_2024 = [
    "What is thrashing? How does it affect system performance?",           # Same as 2022 #1
    "Explain the concept of critical section in concurrent programming.",  # Different
    "Describe page replacement algorithms: FIFO, LRU, and Optimal.",      # Different
    "What are the necessary and sufficient conditions for deadlock?",     # Same as 2022 #5
    "Write short notes on: (a) Context switching (b) System calls",        # Different
]

print("="*80)
print("VERIFICATION 3: Similarity Threshold Testing")
print("="*80)
print()

# Test pairs
test_pairs = [
    ("Thrashing 2022", questions_2022[0], "Thrashing 2023", questions_2023[0], True, "Same question, reworded"),
    ("Thrashing 2022", questions_2022[0], "Thrashing 2024", questions_2024[0], True, "Same question, reworded"),
    ("Semaphore 2022", questions_2022[1], "Semaphore 2023", questions_2023[1], True, "Same question, reworded"),
    ("Deadlock 2022", questions_2022[4], "Deadlock 2023", questions_2023[4], True, "Same question, reworded"),
    ("Deadlock 2022", questions_2022[4], "Deadlock 2024", questions_2024[3], True, "Same question, reworded"),
    ("Paging 2022", questions_2022[2], "Paging 2023", questions_2023[2], True, "Same question, significantly reworded"),
    # Different questions that might look similar
    ("Semaphore 2022", questions_2022[1], "Critical Section 2024", questions_2024[1], False, "Different concepts, both about concurrency"),
    ("Producer-Consumer 2022", questions_2022[3], "Dining Philosophers 2023", questions_2023[3], False, "Different synchronization problems"),
]

print("Testing similarity detection:")
print()

# Normalize all questions
from backend.normalization import normalize_for_identity

results = []
for label1, q1, label2, q2, should_match, description in test_pairs:
    # Normalize
    norm1 = normalize_for_identity(q1)
    norm2 = normalize_for_identity(q2)
    
    # Check exact match first
    exact_match = norm1['hash'] == norm2['hash']
    
    # Compute similarity if not exact
    if not exact_match:
        try:
            from rapidfuzz import fuzz
            score = fuzz.ratio(norm1['normalized'], norm2['normalized']) / 100.0
        except ImportError:
            score = 0.0
            print("⚠️  RapidFuzz not available, skipping similarity")
            break
    else:
        score = 1.0
    
    # Check against threshold
    threshold = 0.84
    detected_as_similar = score >= threshold
    
    correct = (detected_as_similar == should_match)
    symbol = "✅" if correct else "❌"
    
    print(f"{symbol} {label1} vs {label2}:")
    print(f"   Score: {score:.3f} | Threshold: {threshold} | Expected: {'MATCH' if should_match else 'DIFFERENT'}")
    print(f"   Result: {'MATCH' if detected_as_similar else 'DIFFERENT'} | {description}")
    if not correct:
        if should_match and not detected_as_similar:
            print(f"   ⚠️  FALSE NEGATIVE: Missed a genuine repeat (score {score:.3f} < {threshold})")
        elif not should_match and detected_as_similar:
            print(f"   ⚠️  FALSE POSITIVE: Merged different questions (score {score:.3f} >= {threshold})")
    print()
    
    results.append({
        'pair': f"{label1} vs {label2}",
        'score': score,
        'expected': should_match,
        'detected': detected_as_similar,
        'correct': correct
    })

print("="*80)
print("SUMMARY:")
print("="*80)
correct_count = sum(1 for r in results if r['correct'])
total = len(results)
print(f"Correct: {correct_count}/{total} ({100*correct_count/total:.1f}%)")
print()

false_negatives = [r for r in results if r['expected'] and not r['detected']]
false_positives = [r for r in results if not r['expected'] and r['detected']]

if false_negatives:
    print(f"❌ {len(false_negatives)} FALSE NEGATIVES (missed genuine repeats):")
    for r in false_negatives:
        print(f"   {r['pair']}: score {r['score']:.3f}")
    print()

if false_positives:
    print(f"❌ {len(false_positives)} FALSE POSITIVES (merged different questions):")
    for r in false_positives:
        print(f"   {r['pair']}: score {r['score']:.3f}")
    print()

if correct_count == total:
    print("✅ VERIFICATION 3: PASS - Threshold 0.84 correctly classifies all test pairs")
else:
    print(f"⚠️  VERIFICATION 3: PARTIAL - Threshold 0.84 has errors")
    print(f"   Consider adjusting threshold or review normalization logic")

print("="*80)
