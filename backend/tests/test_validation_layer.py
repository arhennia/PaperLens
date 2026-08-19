import sys
import os

# Adjust path to import backend services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.question_validation_service import validate_question, clean_question, normalize_question_number

def run_tests():
    print("=========================================")
    print("RUNNING QUESTION VALIDATION LAYER TESTS")
    print("=========================================\n")
    
    # 1. Test genuine questions (Expected status: accepted or review, high confidence)
    genuine_cases = [
        ("Explain Round Robin Scheduling.", 95),
        ("Design a memory management system.", 92),
        ("Compare SRAM and DRAM.", 88),
        ("Consider a system with 4 page frames. What is the number of page faults?", 100), # Has question marks / cues
        ("Define CPU scheduling.", 92), # 3-word action verb
        ("Define RAM", 80), # 2-word starting with strong action verb
    ]
    
    print("--- 1. Testing Genuine Questions ---")
    for text, expected_approx_conf in genuine_cases:
        res = validate_question(text)
        print(f"Text: '{text}'")
        print(f"  Confidence: {res['confidence']} | Status: {res['validationStatus']} | Reason: {res['reason']}")
        assert res['validationStatus'] in {"accepted", "review"}, f"Failed on genuine question: {text}"
        assert abs(res['confidence'] - expected_approx_conf) <= 25, f"Confidence {res['confidence']} too far from expected {expected_approx_conf}"
    print("[OK] All genuine questions passed.\n")
    
    # 2. Test metadata and instructions (Expected status: rejected)
    rejected_cases = [
        ("Answer all the questions", "Exam instruction"),
        ("Answer any four questions", "Exam instruction"),
        ("Attempt any questions", "Exam instruction"),
        ("Full Marks: 20", "Exam instruction"),
        ("Time: 1.5 Hours", "Exam instruction"),
        ("Semester: 4th", "University metadata"),
        ("Subject Code: CS20002", "University metadata"),
        ("Best of Luck", "Exam instruction"),
        ("KIIT University", "University metadata"),
        ("Page 1 of 5", "Page metadata"),
        ("pg. 2", "Page metadata"),
        ("PaperLens extraction marker", "System-generated content"),
        ("[Subquestions Only]", "System-generated content"),
    ]
    
    print("--- 2. Testing Blacklisted Metadata / Instructions ---")
    for text, expected_category in rejected_cases:
        res = validate_question(text)
        print(f"Text: '{text}'")
        print(f"  Confidence: {res['confidence']} | Status: {res['validationStatus']} | Reason: {res['reason']}")
        assert res['validationStatus'] == "rejected", f"Failed to reject metadata/instruction: {text}"
        assert res['confidence'] < 40, f"Confidence {res['confidence']} too high for metadata/instruction: {text}"
    print("[OK] All metadata and instructions successfully rejected.\n")
    
    # 3. Test OCR Garbage (Expected status: rejected)
    garbage_cases = [
        "r: lld",
        "ct N.DC} Opcr.ting Syst ul",
        "och (sl:- CSE.IT. CSCE",
        "|||||",
        "a b c d",
    ]
    
    print("--- 3. Testing OCR Garbage Detection ---")
    for text in garbage_cases:
        res = validate_question(text)
        print(f"Text: '{text}'")
        print(f"  Confidence: {res['confidence']} | Status: {res['validationStatus']} | Reason: {res['reason']}")
        assert res['validationStatus'] == "rejected", f"Failed to reject OCR garbage: {text}"
        assert "OCR Garbage" in res['reason'] or "Too short" in res['reason'] or "Too few words" in res['reason'], f"Unexpected rejection reason: {res['reason']}"
    print("[OK] All OCR garbage successfully rejected.\n")
    
    # 4. Test Cleaning Logic
    cleaning_cases = [
        ("Explain    Round Robin   Scheduling.", "Explain Round Robin Scheduling."),
        ("What is paging? \n How does it work?", "What is paging? How does it work?"),
        ("Compare SRAM and DRAM....", "Compare SRAM and DRAM."),
        ("Explain virtual memory????", "Explain virtual memory?"),
        ("Explain paging | ", "Explain paging"),
        ("Define process _", "Define process"),
    ]
    
    print("--- 4. Testing Cleaning Logic ---")
    for text, expected_clean in cleaning_cases:
        clean = clean_question(text)
        print(f"Raw: '{text}'\nClean: '{clean}'")
        assert clean == expected_clean, f"Cleaned text mismatch. Got '{clean}', expected '{expected_clean}'"
    print("[OK] All cleaning tests passed.\n")
    
    # 5. Test Numbering Normalization
    number_cases = [
        ("Q1.", "Q1"),
        ("1.", "1"),
        ("1:", "1"),
        (" (a) ", "(a)"),
        ("1(a).", "1(a)"),
    ]
    
    print("--- 5. Testing Numbering Normalization ---")
    for raw_num, expected_norm in number_cases:
        norm = normalize_question_number(raw_num)
        print(f"Raw: '{raw_num}' -> Norm: '{norm}'")
        assert norm == expected_norm, f"Normalized mismatch. Got '{norm}', expected '{expected_norm}'"
    print("[OK] All numbering normalization tests passed.\n")
    
    print("=========================================")
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("=========================================")

if __name__ == "__main__":
    run_tests()
