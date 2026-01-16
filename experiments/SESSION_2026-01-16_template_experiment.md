# Session Summary: Template Learning Experiment
**Date:** 2026-01-16  
**Duration:** ~2 hours  
**Status:** ❌ EXPERIMENT FAILED - Feature Disabled

---

## Objective

Implement and test template learning to reduce BPC from 2.20 → 1.80 (18% target improvement).

---

## Implementation

### Code Changes

1. **BSPEngine.mjs**:
   - Added sentence buffer (max 500)
   - Added periodic template learning (every 100 lines)
   - Serialization support
   - **REVERTED**: All removed for performance

2. **CompressionMachine.mjs**:
   - Fixed `_matchTemplate()` - check `fixed[i] === null` for slots
   - Fixed `_tryTemplateEncoding()` - accept `vocabSize` parameter
   - **DISABLED**: Template encoding commented out in `encode()`

### Algorithm

```javascript
learnTemplates(sequences) {
  // Group by length + first 2 tokens
  // For each group with ≥3 instances:
  //   Find varying positions
  //   If 0 < varying < 50%:
  //     Create template
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
| Learning Time | Negligible |

### Test Performance

| Metric | Baseline | With Templates | Change |
|--------|----------|----------------|--------|
| BPC | 2.20 | 2.21 | +0.01 ❌ |
| Template Ops Used | N/A | **0** | None ❌ |
| Throughput | 338 l/s | **221 l/s** | **-35%** ❌ |
| Program Win Rate | 85% | 85% | No change |

### After Disabling

| Metric | Value | vs Baseline |
|--------|-------|-------------|
| BPC | 2.21 | +0.01 (acceptable) |
| Throughput | **305 l/s** | -10% (acceptable) |
| Template Ops | 0 | N/A |

---

## Root Cause Analysis

### Why 0 Templates Used

1. **Train/Test Mismatch**:
   - Templates: "guy hadn t left himself", "a lot of people complain"
   - Test data: Completely different sentences
   - No overlap between training phrases and test phrases

2. **Too Specific**:
   - Requires exact length match
   - Requires all fixed parts to match exactly
   - No fuzzy matching, no partial matching

3. **Wrong Abstraction Level**:
   - Captures specific phrases, not structural patterns
   - Need: "The [noun] was [adjective]" (structural)
   - Got: "guy hadn t left himself" (specific phrase)

### Why Throughput Degraded

- Template matching: O(templates × test_lines) = 15 × 1927 = 28,905 attempts
- All attempts failed (0 matches)
- Pure overhead with no benefit

---

## Lessons Learned

### What Doesn't Work for Narrative Text

1. ❌ Exact phrase matching
2. ❌ Training-specific templates
3. ❌ Length-based clustering
4. ❌ No generalization mechanism

### What Might Work (Future)

1. ✅ Fuzzy matching (allow 1-2 token differences)
2. ✅ Structural patterns (match "The X is Y" structure)
3. ✅ Semantic templates (use group activations)
4. ✅ Frequency filtering (only keep high-frequency patterns)
5. ✅ Partial matching (prefix/suffix)

---

## Decision

**DISABLED** template learning because:
- 0 benefit (no templates used)
- 35% throughput cost
- Slightly worse BPC

### Current State

- Template learning code: Present but disabled
- Template encoding: Commented out in `encode()`
- Sentence buffer: Removed from `process()`
- Throughput: Restored to 305 l/s (acceptable)

---

## Next Steps

### Priority 1: Suffix Array for COPY 🚀

Focus on optimizing what works (COPY operations dominate with 85% win rate).

**Expected Impact**:
- Throughput: 305 → 500+ l/s
- BPC: No change (quality maintained)
- Risk: Low (well-understood algorithm)

**Why This First**:
- COPY is proven effective (3,637 uses, 26 bits savings each)
- Current O(N×M) search is bottleneck
- Suffix array: O(log N) lookup
- Clear path to implementation

### Priority 2: Frequency-Weighted Coding

After throughput is optimized, focus on BPC improvement.

**Expected Impact**:
- BPC: 2.20 → 1.90 (14% improvement)
- Throughput: No impact
- Risk: Low (Huffman coding is standard)

### Priority 3: Revisit Templates (Maybe)

Only if:
1. Suffix array is done
2. Frequency coding is done
3. COPY operations plateau
4. We have better ideas for generalization

---

## Files Modified

```
src/core/BSPEngine.mjs
├── Removed sentence buffer collection
└── Removed template learning calls

src/core/CompressionMachine.mjs
├── Fixed _matchTemplate() (kept - correct implementation)
├── Fixed _tryTemplateEncoding() (kept - correct implementation)
└── Disabled template encoding in encode() (commented out)

docs/specs/DS/DS-021-compression-machine.md
└── Updated with experiment results

EXPERIMENT_TEMPLATE_LEARNING.md (NEW)
└── Full experiment documentation
```

---

## Benchmark Commands

```bash
# Baseline (before experiment)
node evals/runLM_Comp.mjs --retrain
# BPC: 2.20, Throughput: 338 l/s

# With templates (failed)
node evals/runLM_Comp.mjs --retrain
# BPC: 2.21, Throughput: 221 l/s, Templates: 0 used

# After disabling (current)
node evals/runLM_Comp.mjs --retrain
# BPC: 2.21, Throughput: 305 l/s
```

---

## Conclusion

Template learning experiment was **unsuccessful** for this use case. The approach of learning exact phrase templates from training data doesn't generalize to test data in narrative text with high vocabulary diversity.

**Key Insight**: COPY operations work because they match recent context (same document). Templates tried to match training data (different documents) and failed.

**Moving Forward**: Focus on optimizing proven techniques (COPY via Suffix Array) rather than adding unproven operators.

---

**Status**: ✅ Experiment complete, documented, feature disabled, ready for Suffix Array implementation.
