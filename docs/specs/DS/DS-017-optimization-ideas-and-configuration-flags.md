# DS-017: Optimization Ideas and Configuration Flags (Scaling Training)

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Scope

This document consolidates:

- concrete performance optimizations for training throughput and memory
- a unified set of configuration flags (engine + training scripts)
- traditional-ML techniques that reduce wasted work and improve sample efficiency

This DS complements:

- DS-014 (training performance hot-path optimizations)
- DS-015 (conversational data + feedback)
- DS-016 (reasoning curriculum + synthetic data)

---

## 2. High-Level Strategy (Scale With Less Waste)

### 2.1 Make the Hot Path O(|input|), Not O(|universe|)

For each `process(text)` call:

1. tokenization / feature extraction (cacheable, streamable)
2. candidate retrieval (must be aggressively bounded)
3. scoring (prefer sparse iteration)
4. updates (avoid touching large structures unless necessary)

### 2.2 Two-Stage Retrieval + Scoring

Use a fast approximate stage to prune candidates, then run exact scoring on a small shortlist:

- Stage A (cheap): approximate similarity / hashing / capped inverted index
- Stage B (exact): overlap/Jaccard on shortlisted groups only

---

## 3. Optimization Ideas (Implementation-Level)

### 3.1 Bitset Backend Choice

Provide a pluggable backend for group membership and large set ops:

- `SimpleBitset` (portable, fast `has()`, dense memory)
- `Roaring` (compressed, fast bulk AND/OR/DIFF, native dep)

Important: if the scoring path relies on many `has()` calls, Roaring may not help unless we refactor to use bulk ops (e.g. `andCardinality` implemented natively).

**Recommendation**
- Keep `SimpleBitset` for very small universes and low group counts.
- Prefer Roaring or an adaptive sparse container for large universes (≥ 1e6) or large group stores.

### 3.2 Adaptive Group Members (Small-Set Fast Path)

Instead of storing every group as a dense bitset, use an adaptive representation:

- small groups: sorted `Uint32Array` (binary search for `has`, fast intersection via two-pointer)
- large groups: bitset/roaring container (fast bulk operations)

This mirrors Roaring’s container approach and can remove most memory pressure without a native dependency.

### 3.3 Capped Inverted Index for “Hot” Identities

For very frequent tokens/features, `belongsTo[id]` can explode.

Options:

- cap per identity: keep only top-N group IDs (by `usageCount` or `salience`)
- probabilistic drop: keep a random sample (reservoir sampling)
- “hot token” down-weighting: do not use hot identities for candidate retrieval (similar to stopword subsampling)

### 3.4 Subsampling Frequent Tokens (Classic Word2Vec Trick)

For candidate retrieval and group creation, downsample very frequent tokens:

- compute token frequency (online)
- drop token occurrences with probability `p_drop(token)` increasing with frequency

This reduces wasted work on function words and stabilizes semantic groups.

### 3.5 Heavy-Hitter Tracking for MemberCounts (Space-Saving)

Per-group `memberCounts` can grow without bound.

Use a heavy-hitter algorithm (Space-Saving / Lossy Counting) to keep only the top-K members per group:

- keep exact counts for top members
- evict long-tail members periodically

This reduces memory and makes merges/splits cheaper.

### 3.6 Count-Min Sketch for Co-occurrence / Deductions (Optional)

For high-volume training, exact counting maps become expensive.

Use a Count-Min Sketch (CMS) to approximate:

- co-occurrence counts (pair frequencies)
- deduction edge weights (for weak edges)

Then materialize exact edges only when counts exceed a threshold.

### 3.7 Two-Level Maintenance Budgeting

Avoid “random spikes” in CPU time:

- run `decay`/`prune` on a fixed budget (e.g., scan only M groups per step)
- run `consolidate` with a fixed episode budget
- run sleep consolidation only when idle, or with `maxMergesPerRun`

### 3.8 Dataset Hygiene (Reduces Work, Improves Quality)

Before training on huge corpora:

- deduplicate lines (exact hash) and optionally near-deduplicate (SimHash)
- filter extremely short/long lines
- remove boilerplate (headers/TOC, already done in corpus downloader)

---

## 4. Traditional-ML Techniques to Scale Training

### 4.1 Approximate Nearest Neighbor for Group Retrieval

Instead of `belongsTo` union over all input bits:

- compute a group “signature” (MinHash over member set, k=32..128)
- store groups in LSH buckets
- retrieve candidates from buckets, then compute exact overlap/Jaccard

This trades perfect recall for massive speedups at scale.

### 4.2 Online Clustering for Consolidation

Replace O(N²) merging with approximate clustering:

- hierarchical clustering approximation (already in DS-010)
- DBSCAN-like clustering using LSH neighbors
- incremental centroid-like prototypes (for sparse sets: keep top members as prototype)

### 4.3 Language-Modeling Baselines (Cheap, Useful)

For better generation with fewer examples:

- add smoothing to the bigram model (Kneser–Ney / Witten–Bell / add-α)
- use backoff (bigram → unigram) when counts are low

This improves early-stage coherence without requiring huge corpora.

### 4.4 Active Learning / Hard Example Mining

Use the system’s own signals to focus training:

- prioritize lines with high surprise (novelty)
- prioritize lines with strong positive/negative feedback (utility)
- prioritize contradictions/corrections (stabilizes behavior quickly)

This is a classic “hard example mining” loop and improves sample efficiency.

---

## 5. Configuration Flags (Proposed)

### 5.1 Engine Flags

**Core**
- `engine.universeSize` (number): identity space size
- `engine.maxGroups` (number): max number of groups
- `engine.rlPressure` (number 0..1)

**Tokenizer**
- `tokenizer.useVocab` (boolean)
- `tokenizer.ngramMin` / `tokenizer.ngramMax` (number)
- `tokenizer.ngramSizes` (number[]) (convenience)
- `tokenizer.subsampleHotTokens` (boolean)
- `tokenizer.subsampleThreshold` (number) (frequency threshold)

**Learner**
- `learner.topK` (number)
- `learner.activationThreshold` (number)
- `learner.membershipThreshold` (number)
- `learner.alpha` / `learner.alphaDecay` / `learner.alphaDeduction` (number)
- `learner.newGroupThreshold` (number)
- `learner.minGroupSize` (number)
- `learner.mergeThreshold` (number)
- `learner.sizePenalty` (number)
- `learner.memberCountsTopK` (number) (heavy-hitter cap)

**GroupStore / Index**
- `index.maxGroupsPerIdentity` (number) (cap for hot identities)
- `index.hotIdentityDropPolicy` (`"none"|"cap"|"sample"|"ignore"`)

**DeductionGraph**
- `deduction.threshold` (number)
- `deduction.decayFactor` (number)
- `deduction.maxEdgesPerNode` (number)

**SequenceModel**
- `sequence.maxTransitions` (number)
- `sequence.maxVocab` (number)
- `sequence.smoothing` (`"none"|"addAlpha"|"wittenBell"|"kneserNey"`)
- `sequence.smoothingAlpha` (number)

**Maintenance Budgets**
- `maintenance.decayInterval` (number)
- `maintenance.consolidateInterval` (number)
- `maintenance.consolidateEpisodes` (number)
- `maintenance.sleepInterval` (number)
- `maintenance.maxMergesPerSleep` (number)
- `maintenance.pruneInterval` (number)

**Bitset Backend**
- `bitset.backend` (`"simple"|"roaring"|"adaptive"`)
- `bitset.roaringWasmOrNative` (`"native"|"wasm"`) (optional)

### 5.2 Training Script Flags

Applies to `scripts/pretrain.mjs` / future train pipelines:

- `--epochs`
- `--batchSize`
- `--maxSentences`
- `--shuffle`
- `--minLen` / `--maxLen`
- `--dedup` / `--nearDedup`
- `--rho` (rl pressure)
- `--backend` (bitset backend)

---

## 6. Recommended Defaults (Large-Corpus CPU)

- `tokenizer.ngramSizes = [1,2]` initially (reduce feature explosion)
- `learner.topK = 8..16`, `index.maxGroupsPerIdentity = 256`
- `deduction.maxEdgesPerNode = 50..200` with pruning
- maintenance budgets capped (no unbounded full scans)

---

## 7. Next Steps

1. Choose `bitset.backend` strategy (simple vs adaptive vs roaring).
2. Implement index caps and hot-token subsampling.
3. Add a streaming training pipeline with dedup + filtering.
4. Benchmark on WikiText-2 / Gutenberg corpus with throughput + quality proxies.
