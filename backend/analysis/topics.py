"""Keyword-based topic classification and syllabus coverage.

Deterministic and keyword-based on purpose. An LLM could classify topics more
flexibly, but the three core differentiators — repetition, weightage and coverage
— must not depend on a non-deterministic service that can be down, rate-limited,
or silently updated (D-014, D-023). An LLM may *suggest* topics for a user to
confirm; it never writes them.

Two changes from the previous implementation:

* **The Operating-Systems fallback is explicit.** Topic keywords used to fall back
  to hardcoded OS chapters (``Process Management``, ``CPU Scheduling``,
  ``Deadlocks``, ...) whenever no chapters were supplied, so a Chemistry folder
  was silently classified into OS topics. Defaults now carry
  ``source = 'default'`` and are exposed as such (D-028), so the UI can say "these
  are generic defaults, upload your syllabus for real topics".
* **Classification is deterministic.** Ties break on topic ordinal rather than
  dict-iteration order.
"""

import re
from dataclasses import dataclass, field

# Sub-terms that expand a chapter title into useful keywords. A syllabus says
# "Memory Management"; the exam says "thrashing" and "page fault", so matching
# titles alone would classify almost nothing.
#
# Keyed on a word in the chapter title. Deliberately computer-science-centric,
# which is a known limitation: for other subjects the topic names still match
# directly, just with less recall. Extending this is how another subject gets
# first-class support.
KEYWORD_EXPANSIONS: dict[str, tuple[str, ...]] = {
    "scheduling": (
        "quantum", "priority", "round robin", "fcfs", "sjf", "srtf", "scheduler",
        "turnaround", "burst time",
    ),
    "deadlock": (
        "avoidance", "banker", "prevention", "semaphore", "safe state",
        "resource allocation", "circular wait",
    ),
    "memory": (
        "paging", "segmentation", "thrashing", "virtual memory", "page fault",
        "replacement", "fragmentation", "tlb", "frame",
    ),
    "process": (
        "thread", "semaphore", "mutex", "critical section", "synchronization",
        "ipc", "concurrency", "fork", "context switch",
    ),
    "file": (
        "inode", "directory", "disk", "raid", "allocation", "sector",
        "access control", "journaling",
    ),
    "transaction": ("acid", "commit", "rollback", "serializable", "isolation"),
    "index": ("b+ tree", "b tree", "hashing", "clustered", "secondary index"),
    "normalization": ("1nf", "2nf", "3nf", "bcnf", "functional dependency"),
    "network": ("tcp", "udp", "ip", "routing", "congestion", "packet", "subnet"),
}

# Used only when a folder has no syllabus and no user-defined topics. Recorded as
# source='default' so their provenance is visible rather than looking authoritative.
DEFAULT_TOPICS: tuple[str, ...] = (
    "Process Management",
    "CPU Scheduling",
    "Deadlocks",
    "Memory Management",
    "File Systems & Storage",
    "General & Intro",
)


@dataclass
class Topic:
    """One topic and the keywords that classify questions into it.

    Attributes:
        name: Display name, as written in the syllabus.
        ordinal: Position, used for stable ordering and deterministic tiebreaks.
        keywords: Lowercase terms matched against question text.
        source: ``syllabus``, ``user`` or ``default`` — where this topic came
            from, so generic defaults are never presented as a real syllabus.
    """

    name: str
    ordinal: int
    keywords: list[str] = field(default_factory=list)
    source: str = "default"


def build_topics(chapter_names: list[str] | None, source: str = "syllabus") -> list[Topic]:
    """Build topics from chapter names, falling back to generic defaults.

    Args:
        chapter_names: Chapter titles from a syllabus or the user. Empty or None
            selects :data:`DEFAULT_TOPICS`.
        source: Provenance for the supplied names. Ignored for the fallback,
            which is always ``default``.

    Returns:
        Topics with expanded keywords, in input order.
    """
    names = [name.strip() for name in (chapter_names or []) if name and name.strip()]
    effective_source = source
    if not names:
        names = list(DEFAULT_TOPICS)
        effective_source = "default"

    return [
        Topic(
            name=name,
            ordinal=index + 1,
            keywords=_keywords_for(name),
            source=effective_source,
        )
        for index, name in enumerate(names)
    ]


def _keywords_for(chapter_name: str) -> list[str]:
    """Derive match keywords from a chapter title.

    Words of three or more characters from the title, plus any expansions
    triggered by those words. Sorted and deduplicated so the stored keyword list
    is identical between runs.
    """
    lowered = chapter_name.lower()
    keywords = set(re.findall(r"\b\w{3,}\b", lowered))

    for trigger, expansions in KEYWORD_EXPANSIONS.items():
        if trigger in lowered:
            keywords.update(expansions)

    return sorted(keywords)


def classify_group(text: str, topics: list[Topic]) -> Topic | None:
    """Assign one question to its best-matching topic.

    Scores each topic by how many of its keywords appear in the text and takes
    the highest. Ties break on the lower ordinal, so the result does not depend
    on iteration order.

    Falls back to exact topic-name matching, then to the last topic — which in the
    default set is "General & Intro", the intended catch-all. Returns None only
    when there are no topics at all.
    """
    if not topics:
        return None

    lowered = (text or "").lower()

    best: Topic | None = None
    best_score = 0
    for topic in sorted(topics, key=lambda t: t.ordinal):
        score = sum(1 for keyword in topic.keywords if keyword in lowered)
        # Strict `>` with ascending ordinal means the earliest topic wins a tie.
        if score > best_score:
            best_score = score
            best = topic

    if best is not None:
        return best

    for topic in sorted(topics, key=lambda t: t.ordinal):
        if topic.name.lower() in lowered:
            return topic

    return sorted(topics, key=lambda t: t.ordinal)[-1]


def coverage_gaps(
    topics: list[Topic], question_counts: dict[str, int]
) -> list[dict]:
    """Compare syllabus topics against what the exams actually asked.

    This is differentiator #3: a topic in the syllabus with no exam questions is
    a genuine gap a student should know about, and it is exactly what a stack of
    past papers cannot show on its own.

    Args:
        topics: The folder's topics.
        question_counts: Topic name -> number of question groups classified into it.

    Returns:
        One dict per topic, in ordinal order, with ``is_gap`` set when the count
        is zero.
    """
    return [
        {
            "topic_name": topic.name,
            "question_count": question_counts.get(topic.name, 0),
            "is_gap": question_counts.get(topic.name, 0) == 0,
            "source": topic.source,
        }
        for topic in sorted(topics, key=lambda t: t.ordinal)
    ]
