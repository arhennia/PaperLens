"""Tests for PDF extraction and OCR provenance (D-013).

The central claim here is that **extraction never lies about how it read a page**.
The previous implementation caught a bare ``Exception`` around the OCR call and
substituted whatever sparse text PyMuPDF had found, telling nobody
(AUDIT.md 4.3) — so a student saw fragments presented as clean extraction.

Tesseract is not installed in this environment, which makes
:class:`TestOcrProvenance` unusually valuable rather than a gap: an image-only PDF
exercises exactly the failure path, and the assertions confirm the page is
recorded as ``ocr_failed`` and flagged low-confidence instead of passing silently.
The successful-OCR path is covered with an injected fake, since asserting on real
Tesseract output would test Tesseract rather than PaperLens.

PDFs are generated in memory (D-022): ``.gitignore`` excludes ``*.pdf``, and real
exam papers are student data.
"""

import pytest

from backend.extraction import pdf as pdf_module
from backend.extraction.normalize import parse_page_marker
from backend.extraction.ocr import OcrResult, OcrUnavailable
from backend.extraction.pdf import PageExtraction, detect_year, extract_pdf
from backend.tests.conftest import exam_page, make_image_only_pdf, make_pdf


class TestNativeTextExtraction:
    def test_extracts_text_from_every_page(self):
        result = extract_pdf(
            make_pdf(
                [
                    exam_page("1. Explain paging in virtual memory systems. (10 marks)"),
                    exam_page("2. Describe the RAID levels and their tradeoffs. (10 marks)"),
                ]
            )
        )

        assert result.page_count == 2
        assert result.method == "text"
        assert "paging" in result.text
        assert "RAID" in result.text

    def test_each_page_gets_a_provenance_row(self):
        result = extract_pdf(
            make_pdf(
                [
                    exam_page("1. Explain paging in virtual memory systems. (10 marks)"),
                    exam_page("2. Describe the RAID levels and their tradeoffs. (10 marks)"),
                ]
            )
        )

        assert [page.page_number for page in result.pages] == [1, 2]
        assert all(page.method == "text" for page in result.pages)
        assert all(page.char_count > 0 for page in result.pages)
        # Native text has no OCR confidence: reporting a number would imply a
        # measurement that never happened.
        assert all(page.ocr_confidence is None for page in result.pages)

    def test_page_markers_are_injected_in_order(self):
        """The mechanism the parser reads to assign real page numbers (D-013)."""
        result = extract_pdf(
            make_pdf(
                [
                    exam_page("1. Explain paging in virtual memory systems. (10 marks)"),
                    exam_page("2. Describe the RAID levels and their tradeoffs. (10 marks)"),
                    exam_page("3. Compare FCFS and SJF scheduling algorithms. (10 marks)"),
                ]
            )
        )

        markers = [
            parse_page_marker(line)
            for line in result.text.splitlines()
            if parse_page_marker(line)
        ]
        assert markers == [(1, "text"), (2, "text"), (3, "text")]

    def test_native_text_is_not_flagged_low_confidence(self):
        result = extract_pdf(
            make_pdf([exam_page("1. Explain paging in virtual memory. (10 marks)")])
        )
        assert result.low_confidence_pages == ()
        assert not result.has_failed_ocr

    def test_corrupt_input_raises_a_clear_error(self):
        with pytest.raises(ValueError, match="Corrupted or invalid PDF"):
            extract_pdf(b"this is not a pdf")


class TestOcrProvenance:
    """OCR failure is recorded honestly, never silently substituted (D-013)."""

    def test_image_only_page_without_tesseract_records_ocr_failed(self):
        """The regression AUDIT.md 4.3 describes.

        Tesseract is absent here, so this is the real failure path. The page must
        be labelled, not quietly passed off as clean text.
        """
        result = extract_pdf(make_image_only_pdf(1))
        page = result.pages[0]

        if page.method == "ocr_failed":
            assert result.has_failed_ocr
            assert page.is_low_confidence
            assert page.note, "a failed page must record why"
            assert result.low_confidence_pages == (1,)
        else:
            # Tesseract present: it ran, and the page is labelled 'ocr' either way.
            assert page.method == "ocr"

    def test_failed_ocr_keeps_the_native_text_rather_than_discarding_it(self, monkeypatch):
        """Label the text, do not throw it away.

        Discarding would lose information a student might still use; presenting it
        unlabelled is the dishonesty. Recording ``ocr_failed`` does neither.
        """
        def fail(page, dpi=None):
            raise RuntimeError("tesseract exploded")

        monkeypatch.setattr(pdf_module, "ocr_page", fail)

        result = extract_pdf(make_image_only_pdf(1))
        assert result.pages[0].method == "ocr_failed"
        assert "tesseract exploded" in result.pages[0].note

    def test_missing_engine_is_reported_per_page(self, monkeypatch):
        def unavailable(page, dpi=None):
            raise OcrUnavailable("Tesseract binary not found")

        monkeypatch.setattr(pdf_module, "ocr_page", unavailable)

        result = extract_pdf(make_image_only_pdf(2))
        assert all(page.method == "ocr_failed" for page in result.pages)
        assert all("OCR unavailable" in page.note for page in result.pages)

    def test_successful_ocr_records_its_confidence(self, monkeypatch):
        monkeypatch.setattr(
            pdf_module,
            "ocr_page",
            lambda page, dpi=None: OcrResult(
                text="1. Explain paging in virtual memory.", confidence=92.5, word_count=6
            ),
        )

        result = extract_pdf(make_image_only_pdf(1))
        page = result.pages[0]

        assert page.method == "ocr"
        assert page.ocr_confidence == 92.5
        assert not page.is_low_confidence
        assert result.method == "ocr"

    def test_low_confidence_ocr_is_flagged(self, monkeypatch):
        """Below the threshold, a student is told to check the original."""
        monkeypatch.setattr(
            pdf_module,
            "ocr_page",
            lambda page, dpi=None: OcrResult(text="1. Explaln paglng", confidence=41.0, word_count=3),
        )

        result = extract_pdf(make_image_only_pdf(1))
        assert result.pages[0].is_low_confidence
        assert result.low_confidence_pages == (1,)

    def test_mixed_document_reports_hybrid(self, monkeypatch):
        monkeypatch.setattr(
            pdf_module,
            "ocr_page",
            lambda page, dpi=None: OcrResult(text="scanned text here", confidence=88.0, word_count=3),
        )

        import fitz

        document = fitz.open()
        text_page = document.new_page()
        # Enough text that this page reads as native, so the document genuinely
        # mixes a text page with a scanned one.
        text_page.insert_textbox(
            fitz.Rect(72, 72, 540, 720),
            exam_page("1. Explain paging in virtual memory systems. (10 marks)"),
            fontsize=11,
            fontname="helv",
        )
        document.new_page().draw_rect(fitz.Rect(100, 100, 400, 300), width=2)
        pdf_bytes = document.tobytes()
        document.close()

        result = extract_pdf(pdf_bytes)
        assert result.method == "hybrid"
        assert result.pages[0].method == "text"
        assert result.pages[1].method in {"ocr", "ocr_failed"}


class TestPageExtractionFlags:
    """The low-confidence rule, checked directly at its boundaries."""

    def test_ocr_failed_is_always_low_confidence(self):
        page = PageExtraction(1, "ocr_failed", "partial", 7)
        assert page.is_low_confidence

    def test_ocr_below_threshold_is_low_confidence(self):
        assert PageExtraction(1, "ocr", "x", 1, ocr_confidence=50.0).is_low_confidence
        assert not PageExtraction(1, "ocr", "x", 1, ocr_confidence=95.0).is_low_confidence

    def test_native_text_is_never_low_confidence(self):
        assert not PageExtraction(1, "text", "clean text", 10).is_low_confidence


class TestYearDetection:
    """Three stages, preserved from the previous implementation."""

    def test_year_from_filename_wins(self):
        year, source = detect_year(make_pdf(["Some exam content here."]), "dbms-2023.pdf")
        assert (year, source) == (2023, "filename")

    def test_year_from_first_page_when_the_filename_has_none(self):
        pdf_bytes = make_pdf(
            ["End Semester Examination 2021\n\n1. Explain paging. (10 marks)"]
        )
        year, source = detect_year(pdf_bytes, "scan001.pdf")
        assert (year, source) == (2021, "document_text")

    def test_returns_none_rather_than_guessing(self):
        """Better to ask the user than to invent a year that skews recency."""
        year, source = detect_year(make_pdf(["No year appears in this document."]), "scan.pdf")
        assert year is None
        assert source is None

    def test_implausible_years_are_ignored(self):
        """Filters registration numbers and course codes, which look like years."""
        pdf_bytes = make_pdf(["Registration No 2098765\n\n1. Explain paging."])
        year, _ = detect_year(pdf_bytes, "scan.pdf")
        assert year != 2098

    def test_corrupt_pdf_does_not_raise(self):
        """Year detection is best-effort; extraction reports the real error."""
        assert detect_year(b"not a pdf", "exam.pdf") == (None, None)


class TestExtractionIsDeterministic:
    def test_same_bytes_give_the_same_result(self):
        pdf_bytes = make_pdf(
            ["1. Explain paging in virtual memory systems clearly. (10 marks)"]
        )
        first, second = extract_pdf(pdf_bytes), extract_pdf(pdf_bytes)

        assert first.text == second.text
        assert first.pages == second.pages
        assert first.method == second.method
