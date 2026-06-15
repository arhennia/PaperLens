# pyrefly: ignore [missing-import]
from PIL import Image, ImageDraw, ImageFont
# pyrefly: ignore [missing-import]
import fitz
import os

def create_scanned_pdf():
    # Create a blank white image
    img = Image.new("RGB", (800, 1000), color="white")
    draw = ImageDraw.Draw(img)
    
    text = """SCANNED EXAM QUESTION PAPER
Course: Operating Systems (CS-302)
Time Allowed: 3 Hours | Max Marks: 100

Instructions: All questions are compulsory.

Q1. What is a race condition? Explain how semaphores can be used to solve the critical section problem.

Q2. Describe the difference between paging and segmentation.

Q3. Explain the banker's algorithm for deadlock avoidance.

Q4. Explain Thrashing. How can page faults be reduced?
"""
    # Attempt to load a clean TTF font, fall back to default
    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except IOError:
        font = ImageFont.load_default()
        
    draw.text((50, 50), text, fill="black", font=font)
    
    # Save the Pillow image temporarily
    img_filename = "scanned_page_temp.png"
    img.save(img_filename)
    
    # Create a new PDF and insert the image
    doc = fitz.open()
    page = doc.new_page(width=800, height=1000)
    page.insert_image(page.rect, filename=img_filename)
    doc.save("scanned_exam.pdf")
    doc.close()
    
    # Clean up the temporary image
    if os.path.exists(img_filename):
        os.remove(img_filename)
        
    print("scanned_exam.pdf created successfully.")

if __name__ == "__main__":
    create_scanned_pdf()
