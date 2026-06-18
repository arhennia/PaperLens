# pyrefly: ignore [missing-import]
import fitz
import urllib.request
import urllib.error
import uuid
import json
import os

def create_test_pdf(filepath, text_content):
    """Generates a clean text PDF with the given text content."""
    doc = fitz.open()
    page = doc.new_page()
    rect = fitz.Rect(50, 50, 550, 800)
    page.insert_textbox(rect, text_content, fontsize=11, fontname="helv")
    doc.save(filepath)
    doc.close()
    print(f"Generated test PDF: {filepath}")

def upload_pdf(filepath):
    url = "http://127.0.0.1:8000/api/upload"
    boundary = uuid.uuid4().hex
    
    with open(filepath, "rb") as f:
        file_content = f.read()
        
    filename = os.path.basename(filepath)
    
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode("utf-8") + file_content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body))
    }
    
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            status = response.status
            res_body = response.read().decode("utf-8")
            return status, json.loads(res_body)
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            res_body = json.loads(e.read().decode("utf-8"))
        except Exception:
            res_body = {"detail": e.reason}
        return status, res_body

def run_tests():
    print("Starting Milestone 3.1 Hybrid Parsing Integration Tests...")
    
    # ----------------------------------------------------
    # Case 1: NIT Exam Paper (Simulated OCR Noise & Page Metadata)
    # ----------------------------------------------------
    print("\n--- Testing Case 1: NIT University Exam Format with OCR Noise & Missing Q3 ---")
    
    nit_exam_text = """NATIONAL INSTITUTE OF TECHNOLOGY
Roll No: 2205001 | Registration No: 2205002
End Semester Examination - Autumn 2026
Course: Database Management Systems (CS-204)
Time Allowed: 3 Hours | Max Marks: 100
Page 1 of 3


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

    pdf_1 = "temp_nitr_exam.pdf"
    create_test_pdf(pdf_1, nit_exam_text)
    
    status, data = upload_pdf(pdf_1)
    if os.path.exists(pdf_1):
        os.remove(pdf_1)
        
    print(f"Status: {status}")
    print(f"Extraction Method: {data.get('extractionMethod')}")
    print(f"Questions Found: {data.get('questionCount')}")
    print("Questions:", json.dumps(data.get('questions'), indent=2))
    print("Warnings:", json.dumps(data.get('warnings'), indent=2))
    
    assert status == 200, f"Expected 200, got {status}"
    assert data.get('extractionMethod') == 'text'
    
    questions = data.get('questions', [])
    warnings = data.get('warnings', [])
    
    # Check that Q1, Q2, Q4, Q5 are parsed
    assert len(questions) == 4, f"Expected 4 question groups (Q1, Q2, Q4, Q5), got {len(questions)}"
    
    # Check Q1 (Normalization fixed "1," -> "Q1" or "1.")
    assert questions[0]['questionNumber'] == "Q1", f"Expected Q1, got {questions[0]['questionNumber']}"
    assert "What is a database transaction?" in questions[0]['questionText']
    assert questions[0]['marks'] == 10
    assert questions[0]['section'] == "SECTION A"
    
    # Check Q2 (Normalization fixed "2," -> "Q2" and "[1O M]" -> 10 marks)
    assert questions[1]['questionNumber'] == "Q2"
    assert "Explain two-phase locking" in questions[1]['questionText']
    assert questions[1]['marks'] == 10
    assert questions[1]['section'] == "SECTION A"
    
    # Check Q4 (Normalization fixed "Q4:" -> "Q4")
    assert questions[2]['questionNumber'] == "Q4"
    assert "Explain dynamic hashing" in questions[2]['questionText']
    assert questions[2]['marks'] == 20
    assert questions[2]['section'] == "SECTION B"
    
    # Check Q5 nested structure (Q5(a), Q5(b))
    assert questions[3]['questionNumber'] == "Q5"
    assert len(questions[3]['subquestions']) == 2
    assert questions[3]['subquestions'][0]['questionNumber'] == "Q5(a)"
    assert "Discuss B+ Tree index" in questions[3]['subquestions'][0]['questionText']
    assert questions[3]['subquestions'][0]['marks'] == 10
    
    assert questions[3]['subquestions'][1]['questionNumber'] == "Q5(b)"
    assert "Construct a B+ Tree" in questions[3]['subquestions'][1]['questionText']
    assert questions[3]['subquestions'][1]['marks'] == 10
    
    # Check Validation Warnings
    assert len(warnings) > 0, "Expected validation warnings"
    assert any("Missing question Q3" in w for w in warnings), "Expected missing Q3 warning"
    
    print("Case 1 PASSED!")

    # ----------------------------------------------------
    # Case 2: OCR Fallback Scanned Exam Validation
    # ----------------------------------------------------
    print("\n--- Testing Case 2: Scanned Exam Parser Failure Sanity Checks ---")
    status, data = upload_pdf("scanned_exam.pdf")
    print(f"Status: {status}")
    print(f"Questions Found: {data.get('questionCount')}")
    print("Warnings:", json.dumps(data.get('warnings'), indent=2))
    
    assert status == 200
    # Since scanned_exam.pdf has 1 page and parses 4 questions, it should NOT trigger "low question count" warning
    assert not any("parser failure" in w.lower() for w in data.get('warnings', [])), "Unexpected parser failure warning"
    print("Case 2 PASSED!")

    print("\nAll Milestone 3.1 Hybrid Parser Integration Tests PASSED successfully!")

if __name__ == "__main__":
    run_tests()
