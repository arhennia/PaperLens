"""Text normalization and content-addressed question identity.

Two different normalizations live here, and conflating them would be a bug:

:func:`normalize_document_text`
    Cleans the raw text stream coming out of a PDF: repairs common OCR
    mistakes, drops page furniture and letterheads. Runs once per document,
    before parsing. **Preserves the ``--- Page N ---`` markers**, which is what
    lets the parser attach real page numbers to questions (D-013).

:func:`normalize_for_identity`
    Reduces one question's text to a canonical form for hashing. Runs per
    question. Its output is never shown to a user — it exists so that the same
    question, however it was typed or scanned, produces the same fingerprint.

The identity rules are Swayam's approved answer to D-011: normalize casing and
excessive whitespace, but **preserve every mathematical, scientific and
programming character**::

    ^ _ ' + - * / = < > ! & | ( ) [ ] { }

That is a deliberate change from the previous implementation, which stripped all
punctuation and therefore made ``f(x) = x^2`` and ``f(x) = x2`` collide — two
different questions sharing one identity, which would corrupt repeat counts.

Because identity is derived from this function's output, changing it changes
every hash in the database. That is why :data:`config.NORMALIZER_VERSION` is
stored on every derived row: a rule change becomes an explicit, migrated,
reviewable event rather than silent drift.
"""

import hashlib
import re

from backend.config import NORMALIZER_VERSION
from backend.extraction.patterns import InstitutionProfile, get_profile

# ---------------------------------------------------------------------------
# Page markers
#
# pdf.py injects one of these ahead of each page's text. The parser reads them to
# know which page a question came from.
#
# Deliberately shaped so it does NOT match the page-furniture noise patterns,
# which anchor on `^\s*Page`: this marker starts with `---`, so it survives noise
# filtering. That is the whole mechanism -- see test_page_markers_survive_noise_filter.
# ---------------------------------------------------------------------------

PAGE_MARKER_TEMPLATE = "--- Page {page} ({method}) ---"

PAGE_MARKER_RE = re.compile(
    r"^\s*---\s*Page\s+(\d+)\s*\(([a-z_]+)\)\s*---\s*$", re.IGNORECASE
)


def format_page_marker(page_number: int, method: str) -> str:
    """Build the marker line that precedes a page's text."""
    return PAGE_MARKER_TEMPLATE.format(page=page_number, method=method)


def parse_page_marker(line: str) -> tuple[int, str] | None:
    """Return ``(page_number, method)`` if ``line`` is a page marker, else None."""
    match = PAGE_MARKER_RE.match(line)
    if not match:
        return None
    return int(match.group(1)), match.group(2).lower()


# ---------------------------------------------------------------------------
# Document-level normalization
# ---------------------------------------------------------------------------

# `1,` or `1:` at line start -> `1.` (OCR reads periods as commas)
_NUM_COMMA_COLON = re.compile(r"^\s*(\d{1,3})[,:](?=\s|$)")
# `iv,` -> `iv.`
_ROMAN_COMMA_COLON = re.compile(r"^\s*([ivxIVX]+)[,:](?=\s|$)", re.IGNORECASE)
# `Q1:` -> `Q1.`
_Q_COLON = re.compile(r"^\s*(Q\d{1,3}):(?=\s|$)", re.IGNORECASE)
# `Question l` / `Q l` -> `Question 1` (lowercase L read as one)
_QUESTION_L = re.compile(r"\b(Question|Q)\s*[lL|]\b")
# `1O marks` -> `10 marks` (letter O read as zero)
_O_IN_MARKS = re.compile(r"\b([1-9])[Oo]\s*(?:marks?|m)\b", re.IGNORECASE)
# `[1O]` / `(2O)` -> `[10]` / `(20)`
_O_IN_BRACKETS = re.compile(r"([(\[]\s*\d*)[Oo](\d*\s*[)\]])")
# `l)` / `l.` at line start -> `1)` / `1.`
_LEADING_L = re.compile(r"^\s*l([.):,])")
# `1st` / `2nd` / `3s` at line start -> `1.` (OCR adds ordinal suffixes)
_ORDINAL_SUFFIX = re.compile(r"^\s*(\d+)(?:st|nd|rd|th|[sS])(?=\s|$)")
_ROMAN_S_SUFFIX = re.compile(r"^\s*([ivxIVX]+)[sS](?=\s|$)", re.IGNORECASE)


def normalize_document_text(
    text: str, profile: InstitutionProfile | None = None
) -> str:
    """Repair OCR artefacts and strip page furniture from a whole document.

    Preserves ``--- Page N (method) ---`` markers so page numbers reach the
    parser (D-013).

    Args:
        text: Raw text as extracted from the PDF, with page markers already
            injected by :mod:`backend.extraction.pdf`.
        profile: Institution patterns to apply. Defaults to the configured
            profile (D-028).

    Returns:
        Normalized text with noise lines removed.
    """
    if not text:
        return ""

    active_profile = profile if profile is not None else get_profile()
    normalized_lines: list[str] = []

    for line in text.splitlines():
        stripped = line.strip()

        # Page markers bypass noise filtering entirely. Belt and braces: the
        # noise patterns already do not match them, but an institution profile
        # could add a broader pattern that does, and losing markers would
        # silently break page provenance.
        if PAGE_MARKER_RE.match(stripped):
            normalized_lines.append(stripped)
            continue

        if any(pattern.match(stripped) for pattern in active_profile.noise_lines):
            continue

        line = _NUM_COMMA_COLON.sub(r"\1.", line)
        line = _ROMAN_COMMA_COLON.sub(r"\1.", line)
        line = _Q_COLON.sub(r"\1.", line)
        line = _QUESTION_L.sub(r"\1 1", line)
        line = _O_IN_MARKS.sub(r"\g<1>0 marks", line)
        line = _O_IN_BRACKETS.sub(r"\g<1>0\g<2>", line)
        line = _LEADING_L.sub(r"1\1", line)
        line = _ORDINAL_SUFFIX.sub(r"\1.", line)
        line = _ROMAN_S_SUFFIX.sub(r"\1.", line)

        normalized_lines.append(line)

    return "\n".join(normalized_lines)


# ---------------------------------------------------------------------------
# Question cleaning
# ---------------------------------------------------------------------------

# Standalone OCR debris between words. Only when surrounded by whitespace, so
# `|` inside `a|b` (which may be meaningful) is left alone.
_STANDALONE_ARTIFACT = re.compile(r"\s+[\\|_~^]\s+")
_EDGE_ARTIFACT = re.compile(r"^[\\|_~^]\s+|\s+[\\|_~^]$")


def clean_question_text(text: str) -> str:
    """Tidy a single question's text for display and storage.

    Joins broken lines, removes standalone OCR debris, collapses repeated
    punctuation and whitespace. Unlike :func:`normalize_for_identity` this
    preserves case and sentence punctuation, because the result is shown to
    students.
    """
    if not text:
        return ""

    cleaned = text.replace("\n", " ").replace("\r", " ")
    cleaned = _STANDALONE_ARTIFACT.sub(" ", cleaned)
    cleaned = _EDGE_ARTIFACT.sub(" ", cleaned)

    cleaned = re.sub(r"\.{3,}", ".", cleaned)
    cleaned = re.sub(r"\?{2,}", "?", cleaned)
    cleaned = re.sub(r"!{2,}", "!", cleaned)
    cleaned = re.sub(r"-{3,}", "-", cleaned)

    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def normalize_question_label(label: str) -> str:
    """Strip decorative punctuation from a question label. ``Q1.`` -> ``Q1``."""
    if not label:
        return ""
    return re.sub(r"^[.:;\-\s]+|[.:;\-\s]+$", "", label.strip())


# ---------------------------------------------------------------------------
# Identity normalization (D-011)
# ---------------------------------------------------------------------------

# Leading question labels, stripped so `Q1. Explain paging` and
# `5(a) Explain paging` yield the same identity. Numbering shifts between years;
# the question is the same question.
_LABEL_PREFIXES = (
    re.compile(r"^\s*(?:q|question)\s*\d+\s*[.:,\-]*\s*", re.IGNORECASE),
    re.compile(r"^\s*\d+\s*[.:\-]+\s*"),
    re.compile(r"^\s*\([a-z0-9]+\)\s*", re.IGNORECASE),
    re.compile(r"^\s*[a-z0-9]+\s*[).:\-]\s+", re.IGNORECASE),
)

# Characters preserved because they carry mathematical, scientific or
# programming meaning (D-011). Anything not matched here and not alphanumeric or
# whitespace is dropped as noise.
#
# Written as an explicit character class rather than "strip punctuation except X"
# so the approved set is readable at a glance and greppable.
PRESERVED_SYMBOLS = "^_'+-*/=<>!&|()[]{}"

_IDENTITY_NOISE = re.compile(
    r"[^\w\s" + re.escape(PRESERVED_SYMBOLS) + r"]",
)


def normalize_for_identity(text: str) -> str:
    """Reduce a question to the canonical form its identity is derived from.

    Applies exactly the rules Swayam approved in D-011:

    * lowercase
    * collapse runs of whitespace to a single space
    * strip a leading question label
    * **preserve** every character in :data:`PRESERVED_SYMBOLS`
    * drop other punctuation as noise

    >>> normalize_for_identity("Q1. Explain PAGING in virtual memory.")
    'explain paging in virtual memory'

    Math and code survive, so these stay distinct — the collision the previous
    implementation produced:

    >>> normalize_for_identity("Evaluate f(x) = x^2")
    'evaluate f(x) = x^2'
    >>> normalize_for_identity("Evaluate f(x) = x2")
    'evaluate f(x) = x2'

    Args:
        text: A single question's text.

    Returns:
        Canonical text for hashing. Never displayed to a user.
    """
    if not text:
        return ""

    normalized = text.lower()

    # Newlines first: a label prefix cannot be recognised across a line break.
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # Only the first matching prefix is stripped. Applying all four would eat
    # into content -- `1. (a) explain` should lose `1.` and `(a)`, but
    # `explain (a) versus (b)` must keep its parentheses.
    for pattern in _LABEL_PREFIXES:
        stripped, count = pattern.subn("", normalized, count=1)
        if count:
            normalized = stripped
            break

    normalized = _IDENTITY_NOISE.sub("", normalized)

    # Dropping noise can leave doubled spaces behind.
    return re.sub(r"\s+", " ", normalized).strip()


def compute_identity_hash(normalized_text: str) -> str:
    """SHA-256 of already-normalized text.

    Takes normalized text rather than raw text so a caller cannot accidentally
    hash unnormalized input and produce an identity that never matches. Pair it
    with :func:`normalize_for_identity`.
    """
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()


def question_identity(text: str) -> tuple[str, str, int]:
    """Return ``(normalized_text, hash, normalizer_version)`` for a question.

    The single entry point for computing identity, so every call site records the
    normalizer version alongside the hash it produced (D-011).
    """
    normalized = normalize_for_identity(text)
    return normalized, compute_identity_hash(normalized), NORMALIZER_VERSION
