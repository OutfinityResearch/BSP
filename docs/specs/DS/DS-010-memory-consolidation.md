# DS-010: Memory Consolidation (Sleep Phase)

**Version**: 1.0  
**Status**: Implemented (v1) + Planned Improvements  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

BSP learns online and may create many partially redundant groups over time. Consolidation (“sleep phase”) is a maintenance procedure that merges highly similar groups and removes redundancy, improving:

- retrieval speed (fewer groups and less candidate fan-out)
- prediction stability (less probability mass split across near-duplicates)
- interpretability (fewer “same concept” groups with tiny variations)

This DS focuses on **merge-based consolidation**. It is complementary to:
- DS-003: merge/split mechanics during learning (online)
- DS-014 / DS-017: budgeting and performance constraints for maintenance tasks

---

## 2. Problem

As BSP runs continuously, the `GroupStore` accumulates:
1. **Redundant Groups:** "The cat", "A cat", "That cat" might create overlapping but distinct groups.
2. **Noise:** Groups created from one-off typos or rare events.
3. **Fragmentation:** Related concepts are split across too many small groups.

This degrades performance (slower search) and prediction quality (splitting probability mass).

---

## 3. Goals and Non-goals

### 3.1 Goals

1. Merge near-duplicate groups while preserving predictive usefulness.
2. Keep runtime bounded (avoid O(N²) scans over all groups).
3. Update both:
   - group membership structures (`GroupStore`)
   - deduction edges (`DeductionGraph`)
4. Maintain invariants:
   - the inverse index does not contain deleted groups
   - there are no edges referencing deleted groups

### 3.2 Non-goals

1. Perfect clustering or global optimum merges.
2. Rebuilding the entire store or graph from scratch.
3. Complex semantic alignment (this is purely set-similarity based).

---

## 4. Definitions

### 4.1 Group Similarity (Jaccard)

For groups `G` and `H` with member bitsets `M(G)` and `M(H)`:

```
J(G, H) = |M(G) ∩ M(H)| / |M(G) ∪ M(H)|
```

We merge when `J(G, H) ≥ mergeThreshold`.

### 4.2 Candidate Retrieval

Instead of comparing `G` to all groups, we retrieve candidates using the inverted index (`belongsTo`):

- For every identity bit in `M(G)`, get `belongsTo[bit]` (a set of group IDs).
- Union those sets to obtain candidate group IDs.

This makes consolidation scale with *candidate fan-out* rather than total groups.

---

## 5. Sleep Consolidation Algorithm

Consolidation is a maintenance mode that can be triggered:
- periodically (e.g. every N steps)
- explicitly (server command / engine API)

### 5.1 High-Level Strategy (Hierarchical Approximation)

We approximate hierarchical clustering by:
1. Sorting groups by size (largest first).
2. Merging smaller/highly similar candidates into the current “primary”.

Rationale:
- merging into larger groups tends to preserve strong patterns
- it reduces churn (fewer “large group deleted” cases)

### 5.2 Pseudocode (Aligned with Current Implementation)

```typescript
function sleepConsolidation(store: GroupStore, graph: DeductionGraph): number {
  const groups = [...store.getAll()];
  groups.sort((a, b) => b.members.size - a.members.size);

  const visited = new Set<number>();
  let merges = 0;

  for (const primary of groups) {
    if (visited.has(primary.id)) continue;
    if (!store.get(primary.id)) continue; // merged away already

    const candidates = store.getCandidates(primary.members);
    for (const candidateId of candidates) {
      if (candidateId === primary.id) continue;
      if (visited.has(candidateId)) continue;

      const candidate = store.get(candidateId);
      if (!candidate) continue;

      const j = primary.members.jaccard(candidate.members);
      if (j >= MERGE_THRESHOLD) {
        // 1) redirect graph edges
        graph.mergeNodes(primary.id, candidate.id);
        // 2) merge group memberships + counts + salience
        store.merge(primary, candidate);
        visited.add(candidate.id);
        merges++;
      }
    }

    visited.add(primary.id);
  }

  return merges;
}
```

---

## 6. Merge Semantics (What Must Change)

### 6.1 GroupStore Merge

When merging source `B` into target `A`:

1. Union member bitsets: `A.members = A.members OR B.members`
2. Combine per-identity counts: `A.memberCounts[id] += B.memberCounts[id]`
3. Preserve/accumulate metadata:
   - `A.salience = max(A.salience, B.salience)`
   - `A.usageCount += B.usageCount`
4. Update inverted index:
   - remove `B` from all `belongsTo` sets
   - ensure `A` is present for all its members
5. Delete `B` from the store

### 6.2 DeductionGraph Merge

We must not leave edges pointing to a deleted group. `mergeNodes(targetId, sourceId)` performs:

1. Move outgoing edges from `sourceId` to `targetId`
2. Move incoming edges that pointed to `sourceId` to point to `targetId`
3. Remove all edges for `sourceId`

This preserves reachability while consolidating the node identity.

---

## 7. Performance Model and Budgeting

### 7.1 Expected Cost

Let:
- `G` be the number of groups
- `C(G)` be the number of candidates retrieved for primary group `G`

Then consolidation is approximately:

```
O( Σ_primary ( C(primary) * cost(jaccard(primary, candidate)) ) )
```

Candidate cost can explode if:
- the inverted index has no cap for very common identities
- groups contain many high-frequency identities

### 7.2 Practical Constraints

To keep consolidation predictable at scale:

1. **Cap inverted index fan-out** (see `maxGroupsPerIdentity`).
2. **Limit merges per run** (budgeted maintenance; not yet implemented).
3. **Skip low-value merges**:
   - do not merge if both groups are high-salience and only weakly overlap in rare identities
   - require minimum overlap size in addition to Jaccard

---

## 8. Risks and Failure Modes

1. **Over-generalization**
   - “Dog” and “Wolf” may merge if their member sets are too similar.
   - Mitigation: use stricter merge thresholds for high-salience groups; add rare-token constraints.

2. **ID instability**
   - After merging, the source group ID is deleted. Any external references to it become stale.
   - Mitigation (planned): keep a short-lived `aliasMap` (sourceId → targetId) used by:
     - session context
     - debug/explain APIs
     - serialization migration

3. **Maintenance spikes**
   - Large group stores may cause periodic consolidation to create latency spikes.
   - Mitigation: strict budgets and background scheduling.

---

## 9. Configuration

### 9.1 Current knobs

- `learner.mergeThreshold` (default ~`0.8`): merge if `J ≥ threshold`
- `index.maxGroupsPerIdentity`: cap candidate fan-out for frequent identities
- `index.indexEvictPolicy`: eviction when the cap is exceeded (`random|lowestUsage|lowestSalience`)
- `deduction.maxEdgesPerNode`: prevents the graph from exploding during merges/redirects

### 9.2 Proposed knobs (recommended for planning)

- `maintenance.sleepInterval` (steps): how often to run sleep consolidation
- `maintenance.maxMergesPerSleep` (count): hard budget per run
- `maintenance.maxCandidatesPerGroup` (count): cap candidate comparisons per primary

---

## 10. Implementation Status

Implemented in this repo:
- `Learner.performSleepConsolidation(store, graph)`
- `DeductionGraph.mergeNodes(targetId, sourceId)`
- `GroupStore.merge(g1, g2)`
- `BSPEngine.runSleepPhase()`

Planned improvements:
1. Add budgets (`maxMergesPerRun`, `maxCandidatesPerPrimary`).
2. Add an `aliasMap` for merged IDs to preserve session continuity.
3. Add tests that assert index/graph invariants after merges.

---

## 11. Transform Discovery (DS-023 Integration)

Sleep consolidation now has a second major function: discovering transform groups.

### 11.1 Extended Sleep Phase

```typescript
function sleepConsolidation(
  store: GroupStore,
  graph: DeductionGraph,
  candidateTransforms: CandidateTransforms,
  attentionBuffer: AttentionBuffer,
  budget: SleepBudget
): SleepResult {
  // Phase 1: Content group merge (existing)
  const merges = mergeContentGroups(store, graph, budget);
  
  // Phase 2: Transform discovery (new)
  const newTransforms = discoverTransforms(candidateTransforms, store, budget);
  
  // Phase 3: Process attention buffer problems
  const resolved = processAttentionProblems(attentionBuffer, store, budget);
  
  // Phase 4: Prune unused transforms
  const pruned = pruneUnusedTransforms(store);
  
  // Phase 5: Re-rank all transforms by utility
  rerankTransforms(store);
  
  return { merges, newTransforms, resolved, pruned };
}
```

### 11.2 Transform Discovery Algorithm

```typescript
function discoverTransforms(
  candidates: CandidateTransforms,
  store: GroupStore,
  budget: SleepBudget
): number {
  let discovered = 0;
  
  // Sort candidates by observation count (most observed first)
  const sorted = [...candidates.candidates.values()]
    .filter(c => c.observations.length >= MIN_OBSERVATIONS)
    .sort((a, b) => b.observations.length - a.observations.length);
  
  for (const candidate of sorted) {
    if (budget.exhausted()) break;
    
    // Compute consensus delta (intersection of all observation deltas)
    const consensus = computeConsensus(candidate.observations);
    
    if (consensus.size < MIN_TRANSFORM_SIZE) continue;
    
    // Check if similar transform already exists
    const existing = findSimilarTransform(consensus, store, MERGE_THRESHOLD);
    
    if (existing) {
      // Strengthen existing transform
      existing.usageCount += candidate.observations.length;
      existing.compressionSavings += estimateSavings(consensus);
    } else {
      // Create new TRANSFORM group
      const transform = store.create(consensus, 0.5);
      transform.type = 'TRANSFORM';
      transform.deltaPattern = consensus.clone();
      transform.primitives = [{ type: 'XOR', operand: consensus }];
      transform.compressionSavings = estimateSavings(consensus);
      discovered++;
    }
    
    // Remove processed candidate
    candidates.candidates.delete(candidate.delta.hash64());
  }
  
  return discovered;
}

function computeConsensus(observations: TransformObservation[]): Bitset {
  if (observations.length === 0) return new SimpleBitset(0);
  
  // Start with the first delta
  const first = observations[0].source.xor(observations[0].target);
  let consensus = first.clone();
  
  // Intersect with all subsequent deltas
  for (let i = 1; i < observations.length; i++) {
    const delta = observations[i].source.xor(observations[i].target);
    consensus = consensus.and(delta);
  }
  
  return consensus;
}

function estimateSavings(transform: Bitset): number {
  // Savings = bits that don't need to be stored literally
  // Cost = log2(rank) once transform is ranked
  // Net = transform.size - log2(estimated_rank)
  return transform.size * 0.8;  // Conservative estimate
}
```

### 11.3 Transform Ranking

```typescript
function rerankTransforms(store: GroupStore): void {
  // Get all TRANSFORM type groups
  const transforms = [...store.getAll()]
    .filter(g => g.type === 'TRANSFORM');
  
  // Sort by compression utility
  transforms.sort((a, b) => {
    const utilityA = (a.compressionSavings || 0) * (a.usageCount || 1);
    const utilityB = (b.compressionSavings || 0) * (b.usageCount || 1);
    return utilityB - utilityA;
  });
  
  // Assign ranks (0 = most useful)
  for (let i = 0; i < transforms.length; i++) {
    transforms[i].rank = i;
  }
}

function getTransformCost(transform: Group): number {
  if (transform.rank !== undefined) {
    // Frequent transforms are cheap
    return Math.log2(transform.rank + 2);  // +2 to avoid log(1)=0
  }
  // Unknown transform: pay full primitive cost
  return (transform.deltaPattern?.size || 0) * LITERAL_BIT_COST;
}
```

---

## 12. Attention-Driven Processing (DS-024 Integration)

### 12.1 Processing Attention Problems

During sleep, we focus on the highest-priority unresolved problems.

```typescript
function processAttentionProblems(
  buffer: AttentionBuffer,
  store: GroupStore,
  budget: SleepBudget
): number {
  let resolved = 0;
  
  // Get top problems sorted by priority
  const problems = buffer.getTopProblems(budget.maxProblems);
  
  for (const problem of problems) {
    if (budget.exhausted()) break;
    
    // Try to find a pattern that explains this problem
    const solution = searchForPattern(problem, store);
    
    if (solution.found) {
      // Solution found! Create or strengthen group/transform
      if (solution.isTransform) {
        createOrStrengthenTransform(solution, store);
      } else {
        createOrStrengthenGroup(solution, store);
      }
      
      buffer.markResolved(problem);
      resolved++;
    }
  }
  
  return resolved;
}

function searchForPattern(
  problem: AttentionItem,
  store: GroupStore
): SearchResult {
  // Strategy 1: Find existing groups that partially cover
  const partialMatches = findPartialMatches(problem.input, store);
  
  // Strategy 2: Look for similar problems in recent history
  // (implemented via candidate transforms during learning)
  
  // Strategy 3: Try small variations of existing groups
  for (const match of partialMatches) {
    const residual = problem.input.andNot(match.members);
    if (residual.size < problem.surprise * 0.5) {
      // This group + small extension could explain the input
      return {
        found: true,
        isTransform: false,
        groupToExtend: match,
        extension: residual,
      };
    }
  }
  
  return { found: false };
}
```

### 12.2 Sleep Budget Levels (DS-024)

```typescript
interface SleepBudget {
  maxTimeMs: number;
  maxMerges: number;
  maxDiscoveries: number;
  maxProblems: number;
  
  startTime: number;
  mergesDone: number;
  discoveriesDone: number;
  problemsDone: number;
  
  exhausted(): boolean {
    return Date.now() - this.startTime >= this.maxTimeMs ||
           this.mergesDone >= this.maxMerges ||
           this.discoveriesDone >= this.maxDiscoveries ||
           this.problemsDone >= this.maxProblems;
  }
}

const LIGHT_SLEEP_BUDGET: SleepBudget = {
  maxTimeMs: 1000,
  maxMerges: 10,
  maxDiscoveries: 5,
  maxProblems: 20,
  // ...
};

const DEEP_SLEEP_BUDGET: SleepBudget = {
  maxTimeMs: 60000,
  maxMerges: 100,
  maxDiscoveries: 50,
  maxProblems: 200,
  // ...
};
```

---

## 13. Configuration (Updated)

### 13.1 Current knobs

- `learner.mergeThreshold` (default ~`0.8`): merge if `J ≥ threshold`
- `index.maxGroupsPerIdentity`: cap candidate fan-out for frequent identities
- `index.indexEvictPolicy`: eviction when the cap is exceeded (`random|lowestUsage|lowestSalience`)
- `deduction.maxEdgesPerNode`: prevents the graph from exploding during merges/redirects

### 13.2 New knobs (DS-023/DS-024)

- `maintenance.sleepInterval` (steps): how often to run sleep consolidation
- `maintenance.maxMergesPerSleep` (count): hard budget per run
- `maintenance.maxCandidatesPerGroup` (count): cap candidate comparisons per primary
- `transform.minObservations` (default: 3): minimum observations before discovering
- `transform.minSize` (default: 2): minimum bits in a transform delta
- `transform.maxTransforms` (default: 1000): maximum transform groups
- `attention.maxItems` (default: 10000): attention buffer capacity
- `attention.surpriseWeight` (default: 1.0): weight for surprise in priority
- `attention.recurrenceWeight` (default: 2.0): weight for recurrence in priority
