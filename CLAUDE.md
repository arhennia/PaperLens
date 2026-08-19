# PaperLens

Read `AGENTS.md` before making changes.

## Current priority

We are currently in Phase 0: Audit and baseline.

Do not proceed beyond the current phase without explicit approval
from Swayam.

## Code quality

Prefer:
- simple, readable code
- small focused functions
- explicit data flow
- descriptive names
- minimal abstraction
- reuse over duplication
- existing project patterns over unnecessary dependencies

Avoid:
- speculative features
- premature abstractions
- unnecessary wrappers
- duplicate utilities
- giant files
- clever code that is harder to understand
- adding dependencies without justification

Optimize for maintainability and clarity, not minimum line count.

## Context efficiency

Keep documentation concise.
Load detailed skills/references only when relevant.
Do not repeat information already documented in `AGENTS.md`.

## Verification

Do not claim something works without running the relevant check.
After substantive changes, run focused validation.

## Codebase organization

Optimize the project for beginner readability and team maintainability.

Prefer a boring, predictable structure over clever architecture.

Use these rules:
- File names should clearly describe what they contain.
- Keep related code together.
- Keep modules small and focused.
- Prefer direct imports and straightforward data flow.
- Avoid unnecessary abstraction layers, factories, wrappers, registries, and generic helpers.
- Do not create a folder merely to contain one file unless the boundary is meaningful.
- Do not introduce a design pattern unless it solves a real problem in this project.
- Reuse existing code before creating another utility.
- Keep server-only and browser code visibly separated.
- Keep database access in predictable locations.
- Keep feature-specific UI close to its feature.
- Prefer explicit code that a beginner can trace over highly abstract code.
- Comments should explain why, not restate what the code does.

A new teammate should be able to answer:
"Where would I look for code related to X?"
without understanding the entire architecture.

Do not optimize for minimum lines of code. Optimize for minimum unnecessary complexity.