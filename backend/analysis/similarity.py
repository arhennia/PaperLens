"""Advisory similarity clustering over question groups.

**Nothing here decides identity.** Identity is the exact content hash
(:mod:`backend.analysis.dedup`). This module finds groups that are *similar but
not identical* — the same concept asked in slightly different words across years —
so the UI can show "3 similar variations" and the priority score can be nudged
slightly. That distinction is the whole point of D-024: fuzzy output is stored
with its score and threshold in ``similarity_clusters`` / ``cluster_members``, so
the threshold can be retuned, or the method swapped for embeddings, without
detaching a single user correction or share link.

The threshold is **not validated**. 0.84 was an untested constant in the previous
implementation and is retained only as a starting point. Known failure modes,
stated rather than assumed away:

* *False positives.* ``token_set_ratio`` ignores word order, so "Compare FCFS and
  SJF" and "Compare SJF and FCFS" score ~100 — usually right, but two short
  questions sharing three tokens can also exceed 0.84 while asking different
  things.
* *False negatives.* It is lexical, with no notion of meaning: "Explain
  thrashing" and "What causes excessive page swapping" score far below 0.84. This
  is the likelier failure and the harder one to notice, since a genuinely
  repeated topic just appears less important than it is.

Determinism was broken here before. ``run_clustering`` seeded greedily via
``unclustered.pop(0)`` over an unordered query result, so cluster membership —
and therefore the ``cluster`` scoring factor, and therefore every priority score
— could differ between two runs over identical data. Seeds are now taken in sorted
order (D-014).

Cost ceiling: clustering is a greedy single pass, O(n²) in the number of groups.
Fine for a folder holding a few hundred questions; if folders grow to thousands, a
blocking index on shared tokens would cut the comparisons without changing the
output. Greedy clustering is also not transitive — A~B and B~C does not give A~C —
which is another reason it stays advisory.
"""

from dataclasses import dataclass, field

from backend.config import SIMILARITY_THRESHOLD


@dataclass
class Cluster:
    """A seed group plus the groups found similar to it.

    Attributes:
        seed_hash: ``normalized_hash`` of the seed group.
        members: ``(normalized_hash, score)`` pairs, seed first with score 1.0.
        threshold: The threshold used, stored so a later change is detectable.
        method: Identifies the algorithm that produced these scores.
    """

    seed_hash: str
    members: list[tuple[str, float]] = field(default_factory=list)
    threshold: float = SIMILARITY_THRESHOLD
    method: str = "rapidfuzz_token_set_ratio"

    @property
    def size(self) -> int:
        return len(self.members)


@dataclass
class ClusteringResult:
    """Clusters, plus whether clustering actually ran.

    ``available`` exists so a missing similarity backend is *recorded* rather
    than silently producing zero clusters. Silent degradation presented as a
    result is the class of defect this rebuild exists to remove: an empty cluster
    list and "we could not compute clusters" must not look the same.
    """

    clusters: list[Cluster] = field(default_factory=list)
    available: bool = True
    note: str | None = None


def _load_scorer():
    """Return a ``(text_a, text_b) -> float`` scorer in 0.0-1.0, or None.

    RapidFuzz is imported lazily. It is an optional dependency in practice:
    similarity is advisory, so the pipeline must still produce correct repeat
    counts, weightage and priority scores on a machine without it.
    """
    try:
        from rapidfuzz import fuzz  # noqa: PLC0415 -- optional, see docstring
    except ImportError:
        return None

    def score(text_a: str, text_b: str) -> float:
        if not text_a or not text_b:
            return 0.0
        return fuzz.token_set_ratio(text_a, text_b) / 100.0

    return score


def cluster_groups(
    groups: list[dict],
    threshold: float = SIMILARITY_THRESHOLD,
    scorer=None,
) -> ClusteringResult:
    """Cluster question groups by textual similarity.

    Args:
        groups: Dicts with ``normalized_hash`` and ``canonical_text``.
        threshold: Minimum score to join a cluster. Stored with the result.
        scorer: Optional ``(a, b) -> float`` override, used by tests to make
            similarity deterministic without depending on RapidFuzz's tuning.

    Returns:
        A :class:`ClusteringResult`. Every group appears in exactly one cluster;
        a group similar to nothing forms a cluster of one.

    >>> gs = [
    ...     {"normalized_hash": "h1", "canonical_text": "explain paging in virtual memory"},
    ...     {"normalized_hash": "h2", "canonical_text": "explain virtual memory paging"},
    ...     {"normalized_hash": "h3", "canonical_text": "describe raid levels"},
    ... ]
    >>> result = cluster_groups(gs, scorer=lambda a, b: 0.9 if "paging" in a and "paging" in b else 0.1)
    >>> sorted(len(c.members) for c in result.clusters)
    [1, 2]
    """
    compute = scorer or _load_scorer()
    if compute is None:
        return ClusteringResult(
            clusters=[],
            available=False,
            note=(
                "RapidFuzz is not installed, so advisory similarity clustering was "
                "skipped. Repeat counts, weightage and priority scores are "
                "unaffected: those come from exact hashing."
            ),
        )

    # Sorted by hash: seeding order determines cluster membership in a greedy
    # pass, so an unordered input would make results vary between runs (D-014).
    remaining = sorted(
        (
            (str(g["normalized_hash"]), str(g.get("canonical_text") or ""))
            for g in groups
            if g.get("normalized_hash")
        ),
        key=lambda pair: pair[0],
    )

    clusters: list[Cluster] = []
    while remaining:
        seed_hash, seed_text = remaining.pop(0)
        cluster = Cluster(seed_hash=seed_hash, members=[(seed_hash, 1.0)],
                          threshold=threshold)

        still_remaining: list[tuple[str, str]] = []
        for candidate_hash, candidate_text in remaining:
            score = compute(seed_text, candidate_text)
            if score >= threshold:
                cluster.members.append((candidate_hash, round(score, 4)))
            else:
                still_remaining.append((candidate_hash, candidate_text))

        remaining = still_remaining
        clusters.append(cluster)

    return ClusteringResult(clusters=clusters, available=True)


def cluster_sizes(result: ClusteringResult) -> dict[str, int]:
    """Map each group's hash to the size of the cluster containing it.

    Feeds the ``cluster`` scoring factor. Groups absent from the map — which is
    every group when RapidFuzz is unavailable — are treated as a cluster of one
    by the scorer, so the factor contributes its neutral minimum rather than
    breaking.
    """
    return {
        member_hash: cluster.size
        for cluster in result.clusters
        for member_hash, _ in cluster.members
    }
