import re
import os

# Developer debug mode check
DEBUG_MODE = os.getenv("PAPERLENS_DEBUG", "true").lower() == "true"

# Question verbs/indicators
ACTION_VERBS = {
    'explain', 'describe', 'discuss', 'compare', 'differentiate', 'analyze',
    'evaluate', 'design', 'calculate', 'derive', 'illustrate', 'justify',
    'what', 'why', 'how', 'when', 'consider', 'assume', 'find', 'determine',
    'show', 'prove', 'solve', 'define', 'write', 'state', 'list', 'sketch',
    'verify', 'identify', 'trace', 'compute', 'formulate', 'construct',
    'give', 'elaborate', 'distinguish', 'summarize', 'obtain'
}

# Known abbreviations to bypass vowel-less check
KNOWN_ABBREVIATIONS = {
    'cpu', 'sram', 'dram', 'os', 'fifo', 'lru', 'pcb', 'mmu', 'tlb', 'i/o',
    'ram', 'rom', 'dma', 'lan', 'wan', 'ip', 'tcp', 'udp', 'sql', 'xml',
    'dbms', 'api', 'acid', 'oop', 'uml', 'dns', 'http', 'https', 'ftp',
    'bjt', 'fet', 'op-amp', 'alu', 'asic', 'fpga', 'risc', 'cisc', 'cs'
}

# Blacklist patterns
METADATA_BLACKLIST = [
    re.compile(r'\bsemester\b', re.IGNORECASE),
    re.compile(r'\bbranch\b', re.IGNORECASE),
    re.compile(r'\bsubject\s*code\b', re.IGNORECASE),
    re.compile(r'\bschool\s+of\b', re.IGNORECASE),
    re.compile(r'\bkiit\b', re.IGNORECASE),
    re.compile(r'\buniversity\b', re.IGNORECASE),
    re.compile(r'\bexamination\b', re.IGNORECASE),
    re.compile(r'\broll\s+no\b', re.IGNORECASE),
    re.compile(r'\breg\s+no\b', re.IGNORECASE),
    re.compile(r'\bregistration\b', re.IGNORECASE),
    re.compile(r'\bsessional\b', re.IGNORECASE),
    re.compile(r'\bmid-semester\b', re.IGNORECASE),
    re.compile(r'\bend-semester\b', re.IGNORECASE),
    re.compile(r'\bcourse\b', re.IGNORECASE),
    re.compile(r'\bdept\b', re.IGNORECASE),
    re.compile(r'\bdepartment\b', re.IGNORECASE),
    re.compile(r'\bprogramme\b', re.IGNORECASE),
    re.compile(r'\bdegree\b', re.IGNORECASE),
    re.compile(r'\btech\b', re.IGNORECASE),
    re.compile(r'\bautumn\b', re.IGNORECASE),
    re.compile(r'\bspring\b', re.IGNORECASE),
]

INSTRUCTION_BLACKLIST = [
    re.compile(r'\banswer\s+all\s+(?:the\s+)?questions\b', re.IGNORECASE),
    re.compile(r'\banswer\s+any\s+(?:four|three|five|two|one|six)\s+questions\b', re.IGNORECASE),
    re.compile(r'\battempt\s+any\b', re.IGNORECASE),
    re.compile(r'\battempt\s+all\b', re.IGNORECASE),
    re.compile(r'\bfull\s+marks\b', re.IGNORECASE),
    re.compile(r'\btime\s*:\b', re.IGNORECASE),
    re.compile(r'\bbest\s+of\s+luck\b', re.IGNORECASE),
    re.compile(r'\ball\s+the\s+best\b', re.IGNORECASE),
    re.compile(r'\bfigures\s+in\s+the\s+margin\b', re.IGNORECASE),
    re.compile(r'\bcandidates\s+are\s+required\b', re.IGNORECASE),
    re.compile(r'\bmaximum\s+marks\b', re.IGNORECASE),
    re.compile(r'\bquestions\s+carry\s+equal\s+marks\b', re.IGNORECASE),
    re.compile(r'\bwrite\s+answers\s+in\s+your\s+own\b', re.IGNORECASE),
]

PAGE_BLACKLIST = [
    re.compile(r'^\s*page\s+\d+', re.IGNORECASE),
    re.compile(r'^\s*page\s+no', re.IGNORECASE),
    re.compile(r'\bpg\s*\.?\s*\d+\b', re.IGNORECASE)
]

SYSTEM_BLACKLIST = [
    re.compile(r'\bpaperlens\b', re.IGNORECASE),
    re.compile(r'^\s*\[subquestions\s+only\]\s*$', re.IGNORECASE)
]

def is_ocr_garbage(text: str) -> tuple[bool, str]:
    """
    Checks if a string is likely OCR garbage using non-alphanumeric ratios
    and dictionary/vowel checks.
    Returns (is_garbage, reason).
    """
    clean_text = text.strip()
    if not clean_text:
        return True, "Empty text"
        
    # 1. Non-alphanumeric ratio check
    # We ignore standard whitespace and common math operators (+, -, =, *, /, <, >, (, ))
    non_math_chars = re.sub(r'[\w\s\+\-\=\*\/\(\)\<\>\,\.\;\?\'\"]', '', clean_text)
    non_math_ratio = len(non_math_chars) / len(clean_text)
    if non_math_ratio > 0.18 and len(clean_text) > 8:
        return True, f"Too many special symbols (ratio: {non_math_ratio:.2f})"
        
    words = clean_text.split()
    if not words:
        return True, "No words"
        
    suspicious_count = 0
    for w in words:
        w_clean = re.sub(r'^[^\w]+|[^\w]+$', '', w) # strip leading/trailing punctuation
        if not w_clean:
            continue
            
        # Check vowel-less words (excluding known acronyms/short abbreviations/numbers)
        # Note: we ignore all-caps acronyms (like HTML, OS) to avoid false positives
        if len(w_clean) >= 2 and w_clean.isalpha() and not w_clean.isupper():
            has_vowel = any(v in w_clean.lower() for v in ['a', 'e', 'i', 'o', 'u', 'y'])
            if not has_vowel and w_clean.lower() not in KNOWN_ABBREVIATIONS:
                suspicious_count += 1
                continue
                
        # Check for weird internal characters or invalid punctuation inside word
        # We define corrupt chars as braces, brackets, pipe, backslash, caret, tilde, underscore
        # We also treat internal dot or colon/semicolon as suspicious unless it is a decimal/contraction/acronym
        has_corrupt_char = any(c in w_clean for c in ['}', '{', ']', '[', '|', '\\', '^', '~', '_'])
        
        has_bad_internal_punct = False
        if not w_clean.isalnum() and not has_corrupt_char:
            # Check if it's a decimal, contraction, hyphenated word, or standard dot-acronym
            if re.match(r'^\d+(\.\d+)?$', w_clean) or re.match(r'^[a-zA-Z\d]+[\'\-][a-zA-Z\d]+$', w_clean) or re.match(r'^[A-Z](\.[A-Z])+\.?$', w_clean):
                pass
            # Also allow normal parenthesis or brackets surrounding words, e.g. (s) or [5]
            elif re.match(r'^\(?[a-zA-Z\d\-]+\)?$', w_clean) or re.match(r'^\[[a-zA-Z\d\-]+\]$', w_clean):
                pass
            # Allow math/expression words (e.g. x=x+1, x-2, s) by checking if it only contains standard math operators
            # and alphanumeric characters
            elif re.match(r'^[a-zA-Z\d\+\-\=\*\/\(\)\<\>\,\:\!]+$', w_clean):
                pass
            else:
                has_bad_internal_punct = True
                
        if has_corrupt_char or has_bad_internal_punct:
            suspicious_count += 1
            continue
            
    suspicious_ratio = suspicious_count / len(words)
    if suspicious_ratio > 0.35 and len(words) >= 2:
        return True, f"Too many suspicious/broken words (ratio: {suspicious_ratio:.2f})"
        
    return False, ""

def validate_question(text: str) -> dict:
    """
    Validates a question string and returns its confidence score, validation status, and reason.
    """
    clean_text = text.strip()
    
    # OCR Garbage Pre-Filter
    is_garbage, garbage_reason = is_ocr_garbage(clean_text)
    if is_garbage:
        return {
            "confidence": 0,
            "validationStatus": "rejected",
            "reason": f"OCR Garbage: {garbage_reason}"
        }
        
    # Rule 1: Minimum text length
    # Strip spaces to check meaningful content
    char_len = len(re.sub(r'\s+', '', clean_text))
    if char_len < 10:
        # Check if it starts with a strong action verb (e.g. "Define RAM")
        words = clean_text.split()
        first_word = re.sub(r'[^\w]', '', words[0]).lower() if words else ""
        if len(words) == 2 and first_word in {'define', 'explain', 'list', 'state', 'sketch'}:
            # Keep it but lower confidence slightly
            pass
        else:
            return {
                "confidence": 15,
                "validationStatus": "rejected",
                "reason": f"Too short (length {char_len} < 10 characters)"
            }
            
    # Rule 2: Minimum word count
    words = clean_text.split()
    word_count = len(words)
    if word_count < 2:
        return {
            "confidence": 10,
            "validationStatus": "rejected",
            "reason": f"Too few words (count {word_count} < 2)"
        }
    if word_count == 2:
        first_word = re.sub(r'[^\w]', '', words[0]).lower()
        if first_word not in {'define', 'explain', 'list', 'state', 'sketch', 'write'}:
            return {
                "confidence": 20,
                "validationStatus": "rejected",
                "reason": "2-word block does not start with action verb"
            }

    # Rule 4: Blacklist check (Negative patterns)
    for pattern in METADATA_BLACKLIST:
        if pattern.search(clean_text):
            return {
                "confidence": 5,
                "validationStatus": "rejected",
                "reason": "University metadata"
            }
            
    for pattern in INSTRUCTION_BLACKLIST:
        if pattern.search(clean_text):
            return {
                "confidence": 12,
                "validationStatus": "rejected",
                "reason": "Exam instruction"
            }
            
    for pattern in PAGE_BLACKLIST:
        if pattern.search(clean_text):
            return {
                "confidence": 8,
                "validationStatus": "rejected",
                "reason": "Page metadata"
            }
            
    for pattern in SYSTEM_BLACKLIST:
        if pattern.search(clean_text):
            return {
                "confidence": 0,
                "validationStatus": "rejected",
                "reason": "System-generated content"
            }

    # Confidence Scoring Calculation
    confidence = 55  # Base confidence for non-blacklisted questions
    
    # 1. Action verb check
    # Check if first 3 words contain any action verb
    has_verb = False
    for w in words[:3]:
        w_clean = re.sub(r'[^\w]', '', w).lower()
        if w_clean in ACTION_VERBS:
            has_verb = True
            break
            
    if has_verb:
        confidence += 25
    
    # 2. Question mark check
    if '?' in clean_text:
        confidence += 25
        
    # 3. Marks pattern check (e.g. [5 marks], (10), etc.)
    has_marks = False
    if re.search(r'[\(\[]\s*\d+\s*(?:marks?|m)?\s*[\)\]]', clean_text, re.IGNORECASE):
        has_marks = True
        confidence += 15
    elif re.search(r'\b\d+\s*(?:marks?|m)\b', clean_text, re.IGNORECASE):
        has_marks = True
        confidence += 15
        
    # 4. Length bonus
    if len(clean_text) > 20:
        confidence += 12
        
    # 5. Penalties for lack of questions cues
    if not has_verb and '?' not in clean_text and not has_marks:
        # Check if it has equations or numerical setup (like "Let X = ...", "Consider ...")
        starts_formula = re.match(r'^(?:consider|let|assume|for\b)', clean_text, re.IGNORECASE)
        if not starts_formula:
            confidence -= 25
            
    # Case penalty: metadata titles are often all-caps
    if clean_text.isupper() and len(clean_text) > 5:
        confidence -= 20
        
    # Clamp confidence
    confidence = max(0, min(100, confidence))
    
    # Rule 3: Contains a question pattern or action verb
    # If confidence drops below 40, status is rejected
    status = "accepted"
    reason = "Genuine question indicators found"
    
    if confidence < 40:
        status = "rejected"
        reason = "Does not match question verbs/patterns"
    elif confidence <= 60:
        status = "review"
        reason = "Borderline question indicators"
        
    return {
        "confidence": confidence,
        "validationStatus": status,
        "reason": reason
    }

def clean_question(text: str) -> str:
    """
    Cleans a question string by removing duplicate whitespace, OCR artifacts,
    repeated punctuation, and fixing broken line breaks.
    """
    if not text:
        return ""
        
    # 1. Fix broken line breaks (replace newlines with spaces)
    cleaned = text.replace('\n', ' ').replace('\r', ' ')
    
    # 2. Remove OCR artifacts (standalone characters like |, \, _, ~, ^)
    cleaned = re.sub(r'\s+[\\\|_~\^]\s+', ' ', cleaned)
    cleaned = re.sub(r'^[\\\|_~\^]\s+|\s+[\\\|_~\^]$', ' ', cleaned)
    
    # 3. Clean repeated punctuation
    cleaned = re.sub(r'\.{3,}', '.', cleaned) # ... to .
    cleaned = re.sub(r'\?{2,}', '?', cleaned) # ??? to ?
    cleaned = re.sub(r'\!{2,}', '!', cleaned) # !!! to !
    cleaned = re.sub(r'-{3,}', '-', cleaned) # --- to -
    
    # 4. Remove duplicate whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned)
    
    return cleaned.strip()

def normalize_question_number(number: str) -> str:
    """
    Normalizes a question number by stripping trailing dots, colons, spaces, and brackets.
    """
    if not number:
        return ""
    # Strip spaces
    num = number.strip()
    # Strip trailing dot, colon, semicolon
    num = re.sub(r'[\.\:\;\-\s]+$', '', num)
    # Strip leading dot, colon, semicolon
    num = re.sub(r'^[\.\:\;\-\s]+', '', num)
    return num

def is_meta_instruction(text: str) -> bool:
    """
    Returns True if the text matches generic exam instructions (e.g. 'Answer the following', 'Attempt any four').
    """
    clean = text.strip().lower()
    if not clean:
        return True
        
    # Check against known blacklist patterns
    for pattern in INSTRUCTION_BLACKLIST:
        if pattern.search(clean):
            return True
            
    # Additional generic instruction patterns
    meta_patterns = [
        r'\banswer\s+(?:all|any|the\s+following|questions)\b',
        r'\battempt\s+(?:all|any|the\s+following|questions)\b',
        r'^\s*(?:answer|attempt|choose|select)\s+(?:the\s+following|any|all|questions|one|two|three|four|five)\b',
        r'^\s*(?:answer|attempt)\s*$',
    ]
    
    for pat in meta_patterns:
        if re.search(pat, clean):
            return True
            
    return False

