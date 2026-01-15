# DS-014: Training Performance Optimizations (CPU, Sparse Ops)

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Problem

BSP training is online and CPU-first, but the current hot-path can be slower than necessary due to:

1. Repeated set/bitset intersections during `activate()` scoring.
2. Allocation-heavy redundancy checks during greedy selection.
3. JS object overhead (many short-lived objects → GC pressure).
4. Candidate explosion for very frequent identities (high-degree inverse index).

---

## 2. Goals

- Increase throughput (inputs/sec) by 3–10× on common text datasets.
- Keep learning behavior consistent with DS-003 (online incremental learning).
- Reduce allocations in `activate()`, `computeScore()`, and `updateMemberships()`.

---

## 3. Proposed Optimizations

### 3.1 Sparse Fast-Path for Input Bitsets

Introduce an optional sparse representation for bitsets created from token IDs:

- When a `SimpleBitset` is built from a sparse array, store the array internally as `sparseBits`.
- Use `sparseBits` for:
  - iteration (`for (const bit of input)`)
  - `andCardinality()` by iterating the smaller sparse side and calling `has()`
- Invalidate `sparseBits` on mutating operations (`add/remove/orInPlace`).

Expected impact: intersection-based scoring becomes O(|input|) instead of scanning word arrays.

### 3.2 Greedy Selection Without Temporary Bitsets

Replace:

- `newBits = group.members.andNot(explained); marginal = newBits.andCardinality(input)`

With:

- Maintain a `Set` of *explained input bits* only.
- Compute marginal by iterating input bits and checking membership in the group.

Expected impact: removes per-candidate allocations and reduces CPU time.

### 3.3 Candidate Caps for High-Degree Identities

When an identity maps to too many groups:

- Cap per-identity contributions to candidates (e.g., max 256 group IDs per identity).
- Optionally bias selection toward groups with higher `usageCount` or `salience`.

Expected impact: avoids worst-case candidate explosion without changing normal behavior.

### 3.4 Amortized Maintenance Scheduling

Run expensive maintenance tasks with explicit caps:

- `consolidate(N)` uses a fixed budget per interval.
- `sleep consolidation` runs only when idle or at large intervals, and merges at most `M` groups per run.
- `decay/prune` are batched to reduce repeated scans.

---

## 4. Benchmarks & Metrics

### 4.1 Speed

- inputs/sec, lines/sec
- CPU time per `engine.process()`
- memory and GC pressure (Node `--trace-gc` / sampling)

### 4.2 Quality Proxies

- `avgSurprise` on a fixed held-out set
- groupCount/edgeCount growth curves
- LAMBADA top-k group-match accuracy (existing evaluation)

---

## 5. Acceptance Criteria

- Throughput ≥ 3× baseline on the same hardware and dataset.
- Surprise-rate degradation ≤ 5% over the same number of steps.

