import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from services.question_extraction_service import parse_questions_from_text, normalize_document_text

kiit_exam_text = """KALINGA INSTITUTE OF INDUSTRIAL TECHNOLOGY
KIIT UNIVERSITY, BHUBANESWAR
Roll No: 2205001 | Registration No: 2205002
End Semester Examination - Autumn 2026
Course: Database Management Systems (CS-204)
Time Allowed: 3 Hours | Max Marks: 100
Page 1 of 3
Watermark: CONFIDENTIAL

SECTION A
Short Answer Questions

1, What is a database transaction? Explain ACID properties. (10 marks)

2, Explain two-phase locking protocol. [1O M]

pg. 2
Watermark: CONFIDENTIAL

SECTION B
Long Answer Questions

Q4: Explain dynamic hashing versus static hashing. [20]

Q5. (a) Discuss B+ Tree index structures. (10)
    (b) Construct a B+ Tree for keys: 1, 4, 7, 10, 17, 21. [10m]

BEST OF LUCK
PaperLens Footer Info
"""

print("--- Normalized Text ---")
norm = normalize_document_text(kiit_exam_text)
print(norm)

print("\n--- Parsed Questions ---")
q = parse_questions_from_text(kiit_exam_text)
import json
print(json.dumps(q, indent=2))
