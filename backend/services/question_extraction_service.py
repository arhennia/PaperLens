import re

ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx']
ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']

def get_marker_info(s: str):
    """
    Given a clean marker string (like 'a', 'B', 'iv', '3'), returns its type and numerical value.
    Types: 'num', 'alpha_lower', 'alpha_upper', 'roman_lower', 'roman_upper', 'overlap_lower', 'overlap_upper'
    """
    s = s.strip()
    if not s:
        return None, None
        
    if s.isdigit():
        return 'num', int(s)
        
    is_roman_l = s in ROMAN_LOWER
    is_roman_u = s in ROMAN_UPPER
    
    is_alpha_l = len(s) == 1 and 'a' <= s <= 'z'
    is_alpha_u = len(s) == 1 and 'A' <= s <= 'Z'
    
    # Check for overlap letters: i, v, x
    if s.lower() in ['i', 'v', 'x']:
        if s.islower():
            return 'overlap_lower', ROMAN_LOWER.index(s) + 1
        else:
            return 'overlap_upper', ROMAN_UPPER.index(s.upper()) + 1
            
    if is_roman_l:
        return 'roman_lower', ROMAN_LOWER.index(s) + 1
    if is_roman_u:
        return 'roman_upper', ROMAN_UPPER.index(s) + 1
        
    if is_alpha_l:
        return 'alpha_lower', ord(s) - ord('a') + 1
    if is_alpha_u:
        return 'alpha_upper', ord(s) - ord('A') + 1
        
    return None, None

class SequenceTracker:
    def __init__(self, expected_type=None):
        self.expected_type = expected_type
        self.values = []
        self.raw_labels = []

    def get_expected_next_value(self):
        if not self.values:
            return 1
        return self.values[-1] + 1

    def add(self, val, raw):
        self.values.append(val)
        self.raw_labels.append(raw)

def get_expected_label(seq_type: str, val: int) -> str:
    if seq_type == 'num':
        return str(val)
    elif seq_type == 'alpha_lower':
        if 1 <= val <= 26:
            return chr(ord('a') + val - 1)
        return '?'
    elif seq_type == 'alpha_upper':
        if 1 <= val <= 26:
            return chr(ord('A') + val - 1)
        return '?'
    elif seq_type == 'roman_lower':
        if 1 <= val <= len(ROMAN_LOWER):
            return ROMAN_LOWER[val - 1]
        return '?'
    elif seq_type == 'roman_upper':
        if 1 <= val <= len(ROMAN_UPPER):
            return ROMAN_UPPER[val - 1]
        return '?'
    return '?'

def resolve_marker(label: str, tracker: SequenceTracker) -> tuple[str, int]:
    """Resolves the type and value of a marker given an active SequenceTracker."""
    m_type, m_val = get_marker_info(label)
    if not m_type:
        return None, None

    # Handle overlap letters
    if m_type == 'overlap_lower':
        alpha_val = ord(label.lower()) - ord('a') + 1
        if tracker and tracker.expected_type == 'alpha_lower':
            expected_next = tracker.get_expected_next_value()
            if expected_next == alpha_val or alpha_val in tracker.values:
                return 'alpha_lower', alpha_val
            else:
                return 'roman_lower', m_val
        return 'roman_lower', m_val

    if m_type == 'overlap_upper':
        alpha_val = ord(label.upper()) - ord('A') + 1
        if tracker and tracker.expected_type == 'alpha_upper':
            expected_next = tracker.get_expected_next_value()
            if expected_next == alpha_val or alpha_val in tracker.values:
                return 'alpha_upper', alpha_val
            else:
                return 'roman_upper', m_val
        return 'roman_upper', m_val

    return m_type, m_val

def extract_marks_and_pattern(text: str) -> tuple[str, int | str | None, str | None]:
    """
    Finds marks in text.
    Returns: (cleaned_text, marks_value, original_pattern)
    """
    # 1. Multiplier in brackets: e.g. [2x5], (5 x 10)
    match_mult = re.search(r'([\(\[]\s*(\d+\s*[xX]\s*\d+)\s*(?:marks?|M)?\s*[\)\]])', text, re.IGNORECASE)
    if match_mult:
        pattern = match_mult.group(1)
        val = match_mult.group(2).replace(" ", "").lower()
        cleaned_text = text.replace(pattern, "")
        return cleaned_text, val, pattern
        
    # 2. Value in brackets: e.g. (10 marks) or [5 Marks] or (10m) or [5]
    match_marks = re.search(r'([\(\[]\s*(\d+)\s*(?:marks?|m)?\s*[\)\]])', text, re.IGNORECASE)
    if match_marks:
        pattern = match_marks.group(1)
        val = int(match_marks.group(2))
        cleaned_text = text.replace(pattern, "")
        return cleaned_text, val, pattern

    # 3. Unbracketed text patterns: e.g. 10 marks or 5 Marks
    match_marks_no_braces = re.search(r'\b(\d+)\s*(?:marks?|m)\b', text, re.IGNORECASE)
    if match_marks_no_braces:
        pattern = match_marks_no_braces.group(0)
        val = int(match_marks_no_braces.group(1))
        cleaned_text = text.replace(pattern, "")
        return cleaned_text, val, pattern

    return text, None, None

def normalize_document_text(text: str) -> str:
    if not text:
        return ""
    lines = text.splitlines()
    normalized_lines = []
    
    num_comma_colon = re.compile(r'^\s*(\d{1,3})[\,\:](?=\s|$)', re.IGNORECASE)
    roman_comma_colon = re.compile(r'^\s*([ivxIVX]+)[\,\:](?=\s|$)', re.IGNORECASE)
    q_colon = re.compile(r'^\s*(Q\d{1,3})\:(?=\s|$)', re.IGNORECASE)
    question_l = re.compile(r'\b(Question|Q)\s*[lL|]\b')
    # Pattern for "O" instead of "0" inside marks context, like "1O marks"
    o_marks = re.compile(r'\b(1|2|3|4|5|6|7|8|9)[Oo]\s*(?:marks?|m)\b', re.IGNORECASE)
    
    noise_patterns = [
        re.compile(r'(?i)^\s*Page\s*[-:\s]*\d+(?:\s*(?:of|/)\s*\d+)?\s*$'),
        re.compile(r'(?i)^\s*pg\.?\s*\d+\s*$'),
        re.compile(r'(?i).*NITR.*'),
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
        is_noise = False
        for np in noise_patterns:
            if np.match(cleaned):
                is_noise = True
                break
        if is_noise:
            continue
            
        line = num_comma_colon.sub(r'\1.', line)
        line = roman_comma_colon.sub(r'\1.', line)
        line = q_colon.sub(r'\1.', line)
        line = question_l.sub(r'\1 1', line)
        line = o_marks.sub(r'\g<1>0 marks', line)
        line = re.sub(r'([\(\[]\s*\d*)[Oo](\d*\s*[\)\]])', r'\g<1>0\g<2>', line)
        
        # OCR fix: starts with l) or l.
        line = re.sub(r'^\s*l([\.\)\:\,])', r'1\1', line)
        
        normalized_lines.append(line)
        
    return "\n".join(normalized_lines)

class ExamParser:
    def __init__(self):
        self.questions = []
        self.warnings = []
        self.sections_found = 0
        
        self.current_section = None
        self.active_main_q = None
        self.active_sub_q = None
        
        # Sequence Trackers
        self.main_q_tracker = SequenceTracker('num')
        self.sub_q_tracker = None     # instantiated per main question
        self.sub_sub_q_tracker = None # instantiated per sub question

    def parse(self, text: str) -> list[dict]:
        normalized = normalize_document_text(text)
        lines = normalized.splitlines()
        
        # Patterns
        section_pattern = re.compile(
            r'^\s*(SECTION|PART|GROUP|SUB-SECTION)[\s\.\:\-]*([A-Z0-9ivxIVX]+)\b|'
            r'^\s*(Short\s+Answer|Long\s+Answer|Descriptive|Compulsory|Additional|Multiple\s+Choice|Short|Long)\s+Questions\b',
            re.IGNORECASE
        )
        
        main_q_pattern = re.compile(
            r'^\s*(?:Q|Question|QUESTION)\s*(\d+)\b[\s\.\:\,\-]*|'
            r'^\s*(\d+)[\.\:\-]+\s*(?=[A-Za-z]|$)',
            re.IGNORECASE
        )
        
        sub_pattern = re.compile(
            r'^\s*(?:\(([a-zA-Z0-9]+)\)|([a-zA-Z0-9]+)[\)\.\:\-])\s*'
        )
        
        for line_idx, line in enumerate(lines):
            cleaned_line = line.strip()
            if not cleaned_line:
                continue
                
            # 1. Section Header Check
            sec_match = section_pattern.match(line)
            if sec_match:
                self.sections_found += 1
                if sec_match.group(1):
                    sec_val = sec_match.group(2).upper() if sec_match.group(2) else ""
                    sec_type = sec_match.group(1).upper()
                    self.current_section = f"{sec_type} {sec_val}".strip()
                else:
                    self.current_section = cleaned_line
                
                # Close contexts
                self.active_main_q = None
                self.active_sub_q = None
                self.sub_q_tracker = None
                self.sub_sub_q_tracker = None
                continue
                
            # 2. Main Question Check
            main_match = main_q_pattern.match(line)
            is_main = False
            q_num = None
            remaining_text = line
            
            if main_match:
                # Disambiguate if raw number: is it expected main Q or starting a subquestion?
                num_str = main_match.group(1) or main_match.group(2)
                val = int(num_str)
                
                expected_next = self.main_q_tracker.get_expected_next_value()
                if val == expected_next or val > expected_next or not self.active_main_q:
                    is_main = True
                    q_num = f"Q{val}"
                    remaining_text = line[main_match.end():]
                    self.main_q_tracker.add(val, num_str)
                else:
                    # Treat as subquestion / text continuation
                    pass

            if is_main:
                self.active_main_q = {
                    "questionNumber": q_num,
                    "questionText": "",
                    "subquestions": [],
                    "section": self.current_section,
                    "raw_lines": [remaining_text.strip()] if remaining_text.strip() else []
                }
                self.questions.append(self.active_main_q)
                self.active_sub_q = None
                self.sub_q_tracker = None
                self.sub_sub_q_tracker = None
                
                # Check if same line has subquestion
                sub_match = sub_pattern.match(remaining_text)
                if sub_match:
                    sub_label = sub_match.group(1) or sub_match.group(2)
                    sub_text = remaining_text[sub_match.end():]
                    
                    self.sub_q_tracker = SequenceTracker()
                    m_type, m_val = resolve_marker(sub_label, self.sub_q_tracker)
                    self.sub_q_tracker.expected_type = m_type
                    self.sub_q_tracker.add(m_val, sub_label)
                    
                    self.active_sub_q = {
                        "questionNumber": f"{q_num}({sub_label})",
                        "questionText": "",
                        "subquestions": [],
                        "raw_lines": [sub_text.strip()] if sub_text.strip() else []
                    }
                    self.active_main_q["subquestions"].append(self.active_sub_q)
                    self.sub_sub_q_tracker = None
                continue
                
            # 3. Subquestion or Sub-subquestion Check
            sub_match = sub_pattern.match(line)
            if sub_match and self.active_main_q:
                sub_label = sub_match.group(1) or sub_match.group(2)
                sub_text = line[sub_match.end():]
                
                # Resolve using trackers
                resolved_level = 2
                resolved_type = None
                resolved_val = None
                
                # If we don't have a sub_q_tracker, this is the first subquestion of current Q
                if not self.sub_q_tracker:
                    self.sub_q_tracker = SequenceTracker()
                    resolved_type, resolved_val = resolve_marker(sub_label, self.sub_q_tracker)
                    self.sub_q_tracker.expected_type = resolved_type
                    resolved_level = 2
                else:
                    # Check if it fits the sub_sub_q_tracker (Level 3)
                    if self.sub_sub_q_tracker:
                        resolved_type, resolved_val = resolve_marker(sub_label, self.sub_sub_q_tracker)
                        if resolved_type == self.sub_sub_q_tracker.expected_type:
                            resolved_level = 3
                            
                    # Check if it fits sub_q_tracker (Level 2)
                    if resolved_level != 3:
                        resolved_type, resolved_val = resolve_marker(sub_label, self.sub_q_tracker)
                        if resolved_type == self.sub_q_tracker.expected_type:
                            resolved_level = 2
                        else:
                            # Starts a new level?
                            # If we had active sub_q, we can descend to Level 3
                            if self.active_sub_q:
                                self.sub_sub_q_tracker = SequenceTracker()
                                resolved_type, resolved_val = resolve_marker(sub_label, self.sub_sub_q_tracker)
                                self.sub_sub_q_tracker.expected_type = resolved_type
                                resolved_level = 3
                            else:
                                # Start a new subquestion type
                                self.sub_q_tracker = SequenceTracker()
                                resolved_type, resolved_val = resolve_marker(sub_label, self.sub_q_tracker)
                                self.sub_q_tracker.expected_type = resolved_type
                                resolved_level = 2
                                
                # Sequence validation and common-sense repair
                tracker = self.sub_sub_q_tracker if resolved_level == 3 else self.sub_q_tracker
                
                # Check for duplicate
                if resolved_val in tracker.values:
                    # Duplicate detected! Perform common-sense repair to the expected next value.
                    expected_val = tracker.get_expected_next_value()
                    expected_label = get_expected_label(tracker.expected_type, expected_val)
                    
                    self.warnings.append(
                        f"Broken alphabet sequence near {self.active_main_q['questionNumber']}. "
                        f"Corrected duplicate '{sub_label}' to '{expected_label}'."
                    )
                    
                    # Update value and label
                    resolved_val = expected_val
                    sub_label = expected_label
                    tracker.add(resolved_val, sub_label)
                else:
                    # Check for gap
                    expected_val = tracker.get_expected_next_value()
                    if len(tracker.values) > 0 and resolved_val > expected_val:
                        missing_labels = [get_expected_label(tracker.expected_type, v) for v in range(expected_val, resolved_val)]
                        self.warnings.append(
                            f"Warning: Missing subquestion {', '.join(missing_labels)} in {self.active_main_q['questionNumber']}."
                        )
                    tracker.add(resolved_val, sub_label)
                    
                if resolved_level == 2:
                    self.active_sub_q = {
                        "questionNumber": f"{self.active_main_q['questionNumber']}({sub_label})",
                        "questionText": "",
                        "subquestions": [],
                        "raw_lines": [sub_text.strip()] if sub_text.strip() else []
                    }
                    self.active_main_q["subquestions"].append(self.active_sub_q)
                    self.sub_sub_q_tracker = None
                else:
                    # Level 3 sub-subquestion
                    active_sub_sub_q = {
                        "questionNumber": f"{self.active_sub_q['questionNumber']}({sub_label})",
                        "questionText": "",
                        "raw_lines": [sub_text.strip()] if sub_text.strip() else []
                    }
                    self.active_sub_q["subquestions"].append(active_sub_sub_q)
                continue
                
            # 4. Continuation Text
            if self.active_main_q:
                # Append to deepest open context
                if self.active_sub_q:
                    if self.active_sub_q["subquestions"]:
                        # Append to active sub-subquestion
                        self.active_sub_q["subquestions"][-1]["raw_lines"].append(cleaned_line)
                    else:
                        self.active_sub_q["raw_lines"].append(cleaned_line)
                else:
                    self.active_main_q["raw_lines"].append(cleaned_line)

        # Post-process raw text and marks for all questions
        processed_questions = []
        for q in self.questions:
            q_text = " ".join(q["raw_lines"]).strip()
            q_text, q_marks, q_pat = extract_marks_and_pattern(q_text)
            q_text = q_text.strip().rstrip(".:,-").strip()
            
            p_subs = []
            for sq in q["subquestions"]:
                sq_text = " ".join(sq["raw_lines"]).strip()
                sq_text, sq_marks, sq_pat = extract_marks_and_pattern(sq_text)
                sq_text = sq_text.strip().rstrip(".:,-").strip()
                
                p_sub_subs = []
                for ssq in sq["subquestions"]:
                    ssq_text = " ".join(ssq["raw_lines"]).strip()
                    ssq_text, ssq_marks, ssq_pat = extract_marks_and_pattern(ssq_text)
                    ssq_text = ssq_text.strip().rstrip(".:,-").strip()
                    
                    ssq_item = {
                        "questionNumber": ssq["questionNumber"],
                        "questionText": ssq_text
                    }
                    if ssq_marks is not None:
                        ssq_item["marks"] = ssq_marks
                        ssq_item["markPattern"] = ssq_pat
                    p_sub_subs.append(ssq_item)
                    
                sq_item = {
                    "questionNumber": sq["questionNumber"],
                    "questionText": sq_text
                }
                if sq_marks is not None:
                    sq_item["marks"] = sq_marks
                    sq_item["markPattern"] = sq_pat
                if p_sub_subs:
                    sq_item["subquestions"] = p_sub_subs
                p_subs.append(sq_item)
                
            q_item = {
                "questionNumber": q["questionNumber"],
                "questionText": q_text if q_text else "[Subquestions Only]",
                "subquestions": p_subs
            }
            if q["section"]:
                q_item["section"] = q["section"]
            if q_marks is not None:
                q_item["marks"] = q_marks
                q_item["markPattern"] = q_pat
                
            processed_questions.append(q_item)
            
        # Post-validation checks
        self.validate_main_sequence()
        
        return processed_questions

    def validate_main_sequence(self):
        # Check for missing main questions
        nums = self.main_q_tracker.values
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
                    self.warnings.append(f"Warning: Missing question {missing[0]}.")
                elif len(missing) <= 3:
                    self.warnings.append(f"Warning: Missing questions {', '.join(missing)}.")
                else:
                    self.warnings.append(f"Warning: Missing questions {missing[0]} to {missing[-1]}.")

def parse_questions_from_text(text: str) -> tuple[list[dict], int, list[str]]:
    """
    State-machine based parser to extract structured questions with nested subquestions.
    Returns (questions, sections_found, warnings).
    """
    parser = ExamParser()
    questions = parser.parse(text)
    
    # Optional sanity checks
    if not questions:
        parser.warnings.append("Parser failure: No questions detected in the document.")
        
    return questions, parser.sections_found, parser.warnings

def validate_extracted_questions(questions: list[dict], page_count: int, parser_warnings: list[str] = None) -> list[str]:
    """
    Returns the warnings generated by the parser and adds any global validation warnings.
    """
    warnings = parser_warnings.copy() if parser_warnings else []
    
    if not questions and not any("No questions detected" in w for w in warnings):
        warnings.append("Parser failure: No questions detected in the document.")
        
    if page_count >= 2 and len(questions) <= 1:
        warnings.append(f"Possible parser failure: Only {len(questions)} question(s) extracted from a {page_count}-page document.")
        
    return warnings


