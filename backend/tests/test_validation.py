"""Tests for question validation and confidence scoring.

:class:`TestTranscribedGenuineQuestions`, :class:`TestTranscribedRejections` and
:class:`TestTranscribedGarbage` are the five assertion groups from the retired
``test_validation_layer.py``, which D-022 required transcribing before deleting
that file. They passed before this refactor and must still pass: they are what
justified classifying the validator as a reuse-as-is asset (AUDIT.md 3.3).

:class:`TestBlacklistNarrowing` covers the one deliberate behaviour change,
approved as D-028. The old blacklist rejected any text containing ordinary words
like ``course`` or ``semester``, so legitimate questions were silently discarded.
Those words now reject only header-shaped text.
"""

from backend.extraction.patterns import get_profile, looks_like_header
from backend.extraction.validation import (
    is_meta_instruction,
    is_ocr_garbage,
    validate_document,
    validate_question,
)

PROFILE = get_profile("default")


class TestTranscribedGenuineQuestions:
    """Group 1: real questions score high and are accepted.

    The expected confidences and the +/-25 tolerance are transcribed from the
    retired test, so a scoring change large enough to matter fails here.
    """

    CASES = [
        ("Explain Round Robin Scheduling.", 95),
        ("Design a memory management system.", 92),
        ("Compare SRAM and DRAM.", 88),
        ("Consider a system with 4 page frames. What is the number of page faults?", 100),
        ("Define CPU scheduling.", 92),
        ("Define RAM", 80),  # two words, but a strong action verb
    ]

    def test_genuine_questions_are_accepted(self):
        for text, expected in self.CASES:
            result = validate_question(text, PROFILE)
            assert result.status in {"accepted", "review"}, f"rejected: {text}"
            assert abs(result.confidence - expected) <= 25, (
                f"{text!r} scored {result.confidence}, expected about {expected}"
            )


class TestTranscribedRejections:
    """Group 2: metadata and exam instructions are rejected.

    Asserts rejection and low confidence, exactly as the retired test did, rather
    than pinning each reason string — the reason is diagnostic text, and which rule
    fires first is an implementation detail.
    """

    CASES = [
        "Answer all the questions",
        "Answer any four questions",
        "Attempt any questions",
        "Full Marks: 20",
        "Time: 1.5 Hours",
        "Semester: 4th",
        "Subject Code: CS20002",
        "Best of Luck",
        "KIIT University",
        "Page 1 of 5",
        "pg. 2",
        "PaperLens extraction marker",
        "[Subquestions Only]",
    ]

    def test_metadata_and_instructions_are_rejected(self):
        for text in self.CASES:
            result = validate_question(text, PROFILE)
            assert result.is_rejected, f"failed to reject: {text}"
            assert result.confidence < 40, f"{text!r} scored {result.confidence}"


class TestTranscribedGarbage:
    """Group 3: OCR garbage is rejected."""

    CASES = [
        "r: lld",
        "ct N.DC} Opcr.ting Syst ul",
        "och (sl:- CSE.IT. CSCE",
        "|||||",
        "a b c d",
    ]

    def test_garbage_is_rejected(self):
        for text in self.CASES:
            result = validate_question(text, PROFILE)
            assert result.is_rejected, f"failed to reject garbage: {text}"
            assert any(
                marker in result.reason
                for marker in ("OCR Garbage", "Too short", "Too few words")
            ), f"unexpected reason for {text!r}: {result.reason}"

    def test_detector_flags_broken_words(self):
        is_garbage, reason = is_ocr_garbage("ct N.DC} Opcr.ting Syst ul")
        assert is_garbage
        assert "suspicious" in reason

    def test_detector_accepts_technical_abbreviations(self):
        # Without the abbreviation allowlist, vowel-less technical terms would be
        # mistaken for scanning damage.
        for text in ("Compare SRAM and DRAM", "Explain CPU scheduling", "Describe DMA transfer"):
            is_garbage, _ = is_ocr_garbage(text)
            assert not is_garbage, f"wrongly flagged as garbage: {text}"

    def test_detector_accepts_equations(self):
        is_garbage, _ = is_ocr_garbage("Evaluate f(x) = x^2 + 3x - 5 for x = 2")
        assert not is_garbage


class TestBlacklistNarrowing:
    """The D-028 fix: generic words reject only in header-shaped text."""

    def test_question_mentioning_a_generic_word_is_kept(self):
        """The regression this fix exists for.

        Under the old single blacklist, any text containing "semester" was
        rejected as university metadata, so this legitimate question vanished.
        """
        result = validate_question(
            "Explain the semester system's effect on CPU scheduling.", PROFILE
        )
        assert not result.is_rejected

    def test_more_questions_containing_generic_words_are_kept(self):
        for text in (
            "Describe the course of a packet through a router.",
            "Explain how degree of multiprogramming affects thrashing.",
            "Discuss the tech stack used in a three-tier architecture.",
        ):
            assert not validate_question(text, PROFILE).is_rejected, text

    def test_header_containing_a_generic_word_is_still_rejected(self):
        result = validate_question("Course: Database Management Systems (CS-204)", PROFILE)
        assert result.is_rejected
        assert "metadata" in result.reason.lower()

    def test_unambiguous_metadata_is_rejected_anywhere(self):
        """Strong markers do not need header context: no question says these."""
        for text in (
            "Registration No 2205001 and Roll No 12 must be written clearly",
            "School of Computer Engineering, KIIT University, Bhubaneswar",
        ):
            assert validate_question(text, PROFILE).is_rejected, text

    def test_header_detection(self):
        assert looks_like_header("Semester: 4th")
        assert looks_like_header("B.Tech Degree Examination")
        assert not looks_like_header("Explain the semester system's effect on scheduling.")
        assert not looks_like_header("What is the degree of a relation?")

    def test_kiit_pattern_comes_from_the_profile(self):
        """Institution patterns are configuration, not hardcoded logic (D-028)."""
        text = "KIIT is mentioned here in a sentence about scheduling policies"
        assert validate_question(text, get_profile("default")).is_rejected
        # The generic profile carries no KIIT pattern, so it does not reject.
        assert not validate_question(text, get_profile("generic")).is_rejected


class TestMetaInstructions:
    def test_recognises_instructions(self):
        for text in (
            "Answer any four questions",
            "Attempt all questions",
            "Answer the following",
        ):
            assert is_meta_instruction(text), text

    def test_does_not_flag_real_questions(self):
        for text in ("Explain paging", "Compare FCFS and SJF scheduling"):
            assert not is_meta_instruction(text), text


class TestDocumentValidation:
    def test_flags_implausibly_few_questions(self):
        warnings = validate_document([{"label_path": "Q1"}], page_count=10)
        assert any("Possible parser failure" in warning for warning in warnings)

    def test_flags_empty_extraction(self):
        warnings = validate_document([], page_count=3)
        assert any("No questions detected" in warning for warning in warnings)

    def test_silent_on_a_plausible_document(self):
        questions = [{"label_path": f"Q{n}"} for n in range(1, 6)]
        assert validate_document(questions, page_count=3) == []


class TestValidationIsDeterministic:
    def test_repeated_calls_agree(self):
        text = "Explain the working of a translation lookaside buffer. (10 marks)"
        results = {validate_question(text, PROFILE) for _ in range(5)}
        assert len(results) == 1
