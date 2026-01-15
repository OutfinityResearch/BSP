# DS-003: Learning Algorithms

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

This document describes BSP's online, incremental learning algorithms, focused on minimizing surprise and enabling continuous adaptation.

---

## 2. Learning Objective

### 2.1 Loss Function (MDL-style)

```
L(x, A) = |surprise(x, A)| + β * |hallucination(x, A)| + γ * |A|
```

Where:
- `x` = input bitset
- `A` = selected active groups
- `surprise = x \ reconstruct(A)` = unexplained bits
- `hallucination = reconstruct(A) \ x` = extra bits (present in reconstruction but not in input)
- `|A|` = code cost (how many groups we use)

### 2.2 Goal

We minimize future surprise by:
1. Adjusting group memberships
2. Creating new groups for recurring patterns
3. Merge/split operations for efficiency
4. Strengthening correct deductions

---

## 3. Group Activation

### 3.1 Selection Algorithm

```typescript
function activate(x: RoaringBitmap, store: GroupStore, index: BitmapIndex): Group[] {
  // 1. Find candidates
  const candidates = index.getCandidates(x);
  
  // 2. Score each candidate
  const scores: {group: Group, score: number}[] = [];
  
  for (const groupId of candidates) {
    const group = store.get(groupId);
    if (!group) continue;
    
    const score = computeScore(group, x);
    if (score >= ACTIVATION_THRESHOLD) {
      scores.push({group, score});
    }
  }
  
  // 3. Sort and select top-K
  scores.sort((a, b) => b.score - a.score);
  const topK = scores.slice(0, MAX_ACTIVE_GROUPS);
  
  // 4. Greedy selection to minimize redundancy
  return greedySelect(topK, x);
}

function computeScore(group: Group, x: RoaringBitmap): number {
  const intersection = group.members.andCardinality(x);
  const groupSize = group.members.size;
  
  if (groupSize === 0) return 0;
  
  // Coverage: how much of the group appears in the input
  const coverage = intersection / groupSize;
  
  // Penalty for overly large groups
  const sizePenalty = LAMBDA * Math.log(groupSize + 1);
  
  // Salience boost
  const salienceBoost = SALIENCE_WEIGHT * group.salience;
  
  return coverage - sizePenalty + salienceBoost;
}

function greedySelect(
  candidates: {group: Group, score: number}[], 
  x: RoaringBitmap
): Group[] {
  const selected: Group[] = [];
  const explained = new RoaringBitmap();
  
  for (const {group, score} of candidates) {
    // How much does this group add?
    const newBits = group.members.andNot(explained);
    const marginalValue = newBits.andCardinality(x);
    
    if (marginalValue >= MIN_MARGINAL_VALUE) {
      selected.push(group);
      explained.orInPlace(group.members);
      
      // Stop if we have explained enough
      const remainingSurprise = x.andNot(explained).size;
      if (remainingSurprise < MIN_SURPRISE_THRESHOLD) break;
    }
  }
  
  return selected;
}
```

---

## 4. Update Memberships

### 4.1 Update Rule

```typescript
function updateMemberships(
  activeGroups: Group[],
  x: RoaringBitmap,
  reconstruction: RoaringBitmap,
  importance: number
): void {
  const surprise = x.andNot(reconstruction);
  const hallucination = reconstruction.andNot(x);
  
  for (const group of activeGroups) {
    // 4.1.1 Strengthen identities from the input
    for (const identity of x) {
      if (group.members.has(identity) || shouldExpand(group, identity, x)) {
        const currentCount = group.memberCounts.get(identity) || 0;
        const delta = ALPHA * importance;
        group.memberCounts.set(identity, currentCount + delta);
        
        // Add to members if it crosses the threshold
        if (currentCount + delta >= MEMBERSHIP_THRESHOLD) {
          group.members.add(identity);
        }
      }
    }
    
    // 4.1.2 Weaken identities from hallucination
    for (const identity of hallucination) {
      if (group.members.has(identity)) {
        const currentCount = group.memberCounts.get(identity) || 0;
        const delta = ALPHA_DECAY * importance;
        const newCount = Math.max(0, currentCount - delta);
        
        if (newCount < MEMBERSHIP_THRESHOLD) {
          group.members.remove(identity);
        }
        
        if (newCount > 0) {
          group.memberCounts.set(identity, newCount);
        } else {
          group.memberCounts.delete(identity);
        }
      }
    }
    
    // 4.1.3 Update metadata
    group.lastUsed = Date.now();
    group.usageCount++;
  }
}

function shouldExpand(group: Group, identity: number, x: RoaringBitmap): boolean {
  // Expand the group if the identity co-occurs consistently with existing members
  const coOccurrence = group.members.andCardinality(x) / group.members.size;
  return coOccurrence >= CO_OCCURRENCE_THRESHOLD;
}
```

---

## 5. Creating New Groups

### 5.1 Trigger Conditions

We create a new group when:
1. Surprise is high and no existing group explains enough
2. The pattern is recurrent (it appears multiple times)

```typescript
function maybeCreateGroup(
  x: RoaringBitmap,
  surprise: RoaringBitmap,
  activeGroups: Group[],
  store: GroupStore,
  recentPatterns: PatternTracker
): Group | null {
  const surpriseRatio = surprise.size / x.size;
  
  if (surpriseRatio < NEW_GROUP_THRESHOLD) {
    return null; // Surprise is acceptable
  }
  
  // Check whether the pattern is recurrent
  const patternHash = hashPattern(surprise);
  const occurrences = recentPatterns.record(patternHash, surprise);
  
  if (occurrences < MIN_OCCURRENCES_FOR_GROUP) {
    return null; // Pattern is too rare
  }
  
  // Create the group from the most stable part of the surprise
  const stableCore = recentPatterns.getStableCore(patternHash);
  
  const newGroup = store.create(stableCore);
  newGroup.salience = 0.5; // Moderate starting value
  
  return newGroup;
}

class PatternTracker {
  private patterns: Map<number, {
    bitmap: RoaringBitmap,
    count: number,
    lastSeen: number
  }>;
  
  record(hash: number, pattern: RoaringBitmap): number {
    const existing = this.patterns.get(hash);
    
    if (existing) {
      // Intersect to keep only the consistent parts
      existing.bitmap = existing.bitmap.and(pattern);
      existing.count++;
      existing.lastSeen = Date.now();
      return existing.count;
    } else {
      this.patterns.set(hash, {
        bitmap: pattern.clone(),
        count: 1,
        lastSeen: Date.now()
      });
      return 1;
    }
  }
  
  getStableCore(hash: number): RoaringBitmap {
    return this.patterns.get(hash)?.bitmap || new RoaringBitmap();
  }
}
```

---

## 6. Merge and Split

### 6.1 Merge Similar Groups

```typescript
function maybeMerge(store: GroupStore): void {
  const groups = store.getAll();
  
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const g1 = groups[i];
      const g2 = groups[j];
      
      const jaccard = computeJaccard(g1.members, g2.members);
      
      if (jaccard >= MERGE_THRESHOLD) {
        // Also check co-activation
        const coActivation = computeCoActivation(g1, g2);
        
        if (coActivation >= CO_ACTIVATION_THRESHOLD) {
          mergeGroups(g1, g2, store);
        }
      }
    }
  }
}

function mergeGroups(g1: Group, g2: Group, store: GroupStore): void {
  // Keep the group with higher usage
  const [keep, discard] = g1.usageCount >= g2.usageCount ? [g1, g2] : [g2, g1];
  
  // Union memberships
  keep.members.orInPlace(discard.members);
  
  // Combine counters
  for (const [id, count] of discard.memberCounts) {
    const existing = keep.memberCounts.get(id) || 0;
    keep.memberCounts.set(id, existing + count);
  }
  
  // Combine deductions
  keep.deduce.orInPlace(discard.deduce);
  for (const [id, count] of discard.deduceCounts) {
    const existing = keep.deduceCounts.get(id) || 0;
    keep.deduceCounts.set(id, existing + count);
  }
  
  // Update salience
  keep.salience = Math.max(keep.salience, discard.salience);
  
  // Delete the absorbed group
  store.delete(discard.id);
}
```

### 6.2 Split Overly General Groups

```typescript
function maybeSplit(store: GroupStore, stats: ActivationStats): void {
  for (const group of store.getAll()) {
    // Overly general group = activates too often
    const activationRate = stats.getActivationRate(group.id);
    
    if (activationRate >= OVERGENERAL_THRESHOLD) {
      splitGroup(group, store);
    }
  }
}

function splitGroup(group: Group, store: GroupStore): void {
  // Identify core vs peripheral based on counts
  const coreIdentities = new RoaringBitmap();
  const peripheralIdentities = new RoaringBitmap();
  
  const counts = Array.from(group.memberCounts.entries());
  const medianCount = computeMedian(counts.map(([_, c]) => c));
  
  for (const [id, count] of counts) {
    if (count >= medianCount) {
      coreIdentities.add(id);
    } else {
      peripheralIdentities.add(id);
    }
  }
  
  if (peripheralIdentities.size < MIN_GROUP_SIZE) {
    return; // Split is not worth it
  }
  
  // Keep the core in the original group
  group.members = coreIdentities;
  
  // Clear counters for peripheral
  for (const id of peripheralIdentities) {
    group.memberCounts.delete(id);
  }
  
  // Create a new group for the peripheral
  const newGroup = store.create(peripheralIdentities);
  newGroup.salience = group.salience * 0.7;
  
  // Copy relevant deductions
  newGroup.deduce = group.deduce.clone();
  newGroup.deduceCounts = new Map(group.deduceCounts);
}
```

---

## 7. Decay and Pruning

### 7.1 Global Decay

```typescript
function applyDecay(store: GroupStore, step: number): void {
  if (step % DECAY_INTERVAL !== 0) return;
  
  for (const group of store.getAll()) {
    // Decay membership counts
    for (const [id, count] of group.memberCounts) {
      const newCount = count - DECAY_AMOUNT;
      
      if (newCount <= 0) {
        group.memberCounts.delete(id);
        group.members.remove(id);
      } else {
        group.memberCounts.set(id, newCount);
      }
    }
    
    // Decay deduction counts
    for (const [id, count] of group.deduceCounts) {
      const newCount = count - DECAY_AMOUNT;
      
      if (newCount <= DEDUCTION_THRESHOLD) {
        group.deduceCounts.delete(id);
        group.deduce.remove(id);
      } else {
        group.deduceCounts.set(id, newCount);
      }
    }
    
    // Decay salience for unused groups
    if (Date.now() - group.lastUsed > UNUSED_PERIOD) {
      group.salience *= SALIENCE_DECAY;
    }
    
    group.age++;
  }
}
```

### 7.2 Pruning

```typescript
function pruneGroups(store: GroupStore): number {
  let pruned = 0;
  
  for (const group of store.getAll()) {
    const shouldPrune = 
      // Group is too small
      group.members.size < MIN_GROUP_SIZE ||
      // Salience too low and too old
      (group.salience < MIN_SALIENCE && group.age > MIN_AGE_FOR_PRUNE) ||
      // Unused for a long time
      (Date.now() - group.lastUsed > MAX_UNUSED_TIME);
    
    if (shouldPrune) {
      store.delete(group.id);
      pruned++;
    }
  }
  
  return pruned;
}
```

---

## 8. Consolidation from Replay Buffer

### 8.1 Offline Learning

```typescript
async function consolidate(
  buffer: ReplayBuffer,
  store: GroupStore,
  graph: DeductionGraph,
  batchSize: number
): Promise<void> {
  // Sample prioritized episodes
  const episodes = buffer.sample(batchSize);
  
  for (const episode of episodes) {
    // Re-activate with the current state
    const currentGroups = activate(episode.input, store);
    const reconstruction = reconstruct(currentGroups);
    const {surprise, hallucination} = computeSurprise(episode.input, reconstruction);
    
    // Compute updated importance
    const importance = computeImportance({
      novelty: surprise.size / episode.input.size,
      utility: episode.reward,
      stability: episode.importance,
    });
    
    // Update
    updateMemberships(currentGroups, episode.input, reconstruction, importance);
    
    // Update deductions if we have context
    if (episode.context && episode.context.length > 0) {
      updateDeductions(
        episode.context,
        currentGroups.map(g => g.id),
        graph,
        importance
      );
    }
  }
}
```

---

## 9. Parameters

| Parameter | Value | Description |
|-----------|---------|-----------|
| `ALPHA` | 0.1 | Learning rate for membership |
| `ALPHA_DECAY` | 0.05 | Decay rate for hallucinations |
| `ACTIVATION_THRESHOLD` | 0.2 | Minimum score for activation |
| `MAX_ACTIVE_GROUPS` | 16 | Top-K activated groups |
| `MEMBERSHIP_THRESHOLD` | 3.0 | Minimum count for membership |
| `NEW_GROUP_THRESHOLD` | 0.5 | Minimum surprise for a new group |
| `MIN_OCCURRENCES_FOR_GROUP` | 3 | Recurrences required for a new group |
| `MERGE_THRESHOLD` | 0.8 | Minimum Jaccard for merge |
| `DECAY_INTERVAL` | 1000 | Updates between decays |
| `DECAY_AMOUNT` | 0.1 | Decrement per decay |

---

## 10. Complete Pseudocode: Training Step

```typescript
function trainStep(
  input: string,
  context: Group[],
  reward: number | null,
  engine: BSPEngine
): TrainResult {
  // 1. Encode
  const x = engine.encode(input);
  
  // 2. Activate
  const activeGroups = engine.activate(x);
  
  // 3. Reconstruct
  const reconstruction = engine.reconstruct(activeGroups);
  const {surprise, hallucination} = engine.computeSurprise(x, reconstruction);
  
  // 4. Compute importance
  const importance = engine.computeImportance({
    novelty: surprise.size / x.size,
    utility: reward ?? 0,
    stability: 1.0,
  });
  
  // 5. Learn memberships
  engine.updateMemberships(activeGroups, x, reconstruction, importance);
  
  // 6. Learn deductions
  if (context.length > 0) {
    engine.updateDeductions(
      context.map(g => g.id),
      activeGroups.map(g => g.id),
      importance
    );
  }
  
  // 7. Maybe create new group
  const newGroup = engine.maybeCreateGroup(x, surprise, activeGroups);
  
  // 8. Store in replay buffer
  engine.buffer.add({
    timestamp: Date.now(),
    input: x,
    activeGroups: activeGroups.map(g => g.id),
    surprise: surprise.size,
    reward: reward ?? 0,
    importance,
    context: context.map(g => g.id),
  });
  
  // 9. Apply decay
  engine.applyDecay();
  
  return {
    activeGroups,
    surprise: surprise.size,
    hallucination: hallucination.size,
    newGroup: newGroup?.id,
  };
}
```
