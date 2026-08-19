"""PaperLens processing service.

Imports use the ``backend.`` prefix throughout (``from backend.config import ...``)
so the package resolves the same way whether it is run as ``uvicorn
backend.main:app`` from the repository root or imported by pytest. The previous
layout relied on ``sys.path`` manipulation inside each test file, which appended
the wrong directory and made every test unrunnable (AUDIT.md 4.4).
"""
