"""Tests for the hierarchical exam parser.

Two jobs here.

**Regression coverage for behaviour that was verified and must not break.** The
cases in :class:`TestTranscribedRegressionCases` come from the retired
``test_hybrid_direct.py``, which D-022 required transcribing before deletion. That
file printed its output and asserted nothing, so the behaviour it demonstrated was
only ever checked by eye; these are the same inputs with the expectations written
down.

**Proof that page numbers are real.** Every question used to be stored with
``page_number = 1`` regardless of where it came from (AUDIT.md 4.7) — a reference
that looked authoritative and was wrong. :class:`TestPageNumberPropagation` is the
executable check that it now reflects the actual page.
"""

from backend.extraction.normalize import format_page_marker
from backend.extraction.parser import (
    ExamParser,
    flatten_leaf_questions,
    get_marker_info,
    parse_questions,
    resolve_marker,
    SequenceTracker,
)
from backend.extraction.patterns import get_profile


def labels(questions: list[dict]) -> list[str]:
    return [question["label_path"] for question in questions]


class TestTranscribedRegressionCases:
    """The noisy-paper cases carried forward from the retired test suite."""

    def test_parses_the_messy_kiit_paper(self, kiit_exam_text):
        questions, sections, warnings = parse_questions(
            kiit_exam_text, get_profile("default")
        )

        # `1,` and `2,` are recognised despite the OCR comma; Q4 and Q5 despite
        # the colon. Q3 is genuinely absent from the fixture.
        assert labels(questions) == ["Q1", "Q2", "Q4", "Q5"]
        assert sections >= 2
        assert any("Missing question Q3" in warning for warning in warnings)

    def test_marks_are_extracted_including_ocr_damaged_forms(self, kiit_exam_text):
        questions, _, _ = parse_questions(kiit_exam_text, get_profile("default"))
        marks_by_label = {q["label_path"]: q["marks"] for q in questions}

        assert marks_by_label["Q1"] == 10   # (10 marks)
        assert marks_by_label["Q2"] == 10   # [1O M] -> letter O repaired to zero
        assert marks_by_label["Q4"] == 20   # [20]

    def test_subquestions_opening_on_the_parent_line_are_nested(self, kiit_exam_text):
        questions, _, _ = parse_questions(kiit_exam_text, get_profile("default"))
        q5 = next(q for q in questions if q["label_path"] == "Q5")

        assert labels(q5["subquestions"]) == ["Q5(a)", "Q5(b)"]
        assert q5["subquestions"][0]["marks"] == 10
        assert q5["subquestions"][1]["marks"] == 10

    def test_institutional_noise_is_absent_from_question_text(self, kiit_exam_text):
        questions, _, _ = parse_questions(kiit_exam_text, get_profile("default"))
        all_text = " ".join(
            q["text"] + " ".join(s["text"] for s in q["subquestions"])
            for q in questions
        )

        for noise in ("KALINGA", "Roll No", "BEST OF LUCK", "PaperLens", "CONFIDENTIAL"):
            assert noise not in all_text

    def test_sections_are_attached_to_questions(self, kiit_exam_text):
        questions, _, _ = parse_questions(kiit_exam_text, get_profile("default"))
        by_label = {q["label_path"]: q.get("section") for q in questions}

        assert "SECTION A" in (by_label["Q1"] or "")
        assert "SECTION B" in (by_label["Q4"] or "")


class TestPageNumberPropagation:
    """Real page numbers, the fix for AUDIT.md 4.7 (D-013)."""

    def test_questions_record_the_page_they_appear_on(self):
        document = "\n".join(
            [
                format_page_marker(1, "text"),
                "1. Explain paging.",
                format_page_marker(2, "text"),
                "2. Explain thrashing.",
                format_page_marker(5, "text"),
                "3. Explain segmentation.",
            ]
        )

        questions, _, _ = parse_questions(document, get_profile("generic"))
        pages = {q["label_path"]: q["page_number"] for q in questions}

        # The regression: all three used to be 1.
        assert pages == {"Q1": 1, "Q2": 2, "Q3": 5}

    def test_page_numbers_are_not_all_one(self):
        """Explicit guard against the old hardcoded value returning."""
        document = "\n".join(
            [
                format_page_marker(1, "text"),
                "1. First question about paging.",
                format_page_marker(2, "text"),
                "2. Second question about thrashing.",
            ]
        )
        questions, _, _ = parse_questions(document, get_profile("generic"))
        assert {q["page_number"] for q in questions} != {1}

    def test_subquestions_inherit_the_page_they_start_on(self):
        document = "\n".join(
            [
                format_page_marker(3, "text"),
                "1. Consider a paging system.",
                "(a) Explain the page table.",
                format_page_marker(4, "text"),
                "(b) Explain the TLB.",
            ]
        )

        questions, _, _ = parse_questions(document, get_profile("generic"))
        subs = {s["label_path"]: s["page_number"] for s in questions[0]["subquestions"]}

        # (b) is on page 4 even though its parent started on page 3.
        assert subs == {"Q1(a)": 3, "Q1(b)": 4}

    def test_extraction_method_is_carried_per_question(self):
        """A question from an OCR'd page must be identifiable as such (D-013)."""
        document = "\n".join(
            [
                format_page_marker(1, "text"),
                "1. Explain paging.",
                format_page_marker(2, "ocr"),
                "2. Explain thrashing.",
            ]
        )

        questions, _, _ = parse_questions(document, get_profile("generic"))
        methods = {q["label_path"]: q["page_method"] for q in questions}
        assert methods == {"Q1": "text", "Q2": "ocr"}

    def test_page_markers_never_become_questions(self):
        document = "\n".join(
            [format_page_marker(1, "text"), "1. Explain paging."]
        )
        questions, _, _ = parse_questions(document, get_profile("generic"))
        assert labels(questions) == ["Q1"]
        assert "Page" not in questions[0]["text"]


class TestHierarchy:
    """Three-level nesting and the roman/alphabetic ambiguity."""

    def test_three_levels_nest(self):
        document = "\n".join(
            [
                "1. Consider a system.",
                "(a) Explain scheduling.",
                "(i) Define quantum.",
                "(ii) Define burst time.",
                "(b) Explain deadlocks.",
            ]
        )
        questions, _, _ = parse_questions(document, get_profile("generic"))

        assert labels(questions[0]["subquestions"]) == ["Q1(a)", "Q1(b)"]
        assert labels(questions[0]["subquestions"][0]["subquestions"]) == [
            "Q1(a)(i)",
            "Q1(a)(ii)",
        ]

    def test_i_after_h_is_a_letter_not_roman_one(self):
        """The ambiguity resolution that makes long letter lists work.

        ``i`` is both roman 1 and the 9th letter. After ``(h)``, it continues the
        letter sequence — reading it as roman would restart the numbering and
        misnumber everything after it.
        """
        tracker = SequenceTracker("alpha_lower")
        for value, label in enumerate("abcdefgh", start=1):
            tracker.add(value, label)

        assert resolve_marker("i", tracker) == ("alpha_lower", 9)

    def test_i_with_no_letter_context_is_roman_one(self):
        assert resolve_marker("i", SequenceTracker()) == ("roman_lower", 1)

    def test_marker_classification(self):
        assert get_marker_info("3") == ("num", 3)
        assert get_marker_info("b") == ("alpha_lower", 2)
        assert get_marker_info("B") == ("alpha_upper", 2)
        assert get_marker_info("iv") == ("roman_lower", 4)
        assert get_marker_info("!") == (None, None)


class TestSequenceRepair:
    """Duplicate repair and gap reporting."""

    def test_duplicate_label_is_repaired_with_a_warning(self):
        # OCR read (c) as (b); (b) already exists.
        document = "\n".join(
            [
                "1. Consider a system.",
                "(a) Explain scheduling.",
                "(b) Explain deadlocks.",
                "(b) Explain memory management.",
            ]
        )
        questions, _, warnings = parse_questions(document, get_profile("generic"))

        assert labels(questions[0]["subquestions"]) == ["Q1(a)", "Q1(b)", "Q1(c)"]
        assert any("Corrected duplicate" in warning for warning in warnings)

    def test_missing_subquestion_is_reported_not_invented(self):
        document = "\n".join(
            ["1. Consider a system.", "(a) Explain scheduling.", "(c) Explain paging."]
        )
        questions, _, warnings = parse_questions(document, get_profile("generic"))

        assert any("Missing subquestion b" in warning for warning in warnings)
        # Reported, not fabricated: only the two real subquestions are stored.
        assert labels(questions[0]["subquestions"]) == ["Q1(a)", "Q1(c)"]

    def test_empty_document_reports_parser_failure(self):
        questions, _, warnings = parse_questions("", get_profile("generic"))
        assert questions == []
        assert any("No questions detected" in warning for warning in warnings)


class TestMarksDistribution:
    """Multiplier marks spread across subquestions."""

    def test_multiplier_distributes_to_subquestions(self):
        document = "\n".join(
            [
                "1. Answer both parts. [2x5]",
                "(a) Explain paging.",
                "(b) Explain segmentation.",
            ]
        )
        questions, _, _ = parse_questions(document, get_profile("generic"))

        # 2x5 = 10 total. Two subquestions, so 5 each -- the factor that is not
        # the subquestion count is the per-question value.
        assert questions[0]["marks"] == 10.0
        assert [s["marks"] for s in questions[0]["subquestions"]] == [5.0, 5.0]

    def test_explicit_subquestion_marks_beat_the_distributed_value(self):
        document = "\n".join(
            [
                "1. Answer both parts. [2x5]",
                "(a) Explain paging. (8)",
                "(b) Explain segmentation.",
            ]
        )
        questions, _, _ = parse_questions(document, get_profile("generic"))
        assert questions[0]["subquestions"][0]["marks"] == 8


class TestFlattenLeafQuestions:
    """Only leaves are stored, carrying their parent's context."""

    def test_parent_context_is_prepended_to_leaves(self):
        document = "\n".join(
            [
                "1. Consider a system with 4 page frames.",
                "(a) How many page faults occur?",
                "(b) What is the hit ratio?",
            ]
        )
        questions, _, _ = parse_questions(document, get_profile("generic"))
        leaves = flatten_leaf_questions(questions)

        # The parent is not stored on its own: "Consider a system with 4 page
        # frames." is not a question. Its context makes each child answerable.
        assert len(leaves) == 2
        assert all("4 page frames" in leaf["text"] for leaf in leaves)
        assert "How many page faults" in leaves[0]["text"]

    def test_standalone_question_has_no_context_prefix(self):
        questions, _, _ = parse_questions(
            "1. Explain paging in virtual memory.", get_profile("generic")
        )
        leaves = flatten_leaf_questions(questions)

        assert len(leaves) == 1
        assert leaves[0]["text"] == "Explain paging in virtual memory"

    def test_duplicate_context_is_not_repeated(self):
        document = "\n".join(
            ["1. Explain paging.", "(a) Explain paging in virtual memory."]
        )
        questions, _, _ = parse_questions(document, get_profile("generic"))
        leaves = flatten_leaf_questions(questions)

        # The parent's text is contained in the child's, so prefixing would
        # produce "Explain paging: Explain paging in virtual memory".
        assert leaves[0]["text"].count("Explain paging") == 1

    def test_leaves_keep_page_provenance(self):
        document = "\n".join(
            [
                format_page_marker(4, "ocr"),
                "1. Consider a system.",
                "(a) Explain scheduling.",
            ]
        )
        questions, _, _ = parse_questions(document, get_profile("generic"))
        leaves = flatten_leaf_questions(questions)

        assert leaves[0]["page_number"] == 4
        assert leaves[0]["page_method"] == "ocr"


class TestParserIsDeterministic:
    def test_same_input_gives_identical_output(self, kiit_exam_text):
        first = parse_questions(kiit_exam_text, get_profile("default"))
        second = parse_questions(kiit_exam_text, get_profile("default"))
        assert first == second

    def test_parser_state_does_not_leak_between_documents(self):
        """Each document needs its own parser; trackers are per-document state."""
        parser = ExamParser(get_profile("generic"))
        parser.parse("1. Explain paging.")
        # A second parse on the same instance would continue the first document's
        # sequence, so the pipeline always constructs a fresh parser.
        assert parser.main_tracker.values == [1]
