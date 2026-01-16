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

## Chapter 6 — Quality (Tests, Perf Gating)

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
