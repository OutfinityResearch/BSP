# BSP Backlog (Consolidated)

This backlog consolidates:

- The Discovery evaluation plan defined by `docs/specs/DS/DS-019-synthetic-evaluation.md`.
- All useful items from the legacy `todo.backlog` (merged, de-duplicated, and re-scoped where needed).

Scope:
- Benchmark-comparison tasks are intentionally excluded from this backlog.

Priority is implied by **chapter order**. Within a chapter, tasks are ordered by prerequisites and dependency flow.

Each task includes:

- **Description:** what/why
- **Proposal:** what to implement (detailed, reviewable plan)
- **Check:** how to verify correctness

---

## Chapter 2 — Discovery Evals (Synthetic / Artificial, Architecture Discovery)

## Chapter 3 — Experimentation (Ablations, Optimization, Learning-Speed Engineering)

## Chapter 4 — Reporting & Visualization (Non-core, Useful for Review)

## Chapter 5 — Documentation & Spec Hygiene

### DOC-001 — Fix English-only policy violations and DS inconsistencies
Chapter: Documentation & Spec Hygiene

Description:
Some DS docs contain non-English fragments and duplicated legacy content. DS-002 suggests external dependencies that conflict with the repo’s “no external runtime deps” policy.

Proposal:
- Fix DS-007: remove/translate the Romanian fragment to English.
- Remove duplicated legacy sections in:
  - DS-010 (post “Implementation Status” duplication)
  - DS-016 (duplicated sections appended at end)
- Align DS-002 with reality:
  - remove external dependency suggestions and replace them with built-in equivalents
  - ensure DS-018’s policy is consistent across specs
- Clarify DS-006 examples that mention external libraries by replacing them with built-in alternatives.

Expected file changes:
- `docs/specs/DS/DS-007-serialization-sessions.md`
- `docs/specs/DS/DS-010-memory-consolidation.md`
- `docs/specs/DS/DS-016-reasoning-curriculum-and-data.md`
- `docs/specs/DS/DS-002-data-structures.md`
- `docs/specs/DS/DS-006-http-server-chat.md` (clarifications only)

Check:
- Grep for Romanian fragments returns none in `docs/specs/DS/`.
- DS-002/DS-018 policies no longer conflict.

---

### DOC-002 — Document how to run Discovery evals (and keep docs in sync)
Chapter: Documentation & Spec Hygiene

Description:
Users need clear entry points for Discovery evaluation. Current docs reference scripts that have evolved.

Proposal:
- Update:
  - `README.md` with:
    - “Discovery evals” section
    - minimal commands to run it end-to-end
  - `docs/eval.html` to reflect the Discovery eval structure and script names
- Ensure docs do not suggest external runtime dependencies.

Expected file changes:
- `README.md`
- `docs/eval.html`

Check:
- Following README instructions from a clean checkout yields a successful run of one Discovery eval.

---

## Chapter 6 — Operations (CI, QA, Packaging)

### OPS-001 — Continuous benchmarking in CI (fast PR + nightly full runs)
Chapter: Operations

Description:
Regression tracking requires automation, but full benchmarks can be expensive.

Proposal:
- Add CI scripts:
  - PR: run fast unit tests + small eval smoke tests (tiny subsets)
  - Nightly: run the full Discovery suite + save results artifacts
- Store results in JSON artifacts only; do not commit benchmark results to git.

Expected file changes:
- NEW: `.github/workflows/benchmarks.yml`
- NEW: `evals/ci/*.mjs`

Check:
- CI fails on real regressions (e.g., import errors) and does not “pass” with mock scores.

---

### OPS-002 — Improve test reliability and perf gating
Chapter: Operations

Description:
Long-running or flaky tests undermine iteration speed. Perf tests should be gated or labeled.

Proposal:
- Ensure all async tests have timeouts.
- Gate perf tests behind an env var (e.g., `BSP_TEST_PERF=1`) if not already.
- Add targeted unit tests for DeductionGraph invariants and for any new dataset loaders.

Expected file changes:
- `tests/*` as needed
- `tests/_runner.mjs`

Check:
- `npm test` completes reliably and deterministically.
- Perf tests run only when explicitly enabled.
