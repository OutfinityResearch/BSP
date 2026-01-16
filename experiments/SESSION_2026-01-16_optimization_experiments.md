# Session Summary: Optimization Experiments
**Date:** 2026-01-16  
**Duration:** ~4 hours total  
**Status:** 2 experiments complete, documented

---

## Experiments Conducted

### 1. Template Learning ❌ FAILED

**Goal**: Reduce BPC from 2.20 → 1.80 (18%)

**Results**:
- Templates learned: 15
- Templates used: **0**
- BPC: 2.21 (+0.01, worse)
- Throughput: 221 l/s (-35%)

**Why Failed**: Train/test mismatch, too specific, no generalization

**Decision**: Disabled

**Documentation**: `EXPERIMENT_TEMPLATE_LEARNING.md`, `SESSION_2026-01-16_template_experiment.md`

---

### 2. Suffix Array for COPY ⚠️ PARTIAL

**Goal**: Increase throughput from 305 → 500+ l/s

**Results**:
- Quick test: 458 l/s (+50%) ✅
- Full test: 232 l/s (-24%) ❌
- BPC: No change
- COPY ops: Same (3,637)

**Why Failed**: Small context (256 tokens), frequent rebuilds, O(N log N) build cost > O(N×M) search savings

**Decision**: Disabled by default, available for large context (>1000 tokens)

**Documentation**: `EXPERIMENT_SUFFIX_ARRAY.md`

---

## Current State

| Metric | Start of Day | End of Day | Change |
|--------|--------------|------------|--------|
| BPC | 2.20 | 2.21 | +0.01 |
| Throughput | 338 l/s | 301 l/s | -11% |
| Program Wins | 85% | 85% | Same |
| COPY Ops | 3,637 | 3,637 | Same |

**Net Result**: Slight regression, but gained valuable insights

---

## Key Learnings

### What Doesn't Work

1. **Exact phrase templates** - Don't generalize across documents
2. **Suffix array for small N** - Build cost dominates for N < 1000
3. **Complex algorithms** - Simple O(N) can beat complex O(log N) for small N

### What Works

1. **COPY operations** - 85% win rate, proven effective
2. **Vocabulary decoupling** - Critical for correct costs
3. **Adaptive universe** - 21-33% cost reduction

### Insights

1. **COPY works because**: Matches recent context (same document)
2. **Templates fail because**: Try to match training data (different documents)
3. **Algorithmic complexity ≠ real performance**: Constant factors matter for small N

---

## Next Priorities (Updated)

### Priority 1: Rolling Hash Map 🎯

**Why**: O(1) lookup, no build cost overhead
- Hash first 3 tokens at each position
- Lookup candidates in O(1)
- Extend matches linearly

**Expected**: 301 → 400+ l/s

### Priority 2: Increase Context Size

**Current**: 256 tokens
**Proposed**: 1024 tokens

**Benefits**:
- More COPY opportunities
- Better BPC (more matches)
- Makes suffix array viable

### Priority 3: Frequency-Weighted Coding

**Target**: 2.21 → 1.90 BPC (14%)
- Huffman-style encoding
- High-frequency words cost less
- Well-understood, low risk

---

## Documentation Created Today

1. **`EXPERIMENT_TEMPLATE_LEARNING.md`** - Full analysis
2. **`SESSION_2026-01-16_template_experiment.md`** - Session summary
3. **`EXPERIMENT_SUFFIX_ARRAY.md`** - Full analysis
4. **`docs/guides/optimizations.html`** - Updated with results
5. **`optimisation_plan.md`** - Updated priorities
6. **DS-021** - Updated with findings

---

## Files Modified

```
src/core/BSPEngine.mjs
├── +sentenceBuffer (reverted)
└── +template learning (disabled)

src/core/CompressionMachine.mjs
├── Fixed _matchTemplate()
├── Fixed _tryTemplateEncoding()
├── +SuffixArray integration (disabled)
└── Template encoding commented out

src/core/utils/SuffixArray.mjs (NEW)
└── Complete implementation (available but not used)

src/core/index.mjs
└── +Export SuffixArray

docs/specs/DS/DS-021-compression-machine.md
└── Updated with experiment results
```

---

## Benchmark History

| Time | BPC | Throughput | Notes |
|------|-----|------------|-------|
| Morning | 2.20 | 338 l/s | Baseline (vocab fix) |
| +Templates | 2.21 | 221 l/s | Failed experiment |
| -Templates | 2.21 | 305 l/s | Restored |
| +Suffix Array | 2.21 | 232 l/s | Failed on full |
| -Suffix Array | 2.21 | 301 l/s | Current |

---

## Success Metrics

### Achieved ✅
- ✅ 2 experiments completed and documented
- ✅ Valuable insights gained
- ✅ System stable (BPC ≈ baseline)
- ✅ Comprehensive documentation

### Not Achieved ❌
- ❌ BPC improvement (target was 1.80)
- ❌ Throughput improvement (target was 500+)

### Lessons > Metrics
Both experiments failed but provided critical insights:
1. What doesn't work and why
2. When algorithms help vs hurt
3. Where to focus next (rolling hash, larger context)

---

## Next Session Plan

1. **Implement Rolling Hash Map** (2-3 hours)
   - Simple hash function for 3-token prefix
   - O(1) lookup
   - Expected: 400+ l/s

2. **Test Larger Context** (1 hour)
   - Increase from 256 → 1024 tokens
   - Measure BPC improvement
   - Re-test suffix array if beneficial

3. **Frequency Coding** (if time permits)
   - Track word frequencies
   - Build Huffman tree
   - Update cost calculations

---

**Status**: 🟡 Experiments complete, system stable, ready for next optimization round.
