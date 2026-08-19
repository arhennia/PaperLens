"""Tests for the PaperLens processing service.

A package rather than a bare directory so ``from backend.tests.conftest import
make_pdf`` resolves. The previous suite relied on per-file ``sys.path``
manipulation, which appended the wrong directory and made every test unrunnable
(AUDIT.md 4.4).
"""
