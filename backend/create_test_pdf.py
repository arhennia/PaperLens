# pyrefly: ignore [missing-import]
import fitz

def create_sample_pdf():
    doc = fitz.open()
    page = doc.new_page()
    
    # Margin rectangle for inserting text
    rect = fitz.Rect(50, 50, 550, 800)
    
    text = """UNIVERSITY OF COMPUTER SCIENCE & ENGINEERING
End Semester Examination - June 2026
Course: Data Structures and Algorithms (CS-201)
Time Allowed: 3 Hours | Max Marks: 100

Instructions: Answer all questions.

Q1. (a) Explain the difference between an AVL tree and a Red-Black tree. (10 marks)
    (b) Insert the following keys into an initially empty AVL tree: 15, 20, 24, 10, 13, 7, 30, 36, 25. Show all rotations. (10 marks)

Q2. Write a complete Python/C++ function to reverse a singly linked list in-place. Analyze its time and space complexity. (20 marks)

Q3. Compare Dijkstra's and Bellman-Ford algorithms for finding single-source shortest paths in a directed graph. Explain when Dijkstra's algorithm fails. (20 marks)

Q4. (a) Discuss the collision resolution techniques in hashing. (10 marks)
    (b) Explain dynamic programming versus greedy approach with an example. (10 marks)

Q5. Write short notes on:
    (i) Amortized Analysis of dynamic arrays.
    (ii) Stable sorting algorithms. (20 marks)
"""
    
    page.insert_textbox(rect, text, fontsize=11, fontname="helv")
    doc.save("sample_exam.pdf")
    doc.close()
    print("sample_exam.pdf created successfully.")

if __name__ == "__main__":
    create_sample_pdf()
