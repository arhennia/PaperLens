"""Tesseract OCR for scanned pages, with confidence reporting.

Two deliberate differences from the previous implementation:

**The Tesseract import is lazy.** ``pytesseract`` was imported at module top
level before, so the entire service failed to import on any machine without it —
the exact failure that made ``import main`` impossible during the audit
(AUDIT.md 3.2, D-001). Importing inside the call means the parser, validator and
every analysis function remain importable and testable on a machine with no
Tesseract installed, and only an actual OCR attempt fails.

**Confidence is returned, not discarded.** :func:`ocr_page` reports Tesseract's
mean per-word confidence alongside the text, so a low-confidence page can be
recorded and surfaced to the student instead of being presented as clean
extraction (D-013).

The old ``perform_ocr_on_pdf()`` whole-document helper is gone: it had no callers
(AUDIT.md 4.10) and per-page OCR is what the pipeline actually needs, since
extraction method genuinely varies page to page.
"""

import io
from dataclasses import dataclass

from backend.config import OCR_DPI, TESSERACT_CMD


class OcrUnavailable(RuntimeError):
    """Tesseract is not installed or not configured.

    Distinct from a page that failed to OCR: this means the engine is missing, so
    every page will fail and the operator needs to install it. Callers record the
    page as ``ocr_failed`` either way, but the message should not be misread as
    "this PDF is bad".
    """


@dataclass(frozen=True)
class OcrResult:
    """Text recovered from one page, with the confidence Tesseract reported.

    Attributes:
        text: Recognised text. May be empty for a blank or unreadable page.
        confidence: Mean per-word confidence, 0-100, or None when Tesseract
            reported no scored words (typically a blank page).
        word_count: Words that carried a confidence score.
    """

    text: str
    confidence: float | None
    word_count: int


def _load_pytesseract():
    """Import pytesseract on demand and apply the configured binary path."""
    try:
        import pytesseract  # noqa: PLC0415 -- lazy on purpose, see module docstring
    except ImportError as exc:
        raise OcrUnavailable(
            "pytesseract is not installed. Install backend/requirements.txt to "
            "enable OCR for scanned PDFs."
        ) from exc

    if TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

    return pytesseract


def ocr_page(page, dpi: int = OCR_DPI) -> OcrResult:
    """Render one PDF page to an image and OCR it.

    Args:
        page: A PyMuPDF ``Page``.
        dpi: Rendering resolution. Higher is slower and not reliably more
            accurate; the default is tuned for exam scans.

    Returns:
        An :class:`OcrResult`.

    Raises:
        OcrUnavailable: Tesseract or its Python binding is missing.
        RuntimeError: Rendering or recognition failed for this page.
    """
    pytesseract = _load_pytesseract()

    try:
        from PIL import Image  # noqa: PLC0415 -- paired with the lazy OCR import
    except ImportError as exc:
        raise OcrUnavailable("Pillow is not installed; OCR cannot run.") from exc

    try:
        pixmap = page.get_pixmap(dpi=dpi)
        image = Image.open(io.BytesIO(pixmap.tobytes("png")))
    except Exception as exc:
        raise RuntimeError(f"Could not render page for OCR: {exc}") from exc

    try:
        data = pytesseract.image_to_data(
            image, output_type=pytesseract.Output.DICT
        )
    except pytesseract.TesseractNotFoundError as exc:
        raise OcrUnavailable(
            "The Tesseract binary was not found. Install Tesseract-OCR and put it "
            "on PATH, or set TESSERACT_CMD to its full path."
        ) from exc
    except Exception as exc:
        raise RuntimeError(f"OCR failed: {exc}") from exc

    return _summarize(data)


def _summarize(data: dict) -> OcrResult:
    """Turn Tesseract's per-word table into text plus a mean confidence.

    Tesseract reports -1 for structural rows that carry no recognised word, so
    those are excluded from both the text and the average. Including them would
    drag every page's confidence down and make the low-confidence warning
    meaningless.
    """
    words: list[str] = []
    confidences: list[float] = []

    for text, confidence in zip(data.get("text", []), data.get("conf", [])):
        word = (text or "").strip()
        if not word:
            continue

        try:
            score = float(confidence)
        except (TypeError, ValueError):
            continue

        if score < 0:
            continue

        words.append(word)
        confidences.append(score)

    mean_confidence = sum(confidences) / len(confidences) if confidences else None
    return OcrResult(
        text=" ".join(words),
        confidence=mean_confidence,
        word_count=len(words),
    )
