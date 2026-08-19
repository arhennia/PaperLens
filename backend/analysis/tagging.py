"""Question type and difficulty tagging.

Both are **heuristics, and both are user-correctable** (D-012). They are keyword
and marks based rather than model based, so they are deterministic and cost
nothing — and because a wrong tag is visible and fixable, a simple rule that is
right most of the time beats an opaque one that is right slightly more often.

This replaces ``"long" if marks >= 10 else "short"``, which was the previous
implementation's entire notion of question type: it described length, not type,
and did not match any of the categories the product actually calls for. Difficulty
did not exist at all.

Ordering matters in :func:`classify_type`. A question can trip several keyword
sets — "Derive the formula and draw the circuit" is both a derivation and a
diagram — so the checks run most-specific first and the first match wins. Ties are
resolved by that order rather than by keyword counts, which keeps the outcome
predictable and explainable to a student.
"""

import re

# Ordered most specific first: the first matching category wins.
TYPE_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "derivation",
        (
            "derive", "derivation", "prove", "proof", "show that",
            "obtain the expression", "obtain an expression",
        ),
    ),
    (
        "numerical",
        (
            "calculate", "compute", "evaluate", "find the value", "how many",
            "determine the", "solve", "numerical",
        ),
    ),
    (
        "diagram",
        (
            "draw", "sketch", "diagram", "flowchart", "flow chart", "circuit",
            "block diagram", "illustrate with a", "pipeline", "state machine",
            "er diagram", "schematic",
        ),
    ),
    (
        "short_note",
        ("short note", "write short", "define", "list the", "state the", "abbreviat"),
    ),
    (
        "descriptive",
        (
            "explain", "describe", "discuss", "compare", "differentiate",
            "distinguish", "elaborate", "justify", "summarize", "what is",
            "why is", "how does",
        ),
    ),
)


def classify_type(text: str, marks: float | None = None) -> str | None:
    """Tag a question's type.

    Args:
        text: The question text.
        marks: Marks, used only as a weak fallback when no keyword matches.

    Returns:
        One of ``numerical``, ``derivation``, ``diagram``, ``short_note``,
        ``descriptive``, or None when there is nothing to go on. None is
        deliberate: an untagged question is honest, a wrongly tagged one is not.

    >>> classify_type("Derive the expression for average waiting time.")
    'derivation'
    >>> classify_type("Draw the block diagram of a CPU.")
    'diagram'
    >>> classify_type("Explain paging in virtual memory.")
    'descriptive'
    """
    if not text:
        return None

    lowered = text.lower()
    for question_type, keywords in TYPE_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return question_type

    # No keyword matched. Low-mark questions are usually short notes; anything
    # larger is more likely a descriptive answer.
    if marks is not None:
        return "short_note" if float(marks) <= 3 else "descriptive"

    return None


# Terms suggesting a question needs analysis or synthesis rather than recall.
_HARD_SIGNALS = (
    "derive", "prove", "design", "optimi", "critically", "analyse", "analyze",
    "evaluate", "justify", "trade-off", "tradeoff", "compare and contrast",
)

# Terms suggesting straightforward recall.
_EASY_SIGNALS = ("define", "list", "state", "what is", "abbreviat", "full form")


def classify_difficulty(
    text: str, marks: float | None = None, question_type: str | None = None
) -> str | None:
    """Tag a question's difficulty.

    Combines three weak signals — cognitive-demand keywords, marks, and question
    type — because none is reliable alone. Marks matter most in practice: an
    examiner allocating fifteen marks is asking for more work than one allocating
    two.

    Returns:
        ``easy``, ``medium``, ``hard``, or None when there is no signal at all.

    >>> classify_difficulty("Define RAM.", marks=2)
    'easy'
    >>> classify_difficulty("Derive the page fault rate formula.", marks=15)
    'hard'
    """
    if not text and marks is None:
        return None

    lowered = (text or "").lower()
    score = 0

    if any(signal in lowered for signal in _HARD_SIGNALS):
        score += 2
    if any(lowered.startswith(signal) for signal in _EASY_SIGNALS):
        score -= 1

    # Multi-part questions are harder than their wording suggests.
    if len(re.findall(r"\b(?:and|also|then)\b", lowered)) >= 2:
        score += 1

    if marks is not None:
        value = float(marks)
        if value >= 12:
            score += 2
        elif value >= 8:
            score += 1
        elif value <= 2:
            score -= 1

    if question_type == "derivation":
        score += 1
    elif question_type == "short_note":
        score -= 1

    if score >= 3:
        return "hard"
    if score <= 0:
        return "easy"
    return "medium"
