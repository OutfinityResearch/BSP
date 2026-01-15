# DS-002: Data Structures - Bitsets, Groups, and Indexes

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

Acest document descrie structurile de date fundamentale ale BSP, optimizate pentru operații pe CPU cu seturi mari și sparse.

---

## 2. Identități (Identity Universe)

### 2.1 Definiție

- **Univers**: `0..(N-1)` unde `N ≤ 1,000,000`
- Fiecare identitate reprezintă o caracteristică atomică (token, n-gram hash, feature)

### 2.2 Mapare Text → Identități

```typescript
interface Tokenizer {
  // Tokenizare text în IDs
  tokenize(text: string): number[];
  
  // Detokenizare
  detokenize(ids: number[]): string;
  
  // Vocabulary size
  vocabSize: number;
}

interface FeatureHasher {
  // Hash n-grams și features în identity space
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

## 3. Grupuri (Groups/Concepts)

### 3.1 Structura Grupului

```typescript
interface Group {
  id: number;                          // Unique identifier
  
  // Membership
  members: RoaringBitmap;              // Identitățile "esențiale"
  memberCounts: Map<number, number>;   // Contori per identitate (sparse)
  
  // Metadata
  salience: number;                    // Importanță (0-1)
  age: number;                         // Epochs since creation
  lastUsed: number;                    // Timestamp last activation
  usageCount: number;                  // Total activations
  
  // Deducții (outgoing)
  deduce: RoaringBitmap;               // Grupuri implicate
  deduceCounts: Map<number, number>;   // Greutăți per deducție
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

### 3.3 Operații pe Grupuri

```typescript
// Scor de potrivire grup-input
function groupScore(group: Group, input: RoaringBitmap): number {
  const intersection = group.members.andCardinality(input);
  const groupSize = group.members.size;
  
  if (groupSize === 0) return 0;
  
  // Jaccard-style cu penalizare pentru grupuri mari
  const coverage = intersection / groupSize;
  const sizePenalty = Math.log(groupSize + 1) * LAMBDA;
  
  return coverage - sizePenalty;
}

// Reconstrucție din grupuri active
function reconstruct(activeGroups: Group[]): RoaringBitmap {
  const result = new RoaringBitmap();
  for (const g of activeGroups) {
    result.orInPlace(g.members);
  }
  return result;
}

// Surpriză
function computeSurprise(input: RoaringBitmap, reconstruction: RoaringBitmap) {
  return {
    surprise: input.andNot(reconstruction),       // x \ x_hat
    hallucination: reconstruction.andNot(input),  // x_hat \ x
  };
}
```

---

## 4. Index Invers (BelongsTo)

### 4.1 Provocare

Cu 1M identități și mii de grupuri, păstrarea unui index invers complet poate fi costisitoare.

### 4.2 Strategie Hibridă

```typescript
class BitmapIndex {
  // Pentru identități frecvente: index complet
  private hotIndex: Map<number, RoaringBitmap>;
  
  // Pentru identități rare: index on-demand sau shingle-based
  private coldShingles: Map<number, RoaringBitmap>; // shingle hash → groups
  
  // Threshold pentru hot vs cold
  private hotThreshold: number;
  private identityUsage: Map<number, number>;
  
  // Adaugă un grup în index
  addGroup(group: Group): void {
    for (const identity of group.members) {
      if (this.isHot(identity)) {
        this.addToHotIndex(identity, group.id);
      }
    }
    this.addToShingleIndex(group);
  }
  
  // Găsește grupuri candidate pentru un input
  getCandidates(input: RoaringBitmap): RoaringBitmap {
    const candidates = new RoaringBitmap();
    
    // Din hot index
    for (const identity of input) {
      const groups = this.hotIndex.get(identity);
      if (groups) {
        candidates.orInPlace(groups);
      }
    }
    
    // Din shingle index (pentru cold identities)
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
    // Min-hash sau similar pentru similaritate aproximativă
    // ...
  }
}
```

---

## 5. Graful de Deducții

### 5.1 Structură

```typescript
class DeductionGraph {
  // Forward links: g → {h: weight}
  private forward: Map<number, Map<number, number>>;
  
  // Backward links pentru queries inverse
  private backward: Map<number, Map<number, number>>;
  
  // Bitset-uri pentru căutare rapidă
  private forwardBits: Map<number, RoaringBitmap>;
  
  // Adaugă sau întărește o deducție
  strengthen(from: number, to: number, delta: number): void {
    // Update forward
    const fwdMap = this.forward.get(from) || new Map();
    fwdMap.set(to, (fwdMap.get(to) || 0) + delta);
    this.forward.set(from, fwdMap);
    
    // Update bitset dacă depășește prag
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
  
  // Obține grupurile deduse direct
  getDirectDeductions(groupId: number): RoaringBitmap {
    return this.forwardBits.get(groupId) || new RoaringBitmap();
  }
  
  // Obține grupurile deduse cu greutăți
  getWeightedDeductions(groupId: number): Map<number, number> {
    return this.forward.get(groupId) || new Map();
  }
  
  // BFS pentru deducții indirecte
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
      
      // Beam: păstrează doar top-M
      frontier = this.topK(nextFrontier, scores, beamWidth);
      decay *= DECAY_FACTOR;
    }
    
    return scores;
  }
}
```

---

## 6. Replay Buffer

### 6.1 Structura Episodului

```typescript
interface Episode {
  timestamp: number;
  input: RoaringBitmap;          // Input original
  activeGroups: number[];        // Grupuri activate
  surprise: number;              // Mărimea surprizei
  reward: number;                // Semnal RL (dacă există)
  importance: number;            // Calculat la momentul înregistrării
  context?: number[];            // Grupuri din context anterior
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
      // Elimină episodul cu prioritate minimă
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
    // Sampling proporțional cu prioritatea
    // ...
  }
  
  private computePriority(ep: Episode): number {
    return ep.importance * (1 + ep.surprise) * (1 + Math.abs(ep.reward));
  }
}
```

---

## 7. Serializare

### 7.1 Format pe Disc

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
  
  // Indexes (opțional, pot fi reconstruite)
  belongsToHot?: {identity: number, groups: number[]}[];
  
  // Replay buffer
  replayBuffer?: SerializedEpisode[];
}

interface SerializedGroup {
  id: number;
  members: number[];         // Sau base64 encoded roaring
  memberCounts: [number, number][];  // [identity, count][]
  salience: number;
  age: number;
  usageCount: number;
}
```

### 7.2 Formatul Roaring Serializat

```typescript
class RoaringSerializer {
  // Serializare eficientă
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

## 8. Complexitate și Memorie

### 8.1 Estimări Memorie

| Structură | Estimare | Pentru N=1M, G=10K |
|-----------|----------|-------------------|
| Un grup (avg) | ~2KB | - |
| Toate grupurile | G * 2KB | ~20MB |
| Hot index (10%) | 0.1N * 8B * avgGroups | ~80MB |
| Deduction graph | G * avgDeduce * 8B | ~8MB |
| Replay buffer (50K) | 50K * 500B | ~25MB |
| **Total** | - | **~135MB** |

### 8.2 Complexitate Operații

| Operație | Complexitate |
|----------|--------------|
| encode(text) | O(tokens) |
| activate(x) | O(\|candidates\| * log G) |
| reconstruct(A) | O(\|A\| * avgMemberSize) |
| computeSurprise | O(\|x\| + \|x_hat\|) |
| learnGroup | O(\|x\|) |
| expandDeductions | O(depth * beamWidth * avgDeduce) |

---

## 9. Implementare Recomandată

### 9.1 Librării Node.js

```json
{
  "dependencies": {
    "roaring": "^2.0.0",
    "msgpack-lite": "^0.1.26",
    "lru-cache": "^10.0.0"
  }
}
```

### 9.2 Alternativă: Custom Bitset pentru seturi mici

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

## 10. Referințe

- Roaring Bitmap Paper: Chambi et al., "Better bitmap performance with Roaring bitmaps"
- Sparse Distributed Representations: SDR theory from Numenta
