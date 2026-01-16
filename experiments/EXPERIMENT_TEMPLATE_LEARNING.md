# Template Learning Experiment Results
**Date:** 2026-01-16  
**Status:** ❌ NOT EFFECTIVE (Disabled)  
**Implementation Time:** 2 hours

---

## Hypothesis

TinyStories contains highly repetitive sentence structures that can be compressed as templates with variable slots, achieving 50%+ compression on matching sentences.

---

## Implementation

### Changes Made

1. **BSPEngine.mjs**:
   - Added `sentenceBuffer` (max 500 sentences)
   - Added `processedLines` counter
   - Call `compressionMachine.learnTemplates()` every 100 lines
   - Serialization support for buffer

2. **CompressionMachine.mjs**:
   - Fixed `_matchTemplate()` to check `fixed[i] === null` for slots
   - Fixed `_tryTemplateEncoding()` to accept and use `vocabSize` parameter
   - Template learning algorithm already existed

### Algorithm

```javascript
learnTemplates(sequences) {
  // 1. Group by length + first 2 tokens
  // 2. For each group (min 3 instances):
  //    - Find positions that vary across instances
  //    - If 0 < varying < 50% of length:
  //      - Create template with fixed parts and slots
}
```

---

## Results

### Training (5k lines)

| Metric | Value |
|--------|-------|
| Templates Learned | 15 |
| Template Length | 5-7 tokens |
| Slots per Template | 2-3 |
| Instances per Template | 3-4 |

**Example Templates**:
- `"guy hadn t left himself"` (length=5, slots=2)
- `"a lot of people complain"` (length=7, slots=3)

### Test Performance

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| BPC | 2.20 | 2.21 | +0.01 (worse) |
| Template Ops Used | N/A | **0** | None |
| Throughput | 338 l/s | **221 l/s** | **-35%** ❌ |
| Program Win Rate | 85% | 85% | No change |

---

## Analysis

### Why Templates Weren't Used

1. **Train/Test Mismatch**: Templates learned from training data don't appear in test data
   - Training: "guy hadn t left himself"
   - Test: Different sentences entirely

2. **Too Specific**: Exact length match required (`fixed.length !== tokens.length`)
   - No partial matching
   - No fuzzy matching
   - All fixed parts must match exactly

3. **Limited Generalization**: Templates capture specific phrases, not structural patterns
   - Need: "The [noun] was [adjective]"
   - Got: "guy hadn t left himself" with 2 specific slots

### Performance Impact

**Throughput degradation**: 338 → 221 lines/sec (-35%)
- Template matching checked on every encoding
- 15 templates × 1927 test lines = 28,905 match attempts
- All failed, pure overhead

---

## Lessons Learned

### What Doesn't Work

1. **Exact matching** on narrative text with high vocabulary diversity
2. **Training-specific templates** that don't generalize to test
3. **Length-based clustering** - too restrictive

### What Might Work (Future)

1. **Fuzzy matching**: Allow some fixed parts to vary
2. **Structural templates**: Match patterns like "The X is Y" regardless of length
3. **Frequency-based selection**: Only keep templates that appear >N times
4. **Partial matching**: Match prefix/suffix, not full sequence
5. **Semantic templates**: Use group activations instead of exact tokens

---

## Decision

**DISABLED** template learning for now because:
- ✅ 0 templates used in test (no benefit)
- ❌ 35% throughput degradation (significant cost)
- ❌ No BPC improvement (actually slightly worse)

### How to Disable

Set in BSPEngine config:
```javascript
templateLearningInterval: Infinity  // Never learn templates
```

Or remove template checking from `encode()`:
```javascript
// Comment out in CompressionMachine.encode()
// const templateProg = this._tryTemplateEncoding(tokens, effectiveVocab);
```

---

## Future Work

### Priority 1: Suffix Array for COPY
Focus on optimizing what works (COPY operations) instead of adding new operators.
- Expected: 221 → 500+ l/s (restore and improve throughput)
- Risk: Low (well-understood algorithm)

### Priority 2: Fuzzy Templates (If Needed)
Only revisit templates if:
1. Suffix array is implemented
2. COPY operations plateau
3. We have ideas for better generalization

**Approach**:
- Use edit distance for matching
- Allow 1-2 token differences in fixed parts
- Match structural patterns, not exact phrases

---

## Files Modified

```
src/core/BSPEngine.mjs
├── +sentenceBuffer, +processedLines (lines 126-129)
├── +template learning call in process() (lines 376-387)
└── +serialization (lines 658, 711)

src/core/CompressionMachine.mjs
├── Fixed _matchTemplate() (lines 513-543)
└── Fixed _tryTemplateEncoding() (lines 474-508)
```

---

## Benchmark Commands

```bash
# Before (baseline)
node evals/runLM_Comp.mjs --retrain
# BPC: 2.20, Throughput: 338 l/s

# After (with templates)
node evals/runLM_Comp.mjs --retrain
# BPC: 2.21, Throughput: 221 l/s, Templates: 0 used

# Conclusion: No benefit, significant cost
```

---

**Status**: Experiment complete, feature disabled, moving to Suffix Array optimization.
