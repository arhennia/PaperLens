"""Folder reads and reference-year maintenance.

The folder is the durable subject hub (D-010): papers are added to it over time
and its analytics are cached against it. Nothing here creates folders — that
happens in Next.js, where the user's session is.
"""

from backend.db.client import get_client


def get_folder(folder_id: str, user_id: str) -> dict | None:
    """Return one folder, or None if it does not exist for this user."""
    response = (
        get_client()
        .table("folders")
        .select(
            "id, name, subject, exam_name, exam_type, total_marks, "
            "question_pattern, reference_year, syllabus_storage_path"
        )
        .eq("id", folder_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def ensure_reference_year(
    folder_id: str, user_id: str, candidate_years: list[int]
) -> int | None:
    """Return the folder's reference year, setting it from the papers if unset.

    Recency is measured against this year rather than against the clock, which is
    what makes scores reproducible (D-014). It must be **stored** rather than
    inferred at read time: inferring it would reintroduce the same problem in a
    different form, since the inferred value would change as papers were added and
    silently rescore every question.

    Set once, from the most recent paper year, then left alone — including when
    newer papers arrive. A folder whose reference year drifted upward would
    rescore its whole history on every upload, so changing it is deliberately the
    user's decision rather than a side effect.

    Args:
        candidate_years: Years of the folder's papers. Empty leaves it unset.

    Returns:
        The reference year, or None when no paper has a year yet.
    """
    folder = get_folder(folder_id, user_id)
    if folder is None:
        return None

    existing = folder.get("reference_year")
    if existing is not None:
        return int(existing)

    years = [int(year) for year in candidate_years if year is not None]
    if not years:
        return None

    reference_year = max(years)
    (
        get_client()
        .table("folders")
        .update({"reference_year": reference_year})
        .eq("id", folder_id)
        .eq("user_id", user_id)
        .execute()
    )
    return reference_year


def syllabus_chapters(folder_id: str, user_id: str) -> tuple[list[str], str]:
    """Return the folder's topic names and where they came from.

    Prefers topics the user typed or that were parsed from a syllabus. Returns an
    empty list when there are none, which makes
    :func:`backend.analysis.topics.build_topics` fall back to generic defaults —
    marked ``source = 'default'`` so the UI can say they are generic rather than
    presenting them as the real syllabus (D-028).

    Returns:
        ``(chapter_names, source)``.
    """
    response = (
        get_client()
        .table("topics")
        .select("name, ordinal, source")
        .eq("folder_id", folder_id)
        .eq("user_id", user_id)
        .neq("source", "default")
        .order("ordinal")
        .execute()
    )

    rows = response.data or []
    if not rows:
        return [], "default"

    # Syllabus wins if any topic came from one: a parsed syllabus is a better
    # description of the course than ad-hoc user additions.
    source = "syllabus" if any(r["source"] == "syllabus" for r in rows) else "user"
    return [row["name"] for row in rows], source
