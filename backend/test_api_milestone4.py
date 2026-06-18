import urllib.request
import urllib.error
import json
import uuid
import os
import time
# pyrefly: ignore [missing-import]
import fitz

API_URL = "http://127.0.0.1:8000"

def create_test_pdf(filepath, text_content):
    """Generates a clean text PDF with the given text content."""
    doc = fitz.open()
    page = doc.new_page()
    rect = fitz.Rect(50, 50, 550, 800)
    page.insert_textbox(rect, text_content, fontsize=11, fontname="helv")
    doc.save(filepath)
    doc.close()

def send_multipart_upload(url, files_dict, form_data=None):
    """
    Helper to post multiple files and form fields using standard urllib.
    files_dict: {filename_on_server: filepath_on_disk}
    form_data: {field_name: field_value}
    """
    boundary = uuid.uuid4().hex
    body = bytearray()
    
    # Write form data
    if form_data:
        for name, value in form_data.items():
            body.extend(f"--{boundary}\r\n".encode("utf-8"))
            body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
            body.extend(f"{value}\r\n".encode("utf-8"))
            
    # Write files
    for field_name, (filename, filepath) in files_dict.items():
        with open(filepath, "rb") as f:
            file_content = f.read()
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'.encode("utf-8"))
        body.extend(b"Content-Type: application/pdf\r\n\r\n")
        body.extend(file_content)
        body.extend(b"\r\n")
        
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body))
    }
    
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def run_tests():
    print("Starting Milestone 4 Multi-PDF Engine Integration Tests...")
    
    # 1. Create two mock PDFs representing exams from different years
    # One has standard text, another has minor paraphrases
    pdf_2023_text = """UNIVERSITY OF COMPUTER SCIENCE
    End Semester Examination 2023
    Course: Operating Systems (CS-302)
    Max Marks: 70
    
    SECTION A
    Q1. Explain Round Robin CPU scheduling algorithm with an example. (10 marks)
    Q2. Discuss the Banker's algorithm for deadlock avoidance. [10]
    Q3. What is paging? Describe page translation. (5 marks)
    """
    
    pdf_2024_text = """UNIVERSITY OF COMPUTER SCIENCE
    End Semester Examination 2024
    Course: Operating Systems (CS-302)
    Max Marks: 70
    
    SECTION A
    Q1. Describe Round Robin CPU scheduling with an example. (10 marks)
    Q2. Explain the working of Banker's algorithm for deadlock avoidance. [10m]
    Q3. What is page fault? Explain FIFO page replacement. [5]
    """
    
    file1 = "OS_Exam_2023.pdf"
    file2 = "OS_Exam_2024.pdf"
    
    create_test_pdf(file1, pdf_2023_text)
    create_test_pdf(file2, pdf_2024_text)
    
    # Set up multipart request
    files_dict = {
        "file1": ("OS_Exam_2023.pdf", file1),
        "file2": ("OS_Exam_2024.pdf", file2)
    }
    
    form_data = {
        "subject": "Operating Systems",
        "examName": "End Sem Exam",
        "examType": "end_sem",
        "totalMarks": "70",
        "chapters": json.dumps(["CPU Scheduling", "Deadlocks", "Memory Management"]),
        "years": json.dumps({
            "OS_Exam_2023.pdf": 2023,
            "OS_Exam_2024.pdf": 2024
        })
    }
    
    print("\n--- Step 1: Uploading multiple PDFs and creating analysis session ---")
    status, data = send_multipart_upload(f"{API_URL}/api/sessions", files_dict, form_data)
    print(f"Upload Status: {status}")
    print(f"Response: {data}")
    
    # Clean up local test files
    if os.path.exists(file1):
        os.remove(file1)
    if os.path.exists(file2):
        os.remove(file2)
        
    assert status == 200, f"Expected 200, got {status}"
    session_id = data.get("sessionId")
    assert session_id is not None, "Session ID not returned"
    
    # 2. Poll session status until COMPLETE
    print("\n--- Step 2: Polling session status until COMPLETE ---")
    max_retries = 15
    completed = False
    
    for i in range(max_retries):
        req = urllib.request.Request(f"{API_URL}/api/sessions/{session_id}", method="GET")
        with urllib.request.urlopen(req) as resp:
            s_data = json.loads(resp.read().decode("utf-8"))
            print(f"Poll {i+1}: Status = {s_data.get('status')}")
            
            if s_data.get("status") == "complete":
                completed = True
                # Verify papers properties
                papers = s_data.get("papers", [])
                assert len(papers) == 2, f"Expected 2 papers, got {len(papers)}"
                assert papers[0]["year"] in [2023, 2024]
                assert papers[0]["status"] == "extracted"
                break
            elif s_data.get("status") == "failed":
                print(f"Session failed: {s_data.get('error')}")
                break
                
        time.sleep(2)
        
    assert completed, "Session processing did not complete in time"
    
    # 3. Retrieve ranked question bank
    print("\n--- Step 3: Fetching ranked question bank and verifying analytics ---")
    req = urllib.request.Request(f"{API_URL}/api/sessions/{session_id}/questions", method="GET")
    with urllib.request.urlopen(req) as resp:
        q_data = json.loads(resp.read().decode("utf-8"))
        questions = q_data.get("questions", [])
        print(f"Ranked Questions Count: {len(questions)}")
        print("First question detail preview:")
        print(json.dumps(questions[0], indent=2))
        
        # Verify priority levels and explanation elements
        assert len(questions) > 0, "No questions returned"
        first_q = questions[0]
        assert "priorityScore" in first_q
        assert "priorityLevel" in first_q
        assert "priorityReason" in first_q
        assert "similarityConfidence" in first_q
        assert "factors" in first_q
        assert "evolution" in first_q
        
        # Check that factor columns are populated separately
        factors = first_q["factors"]
        assert "frequency" in factors
        assert "recency" in factors
        assert "marks" in factors
        assert "spread" in factors
        assert "cluster" in factors
        
        # Check fuzzy clustering: "Explain Round Robin..." (2023) and "Describe Round Robin..." (2024)
        # should be grouped in the same cluster and have chronological evolution timeline
        rr_q = next((q for q in questions if "round robin" in q["canonicalText"].lower()), None)
        assert rr_q is not None, "Round Robin question not found"
        # Since it appeared in both 2023 and 2024, it should be repeated and have 2 evolution items
        assert len(rr_q["evolution"]) == 2, f"Expected 2 evolution occurrences, got {len(rr_q['evolution'])}"
        assert rr_q["evolution"][0]["year"] == 2023
        assert rr_q["evolution"][1]["year"] == 2024
        print(f"Round Robin Evolution Timeline PASSED: {rr_q['evolution']}")
        
    # 4. Verify focus area analytics weightages
    print("\n--- Step 4: Verifying focus area analytics weightages ---")
    req = urllib.request.Request(f"{API_URL}/api/sessions/{session_id}/analytics", method="GET")
    with urllib.request.urlopen(req) as resp:
        an_data = json.loads(resp.read().decode("utf-8"))
        analytics = an_data.get("analytics", {})
        
        assert analytics.get("total_papers") == 2
        assert analytics.get("repeat_rate") > 0.0
        
        focus_areas = analytics.get("focus_areas", [])
        print("Focus areas weights:", focus_areas)
        assert len(focus_areas) > 0, "No focus areas computed"
        # Check that we have topic weights structure (freq_pct, marks_pct)
        assert "freq_pct" in focus_areas[0]
        assert "marks_pct" in focus_areas[0]
        
    # 5. Verify CSV export streams correctly
    print("\n--- Step 5: Verifying CSV export streams correctly ---")
    req = urllib.request.Request(f"{API_URL}/api/sessions/{session_id}/export/csv", method="GET")
    with urllib.request.urlopen(req) as resp:
        headers = resp.info()
        assert "text/csv" in headers.get("Content-Type", ""), "Response is not text/csv"
        body = resp.read().decode("utf-8")
        lines = body.splitlines()
        print(f"CSV exported lines: {len(lines)}")
        assert len(lines) > 1, "CSV is empty or missing headers"
        assert "Question Wording" in lines[0]
        assert "Priority Score" in lines[0]
        
    print("\nAll Milestone 4 Multi-PDF Analysis Engine Integration Tests PASSED successfully!")

if __name__ == "__main__":
    run_tests()
