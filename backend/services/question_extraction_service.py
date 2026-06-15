import re

def extract_marks(text: str) -> tuple[str, int | str | None]:
    """
    Searches for marks patterns in the text, removes them, and returns (cleaned_text, marks).
    Marks patterns:
    - [2 Marks] or (5 marks) or [10m] or (10 M)
    - [2x5] or (5x10) or [5x10]
    - (10) or [5] at the end of the line
    """
    # 1. Multiplier patterns like [2x5]
    match_mult = re.search(r'[\(\[]\s*(\d+\s*[xX]\s*\d+)\s*(?:[Mm]arks?)?\s*[\)\]]', text)
    if match_mult:
        val = match_mult.group(1).replace(" ", "").lower()
        cleaned_text = text.replace(match_mult.group(0), "")
        return cleaned_text, val
        
    # 2. Bracket marks: (10 marks) or [5 Marks] or [5m]
    match_marks = re.search(r'[\(\[]\s*(\d+)\s*(?:[Mm]arks?|[Mm])\s*[\)\]]', text, re.IGNORECASE)
    if match_marks:
        val = int(match_marks.group(1))
        cleaned_text = text.replace(match_marks.group(0), "")
        return cleaned_text, val

    # 3. Unbracketed marks: 10 marks or 5 Marks
    match_marks_no_braces = re.search(r'\b(\d+)\s*(?:[Mm]arks?|[Mm])\b', text, re.IGNORECASE)
    if match_marks_no_braces:
        val = int(match_marks_no_braces.group(1))
        cleaned_text = text.replace(match_marks_no_braces.group(0), "")
        return cleaned_text, val

    # 4. Bracketed numbers at the end of text: (10) or [5]
    match_end_num = re.search(r'[\(\[]\s*(\d+)\s*[\)\]]\s*$', text)
    if match_end_num:
        val = int(match_end_num.group(1))
        cleaned_text = text.replace(match_end_num.group(0), "")
        return cleaned_text, val
        
    return text, None

def parse_questions_from_text(text: str) -> list[dict]:
    """
    Regex-based Question Extraction Engine.
    Processes the raw text line by line to build structured questions.
    """
    if not text or not text.strip():
        return []

    lines = text.splitlines()
    raw_questions = []
    
    current_section = None
    current_main_q_num = None
    
    # Section header detection pattern (e.g. SECTION A, PART B)
    sec_pattern = re.compile(r'^\s*(?:SECTION|Section|PART|Part|GROUP|Group)[\s\.\:\-]*([A-Za-z0-9]+)\b', re.IGNORECASE)
    
    # Main Question detection patterns (e.g. Q1., Q 2., Question 3, or standalone numbering like 1. at start of line)
    main_q_pattern_q = re.compile(r'^\s*(?:Q|Question|QUESTION)\s*(\d+)[\s\.\:\-]*', re.IGNORECASE)
    main_q_pattern_num = re.compile(r'^\s*(\d{1,3})[\s\.\:\-]+\s*(?=[A-Za-z])')
    
    # Subquestion detection pattern (e.g. (a), b), (i), ii), 1), (2) )
    sub_pattern = re.compile(r'^\s*(?:\(([a-zA-Z]|\d{1,2}|[ivxIVX]+)\)|([a-zA-Z]|\d{1,2}|[ivxIVX]+)\))[\s\.\:\-]*')
    
    for line in lines:
        cleaned_line = line.strip()
        if not cleaned_line:
            continue
            
        # 1. Section Header Check
        sec_match = sec_pattern.match(line)
        if sec_match:
            current_section = f"SECTION {sec_match.group(1).upper()}"
            continue
            
        # 2. Main Question Check
        main_match_q = main_q_pattern_q.match(line)
        main_match_num = main_q_pattern_num.match(line)
        
        is_main = False
        q_num = None
        remaining_line = line
        
        if main_match_q:
            is_main = True
            q_num = f"Q{main_match_q.group(1)}"
            remaining_line = line[main_match_q.end():]
        elif main_match_num:
            is_main = True
            q_num = f"Q{main_match_num.group(1)}"
            remaining_line = line[main_match_num.end():]
            
        if is_main:
            current_main_q_num = q_num
            # Check if there is a subquestion on the same line (e.g. Q1. (a) Define...)
            sub_match = sub_pattern.match(remaining_line)
            if sub_match:
                sub_num = sub_match.group(1) or sub_match.group(2)
                sub_text = remaining_line[sub_match.end():]
                raw_questions.append({
                    "type": "sub",
                    "parent_num": q_num,
                    "number": sub_num,
                    "text_lines": [sub_text],
                    "section": current_section
                })
            else:
                raw_questions.append({
                    "type": "main",
                    "number": q_num,
                    "text_lines": [remaining_line],
                    "section": current_section
                })
            continue
            
        # 3. Subquestion Check
        sub_match = sub_pattern.match(line)
        if sub_match:
            sub_num = sub_match.group(1) or sub_match.group(2)
            sub_text = line[sub_match.end():]
            raw_questions.append({
                "type": "sub",
                "parent_num": current_main_q_num,
                "number": sub_num,
                "text_lines": [sub_text],
                "section": current_section
            })
            continue
            
        # 4. Continuation Check
        if raw_questions:
            raw_questions[-1]["text_lines"].append(cleaned_line)
            
    # Process extracted raw items into final structured format
    processed_questions = []
    for rq in raw_questions:
        full_text = " ".join(rq["text_lines"]).strip()
        cleaned_text, marks = extract_marks(full_text)
        
        # Clean up text punctuation
        cleaned_text = cleaned_text.strip().rstrip(".:,-").strip()
        
        if not cleaned_text:
            continue
            
        # Build composite question numbers (e.g. Q1(a))
        if rq["type"] == "sub":
            if rq["parent_num"]:
                q_num_str = f"{rq['parent_num']}({rq['number']})"
            else:
                q_num_str = f"({rq['number']})"
        else:
            q_num_str = rq["number"]
            
        q_item = {
            "questionNumber": q_num_str,
            "questionText": cleaned_text
        }
        if rq["section"]:
            q_item["section"] = rq["section"]
        if marks is not None:
            q_item["marks"] = marks
            
        processed_questions.append(q_item)
        
    return processed_questions
