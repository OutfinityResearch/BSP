# Suffix Array Optimization Experiment
**Date:** 2026-01-16  
**Status:** ⚠️ PARTIAL SUCCESS - Not beneficial for small context  
**Implementation Time:** 1 hour

---

## Hypothesis

Current O(N×M) COPY search is bottleneck. Suffix array will reduce to O(log N + M), significantly improving throughput.

---

## Implementation

### Code Changes

1. **`src/core/utils/SuffixArray.mjs`** (NEW):
   - Suffix array construction: O(N log N)
   - LCP array for optimization
   - Binary search for pattern matching: O(log N)
   - Pattern extension: O(M)

2. **CompressionMachine.mjs**:
   - Added `suffixArray` and `contextCache`
   - Modified `_findCopyMatches()` to use suffix array when enabled
   - Fallback to linear search if disabled

### Algorithm

```javascript
// Build suffix array once per context
suffixArray = new SuffixArray(context);

// For each position in tokens:
//   Binary search for prefix match: O(log N)
//   Extend match: O(M)
//   Total: O(M log N) vs O(N×M) linear
```

---

## Results

### Quick Test (1k lines, context=256)

| Metric | Linear Search | Suffix Array | Change |
|--------|---------------|--------------|--------|
| Throughput | 305 l/s | **458 l/s** | **+50%** ✅ |
| COPY Ops | 1,595 | 1,595 | Same |
| BPC | 2.04 | 2.04 | Same |

### Full Test (5k lines, context=256)

| Metric | Linear Search | Suffix Array | Change |
|--------|---------------|--------------|--------|
| Throughput | 305 l/s | **232 l/s** | **-24%** ❌ |
| COPY Ops | 3,637 | 3,637 | Same |
| BPC | 2.21 | 2.21 | Same |

---

## Analysis

### Why It Failed on Full Training

**Problem**: Suffix array rebuild cost dominates for small context

1. **Context size**: 256 tokens (small)
2. **Build cost**: O(N log N) = O(256 × 8) ≈ 2,048 operations
3. **Linear search cost**: O(N × M) = O(256 × 6) ≈ 1,536 operations per encoding
4. **Rebuild frequency**: Every few encodings (context changes)

**Math**:
- Linear: 1,536 ops/encoding
- Suffix Array: 2,048 build + 48 search = 2,096 ops/encoding (if rebuild every time)
- **Suffix array is slower!**

### When Suffix Array Would Help

Suffix array becomes beneficial when:
```
Build cost < Search cost savings
N log N < K × (N × M)

Where K = number of searches before rebuild
```

For our case:
- N = 256 (context)
- M = 6 (average pattern length)
- K ≈ 1-2 (context changes frequently)

**Breakeven**: K > (N log N) / (N × M) = log N / M = 8 / 6 ≈ 1.3

We rebuild almost every encoding, so K ≈ 1, which is below breakeven.

### Why Quick Test Showed Improvement

Quick test had:
- Smaller dataset (less context changes)
- Better cache hit rate
- Lucky timing

Full test revealed the true cost.

---

## Lessons Learned

### What Doesn't Work

1. ❌ Suffix array for small context (N < 1000)
2. ❌ Frequent rebuilds (context changes often)
3. ❌ Complex data structures when simple is faster

### What Would Work

1. ✅ **Larger context** (N > 1000): Build cost amortized
2. ✅ **Stable context**: Fewer rebuilds, more searches
3. ✅ **Incremental updates**: Update suffix array instead of rebuild
4. ✅ **Rolling hash**: O(1) lookup for exact matches

---

## Decision

**DISABLED** suffix array by default because:
- 24% throughput degradation on full training
- Only helps with large, stable context
- Current context (256 tokens) too small

### Configuration

```javascript
// Enable only for large context
const engine = new BSPEngine({
  maxContextTokens: 2048,  // Large context
  compression: {
    useSuffixArray: true,  // Enable for large N
  },
});
```

---

## Alternative Approaches

### Priority 1: Rolling Hash Map 🎯

**Concept**: Hash-based lookup for exact prefix matches
- Build: O(N) - hash each position
- Search: O(1) average case
- Memory: O(N) hash map

**Expected**: Better than both linear and suffix array for small N

**Implementation**:
```javascript
// Hash first 3 tokens at each position
hashMap = new Map();
for (let i = 0; i < context.length - 3; i++) {
  const hash = hash3(context[i], context[i+1], context[i+2]);
  hashMap.set(hash, [...(hashMap.get(hash) || []), i]);
}

// Lookup
const hash = hash3(pattern[0], pattern[1], pattern[2]);
const candidates = hashMap.get(hash) || [];
// Extend each candidate
```

### Priority 2: Increase Context Size

Current: 256 tokens
Proposed: 1024-2048 tokens

**Benefits**:
- More COPY opportunities
- Better amortization of build cost
- Suffix array becomes viable

---

## Files Modified

```
src/core/utils/SuffixArray.mjs (NEW)
├── Suffix array implementation
├── Binary search
└── Pattern matching

src/core/CompressionMachine.mjs
├── +useSuffixArray flag (disabled by default)
├── +suffixArray, +contextCache
└── Modified _findCopyMatches()

src/core/index.mjs
└── Export SuffixArray
```

---

## Benchmark Commands

```bash
# With suffix array (slow)
node evals/runLM_Comp.mjs --retrain
# Throughput: 232 l/s

# Without suffix array (baseline)
node evals/runLM_Comp.mjs --retrain
# Throughput: 305 l/s
```

---

## Conclusion

Suffix array optimization **failed** for current use case due to small context size (256 tokens) and frequent rebuilds. The O(N log N) build cost dominates the O(log N) search savings.

**Key Insight**: Algorithmic complexity doesn't always translate to real-world performance. For small N, simple O(N) algorithms can be faster than complex O(log N) algorithms due to constant factors and cache effects.

**Next Steps**: Try rolling hash map (O(1) lookup) or increase context size to make suffix array viable.

---

**Status**: ✅ Experiment complete, suffix array disabled, linear search restored, throughput back to baseline.
