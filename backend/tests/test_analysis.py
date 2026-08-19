"""Tests for deduplication, clustering, topics, scoring, and analytics.

The determinism tests are the point of this file. AGENTS.md names deterministic
cached analytics as differentiator #1, and the previous implementation failed it
in two independent ways — one of which the audit missed:

1. ``datetime.now().year`` drove recency, so the same papers scored differently in
   different calendar years (AUDIT.md 4.8).
2. Clustering seeded greedily off an unordered result set, so cluster membership —
   and therefore every priority score — could differ between two runs over
   identical data.

Fixing only the first would have produced a convincing but false claim of
determinism, so :class:`TestDeterminism` checks both: identical inputs give
byte-identical output, and *shuffled* inputs give the same output too.
"""

import json
import random

from backend.analysis.analytics import compute_analytics, compute_fingerprint
from backend.analysis.dedup import group_questions
from backend.analysis.scoring import score_groups
from backend.analysis.similarity import cluster_groups, cluster_sizes
from backend.analysis.tagging import classify_difficulty, classify_type
from backend.analysis.topics import build_topics, classify_group, coverage_gaps


def question(qid: str, digest: str, text: str, year: int, marks=10, page=1, **extra):
    """Build a question row for the analysis functions."""
    return {
        "id": qid,
        "normalized_hash": digest,
        "text_extracted": text,
        "year": year,
        "marks": marks,
        "page_number": page,
        "status": "accepted",
        **extra,
    }


def group_to_dict(group) -> dict:
    """Convert a QuestionGroup into the dict the scorer takes."""
    return {
        "normalized_hash": group.normalized_hash,
        "canonical_text": group.canonical_text,
        "occurrence_count": group.occurrence_count,
        "distinct_years": group.distinct_years,
        "years": group.years,
        "avg_marks": group.avg_marks,
        "max_marks": group.max_marks,
        "first_year": group.first_year,
        "last_year": group.last_year,
        "year_span": group.year_span,
    }


class TestExactDeduplication:
    """Exact hashing is authoritative and drives repeat counts (D-011, D-024)."""

    def test_identical_questions_across_years_form_one_group(self):
        questions = [
            question("1", "h_paging", "Explain paging", 2022),
            question("2", "h_paging", "Explain paging.", 2023),
            question("3", "h_paging", "Explain paging in virtual memory", 2024),
            question("4", "h_acid", "Explain ACID", 2024),
        ]
        groups = group_questions(questions)

        assert len(groups) == 2
        paging = next(g for g in groups if g.normalized_hash == "h_paging")
        assert paging.occurrence_count == 3
        assert paging.distinct_years == 3
        assert paging.years == [2022, 2023, 2024]
        assert paging.first_year == 2022
        assert paging.last_year == 2024
        assert paging.year_span == 2

    def test_canonical_text_is_the_longest_occurrence(self):
        groups = group_questions(
            [
                question("1", "h", "Explain paging", 2023),
                question("2", "h", "Explain paging in virtual memory systems", 2024),
            ]
        )
        assert groups[0].canonical_text == "Explain paging in virtual memory systems"

    def test_canonical_text_tie_breaks_deterministically(self):
        """Equal-length texts must not depend on input order.

        ``max(key=len)`` alone returns whichever came first, so two runs over the
        same rows in different orders could store different canonical text.
        """
        a = question("1", "h", "Explain aaa", 2023)
        b = question("2", "h", "Explain bbb", 2024)
        assert group_questions([a, b])[0].canonical_text == group_questions([b, a])[0].canonical_text

    def test_rejected_questions_do_not_inflate_repeat_counts(self):
        """Rejected rows are kept for review but must not count (D-025)."""
        groups = group_questions(
            [
                question("1", "h", "Explain paging", 2023),
                question("2", "h", "Explain paging", 2024, status="rejected"),
            ]
        )
        assert len(groups) == 1
        assert groups[0].occurrence_count == 1

    def test_marks_and_pages_are_aggregated(self):
        groups = group_questions(
            [
                question("1", "h", "Explain paging", 2023, marks=10, page=2),
                question("2", "h", "Explain paging", 2024, marks=20, page=5),
            ]
        )
        assert groups[0].avg_marks == 15.0
        assert groups[0].max_marks == 20.0
        assert groups[0].page_numbers == [2, 5]

    def test_low_confidence_propagates_to_the_group(self):
        """So the UI can flag a group whose source page was read unreliably (D-013)."""
        groups = group_questions(
            [
                question("1", "h", "Explain paging", 2023),
                question("2", "h", "Explain paging", 2024, low_confidence=True),
            ]
        )
        assert groups[0].has_low_confidence

    def test_group_order_is_independent_of_input_order(self):
        questions = [
            question(str(i), f"h{i}", f"Question {i}", 2020 + i) for i in range(10)
        ]
        shuffled = questions[:]
        random.Random(1).shuffle(shuffled)

        assert [g.normalized_hash for g in group_questions(questions)] == [
            g.normalized_hash for g in group_questions(shuffled)
        ]


class TestAdvisorySimilarity:
    """Clustering may group and badge; it must never merge identities (D-024)."""

    def test_similar_groups_cluster_together(self):
        groups = [
            {"normalized_hash": "h1", "canonical_text": "explain paging in virtual memory"},
            {"normalized_hash": "h2", "canonical_text": "explain virtual memory paging"},
            {"normalized_hash": "h3", "canonical_text": "describe raid levels"},
        ]
        # Injected scorer so the test pins clustering behaviour rather than
        # RapidFuzz's tuning.
        result = cluster_groups(
            groups,
            threshold=0.84,
            scorer=lambda a, b: 0.95 if ("paging" in a and "paging" in b) else 0.10,
        )

        assert sorted(len(c.members) for c in result.clusters) == [1, 2]

    def test_clustering_does_not_change_group_identity(self):
        """The load-bearing D-024 assertion.

        Clustering must leave every hash intact and account for each exactly once:
        two groups in one cluster are still two groups.
        """
        groups = [
            {"normalized_hash": "h1", "canonical_text": "explain paging"},
            {"normalized_hash": "h2", "canonical_text": "explain paging please"},
        ]
        result = cluster_groups(groups, scorer=lambda a, b: 1.0)

        clustered = [h for c in result.clusters for h, _ in c.members]
        assert sorted(clustered) == ["h1", "h2"]

    def test_threshold_is_stored_with_the_result(self):
        """So a later threshold change is detectable after the fact (D-024)."""
        result = cluster_groups(
            [{"normalized_hash": "h1", "canonical_text": "x"}],
            threshold=0.91,
            scorer=lambda a, b: 0.0,
        )
        assert result.clusters[0].threshold == 0.91

    def test_cluster_membership_is_order_independent(self):
        """The fixed non-determinism: seeding used to depend on row order."""
        groups = [
            {"normalized_hash": f"h{i}", "canonical_text": f"question {i % 3}"}
            for i in range(9)
        ]
        scorer = lambda a, b: 1.0 if a == b else 0.0  # noqa: E731

        forward = cluster_groups(groups, scorer=scorer)
        shuffled = groups[:]
        random.Random(7).shuffle(shuffled)
        backward = cluster_groups(shuffled, scorer=scorer)

        def signature(result):
            return sorted(tuple(sorted(h for h, _ in c.members)) for c in result.clusters)

        assert signature(forward) == signature(backward)

    def test_missing_rapidfuzz_is_reported_not_silent(self):
        """An unavailable backend must be distinguishable from "no clusters".

        Silent degradation presented as a result is the class of defect this
        rebuild removes.
        """
        result = cluster_groups(
            [{"normalized_hash": "h1", "canonical_text": "x"}], scorer=None
        )
        if not result.available:
            assert result.note and "RapidFuzz" in result.note
            assert result.clusters == []

    def test_cluster_sizes_maps_every_member(self):
        result = cluster_groups(
            [
                {"normalized_hash": "h1", "canonical_text": "same"},
                {"normalized_hash": "h2", "canonical_text": "same"},
            ],
            scorer=lambda a, b: 1.0,
        )
        assert cluster_sizes(result) == {"h1": 2, "h2": 2}


class TestScoring:
    """Six-factor priority scoring, measured against a stored reference year."""

    def test_recency_uses_the_reference_year_not_the_clock(self):
        """The AUDIT.md 4.8 regression.

        A 2020 question scored against 2020 is current; against 2025 it has decayed
        five years' worth. Neither answer may depend on today's date.
        """
        groups = [group_to_dict(g) for g in group_questions(
            [question("1", "h", "Explain paging", 2020)]
        )]

        current = score_groups(groups, reference_year=2020, total_years=1)
        stale = score_groups(groups, reference_year=2025, total_years=1)

        assert current[0]["factors"]["recency"] == 100.0
        assert stale[0]["factors"]["recency"] == 0.0
        assert current[0]["priority_score"] > stale[0]["priority_score"]

    def test_reference_year_is_recorded_on_every_scored_group(self):
        """So a score can always be explained and reproduced (D-014)."""
        groups = [group_to_dict(g) for g in group_questions(
            [question("1", "h", "Explain paging", 2023)]
        )]
        assert score_groups(groups, reference_year=2024, total_years=1)[0][
            "reference_year"
        ] == 2024

    def test_missing_reference_year_falls_back_to_neutral(self):
        """Never reads the clock, even when the reference year is unset."""
        groups = [group_to_dict(g) for g in group_questions(
            [question("1", "h", "Explain paging", 2023)]
        )]
        scored = score_groups(groups, reference_year=None, total_years=1)
        assert scored[0]["factors"]["recency"] == 50.0

    def test_frequent_questions_outrank_rare_ones(self):
        questions = [
            question("1", "h_freq", "Explain paging", 2022),
            question("2", "h_freq", "Explain paging", 2023),
            question("3", "h_freq", "Explain paging", 2024),
            question("4", "h_rare", "Explain RAID", 2022),
        ]
        groups = [group_to_dict(g) for g in group_questions(questions)]
        scored = score_groups(groups, reference_year=2024, total_years=3)

        by_hash = {g["normalized_hash"]: g for g in scored}
        assert by_hash["h_freq"]["priority_score"] > by_hash["h_rare"]["priority_score"]
        # Descending score order, so the top of the list is what to study first.
        assert scored[0]["normalized_hash"] == "h_freq"

    def test_all_six_factors_are_recorded(self):
        groups = [group_to_dict(g) for g in group_questions(
            [question("1", "h", "Explain paging", 2023)]
        )]
        factors = score_groups(groups, reference_year=2023, total_years=1)[0]["factors"]
        assert set(factors) == {
            "frequency", "recency", "marks", "spread", "cluster", "chapter"
        }

    def test_priority_levels_are_assigned(self):
        groups = [group_to_dict(g) for g in group_questions(
            [question("1", "h", "Explain paging", 2024, marks=20)]
        )]
        scored = score_groups(groups, reference_year=2024, total_years=1)
        assert scored[0]["priority_level"] in {
            "critical", "very_high", "high", "medium", "low"
        }

    def test_reason_mentions_similar_variations_not_sameness(self):
        """Advisory similarity must never be phrased as identity (D-024)."""
        groups = [group_to_dict(g) for g in group_questions(
            [question("1", "h", "Explain paging", 2024)]
        )]
        scored = score_groups(
            groups, reference_year=2024, total_years=1, cluster_sizes={"h": 3}
        )
        reason = scored[0]["priority_reason"]
        assert "similar variations" in reason

    def test_empty_input_is_safe(self):
        assert score_groups([], reference_year=2024, total_years=1) == []


class TestDeterminism:
    """Byte-identical results across runs and across input orderings (D-014)."""

    QUESTIONS = [
        question("1", "h_paging", "Explain paging in virtual memory", 2022, marks=10, page=1),
        question("2", "h_paging", "Explain paging", 2023, marks=10, page=3),
        question("3", "h_acid", "Explain ACID properties", 2023, marks=15, page=2),
        question("4", "h_raid", "Describe RAID levels", 2024, marks=5, page=4),
        question("5", "h_acid", "Explain ACID", 2024, marks=15, page=1),
        question("6", "h_sched", "Compare FCFS and SJF scheduling", 2024, marks=20, page=2),
    ]

    def _run(self, questions):
        groups = [group_to_dict(g) for g in group_questions(questions)]
        clustering = cluster_groups(groups, scorer=lambda a, b: 0.0)
        scored = score_groups(
            groups,
            reference_year=2024,
            total_years=3,
            cluster_sizes=cluster_sizes(clustering),
        )
        return compute_analytics(
            scored_groups=scored,
            total_papers=3,
            total_questions=len(questions),
            topic_names_by_hash={g["normalized_hash"]: "Memory" for g in scored},
        )

    def test_identical_input_gives_byte_identical_output(self):
        first = json.dumps(self._run(self.QUESTIONS), sort_keys=True)
        second = json.dumps(self._run(self.QUESTIONS), sort_keys=True)
        assert first == second

    def test_shuffled_input_gives_byte_identical_output(self):
        """Postgres does not guarantee row order, so this must hold.

        This is the assertion that would have failed before the sorted-seed and
        tie-break fixes.
        """
        baseline = json.dumps(self._run(self.QUESTIONS), sort_keys=True)

        for seed in range(5):
            shuffled = self.QUESTIONS[:]
            random.Random(seed).shuffle(shuffled)
            assert json.dumps(self._run(shuffled), sort_keys=True) == baseline, (
                f"analytics changed when input was shuffled with seed {seed}"
            )

    def test_scores_are_stable_across_runs(self):
        groups = [group_to_dict(g) for g in group_questions(self.QUESTIONS)]
        first = score_groups(groups, reference_year=2024, total_years=3)
        second = score_groups(groups, reference_year=2024, total_years=3)
        assert [g["priority_score"] for g in first] == [
            g["priority_score"] for g in second
        ]


class TestAnalyticsFingerprint:
    """Content-addressed cache invalidation (D-014)."""

    def test_same_inputs_give_the_same_fingerprint(self):
        assert compute_fingerprint(["h1", "h2"], ["c1"], 2025) == compute_fingerprint(
            ["h1", "h2"], ["c1"], 2025
        )

    def test_paper_order_does_not_matter(self):
        """Otherwise an unordered query would miss the cache on every run."""
        assert compute_fingerprint(["h1", "h2"], [], 2025) == compute_fingerprint(
            ["h2", "h1"], [], 2025
        )

    def test_a_new_paper_changes_the_fingerprint(self):
        assert compute_fingerprint(["h1"], [], 2025) != compute_fingerprint(
            ["h1", "h2"], [], 2025
        )

    def test_a_new_correction_changes_the_fingerprint(self):
        """Corrections change marks and topics, so they must invalidate (D-012)."""
        assert compute_fingerprint(["h1"], [], 2025) != compute_fingerprint(
            ["h1"], ["c1"], 2025
        )

    def test_reference_year_change_invalidates(self):
        assert compute_fingerprint(["h1"], [], 2024) != compute_fingerprint(
            ["h1"], [], 2025
        )

    def test_algo_version_change_invalidates_every_cache_row(self):
        """A schema or scoring change invalidates automatically (D-026)."""
        assert compute_fingerprint(["h1"], [], 2025, algo_version=1) != (
            compute_fingerprint(["h1"], [], 2025, algo_version=2)
        )

    def test_normalizer_version_change_invalidates(self):
        assert compute_fingerprint(["h1"], [], 2025, normalizer_version=1) != (
            compute_fingerprint(["h1"], [], 2025, normalizer_version=2)
        )

    def test_similarity_threshold_change_invalidates(self):
        """Retuning the threshold changes cluster counts, which feed scores."""
        assert compute_fingerprint(["h1"], [], 2025, similarity_threshold=0.84) != (
            compute_fingerprint(["h1"], [], 2025, similarity_threshold=0.90)
        )


class TestAnalyticsPayload:
    def test_repeat_rate_and_totals(self):
        questions = [
            question("1", "h_a", "Explain paging", 2023),
            question("2", "h_a", "Explain paging", 2024),
            question("3", "h_b", "Explain ACID", 2024),
        ]
        groups = [group_to_dict(g) for g in group_questions(questions)]
        scored = score_groups(groups, reference_year=2024, total_years=2)

        analytics = compute_analytics(
            scored_groups=scored,
            total_papers=2,
            total_questions=3,
            topic_names_by_hash={"h_a": "Memory", "h_b": "Transactions"},
        )

        assert analytics["total_questions"] == 3
        assert analytics["unique_questions"] == 2
        # 3 asked, 2 unique -> a third were repeats.
        assert analytics["repeat_rate_percentage"] == 33.3

    def test_topic_weights_use_marks_not_just_counts(self):
        """Marks weighting is what a student should revise by."""
        questions = [
            question("1", "h_heavy", "Explain paging", 2024, marks=20),
            question("2", "h_light", "Define RAM", 2024, marks=2),
        ]
        groups = [group_to_dict(g) for g in group_questions(questions)]
        scored = score_groups(groups, reference_year=2024, total_years=1)

        analytics = compute_analytics(
            scored_groups=scored,
            total_papers=1,
            total_questions=2,
            topic_names_by_hash={"h_heavy": "Memory", "h_light": "Basics"},
        )

        weights = {w["topic_name"]: w for w in analytics["topic_weights"]}
        assert weights["Memory"]["marks_percentage"] > weights["Basics"]["marks_percentage"]
        # Equal question counts, so a count-based measure would call these equal.
        assert weights["Memory"]["question_count"] == weights["Basics"]["question_count"]

    def test_year_trends_count_every_occurrence(self):
        questions = [
            question("1", "h_a", "Explain paging", 2023),
            question("2", "h_a", "Explain paging", 2024),
            question("3", "h_b", "Explain ACID", 2024),
        ]
        groups = [group_to_dict(g) for g in group_questions(questions)]
        scored = score_groups(groups, reference_year=2024, total_years=2)

        analytics = compute_analytics(
            scored_groups=scored, total_papers=2, total_questions=3,
            topic_names_by_hash={},
        )
        assert analytics["year_trends"] == [
            {"year": 2023, "question_count": 1},
            {"year": 2024, "question_count": 2},
        ]

    def test_no_questions_is_safe(self):
        analytics = compute_analytics([], 0, 0, {})
        assert analytics["unique_questions"] == 0
        assert analytics["repeat_rate_percentage"] == 0.0


class TestTopics:
    def test_default_topics_are_marked_as_defaults(self):
        """The hidden OS fallback becomes visible provenance (D-028)."""
        topics = build_topics(None)
        assert topics
        assert all(topic.source == "default" for topic in topics)

    def test_syllabus_topics_keep_their_source(self):
        topics = build_topics(["Memory Management", "Deadlocks"], "syllabus")
        assert [t.name for t in topics] == ["Memory Management", "Deadlocks"]
        assert all(topic.source == "syllabus" for topic in topics)

    def test_keywords_expand_beyond_the_title(self):
        """A syllabus says "Memory Management"; the exam says "thrashing"."""
        topic = build_topics(["Memory Management"], "syllabus")[0]
        assert "thrashing" in topic.keywords
        assert "paging" in topic.keywords

    def test_classification_picks_the_best_match(self):
        topics = build_topics(["Memory Management", "CPU Scheduling"], "syllabus")
        assert classify_group("Explain thrashing and page faults", topics).name == (
            "Memory Management"
        )
        assert classify_group("Compare FCFS and SJF scheduling", topics).name == (
            "CPU Scheduling"
        )

    def test_classification_is_deterministic(self):
        topics = build_topics(["Memory Management", "CPU Scheduling"], "syllabus")
        text = "Explain how scheduling affects paging"
        assert len({classify_group(text, topics).name for _ in range(10)}) == 1

    def test_unmatched_text_falls_back_to_the_last_topic(self):
        topics = build_topics(["Memory Management", "General & Intro"], "syllabus")
        assert classify_group("Something entirely unrelated", topics).name == (
            "General & Intro"
        )

    def test_coverage_reports_gaps(self):
        """Differentiator #3: a syllabus topic no exam has asked about."""
        topics = build_topics(["Memory Management", "Deadlocks"], "syllabus")
        coverage = coverage_gaps(topics, {"Memory Management": 4})

        by_topic = {c["topic_name"]: c for c in coverage}
        assert by_topic["Memory Management"]["is_gap"] is False
        assert by_topic["Deadlocks"]["is_gap"] is True


class TestTagging:
    """Heuristic, deterministic, and user-correctable (D-012)."""

    def test_question_types(self):
        cases = [
            ("Derive the expression for average waiting time.", "derivation"),
            ("Calculate the number of page faults for the given string.", "numerical"),
            ("Draw the block diagram of a CPU.", "diagram"),
            ("Write short notes on thrashing.", "short_note"),
            ("Explain paging in virtual memory.", "descriptive"),
        ]
        for text, expected in cases:
            assert classify_type(text) == expected, text

    def test_type_falls_back_to_marks_when_no_keyword_matches(self):
        assert classify_type("Paging and segmentation", marks=2) == "short_note"
        assert classify_type("Paging and segmentation", marks=15) == "descriptive"

    def test_type_is_none_with_nothing_to_go_on(self):
        """An untagged question is honest; a wrongly tagged one is not."""
        assert classify_type("") is None
        assert classify_type("Paging and segmentation") is None

    def test_difficulty(self):
        assert classify_difficulty("Define RAM.", marks=2) == "easy"
        assert classify_difficulty(
            "Derive the page fault rate formula.", marks=15
        ) == "hard"
        assert classify_difficulty("Explain paging.", marks=6) in {"easy", "medium"}

    def test_tagging_is_deterministic(self):
        text = "Derive the formula and draw the resulting circuit."
        assert len({classify_type(text) for _ in range(10)}) == 1
        assert len({classify_difficulty(text, 10) for _ in range(10)}) == 1
