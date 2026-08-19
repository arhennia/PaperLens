"""Exact deduplication: grouping questions into concepts by content hash.

This is the authoritative identity mechanism (D-011, D-024). Two questions in a
folder with the same ``normalized_hash`` are the same question, full stop — no
threshold, no model, no false positives by construction. Repeat counts, topic
weightage and priority scores all rest on it, which is why it must be exact
rather than fuzzy.

Determinism matters here as much as correctness. Three ordering hazards existed in
the previous implementation and all three are fixed:

* Groups were emitted in dict-iteration order over an unordered query result, and
  their ids embedded that position (``g_{session_id}_{idx}``). Identity is now the
  content hash, and groups are emitted sorted by hash.
* Canonical text was chosen with ``max(..., key=len)``, which breaks ties by input
  order. Ties now break lexicographically, so two runs cannot disagree.
* Aggregates were computed from rows in arbitrary order. All aggregation here is
  order-independent.
"""

from dataclasses import dataclass, field


@dataclass
class QuestionGroup:
    """One concept: every occurrence of the same question across a folder.

    Attributes:
        normalized_hash: SHA-256 of the normalized text. The group's identity.
        canonical_text: The wording shown to students — the longest verbatim
            occurrence, since a longer version usually carries more of the
            original question.
        question_ids: Ids of the questions in this group.
        occurrence_count: How many times the question appears.
        distinct_years: How many different years it appears in.
        years: Sorted list of years it appeared in.
        avg_marks / max_marks: Marks aggregates, or None if no occurrence had
            marks.
        first_year / last_year: Earliest and latest appearance.
        year_span: ``last_year - first_year``.
        page_numbers: Sorted pages where occurrences were found (D-013).
        has_low_confidence: True when any occurrence came from a page whose
            extraction was unreliable.
    """

    normalized_hash: str
    canonical_text: str
    question_ids: list[str] = field(default_factory=list)
    occurrence_count: int = 0
    distinct_years: int = 0
    years: list[int] = field(default_factory=list)
    avg_marks: float | None = None
    max_marks: float | None = None
    first_year: int | None = None
    last_year: int | None = None
    year_span: int = 0
    page_numbers: list[int] = field(default_factory=list)
    has_low_confidence: bool = False


def group_questions(questions: list[dict]) -> list[QuestionGroup]:
    """Group accepted questions into concepts by exact content hash.

    Args:
        questions: Question dicts. Each needs ``normalized_hash`` and
            ``text_extracted``; ``id``, ``year``, ``marks``, ``page_number``,
            ``status`` and ``low_confidence`` are used when present.

            Rows whose ``status`` is anything other than ``accepted`` are
            excluded: a rejected question is retained for review (D-025) but must
            not inflate a repeat count.

    Returns:
        Groups sorted by ``normalized_hash``, so the order is identical across
        runs regardless of the order rows arrived in.

    >>> qs = [
    ...     {"id": "1", "normalized_hash": "h1", "text_extracted": "Explain paging",
    ...      "year": 2023, "marks": 10, "page_number": 2},
    ...     {"id": "2", "normalized_hash": "h1", "text_extracted": "Explain paging.",
    ...      "year": 2024, "marks": 10, "page_number": 1},
    ... ]
    >>> groups = group_questions(qs)
    >>> len(groups), groups[0].occurrence_count, groups[0].year_span
    (1, 2, 1)
    """
    buckets: dict[str, list[dict]] = {}
    for question in questions:
        if question.get("status", "accepted") != "accepted":
            continue
        digest = question.get("normalized_hash")
        if not digest:
            continue
        buckets.setdefault(digest, []).append(question)

    # Sorted by hash so output order is a function of content, never of input
    # order or dict iteration order.
    return [
        _build_group(digest, buckets[digest]) for digest in sorted(buckets)
    ]


def _build_group(digest: str, occurrences: list[dict]) -> QuestionGroup:
    """Aggregate one bucket of identical questions into a group."""
    # Longest text wins, ties broken lexicographically. The tiebreak is what
    # makes this deterministic: `max(key=len)` alone would return whichever
    # equal-length row happened to come first.
    canonical = max(
        (str(o.get("text_extracted") or "") for o in occurrences),
        key=lambda text: (len(text), text),
    )

    marks = [
        float(o["marks"]) for o in occurrences if o.get("marks") is not None
    ]
    years = sorted({int(o["year"]) for o in occurrences if o.get("year") is not None})
    pages = sorted(
        {int(o["page_number"]) for o in occurrences if o.get("page_number") is not None}
    )

    return QuestionGroup(
        normalized_hash=digest,
        canonical_text=canonical,
        # Sorted so the stored membership list is stable between runs.
        question_ids=sorted(str(o["id"]) for o in occurrences if o.get("id")),
        occurrence_count=len(occurrences),
        distinct_years=len(years),
        years=years,
        avg_marks=sum(marks) / len(marks) if marks else None,
        max_marks=max(marks) if marks else None,
        first_year=years[0] if years else None,
        last_year=years[-1] if years else None,
        year_span=(years[-1] - years[0]) if years else 0,
        page_numbers=pages,
        has_low_confidence=any(o.get("low_confidence") for o in occurrences),
    )
