"""Heuristic validation and confidence scoring for extracted questions.

Decides whether a block of text is a genuine exam question or page furniture
that the parser picked up. Rejected blocks are kept as ``questions`` rows with
``status = 'rejected'`` rather than discarded (D-025), so a student can review
what was filtered and accept it if the heuristic was wrong.

**The scoring is a port.** The previous implementation was verified against real
noisy papers (AUDIT.md 3.3) and its thresholds are load-bearing for extraction
quality, so the confidence arithmetic, rule order, and garbage detection are
unchanged. The regression cases in
``backend/tests/test_validation.py`` pin that behaviour.

One deliberate behaviour change, approved as D-028: the metadata blacklist is now
two-tier. The old single list rejected any text containing ``course``,
``semester``, ``degree``, ``tech``, ``spring`` or ``autumn`` — ordinary English
words. It was tuned against page headers but applied to question text, so
"Explain the semester system's effect on scheduling" was silently thrown away.
Generic words now only reject text that also *looks* like a header
(:func:`backend.extraction.patterns.looks_like_header`), while unambiguous
markers like "Registration No" still reject anywhere.
"""

import re
from dataclasses import dataclass

from backend.extraction.patterns import (
    InstitutionProfile,
    get_profile,
    looks_like_header,
)

# Verbs that open an instruction to the student. Presence in the first three
# words is the strongest single signal that a block is a question.
ACTION_VERBS = frozenset(
    {
        "explain", "describe", "discuss", "compare", "differentiate", "analyze",
        "evaluate", "design", "calculate", "derive", "illustrate", "justify",
        "what", "why", "how", "when", "consider", "assume", "find", "determine",
        "show", "prove", "solve", "define", "write", "state", "list", "sketch",
        "verify", "identify", "trace", "compute", "formulate", "construct",
        "give", "elaborate", "distinguish", "summarize", "obtain",
    }
)

# Verbs that can carry a two-word question on their own: "Define RAM" is a real
# exam question, "Semester 4th" is not.
TERSE_QUESTION_VERBS = frozenset(
    {"define", "explain", "list", "state", "sketch", "write"}
)

# Technical abbreviations with no vowels. Without this list the vowel-less word
# check would flag "CPU scheduling" and "DMA transfer" as OCR damage.
KNOWN_ABBREVIATIONS = frozenset(
    {
        "cpu", "sram", "dram", "os", "fifo", "lru", "pcb", "mmu", "tlb", "i/o",
        "ram", "rom", "dma", "lan", "wan", "ip", "tcp", "udp", "sql", "xml",
        "dbms", "api", "acid", "oop", "uml", "dns", "http", "https", "ftp",
        "bjt", "fet", "op-amp", "alu", "asic", "fpga", "risc", "cisc", "cs",
    }
)

INSTRUCTION_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\banswer\s+all\s+(?:the\s+)?questions\b",
        r"\banswer\s+any\s+(?:four|three|five|two|one|six)\s+questions\b",
        r"\battempt\s+any\b",
        r"\battempt\s+all\b",
        r"\bfull\s+marks\b",
        r"\btime\s*:",
        r"\bbest\s+of\s+luck\b",
        r"\ball\s+the\s+best\b",
        r"\bfigures\s+in\s+the\s+margin\b",
        r"\bcandidates\s+are\s+required\b",
        r"\bmaximum\s+marks\b",
        r"\bquestions\s+carry\s+equal\s+marks\b",
        r"\bwrite\s+answers\s+in\s+your\s+own\b",
    )
)

PAGE_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (r"^\s*page\s+\d+", r"^\s*page\s+no", r"\bpg\s*\.?\s*\d+\b")
)

# PaperLens's own markers, which appear if an exported PDF is re-uploaded.
SYSTEM_PATTERNS = (
    re.compile(r"\bpaperlens\b", re.IGNORECASE),
    re.compile(r"^\s*\[subquestions\s+only\]\s*$", re.IGNORECASE),
)

# Characters that legitimately appear in maths and code, excluded from the
# "too many symbols" ratio so an equation is not mistaken for OCR noise.
_MATH_SAFE = re.compile(r"[\w\s+\-=*/()<>,.;?'\"]")

# Characters that are almost always scanning damage rather than content.
_CORRUPT_CHARS = frozenset("}{][|\\^~_")

_VOWELS = frozenset("aeiouy")


@dataclass(frozen=True)
class ValidationResult:
    """Outcome of validating one candidate question.

    Attributes:
        confidence: 0-100. Drives the low-confidence badge as well as the
            accept/reject decision.
        status: ``accepted``, ``review`` or ``rejected``. ``review`` means
            borderline — stored as accepted but worth a second look.
        reason: Why this outcome, in words a student can read.
    """

    confidence: int
    status: str
    reason: str

    @property
    def is_rejected(self) -> bool:
        return self.status == "rejected"


def is_ocr_garbage(text: str) -> tuple[bool, str]:
    """Detect text too corrupted to be a question.

    Two signals: a high proportion of non-language symbols, and a high
    proportion of words that look broken (no vowels, or corrupt characters
    inside). Both are ratios with a minimum length, because short strings are
    too noisy to judge.

    Returns:
        ``(is_garbage, reason)``.
    """
    clean = text.strip()
    if not clean:
        return True, "Empty text"

    symbol_count = len(_MATH_SAFE.sub("", clean))
    symbol_ratio = symbol_count / len(clean)
    if symbol_ratio > 0.18 and len(clean) > 8:
        return True, f"Too many special symbols (ratio: {symbol_ratio:.2f})"

    words = clean.split()
    if not words:
        return True, "No words"

    suspicious = sum(1 for word in words if _is_suspicious_word(word))
    suspicious_ratio = suspicious / len(words)
    if suspicious_ratio > 0.35 and len(words) >= 2:
        return True, f"Too many suspicious/broken words (ratio: {suspicious_ratio:.2f})"

    return False, ""


def _is_suspicious_word(word: str) -> bool:
    """True when one word looks like scanning damage."""
    stripped = re.sub(r"^[^\w]+|[^\w]+$", "", word)
    if not stripped:
        return False

    # Vowel-less words are usually damage. All-caps is excluded because genuine
    # acronyms are common in exam papers and would otherwise all be flagged.
    if len(stripped) >= 2 and stripped.isalpha() and not stripped.isupper():
        if not any(char in _VOWELS for char in stripped.lower()):
            return stripped.lower() not in KNOWN_ABBREVIATIONS

    if any(char in _CORRUPT_CHARS for char in stripped):
        return True

    if stripped.isalnum():
        return False

    # Non-alphanumeric content that is nevertheless legitimate.
    legitimate = (
        r"^\d+(\.\d+)?$",                          # 3.14
        r"^[a-zA-Z\d]+['\-][a-zA-Z\d]+$",          # don't, op-amp
        r"^[A-Z](\.[A-Z])+\.?$",                   # B.Tech style initials
        r"^\(?[a-zA-Z\d\-]+\)?$",                  # (s), (a)
        r"^\[[a-zA-Z\d\-]+\]$",                    # [5]
        r"^[a-zA-Z\d+\-=*/()<>,:!]+$",             # x=x+1
    )
    return not any(re.match(pattern, stripped) for pattern in legitimate)


def validate_question(
    text: str, profile: InstitutionProfile | None = None
) -> ValidationResult:
    """Score a candidate question and decide whether to accept it.

    Rules run in a fixed order, cheapest and most decisive first: garbage
    detection, minimum length, minimum word count, then blacklists, then
    positive scoring. Order is preserved from the verified implementation —
    reordering would change which reason a rejected block reports.

    Args:
        text: The candidate question text.
        profile: Institution patterns (D-028).

    Returns:
        A :class:`ValidationResult`.
    """
    active_profile = profile if profile is not None else get_profile()
    clean = text.strip()

    is_garbage, garbage_reason = is_ocr_garbage(clean)
    if is_garbage:
        return ValidationResult(0, "rejected", f"OCR Garbage: {garbage_reason}")

    words = clean.split()
    first_word = re.sub(r"[^\w]", "", words[0]).lower() if words else ""

    # Rule 1: minimum content length, measured without spaces so "a b c d" is
    # not saved by its spacing.
    char_length = len(re.sub(r"\s+", "", clean))
    if char_length < 10 and not (
        len(words) == 2 and first_word in {"define", "explain", "list", "state", "sketch"}
    ):
        return ValidationResult(
            15, "rejected", f"Too short (length {char_length} < 10 characters)"
        )

    # Rule 2: minimum word count.
    if len(words) < 2:
        return ValidationResult(
            10, "rejected", f"Too few words (count {len(words)} < 2)"
        )
    if len(words) == 2 and first_word not in TERSE_QUESTION_VERBS:
        return ValidationResult(
            20, "rejected", "2-word block does not start with action verb"
        )

    # Rule 3: blacklists.
    rejection = _check_blacklists(clean, active_profile)
    if rejection is not None:
        return rejection

    # Rule 4: positive scoring.
    return _score(clean, words)


def _check_blacklists(
    clean: str, profile: InstitutionProfile
) -> ValidationResult | None:
    """Apply the blacklists. Returns None when nothing matched.

    The strong/weak split is the D-028 fix: see the module docstring.
    """
    for pattern in profile.strong_metadata:
        if pattern.search(clean):
            return ValidationResult(5, "rejected", "University metadata")

    # Generic words reject only in header-shaped text, so a question that merely
    # mentions "course" or "semester" survives.
    if looks_like_header(clean):
        for pattern in profile.weak_metadata:
            if pattern.search(clean):
                return ValidationResult(
                    5, "rejected", "University metadata (header text)"
                )

    for pattern in INSTRUCTION_PATTERNS:
        if pattern.search(clean):
            return ValidationResult(12, "rejected", "Exam instruction")

    for pattern in PAGE_PATTERNS:
        if pattern.search(clean):
            return ValidationResult(8, "rejected", "Page metadata")

    for pattern in SYSTEM_PATTERNS:
        if pattern.search(clean):
            return ValidationResult(0, "rejected", "System-generated content")

    return None


def _score(clean: str, words: list[str]) -> ValidationResult:
    """Compute a confidence score from positive question signals.

    Weights are preserved exactly from the verified implementation. They are
    heuristic rather than derived, but they were tuned against real papers and
    changing them would shift which questions are accepted.
    """
    confidence = 55  # Base for anything that survived the blacklists.

    has_verb = any(
        re.sub(r"[^\w]", "", word).lower() in ACTION_VERBS for word in words[:3]
    )
    if has_verb:
        confidence += 25

    if "?" in clean:
        confidence += 25

    has_marks = bool(
        re.search(r"[(\[]\s*\d+\s*(?:marks?|m)?\s*[)\]]", clean, re.IGNORECASE)
        or re.search(r"\b\d+\s*(?:marks?|m)\b", clean, re.IGNORECASE)
    )
    if has_marks:
        confidence += 15

    if len(clean) > 20:
        confidence += 12

    # Penalty for text with no question signal at all, unless it opens like a
    # problem setup ("Consider a system where...", "Let X be...").
    if not has_verb and "?" not in clean and not has_marks:
        if not re.match(r"^(?:consider|let|assume|for\b)", clean, re.IGNORECASE):
            confidence -= 25

    # All-caps text is usually a heading.
    if clean.isupper() and len(clean) > 5:
        confidence -= 20

    confidence = max(0, min(100, confidence))

    if confidence < 40:
        return ValidationResult(
            confidence, "rejected", "Does not match question verbs/patterns"
        )
    if confidence <= 60:
        return ValidationResult(
            confidence, "review", "Borderline question indicators"
        )
    return ValidationResult(confidence, "accepted", "Genuine question indicators found")


def is_meta_instruction(text: str) -> bool:
    """True when text is an instruction to the candidate, not a question.

    Used by the pipeline to skip parent nodes whose text is only "Answer any four
    of the following" -- such a node should not contribute context to its
    children.
    """
    clean = text.strip().lower()
    if not clean:
        return True

    if any(pattern.search(clean) for pattern in INSTRUCTION_PATTERNS):
        return True

    generic = (
        r"\banswer\s+(?:all|any|the\s+following|questions)\b",
        r"\battempt\s+(?:all|any|the\s+following|questions)\b",
        r"^\s*(?:answer|attempt|choose|select)\s+"
        r"(?:the\s+following|any|all|questions|one|two|three|four|five)\b",
        r"^\s*(?:answer|attempt)\s*$",
    )
    return any(re.search(pattern, clean) for pattern in generic)


def validate_document(
    questions: list[dict], page_count: int, parser_warnings: list[str] | None = None
) -> list[str]:
    """Add document-level warnings to the parser's own.

    Catches the case where parsing technically succeeded but produced an
    implausible result — one question from a ten-page paper means the parser
    failed to recognise the layout, which is worth telling someone about rather
    than silently returning one question.
    """
    warnings = list(parser_warnings or [])

    if not questions and not any("No questions detected" in w for w in warnings):
        warnings.append("Parser failure: No questions detected in the document.")

    if page_count >= 2 and len(questions) <= 1:
        warnings.append(
            f"Possible parser failure: Only {len(questions)} question(s) "
            f"extracted from a {page_count}-page document."
        )

    return warnings
