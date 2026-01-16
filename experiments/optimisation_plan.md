# BSP Optimization & Development Plan
**Last Updated:** 2026-01-16  
**Current Status:** ✅ Vocab Fix Complete, Templates/Suffix Array Tested & Disabled  
**Benchmark Status:** ✅ BPC: 2.21, Throughput: 301 l/s, vs Gzip: +8.6%

---

## Current Performance

| Metric | Value | Status |
|--------|-------|--------|
| **BPC (5k)** | 2.15 | ✅ Beats Gzip (2.41) by 10.9% |
| **Throughput** | 319 l/s | Good |
| **Program Win Rate** | 87.5% | Excellent |
| **COPY Ops** | 4,395 | Dominant strategy |
| **Avg Savings/Op** | 37.8 bits | High efficiency |
| **Context Size** | 1024 tokens | Optimized |
| **Vocab Size** | 4,483 (n-grams) | Could be pruned |

---

## Completed Optimizations

### ✅ DS-020: Adaptive Universe
- Dynamic universe sizing: 16.6 → 13.1 bits/surprise
- 40% improvement on small data

### ✅ DS-021: Compression Machine
- COPY operations: 85% win rate, 26 bits savings/op
- Hybrid architecture: 26% better than groups alone

### ✅ Vocabulary Decoupling
- Separate n-gram vocab (grouping) from word vocab (compression)
- 21% BPC improvement (2.79 → 2.21)

### ✅ Rolling Hash Map
- O(1) COPY lookup vs O(N×M) linear
- Throughput: 301 → 310 l/s (+3%)
- Scales well for larger context
- See: `experiments/EXPERIMENT_ROLLING_HASH.md`

### ✅ Increase Context Size
- 256 → 1024 tokens (4x increase)
- BPC: 2.21 → 2.15 (-3%)
- COPY ops: 3,637 → 4,395 (+21%)
- Avg savings: 26.4 → 37.8 bits (+43%)
- See: `experiments/EXPERIMENT_CONTEXT_SIZE.md`

### ❌ Template Learning (Tested & Failed)
- 15 templates learned, 0 used
- Train/test mismatch, too specific
- See: `experiments/EXPERIMENT_TEMPLATE_LEARNING.md`

### ⚠️ Suffix Array (Tested & Partial)
- Works for large N (>1000), fails for small N (256)
- Build cost > search savings for current context
- See: `experiments/EXPERIMENT_SUFFIX_ARRAY.md`

### ⚠️ Frequency-Weighted Coding (Tested & Partial)
- Implemented but breaks operator cost comparison
- COPY ops dropped 82% (inconsistent costs)
- Needs major refactoring of all operators
- See: `experiments/EXPERIMENT_FREQUENCY_CODING.md`

---

## Next Optimizations (Priority Order)

### 1. N-gram Pruning 🔍

**Problem**: Vocabulary explosion (4,483 tokens) from n-grams (1-3)

**Solution**: Keep only useful n-grams
- Track n-gram usage in groups
- Prune low-usage n-grams (< threshold)
- Fall back to unigrams

**Expected Impact**:
- Vocab: 4,483 → 2,000-3,000
- BPC: 2.21 → 2.10
- Memory: -30%
- Throughput: +10%

**Implementation**:
```javascript
// Track usage
ngramUsage = new Map();
for (const group of groups) {
  for (const token of group.members) {
    ngramUsage.set(token, (ngramUsage.get(token) || 0) + 1);
  }
}

// Prune
for (const [ngram, count] of ngramUsage) {
  if (count < threshold && isNgram(ngram)) {
    vocab.delete(ngram);
  }
}
```

---

### 5. Lazy Group Activation ⚡

**Problem**: Activate all groups for each token, even if not used

**Solution**: Lazy evaluation
- Defer group activation until needed
- Only compute intersection when required

**Expected Impact**:
- Throughput: 301 → 350+ l/s
- Memory: Reduced
- BPC: No change

**Implementation**:
```javascript
// Lazy set
activeGroups = new LazySet(() => {
  return tokens.flatMap(t => index.get(t));
});

// Only compute when accessed
const groups = activeGroups.toArray();
```

---

### 6. Adaptive Compression Strategy 🎨

**Problem**: Same strategy for all content types

**Solution**: Choose method based on content
- Detect repetitive content → aggressive COPY (minCopyLen=2)
- Detect novel content → use groups
- Detect structured content → try templates

**Expected Impact**:
- BPC: 2.21 → 1.90-2.00
- Adaptive to content type

**Implementation**:
```javascript
// Detect content type
const repetitiveness = measureRepetition(tokens);
const novelty = measureNovelty(tokens, groups);

if (repetitiveness > 0.7) {
  minCopyLen = 2;
  maxCopyLen = 128;
} else if (novelty > 0.5) {
  useGroups = true;
  useCompressionMachine = false;
}
```

---

### 7. Hybrid Context (Exploratory) 🧪

**Idea**: Combine recent context (COPY) + semantic context (templates)

**Concept**:
- Recent context: Last 256 tokens (for COPY)
- Semantic context: Similar sentences from history (group-based)
- Try COPY from both sources

**Expected Impact**:
- BPC: 2.21 → 1.80-2.00
- More COPY opportunities

**Risk**: High complexity, semantic search cost

**Implementation**:
```javascript
recentContext = tokens.slice(-256);
semanticContext = findSimilar(currentGroups, history);

copyFromRecent = findMatches(tokens, recentContext);
copyFromSemantic = findMatches(tokens, semanticContext);

bestMatch = min(copyFromRecent, copyFromSemantic);
```

---

### 8. Structural Templates (Exploratory) 🎨

**Idea**: Learn structural patterns, not exact phrases

**Concept**:
- Instead of exact tokens: "guy hadn t left himself"
- Learn structure: [NOUN] [AUX] [NEG] [VERB] [PRONOUN]
- Match using group types or POS tags

**Expected Impact**:
- BPC: 2.21 → 1.80-2.00
- Templates actually used (vs 0 currently)

**Risk**: High - needs group classification or POS tagging

**Implementation**:
```javascript
// Classify tokens by group type
structure = tokens.map(t => classifyToken(t, groups));

// Learn structural template
template = {
  structure: [NOUN, AUX, NEG, VERB, PRONOUN],
  slots: [0, 4] // Positions that vary
};

// Match by structure
if (matchStructure(tokens, template)) {
  // Use template
}
```

---

## Recommended Execution Order

### Phase 1: Quick Wins (Start Here)
1. **Rolling Hash Map** → +33% throughput
2. **Increase Context** → +5-10% BPC
3. Benchmark combined effect

### Phase 2: BPC Improvement
4. **Frequency Coding** → +14% BPC
5. **N-gram Pruning** → +5% BPC, +10% speed
6. Target: BPC < 2.00

### Phase 3: Performance
7. **Lazy Activation** → +15% throughput
8. **Adaptive Strategy** → +10-15% BPC

### Phase 4: Exploratory (If Plateau)
9. **Hybrid Context** → +10-20% BPC
10. **Structural Templates** → +10-20% BPC

---

## Success Criteria

### Minimum Viable
- ✅ BPC < 2.00 (currently 2.21)
- ✅ Throughput > 400 l/s (currently 301)
- ✅ vs Gzip > +15% (currently +8.6%)

### Target
- BPC < 1.80
- Throughput > 500 l/s
- vs Gzip > +25%

### Stretch
- BPC < 1.60
- Throughput > 600 l/s
- Multiple strategies active

---

## Theoretical Limits

- **Shannon Entropy**: 4.38 BPC (character-level)
- **Current**: 2.21 BPC (50% of entropy)
- **Estimated Ceiling**: ~1.50 BPC (semantic + structural compression)

---

## Files & Documentation

| Component | Location | Status |
|-----------|----------|--------|
| Engine Core | `src/core/BSPEngine.mjs` | ✅ Stable |
| Compression | `src/core/CompressionMachine.mjs` | ✅ Ready for hash map |
| Suffix Array | `src/core/utils/SuffixArray.mjs` | ✅ Available (disabled) |
| Benchmark | `evals/runLM_Comp.mjs` | ✅ Working |
| Results | `evals/lm_comparative/results/` | ✅ Latest: 2.21 BPC |

---

**Next Action**: Implement Rolling Hash Map + Increase Context Size
