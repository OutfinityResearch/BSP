# BSP Optimization Session Summary
**Date:** 2026-01-16  
**Duration:** ~6 hours  
**Status:** ✅ Significant improvements achieved

---

## Optimizations Completed

### 1. ✅ Vocabulary Decoupling (Morning)
- **Problem**: N-gram vocab inflating compression costs
- **Solution**: Separate vocabs for grouping vs compression
- **Result**: BPC 2.79 → 2.20 (-21%)

### 2. ✅ Rolling Hash Map
- **Problem**: O(N×M) linear COPY search
- **Solution**: O(1) hash-based lookup
- **Result**: Throughput +3%, scales well

### 3. ✅ Increase Context Size
- **Problem**: 256 tokens too small
- **Solution**: Increase to 1024 tokens
- **Result**: BPC 2.21 → 2.15 (-3%), COPY ops +21%

---

## Optimizations Tested & Disabled

### 4. ❌ Template Learning
- 15 templates learned, 0 used
- Train/test mismatch, too specific
- Throughput -35%
- **Decision**: Disabled

### 5. ⚠️ Suffix Array
- Works for N>1000, fails for N=256
- Build cost > search savings
- **Decision**: Disabled by default, available for large context

### 6. ⚠️ Frequency-Weighted Coding
- Breaks operator cost comparison
- COPY ops dropped 82%
- Needs major refactoring
- **Decision**: Disabled, needs more work

---

## Final Results

| Metric | Start of Day | End of Day | Improvement |
|--------|--------------|------------|-------------|
| **BPC** | 2.79 | **2.15** | **-23%** ✅ |
| **vs Gzip** | -15.7% | **+10.9%** | **+26.6%** ✅ |
| **Throughput** | ~300 l/s | **319 l/s** | +6% ✅ |
| **COPY Ops** | 3,637 | **4,395** | +21% ✅ |
| **Avg Savings** | 26.4 bits | **37.8 bits** | +43% ✅ |
| **Program Wins** | 85% | **87.5%** | +2.5% ✅ |
| **Context Size** | 256 | **1024** | 4x ✅ |

---

## Key Learnings

### What Works
1. **Vocabulary decoupling** - Critical for correct costs
2. **Larger context** - More COPY opportunities
3. **Hash-based indexing** - O(1) scales better than O(N)
4. **COPY operations** - Dominant strategy (87.5% win rate)

### What Doesn't Work
1. **Exact phrase templates** - Don't generalize
2. **Complex algorithms for small N** - Overhead dominates
3. **Inconsistent cost models** - Breaks operator selection

### Insights
- **Algorithmic complexity ≠ real performance** for small N
- **COPY works because**: Matches recent context (same document)
- **Templates fail because**: Try to match training (different documents)
- **Cost model consistency** is critical for operator selection

---

## Code Changes

### Active Optimizations
```
src/core/BSPEngine.mjs
└── maxContextTokens: 1024 (was 256)

src/core/CompressionMachine.mjs
├── useHashMap: true (default)
├── RollingHashMap integration
└── Hash-based COPY matching

src/core/utils/RollingHashMap.mjs (NEW)
└── O(1) substring matching
```

### Available But Disabled
```
src/core/utils/SuffixArray.mjs (NEW)
├── useSuffixArray: false
└── Available for large context

src/core/utils/FrequencyCodeTable.mjs (NEW)
├── useFrequencyCoding: false
└── Needs operator refactoring
```

---

## Documentation Created

1. `experiments/EXPERIMENT_TEMPLATE_LEARNING.md`
2. `experiments/SESSION_2026-01-16_template_experiment.md`
3. `experiments/EXPERIMENT_SUFFIX_ARRAY.md`
4. `experiments/EXPERIMENT_ROLLING_HASH.md`
5. `experiments/EXPERIMENT_CONTEXT_SIZE.md`
6. `experiments/EXPERIMENT_FREQUENCY_CODING.md`
7. `experiments/SESSION_2026-01-16_optimization_experiments.md`
8. `experiments/SESSION_2026-01-16_vocab_fix.md`
9. `experiments/optimisation_plan.md` (updated)
10. `docs/guides/optimizations.html` (updated)

---

## Remaining Opportunities

### High Priority
1. **N-gram Pruning** - 90% of vocab is n-grams, many low-usage
2. **Lazy Group Activation** - Defer computation until needed

### Medium Priority
3. **Adaptive Strategy** - Choose method based on content type
4. **Structural Templates** - Learn patterns, not exact phrases

### Low Priority (Complex)
5. **Frequency Coding** - Needs operator refactoring
6. **Hybrid Context** - Semantic + recent context

---

## Success Metrics Achieved

### Target Goals
- ✅ BPC < 2.20 (achieved 2.15)
- ✅ vs Gzip > +8% (achieved +10.9%)
- ✅ Throughput > 300 l/s (achieved 319)

### Stretch Goals
- ⏳ BPC < 2.00 (current 2.15, close!)
- ⏳ vs Gzip > +15% (current +10.9%)
- ✅ Multiple strategies active (hash map + large context)

---

## Theoretical Limits

- **Shannon Entropy**: 4.38 BPC
- **Current**: 2.15 BPC (49% of entropy)
- **Gzip**: 2.41 BPC (55% of entropy)
- **Estimated Ceiling**: ~1.50 BPC

**Progress**: 2.79 → 2.15 BPC (23% improvement)
**Remaining**: 2.15 → 1.50 BPC (30% more possible)

---

## Next Session Recommendations

1. **Quick win**: N-gram pruning (reduce vocab 90% → 50%)
2. **Performance**: Lazy group activation (+15% throughput)
3. **BPC**: Fix frequency coding (requires refactoring)

---

**Status**: 🟢 Excellent progress, system significantly improved, well documented!
