# DS-021: Compression Machine (Procedural Encoding)

**Version**: 1.0  
**Status**: Proposal  
**Author**: BSP Team  
**Date**: 2026-01-16

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

| Pattern | Current Cost | Optimal Cost |
|---------|-------------|--------------|
| "walked" | 7 bits × 16.6 = 116 bits | "walk" + "-ed" = ~20 bits |
| "ABC ABC ABC" | 9 bits × 16.6 = 149 bits | "ABC" + "×3" = ~30 bits |
| Template | Full description | Template + params |

We're losing **3-5× compression** by not capturing procedural patterns.

---

## 2. Core Insight: Programs as Compression

### 2.1 Kolmogorov Complexity

The shortest description of data is the shortest **program** that generates it.

```
K(x) = min { |p| : U(p) = x }
```

Where U is a universal Turing machine.

### 2.2 MDL Principle

Minimum Description Length says: choose the model that minimizes:
```
Total Cost = Model Cost + Data|Model Cost
```

Currently:
- Model = groups + edges
- Data|Model = surprise bits × log₂(universe)

With procedural encoding:
- Model = programs + templates + transforms
- Data|Model = residual after applying programs

---

## 3. Proposed Architecture: Compression Machine

### 3.1 Overview

```
┌────────────────────────────────────────────────────────┐
│                  COMPRESSION MACHINE                    │
├─────────────┬─────────────┬─────────────┬──────────────┤
│   Level 3   │   Level 2   │   Level 1   │   Level 0    │
│   Meta-     │   Sequence  │   Group     │   Token      │
│   Programs  │   Programs  │   Matching  │   Encoding   │
├─────────────┼─────────────┼─────────────┼──────────────┤
│ "apply      │ "COPY from  │ "tokens     │ raw hash     │
│  grammar    │  position   │  {a,b,c}    │  IDs         │
│  rule X"    │  with shift │  form       │              │
│             │  +template" │  group G"   │              │
└─────────────┴─────────────┴─────────────┴──────────────┘
```

### 3.2 Compression Operators

Each level has **operators** that transform input:

#### Level 0: Token Operators
```javascript
TOKEN(id)           // Raw token, cost = log₂(vocabSize)
NOVEL(hash)         // Unknown token, cost = log₂(universeSize)
```

#### Level 1: Group Operators (current system, enhanced)
```javascript
GROUP(gid)          // Activate group, cost = log₂(groupCount)
DIFF(gid, +bits, -bits)  // Group with modifications
```

#### Level 2: Sequence Operators (NEW)
```javascript
COPY(offset, length)     // Copy from context, cost ≈ log₂(contextLen) + log₂(maxLen)
REPEAT(pattern, count)   // Repeat pattern, cost = |pattern| + log₂(maxCount)
TEMPLATE(tid, params)    // Apply template with params
SHIFT(base, delta)       // Apply offset to all IDs
```

#### Level 3: Program Operators (NEW)
```javascript
TRANSFORM(input, rule)   // Apply learned transform
GRAMMAR(rule_id, slots)  // Apply grammar production
COMPOSE(op1, op2)        // Chain two operations
```

### 3.3 Cost Model

Total encoding cost:
```
Cost(input) = min over all programs P {
    Cost(P) + Cost(input | P)
}
```

Where:
- `Cost(P)` = sum of operator costs in program
- `Cost(input | P)` = residual bits not explained by P

---

## 4. Implementation: CompressionMachine Class

### 4.1 Core Interface

```javascript
class CompressionMachine {
  constructor(options = {}) {
    this.operators = new Map();  // name -> Operator
    this.templates = new Map();  // id -> Template
    this.transforms = new Map(); // id -> Transform
    this.contextWindow = options.contextWindow || 256;
  }

  /**
   * Find best program to encode input
   * @param {number[]} tokens - Input token sequence
   * @param {number[]} context - Previous tokens (for COPY)
   * @returns {Program} Best compression program
   */
  encode(tokens, context = []) {
    const candidates = this._generateCandidates(tokens, context);
    return this._selectBest(candidates, tokens);
  }

  /**
   * Execute program to decode tokens
   * @param {Program} program
   * @param {number[]} context
   * @returns {number[]} Decoded tokens
   */
  decode(program, context = []) {
    return program.execute(context);
  }

  /**
   * Learn new templates/transforms from data
   * @param {number[][]} sequences - Training sequences
   */
  learn(sequences) {
    this._learnTemplates(sequences);
    this._learnTransforms(sequences);
    this._learnCopyPatterns(sequences);
  }
}
```

### 4.2 Operator Definitions

```javascript
class Operator {
  constructor(name, costFn, executeFn) {
    this.name = name;
    this.costFn = costFn;      // (params, context) => bits
    this.executeFn = executeFn; // (params, context) => tokens
  }
}

// Example operators
const COPY = new Operator(
  'COPY',
  (params, ctx) => {
    // Cost = log₂(context length) + log₂(max copy length)
    const { offset, length } = params;
    return Math.log2(ctx.length || 1) + Math.log2(32);
  },
  (params, ctx) => {
    const { offset, length } = params;
    return ctx.slice(offset, offset + length);
  }
);

const REPEAT = new Operator(
  'REPEAT',
  (params) => {
    const { pattern, count } = params;
    // Cost = pattern cost + log₂(max repeat count)
    return pattern.length * 2 + Math.log2(16);
  },
  (params) => {
    const { pattern, count } = params;
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(...pattern);
    }
    return result;
  }
);

const TEMPLATE = new Operator(
  'TEMPLATE',
  (params, ctx, machine) => {
    const { templateId, slots } = params;
    const template = machine.templates.get(templateId);
    // Cost = template ID + slot values
    return Math.log2(machine.templates.size) + 
           slots.length * Math.log2(machine.vocabSize);
  },
  (params, ctx, machine) => {
    const { templateId, slots } = params;
    const template = machine.templates.get(templateId);
    return template.fill(slots);
  }
);
```

### 4.3 Template Learning

```javascript
class TemplateLearner {
  /**
   * Find recurring patterns with variable slots
   * Example: "The [X] is [Y]." appears often with different X, Y
   */
  learn(sequences) {
    const templates = [];
    
    // Find recurring subsequences
    const ngrams = this._extractNgrams(sequences, 3, 10);
    
    // Find pairs with small edit distance
    for (const [pattern1, count1] of ngrams) {
      for (const [pattern2, count2] of ngrams) {
        if (pattern1 === pattern2) continue;
        
        const alignment = this._align(pattern1, pattern2);
        if (alignment.slots.length > 0 && alignment.fixedRatio > 0.5) {
          templates.push({
            fixed: alignment.fixed,
            slots: alignment.slots,
            examples: [pattern1, pattern2],
            count: count1 + count2,
          });
        }
      }
    }
    
    // Merge similar templates
    return this._mergeTemplates(templates);
  }
}
```

### 4.4 Copy Detection

```javascript
class CopyDetector {
  /**
   * Find segments that can be copied from context
   */
  findCopies(tokens, context, minLength = 3) {
    const copies = [];
    
    // Build suffix array of context for fast matching
    const suffixArray = this._buildSuffixArray(context);
    
    for (let i = 0; i < tokens.length; i++) {
      // Binary search for matching prefix
      const match = this._findLongestMatch(tokens, i, context, suffixArray);
      
      if (match.length >= minLength) {
        const copyCost = Math.log2(context.length) + Math.log2(match.length);
        const directCost = match.length * Math.log2(this.vocabSize);
        
        if (copyCost < directCost) {
          copies.push({
            sourceOffset: match.offset,
            targetOffset: i,
            length: match.length,
            savings: directCost - copyCost,
          });
        }
      }
    }
    
    return copies;
  }
}
```

---

## 5. Integration with BSP

### 5.1 Modified Process Flow

```
OLD:
  tokens → encode → groups → surprise → cost

NEW:
  tokens → compressionMachine.encode(tokens, context) → program
         → program.cost() → total bits
         → program.residual() → fallback to group encoding
```

### 5.2 BSPEngine Integration

```javascript
// In BSPEngine.process()
process(text, options = {}) {
  const tokens = this.tokenizer.encode(text);
  
  // NEW: Try procedural compression first
  const program = this.compressionMachine.encode(tokens, this.contextTokens);
  
  if (program.cost < this._estimateGroupCost(tokens)) {
    // Use procedural encoding
    this._learnFromProgram(program);
    this.contextTokens = [...this.contextTokens, ...tokens].slice(-256);
    return { program, cost: program.cost };
  }
  
  // Fallback to group-based encoding
  const input = SimpleBitset.fromArray(tokens, this.config.universeSize);
  // ... existing group logic ...
}
```

---

## 6. Expected Impact

### 6.1 Compression Gains

| Scenario | Current BPC | With Machine | Improvement |
|----------|-------------|--------------|-------------|
| Repetitive text | 7.0 | 3.0 | 57% |
| Template-heavy | 6.5 | 3.5 | 46% |
| Copy-heavy (narrative) | 6.0 | 4.0 | 33% |
| Novel text | 7.5 | 6.5 | 13% |
| **Average** | **6.75** | **4.25** | **37%** |

### 6.2 Combined with Adaptive Universe

| Improvement | Alone | Combined |
|-------------|-------|----------|
| Adaptive Universe | -25% BPC | - |
| Compression Machine | -37% BPC | - |
| **Both** | - | **-50% BPC** |

---

## 7. Implementation Phases

### Phase 1: Quick Wins (This Session)
- [ ] Implement Adaptive Universe (DS-020)
- [ ] Add COPY operator for context matching
- [ ] Measure improvement

### Phase 2: Templates
- [ ] Implement TemplateLearner
- [ ] Add TEMPLATE operator
- [ ] Learn from TinyStories

### Phase 3: Full Machine
- [ ] Implement full CompressionMachine
- [ ] Add program search with beam search
- [ ] Integrate with BSPEngine

---

## 8. Code Structure

```
src/core/
├── BSPEngine.mjs          # Modified to use CompressionMachine
├── CompressionMachine.mjs # NEW: Main orchestrator
├── operators/
│   ├── index.mjs
│   ├── CopyOperator.mjs   # COPY from context
│   ├── RepeatOperator.mjs # REPEAT pattern
│   └── TemplateOperator.mjs
├── learners/
│   ├── TemplateLearner.mjs
│   ├── CopyDetector.mjs
│   └── TransformLearner.mjs
└── Program.mjs            # Encodes a sequence of operations
```

---

## 9. Theoretical Notes

### 9.1 Relationship to Grammar Induction

The Template system is essentially learning a **context-free grammar**:
```
S → "The" NP "is" ADJ "."
NP → "cat" | "dog" | "bird"
ADJ → "happy" | "sad" | "hungry"
```

This is equivalent to:
```javascript
TEMPLATE('S', [NP, ADJ])
```

### 9.2 Relationship to LZ77/LZSS

The COPY operator is similar to LZ77 compression:
- Match = (offset, length) pair
- Difference: we learn which copies are **semantically meaningful**

### 9.3 Universal Compression

In the limit, with enough operators and learning, this approaches:
```
K(x) = shortest program that generates x
```

Which is the theoretical optimal compression (Kolmogorov complexity).

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Search complexity | Slow encoding | Beam search, caching |
| Over-fitting templates | Poor generalization | MDL penalty for model size |
| Context memory | High RAM | Sliding window, pruning |
| Operator explosion | Hard to maintain | Hierarchical operators |

---

## 11. Success Criteria

1. **BPC reduction**: ≥25% on TinyStories
2. **Speed**: ≤2× slower than current
3. **Interpretability**: Programs are human-readable
4. **Learning**: Templates emerge from data, not hand-coded
