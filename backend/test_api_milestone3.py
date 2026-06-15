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
    
    # Construct multipart request body
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
    print("Starting Milestone 3 Question Extraction API Integration Tests...")
    
    header = """UNIVERSITY OF COMPUTER SCIENCE & ENGINEERING
End Semester Examination - June 2026
Course: Data Structures and Algorithms (CS-201)
Time Allowed: 3 Hours | Max Marks: 100
Instructions: Answer all questions.

"""

    # ----------------------------------------------------
    # Case A: Normal Question Paper (Q1, Q2, Q3)
    # ----------------------------------------------------
    print("\n--- Testing Case A: Normal Question Paper ---")
    case_a_text = header + """SECTION A
Q1. Define Stack. (5 marks)
Q2. Explain Queue. [10 Marks]
Q3. What is DFS? (20 marks)
"""
    pdf_a = "temp_case_a.pdf"
    create_test_pdf(pdf_a, case_a_text)
    
    status, data = upload_pdf(pdf_a)
    if os.path.exists(pdf_a):
        os.remove(pdf_a)
        
    print(f"Status: {status}")
    print(f"Extraction Method: {data.get('extractionMethod')}")
    print(f"Questions Found: {data.get('questionCount')}")
    print("Questions:", json.dumps(data.get('questions'), indent=2))
    
    assert status == 200, f"Expected 200, got {status}"
    assert data.get('extractionMethod') == 'text'
    questions = data.get('questions', [])
    assert len(questions) == 3, f"Expected 3 questions, got {len(questions)}"
    
    assert questions[0]['questionNumber'] == "Q1"
    assert questions[0]['questionText'] == "Define Stack"
    assert questions[0]['marks'] == 5
    assert questions[0]['section'] == "SECTION A"
    
    assert questions[1]['questionNumber'] == "Q2"
    assert questions[1]['questionText'] == "Explain Queue"
    assert questions[1]['marks'] == 10
    
    assert questions[2]['questionNumber'] == "Q3"
    assert questions[2]['questionText'] == "What is DFS?"
    assert questions[2]['marks'] == 20
    print("Case A PASSED!")

    # ----------------------------------------------------
    # Case B: Subquestions (a, b, c)
    # ----------------------------------------------------
    print("\n--- Testing Case B: Subquestions ---")
    case_b_text = header + """Q1. Answer the following:
(a) What is AVL? (10)
(b) What is DFS? [5]
"""
    pdf_b = "temp_case_b.pdf"
    create_test_pdf(pdf_b, case_b_text)
    
    status, data = upload_pdf(pdf_b)
    if os.path.exists(pdf_b):
        os.remove(pdf_b)
        
    print(f"Status: {status}")
    print(f"Questions Found: {data.get('questionCount')}")
    print("Questions:", json.dumps(data.get('questions'), indent=2))
    
    assert status == 200, f"Expected 200, got {status}"
    questions = data.get('questions', [])
    # Should extract Q1 as header, and Q1(a), Q1(b)
    assert len(questions) == 3, f"Expected 3 questions, got {len(questions)}"
    assert questions[0]['questionNumber'] == "Q1"
    assert questions[0]['questionText'] == "Answer the following"
    
    assert questions[1]['questionNumber'] == "Q1(a)"
    assert questions[1]['questionText'] == "What is AVL?"
    assert questions[1]['marks'] == 10
    
    assert questions[2]['questionNumber'] == "Q1(b)"
    assert questions[2]['questionText'] == "What is DFS?"
    assert questions[2]['marks'] == 5
    print("Case B PASSED!")

    # ----------------------------------------------------
    # Case C: Mixed Format Papers
    # ----------------------------------------------------
    print("\n--- Testing Case C: Mixed Format Papers ---")
    case_c_text = header + """SECTION B
Q1
a) Define Stack [5 Marks]
b) Explain Queue [5 Marks]
Q2
a) reverse singly linked list [10]
"""
    pdf_c = "temp_case_c.pdf"
    create_test_pdf(pdf_c, case_c_text)
    
    status, data = upload_pdf(pdf_c)
    if os.path.exists(pdf_c):
        os.remove(pdf_c)
        
    print(f"Status: {status}")
    print(f"Questions Found: {data.get('questionCount')}")
    print("Questions:", json.dumps(data.get('questions'), indent=2))
    
    assert status == 200, f"Expected 200, got {status}"
    questions = data.get('questions', [])
    # Should extract Q1(a), Q1(b), Q2(a) (Q1/Q2 headers are skipped if they have no text)
    assert len(questions) == 3, f"Expected 3 questions, got {len(questions)}"
    assert questions[0]['questionNumber'] == "Q1(a)"
    assert questions[0]['questionText'] == "Define Stack"
    assert questions[0]['marks'] == 5
    assert questions[0]['section'] == "SECTION B"
    
    assert questions[1]['questionNumber'] == "Q1(b)"
    assert questions[1]['questionText'] == "Explain Queue"
    assert questions[1]['marks'] == 5
    
    assert questions[2]['questionNumber'] == "Q2(a)"
    assert questions[2]['questionText'] == "reverse singly linked list"
    assert questions[2]['marks'] == 10
    print("Case C PASSED!")

    # ----------------------------------------------------
    # Case D: OCR Extracted Papers
    # ----------------------------------------------------
    print("\n--- Testing Case D: OCR Extracted Paper ---")
    # We will upload the scanned exam PDF we created in Milestone 2
    status, data = upload_pdf("scanned_exam.pdf")
    print(f"Status: {status}")
    print(f"Extraction Method: {data.get('extractionMethod')}")
    print(f"Questions Found: {data.get('questionCount')}")
    print("Questions:", json.dumps(data.get('questions'), indent=2))
    
    assert status == 200, f"Expected 200, got {status}"
    assert data.get('extractionMethod') == 'ocr'
    questions = data.get('questions', [])
    assert len(questions) >= 4, f"Expected at least 4 questions from OCR, got {len(questions)}"
    assert any("race condition" in q['questionText'].lower() for q in questions), "Could not find Q1 about race condition"
    assert any("banker's algorithm" in q['questionText'].lower() for q in questions), "Could not find Q3 about banker's algorithm"
    print("Case D PASSED!")

    print("\nAll integration test cases for Question Extraction PASSED successfully!")

if __name__ == "__main__":
    run_tests()
