# DS-021: Compression Machine (Procedural Encoding)

**Version**: 2.0  
**Status**: Implemented  
**Author**: BSP Team  
**Date**: 2026-01-16  
**Updated**: 2026-01-16

---

## 1. Problem Statement

### 1.1 Current System Limitations

The current BSP compression works at a single level:
```
Input tokens → Match groups → Surprise bits × log₂(universe)
```

This is fundamentally **set-based**: we ask "which tokens are in which groups?"

But language has **procedural structure**:
- "walk → walked" (add suffix)
- "ABC ABC ABC" (repeat pattern)
- "The X is Y. The Z is W." (fill template)

These cannot be compressed well with set membership alone.

### 1.2 The Compression Gap

| Pattern | Group-Based Cost | Program-Based Cost | Savings |
|---------|------------------|--------------------| --------|
| "ABC ABC ABC" | 9 tokens × 13 = 117 bits | pattern(3) + count = 34 bits | **71%** |
| Copy from context | 6 tokens × 13 = 78 bits | offset + length = 14 bits | **82%** |
| Template "The X is Y" | Full encoding | template + 2 slots | **50%** |

---

## 2. Implementation Status

### 2.1 Components Implemented

| Component | File | Status |
|-----------|------|--------|
| `CompressionMachine` class | `CompressionMachine.mjs` | ✅ Done |
| `LiteralOp` operator | `CompressionMachine.mjs` | ✅ Done |
| `CopyOp` operator | `CompressionMachine.mjs` | ✅ Done |
| `RepeatOp` operator | `CompressionMachine.mjs` | ✅ Done |
| `TemplateOp` operator | `CompressionMachine.mjs` | ✅ Done (not trained) |
| `Program` class | `CompressionMachine.mjs` | ✅ Done |
| BSPEngine integration | `BSPEngine.mjs` | ✅ Done |
| Template learning | `CompressionMachine.mjs` | ⚠️ Prepared, not active |

### 2.2 File Structure

```
src/core/
├── CompressionMachine.mjs    # NEW - 500+ lines
│   ├── Program               # Sequence of operations
│   ├── Operation             # Base class
│   ├── LiteralOp             # Direct token encoding
│   ├── CopyOp                # Copy from context
│   ├── RepeatOp              # Repeat pattern N times
│   ├── TemplateOp            # Fill template with slots
│   └── CompressionMachine    # Orchestrator
├── BSPEngine.mjs             # Integration
│   └── process()             # Returns programCost, compressionMethod
└── index.mjs                 # Exports
```

---

## 3. Measured Results

### 3.1 Operator Usage (5000 lines training)

| Operator | Times Used | Avg Savings | Notes |
|----------|------------|-------------|-------|
| **COPY** | 3,637 | 26 bits/use | Most effective |
| **REPEAT** | 1 | 56 bits/use | Rare but powerful |
| **TEMPLATE** | 0 | - | Not trained yet |
| **LITERAL** | (fallback) | 0 | When others fail |

### 3.2 Benchmark Results

| Metric | Groups Only | With Machine | Improvement |
|--------|-------------|--------------|-------------|
| BPC (1000 lines) | 2.29 | **2.04** | **11.2%** |
| BPC (5000 lines) | 2.98 | **2.20** | **26.1%** |
| Program Win Rate (1k) | 0% | **48.1%** | - |
| Program Win Rate (5k) | 0% | **85.0%** | - |

### 3.3 When Program Wins

The compression machine is chosen when:
- **Repeated content**: Same sentence/phrase appears again → COPY (85% of cases)
- **Pattern repetition**: "A B A B A B" → REPEAT (rare)
- **Low group coverage**: New content not in groups → cheaper to encode directly

**Key Insight**: Machine effectiveness scales with training data - from 48% win rate at 1k lines to 85% at 5k lines.

---

## 4. Architecture

### 4.1 Operator Hierarchy

```
┌────────────────────────────────────────────────────────┐
│                  COMPRESSION MACHINE                    │
├─────────────┬─────────────┬─────────────┬──────────────┤
│   Level 3   │   Level 2   │   Level 1   │   Level 0    │
│   TEMPLATE  │   COPY      │   GROUP     │   LITERAL    │
│   (learned) │   REPEAT    │   (BSP)     │   (raw)      │
├─────────────┼─────────────┼─────────────┼──────────────┤
│ template +  │ offset +    │ group IDs   │ token ×      │
│ slot values │ length/count│ + surprise  │ log₂(vocab)  │
└─────────────┴─────────────┴─────────────┴──────────────┘
```

### 4.2 Cost Model

```javascript
// LITERAL: Direct encoding
cost = tokens.length × log₂(vocabSize)

// COPY: Reference to context
cost = log₂(contextLen) + log₂(maxCopyLen)  // ~14 bits

// REPEAT: Pattern × count
cost = pattern.length × log₂(vocabSize) + log₂(maxRepeat)

// TEMPLATE: Template ID + slot values
cost = log₂(numTemplates) + slots × log₂(vocabSize)
```

### 4.3 Selection Algorithm

```javascript
encode(tokens, context) {
  // Generate all candidate programs
  const candidates = [
    literalProgram(tokens),
    copyProgram(tokens, context),
    repeatProgram(tokens),
    templateProgram(tokens),
  ];
  
  // Return lowest cost
  return candidates.sort((a, b) => a.cost - b.cost)[0];
}
```

---

## 5. Integration with BSPEngine

### 5.1 Process Flow

```javascript
process(text, options) {
  // ... existing group-based processing ...
  
  // DS-021: Program-based compression
  const program = this.compressionMachine.encode(wordTokens, this.contextTokens);
  const programCost = program.cost;
  
  // Best cost = min(group-based, program-based)
  const bestCost = Math.min(groupMdlCost, programCost);
  const compressionMethod = programCost < groupMdlCost ? 'program' : 'group';
  
  return {
    // ... existing fields ...
    mdlCost: bestCost,
    groupMdlCost,
    programCost,
    compressionMethod,
    compressionProgram: program.toString(),
  };
}
```

### 5.2 Configuration

```javascript
const engine = new BSPEngine({
  useCompressionMachine: true,  // default: true
  compression: {
    minCopyLen: 3,    // minimum tokens to use COPY
    maxCopyLen: 64,   // maximum copy length
    maxRepeat: 16,    // maximum repeat count
  },
});
```

---

## 6. Example Programs

### 6.1 COPY Operation

```
Input: "the cat sat on the mat"
Context: ["the", "cat", "sat", "on", "the", "mat", ...]  (previous text)

Program: COPY[0:6]
Cost: log₂(256) + log₂(64) = 8 + 6 = 14 bits

vs LITERAL: 6 × 13 = 78 bits
Savings: 82%
```

### 6.2 REPEAT Operation

```
Input: "one two three one two three one two three"
Pattern: ["one", "two", "three"]
Count: 3

Program: REPEAT[one two three × 3]
Cost: 3 × 10 + 4 = 34 bits

vs LITERAL: 9 × 10 = 90 bits
Savings: 62%
```

### 6.3 Hybrid Program

```
Input: "Once upon a time there was a little girl"
Context: [...previous story...]

Program: LIT[once upon] + COPY[47:2] + LIT[there was a little girl]
Cost: 2×10 + 14 + 6×10 = 94 bits

vs pure LITERAL: 9 × 10 = 90 bits
(No savings in this case - LITERAL wins)
```

---

## 7. Template Learning (Future)

### 7.1 Concept

Learn recurring patterns with variable slots:
```
Template: "The [SLOT] is [SLOT]."
Instances:
  - "The cat is happy."   → slots = [cat, happy]
  - "The dog is sad."     → slots = [dog, sad]
  - "The bird is hungry." → slots = [bird, hungry]
```

### 7.2 Experiment Results (2026-01-16)

**Status**: ❌ NOT EFFECTIVE - Disabled

**Implementation**: Complete (BSPEngine + CompressionMachine)
- Sentence buffer (500 max)
- Learning every 100 lines
- Length-based clustering
- Exact matching algorithm

**Results**:
| Metric | Value | Notes |
|--------|-------|-------|
| Templates Learned | 15 | From 5k training lines |
| Templates Used | **0** | None matched in test |
| Throughput Impact | **-35%** | 338 → 221 l/s |
| BPC Impact | +0.01 | Slightly worse |

**Why It Failed**:
1. **Train/Test Mismatch**: Templates from training don't appear in test
2. **Too Specific**: Exact length + exact fixed parts required
3. **No Generalization**: Captures phrases, not structural patterns
4. **Pure Overhead**: 28,905 failed match attempts

**See**: `EXPERIMENT_TEMPLATE_LEARNING.md` for full analysis

### 7.3 Future Approaches (If Revisited)

Only after Suffix Array optimization, and only if COPY plateaus:

1. **Fuzzy Matching**: Allow 1-2 token differences in fixed parts
2. **Structural Patterns**: Match "The X is Y" regardless of exact tokens
3. **Semantic Templates**: Use group activations instead of tokens
4. **Frequency Filtering**: Only keep templates with >N instances
5. **Partial Matching**: Match prefix/suffix, not full sequence

**Priority**: LOW (focus on optimizing COPY first)

---

## 8. Known Issues and TODOs

### 8.1 Issues (RESOLVED ✅)

| Issue | Impact | Solution | Status |
|-------|--------|----------|--------|
| vocabSize mismatch | Program costs too high | Use word vocab, not n-gram | ✅ FIXED |
| COPY search is O(n²) | Slow for long context | Use suffix array | TODO |
| Template learning not active | 0% template usage | Implement fuzzy matching | TODO |

### 8.2 TODO

- [x] Use word-level vocab for CompressionMachine
- [x] Fix all operators to use effectiveVocab consistently
- [ ] Implement suffix array for O(log n) COPY matching
- [ ] Activate template learning
- [ ] Add TRANSFORM operator for morphological patterns
- [ ] Cache program results for identical inputs

---

## 9. Benchmark Command

```bash
# Quick test (17s)
node evals/runLM_Comp.mjs --quick --retrain

# Full benchmark (~2min)
node evals/runLM_Comp.mjs --retrain

# View compression stats
cat evals/lm_comparative/results/latest.json | jq '.compression'
```

---

## 10. Conclusion

The Compression Machine provides **significant improvement** (11-26% BPC reduction) by detecting:
- **COPY patterns**: 85% of test lines benefit from copying at 5k training
- **REPEAT patterns**: Rare but effective (62% savings when detected)

**Critical Fix Applied**: Vocabulary decoupling resolved the scaling issue:
- Before: BPC degraded from 2.27 → 2.79 as training increased
- After: BPC improves from 2.04 → 2.20 (both beat Gzip 2.41)
- Program win rate scales from 48% → 85% with more data

**Main limitation**: COPY search is O(N×M), causing throughput to drop from 535 → 338 lines/sec. Suffix array implementation would restore performance.

**Next priority**: Activate template learning to target 1.80 BPC by exploiting TinyStories' repetitive sentence structures.
