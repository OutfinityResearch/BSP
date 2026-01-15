# DS-010: Memory Consolidation (Sleep Phase)

**Version**: 1.0  
**Status**: Proposal  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Problem

As BSP runs continuously, the `GroupStore` accumulates:
1. **Redundant Groups:** "The cat", "A cat", "That cat" might create overlapping but distinct groups.
2. **Noise:** Groups created from one-off typos or rare events.
3. **Fragmentation:** Related concepts are split across too many small groups.

This degrades performance (slower search) and prediction quality (splitting probability mass).

## 2. Proposed Solution: The "Sleep" Phase

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
