import re

def extract_marks(text: str) -> tuple[str, int | str | None]:
    """
    Searches for marks patterns in the text, removes them, and returns (cleaned_text, marks).
    Marks patterns:
    - [2 Marks] or (5 marks) or [10m] or (10 M)
    - [2x5] or (5x10) or [5x10]
    - (10) or [5] at the end of the line
    """
    # 1. Multiplier patterns: e.g. [2x5] or (5x10) or [5 x 10]
    match_mult = re.search(r'[\(\[]\s*(\d+\s*[xX]\s*\d+)\s*(?:marks?|M)?\s*[\)\]]', text, re.IGNORECASE)
    if match_mult:
        val = match_mult.group(1).replace(" ", "").lower()
        cleaned_text = text.replace(match_mult.group(0), "")
        return cleaned_text, val
        
    # 2. Text patterns: e.g. (10 marks) or [5 Marks] or (10m) or [5M]
    match_marks = re.search(r'[\(\[]\s*(\d+)\s*(?:marks?|m)\s*[\)\]]', text, re.IGNORECASE)
    if match_marks:
        val = int(match_marks.group(1))
        cleaned_text = text.replace(match_marks.group(0), "")
        return cleaned_text, val

    # 3. Unbracketed text patterns: e.g. 10 marks or 5 Marks
    match_marks_no_braces = re.search(r'\b(\d+)\s*(?:marks?|m)\b', text, re.IGNORECASE)
    if match_marks_no_braces:
        val = int(match_marks_no_braces.group(1))
        cleaned_text = text.replace(match_marks_no_braces.group(0), "")
        return cleaned_text, val

    # 4. Standalone bracketed numbers: e.g. (10) or [5] at the end of the string
    match_end_num = re.search(r'[\(\[]\s*(\d+)\s*[\)\]]\s*$', text)
    if match_end_num:
        val = int(match_end_num.group(1))
        cleaned_text = text.replace(match_end_num.group(0), "")
        return cleaned_text, val

    return text, None

def normalize_document_text(text: str) -> str:
    """
    Cleans OCR noise and repeated headers/footers/watermarks from raw text.
    """
    if not text:
        return ""
        
    lines = text.splitlines()
    normalized_lines = []
    
    # Pattern to fix numbers followed by comma or colon: "1," or "1:"
    num_comma_colon = re.compile(r'^\s*(\d{1,3})[\,\:](?=\s|$)', re.IGNORECASE)
    # Pattern for roman numerals followed by comma: "ii," or "ii:"
    roman_comma_colon = re.compile(r'^\s*([ivxIVX]+)[\,\:](?=\s|$)', re.IGNORECASE)
    # Pattern for Q-numbers followed by colon: "Q1:"
    q_colon = re.compile(r'^\s*(Q\d{1,3})\:(?=\s|$)', re.IGNORECASE)
    # Pattern for "Question l" or "Question I"
    question_l = re.compile(r'\b(Question|Q)\s*[lL|]\b')
    # Pattern for "O" instead of "0" inside marks context, like "1O marks"
    o_marks = re.compile(r'\b(1|2|3|4|5|6|7|8|9)[Oo]\s*(?:marks?|m)\b', re.IGNORECASE)
    
    # Noise pattern list (header/footer, university, page numbers, watermarks)
    noise_patterns = [
        re.compile(r'(?i)^\s*Page\s*[-:\s]*\d+(?:\s*(?:of|/)\s*\d+)?\s*$'), # Page numbers
        re.compile(r'(?i)^\s*pg\.?\s*\d+\s*$'), # pg. 1
        re.compile(r'(?i).*NITR*'),
        re.compile(r'(?i).*NATIONAL INSTITUTE OF TECHNOLOGY ROURKELA.*'),
        re.compile(r'(?i).*BEST OF LUCK.*'),
        re.compile(r'(?i).*ALL THE BEST.*'),
        re.compile(r'(?i).*PAPERLENS.*'),
        re.compile(r'(?i).*Time Allowed.*'),
        re.compile(r'(?i).*Max Marks.*'),
        re.compile(r'(?i)^\s*Registration\s*No.*$', re.IGNORECASE),
        re.compile(r'(?i)^\s*Roll\s*No.*$', re.IGNORECASE),
        re.compile(r'(?i)^\s*Sem(?:ester)?\s*Exam.*$', re.IGNORECASE),
        re.compile(r'(?i).*watermark.*'),
        re.compile(r'(?i).*confidential.*'),
    ]
    
    for line in lines:
        cleaned = line.strip()
        
        # Check if line matches noise patterns
        is_noise = False
        for np in noise_patterns:
            if np.match(cleaned):
                is_noise = True
                break
        if is_noise:
            continue
            
        # Apply OCR fixes
        line = num_comma_colon.sub(r'\1.', line)
        line = roman_comma_colon.sub(r'\1.', line)
        line = q_colon.sub(r'\1.', line)
        line = question_l.sub(r'\1 1', line)
        line = o_marks.sub(r'\g<1>0 marks', line)
        
        # Replace 'O'/'o' with '0' when surrounded by braces containing numbers
        line = re.sub(r'([\(\[]\s*\d*)[Oo](\d*\s*[\)\]])', r'\g<1>0\g<2>', line)
        
        normalized_lines.append(line)
        
    return "\n".join(normalized_lines)

def parse_questions_from_text(text: str) -> list[dict]:
    """
    State-machine based parser to extract structured questions with nested subquestions.
    """
    normalized_text = normalize_document_text(text)
    
    lines = normalized_text.splitlines()
    questions = []
    
    current_section = None
    active_main_q = None
    active_sub_q = None
    
    # Section header detection pattern (e.g. SECTION A, PART B, Short Questions)
    sec_pattern = re.compile(
        r'^\s*(?:SECTION|PART|GROUP|SUB-SECTION|Short\s+Answer\s+Questions|Long\s+Answer\s+Questions|Compulsory\s+Questions|Additional\s+Questions|Multiple\s+Choice\s+Questions|MCQs)[\s\.\:\-]*([A-Za-z0-9]*)',
        re.IGNORECASE
    )
    
    main_q_pattern_q = re.compile(r'^\s*(?:Q|Question|QUESTION)\s*(\d+)[\s\.\:\-]*', re.IGNORECASE)
    main_q_pattern_num = re.compile(r'^\s*(\d{1,3})[\s\.\:\-]+\s*(?=[A-Z])')
    
    sub_pattern = re.compile(r'^\s*(?:\(([a-zA-Z]|\d{1,2}|[ivxIVX]+)\)|([a-zA-Z]|\d{1,2}|[ivxIVX]+)\))[\s\.\:\-]*')
    
    for line in lines:
        cleaned_line = line.strip()
        if not cleaned_line:
            continue
            
        # 1. Section Header Check
        sec_match = sec_pattern.match(line)
        is_descriptive_sec = False
        descriptive_patterns = [
            r'^\s*(Short\s+Answer\s+Questions|Short\s+Questions|Long\s+Answer\s+Questions|Compulsory\s+Questions|Additional\s+Questions)\s*$'
        ]
        for dp in descriptive_patterns:
            if re.match(dp, cleaned_line, re.IGNORECASE):
                is_descriptive_sec = True
                
        if sec_match or is_descriptive_sec:
            # Wrap up active items
            if active_sub_q and active_main_q:
                active_main_q["subquestions"].append(active_sub_q)
                active_sub_q = None
            if active_main_q:
                questions.append(active_main_q)
                active_main_q = None
                
            if is_descriptive_sec:
                if not current_section or not re.match(r'^\s*(SECTION|PART|GROUP)\s+[A-Za-z0-9]+', current_section, re.IGNORECASE):
                    current_section = cleaned_line.strip()
            else:
                sec_val = sec_match.group(1).upper()
                sec_type = "SECTION" if "SECTION" in line.upper() else "PART" if "PART" in line.upper() else "GROUP"
                current_section = f"{sec_type} {sec_val}" if sec_val else cleaned_line.strip()
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
            # Wrap up active items
            if active_sub_q and active_main_q:
                active_main_q["subquestions"].append(active_sub_q)
                active_sub_q = None
            if active_main_q:
                questions.append(active_main_q)
                
            active_main_q = {
                "questionNumber": q_num,
                "questionText": "",
                "subquestions": [],
                "section": current_section,
                "raw_lines": [remaining_line.strip()] if remaining_line.strip() else []
            }
            
            # Check if subquestion on same line
            sub_match = sub_pattern.match(remaining_line)
            if sub_match:
                sub_num = sub_match.group(1) or sub_match.group(2)
                sub_text = remaining_line[sub_match.end():]
                active_sub_q = {
                    "questionNumber": f"{q_num}({sub_num})",
                    "questionText": "",
                    "raw_lines": [sub_text.strip()] if sub_text.strip() else []
                }
            continue
            
        # 3. Subquestion Check
        sub_match = sub_pattern.match(line)
        if sub_match:
            if not active_main_q:
                active_main_q = {
                    "questionNumber": "Q",
                    "questionText": "",
                    "subquestions": [],
                    "section": current_section,
                    "raw_lines": []
                }
                
            if active_sub_q:
                active_main_q["subquestions"].append(active_sub_q)
                
            sub_num = sub_match.group(1) or sub_match.group(2)
            sub_text = line[sub_match.end():]
            
            active_sub_q = {
                "questionNumber": f"{active_main_q['questionNumber']}({sub_num})" if active_main_q['questionNumber'] != "Q" else f"({sub_num})",
                "questionText": "",
                "raw_lines": [sub_text.strip()] if sub_text.strip() else []
            }
            continue
            
        # 4. Continuation Line
        if active_sub_q:
            active_sub_q["raw_lines"].append(cleaned_line)
        elif active_main_q:
            active_main_q["raw_lines"].append(cleaned_line)
            
    # Wrap up final active items
    if active_sub_q and active_main_q:
        active_main_q["subquestions"].append(active_sub_q)
    if active_main_q:
        questions.append(active_main_q)
        
    # Process extracted raw items into final structured layout
    processed_questions = []
    for q in questions:
        main_text = " ".join(q["raw_lines"]).strip()
        main_text, main_marks = extract_marks(main_text)
        main_text = main_text.strip().rstrip(".:,-").strip()
        
        processed_subs = []
        for sq in q["subquestions"]:
            sub_text = " ".join(sq["raw_lines"]).strip()
            sub_text, sub_marks = extract_marks(sub_text)
            sub_text = sub_text.strip().rstrip(".:,-").strip()
            
            if not sub_text:
                continue
                
            sq_item = {
                "questionNumber": sq["questionNumber"],
                "questionText": sub_text
            }
            if sub_marks is not None:
                sq_item["marks"] = sub_marks
            processed_subs.append(sq_item)
            
        if not main_text and not processed_subs:
            continue
            
        q_item = {
            "questionNumber": q["questionNumber"],
            "questionText": main_text if main_text else "[Subquestions Only]",
            "subquestions": processed_subs
        }
        if q["section"]:
            q_item["section"] = q["section"]
        if main_marks is not None:
            q_item["marks"] = main_marks
            
        processed_questions.append(q_item)
        
    return processed_questions

def validate_extracted_questions(questions: list[dict], page_count: int) -> list[str]:
    """
    Performs sanity checks on the parsed questions list.
    """
    warnings = []
    
    if not questions:
        warnings.append("Parser failure: No questions detected in the document.")
        return warnings
        
    if page_count >= 2 and len(questions) <= 1:
        warnings.append(f"Possible parser failure: Only {len(questions)} question(s) extracted from a {page_count}-page document.")
        
    nums = []
    for q in questions:
        q_num = q["questionNumber"]
        match = re.search(r'\d+', q_num)
        if match:
            nums.append(int(match.group(0)))
            
    if nums:
        unique_nums = sorted(list(set(nums)))
        min_num = unique_nums[0]
        max_num = unique_nums[-1]
        
        missing = []
        for i in range(min_num, max_num + 1):
            if i not in unique_nums:
                missing.append(f"Q{i}")
                
        if missing:
            if len(missing) == 1:
                warnings.append(f"Warning: Missing question {missing[0]}.")
            elif len(missing) <= 3:
                warnings.append(f"Warning: Missing questions {', '.join(missing)}.")
            else:
                warnings.append(f"Warning: Missing questions {missing[0]} to {missing[-1]}.")
                
    return warnings
