# pyrefly: ignore [missing-import]
import fitz

doc = fitz.open()
page = doc.new_page()
rect = fitz.Rect(50, 50, 550, 800)
text = """UNIVERSITY OF COMPUTER SCIENCE & ENGINEERING
End Semester Examination - June 2026
Course: Data Structures and Algorithms (CS-201)
Time Allowed: 3 Hours | Max Marks: 100
Instructions: Answer all questions.

SECTION A
Q1. Define Stack. (5 marks)
Q2. Explain Queue. [10 Marks]
Q3. What is DFS? (20 marks)
"""
page.insert_textbox(rect, text, fontsize=11, fontname="helv")
doc.save("test_out.pdf")
doc.close()

# Now open and read
doc2 = fitz.open("test_out.pdf")
extracted = doc2[0].get_text()
print("Text length:", len(extracted))
print("Text content:")
print(repr(extracted))
doc2.close()

import os
if os.path.exists("test_out.pdf"):
    os.remove("test_out.pdf")
