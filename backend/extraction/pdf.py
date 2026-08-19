"""PDF text extraction with per-page provenance.

Extracts native text page by page and falls back to OCR for pages that look
scanned. Every page's outcome is recorded rather than summarised away, which is
what makes OCR degradation visible instead of silent (D-013).

Two defects in the previous implementation are fixed here.

**Silent OCR failure.** The old code caught a bare ``Exception`` around the OCR
call and substituted whatever sparse text PyMuPDF had found, telling nobody
(AUDIT.md 4.3). A student then saw fragments presented as clean extraction. Now a
failed page is recorded as ``ocr_failed`` and keeps its native text — the text is
still there, but it is *labelled*, so the UI can link to the original page. That
distinction matters: discarding the text would lose information, while presenting
it unlabelled is dishonest.

**Fabricated page numbers.** Page markers are injected into the text stream in a
form that survives noise filtering, so the parser can attach real page numbers to
questions instead of the hardcoded ``1`` every question used to get
(AUDIT.md 4.7).
"""

from dataclasses import dataclass

from backend.config import (
    OCR_CHAR_THRESHOLD,
    OCR_CHAR_THRESHOLD_WITH_IMAGES,
    OCR_LOW_CONFIDENCE_THRESHOLD,
)
from backend.extraction.normalize import format_page_marker
from backend.extraction.ocr import OcrUnavailable, ocr_page


@dataclass(frozen=True)
class PageExtraction:
    """How one page was read, and how well.

    Mirrors a ``paper_pages`` row (D-013).

    Attributes:
        page_number: 1-based page number as printed in the PDF.
        method: ``text`` (native), ``ocr`` (recognised from an image), or
            ``ocr_failed`` (OCR was needed but did not succeed).
        text: The text recovered for this page.
        char_count: Length of ``text``.
        ocr_confidence: Mean OCR confidence 0-100, or None for native text.
        note: Why OCR failed, when it did. Operator-facing.
    """

    page_number: int
    method: str
    text: str
    char_count: int
    ocr_confidence: float | None = None
    note: str | None = None

    @property
    def is_low_confidence(self) -> bool:
        """True when this page's text should not be trusted without checking.

        Either OCR failed outright, or it succeeded with confidence below the
        configured threshold. Drives the "check the original page" badge (D-013).
        """
        if self.method == "ocr_failed":
            return True
        if self.method == "ocr" and self.ocr_confidence is not None:
            return self.ocr_confidence < OCR_LOW_CONFIDENCE_THRESHOLD
        return False


@dataclass(frozen=True)
class DocumentExtraction:
    """The result of extracting one PDF.

    Attributes:
        text: All pages joined, each preceded by a page marker.
        pages: Per-page provenance, in order.
        method: Document-level summary — ``text``, ``ocr`` or ``hybrid``.
        page_count: Number of pages.
    """

    text: str
    pages: tuple[PageExtraction, ...]
    method: str
    page_count: int

    @property
    def has_failed_ocr(self) -> bool:
        return any(page.method == "ocr_failed" for page in self.pages)

    @property
    def low_confidence_pages(self) -> tuple[int, ...]:
        """Page numbers a student should verify against the original."""
        return tuple(page.page_number for page in self.pages if page.is_low_confidence)


def _needs_ocr(native_text: str, image_count: int) -> bool:
    """Decide whether a page should be sent to OCR.

    Preserves the previous heuristic, which was verified against real papers: very
    little text means the page is a scan, and a page carrying images needs more
    text before its native layer is trusted (a scanned page often has a thin text
    layer from a previous OCR pass).
    """
    length = len(native_text.strip())
    if length < OCR_CHAR_THRESHOLD:
        return True
    return image_count > 0 and length < OCR_CHAR_THRESHOLD_WITH_IMAGES


def extract_pdf(pdf_bytes: bytes) -> DocumentExtraction:
    """Extract text from a PDF, recording how each page was read.

    Args:
        pdf_bytes: The raw PDF.

    Returns:
        A :class:`DocumentExtraction`.

    Raises:
        ValueError: The bytes are not a readable PDF.
    """
    import fitz  # noqa: PLC0415 -- import here so a missing PyMuPDF surfaces per call

    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Corrupted or invalid PDF file: {exc}") from exc

    try:
        pages = [
            _extract_page(document.load_page(index), index + 1)
            for index in range(len(document))
        ]
    finally:
        # Always closed: PyMuPDF holds native buffers, and leaking them in a
        # long-running worker would grow memory with every job.
        document.close()

    marked = [
        f"{format_page_marker(page.page_number, page.method)}\n{page.text}"
        for page in pages
    ]

    return DocumentExtraction(
        text="\n\n".join(marked),
        pages=tuple(pages),
        method=_summarize_method(pages),
        page_count=len(pages),
    )


def _extract_page(page, page_number: int) -> PageExtraction:
    """Extract one page, falling back to OCR and recording what happened."""
    native_text = page.get_text() or ""

    try:
        image_count = len(page.get_images())
    except Exception:
        # Malformed image tables should not abort extraction; assume none and
        # let the character threshold decide.
        image_count = 0

    if not _needs_ocr(native_text, image_count):
        stripped = native_text.strip()
        return PageExtraction(
            page_number=page_number,
            method="text",
            text=native_text,
            char_count=len(stripped),
        )

    try:
        result = ocr_page(page)
    except OcrUnavailable as exc:
        # The engine is missing, so every page will fail the same way. Recorded
        # per page rather than aborting: a mostly-native document with one
        # scanned page is still worth extracting.
        return PageExtraction(
            page_number=page_number,
            method="ocr_failed",
            text=native_text,
            char_count=len(native_text.strip()),
            note=f"OCR unavailable: {exc}",
        )
    except Exception as exc:
        return PageExtraction(
            page_number=page_number,
            method="ocr_failed",
            text=native_text,
            char_count=len(native_text.strip()),
            note=f"OCR failed on this page: {exc}",
        )

    # OCR ran but found nothing. If native text exists, prefer it and say OCR did
    # not help; a genuinely blank page records as an empty OCR page.
    if not result.text.strip():
        if native_text.strip():
            return PageExtraction(
                page_number=page_number,
                method="ocr_failed",
                text=native_text,
                char_count=len(native_text.strip()),
                note="OCR returned no text; falling back to the native text layer.",
            )
        return PageExtraction(
            page_number=page_number,
            method="ocr",
            text="",
            char_count=0,
            ocr_confidence=result.confidence,
            note="Page appears blank.",
        )

    return PageExtraction(
        page_number=page_number,
        method="ocr",
        text=result.text,
        char_count=len(result.text.strip()),
        ocr_confidence=result.confidence,
    )


def _summarize_method(pages: list[PageExtraction]) -> str:
    """Summarise per-page methods into one document-level label.

    A page whose OCR failed counts as an OCR page here: OCR was what the page
    needed. The per-page rows carry the detail, and ``has_failed_ocr`` is the
    honest signal for the UI.
    """
    if not pages:
        return "text"

    native = sum(1 for page in pages if page.method == "text")
    if native == len(pages):
        return "text"
    if native == 0:
        return "ocr"
    return "hybrid"


def detect_year(pdf_bytes: bytes, filename: str) -> tuple[int | None, str | None]:
    """Detect a paper's exam year.

    Three stages, preserved from the previous implementation, which was sound:

    1. A four-digit year in the filename. Most reliable, since a student naming a
       file has stated the year deliberately.
    2. A plausible year on the first page.
    3. Give up and ask the user, rather than guessing.

    Args:
        pdf_bytes: The raw PDF.
        filename: Original filename, used for stage 1 only — never for building a
            storage path (D-016).

    Returns:
        ``(year, source)`` where source is ``filename``, ``document_text``, or
        None when detection failed and the user must supply it.
    """
    import re  # noqa: PLC0415

    import fitz  # noqa: PLC0415

    year_pattern = re.compile(r"\b(20[0-3]\d|199\d)\b")

    match = year_pattern.search(filename or "")
    if match:
        return int(match.group(1)), "filename"

    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        return None, None

    try:
        if document.page_count == 0:
            return None, None
        first_page_text = document.load_page(0).get_text() or ""
    except Exception:
        return None, None
    finally:
        document.close()

    # Narrower than the filename range: this filters registration numbers and
    # course codes, which are frequently four digits beginning with 20.
    candidates = [
        int(value)
        for value in year_pattern.findall(first_page_text)
        if 2010 <= int(value) <= 2032
    ]
    if candidates:
        return candidates[0], "document_text"

    return None, None
