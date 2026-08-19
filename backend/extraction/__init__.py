"""PDF text extraction, OCR, question parsing, and validation.

Everything in this package is pure: text and dicts in, dicts out. No module here
imports the database. That is what makes extraction testable without Postgres and
is the biggest structural change from the previous code, where parsing and SQL
were interleaved in one function.

Persistence lives in :mod:`backend.db`.
"""
