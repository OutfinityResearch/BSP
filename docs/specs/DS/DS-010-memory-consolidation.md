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

Introduce a distinct system state called **Consolidation** (or "Sleep"), triggered when the system is idle or explicitly requested.

### 2.1 Algorithm: Hierarchical Clustering

We treat the GroupStore as a set of points in a metric space (Metric = Jaccard Distance).

```typescript
function sleepPhase(store: GroupStore) {
    const groups = store.getAll();
    const visited = new Set<number>();
    
    // Sort by size (merge smaller into larger)
    groups.sort((a, b) => b.members.size - a.members.size);
    
    for (const primary of groups) {
        if (visited.has(primary.id)) continue;
        
        // Find merge candidates
        const candidates = store.queryIndex(primary.members);
        
        for (const candidateId of candidates) {
            if (candidateId === primary.id) continue;
            if (visited.has(candidateId)) continue;
            
            const candidate = store.get(candidateId);
            const similarity = computeJaccard(primary, candidate);
            
            if (similarity > MERGE_THRESHOLD) {
                mergeGroups(primary, candidate);
                visited.add(candidate.id);
            }
        }
    }
}
```

### 2.2 The Merge Operation

When merging Group B into Group A:
1. **Union Members:** `A.members = A.members OR B.members`
2. **Sum Counts:** `A.counts += B.counts`
3. **Merge Links:** Transfer all deduction links from B to A.
4. **Delete B:** Remove Group B from store.
5. **Redirect:** Update the Index so B points to A (optional "Forwarding Address").

## 3. Benefits

1. **Abstraction:** Merging specific instances creates general concepts.
2. **Efficiency:** Reduces total group count (`|G|`).
3. **Robustness:** A larger, merged group has better statistical support.

## 4. Risks

- **Over-generalization:** Merging "Dog" and "Wolf" might lose the distinction.
- **Cost:** Clustering is expensive ($O(N^2)$ worst case). Must be approximate/optimized.
