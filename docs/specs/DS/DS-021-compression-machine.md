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
| **COPY** | 3,644 | 40 bits/use | Most effective |
| **REPEAT** | 10 | 56 bits/use | Rare but powerful |
| **TEMPLATE** | 0 | - | Not trained yet |
| **LITERAL** | (fallback) | 0 | When others fail |

### 3.2 Benchmark Results

| Metric | Groups Only | With Machine | Improvement |
|--------|-------------|--------------|-------------|
| BPC (1000 lines) | 2.29 | **2.27** | 1.0% |
| BPC (5000 lines) | 2.97 | **2.79** | **6.3%** |
| Program Win Rate | 0% | **37.5%** | - |

### 3.3 When Program Wins

The compression machine is chosen when:
- **Repeated content**: Same sentence/phrase appears again → COPY
- **Pattern repetition**: "A B A B A B" → REPEAT
- **Low group coverage**: New content not in groups → cheaper to encode directly

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

### 7.2 Learning Algorithm

```javascript
learnTemplates(sequences) {
  // Find recurring patterns with differences
  for (const [seq1, seq2] of pairs(sequences)) {
    const diff = align(seq1, seq2);
    if (diff.fixedRatio > 0.5 && diff.slots.length > 0) {
      this.templates.add({
        fixed: diff.fixed,
        slots: diff.slotPositions,
      });
    }
  }
}
```

### 7.3 Status

Template learning is **prepared but not active** because:
1. Requires enough training data to find recurring patterns
2. TinyStories has varied vocabulary, few exact matches
3. Need to implement fuzzy matching for templates

---

## 8. Known Issues and TODOs

### 8.1 Issues

| Issue | Impact | Solution |
|-------|--------|----------|
| COPY search is O(n²) | Slow for long context | Use suffix array |
| Template learning not active | 0% template usage | Implement fuzzy matching |
| vocabSize mismatch | Program costs too high | Use word vocab, not n-gram |

### 8.2 TODO

- [ ] Implement suffix array for O(log n) COPY matching
- [ ] Activate template learning
- [ ] Use word-level vocab for CompressionMachine
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

The Compression Machine provides **measurable improvement** (6.3% BPC reduction on full training) by detecting:
- **COPY patterns**: 37.5% of test lines benefit from copying
- **REPEAT patterns**: Rare but effective (62% savings when detected)

**Main limitation**: Program costs are calculated using n-gram vocabulary (4,483 tokens), making LITERAL fallback expensive. Switching to word-level vocabulary would improve program-based compression significantly.

**Next priority**: Activate template learning and switch to word-level vocab for compression cost calculation.
