# DS-023: Emergent Instruction Set for Geometric Compression

**Version**: 3.0  
**Status**: Design  
**Author**: BSP Team  
**Date**: 2026-01-16

---

## 1. Core Insight

### 1.1 Unification Principle

**Transformations ARE concepts (groups), not separate operators.**

In BSP's representation space:
- **Content groups**: Encode WHAT something is (e.g., "cat", "happy")
- **Transform groups**: Encode HOW to go from A to B (e.g., "singular→plural")

Both are represented as bitsets in the same space. The distinction is in how they're used, not what they are.

### 1.2 Bootstrap + Discovery

We need a minimal set of **primitive operations** (hardcoded, optimized) from which all other transforms are composed. Compound transforms are **discovered** from data.

```
┌─────────────────────────────────────────────────────────────┐
│                    TRANSFORM HIERARCHY                       │
├─────────────────────────────────────────────────────────────┤
│  Level 2: COMPOUND (discovered)                              │
│           PLURAL, PAST_TENSE, ATTRIBUTE_BIND, ...           │
│           = sequences of primitives                          │
├─────────────────────────────────────────────────────────────┤
│  Level 1: PRIMITIVE (hardcoded, optimized)                   │
│           XOR, AND, OR, PERMUTE, IDENTITY, NEGATE           │
│           = atomic operations on bitsets                     │
├─────────────────────────────────────────────────────────────┤
│  Level 0: BITSET                                             │
│           Raw representation                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Primitive Operations

### 2.1 The Primitive Set

These are the fundamental operations that cannot be decomposed further:

| Primitive | Notation | Operation | Semantic Use |
|-----------|----------|-----------|--------------|
| **XOR** | `δ ⊕ a` | Toggle bits in δ | Add/remove features |
| **AND** | `mask ∧ a` | Keep only bits in mask | Projection, filtering |
| **OR** | `add ∨ a` | Add bits from add | Extension, bundling |
| **PERMUTE** | `π_k(a)` | Rotate bits by k | Binding, role assignment |
| **IDENTITY** | `I(a)` | Return a unchanged | Direct reference |
| **NEGATE** | `¬a` | Flip all bits | Complement |

### 2.2 Why These Primitives?

These correspond to:
- **Boolean algebra**: XOR, AND, OR, NOT are complete
- **VSA operations**: PERMUTE for binding, OR for bundling
- **Information theory**: Minimal operations to transform any bitset to any other

### 2.3 Primitive Cost Model

```javascript
// Primitives have fixed, low cost
const PRIMITIVE_COSTS = {
  IDENTITY: 0,        // Free
  XOR: 2,             // 2 bits (opcode)
  AND: 2,
  OR: 2,
  PERMUTE: 4,         // 2 bits opcode + 2 bits rotation amount
  NEGATE: 2,
};
```

---

## 3. Compound Transforms

### 3.1 Structure

A compound transform is:
```javascript
class CompoundTransform {
  id: number;
  type: 'TRANSFORM';
  
  // The transform encoded as a program of primitives
  primitives: PrimitiveOp[];
  
  // OR: The delta pattern (for simple XOR transforms)
  deltaPattern: Bitset;
  
  // Metadata
  usageCount: number;
  rank: number;           // Position in frequency ranking
  compressionSavings: number;
}

class PrimitiveOp {
  type: 'XOR' | 'AND' | 'OR' | 'PERMUTE' | 'IDENTITY' | 'NEGATE';
  operand?: Bitset | number;  // The mask/delta/rotation
}
```

### 3.2 Common Transform Patterns

| Pattern | Primitive Sequence | Example |
|---------|-------------------|---------|
| Simple delta | `XOR(δ)` | "cat" → "cats" |
| Projection | `AND(mask)` | Extract noun features |
| Extension | `OR(add)` | Add modifier features |
| Binding | `PERMUTE(k) → XOR(δ)` | Role assignment |
| Negation | `NEGATE → AND(mask)` | Antonym |

### 3.3 Cost Model for Compounds

```javascript
function getCompoundCost(transform) {
  // Option 1: Precomputed (frequent transforms)
  if (transform.rank !== undefined) {
    return Math.log2(transform.rank + 1);
  }
  
  // Option 2: Sum of primitives (new/rare transforms)
  let cost = 0;
  for (const prim of transform.primitives) {
    cost += PRIMITIVE_COSTS[prim.type];
    if (prim.operand instanceof Bitset) {
      cost += prim.operand.popcount() * BIT_COST;
    }
  }
  return cost;
}
```

---

## 4. Discovery Mechanism (Sleep Phase)

### 4.1 When Discovery Happens

Transform discovery happens during **sleep consolidation** (DS-010):
- Not during online learning (too expensive)
- Periodic batch processing
- Uses replay buffer for examples

### 4.2 Discovery Algorithm

```javascript
function discoverTransforms(replayBuffer, transformStore) {
  // 1. Collect pairs of related representations
  const pairs = collectRelatedPairs(replayBuffer);
  
  // 2. Compute deltas
  const deltas = [];
  for (const [a, b] of pairs) {
    const delta = a.xor(b);
    deltas.push({ delta, source: a, target: b });
  }
  
  // 3. Cluster similar deltas
  const clusters = clusterDeltas(deltas, similarityThreshold);
  
  // 4. Extract consensus transforms
  for (const cluster of clusters) {
    if (cluster.size >= minOccurrences) {
      const consensus = computeConsensus(cluster);
      const transform = createOrUpdateTransform(consensus, transformStore);
      transform.usageCount += cluster.size;
    }
  }
  
  // 5. Re-rank all transforms
  rerankTransforms(transformStore);
}

function computeConsensus(cluster) {
  // Intersection of all deltas in cluster = stable core
  let consensus = cluster[0].delta.clone();
  for (let i = 1; i < cluster.length; i++) {
    consensus = consensus.and(cluster[i].delta);
  }
  return consensus;
}
```

### 4.3 Incremental Discovery

```javascript
function observePotentialTransform(source, target) {
  const delta = source.xor(target);
  
  // Quick check: is this similar to existing transforms?
  const similar = findSimilarTransform(delta, quickThreshold);
  
  if (similar) {
    // Mark for consolidation during next sleep
    similar.pendingObservations.push({ delta, source, target });
  } else {
    // Store as candidate for next sleep phase
    candidateTransforms.add({ delta, source, target });
  }
}
```

---

## 5. Encoding Convention

### 5.1 Program Structure

A compression program is a sequence of steps:

```javascript
class CompressionProgram {
  steps: ProgramStep[];
  checksum: Checksum;
  cost: number;
}

class ProgramStep {
  type: 'CONTENT' | 'PRIMITIVE' | 'COMPOUND' | 'VERIFY';
  
  // For CONTENT: reference to content group
  groupId?: number;
  
  // For PRIMITIVE: the operation
  primitive?: PrimitiveOp;
  
  // For COMPOUND: reference to transform group
  transformId?: number;
  
  // For VERIFY: checksum to validate
  checksum?: Checksum;
}
```

### 5.2 Encoding Process

```javascript
function encode(target, context) {
  const candidates = [];
  
  // Strategy 1: Direct content reference
  const directMatch = findExactContentGroup(target);
  if (directMatch) {
    candidates.push({
      program: [{ type: 'CONTENT', groupId: directMatch.id }],
      cost: getContentCost(directMatch),
    });
  }
  
  // Strategy 2: Anchor + compound transform
  for (const anchor of findNearAnchors(target)) {
    const delta = target.xor(anchor.members);
    const transform = findBestTransform(delta);
    
    candidates.push({
      program: [
        { type: 'CONTENT', groupId: anchor.id },
        { type: 'COMPOUND', transformId: transform.id },
      ],
      cost: getContentCost(anchor) + getCompoundCost(transform),
    });
  }
  
  // Strategy 3: Sequence of primitives
  const primitiveProgram = decomposeToPrimitives(context, target);
  candidates.push(primitiveProgram);
  
  // Strategy 4: Literal (fallback)
  candidates.push({
    program: [{ type: 'LITERAL', bits: target }],
    cost: target.popcount() * LITERAL_BIT_COST,
  });
  
  // Return lowest cost with checksum
  const best = candidates.sort((a, b) => a.cost - b.cost)[0];
  best.checksum = computeChecksum(target);
  return best;
}
```

### 5.3 Decoding Process

```javascript
function decode(program) {
  let current = null;
  
  for (const step of program.steps) {
    switch (step.type) {
      case 'CONTENT':
        current = getContentGroup(step.groupId).members.clone();
        break;
        
      case 'PRIMITIVE':
        current = applyPrimitive(current, step.primitive);
        break;
        
      case 'COMPOUND':
        const transform = getTransformGroup(step.transformId);
        current = applyTransform(current, transform);
        break;
        
      case 'VERIFY':
        if (!verifyChecksum(current, step.checksum)) {
          return { success: false, needsSearch: true };
        }
        break;
        
      case 'LITERAL':
        current = step.bits.clone();
        break;
    }
  }
  
  // Final verification
  if (verifyChecksum(current, program.checksum)) {
    return { success: true, result: current };
  } else {
    return { success: false, needsSearch: true };
  }
}

function applyPrimitive(bits, primitive) {
  switch (primitive.type) {
    case 'XOR': return bits.xor(primitive.operand);
    case 'AND': return bits.and(primitive.operand);
    case 'OR': return bits.or(primitive.operand);
    case 'PERMUTE': return bits.rotate(primitive.operand);
    case 'NEGATE': return bits.not();
    case 'IDENTITY': return bits;
  }
}

function applyTransform(bits, transform) {
  if (transform.deltaPattern) {
    // Simple XOR transform
    return bits.xor(transform.deltaPattern);
  }
  
  // Compound: apply primitives in sequence
  let result = bits;
  for (const prim of transform.primitives) {
    result = applyPrimitive(result, prim);
  }
  return result;
}
```

---

## 6. Verification and Search

### 6.1 Checksum Structure

```javascript
class Checksum {
  popcount: number;      // Expected number of set bits
  fingerprint: bigint;   // 64-bit hash of the bitset
  samplePositions?: number[];  // Optional: specific bits to check
}

function computeChecksum(bits) {
  return {
    popcount: bits.popcount(),
    fingerprint: bits.hash64(),
  };
}

function verifyChecksum(bits, expected) {
  return bits.popcount() === expected.popcount &&
         bits.hash64() === expected.fingerprint;
}
```

### 6.2 Search as Fallback

When verification fails:
1. Try small variations (bit flips)
2. Try alternative transforms
3. Bounded brute-force search

```javascript
function searchForMatch(program, expectedChecksum, maxSteps) {
  const variations = generateVariations(program);
  
  for (let step = 0; step < maxSteps && step < variations.length; step++) {
    const variant = variations[step];
    const result = decode(variant);
    
    if (result.success && verifyChecksum(result.result, expectedChecksum)) {
      // Found it! Also update transform statistics
      recordSuccessfulVariation(program, variant);
      return { found: true, result: result.result };
    }
  }
  
  return { found: false };
}
```

---

## 7. Connection to Sleep (DS-010)

### 7.1 Extended Sleep Phase

Sleep consolidation now has two functions:
1. **Merge similar content groups** (existing)
2. **Discover transform groups** (new)

```javascript
function sleepConsolidation(store, graph, transformStore, replayBuffer) {
  // Phase 1: Content merge (existing DS-010)
  const merges = mergeContentGroups(store, graph);
  
  // Phase 2: Transform discovery (new)
  const newTransforms = discoverTransforms(replayBuffer, transformStore);
  
  // Phase 3: Prune unused transforms
  const pruned = pruneUnusedTransforms(transformStore);
  
  // Phase 4: Re-rank all transforms
  rerankTransforms(transformStore);
  
  return { merges, newTransforms, pruned };
}
```

### 7.2 Transform Ranking

```javascript
function rerankTransforms(transformStore) {
  const transforms = transformStore.getAll();
  
  // Sort by compression utility
  transforms.sort((a, b) => {
    const utilityA = a.compressionSavings / (a.cost || 1);
    const utilityB = b.compressionSavings / (b.cost || 1);
    return utilityB - utilityA;
  });
  
  // Assign ranks
  for (let i = 0; i < transforms.length; i++) {
    transforms[i].rank = i;
  }
}
```

---

## 8. Connection to Sequence (DS-022)

### 8.1 Temporal Transforms

The sequence model can be viewed as learning **temporal transforms**:
- `P(token_t | token_{t-1})` = probability of temporal transform
- High probability = low cost = "common temporal instruction"

### 8.2 Integration

```javascript
function getSequenceTransformCost(tokenPrev, tokenNext) {
  const prob = sequenceModel.getTransitionProb(tokenPrev, tokenNext);
  if (prob > 0) {
    return -Math.log2(prob);  // Shannon cost
  }
  return UNKNOWN_TRANSITION_COST;
}
```

The temporal transform cost is added to the total MDL cost.

---

## 9. Affected Components Summary

### 9.1 DS-002 (Data Structures)

**Add to Group interface:**
```javascript
interface Group {
  // ... existing fields ...
  
  type: 'CONTENT' | 'TRANSFORM';
  
  // For TRANSFORM groups:
  primitives?: PrimitiveOp[];  // Decomposition into primitives
  deltaPattern?: Bitset;       // Simple XOR pattern
  rank?: number;               // Position in frequency ranking
  compressionSavings?: number; // Total bits saved by using this
}
```

### 9.2 DS-003 (Learning Algorithms)

**Add transform observation during learning:**
```javascript
function trainStep(input, context) {
  // ... existing content learning ...
  
  // Observe potential transforms (lightweight)
  if (previousRepresentation) {
    observePotentialTransform(previousRepresentation, currentRepresentation);
  }
}
```

### 9.3 DS-010 (Sleep Consolidation)

**Extend with transform discovery:**
```javascript
function sleepConsolidation() {
  // Existing: merge content groups
  mergeContentGroups();
  
  // New: discover and consolidate transforms
  discoverTransforms();
  pruneUnusedTransforms();
  rerankTransforms();
}
```

### 9.4 DS-021 (Compression Machine)

**Replace hardcoded operators with discovered transforms:**
```javascript
// OLD
const operators = [LiteralOp, CopyOp, RepeatOp];

// NEW
function getOperators() {
  return [
    ...getPrimitiveOperators(),      // Hardcoded primitives
    ...getTopTransforms(maxCount),   // Discovered, ranked transforms
  ];
}
```

### 9.5 DS-022 (Emergent Grammar)

**Add clarification:**
- Sequence transitions ARE temporal transforms
- Grammar emerges from both:
  - Temporal transforms (DS-022): P(next | current)
  - Structural transforms (DS-023): A → B patterns

---

## 10. Implementation Plan

### Phase 1: Primitives Foundation
1. Implement primitive operations in Bitset class
2. Create PrimitiveOp structure
3. Add primitive cost model
4. Test: primitives compose correctly

### Phase 2: Transform Groups
1. Extend Group with type and transform fields
2. Create TransformStore (separate or unified with GroupStore)
3. Implement transform ranking
4. Test: transforms can be applied and ranked

### Phase 3: Discovery in Sleep
1. Extend ReplayBuffer to store representation pairs
2. Implement delta clustering
3. Implement consensus extraction
4. Integrate into sleepConsolidation
5. Test: transforms are discovered from data

### Phase 4: Encoding/Decoding
1. Implement CompressionProgram structure
2. Implement encode() with all strategies
3. Implement decode() with verification
4. Implement search fallback
5. Test: round-trip encoding works

### Phase 5: Integration
1. Connect to CompressionMachine (DS-021)
2. Connect to sequence model (DS-022)
3. Benchmark on TinyStories
4. Benchmark on BLiMP

---

## 11. Key Principles

### 11.1 Primitives are Hardcoded, Compounds are Discovered

We don't discover XOR - it's fundamental. But we discover that "adding -s suffix" is a common XOR pattern.

### 11.2 Cost Reflects Utility

Frequent transforms have low cost (high rank). This is automatic entropy coding.

### 11.3 Sleep is for Discovery

Online learning is too expensive for transform discovery. Sleep phases consolidate and discover.

### 11.4 Verification Ensures Correctness

Compound transforms may be approximate. Checksums catch errors, search fixes them.

### 11.5 The Instruction Set Evolves

As more data is seen, the transform library grows and refines. Unused transforms decay.

---

## 12. Summary

```
┌─────────────────────────────────────────────────────────────┐
│                  BSP COMPRESSION STACK                       │
├─────────────────────────────────────────────────────────────┤
│  PROGRAM = Sequence of references to:                        │
│    - Content groups (WHAT)                                  │
│    - Transform groups (HOW)                                 │
│    - Primitive ops (ATOMIC HOW)                             │
│    + Checksum (VERIFY)                                      │
├─────────────────────────────────────────────────────────────┤
│  COST = Σ log₂(rank) for each reference                     │
│         (frequent = cheap, rare = expensive)                │
├─────────────────────────────────────────────────────────────┤
│  DISCOVERY = During sleep:                                  │
│    1. Collect pairs from replay                             │
│    2. Compute deltas (XOR)                                  │
│    3. Cluster similar deltas                                │
│    4. Extract consensus transforms                          │
│    5. Re-rank by utility                                    │
├─────────────────────────────────────────────────────────────┤
│  PRIMITIVES = {XOR, AND, OR, PERMUTE, IDENTITY, NEGATE}    │
│               (hardcoded, cannot be discovered)             │
└─────────────────────────────────────────────────────────────┘
```

**The instruction set is discovered, not designed. Sleep is the discovery mechanism. Compression is understanding.**
