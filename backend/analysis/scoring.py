"""Six-factor priority scoring for question groups.

Answers "what should I study first?" by combining how often a question recurs,
how recently, how many marks it carries, how consistently it spans years, how
many similar variations exist, and its chapter weight.

**The weights are preserved** from the previous implementation (D-014): they are
heuristic rather than derived, but they were tuned against real papers, and
changing them would silently reshuffle every student's revision order.

**The non-determinism is fixed.** Two independent causes existed, and the audit
found only one:

1. ``datetime.now().year`` drove a 20-points-per-year recency decay, so the same
   papers scored differently in different calendar years. Recency is now measured
   against the folder's stored ``reference_year``.
2. Clustering was order-dependent, so the ``cluster`` factor could vary between
   runs on identical data. Fixed in :mod:`backend.analysis.similarity`.

Pinning only the year would have produced a convincing but false claim of
determinism, which is why both are named here.

No clock is read anywhere in this module. That is the property
``test_analysis_determinism.py`` pins.
"""

from backend.config import (
    ALGO_VERSION,
    PRIORITY_LEVELS,
    RECENCY_DECAY_PER_YEAR,
    SCORING_WEIGHTS,
)

# Used when a group has no marks recorded, so a missing value neither rewards nor
# penalises it. A zero would push unmarked questions to the bottom regardless of
# how often they recur.
NEUTRAL_FACTOR = 50.0


def score_groups(
    groups: list[dict],
    reference_year: int | None,
    total_years: int,
    cluster_sizes: dict[str, int] | None = None,
    folder_total_marks: float | None = None,
) -> list[dict]:
    """Score every group, returning new dicts with priority fields filled in.

    Pure: same inputs always produce the same outputs, and no clock is consulted.

    Args:
        groups: Group dicts from :func:`backend.analysis.dedup.group_questions`,
            as produced by :meth:`_group_to_dict` or equivalent. Each needs
            ``normalized_hash``, ``occurrence_count``, ``distinct_years``,
            ``last_year`` and ``avg_marks``.
        reference_year: The year recency is measured against — the folder's
            stored value, normally its most recent paper (D-014). When None,
            recency contributes its neutral value rather than reading the clock.
        total_years: Distinct years of papers in the folder, used to normalise
            spread. Values below 1 are treated as 1.
        cluster_sizes: Hash -> containing cluster size, from
            :func:`backend.analysis.similarity.cluster_sizes`. Absent hashes
            count as a cluster of one.
        folder_total_marks: The exam's total marks, if known, used to normalise
            the marks factor. Falls back to the largest marks value seen.

    Returns:
        New dicts with ``priority_score``, ``priority_level``, ``factors``,
        ``priority_reason``, ``reference_year`` and ``algo_version`` added, sorted
        by descending score then by hash so equal scores order identically
        between runs.
    """
    if not groups:
        return []

    sizes = cluster_sizes or {}
    safe_total_years = max(1, total_years)

    # Frequency and marks are relative to the folder, so the maxima are computed
    # once over the whole set rather than per group.
    max_occurrences = max(
        (int(g.get("occurrence_count") or 0) for g in groups), default=1
    ) or 1
    observed_max_marks = max(
        (float(g["max_marks"]) for g in groups if g.get("max_marks") is not None),
        default=0.0,
    )
    marks_denominator = folder_total_marks or observed_max_marks or 10.0

    scored = []
    for group in groups:
        factors = _compute_factors(
            group,
            reference_year=reference_year,
            total_years=safe_total_years,
            max_occurrences=max_occurrences,
            marks_denominator=marks_denominator,
            cluster_size=sizes.get(str(group.get("normalized_hash")), 1),
        )

        score = round(
            sum(factors[name] * weight for name, weight in SCORING_WEIGHTS.items()), 1
        )
        level = _priority_level(score)

        scored.append(
            {
                **group,
                "priority_score": score,
                "priority_level": level,
                "factors": factors,
                "priority_reason": _explain(group, factors, level),
                "reference_year": reference_year,
                "algo_version": ALGO_VERSION,
            }
        )

    # Descending score, then hash as tiebreak -- without the tiebreak, two groups
    # with identical scores could swap places between runs.
    scored.sort(key=lambda g: (-g["priority_score"], str(g["normalized_hash"])))
    return scored


def _compute_factors(
    group: dict,
    reference_year: int | None,
    total_years: int,
    max_occurrences: int,
    marks_denominator: float,
    cluster_size: int,
) -> dict[str, float]:
    """Compute the six 0-100 factors for one group."""
    occurrences = int(group.get("occurrence_count") or 0)
    frequency = (occurrences / max_occurrences) * 100.0

    # Linear decay from the reference year. A question last asked in the
    # reference year scores 100; each year older costs 20 points, floored at 0.
    last_year = group.get("last_year")
    if reference_year is not None and last_year is not None:
        age = max(0, reference_year - int(last_year))
        recency = max(0.0, 100.0 - age * RECENCY_DECAY_PER_YEAR)
    else:
        recency = NEUTRAL_FACTOR

    avg_marks = group.get("avg_marks")
    if avg_marks is not None and marks_denominator > 0:
        marks = min(100.0, (float(avg_marks) / marks_denominator) * 100.0)
    else:
        marks = NEUTRAL_FACTOR

    spread = min(100.0, (int(group.get("distinct_years") or 0) / total_years) * 100.0)

    # Each extra variation adds 25 points, capped. Weighted at only 7%, which
    # usefully limits how far unvalidated similarity can move a score (D-024).
    cluster = min(100.0, max(0, cluster_size - 1) * 25.0)

    # Not yet implemented: syllabus chapter weighting needs per-chapter marks
    # from a parsed syllabus. Neutral until then, so it neither helps nor hurts.
    chapter = NEUTRAL_FACTOR

    return {
        "frequency": round(frequency, 2),
        "recency": round(recency, 2),
        "marks": round(marks, 2),
        "spread": round(spread, 2),
        "cluster": round(cluster, 2),
        "chapter": round(chapter, 2),
    }


def _priority_level(score: float) -> str:
    """Map a score to its bucket. Thresholds are descending, so the first wins."""
    for threshold, level in PRIORITY_LEVELS:
        if score >= threshold:
            return level
    return "low"


def _explain(group: dict, factors: dict[str, float], level: str) -> str:
    """Write the human-readable reason for a group's ranking.

    Students act on this rather than on the number, so it names the actual drivers
    instead of restating the score.
    """
    reasons: list[str] = []

    if factors["frequency"] >= 80.0:
        reasons.append("is extremely frequent across papers")
    elif factors["frequency"] >= 50.0:
        reasons.append("has appeared multiple times")

    last_year = group.get("last_year")
    if factors["recency"] >= 80.0 and last_year:
        reasons.append(f"was asked recently (last in {int(last_year)})")
    elif factors["recency"] >= 50.0:
        reasons.append("was asked in recent years")

    if factors["spread"] >= 60.0:
        reasons.append("shows high consistency across multiple years")

    avg_marks = group.get("avg_marks")
    if avg_marks is not None and float(avg_marks) >= 8.0:
        reasons.append(f"carries high weightage ({int(float(avg_marks))} marks on average)")

    # Phrased as "similar variations", never "the same question": this factor
    # comes from advisory fuzzy matching (D-024).
    if factors["cluster"] > 0:
        variations = int(factors["cluster"] / 25.0) + 1
        reasons.append(f"appears in {variations} similar variations")

    readable_level = level.replace("_", " ").title()
    if not reasons:
        return f"Ranked {readable_level} based on standard frequency and spacing factors."

    if len(reasons) == 1:
        return f"Ranked {readable_level} because it {reasons[0]}."

    return (
        f"Ranked {readable_level} because it "
        + ", ".join(reasons[:-1])
        + ", and "
        + reasons[-1]
        + "."
    )
