"""Deterministic folder analytics, and the fingerprint that caches them.

This is differentiator #1: cross-year repetition and weightage, computed once per
folder and served to every authorized viewer — including public share viewers —
without recomputation per page load (D-014).

Caching is keyed on a **content fingerprint** rather than a timestamp or an
explicit invalidation call. That choice is deliberate and it is about failure
modes:

* A timestamp cannot tell a change that affects analytics from one that does not,
  so renaming a folder would re-run the whole pipeline.
* Explicit invalidation is correct only while every future mutation site
  remembers to call it, and the failure is silent — stale analytics served after
  new papers arrive, which is exactly the case that matters.
* A fingerprint is self-correcting: if a code path forgets to invalidate, the
  fingerprint still differs and the cache still misses.

Everything here is pure and consults no clock. ``computed_at`` is stamped by the
database when a row is written, not by this module.
"""

import hashlib
import json

from backend.config import ALGO_VERSION, NORMALIZER_VERSION, SIMILARITY_THRESHOLD


def compute_fingerprint(
    paper_content_hashes: list[str],
    correction_ids: list[str],
    reference_year: int | None,
    algo_version: int = ALGO_VERSION,
    normalizer_version: int = NORMALIZER_VERSION,
    similarity_threshold: float = SIMILARITY_THRESHOLD,
) -> str:
    """Hash everything the analytics computation depends on.

    Any change to an input changes the fingerprint, so the cache misses and
    analytics recompute. Nothing else should feed into this: including a
    timestamp or a row count would cause thrashing, while omitting a real input
    causes stale results.

    Corrections are included because they change marks and topic assignments, so
    a correction must invalidate the cache (D-012, D-014).

    Args:
        paper_content_hashes: SHA-256 of each paper's bytes. Order-independent.
        correction_ids: Ids of every correction in the folder. Order-independent.
        reference_year: The folder's stored reference year.
        algo_version: Bumped when scoring changes, so a code change invalidates
            every cache row automatically.
        normalizer_version: Bumped when normalization changes, which changes every
            question hash.
        similarity_threshold: Included so retuning it recomputes the advisory
            cluster counts that feed the score.

    Returns:
        A hex SHA-256 digest.

    >>> a = compute_fingerprint(["h1", "h2"], [], 2025)
    >>> b = compute_fingerprint(["h2", "h1"], [], 2025)   # order must not matter
    >>> a == b
    True
    >>> c = compute_fingerprint(["h1", "h2", "h3"], [], 2025)  # a new paper
    >>> a == c
    False
    """
    # Sorted so the fingerprint depends on the SET of inputs, not the order the
    # database happened to return them in. Without this, an unordered query would
    # produce a different fingerprint each run and the cache would never hit.
    payload = {
        "papers": sorted(paper_content_hashes),
        "corrections": sorted(correction_ids),
        "reference_year": reference_year,
        "algo_version": algo_version,
        "normalizer_version": normalizer_version,
        "similarity_threshold": similarity_threshold,
    }

    # sort_keys and a fixed separator so the serialization itself is canonical.
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def compute_analytics(
    scored_groups: list[dict],
    total_papers: int,
    total_questions: int,
    topic_names_by_hash: dict[str, str | None],
    coverage: list[dict] | None = None,
) -> dict:
    """Build the cached analytics payload for a folder.

    Args:
        scored_groups: Output of :func:`backend.analysis.scoring.score_groups`.
        total_papers: Papers in the folder.
        total_questions: Accepted questions across those papers, before grouping.
        topic_names_by_hash: Group hash -> topic name, for weightage.
        coverage: Output of :func:`backend.analysis.topics.coverage_gaps`.

    Returns:
        A JSON-serialisable dict, stored in ``folder_analytics.payload``.
    """
    unique_questions = len(scored_groups)

    # What fraction of questions asked were repeats of something already asked.
    # Guarded against division by zero and clamped at zero, since grouping can
    # never produce more groups than questions.
    repeat_rate = 0.0
    if total_questions > 0:
        repeat_rate = round(
            max(0.0, 100.0 * (1.0 - unique_questions / total_questions)), 1
        )

    distribution = {
        "critical": 0, "very_high": 0, "high": 0, "medium": 0, "low": 0,
    }
    for group in scored_groups:
        level = group.get("priority_level")
        if level in distribution:
            distribution[level] += 1

    return {
        "total_papers": total_papers,
        "total_questions": total_questions,
        "unique_questions": unique_questions,
        "repeat_rate_percentage": repeat_rate,
        "priority_distribution": distribution,
        "topic_weights": _topic_weights(scored_groups, topic_names_by_hash),
        "year_trends": _year_trends(scored_groups),
        "coverage": coverage or [],
    }


def _topic_weights(
    scored_groups: list[dict], topic_names_by_hash: dict[str, str | None]
) -> list[dict]:
    """Topic weightage as a percentage of questions and of total marks.

    Marks percentage is what a student should revise by: a topic with three
    ten-mark questions matters more than one with five two-mark questions, and the
    frequency percentage alone would say the opposite.
    """
    counts: dict[str, int] = {}
    marks: dict[str, float] = {}

    for group in scored_groups:
        topic = topic_names_by_hash.get(str(group.get("normalized_hash"))) or "Uncategorized"
        occurrences = int(group.get("occurrence_count") or 0)

        counts[topic] = counts.get(topic, 0) + occurrences

        # Total marks contributed = average marks x how many times it was asked.
        average = group.get("avg_marks")
        if average is not None:
            marks[topic] = marks.get(topic, 0.0) + float(average) * occurrences

    total_count = sum(counts.values())
    total_marks = sum(marks.values())

    weights = [
        {
            "topic_name": topic,
            "question_count": count,
            "frequency_percentage": (
                round(100.0 * count / total_count, 1) if total_count else 0.0
            ),
            "marks_percentage": (
                round(100.0 * marks.get(topic, 0.0) / total_marks, 1)
                if total_marks
                else 0.0
            ),
        }
        for topic, count in counts.items()
    ]

    # Heaviest first; name as tiebreak so equal weights order identically between
    # runs (D-014).
    weights.sort(key=lambda w: (-w["marks_percentage"], -w["question_count"], w["topic_name"]))
    return weights


def _year_trends(scored_groups: list[dict]) -> list[dict]:
    """Questions asked per year, ascending.

    Counts every occurrence, not every group: a question asked in three years
    contributes to all three, which is what makes this a per-year trend rather
    than a restatement of the group count.
    """
    per_year: dict[int, int] = {}
    for group in scored_groups:
        for year in group.get("years") or []:
            per_year[int(year)] = per_year.get(int(year), 0) + 1

    return [
        {"year": year, "question_count": per_year[year]} for year in sorted(per_year)
    ]
