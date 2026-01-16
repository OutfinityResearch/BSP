# DS-002: Data Structures - Bitsets, Groups, and Indexes

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

This document describes BSP's core data structures, optimized for CPU operations over large sparse sets.

Implementation note:
- The current codebase uses an in-repo bitset implementation (`SimpleBitset`) backed by `Uint32Array` (no external runtime dependencies).

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
function encode(text: string): SimpleBitset {
  const tokens = tokenizer.tokenize(text);
  const features = hasher.hash(tokens, 3); // tri-grams
  return SimpleBitset.fromArray(features, hasher.universeSize);
}
```

---

## 3. Groups (Concepts)

### 3.1 Group Structure

```typescript
interface Group {
  id: number;                          // Unique identifier
  
  // Membership
  members: SimpleBitset;               // The "essential" identities
  memberCounts: Map<number, number>;   // Counters per identity (sparse)
  
  // Metadata
  salience: number;                    // Importance (0-1)
  age: number;                         // Epochs since creation
  lastUsed: number;                    // Timestamp last activation
  usageCount: number;                  // Total activations

  // Note: deductions/edges are stored in DeductionGraph (DS-004), not inside the Group object.
}
```

### 3.2 GroupStore

```typescript
class GroupStore {
  private groups: Map<number, Group>;
  private nextId: number;
  private maxGroups: number;
  
  // CRUD
  create(initialMembers: SimpleBitset): Group;
  get(id: number): Group | undefined;
  delete(id: number): void;
  
  // Queries
  getCandidates(input: SimpleBitset): Set<number>;
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
function groupScore(group: Group, input: SimpleBitset): number {
  const intersection = group.members.andCardinality(input);
  const groupSize = group.members.size;
  
  if (groupSize === 0) return 0;
  
  // Jaccard-style with a penalty for large groups
  const coverage = intersection / groupSize;
  const sizePenalty = Math.log(groupSize + 1) * LAMBDA;
  
  return coverage - sizePenalty;
}

// Reconstruction from active groups
function reconstruct(activeGroups: Group[], maxSize: number): SimpleBitset {
  const result = new SimpleBitset(maxSize);
  for (const g of activeGroups) {
    result.orInPlace(g.members);
  }
  return result;
}

// Surprise
function computeSurprise(input: SimpleBitset, reconstruction: SimpleBitset) {
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

### 4.2 BelongsTo Map Strategy

```typescript
class BelongsToIndex {
  // identity -> group IDs that contain the identity
  private belongsTo: Map<number, Set<number>>;

  addGroup(group: Group): void {
    for (const identity of group.members) {
      if (!this.belongsTo.has(identity)) {
        this.belongsTo.set(identity, new Set());
      }
      this.belongsTo.get(identity)!.add(group.id);
    }
  }

  removeGroup(group: Group): void {
    for (const identity of group.members) {
      const set = this.belongsTo.get(identity);
      if (!set) continue;
      set.delete(group.id);
      if (set.size === 0) this.belongsTo.delete(identity);
    }
  }

  // Find candidate groups for an input (union of all matching identities).
  getCandidates(input: SimpleBitset): Set<number> {
    const candidates = new Set<number>();
    for (const identity of input) {
      const groups = this.belongsTo.get(identity);
      if (!groups) continue;
      for (const groupId of groups) candidates.add(groupId);
    }
    return candidates;
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
  
  // Add or strengthen a deduction
  strengthen(from: number, to: number, delta: number): void {
    // Update forward
    const fwdMap = this.forward.get(from) || new Map();
    fwdMap.set(to, (fwdMap.get(to) || 0) + delta);
    this.forward.set(from, fwdMap);

    // Update backward (similar)
    // ...
  }
  
  // Get weighted deductions
  getWeightedDeductions(groupId: number): Map<number, number> {
    return this.forward.get(groupId) || new Map();
  }
  
  // BFS for indirect deductions
  expandDeductions(
    startGroups: number[],
    maxDepth: number, 
    beamWidth: number
  ): Map<number, number> {
    const scores = new Map<number, number>();
    let frontier = new Set<number>(startGroups);
    let decay = 1.0;
    
    for (let depth = 0; depth < maxDepth; depth++) {
      const nextFrontier = new Map<number, number>(); // node -> accumulated score
      
      for (const g of frontier) {
        const deductions = this.getWeightedDeductions(g);
        for (const [h, weight] of deductions) {
          const score = (scores.get(h) || 0) + weight * decay;
          scores.set(h, score);
          nextFrontier.set(h, (nextFrontier.get(h) || 0) + weight * decay);
        }
      }
      
      // Beam: keep only top-M
      const sorted = [...nextFrontier.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, beamWidth);
      frontier = new Set(sorted.map(([id]) => id));
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
  inputBits: number[];           // Original input (as sparse bit indices)
  activeGroupIds: number[];      // Activated groups
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
  belongsTo?: { identity: number, groups: number[] }[];
  
  // Replay buffer
  replayBuffer?: SerializedEpisode[];
}

type SerializedBitset =
  | { type: 'sparse', bits: number[], maxSize: number }
  | { type: 'dense', data: string, maxSize: number };

interface SerializedGroup {
  id: number;
  members: SerializedBitset;
  memberCounts: [number, number][];  // [identity, count][]
  salience: number;
  age: number;
  usageCount: number;
}
```

### 7.2 Serialized Bitset Format

```typescript
// This mirrors the current SimpleBitset JSON shape:
// - Sparse: store explicit set bits
// - Dense: store the backing Uint32Array as base64
type SerializedBitset =
  | { type: 'sparse', bits: number[], maxSize: number }
  | { type: 'dense', data: string, maxSize: number };
```

---

## 8. Complexity and Memory

### 8.1 Memory Estimates

| Structure | Estimate | For N=1M, G=10K |
|-----------|----------|-------------------|
| One group (avg) | ~2KB | - |
| All groups | G * 2KB | ~20MB |
| BelongsTo index | Σ identity fan-out | depends on caps |
| Deduction graph | G * avgDeduce * 8B | ~8MB |
| Replay buffer (50K) | 50K * 500B | ~25MB |
| **Total** | - | **varies** |

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

### 9.1 Runtime Dependencies

- No external runtime dependencies.
- Use in-repo data structures (`SimpleBitset`, `GroupStore`, `DeductionGraph`, `ReplayBuffer`).
- If on-disk compression is needed, use Node.js built-ins (`node:zlib`) for gzip-compressed JSON.

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

- Sparse Distributed Representations: SDR theory from Numenta
