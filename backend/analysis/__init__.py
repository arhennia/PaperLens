"""Deduplication, similarity, topic classification, scoring, and analytics.

Like :mod:`backend.extraction`, everything here is pure: dicts in, dicts out, no
database imports. The previous implementation interleaved SQL with scoring inside
the same functions, which is why none of it could be tested without a database
and why its non-determinism went unnoticed.

Two invariants hold across this package, and conflating them would break the
product's main guarantee:

* **Exact hashing is authoritative.** Two questions with the same
  ``normalized_hash`` in a folder are the same question. This drives repeat
  counts, weightage and priority (D-011, D-024).
* **Similarity is advisory.** Fuzzy matching may group, badge and nudge a score.
  It may never merge two identities (D-024).

Everything here is also deterministic: same inputs, same outputs, byte for byte
(D-014). Any function that sorts before iterating does so deliberately.
"""
