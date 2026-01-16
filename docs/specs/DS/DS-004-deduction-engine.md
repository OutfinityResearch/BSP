# DS-004: Deduction Engine

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

The BSP Deduction Engine manages causal/temporal links between groups, enabling multi-hop prediction and reasoning without a neural forward pass.

---

## 2. Types of Deductions

### 2.1 Direct Deduction (Temporal)

Learned from consecutive transitions:
- If group G appears at time t and group H appears at time t+1, strengthen G → H

```
A_{t-1} ────► A_t
  │            │
  └──(learns)──┘
      g → h
```

### 2.2 Indirect Deduction (Multi-hop)

Derived via transitivity:
- If G → H and H → I, we can infer G ⇝ I (with discount)

```
G ──► H ──► I
└────────⇝──┘ (indirect)
```

### 2.3 Conditional Deduction

Deductions that depend on context:
- G → H only if C is active

---

## 3. Data Structures

### 3.1 DeductionGraph

```typescript
class DeductionGraph {
  // Forward links: source → Map<target, weight>
  private forward: Map<number, Map<number, number>>;
  
  // Bitsets for fast search
  private forwardBits: Map<number, RoaringBitmap>;
  
  // Backward links for reverse queries
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
  context?: number[];  // Context groups when the link was learned
}
```

---

## 4. Learning Deductions

### 4.1 Update from Transitions

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

### 4.2 Strengthen with Threshold

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
    
    // Update bitset when crossing the threshold
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

## 5. Prediction via Deductions

### 5.1 Direct Prediction

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
      // Combine via max or sum
      predictions.set(target, Math.max(current, weight));
    }
  }
  
  return predictions;
}
```

### 5.2 Multi-hop Prediction (BFS with Beam)

```typescript
function predictMultiHop(
  startGroups: number[],
  graph: DeductionGraph,
  maxDepth: number,
  beamWidth: number
): Map<number, number> {
  const scores = new Map<number, number>();
  
  // Initialize with the start groups
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
        // Skip if it's in start (avoid returning to the seed set)
        if (startGroups.includes(targetId)) continue;
        
        const propagatedScore = sourceScore * weight * decay;
        const existing = nextFrontier.get(targetId) || 0;
        nextFrontier.set(targetId, existing + propagatedScore);
      }
    }
    
    // Beam: keep only top-M
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
  
  // Remove start groups from the result
  for (const g of startGroups) {
    scores.delete(g);
  }
  
  return scores;
}
```

---

## 6. Inference for Generation

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
  
  // Sort and return top-K
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
  // Group prediction
  const predictedGroups = predictNextGroups(context, graph, store, TOP_K_PREDICT);
  
  // Reconstruction into bits
  const result = new RoaringBitmap();
  
  for (const {groupId, score} of predictedGroups) {
    if (score < MIN_PREDICTION_SCORE) continue;
    
    const group = store.get(groupId);
    if (group) {
      // Add bits (weighted by score)
      result.orInPlace(group.members);
    }
  }
  
  return result;
}
```

---

## 7. Reasoning Chains

### 7.1 Chain Extraction

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
  
  // DFS with memoization
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
      // Avoid cycles
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

### 7.2 Explainability

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

## 8. Decay and Maintenance

### 8.1 Deduction Decay

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

### 8.2 Pruning Weak Deductions

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

## 9. Metrics

### 9.1 Prediction Evaluation

```typescript
interface DeductionMetrics {
  // Precision: correct predictions / total predictions
  precision: number;
  
  // Recall: true groups predicted / total true groups
  recall: number;
  
  // Average path length for correct deductions
  avgPathLength: number;
  
  // Diversity: how many distinct groups are predicted
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

## 10. Parameters

| Parameter | Value | Description |
|-----------|---------|-----------|
| `ALPHA_DEDUCTION` | 0.15 | Learning rate for deductions |
| `DEDUCTION_THRESHOLD` | 1.0 | Bitset threshold |
| `DEPTH_DECAY` | 0.7 | Discount per hop |
| `INFERENCE_DEPTH` | 3 | Max hops for prediction |
| `BEAM_WIDTH` | 128 | Nodes in beam search |
| `DEDUCTION_DECAY_FACTOR` | 0.999 | Decay per step |
| `DEDUCTION_MIN_WEIGHT` | 0.01 | Below this threshold => prune |
| `MIN_PREDICTION_SCORE` | 0.1 | Minimum threshold for output |
| `MIN_CHAIN_SCORE` | 0.01 | Minimum threshold for chains |

---

## 11. Flow Diagram

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