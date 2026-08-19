"""Question, group, cluster, topic, and analytics persistence.

Two rules govern every write here, and both exist to keep user data attached
across re-processing:

**Upsert on identity, never delete-then-insert.** Questions upsert on
``(paper_id, label_path, normalized_hash)`` and groups on
``(folder_id, normalized_hash)`` (D-011). A group's uuid therefore survives
re-analysis, which is what lets ``question_corrections`` and ``group_overrides``
reference rows by id without being orphaned every time a folder is re-analysed.
The previous implementation deleted and recreated groups on every run, which is
why its positional ids changed and why nothing could safely point at them.

**Stale rows are tombstoned, not deleted.** When a paper is re-extracted and no
longer produces a question it produced before — because the PDF was replaced, or
normalization changed — the old row is marked ``tombstoned`` rather than removed.
A hard delete would cascade to that question's corrections, silently destroying
work a student did. Tombstoned rows are excluded from analysis but remain
recoverable.

Every query is scoped by ``user_id``: this connection bypasses RLS, so the
scoping RLS would have done has to be explicit.
"""

from backend.db.client import get_client


def replace_paper_questions(
    paper_id: str, folder_id: str, user_id: str, questions: list[dict]
) -> list[dict]:
    """Persist a paper's extracted questions, preserving identity.

    Args:
        questions: Dicts with ``label_path``, ``text_extracted``,
            ``text_normalized``, ``normalized_hash``, ``normalizer_version``, and
            optionally ``question_label``, ``marks``, ``section``, ``page_number``,
            ``question_type``, ``difficulty``, ``confidence``, ``status``,
            ``reject_reason``.

    Returns:
        The stored rows, including their ids.
    """
    client = get_client()

    if not questions:
        _tombstone_missing(paper_id, user_id, keep_hashes=set())
        return []

    rows = [
        {
            "paper_id": paper_id,
            "folder_id": folder_id,
            "user_id": user_id,
            "question_label": question.get("question_label"),
            "label_path": question["label_path"],
            "text_extracted": question["text_extracted"],
            "text_normalized": question["text_normalized"],
            "normalized_hash": question["normalized_hash"],
            "normalizer_version": question["normalizer_version"],
            "marks": question.get("marks"),
            "section": question.get("section"),
            "page_number": question.get("page_number"),
            "question_type": question.get("question_type"),
            "difficulty": question.get("difficulty"),
            "confidence": question.get("confidence"),
            "status": question.get("status", "accepted"),
            "reject_reason": question.get("reject_reason"),
        }
        for question in questions
    ]

    response = (
        client.table("questions")
        .upsert(rows, on_conflict="paper_id,label_path,normalized_hash")
        .execute()
    )
    stored = response.data or []

    # Anything this paper used to produce but no longer does.
    _tombstone_missing(
        paper_id,
        user_id,
        keep_hashes={
            (row["label_path"], row["normalized_hash"]) for row in rows
        },
    )

    return stored


def _tombstone_missing(
    paper_id: str, user_id: str, keep_hashes: set[tuple[str, str]]
) -> None:
    """Mark rows that re-extraction no longer produces as tombstoned.

    Not deleted: deleting would cascade to the question's corrections and destroy
    a student's work. See the module docstring.
    """
    client = get_client()
    response = (
        client.table("questions")
        .select("id, label_path, normalized_hash, status")
        .eq("paper_id", paper_id)
        .eq("user_id", user_id)
        .execute()
    )

    stale_ids = [
        row["id"]
        for row in response.data or []
        if (row["label_path"], row["normalized_hash"]) not in keep_hashes
        and row["status"] != "tombstoned"
    ]

    for stale_id in stale_ids:
        (
            client.table("questions")
            .update({"status": "tombstoned"})
            .eq("id", stale_id)
            .eq("user_id", user_id)
            .execute()
        )


def list_folder_questions(folder_id: str, user_id: str) -> list[dict]:
    """Return every non-tombstoned question in a folder, with its paper's year.

    The year comes from the paper rather than the question, since a question has
    no year of its own — it inherits the year of the paper it appeared in, which
    is what makes cross-year repetition measurable.
    """
    client = get_client()

    papers_response = (
        client.table("papers")
        .select("id, year")
        .eq("folder_id", folder_id)
        .eq("user_id", user_id)
        .execute()
    )
    year_by_paper = {
        paper["id"]: paper.get("year") for paper in papers_response.data or []
    }

    response = (
        client.table("questions")
        .select(
            "id, paper_id, label_path, text_extracted, text_normalized, "
            "normalized_hash, marks, section, page_number, question_type, "
            "difficulty, confidence, status"
        )
        .eq("folder_id", folder_id)
        .eq("user_id", user_id)
        .neq("status", "tombstoned")
        .execute()
    )

    questions = response.data or []
    for question in questions:
        question["year"] = year_by_paper.get(question["paper_id"])
    return questions


def upsert_groups(folder_id: str, user_id: str, groups: list[dict]) -> dict[str, str]:
    """Upsert question groups on their identity key.

    Returns:
        ``normalized_hash`` -> group uuid, so callers can link questions and
        cluster members without a second query.
    """
    if not groups:
        return {}

    response = (
        get_client()
        .table("question_groups")
        .upsert(
            [{**group, "folder_id": folder_id, "user_id": user_id} for group in groups],
            on_conflict="folder_id,normalized_hash",
        )
        .execute()
    )

    return {row["normalized_hash"]: row["id"] for row in response.data or []}


def link_questions_to_groups(
    user_id: str, group_id_by_hash: dict[str, str], questions: list[dict]
) -> None:
    """Point each question at the group its content hash belongs to.

    Grouped by target so this issues one update per group rather than one per
    question — a folder with hundreds of questions would otherwise mean hundreds
    of round trips.
    """
    client = get_client()

    ids_by_group: dict[str, list[str]] = {}
    for question in questions:
        group_id = group_id_by_hash.get(question.get("normalized_hash"))
        if group_id and question.get("id"):
            ids_by_group.setdefault(group_id, []).append(question["id"])

    for group_id, question_ids in ids_by_group.items():
        (
            client.table("questions")
            .update({"group_id": group_id})
            .in_("id", question_ids)
            .eq("user_id", user_id)
            .execute()
        )


def replace_clusters(
    folder_id: str, user_id: str, clusters: list[dict], group_id_by_hash: dict[str, str]
) -> None:
    """Replace a folder's advisory similarity clusters (D-024).

    Delete-then-insert is correct here, unlike for groups: clusters are pure
    advisory output that nothing references by id, so recreating them cannot
    orphan a correction. That is the point of keeping fuzzy results in a separate
    table — the threshold can be retuned and the clusters rebuilt without touching
    identity.

    Args:
        clusters: Dicts with ``seed_hash``, ``members`` (``(hash, score)`` pairs),
            ``threshold`` and ``method``.
    """
    client = get_client()

    (
        client.table("similarity_clusters")
        .delete()
        .eq("folder_id", folder_id)
        .eq("user_id", user_id)
        .execute()
    )

    for cluster in clusters:
        # A cluster of one carries no information: every group not similar to
        # anything would otherwise get a row saying so.
        if len(cluster["members"]) < 2:
            continue

        representative = group_id_by_hash.get(cluster["seed_hash"])
        inserted = (
            client.table("similarity_clusters")
            .insert(
                {
                    "folder_id": folder_id,
                    "user_id": user_id,
                    "representative_group_id": representative,
                    "method": cluster["method"],
                    "threshold": cluster["threshold"],
                    "group_count": len(cluster["members"]),
                }
            )
            .execute()
        )

        rows = inserted.data or []
        if not rows:
            continue
        cluster_id = rows[0]["id"]

        members = [
            {
                "cluster_id": cluster_id,
                "group_id": group_id_by_hash[member_hash],
                "user_id": user_id,
                "score": score,
                "is_seed": member_hash == cluster["seed_hash"],
            }
            for member_hash, score in cluster["members"]
            if member_hash in group_id_by_hash
        ]
        if members:
            client.table("cluster_members").insert(members).execute()


def upsert_topics(folder_id: str, user_id: str, topics: list[dict]) -> dict[str, str]:
    """Upsert a folder's topics on ``(folder_id, name)``.

    Upserted rather than replaced so a topic's uuid survives, keeping
    ``question_groups.topic_id`` valid across re-analysis.

    Returns:
        Topic name -> topic uuid.
    """
    if not topics:
        return {}

    response = (
        get_client()
        .table("topics")
        .upsert(
            [{**topic, "folder_id": folder_id, "user_id": user_id} for topic in topics],
            on_conflict="folder_id,name",
        )
        .execute()
    )

    return {row["name"]: row["id"] for row in response.data or []}


def assign_group_topics(
    user_id: str, topic_id_by_group_id: dict[str, str | None]
) -> None:
    """Set each group's topic, batched by topic to limit round trips."""
    client = get_client()

    groups_by_topic: dict[str, list[str]] = {}
    for group_id, topic_id in topic_id_by_group_id.items():
        if topic_id:
            groups_by_topic.setdefault(topic_id, []).append(group_id)

    for topic_id, group_ids in groups_by_topic.items():
        (
            client.table("question_groups")
            .update({"topic_id": topic_id})
            .in_("id", group_ids)
            .eq("user_id", user_id)
            .execute()
        )


def save_analytics(
    folder_id: str,
    user_id: str,
    fingerprint: str,
    reference_year: int | None,
    algo_version: int,
    payload: dict,
) -> None:
    """Write the cached analytics row for a folder (D-014).

    Upserted on ``folder_id``, which is the table's primary key: D-010 requires no
    multi-run history, so a recompute replaces the previous result.
    """
    (
        get_client()
        .table("folder_analytics")
        .upsert(
            {
                "folder_id": folder_id,
                "user_id": user_id,
                "fingerprint": fingerprint,
                "reference_year": reference_year,
                "algo_version": algo_version,
                "payload": payload,
            },
            on_conflict="folder_id",
        )
        .execute()
    )


def cached_analytics_fingerprint(folder_id: str, user_id: str) -> str | None:
    """Return the fingerprint of the cached analytics, or None if uncached.

    The worker compares this against a freshly computed fingerprint to decide
    whether recomputation is needed at all (D-014).
    """
    response = (
        get_client()
        .table("folder_analytics")
        .select("fingerprint")
        .eq("folder_id", folder_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0]["fingerprint"] if rows else None


def correction_ids(folder_id: str, user_id: str) -> list[str]:
    """Return every correction id in a folder, for the analytics fingerprint.

    Corrections change marks and topic assignments, so a new correction must
    invalidate the cache (D-012, D-014).
    """
    response = (
        get_client()
        .table("question_corrections")
        .select("id")
        .eq("folder_id", folder_id)
        .eq("user_id", user_id)
        .execute()
    )
    return [row["id"] for row in response.data or []]
