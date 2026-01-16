# DS-020: Adaptive Universe Size (Dynamic Bit-Width Encoding)

**Version**: 1.0  
**Status**: Proposal  
**Author**: BSP Team  
**Date**: 2026-01-16

---

## 1. Problem Statement

Currently, BSP uses a fixed `universeSize = 100,000` which means:
- Every surprise bit costs `log2(100,000) ≈ 16.6 bits` to encode
- This is the **maximum possible cost** from the start
- A new system with 100 known tokens pays the same as one with 100K tokens

**Example**: "The cat sat on the mat." with 9 surprise bits:
- Current: 9 × 16.6 = **150 bits** → BPC 6.50
- With dynamic (1000 tokens seen): 9 × 10 = **90 bits** → BPC 3.90

This violates the MDL principle: we should use the **minimum description length** for our current knowledge state.

---

## 2. Proposed Solution: Adaptive Universe

### 2.1 Core Idea

The universe size should grow with the system's knowledge:

```
effectiveUniverse = f(vocabulary_seen, groups_learned, tokens_processed)
```

Instead of paying for a universe we haven't explored, we pay for what we've actually seen.

### 2.2 Three Levels of Adaptation

#### Level 1: Vocabulary-Aware (Simplest)
Track unique tokens seen. Cost = log2(vocab_size + 1)

```javascript
class AdaptiveEncoder {
  constructor() {
    this.seenTokens = new Set();
  }
  
  observe(token) {
    this.seenTokens.add(token);
  }
  
  get effectiveUniverse() {
    // +1 for "unknown token" symbol
    return this.seenTokens.size + 1;
  }
  
  encodingCost(surpriseBits) {
    return surpriseBits * Math.log2(this.effectiveUniverse);
  }
}
```

**Pros**: Simple, theoretically sound  
**Cons**: Vocabulary can grow large quickly

#### Level 2: Frequency-Weighted (Huffman-style)
Common tokens cost less, rare tokens cost more.

```javascript
class FrequencyEncoder {
  constructor() {
    this.tokenCounts = new Map();
    this.totalCount = 0;
  }
  
  observe(token) {
    this.tokenCounts.set(token, (this.tokenCounts.get(token) || 0) + 1);
    this.totalCount++;
  }
  
  encodingCost(token) {
    const count = this.tokenCounts.get(token) || 0;
    if (count === 0) {
      // Unknown token: full cost
      return Math.log2(this.tokenCounts.size + 1);
    }
    // Probability-based cost (Shannon entropy)
    const p = count / this.totalCount;
    return -Math.log2(p);  // Common tokens → low cost
  }
}
```

**Pros**: Optimal for known distribution  
**Cons**: Requires tracking frequencies

#### Level 3: Hierarchical Expansion (Most Sophisticated)
Start with a small hash space, expand when needed.

```javascript
class HierarchicalUniverse {
  constructor() {
    this.currentBits = 8;  // Start with 256 buckets
    this.maxBits = 20;     // Can grow to 1M
    this.collisionCount = 0;
    this.expansionThreshold = 0.7;  // Expand at 70% collision rate
  }
  
  hash(token) {
    const fullHash = murmurhash(token);
    // Use only currentBits of the hash
    return fullHash & ((1 << this.currentBits) - 1);
  }
  
  get effectiveUniverse() {
    return 1 << this.currentBits;  // 2^currentBits
  }
  
  maybeExpand() {
    const collisionRate = this.collisionCount / this.totalTokens;
    if (collisionRate > this.expansionThreshold && this.currentBits < this.maxBits) {
      this.currentBits++;
      console.log(`Universe expanded to 2^${this.currentBits} = ${this.effectiveUniverse}`);
    }
  }
}
```

**Pros**: Automatic scaling, controls memory  
**Cons**: More complex, needs collision tracking

---

## 3. Implementation Plan

### 3.1 Phase 1: Add Vocabulary Tracking (Low-hanging fruit)

Modify `BSPEngine` to track vocabulary size:

```javascript
// In BSPEngine constructor
this.vocabTracker = {
  seen: new Set(),
  observe(tokens) {
    for (const t of tokens) this.seen.add(t);
  },
  get size() { return this.seen.size; }
};

// In process()
this.vocabTracker.observe(tokens);

// New method
get effectiveUniverseSize() {
  return Math.max(1000, this.vocabTracker.size * 2);  // 2x headroom
}
```

### 3.2 Phase 2: Dynamic Cost Calculation

Update MDL cost to use effective universe:

```javascript
// OLD (in runLM_Comp.mjs benchmark)
const dataCost = result.surprise * Math.log2(engine.config.universeSize);

// NEW
const dataCost = result.surprise * Math.log2(engine.effectiveUniverseSize);
```

### 3.3 Phase 3: Progressive Hash Expansion

For the hierarchical approach:

```javascript
class ProgressiveHasher {
  constructor(initialBits = 10) {
    this.bits = initialBits;
    this.buckets = new Map();  // bucket -> count
  }
  
  hash(value) {
    const h = this.fullHash(value);
    return h >>> (32 - this.bits);  // Use top N bits
  }
  
  observe(value) {
    const bucket = this.hash(value);
    const prev = this.buckets.get(bucket) || 0;
    this.buckets.set(bucket, prev + 1);
    
    // Check if expansion needed
    if (this.shouldExpand()) {
      this.expand();
    }
  }
  
  shouldExpand() {
    // Expand if average bucket size > 10
    const avgSize = this.totalCount / this.buckets.size;
    return avgSize > 10 && this.bits < 20;
  }
  
  expand() {
    this.bits++;
    // Note: existing hashes become prefixes of new hashes
    // No rehashing needed if we use consistent hashing
  }
  
  get universeSize() {
    return 1 << this.bits;
  }
}
```

---

## 4. Expected Impact

### 4.1 Compression Improvement

| Stage | Vocab Size | Universe | Cost/Surprise | Expected BPC |
|-------|------------|----------|---------------|--------------|
| Start (0 tokens) | 0 | 1,000 | 10.0 bits | ~4.0 |
| Early (1K tokens) | 500 | 1,000 | 10.0 bits | ~4.0 |
| Medium (10K tokens) | 3,000 | 6,000 | 12.5 bits | ~5.0 |
| Late (100K tokens) | 10,000 | 20,000 | 14.3 bits | ~5.7 |
| Max | 50,000 | 100,000 | 16.6 bits | ~6.5 |

### 4.2 Learning Curve

With adaptive encoding, the system can:
1. **Bootstrap faster**: Low initial cost allows rapid early learning
2. **Scale gracefully**: Costs grow only as needed
3. **Match MDL theory**: Description length reflects actual knowledge

---

## 5. Theoretical Justification

### 5.1 MDL Principle

MDL (Minimum Description Length) says the best model minimizes:

```
Total Cost = Model Description + Data Given Model
```

Currently, we over-specify the model by assuming universe = 100K. 

With adaptive encoding:
```
Total Cost = log2(vocab_size) + Model + Data|Model
```

This adds a small overhead (encoding the vocab size) but saves significantly on data encoding.

### 5.2 Kraft Inequality

For a valid prefix-free code, we need:
```
Σ 2^(-length_i) ≤ 1
```

With vocabulary V, the minimum average code length is:
```
H(V) = -Σ p(v) log2(p(v))
```

Using a fixed universe 100K when we have vocab 1K wastes:
```
log2(100000) - log2(1000) = 6.6 bits per symbol
```

---

## 6. Implementation Checklist

- [ ] Add `VocabTracker` class to track unique tokens
- [ ] Add `effectiveUniverseSize` property to `BSPEngine`
- [ ] Update MDL cost calculation in `Learner`
- [ ] Update benchmark to use dynamic cost
- [ ] Add `--adaptive` flag to benchmark for A/B testing
- [ ] Implement `ProgressiveHasher` for Phase 3
- [ ] Run comparative benchmarks (fixed vs adaptive)

---

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vocab grows too fast | High costs anyway | Cap at reasonable max (50K) |
| Serialization complexity | Breaks saved models | Include vocab in model state |
| Non-monotonic costs | Confusing metrics | Only expand, never shrink |
| Hash collisions | Poor grouping | Use consistent hashing |

---

## 8. Quick Win: Minimal Change

The simplest improvement that can be done **right now**:

```javascript
// In BSPEngine, add:
get effectiveUniverseSize() {
  // Use vocab size with 2x headroom, capped at config.universeSize
  const vocabSize = this.tokenizer?.vocab?.size || 1000;
  return Math.min(
    Math.max(1000, vocabSize * 2),
    this.config.universeSize
  );
}
```

This single change could reduce BPC by **30-50%** in early training.
