"""Tests for normalization and content-addressed question identity (D-011).

The identity rules are Swayam's approved answer to D-011, and they are the
foundation everything else rests on: corrections, share links, repeat counts and
re-analysis idempotency all key on the hash these functions produce. So these
tests pin the rules deliberately rather than incidentally.

The most important test here is
:func:`test_math_characters_are_preserved_so_distinct_questions_do_not_collide`.
The previous implementation stripped all punctuation, which made ``f(x) = x^2``
and ``f(x) = x2`` normalize identically — two different questions sharing one
identity, silently inflating a repeat count on the product's headline feature.
"""

from backend.config import NORMALIZER_VERSION
from backend.extraction.normalize import (
    PRESERVED_SYMBOLS,
    clean_question_text,
    compute_identity_hash,
    format_page_marker,
    normalize_document_text,
    normalize_for_identity,
    normalize_question_label,
    parse_page_marker,
    question_identity,
)
from backend.extraction.patterns import get_profile


class TestIdentityNormalization:
    """The rules D-011 approved."""

    def test_lowercases_and_collapses_whitespace(self):
        assert (
            normalize_for_identity("Explain   PAGING\n  in virtual memory")
            == "explain paging in virtual memory"
        )

    def test_strips_leading_question_labels(self):
        # Numbering shifts between years; the question is the same question.
        variants = [
            "Q1. Explain paging",
            "Q1 Explain paging",
            "Question 1: Explain paging",
            "1. Explain paging",
            "(a) Explain paging",
            "a) Explain paging",
        ]
        assert {normalize_for_identity(v) for v in variants} == {"explain paging"}

    def test_math_characters_are_preserved_so_distinct_questions_do_not_collide(self):
        """The regression this rule exists to prevent.

        Under the old "strip all punctuation" normalizer these two collapsed to
        the same string and were treated as one question.
        """
        squared = normalize_for_identity("Evaluate f(x) = x^2")
        times_two = normalize_for_identity("Evaluate f(x) = x2")

        assert squared == "evaluate f(x) = x^2"
        assert times_two == "evaluate f(x) = x2"
        assert squared != times_two
        assert compute_identity_hash(squared) != compute_identity_hash(times_two)

    def test_every_approved_symbol_survives(self):
        """Each character in the approved set must reach the hashed text."""
        for symbol in PRESERVED_SYMBOLS:
            result = normalize_for_identity(f"compute a {symbol} b")
            assert symbol in result, f"{symbol!r} was stripped but is approved"

    def test_code_and_inequalities_stay_distinct(self):
        pairs = [
            ("Trace while (i < n)", "Trace while (i > n)"),
            ("Evaluate a && b", "Evaluate a || b"),
            ("Compute x += 1", "Compute x -= 1"),
            ("Explain arr[i]", "Explain arr{i}"),
        ]
        for left, right in pairs:
            assert normalize_for_identity(left) != normalize_for_identity(right)

    def test_decorative_punctuation_is_dropped(self):
        # Trailing full stops and stray quotes are noise, not meaning, so these
        # three are the same question.
        assert (
            normalize_for_identity("Explain paging.")
            == normalize_for_identity("Explain paging")
            == normalize_for_identity("Explain paging;")
        )

    def test_empty_input_is_safe(self):
        assert normalize_for_identity("") == ""
        assert normalize_for_identity(None or "") == ""


class TestIdentityHash:
    """Hashing, and the version recorded alongside it."""

    def test_same_text_always_gives_the_same_hash(self):
        """Idempotent re-extraction depends on this being true across runs."""
        first = question_identity("Q1. Explain paging in virtual memory.")
        second = question_identity("Explain PAGING in    virtual memory")
        assert first == second

    def test_identity_reports_the_normalizer_version(self):
        # Stored per row so a normalizer change is a migrated event rather than
        # silent drift (D-011).
        _, _, version = question_identity("Explain paging")
        assert version == NORMALIZER_VERSION

    def test_hash_is_sha256_hex(self):
        _, digest, _ = question_identity("Explain paging")
        assert len(digest) == 64
        assert set(digest) <= set("0123456789abcdef")

    def test_different_questions_hash_differently(self):
        _, paging, _ = question_identity("Explain paging")
        _, acid, _ = question_identity("Explain ACID properties")
        assert paging != acid


class TestPageMarkers:
    """Page markers are the mechanism behind real page numbers (D-013)."""

    def test_marker_round_trips(self):
        assert parse_page_marker(format_page_marker(7, "ocr")) == (7, "ocr")

    def test_marker_survives_the_noise_filter(self):
        """The specific reason page provenance works.

        The noise patterns that strip page furniture anchor on ``^\\s*Page``. The
        marker starts with ``---``, so it does not match and passes through intact
        — which is what lets the parser read it. A future institution profile that
        broke this would silently return page numbers to being meaningless.
        """
        document = "\n".join(
            [
                format_page_marker(1, "text"),
                "Page 1 of 3",  # real page furniture: must be stripped
                "1. Explain paging",
                format_page_marker(2, "ocr"),
                "pg. 2",  # also furniture
                "2. Explain thrashing",
            ]
        )

        result = normalize_document_text(document, get_profile("default"))
        lines = result.splitlines()

        assert format_page_marker(1, "text") in lines
        assert format_page_marker(2, "ocr") in lines
        assert "Page 1 of 3" not in lines
        assert "pg. 2" not in lines

    def test_non_marker_lines_are_not_parsed_as_markers(self):
        assert parse_page_marker("1. Explain paging") is None
        assert parse_page_marker("Page 1 of 3") is None


class TestDocumentNormalization:
    """OCR repairs, transcribed from the retired parser test."""

    def test_repairs_comma_for_period_in_question_numbers(self):
        assert "1." in normalize_document_text("1, What is a transaction?")

    def test_repairs_letter_o_read_as_zero_in_marks(self):
        assert "10 marks" in normalize_document_text("Explain locking. [1O M]")

    def test_repairs_lowercase_l_read_as_one(self):
        assert normalize_document_text("l) Explain paging").startswith("1)")

    def test_strips_institution_letterhead(self):
        document = "\n".join(
            [
                "KALINGA INSTITUTE OF INDUSTRIAL TECHNOLOGY",
                "BEST OF LUCK",
                "1. Explain paging",
            ]
        )
        result = normalize_document_text(document, get_profile("default"))
        assert "KALINGA" not in result
        assert "BEST OF LUCK" not in result
        assert "Explain paging" in result

    def test_generic_profile_keeps_institution_lines(self):
        """The generic profile has no institution patterns, so it keeps them.

        Confirms the patterns really are configuration rather than hardcoded
        behaviour (D-028).
        """
        result = normalize_document_text(
            "NATIONAL INSTITUTE OF TECHNOLOGY ROURKELA\n1. Explain paging",
            get_profile("generic"),
        )
        assert "ROURKELA" in result


class TestCleanQuestionText:
    """Display-facing cleanup. Cases transcribed from test_validation_layer.py."""

    def test_transcribed_cleaning_cases(self):
        cases = [
            ("Explain    Round Robin   Scheduling.", "Explain Round Robin Scheduling."),
            ("What is paging? \n How does it work?", "What is paging? How does it work?"),
            ("Compare SRAM and DRAM....", "Compare SRAM and DRAM."),
            ("Explain virtual memory????", "Explain virtual memory?"),
            ("Explain paging | ", "Explain paging"),
            ("Define process _", "Define process"),
        ]
        for raw, expected in cases:
            assert clean_question_text(raw) == expected

    def test_transcribed_label_normalization_cases(self):
        cases = [
            ("Q1.", "Q1"),
            ("1.", "1"),
            ("1:", "1"),
            (" (a) ", "(a)"),
            ("1(a).", "1(a)"),
        ]
        for raw, expected in cases:
            assert normalize_question_label(raw) == expected
