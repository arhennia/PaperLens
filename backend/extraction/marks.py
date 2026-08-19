"""Marks extraction from question text.

Ported unchanged in behaviour from the previous implementation, which was
verified correct against real papers (AUDIT.md 3.3) across bracketed, bare and
multiplier forms. AGENTS.md is explicit that working extraction logic should not
be rewritten for stylistic reasons, so this is a move plus documentation rather
than a redesign.

Three forms are recognised, in priority order:

1. **Multiplier** — ``[2x5]``, ``(5 x 10)``, ``[1 Mark X 5]``. Returned as the
   string ``"2x5"`` so the caller can distribute per-subquestion marks.
2. **Bracketed value** — ``(10 marks)``, ``[5 Marks]``, ``(10m)``, ``[5]``.
3. **Bare value** — ``10 marks``, ``5 Marks``.

Order matters: ``[2x5]`` would otherwise match form 2 as a bare ``2``.
"""

import re

# `[2x5]`, `(5 x 10)`, `[1 Mark X 5]`
_MULTIPLIER = re.compile(
    r"([(\[]\s*(\d+)\s*(?:marks?|m|mark\s+each)?\s*[xX*]\s*(\d+)\s*(?:marks?|m)?\s*[)\]])",
    re.IGNORECASE,
)

# `(10 marks)`, `[5]`, `(10m)`
_BRACKETED = re.compile(r"([(\[]\s*(\d+)\s*(?:marks?|m)?\s*[)\]])", re.IGNORECASE)

# `10 marks`, `5 m`
_BARE = re.compile(r"\b(\d+)\s*(?:marks?|m)\b", re.IGNORECASE)


def extract_marks(text: str) -> tuple[str, int | str | None, str | None]:
    """Find and remove a marks annotation from ``text``.

    Args:
        text: Question text, possibly containing a marks annotation.

    Returns:
        ``(cleaned_text, marks, pattern)`` where ``marks`` is an int for a plain
        value, a ``"AxB"`` string for a multiplier, or None if nothing matched,
        and ``pattern`` is the literal text that was removed (kept so the UI can
        show what was interpreted, and so a mis-parse is diagnosable).

    >>> extract_marks("Explain paging. (10 marks)")
    ('Explain paging. ', 10, '(10 marks)')
    >>> extract_marks("Answer both. [2x5]")
    ('Answer both. ', '2x5', '[2x5]')
    >>> extract_marks("Explain paging.")
    ('Explain paging.', None, None)
    """
    match = _MULTIPLIER.search(text)
    if match:
        pattern = match.group(1)
        return text.replace(pattern, ""), f"{match.group(2)}x{match.group(3)}", pattern

    match = _BRACKETED.search(text)
    if match:
        pattern = match.group(1)
        return text.replace(pattern, ""), int(match.group(2)), pattern

    match = _BARE.search(text)
    if match:
        pattern = match.group(0)
        return text.replace(pattern, ""), int(match.group(1)), pattern

    return text, None, None


def distribute_multiplier(
    marks: str, subquestion_count: int
) -> tuple[float | None, float | None]:
    """Split a ``"AxB"`` multiplier into a total and a per-subquestion value.

    ``[2x5]`` is ambiguous on its own: it could mean five questions worth two
    marks or two worth five. The subquestion count disambiguates it, and the
    total is ``A * B`` either way.

    Args:
        marks: A multiplier string such as ``"2x5"``.
        subquestion_count: How many subquestions the parent actually has.

    Returns:
        ``(total_marks, marks_per_subquestion)``, either possibly None if the
        string could not be parsed.

    >>> distribute_multiplier("2x5", 5)   # five subquestions, 2 marks each
    (10.0, 2.0)
    >>> distribute_multiplier("5x2", 5)   # same total, other way round
    (10.0, 2.0)
    """
    try:
        left_text, right_text = marks.lower().split("x", 1)
        left, right = int(left_text.strip()), int(right_text.strip())
    except (ValueError, AttributeError):
        return None, None

    total = float(left * right)

    if subquestion_count <= 0:
        return total, float(left)

    # Whichever factor equals the subquestion count is the count; the other is
    # the per-question value.
    if right == subquestion_count:
        return total, float(left)
    if left == subquestion_count:
        return total, float(right)

    # Neither matches, so the annotation disagrees with the parsed structure.
    # A factor of 1 is far more likely to be the mark value than the count.
    if left == 1 or right == 1:
        return total, 1.0
    return total, float(left)
