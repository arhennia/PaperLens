import urllib.request
import urllib.error
import mimetypes
import uuid
import json
import os

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

def test_pipeline():
    print("Testing Milestone 2 OCR Fallback API Pipeline...")
    
    # 1. Test normal text extraction
    print("\n--- 1. Testing Text PDF Extraction ---")
    status, data = upload_pdf("sample_exam.pdf")
    print(f"Status: {status}")
    print(f"Filename: {data.get('filename')}")
    print(f"Page Count: {data.get('pageCount')}")
    print(f"Extraction Method: {data.get('extractionMethod')}")
    print(f"Text Preview:\n{data.get('extractedText')[:200]}...")
    assert status == 200, f"Expected 200, got {status}"
    assert data.get("extractionMethod") == "text", f"Expected 'text', got {data.get('extractionMethod')}"
    assert len(data.get("extractedText")) > 100
    print("Text PDF Extraction Test PASSED!")
    
    # 2. Test scanned PDF extraction (should fall back to OCR)
    print("\n--- 2. Testing Scanned PDF (OCR) Extraction ---")
    status, data = upload_pdf("scanned_exam.pdf")
    print(f"Status: {status}")
    print(f"Filename: {data.get('filename')}")
    print(f"Page Count: {data.get('pageCount')}")
    print(f"Extraction Method: {data.get('extractionMethod')}")
    print(f"Text Preview:\n{data.get('extractedText')[:200]}...")
    assert status == 200, f"Expected 200, got {status}"
    assert data.get("extractionMethod") == "ocr", f"Expected 'ocr', got {data.get('extractionMethod')}"
    assert "Operating Systems" in data.get("extractedText") or "SCANNED" in data.get("extractedText"), "Expected OCR'd text in output"
    print("Scanned PDF OCR Extraction Test PASSED!")

    # 3. Test invalid file type
    print("\n--- 3. Testing Invalid File Upload ---")
    # Let's create a temp text file
    temp_txt = "test_temp.txt"
    with open(temp_txt, "w") as f:
        f.write("Hello World")
    status, data = upload_pdf(temp_txt)
    if os.path.exists(temp_txt):
        os.remove(temp_txt)
        
    print(f"Status: {status}")
    print(f"Response: {data}")
    assert status == 400, f"Expected 400, got {status}"
    assert "Invalid file format" in data.get("detail"), "Expected invalid file format error message"
    print("Invalid File Test PASSED!")
    
    print("\nAll tests completed successfully!")

if __name__ == "__main__":
    test_pipeline()
