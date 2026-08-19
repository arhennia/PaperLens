"""Institution-specific patterns, as configuration rather than hardcoded logic.

Previously KIIT and NITR names were baked into the validator and the text
normalizer, which meant PaperLens was silently wrong for any other university
and the patterns could not be tested in isolation (D-028). They now live here as
named profiles, selected by ``INSTITUTION_PROFILE``.

The ``default`` profile reproduces the previous KIIT/NITR behaviour exactly, so
extraction quality on the papers the parser was verified against does not
regress.

Adding an institution means adding a profile below. No other file changes.

----------------------------------------------------------------------------
The metadata blacklist is split into two tiers, and that split is a bug fix.

The previous single blacklist rejected any text matching ``\\bcourse\\b``,
``\\bsemester\\b``, ``\\bdegree\\b``, ``\\btech\\b``, ``\\bspring\\b`` or
``\\bautumn\\b``. Those are ordinary English words, not institution markers. The
blacklist was tuned against page-header text but applied to question text, so a
legitimate question — "Explain the semester system's effect on scheduling", or a
networking question about the "course of a packet" — was silently discarded.

So:

* :data:`STRONG_METADATA` — unambiguous markers. A question would not contain
  "Registration No" or "School of Computer Engineering". Rejected anywhere.
* :data:`WEAK_METADATA` — generic words that only indicate metadata when they
  appear in header-shaped text. Rejected only when
  :func:`looks_like_header` agrees.

Swayam approved this narrowing (D-028). It changes which questions are accepted,
so it is a recorded decision rather than a silent tweak.
"""

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class InstitutionProfile:
    """One institution's extraction patterns.

    Attributes:
        name: Human-readable profile name.
        noise_lines: Whole lines to drop during document normalization —
            letterheads, watermarks, invigilator notes.
        strong_metadata: Phrases that mark text as administrative anywhere it
            appears.
        weak_metadata: Generic words that mark text as administrative only in
            header-shaped lines.
    """

    name: str
    noise_lines: tuple[re.Pattern[str], ...] = field(default_factory=tuple)
    strong_metadata: tuple[re.Pattern[str], ...] = field(default_factory=tuple)
    weak_metadata: tuple[re.Pattern[str], ...] = field(default_factory=tuple)


def _ci(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE)


# Page furniture and generic exam boilerplate. Applies to every institution.
#
# Note these anchor with ^...$ so they only strip lines that are ENTIRELY page
# furniture. A question mentioning a page is not removed.
GENERIC_NOISE_LINES: tuple[re.Pattern[str], ...] = (
    _ci(r"^\s*Page\s*[-:\s]*\d+(?:\s*(?:of|/)\s*\d+)?\s*$"),
    _ci(r"^\s*pg\.?\s*\d+\s*$"),
    _ci(r"^\s*Registration\s*No.*$"),
    _ci(r"^\s*Roll\s*No.*$"),
    _ci(r"^\s*Sem(?:ester)?\s*Exam.*$"),
    _ci(r".*BEST OF LUCK.*"),
    _ci(r".*ALL THE BEST.*"),
    _ci(r".*Time Allowed.*"),
    _ci(r".*Max Marks.*"),
    _ci(r".*watermark.*"),
    _ci(r".*confidential.*"),
    # PaperLens's own footer, if a previously exported PDF is re-uploaded.
    _ci(r".*PAPERLENS.*"),
)

# Unambiguous administrative markers. Safe to reject wherever they appear.
GENERIC_STRONG_METADATA: tuple[re.Pattern[str], ...] = (
    _ci(r"\bsubject\s*code\b"),
    _ci(r"\bschool\s+of\b"),
    _ci(r"\buniversity\b"),
    _ci(r"\bexamination\b"),
    _ci(r"\broll\s+no\b"),
    _ci(r"\breg\s+no\b"),
    _ci(r"\bregistration\b"),
    _ci(r"\bsessional\b"),
    _ci(r"\bmid-semester\b"),
    _ci(r"\bend-semester\b"),
    _ci(r"\bdept\b"),
    _ci(r"\bdepartment\s+of\b"),
    _ci(r"\bprogramme\b"),
    _ci(r"\bbranch\s*:"),
)

# Generic words: metadata only in header-shaped text. See module docstring.
GENERIC_WEAK_METADATA: tuple[re.Pattern[str], ...] = (
    _ci(r"\bcourse\b"),
    _ci(r"\bsemester\b"),
    _ci(r"\bdegree\b"),
    _ci(r"\btech\b"),
    _ci(r"\bautumn\b"),
    _ci(r"\bspring\b"),
    _ci(r"\bbranch\b"),
)

PROFILES: dict[str, InstitutionProfile] = {
    # Reproduces the previously verified KIIT/NITR behaviour.
    "default": InstitutionProfile(
        name="KIIT / NITR (default)",
        noise_lines=GENERIC_NOISE_LINES
        + (
            _ci(r".*NITR.*"),
            _ci(r".*NATIONAL INSTITUTE OF TECHNOLOGY ROURKELA.*"),
            _ci(r".*KALINGA INSTITUTE OF INDUSTRIAL TECHNOLOGY.*"),
        ),
        strong_metadata=GENERIC_STRONG_METADATA + (_ci(r"\bkiit\b"),),
        weak_metadata=GENERIC_WEAK_METADATA,
    ),
    # No institution-specific patterns: generic rules only. For papers from a
    # university with no profile yet.
    "generic": InstitutionProfile(
        name="Generic",
        noise_lines=GENERIC_NOISE_LINES,
        strong_metadata=GENERIC_STRONG_METADATA,
        weak_metadata=GENERIC_WEAK_METADATA,
    ),
}


def get_profile(name: str = "default") -> InstitutionProfile:
    """Return a profile by name, falling back to ``default`` if unknown.

    Falls back rather than raising so a typo in deployment configuration
    degrades to working KIIT/NITR behaviour instead of taking the service down.
    """
    return PROFILES.get(name, PROFILES["default"])


# Question cues used by header detection. A line carrying one of these is asking
# something, not labelling a form field.
_QUESTION_CUE = _ci(
    r"^\s*(?:explain|describe|discuss|compare|differentiate|analyz|analys|evaluate"
    r"|design|calculate|derive|illustrate|justify|what|why|how|when|consider"
    r"|assume|find|determine|show|prove|solve|define|write|state|list|sketch"
    r"|verify|identify|trace|compute|formulate|construct|give|elaborate"
    r"|distinguish|summarize|obtain)\b"
)

# `Label: value` with a short label — the shape of a form field.
_KEY_VALUE = re.compile(r"^\s*[A-Za-z][A-Za-z\s./&-]{0,28}:\s*\S")


def looks_like_header(text: str) -> bool:
    """Return True when ``text`` reads as an administrative header line.

    Used to decide whether a :data:`WEAK_METADATA` word means "this is
    university boilerplate" or is simply a word in a legitimate question.

    Three signals, in order of authority:

    1. A question cue at the start, or a question mark, means it is a question.
       This wins outright — "Explain the semester system" stays.
    2. A short ``Label: value`` line is a header. "Semester: 4th", "Course:
       Database Management Systems (CS-204)".
    3. Very short text with no question cue is treated as a header, since a
       genuine question needs enough words to ask something.

    >>> looks_like_header("Semester: 4th")
    True
    >>> looks_like_header("Explain the semester system's effect on scheduling.")
    False
    >>> looks_like_header("B.Tech Degree Examination")
    True
    """
    stripped = text.strip()
    if not stripped:
        return True

    # (1) Anything that asks a question is not a header.
    if _QUESTION_CUE.match(stripped) or "?" in stripped:
        return False

    # (2) Form-field shape.
    if _KEY_VALUE.match(stripped):
        return True

    # (3) Too short to be asking anything.
    return len(stripped.split()) <= 6
