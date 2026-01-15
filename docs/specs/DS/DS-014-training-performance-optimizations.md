# DS-014: Training Performance Optimizations (CPU, Sparse Ops)

**Version**: 1.1  
**Status**: Draft (partially implemented)  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

This document identifies the primary training hot path in BSP and specifies optimizations that improve throughput on CPU while keeping learning behavior consistent with DS-003.

Some items below are already implemented in the current codebase (marked explicitly). The rest are intended as a planning guide.

---

## 2. Hot Path Cost Model

For a single `engine.process(text)` call, the core work can be approximated by:

1. tokenization + feature extraction
2. candidate retrieval using the inverted index (`belongsTo`)
3. scoring candidates (`computeScore`)
4. selecting top groups (greedy selection)
5. updating memberships and deductions

Define:
- `|x|`: number of set bits in the input bitset
- `C`: number of candidate groups retrieved
- `K`: number of selected active groups (`topK`)
- `M`: index fan-out cap per identity (`maxGroupsPerIdentity`)

Then:
- Candidate retrieval worst case (with cap): `O(|x| * M)`
- Scoring (with sparse-input fast path): `O(C * |x|)`
- Greedy selection: `O(min(C, K) * |x|)`
- Membership updates: `O(K * |x|)` plus hallucination work

The dominating term is typically `O(C * |x|)`, where `C` is controlled primarily by index fan-out and token/feature choices.

---

## 3. Problem

BSP training is online and CPU-first, but the current hot-path can be slower than necessary due to:

1. Repeated set/bitset intersections during `activate()` scoring.
2. Allocation-heavy redundancy checks during greedy selection.
3. JS object overhead (many short-lived objects → GC pressure).
4. Candidate explosion for very frequent identities (high-degree inverse index).

---

## 4. Goals

- Increase throughput (inputs/sec) by 3–10× on common text datasets.
- Keep learning behavior consistent with DS-003 (online incremental learning).
- Reduce allocations in `activate()`, `computeScore()`, and `updateMemberships()`.

---

## 5. Optimizations

### 5.1 Implemented in the Current Codebase

1. **Sparse fast path for per-input bitsets**
   - `SimpleBitset.fromArray(bits)` stores `_sparseBits` for fast iteration.
   - `andCardinality(other)` uses sparse iteration when `other._sparseBits` is present.

2. **Greedy selection without temporary bitset allocations**
   - `Learner.activate()` uses an `explained` set of input bits and computes marginal value by iterating input bits.

3. **Candidate caps for high-degree identities**
   - `GroupStore` supports `maxGroupsPerIdentity` and evicts entries when a set exceeds the cap.
   - Eviction policies: `random | lowestUsage | lowestSalience`.

4. **Bounded deduction fan-out**
   - `DeductionGraph.maxEdgesPerNode` prunes weakest edges when exceeded.

5. **Optional subsampling of very frequent tokens**
   - `BSPEngine` supports Mikolov-style subsampling using document frequency as a proxy (via DS-012).

### 5.2 Sparse Fast-Path for Input Bitsets

Introduce an optional sparse representation for bitsets created from token IDs:

- When a `SimpleBitset` is built from a sparse array, store the array internally as `sparseBits`.
- Use `sparseBits` for:
  - iteration (`for (const bit of input)`)
  - `andCardinality()` by iterating the smaller sparse side and calling `has()`
- Invalidate `sparseBits` on mutating operations (`add/remove/orInPlace`).

Expected impact: intersection-based scoring becomes O(|input|) instead of scanning word arrays.

### 5.3 Greedy Selection Without Temporary Bitsets

Replace:

- `newBits = group.members.andNot(explained); marginal = newBits.andCardinality(input)`

With:

- Maintain a `Set` of *explained input bits* only.
- Compute marginal by iterating input bits and checking membership in the group.

Expected impact: removes per-candidate allocations and reduces CPU time.

### 5.4 Candidate Caps for High-Degree Identities

When an identity maps to too many groups:

- Cap per-identity contributions to candidates (e.g., max 256 group IDs per identity).
- Optionally bias selection toward groups with higher `usageCount` or `salience`.

Expected impact: avoids worst-case candidate explosion without changing normal behavior.

### 5.5 Amortized Maintenance Scheduling

Run expensive maintenance tasks with explicit caps:

- `consolidate(N)` uses a fixed budget per interval.
- `sleep consolidation` runs only when idle or at large intervals, and merges at most `M` groups per run.
- `decay/prune` are batched to reduce repeated scans.

---

## 6. Benchmarks & Metrics

### 6.1 Speed

- inputs/sec, lines/sec
- CPU time per `engine.process()`
- memory and GC pressure (Node `--trace-gc` / sampling)

### 6.2 Quality Proxies

- `avgSurprise` on a fixed held-out set
- groupCount/edgeCount growth curves
- LAMBADA top-k group-match accuracy (existing evaluation)

---

## 7. Acceptance Criteria

- Throughput ≥ 3× baseline on the same hardware and dataset.
- Surprise-rate degradation ≤ 5% over the same number of steps.

---

## 8. Implementation Checklist (Planning)

1. Add explicit budgets for maintenance tasks (max merges per sleep run, max prune scan per interval).
2. Expose decoding constants (seed bonus, repetition penalty) as config for easier tuning.
3. Add micro-benchmarks around:
   - candidate retrieval fan-out distribution
   - scoring cost vs `|x|`
4. Add regression tests to ensure optimizations do not change learning semantics beyond tolerated bounds.
