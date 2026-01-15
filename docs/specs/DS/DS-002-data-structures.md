# DS-002: Data Structures - Bitsets, Groups, and Indexes

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

This document describes BSP's core data structures, optimized for CPU operations over large sparse sets.

---

## 2. Identities (Identity Universe)

### 2.1 Definition

- **Universe**: `0..(N-1)` where `N ≤ 1,000,000`
- Each identity represents an atomic feature (token, n-gram hash, feature)

### 2.2 Mapping Text → Identities

```typescript
interface Tokenizer {
  // Tokenize text into IDs
  tokenize(text: string): number[];
  
  // Detokenize
  detokenize(ids: number[]): string;
  
  // Vocabulary size
  vocabSize: number;
}

interface FeatureHasher {
  // Hash n-grams and features into the identity space
  hash(tokens: number[], n: number): number[];
  
  // Universe size
  universeSize: number;
}
```

### 2.3 Encoding Input

```typescript
function encode(text: string): RoaringBitmap {
  const tokens = tokenizer.tokenize(text);
  const features = hasher.hash(tokens, 3); // tri-grams
  const bitmap = new RoaringBitmap();
  for (const f of features) {
    bitmap.add(f);
  }
  return bitmap;
}
```

---

## 3. Groups (Concepts)

### 3.1 Group Structure

```typescript
interface Group {
  id: number;                          // Unique identifier
  
  // Membership
  members: RoaringBitmap;              // The "essential" identities
  memberCounts: Map<number, number>;   // Counters per identity (sparse)
  
  // Metadata
  salience: number;                    // Importance (0-1)
  age: number;                         // Epochs since creation
  lastUsed: number;                    // Timestamp last activation
  usageCount: number;                  // Total activations
  
  // Deductions (outgoing)
  deduce: RoaringBitmap;               // Linked/target groups
  deduceCounts: Map<number, number>;   // Weights per deduction
}
```

### 3.2 GroupStore

```typescript
class GroupStore {
  private groups: Map<number, Group>;
  private nextId: number;
  private maxGroups: number;
  
  // CRUD
  create(initialMembers: RoaringBitmap): Group;
  get(id: number): Group | undefined;
  delete(id: number): void;
  
  // Queries
  getByMemberOverlap(x: RoaringBitmap, minOverlap: number): Group[];
  getTopBySalience(k: number): Group[];
  
  // Maintenance
  prune(minUsage: number, maxAge: number): number; // Returns pruned count
  decay(factor: number): void;
  
  // Stats
  get size(): number;
  get totalMembers(): number;
}
```

### 3.3 Group Operations

```typescript
// Group-input match score
function groupScore(group: Group, input: RoaringBitmap): number {
  const intersection = group.members.andCardinality(input);
  const groupSize = group.members.size;
  
  if (groupSize === 0) return 0;
  
  // Jaccard-style with a penalty for large groups
  const coverage = intersection / groupSize;
  const sizePenalty = Math.log(groupSize + 1) * LAMBDA;
  
  return coverage - sizePenalty;
}

// Reconstruction from active groups
function reconstruct(activeGroups: Group[]): RoaringBitmap {
  const result = new RoaringBitmap();
  for (const g of activeGroups) {
    result.orInPlace(g.members);
  }
  return result;
}

// Surprise
function computeSurprise(input: RoaringBitmap, reconstruction: RoaringBitmap) {
  return {
    surprise: input.andNot(reconstruction),       // x \ x_hat
    hallucination: reconstruction.andNot(input),  // x_hat \ x
  };
}
```

---

## 4. Inverted Index (BelongsTo)

### 4.1 Challenge

With 1M identities and thousands of groups, maintaining a full inverted index can be expensive.

### 4.2 Hybrid Strategy

```typescript
class BitmapIndex {
  // For frequent identities: full index
  private hotIndex: Map<number, RoaringBitmap>;
  
  // For rare identities: on-demand index or shingle-based approximation
  private coldShingles: Map<number, RoaringBitmap>; // shingle hash → groups
  
  // Threshold for hot vs cold
  private hotThreshold: number;
  private identityUsage: Map<number, number>;
  
  // Add a group to the index
  addGroup(group: Group): void {
    for (const identity of group.members) {
      if (this.isHot(identity)) {
        this.addToHotIndex(identity, group.id);
      }
    }
    this.addToShingleIndex(group);
  }
  
  // Find candidate groups for an input
  getCandidates(input: RoaringBitmap): RoaringBitmap {
    const candidates = new RoaringBitmap();
    
    // From hot index
    for (const identity of input) {
      const groups = this.hotIndex.get(identity);
      if (groups) {
        candidates.orInPlace(groups);
      }
    }
    
    // From shingle index (for cold identities)
    const shingles = this.computeShingles(input);
    for (const sh of shingles) {
      const groups = this.coldShingles.get(sh);
      if (groups) {
        candidates.orInPlace(groups);
      }
    }
    
    return candidates;
  }
  
  private isHot(identity: number): boolean {
    return (this.identityUsage.get(identity) || 0) >= this.hotThreshold;
  }
  
  private computeShingles(input: RoaringBitmap): number[] {
    // Min-hash or similar for approximate similarity
    // ...
  }
}
```

---

## 5. Deduction Graph

### 5.1 Structure

```typescript
class DeductionGraph {
  // Forward links: g → {h: weight}
  private forward: Map<number, Map<number, number>>;
  
  // Backward links for reverse queries
  private backward: Map<number, Map<number, number>>;
  
  // Bitsets for fast search
  private forwardBits: Map<number, RoaringBitmap>;
  
  // Add or strengthen a deduction
  strengthen(from: number, to: number, delta: number): void {
    // Update forward
    const fwdMap = this.forward.get(from) || new Map();
    fwdMap.set(to, (fwdMap.get(to) || 0) + delta);
    this.forward.set(from, fwdMap);
    
    // Update bitset when crossing the threshold
    if (fwdMap.get(to)! >= DEDUCTION_THRESHOLD) {
      let bits = this.forwardBits.get(from);
      if (!bits) {
        bits = new RoaringBitmap();
        this.forwardBits.set(from, bits);
      }
      bits.add(to);
    }
    
    // Update backward (similar)
    // ...
  }
  
  // Get directly deduced groups
  getDirectDeductions(groupId: number): RoaringBitmap {
    return this.forwardBits.get(groupId) || new RoaringBitmap();
  }
  
  // Get weighted deductions
  getWeightedDeductions(groupId: number): Map<number, number> {
    return this.forward.get(groupId) || new Map();
  }
  
  // BFS for indirect deductions
  expandDeductions(
    startGroups: RoaringBitmap, 
    maxDepth: number, 
    beamWidth: number
  ): Map<number, number> {
    const scores = new Map<number, number>();
    let frontier = startGroups;
    let decay = 1.0;
    
    for (let depth = 0; depth < maxDepth; depth++) {
      const nextFrontier = new RoaringBitmap();
      
      for (const g of frontier) {
        const deductions = this.getWeightedDeductions(g);
        for (const [h, weight] of deductions) {
          const score = (scores.get(h) || 0) + weight * decay;
          scores.set(h, score);
          nextFrontier.add(h);
        }
      }
      
      // Beam: keep only top-M
      frontier = this.topK(nextFrontier, scores, beamWidth);
      decay *= DECAY_FACTOR;
    }
    
    return scores;
  }
}
```

---

## 6. Replay Buffer

### 6.1 Episode Structure

```typescript
interface Episode {
  timestamp: number;
  input: RoaringBitmap;          // Original input
  activeGroups: number[];        // Activated groups
  surprise: number;              // Surprise magnitude
  reward: number;                // RL signal (if any)
  importance: number;            // Computed at record time
  context?: number[];            // Groups from prior context
}
```

### 6.2 Prioritized Buffer

```typescript
class ReplayBuffer {
  private buffer: Episode[];
  private maxSize: number;
  private priorityIndex: MinHeap<{priority: number, index: number}>;
  
  add(episode: Episode): void {
    const priority = this.computePriority(episode);
    
    if (this.buffer.length >= this.maxSize) {
      // Evict the minimum-priority episode
      const min = this.priorityIndex.pop();
      this.buffer[min.index] = episode;
      this.priorityIndex.push({priority, index: min.index});
    } else {
      const index = this.buffer.length;
      this.buffer.push(episode);
      this.priorityIndex.push({priority, index});
    }
  }
  
  sample(k: number): Episode[] {
    // Sampling proportional to priority
    // ...
  }
  
  private computePriority(ep: Episode): number {
    return ep.importance * (1 + ep.surprise) * (1 + Math.abs(ep.reward));
  }
}
```

---

## 7. Serialization

### 7.1 On-disk Format

```typescript
interface SerializedState {
  version: string;
  timestamp: number;
  
  // Metadata
  config: SystemConfig;
  stats: SystemStats;
  
  // Core data
  groups: SerializedGroup[];
  deductions: SerializedDeduction[];
  
  // Indexes (optional, can be rebuilt)
  belongsToHot?: {identity: number, groups: number[]}[];
  
  // Replay buffer
  replayBuffer?: SerializedEpisode[];
}

interface SerializedGroup {
  id: number;
  members: number[];         // Or base64-encoded Roaring
  memberCounts: [number, number][];  // [identity, count][]
  salience: number;
  age: number;
  usageCount: number;
}
```

### 7.2 Serialized Roaring Format

```typescript
class RoaringSerializer {
  // Efficient serialization
  static toBuffer(bitmap: RoaringBitmap): Buffer {
    return bitmap.serialize();  // Built-in roaring method
  }
  
  static toBase64(bitmap: RoaringBitmap): string {
    return bitmap.serialize().toString('base64');
  }
  
  static fromBuffer(buffer: Buffer): RoaringBitmap {
    return RoaringBitmap.deserialize(buffer);
  }
  
  static fromBase64(str: string): RoaringBitmap {
    return RoaringBitmap.deserialize(Buffer.from(str, 'base64'));
  }
}
```

---

## 8. Complexity and Memory

### 8.1 Memory Estimates

| Structure | Estimate | For N=1M, G=10K |
|-----------|----------|-------------------|
| One group (avg) | ~2KB | - |
| All groups | G * 2KB | ~20MB |
| Hot index (10%) | 0.1N * 8B * avgGroups | ~80MB |
| Deduction graph | G * avgDeduce * 8B | ~8MB |
| Replay buffer (50K) | 50K * 500B | ~25MB |
| **Total** | - | **~135MB** |

### 8.2 Operation Complexity

| Operation | Complexity |
|----------|--------------|
| encode(text) | O(tokens) |
| activate(x) | O(\|candidates\| * log G) |
| reconstruct(A) | O(\|A\| * avgMemberSize) |
| computeSurprise | O(\|x\| + \|x_hat\|) |
| learnGroup | O(\|x\|) |
| expandDeductions | O(depth * beamWidth * avgDeduce) |

---

## 9. Recommended Implementation

### 9.1 Node.js Packages

```json
{
  "dependencies": {
    "roaring": "^2.0.0",
    "msgpack-lite": "^0.1.26",
    "lru-cache": "^10.0.0"
  }
}
```

### 9.2 Alternative: Custom Bitset for Small Sets

```typescript
class SimpleBitset {
  private words: Uint32Array;
  
  constructor(size: number) {
    this.words = new Uint32Array(Math.ceil(size / 32));
  }
  
  add(bit: number): void {
    this.words[bit >>> 5] |= (1 << (bit & 31));
  }
  
  has(bit: number): boolean {
    return (this.words[bit >>> 5] & (1 << (bit & 31))) !== 0;
  }
  
  and(other: SimpleBitset): SimpleBitset {
    const result = new SimpleBitset(this.words.length * 32);
    for (let i = 0; i < this.words.length; i++) {
      result.words[i] = this.words[i] & other.words[i];
    }
    return result;
  }
  
  popcount(): number {
    let count = 0;
    for (const word of this.words) {
      count += this.popcount32(word);
    }
    return count;
  }
  
  private popcount32(n: number): number {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }
}
```

---

## 10. References

- Roaring Bitmap Paper: Chambi et al., "Better bitmap performance with Roaring bitmaps"
- Sparse Distributed Representations: SDR theory from Numenta
