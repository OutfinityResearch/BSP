# DS-004: Deduction Engine

**Version**: 1.0  
**Status**: Draft  
**Author**: BPCM Team  
**Date**: 2026-01-15

---

## 1. Overview

Deduction Engine-ul BPCM gestionează legăturile cauzale/temporale între grupuri, permițând predicție și raționament multi-hop fără forward pass neuronal.

---

## 2. Tipuri de Deducții

### 2.1 Deducție Directă (Temporal)

Învățată din tranziții consecutive:
- Dacă grupul G apare la t, și grupul H apare la t+1, se întărește G → H

```
A_{t-1} ────► A_t
  │            │
  └──(învață)──┘
      g → h
```

### 2.2 Deducție Indirectă (Multi-hop)

Derivată prin tranzitivitate:
- Dacă G → H și H → I, atunci putem infera G ⇝ I (cu discount)

```
G ──► H ──► I
└────────⇝──┘ (indirect)
```

### 2.3 Deducție Condiționată

Deducții care depind de context:
- G → H doar dacă C este activ

---

## 3. Structuri de Date

### 3.1 DeductionGraph

```typescript
class DeductionGraph {
  // Legături forward: source → Map<target, weight>
  private forward: Map<number, Map<number, number>>;
  
  // Bitset-uri pentru căutare rapidă
  private forwardBits: Map<number, RoaringBitmap>;
  
  // Legături backward pentru query-uri inverse
  private backward: Map<number, Map<number, number>>;
  
  // Metadata per link
  private linkMeta: Map<string, DeductionMeta>;
  
  constructor() {
    this.forward = new Map();
    this.forwardBits = new Map();
    this.backward = new Map();
    this.linkMeta = new Map();
  }
}

interface DeductionMeta {
  created: number;
  lastStrengthened: number;
  strengthenCount: number;
  context?: number[];  // Grupuri de context când s-a învățat
}
```

---

## 4. Învățarea Deducțiilor

### 4.1 Update din Tranziții

```typescript
function updateDeductions(
  previousGroups: number[],
  currentGroups: number[],
  graph: DeductionGraph,
  importance: number
): void {
  const delta = ALPHA_DEDUCTION * importance;
  
  for (const prev of previousGroups) {
    for (const curr of currentGroups) {
      graph.strengthen(prev, curr, delta);
    }
  }
}
```

### 4.2 Strengthen cu Threshold

```typescript
class DeductionGraph {
  strengthen(from: number, to: number, delta: number): void {
    // Get or create forward map
    let fwdMap = this.forward.get(from);
    if (!fwdMap) {
      fwdMap = new Map();
      this.forward.set(from, fwdMap);
    }
    
    // Update weight
    const currentWeight = fwdMap.get(to) || 0;
    const newWeight = currentWeight + delta;
    fwdMap.set(to, newWeight);
    
    // Update bitset dacă depășește threshold
    if (newWeight >= DEDUCTION_THRESHOLD && currentWeight < DEDUCTION_THRESHOLD) {
      let bits = this.forwardBits.get(from);
      if (!bits) {
        bits = new RoaringBitmap();
        this.forwardBits.set(from, bits);
      }
      bits.add(to);
    }
    
    // Update backward
    let bwdMap = this.backward.get(to);
    if (!bwdMap) {
      bwdMap = new Map();
      this.backward.set(to, bwdMap);
    }
    bwdMap.set(from, newWeight);
    
    // Update metadata
    const key = `${from}:${to}`;
    const meta = this.linkMeta.get(key);
    if (meta) {
      meta.lastStrengthened = Date.now();
      meta.strengthenCount++;
    } else {
      this.linkMeta.set(key, {
        created: Date.now(),
        lastStrengthened: Date.now(),
        strengthenCount: 1,
      });
    }
  }
  
  weaken(from: number, to: number, delta: number): void {
    const fwdMap = this.forward.get(from);
    if (!fwdMap) return;
    
    const currentWeight = fwdMap.get(to) || 0;
    const newWeight = Math.max(0, currentWeight - delta);
    
    if (newWeight <= 0) {
      fwdMap.delete(to);
      this.forwardBits.get(from)?.remove(to);
      this.backward.get(to)?.delete(from);
      this.linkMeta.delete(`${from}:${to}`);
    } else {
      fwdMap.set(to, newWeight);
      
      if (newWeight < DEDUCTION_THRESHOLD) {
        this.forwardBits.get(from)?.remove(to);
      }
    }
  }
}
```

---

## 5. Predicție prin Deducție

### 5.1 Predicție Directă

```typescript
function predictDirect(
  activeGroups: number[],
  graph: DeductionGraph
): Map<number, number> {
  const predictions = new Map<number, number>();
  
  for (const groupId of activeGroups) {
    const weights = graph.getWeightedDeductions(groupId);
    
    for (const [target, weight] of weights) {
      const current = predictions.get(target) || 0;
      // Combinăm cu max sau sum
      predictions.set(target, Math.max(current, weight));
    }
  }
  
  return predictions;
}
```

### 5.2 Predicție Multi-hop (BFS cu Beam)

```typescript
function predictMultiHop(
  startGroups: number[],
  graph: DeductionGraph,
  maxDepth: number,
  beamWidth: number
): Map<number, number> {
  const scores = new Map<number, number>();
  
  // Inițializăm cu grupurile de start
  let frontier = new Set(startGroups);
  for (const g of startGroups) {
    scores.set(g, 1.0);
  }
  
  for (let depth = 1; depth <= maxDepth; depth++) {
    const decay = Math.pow(DEPTH_DECAY, depth);
    const nextFrontier = new Map<number, number>();
    
    for (const sourceId of frontier) {
      const sourceScore = scores.get(sourceId) || 0;
      const deductions = graph.getWeightedDeductions(sourceId);
      
      for (const [targetId, weight] of deductions) {
        // Skip dacă e în start (nu vrem să revenim)
        if (startGroups.includes(targetId)) continue;
        
        const propagatedScore = sourceScore * weight * decay;
        const existing = nextFrontier.get(targetId) || 0;
        nextFrontier.set(targetId, existing + propagatedScore);
      }
    }
    
    // Beam: păstrăm doar top-M
    const sorted = Array.from(nextFrontier.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, beamWidth);
    
    frontier = new Set();
    for (const [id, score] of sorted) {
      frontier.add(id);
      const existing = scores.get(id) || 0;
      scores.set(id, existing + score);
    }
    
    if (frontier.size === 0) break;
  }
  
  // Eliminăm grupurile de start din rezultat
  for (const g of startGroups) {
    scores.delete(g);
  }
  
  return scores;
}
```

---

## 6. Inferență pentru Generare

### 6.1 Next-Group Prediction

```typescript
function predictNextGroups(
  context: Group[],
  graph: DeductionGraph,
  store: GroupStore,
  topK: number
): {groupId: number, score: number}[] {
  const contextIds = context.map(g => g.id);
  
  // Multi-hop prediction
  const scores = predictMultiHop(contextIds, graph, INFERENCE_DEPTH, BEAM_WIDTH);
  
  // Sortează și returnează top-K
  return Array.from(scores.entries())
    .map(([id, score]) => ({groupId: id, score}))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

### 6.2 Next-Token Approximation

```typescript
function predictNextBits(
  context: Group[],
  graph: DeductionGraph,
  store: GroupStore
): RoaringBitmap {
  // Predicție de grupuri
  const predictedGroups = predictNextGroups(context, graph, store, TOP_K_PREDICT);
  
  // Reconstrucție în biți
  const result = new RoaringBitmap();
  
  for (const {groupId, score} of predictedGroups) {
    if (score < MIN_PREDICTION_SCORE) continue;
    
    const group = store.get(groupId);
    if (group) {
      // Adaugă biții weighted by score
      result.orInPlace(group.members);
    }
  }
  
  return result;
}
```

---

## 7. Reasoning Chains

### 7.1 Extragere Lanțuri

```typescript
interface ReasoningChain {
  steps: {
    from: number;
    to: number;
    weight: number;
    depth: number;
  }[];
  totalScore: number;
}

function extractReasoningChains(
  startGroups: number[],
  targetGroups: number[],
  graph: DeductionGraph,
  maxDepth: number
): ReasoningChain[] {
  const chains: ReasoningChain[] = [];
  const targetSet = new Set(targetGroups);
  
  // DFS cu memoization
  function dfs(
    current: number,
    depth: number,
    path: ReasoningChain['steps'],
    score: number
  ): void {
    if (depth > maxDepth) return;
    if (targetSet.has(current) && path.length > 0) {
      chains.push({
        steps: [...path],
        totalScore: score,
      });
      return;
    }
    
    const deductions = graph.getWeightedDeductions(current);
    for (const [next, weight] of deductions) {
      // Evităm cicluri
      if (path.some(s => s.to === next)) continue;
      
      const newScore = score * weight * Math.pow(DEPTH_DECAY, depth);
      if (newScore < MIN_CHAIN_SCORE) continue;
      
      path.push({from: current, to: next, weight, depth});
      dfs(next, depth + 1, path, newScore);
      path.pop();
    }
  }
  
  for (const start of startGroups) {
    dfs(start, 0, [], 1.0);
  }
  
  return chains.sort((a, b) => b.totalScore - a.totalScore);
}
```

### 7.2 Explicabilitate

```typescript
function explainPrediction(
  context: Group[],
  prediction: Group,
  graph: DeductionGraph,
  store: GroupStore
): string {
  const chains = extractReasoningChains(
    context.map(g => g.id),
    [prediction.id],
    graph,
    3
  );
  
  if (chains.length === 0) {
    return `No reasoning chain found to ${prediction.id}`;
  }
  
  const best = chains[0];
  const explanation: string[] = [];
  
  for (const step of best.steps) {
    const fromGroup = store.get(step.from);
    const toGroup = store.get(step.to);
    
    explanation.push(
      `[${fromGroup?.members.size || 0} bits] → ` +
      `[${toGroup?.members.size || 0} bits] (w=${step.weight.toFixed(2)})`
    );
  }
  
  return explanation.join(' → ');
}
```

---

## 8. Decay și Maintenance

### 8.1 Decay Deducții

```typescript
function decayDeductions(graph: DeductionGraph): void {
  for (const [from, targets] of graph.forward) {
    for (const [to, weight] of targets) {
      const newWeight = weight * DEDUCTION_DECAY_FACTOR;
      
      if (newWeight < DEDUCTION_MIN_WEIGHT) {
        graph.weaken(from, to, weight);
      } else {
        targets.set(to, newWeight);
      }
    }
  }
}
```

### 8.2 Pruning Deducții Slabe

```typescript
function pruneWeakDeductions(
  graph: DeductionGraph,
  threshold: number
): number {
  let pruned = 0;
  
  for (const [from, targets] of graph.forward) {
    for (const [to, weight] of targets) {
      if (weight < threshold) {
        graph.weaken(from, to, weight);
        pruned++;
      }
    }
  }
  
  return pruned;
}
```

---

## 9. Metrici

### 9.1 Evaluare Predicții

```typescript
interface DeductionMetrics {
  // Precision: câte predicții corecte / total predicții
  precision: number;
  
  // Recall: câte grupuri reale au fost prezise / total reale
  recall: number;
  
  // Average path length pentru deducții corecte
  avgPathLength: number;
  
  // Diversitate: câte grupuri distincte sunt prezise
  diversity: number;
}

function evaluatePredictions(
  predicted: Map<number, number>,
  actual: number[]
): DeductionMetrics {
  const actualSet = new Set(actual);
  const predictedIds = Array.from(predicted.keys());
  
  const correctPredictions = predictedIds.filter(id => actualSet.has(id));
  
  return {
    precision: correctPredictions.length / predictedIds.length || 0,
    recall: correctPredictions.length / actual.length || 0,
    avgPathLength: 0, // Computed separately
    diversity: new Set(predictedIds).size,
  };
}
```

---

## 10. Parametri

| Parametru | Valoare | Descriere |
|-----------|---------|-----------|
| `ALPHA_DEDUCTION` | 0.15 | Learning rate deducții |
| `DEDUCTION_THRESHOLD` | 1.0 | Prag pentru bitset |
| `DEPTH_DECAY` | 0.7 | Discount per hop |
| `INFERENCE_DEPTH` | 3 | Max hops pentru predicție |
| `BEAM_WIDTH` | 128 | Noduri în beam search |
| `DEDUCTION_DECAY_FACTOR` | 0.999 | Decay per step |
| `DEDUCTION_MIN_WEIGHT` | 0.01 | Sub acest prag = prune |
| `MIN_PREDICTION_SCORE` | 0.1 | Prag minim pentru output |
| `MIN_CHAIN_SCORE` | 0.01 | Prag pentru lanțuri |

---

## 11. Diagrama Flow

```
                     Context Groups
                          │
                          ▼
              ┌───────────────────────┐
              │  Direct Deductions    │
              │  (depth 1)            │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Multi-hop Expansion  │
              │  (BFS with beam)      │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Score Aggregation    │
              │  (sum / max)          │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Top-K Selection      │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Decode to Bits       │
              │  (union members)      │
              └───────────────────────┘
                          │
                          ▼
                   Predicted Bits
```
