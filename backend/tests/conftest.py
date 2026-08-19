"""Shared pytest configuration and in-memory PDF fixtures.

Two things this file fixes by existing.

**Imports work.** Every previous test file did
``sys.path.append(os.path.dirname(os.path.abspath(__file__)))``, which appends
``backend/tests/`` — the wrong directory — so ``from services...`` failed and all
six test files were unrunnable (AUDIT.md 4.4). Putting the repository root on
``sys.path`` once, here, means the ``backend.`` package resolves for every test and
the bug cannot recur per file.

**Fixtures are generated, never committed.** ``.gitignore`` excludes ``*.pdf``, so
the old tests' ``sample_exam.pdf`` and ``scanned_exam.pdf`` could never be
committed and were simply absent. PDFs are built here in memory with PyMuPDF
(D-022), which resolves that permanently and has a side benefit: a fixture's
content is visible in the test that uses it, instead of being opaque bytes.

Real student exam papers are also personal data, and committing them would repeat
the privacy problem already in this repository's history (AUDIT.md 4.11).
"""

import sys
from pathlib import Path

import pytest

# Repository root, so `import backend.*` resolves regardless of where pytest runs.
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def exam_page(*questions: str) -> str:
    """Build a page body with enough text to read as native, not scanned.

    ``pdf.extract_pdf`` sends any page with fewer than
    ``config.OCR_CHAR_THRESHOLD`` (100) characters to OCR, on the reasoning that a
    nearly-empty text layer means the page is an image. That heuristic is correct
    for real papers — an exam page carries hundreds of characters — but it means a
    fixture holding one short question is legitimately classified as a scan.

    So tests that want a *native text* page must supply a realistic amount of it.
    This helper pads the questions with standard exam boilerplate to clear the
    threshold, keeping the intent of each test visible while making the fixture
    resemble a real page.

    Args:
        questions: Question lines to place on the page.

    Returns:
        Page text, comfortably over the native-text threshold.
    """
    body = "\n\n".join(questions)
    return (
        f"{body}\n\n"
        "Answer all questions in the space provided. Marks are indicated "
        "against each question. Use of a non-programmable calculator is "
        "permitted. Write your answers legibly and show all intermediate steps "
        "where a derivation is required."
    )


def make_pdf(pages: list[str]) -> bytes:
    """Build a text PDF in memory, one page per string.

    Uses a real PDF writer rather than hand-assembled bytes so the extraction path
    under test is the same one production uses.

    Note: a page with under ``config.OCR_CHAR_THRESHOLD`` characters is routed to
    OCR by design. Use :func:`exam_page` to build pages that should be read as
    native text.

    Args:
        pages: Page contents, in order.

    Returns:
        PDF bytes.
    """
    import fitz

    document = fitz.open()
    for content in pages:
        page = document.new_page()
        # 11pt inside a 72pt margin: enough text fits per page that fixtures do
        # not silently overflow and lose the lines a test is asserting on.
        page.insert_textbox(
            fitz.Rect(72, 72, 540, 720), content, fontsize=11, fontname="helv"
        )

    pdf_bytes = document.tobytes()
    document.close()
    return pdf_bytes


def make_image_only_pdf(page_count: int = 1) -> bytes:
    """Build a PDF whose pages carry no extractable text.

    Stands in for a scanned paper: the extractor should route these pages to OCR
    and, on a machine without Tesseract, record ``ocr_failed`` rather than
    pretending the near-empty text layer is clean extraction (D-013).
    """
    import fitz

    document = fitz.open()
    for _ in range(page_count):
        page = document.new_page()
        # A drawn rectangle gives the page visible content with no text layer.
        page.draw_rect(fitz.Rect(100, 100, 400, 300), color=(0, 0, 0), width=2)

    pdf_bytes = document.tobytes()
    document.close()
    return pdf_bytes


@pytest.fixture
def kiit_exam_text() -> str:
    """A deliberately messy exam paper, transcribed from the retired tests.

    This is the regression fixture from ``test_hybrid_direct.py``, kept verbatim
    because its noise is what the parser was verified against (AUDIT.md 3.3) and
    D-022 requires those cases carried forward. Every line is here for a reason:

    * ``1,`` and ``2,`` — OCR reads a full stop as a comma
    * ``[1O M]`` — OCR reads zero as the letter O
    * ``Q4:`` — colon instead of full stop
    * missing Q3 — a gap the parser must report rather than silently accept
    * ``Q5. (a)`` / ``(b)`` — a subquestion opening on the parent's line
    * letterhead, roll numbers, watermarks, page furniture, "BEST OF LUCK"
    """
    return """KALINGA INSTITUTE OF INDUSTRIAL TECHNOLOGY
KIIT UNIVERSITY, BHUBANESWAR
Roll No: 2205001 | Registration No: 2205002
End Semester Examination - Autumn 2026
Course: Database Management Systems (CS-204)
Time Allowed: 3 Hours | Max Marks: 100
Page 1 of 3
Watermark: CONFIDENTIAL

SECTION A
Short Answer Questions

1, What is a database transaction? Explain ACID properties. (10 marks)

2, Explain two-phase locking protocol. [1O M]

pg. 2
Watermark: CONFIDENTIAL

SECTION B
Long Answer Questions

Q4: Explain dynamic hashing versus static hashing. [20]

Q5. (a) Discuss B+ Tree index structures. (10)
    (b) Construct a B+ Tree for keys: 1, 4, 7, 10, 17, 21. [10m]

BEST OF LUCK
PaperLens Footer Info
"""
