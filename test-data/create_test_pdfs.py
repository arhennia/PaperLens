"""
Generate realistic test exam PDFs for verification testing.
Creates both clean digital PDFs and simulated scanned/low-quality PDFs.
"""
import fitz  # PyMuPDF
from pathlib import Path

def create_clean_exam_pdf(filename, year, questions):
    """Create a clean, digitally-generated exam PDF."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4 size
    
    # Header
    page.insert_text((50, 50), f"Operating Systems - Mid Semester Examination {year}",
                     fontsize=14)
    page.insert_text((50, 70), f"Time: 2 hours | Max Marks: 50",
                     fontsize=10)
    page.insert_text((50, 90), "=" * 80, fontsize=8)
    
    y_pos = 120
    for q_num, (q_text, marks) in enumerate(questions, 1):
        # Question
        page.insert_text((50, y_pos), f"Q{q_num}. {q_text} [{marks}]",
                         fontsize=11)
        y_pos += 40
        
        # Add new page if needed
        if y_pos > 750:
            page = doc.new_page(width=595, height=842)
            y_pos = 50
    
    doc.save(filename)
    doc.close()
    print(f"Created: {filename}")

def create_scanned_exam_pdf(filename, year, questions):
    """Create a simulated scanned/image-based PDF."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    
    # Create text content first
    page.insert_text((50, 50), f"Operating Systems Exam {year}",
                     fontsize=14)
    page.insert_text((50, 70), f"Duration: 2 hrs | Marks: 50",
                     fontsize=10)
    
    y_pos = 110
    for q_num, (q_text, marks) in enumerate(questions, 1):
        page.insert_text((50, y_pos), f"Q{q_num}. {q_text} [{marks}]",
                         fontsize=11)
        y_pos += 40
    
    # Convert page to image (simulating scan) then back to PDF
    # This removes native text layer
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x resolution
    
    # Create new page with just the image
    doc2 = fitz.open()
    img_page = doc2.new_page(width=595, height=842)
    img_page.insert_image(img_page.rect, pixmap=pix)
    
    doc.close()
    doc2.save(filename)
    doc2.close()
    print(f"Created scanned: {filename}")

# Test data with repeated questions across years
questions_2022 = [
    ("Explain the concept of thrashing in operating systems.", 10),
    ("What is a semaphore? Explain with an example.", 8),
    ("Describe the difference between paging and segmentation.", 10),
    ("Write a program to solve the producer-consumer problem.", 12),
    ("What are the conditions for deadlock? Explain each.", 10),
]

questions_2023 = [
    ("Explain thrashing and how to prevent it in virtual memory systems.", 10),  # Repeated
    ("Define semaphore. Give an example of its usage in synchronization.", 8),  # Repeated
    ("Compare and contrast paging with segmentation memory management.", 10),  # Repeated (rewor ded)
    ("Discuss the dining philosophers problem and its solution.", 12),
    ("List and explain all four necessary conditions for deadlock.", 10),  # Repeated
]

questions_2024 = [
    ("What is thrashing? How does it affect system performance?", 10),  # Repeated again
    ("Explain the concept of critical section in concurrent programming.", 8),
    ("Describe page replacement algorithms: FIFO, LRU, and Optimal.", 12),
    ("What are the necessary and sufficient conditions for deadlock?", 10),  # Repeated
    ("Write short notes on: (a) Context switching (b) System calls", 10),
]

# Create clean PDFs
Path("test-data").mkdir(exist_ok=True)
create_clean_exam_pdf("test-data/OS_MidSem_2022.pdf", "2022", questions_2022)
create_clean_exam_pdf("test-data/OS_MidSem_2023.pdf", "2023", questions_2023)
create_clean_exam_pdf("test-data/OS_MidSem_2024.pdf", "2024", questions_2024)

# Create one scanned/low-quality PDF
create_scanned_exam_pdf("test-data/OS_MidSem_2021_Scanned.pdf", "2021", [
    ("Explain process scheduling algorithms.", 10),
    ("What is virtual memory? Explain demand paging.", 12),
    ("Describe the readers-writers problem.", 8),
])

print("\nTest PDFs created successfully!")
print("- 3 clean digital PDFs (2022, 2023, 2024)")
print("- 1 scanned/image-based PDF (2021)")
print("- Known repeated questions across years for similarity testing")
