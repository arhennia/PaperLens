"""Hierarchical exam question parser.

A state machine that walks a normalized document line by line and builds a
three-level question tree: main question, subquestion, sub-subquestion.

**This is a port, not a rewrite.** The previous implementation was verified
correct against deliberately noisy real papers (AUDIT.md 3.3) — it resolves the
roman/alphabetic ambiguity of ``i``/``v``/``x``, repairs duplicated labels, and
reports gaps in numbering. AGENTS.md is explicit that sound extraction logic
should be preserved rather than rewritten for style, so the algorithm and its
outputs are unchanged. What is new:

* **Real page numbers.** The loop reads the ``--- Page N (method) ---`` markers
  that :mod:`backend.extraction.pdf` injects and records, per question, the page
  it started on and how that page was extracted. Previously every question was
  stored with a hardcoded ``page_number = 1`` (AUDIT.md 4.7), which looked
  authoritative and was wrong — worse than having no reference at all (D-013).
* **Label paths.** Each question carries ``label_path`` (``Q5(a)(ii)``), which is
  part of its identity (D-011).
* Institution patterns come from configuration (D-028).

The parser is pure: text in, dicts out, no database.
"""

import re

from backend.extraction.marks import distribute_multiplier, extract_marks
from backend.extraction.normalize import normalize_document_text, parse_page_marker
from backend.extraction.patterns import InstitutionProfile

ROMAN_LOWER = [
    "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
    "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx",
]
ROMAN_UPPER = [r.upper() for r in ROMAN_LOWER]

# Letters that are both valid roman numerals and valid list letters. Which one is
# meant depends on the surrounding sequence, which is what SequenceTracker is for.
AMBIGUOUS_LETTERS = frozenset({"i", "v", "x"})


def get_marker_info(marker: str) -> tuple[str | None, int | None]:
    """Classify a bare label such as ``a``, ``B``, ``iv`` or ``3``.

    Returns:
        ``(type, value)`` where type is one of ``num``, ``alpha_lower``,
        ``alpha_upper``, ``roman_lower``, ``roman_upper``, ``overlap_lower``,
        ``overlap_upper``, or ``(None, None)`` if unrecognised. ``overlap_*``
        means the label is ambiguous and needs sequence context to resolve.
    """
    marker = marker.strip()
    if not marker:
        return None, None

    if marker.isdigit():
        return "num", int(marker)

    # Ambiguity check comes first: `i` is both roman 1 and letter 9.
    if marker.lower() in AMBIGUOUS_LETTERS:
        if marker.islower():
            return "overlap_lower", ROMAN_LOWER.index(marker) + 1
        return "overlap_upper", ROMAN_UPPER.index(marker.upper()) + 1

    if marker in ROMAN_LOWER:
        return "roman_lower", ROMAN_LOWER.index(marker) + 1
    if marker in ROMAN_UPPER:
        return "roman_upper", ROMAN_UPPER.index(marker) + 1

    if len(marker) == 1 and "a" <= marker <= "z":
        return "alpha_lower", ord(marker) - ord("a") + 1
    if len(marker) == 1 and "A" <= marker <= "Z":
        return "alpha_upper", ord(marker) - ord("A") + 1

    return None, None


class SequenceTracker:
    """Tracks one level of labels so gaps and duplicates can be detected.

    An exam paper's labels are a sequence, and knowing what should come next is
    what lets the parser both resolve ambiguity and notice OCR damage.
    """

    def __init__(self, expected_type: str | None = None) -> None:
        self.expected_type = expected_type
        self.values: list[int | None] = []
        self.raw_labels: list[str] = []

    def expected_next(self) -> int:
        """The value that should come next: one past the last known value."""
        for value in reversed(self.values):
            if value is not None:
                return value + 1
        return 1

    def add(self, value: int | None, raw_label: str) -> None:
        self.values.append(value)
        self.raw_labels.append(raw_label)


def expected_label_for(sequence_type: str | None, value: int) -> str:
    """Render ``value`` back into a label of ``sequence_type``. Inverse of lookup."""
    if sequence_type == "num":
        return str(value)
    if sequence_type == "alpha_lower" and 1 <= value <= 26:
        return chr(ord("a") + value - 1)
    if sequence_type == "alpha_upper" and 1 <= value <= 26:
        return chr(ord("A") + value - 1)
    if sequence_type == "roman_lower" and 1 <= value <= len(ROMAN_LOWER):
        return ROMAN_LOWER[value - 1]
    if sequence_type == "roman_upper" and 1 <= value <= len(ROMAN_UPPER):
        return ROMAN_UPPER[value - 1]
    return "?"


def resolve_marker(
    label: str, tracker: SequenceTracker | None
) -> tuple[str | None, int | None]:
    """Resolve a label's type and value, using sequence context for ambiguity.

    ``(i)`` after ``(h)`` is the letter i (9th). ``(i)`` starting a fresh list is
    roman one. Guessing wrong would misnumber a whole subquestion list, so the
    decision is made from what the tracker has already seen.
    """
    marker_type, value = get_marker_info(label)
    if not marker_type:
        return None, None

    if marker_type == "overlap_lower":
        alpha_value = ord(label.lower()) - ord("a") + 1
        if tracker and tracker.expected_type == "alpha_lower":
            if tracker.expected_next() == alpha_value or alpha_value in tracker.values:
                return "alpha_lower", alpha_value
            return "roman_lower", value
        return "roman_lower", value

    if marker_type == "overlap_upper":
        alpha_value = ord(label.upper()) - ord("A") + 1
        if tracker and tracker.expected_type == "alpha_upper":
            if tracker.expected_next() == alpha_value or alpha_value in tracker.values:
                return "alpha_upper", alpha_value
            return "roman_upper", value
        return "roman_upper", value

    return marker_type, value


# ---------------------------------------------------------------------------
# Line patterns
# ---------------------------------------------------------------------------

_SECTION = re.compile(
    r"^\s*(SECTION|PART|GROUP|SUB-SECTION)[\s.:\-]*([A-Z0-9ivxIVX]+)\b|"
    r"^\s*(Short\s+Answer|Long\s+Answer|Descriptive|Compulsory|Additional"
    r"|Multiple\s+Choice|Short|Long)\s+Questions\b",
    re.IGNORECASE,
)

_MAIN_QUESTION = re.compile(
    r"^\s*(?:Q|Question|QUESTION)\s*(\d+)\b[\s.:,\-]*|"
    r"^\s*(\d+)[.:\-]+\s*(?=[A-Za-z]|$)",
    re.IGNORECASE,
)

_SUBQUESTION = re.compile(r"^\s*(?:\(([a-zA-Z0-9]+)\)|([a-zA-Z0-9]+)[).:\-])\s*")


class ExamParser:
    """Parses one document into a hierarchical question list.

    One instance per document: the sequence trackers carry per-document state.
    """

    def __init__(self, profile: InstitutionProfile | None = None) -> None:
        self.profile = profile
        self.questions: list[dict] = []
        self.warnings: list[str] = []
        self.sections_found = 0

        self.current_section: str | None = None
        self.current_page = 1
        self.current_page_method = "text"

        self.active_main: dict | None = None
        self.active_sub: dict | None = None

        self.main_tracker = SequenceTracker("num")
        self.sub_tracker: SequenceTracker | None = None
        self.sub_sub_tracker: SequenceTracker | None = None

    # -- helpers ----------------------------------------------------------

    def _new_node(self, label_path: str, first_line: str) -> dict:
        """Create a question node stamped with the page it started on."""
        return {
            "label_path": label_path,
            "raw_lines": [first_line.strip()] if first_line.strip() else [],
            "subquestions": [],
            # Provenance, captured at creation: a multi-page question is
            # attributed to where it starts, which is where a student looking for
            # it should turn.
            "page_number": self.current_page,
            "page_method": self.current_page_method,
        }

    def _close_contexts(self) -> None:
        self.active_main = None
        self.active_sub = None
        self.sub_tracker = None
        self.sub_sub_tracker = None

    # -- main loop --------------------------------------------------------

    def parse(self, text: str) -> list[dict]:
        """Parse ``text`` into a list of question dicts."""
        normalized = normalize_document_text(text, self.profile)

        for line in normalized.splitlines():
            stripped = line.strip()
            if not stripped:
                continue

            # Page marker: update provenance and consume. Must come first, so a
            # marker is never mistaken for content.
            marker = parse_page_marker(stripped)
            if marker:
                self.current_page, self.current_page_method = marker
                continue

            if self._handle_section(line, stripped):
                continue
            if self._handle_main_question(line):
                continue
            if self._handle_subquestion(line):
                continue

            self._append_continuation(stripped)

        self._check_main_sequence()
        return self._finalize()

    def _handle_section(self, line: str, stripped: str) -> bool:
        match = _SECTION.match(line)
        if not match:
            return False

        self.sections_found += 1
        if match.group(1):
            section_type = match.group(1).upper()
            section_value = (match.group(2) or "").upper()
            self.current_section = f"{section_type} {section_value}".strip()
        elif self.current_section and any(
            keyword in self.current_section
            for keyword in ("SECTION", "PART", "GROUP", "SUB-SECTION")
        ):
            # `SECTION A` followed by `Short Answer Questions` describes one
            # section, so the descriptor is appended rather than replacing it.
            self.current_section = f"{self.current_section} - {stripped}"
        else:
            self.current_section = stripped

        self._close_contexts()
        return True

    def _handle_main_question(self, line: str) -> bool:
        match = _MAIN_QUESTION.match(line)
        if not match:
            return False

        number_text = match.group(1) or match.group(2)
        value = int(number_text)

        # A bare number could open a new main question or be a numbered
        # subquestion under the current one. Treat it as main only if it
        # continues the main sequence -- otherwise `1.` inside Q4's list would
        # silently start a new Q1.
        if not (
            value == self.main_tracker.expected_next()
            or value > self.main_tracker.expected_next()
            or not self.active_main
        ):
            return False

        label = f"Q{value}"
        remaining = line[match.end() :]
        self.main_tracker.add(value, number_text)

        self.active_main = self._new_node(label, remaining)
        self.active_main["section"] = self.current_section
        self.questions.append(self.active_main)
        self.active_sub = None
        self.sub_tracker = None
        self.sub_sub_tracker = None

        # `Q5. (a) Discuss...` opens a subquestion on the same line.
        sub_match = _SUBQUESTION.match(remaining)
        if sub_match:
            sub_label = sub_match.group(1) or sub_match.group(2)
            sub_text = remaining[sub_match.end() :]

            # The parent's own text ends where the subquestion begins.
            self.active_main["raw_lines"] = [remaining[: sub_match.start()].strip()]
            self.active_main["raw_lines"] = [
                part for part in self.active_main["raw_lines"] if part
            ]

            self.sub_tracker = SequenceTracker()
            sub_type, sub_value = resolve_marker(sub_label, self.sub_tracker)
            self.sub_tracker.expected_type = sub_type
            self.sub_tracker.add(sub_value, sub_label)

            self.active_sub = self._new_node(f"{label}({sub_label})", sub_text)
            self.active_main["subquestions"].append(self.active_sub)
            self.sub_sub_tracker = None

        return True

    def _handle_subquestion(self, line: str) -> bool:
        match = _SUBQUESTION.match(line)
        if not match or not self.active_main:
            return False

        sub_label = match.group(1) or match.group(2)
        sub_text = line[match.end() :]

        level, resolved_type, resolved_value = self._resolve_level(sub_label)
        tracker = self.sub_sub_tracker if level == 3 else self.sub_tracker
        if tracker is None:
            return False

        sub_label = self._record_label(tracker, sub_label, resolved_value)

        if level == 2:
            self.active_sub = self._new_node(
                f"{self.active_main['label_path']}({sub_label})", sub_text
            )
            self.active_main["subquestions"].append(self.active_sub)
            self.sub_sub_tracker = None
        elif self.active_sub is not None:
            self.active_sub["subquestions"].append(
                self._new_node(f"{self.active_sub['label_path']}({sub_label})", sub_text)
            )

        return True

    def _resolve_level(self, sub_label: str) -> tuple[int, str | None, int | None]:
        """Decide whether a label belongs at level 2 or level 3.

        A label that matches the deeper tracker's type is a sub-subquestion; one
        matching the level-2 tracker's type continues that list; anything else
        starts a new level.
        """
        if not self.sub_tracker:
            self.sub_tracker = SequenceTracker()
            resolved_type, resolved_value = resolve_marker(sub_label, self.sub_tracker)
            self.sub_tracker.expected_type = resolved_type
            return 2, resolved_type, resolved_value

        if self.sub_sub_tracker:
            resolved_type, resolved_value = resolve_marker(
                sub_label, self.sub_sub_tracker
            )
            if resolved_type == self.sub_sub_tracker.expected_type:
                return 3, resolved_type, resolved_value

        resolved_type, resolved_value = resolve_marker(sub_label, self.sub_tracker)
        if resolved_type == self.sub_tracker.expected_type:
            return 2, resolved_type, resolved_value

        # A different label type. Descend to level 3 if a subquestion is open --
        # `(a)` then `(i)` is a nested list -- otherwise restart level 2.
        if self.active_sub:
            self.sub_sub_tracker = SequenceTracker()
            resolved_type, resolved_value = resolve_marker(
                sub_label, self.sub_sub_tracker
            )
            self.sub_sub_tracker.expected_type = resolved_type
            return 3, resolved_type, resolved_value

        self.sub_tracker = SequenceTracker()
        resolved_type, resolved_value = resolve_marker(sub_label, self.sub_tracker)
        self.sub_tracker.expected_type = resolved_type
        return 2, resolved_type, resolved_value

    def _record_label(
        self, tracker: SequenceTracker, sub_label: str, resolved_value: int | None
    ) -> str:
        """Record a label, repairing duplicates and warning about gaps.

        A repeated label is usually OCR damage — ``(c)`` misread as ``(b)`` when
        ``(b)`` already exists — so it is corrected to the expected next value
        and a warning is raised. A skipped label suggests a missing question,
        which is reported but not invented.
        """
        if resolved_value is not None and resolved_value in tracker.values:
            expected_value = tracker.expected_next()
            expected_label = expected_label_for(tracker.expected_type, expected_value)
            self.warnings.append(
                f"Broken alphabet sequence near {self.active_main['label_path']}. "
                f"Corrected duplicate '{sub_label}' to '{expected_label}'."
            )
            tracker.add(expected_value, expected_label)
            return expected_label

        expected_value = tracker.expected_next()
        if (
            tracker.values
            and resolved_value is not None
            and resolved_value > expected_value
        ):
            missing = [
                expected_label_for(tracker.expected_type, value)
                for value in range(expected_value, resolved_value)
            ]
            self.warnings.append(
                f"Warning: Missing subquestion {', '.join(missing)} "
                f"in {self.active_main['label_path']}."
            )

        tracker.add(resolved_value, sub_label)
        return sub_label

    def _append_continuation(self, stripped: str) -> None:
        """Append a plain text line to the deepest open question."""
        if not self.active_main:
            return
        if self.active_sub:
            if self.active_sub["subquestions"]:
                self.active_sub["subquestions"][-1]["raw_lines"].append(stripped)
            else:
                self.active_sub["raw_lines"].append(stripped)
        else:
            self.active_main["raw_lines"].append(stripped)

    def _check_main_sequence(self) -> None:
        """Warn about main questions missing from the middle of the sequence."""
        values = [value for value in self.main_tracker.values if value is not None]
        if not values:
            return

        seen = sorted(set(values))
        missing = [f"Q{n}" for n in range(seen[0], seen[-1] + 1) if n not in seen]
        if not missing:
            return

        if len(missing) == 1:
            self.warnings.append(f"Warning: Missing question {missing[0]}.")
        elif len(missing) <= 3:
            self.warnings.append(f"Warning: Missing questions {', '.join(missing)}.")
        else:
            self.warnings.append(
                f"Warning: Missing questions {missing[0]} to {missing[-1]}."
            )

    # -- output -----------------------------------------------------------

    def _finalize(self) -> list[dict]:
        """Join raw lines, extract marks, and shape the output tree."""
        result = []
        for question in self.questions:
            text, marks, pattern = extract_marks(
                " ".join(question["raw_lines"]).strip()
            )
            text = text.strip().rstrip(".:,-").strip()

            marks_per_sub = None
            if isinstance(marks, str) and "x" in marks.lower():
                total, marks_per_sub = distribute_multiplier(
                    marks, len(question["subquestions"])
                )
                if total is not None:
                    marks = total

            item = {
                "label_path": question["label_path"],
                "text": text or "[Subquestions Only]",
                "page_number": question["page_number"],
                "page_method": question["page_method"],
                "section": question.get("section"),
                "marks": marks,
                "mark_pattern": pattern,
                "subquestions": [
                    self._finalize_sub(sub, marks_per_sub, pattern)
                    for sub in question["subquestions"]
                ],
            }
            result.append(item)
        return result

    def _finalize_sub(
        self, sub: dict, marks_per_sub: float | None, parent_pattern: str | None
    ) -> dict:
        text, marks, pattern = extract_marks(" ".join(sub["raw_lines"]).strip())
        text = text.strip().rstrip(".:,-").strip()

        # An explicit annotation on the subquestion always wins over a value
        # distributed from the parent's multiplier.
        if marks is None and marks_per_sub is not None:
            marks = marks_per_sub
            pattern = f"Distributed from multiplier {parent_pattern}"

        return {
            "label_path": sub["label_path"],
            "text": text,
            "page_number": sub["page_number"],
            "page_method": sub["page_method"],
            "marks": marks,
            "mark_pattern": pattern,
            "subquestions": [
                self._finalize_sub(nested, None, None)
                for nested in sub["subquestions"]
            ],
        }


def parse_questions(
    text: str, profile: InstitutionProfile | None = None
) -> tuple[list[dict], int, list[str]]:
    """Parse a document into questions.

    Args:
        text: Extracted document text, including page markers.
        profile: Institution patterns (D-028). Defaults to the configured one.

    Returns:
        ``(questions, sections_found, warnings)``.
    """
    parser = ExamParser(profile)
    questions = parser.parse(text)

    if not questions:
        parser.warnings.append("Parser failure: No questions detected in the document.")

    return questions, parser.sections_found, parser.warnings


def flatten_leaf_questions(questions: list[dict]) -> list[dict]:
    """Flatten the question tree to its leaves, carrying parent context down.

    Only leaves are stored: a parent that merely introduces subquestions is not
    itself a question. Its text is prepended to each child, so ``Q5. Consider a
    system with 4 frames.`` followed by ``(a) How many page faults?`` is stored as
    one self-contained question rather than a fragment that means nothing alone.

    Returns:
        Leaf dicts with ``label_path``, ``text``, ``page_number``,
        ``page_method``, ``marks`` and ``section``.
    """
    leaves: list[dict] = []

    def walk(nodes: list[dict], parent_context: str, section: str | None) -> None:
        for node in nodes:
            text = node.get("text") or ""
            own_section = node.get("section") or section

            if node.get("subquestions"):
                walk(node["subquestions"], _extend_context(parent_context, text), own_section)
                continue

            leaves.append(
                {
                    "label_path": node["label_path"],
                    "text": _combine_context(parent_context, text),
                    "page_number": node.get("page_number"),
                    "page_method": node.get("page_method"),
                    "marks": node.get("marks"),
                    "section": own_section,
                }
            )

    walk(questions, "", None)
    return leaves


def _extend_context(context: str, text: str) -> str:
    """Add a parent's text to the context passed to its children."""
    cleaned = (text or "").strip()
    if not cleaned or cleaned == "[Subquestions Only]":
        return context
    if not context:
        return cleaned
    return f"{context.rstrip('.:,-')}: {cleaned}"


def _combine_context(context: str, text: str) -> str:
    """Prefix a leaf with its parent context, unless that would duplicate it."""
    leaf = (text or "").strip()
    if not context:
        return leaf
    if not leaf:
        return context

    # Skip the prefix when one already contains the other, which happens when a
    # parent's text was repeated in its child.
    lowered_context, lowered_leaf = context.lower(), leaf.lower()
    if lowered_context in lowered_leaf or lowered_leaf in lowered_context:
        return leaf

    return f"{context.rstrip('.:,-')}: {leaf}"
