# DS-003: Learning Algorithms

**Version**: 1.0  
**Status**: Draft  
**Author**: BPCM Team  
**Date**: 2026-01-15

---

## 1. Overview

Acest document descrie algoritmii de învățare online și incrementală ai BPCM, concentrați pe minimizarea surprizei și adaptare continuă.

---

## 2. Obiectivul de Învățare

### 2.1 Loss Function (MDL-style)

```
L(x, A) = |surprise(x, A)| + β * |hallucination(x, A)| + γ * |A|
```

Unde:
- `x` = input bitset
- `A` = grupuri active selectate
- `surprise = x \ reconstruct(A)` = biți neexplicați
- `hallucination = reconstruct(A) \ x` = biți excesivi
- `|A|` = cost de cod (câte grupuri folosim)

### 2.2 Obiectiv

Minimizăm surpriza viitoare prin:
1. Ajustarea membership-urilor grupurilor
2. Crearea de grupuri noi pentru patterns recurente
3. Merge/split pentru eficiență
4. Întărirea deducțiilor corecte

---

## 3. Activare Grupuri

### 3.1 Algoritmul de Selecție

```typescript
function activate(x: RoaringBitmap, store: GroupStore, index: BitmapIndex): Group[] {
  // 1. Găsește candidați
  const candidates = index.getCandidates(x);
  
  // 2. Scorează fiecare candidat
  const scores: {group: Group, score: number}[] = [];
  
  for (const groupId of candidates) {
    const group = store.get(groupId);
    if (!group) continue;
    
    const score = computeScore(group, x);
    if (score >= ACTIVATION_THRESHOLD) {
      scores.push({group, score});
    }
  }
  
  // 3. Sortează și selectează top-K
  scores.sort((a, b) => b.score - a.score);
  const topK = scores.slice(0, MAX_ACTIVE_GROUPS);
  
  // 4. Greedy selection pentru a minimiza redundanța
  return greedySelect(topK, x);
}

function computeScore(group: Group, x: RoaringBitmap): number {
  const intersection = group.members.andCardinality(x);
  const groupSize = group.members.size;
  
  if (groupSize === 0) return 0;
  
  // Coverage: cât din grup e prezent în input
  const coverage = intersection / groupSize;
  
  // Penalizare pentru grupuri prea mari
  const sizePenalty = LAMBDA * Math.log(groupSize + 1);
  
  // Boost pentru salience
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
    // Cât de mult adaugă acest grup?
    const newBits = group.members.andNot(explained);
    const marginalValue = newBits.andCardinality(x);
    
    if (marginalValue >= MIN_MARGINAL_VALUE) {
      selected.push(group);
      explained.orInPlace(group.members);
      
      // Stop dacă am explicat suficient
      const remainingSurprise = x.andNot(explained).size;
      if (remainingSurprise < MIN_SURPRISE_THRESHOLD) break;
    }
  }
  
  return selected;
}
```

---

## 4. Update Memberships

### 4.1 Regula de Update

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
    // 4.1.1 Întărește identitățile din input
    for (const identity of x) {
      if (group.members.has(identity) || shouldExpand(group, identity, x)) {
        const currentCount = group.memberCounts.get(identity) || 0;
        const delta = ALPHA * importance;
        group.memberCounts.set(identity, currentCount + delta);
        
        // Adaugă în members dacă depășește prag
        if (currentCount + delta >= MEMBERSHIP_THRESHOLD) {
          group.members.add(identity);
        }
      }
    }
    
    // 4.1.2 Slăbește identitățile din halucinare
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
  // Expandează grupul dacă identitatea apare consistent cu membrii existenți
  const coOccurrence = group.members.andCardinality(x) / group.members.size;
  return coOccurrence >= CO_OCCURRENCE_THRESHOLD;
}
```

---

## 5. Creare Grupuri Noi

### 5.1 Trigger

Creăm un grup nou când:
1. Surpriza e mare și niciun grup nu explică suficient
2. Pattern-ul e recurent (apare de mai multe ori)

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
    return null; // Surpriza e acceptabilă
  }
  
  // Verifică dacă pattern-ul e recurent
  const patternHash = hashPattern(surprise);
  const occurrences = recentPatterns.record(patternHash, surprise);
  
  if (occurrences < MIN_OCCURRENCES_FOR_GROUP) {
    return null; // Pattern prea rar
  }
  
  // Creează grup din partea cea mai stabilă a surprizei
  const stableCore = recentPatterns.getStableCore(patternHash);
  
  const newGroup = store.create(stableCore);
  newGroup.salience = 0.5; // Start moderat
  
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
      // Intersectează pentru a păstra doar părțile consistente
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

## 6. Merge și Split

### 6.1 Merge Grupuri Similare

```typescript
function maybeMerge(store: GroupStore): void {
  const groups = store.getAll();
  
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const g1 = groups[i];
      const g2 = groups[j];
      
      const jaccard = computeJaccard(g1.members, g2.members);
      
      if (jaccard >= MERGE_THRESHOLD) {
        // Verifică și co-activare
        const coActivation = computeCoActivation(g1, g2);
        
        if (coActivation >= CO_ACTIVATION_THRESHOLD) {
          mergeGroups(g1, g2, store);
        }
      }
    }
  }
}

function mergeGroups(g1: Group, g2: Group, store: GroupStore): void {
  // Păstrăm grupul cu mai mult usage
  const [keep, discard] = g1.usageCount >= g2.usageCount ? [g1, g2] : [g2, g1];
  
  // Uniune membership
  keep.members.orInPlace(discard.members);
  
  // Combinăm contori
  for (const [id, count] of discard.memberCounts) {
    const existing = keep.memberCounts.get(id) || 0;
    keep.memberCounts.set(id, existing + count);
  }
  
  // Combinăm deducții
  keep.deduce.orInPlace(discard.deduce);
  for (const [id, count] of discard.deduceCounts) {
    const existing = keep.deduceCounts.get(id) || 0;
    keep.deduceCounts.set(id, existing + count);
  }
  
  // Actualizăm salience
  keep.salience = Math.max(keep.salience, discard.salience);
  
  // Ștergem grupul absorbit
  store.delete(discard.id);
}
```

### 6.2 Split Grupuri Prea Generale

```typescript
function maybeSplit(store: GroupStore, stats: ActivationStats): void {
  for (const group of store.getAll()) {
    // Grup prea general = se activează prea des
    const activationRate = stats.getActivationRate(group.id);
    
    if (activationRate >= OVERGENERAL_THRESHOLD) {
      splitGroup(group, store);
    }
  }
}

function splitGroup(group: Group, store: GroupStore): void {
  // Identificăm core vs peripheral based on counts
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
    return; // Nu merită split
  }
  
  // Păstrăm core în grupul original
  group.members = coreIdentities;
  
  // Curățăm contori pentru peripheral
  for (const id of peripheralIdentities) {
    group.memberCounts.delete(id);
  }
  
  // Creăm grup nou pentru peripheral
  const newGroup = store.create(peripheralIdentities);
  newGroup.salience = group.salience * 0.7;
  
  // Copiem deducții relevante
  newGroup.deduce = group.deduce.clone();
  newGroup.deduceCounts = new Map(group.deduceCounts);
}
```

---

## 7. Decay și Pruning

### 7.1 Decay Global

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
    
    // Decay salience pentru grupuri nefolosite
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
      // Grup prea mic
      group.members.size < MIN_GROUP_SIZE ||
      // Salience prea mică și vechi
      (group.salience < MIN_SALIENCE && group.age > MIN_AGE_FOR_PRUNE) ||
      // Nefolosit mult timp
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

## 8. Consolidare din Replay Buffer

### 8.1 Offline Learning

```typescript
async function consolidate(
  buffer: ReplayBuffer,
  store: GroupStore,
  graph: DeductionGraph,
  batchSize: number
): Promise<void> {
  // Sample episoade prioritizate
  const episodes = buffer.sample(batchSize);
  
  for (const episode of episodes) {
    // Re-activate cu starea curentă
    const currentGroups = activate(episode.input, store);
    const reconstruction = reconstruct(currentGroups);
    const {surprise, hallucination} = computeSurprise(episode.input, reconstruction);
    
    // Calculăm importanța actualizată
    const importance = computeImportance({
      novelty: surprise.size / episode.input.size,
      utility: episode.reward,
      stability: episode.importance,
    });
    
    // Update
    updateMemberships(currentGroups, episode.input, reconstruction, importance);
    
    // Update deducții dacă avem context
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

## 9. Parametri

| Parametru | Valoare | Descriere |
|-----------|---------|-----------|
| `ALPHA` | 0.1 | Learning rate pentru membership |
| `ALPHA_DECAY` | 0.05 | Decay rate pentru halucinări |
| `ACTIVATION_THRESHOLD` | 0.2 | Scor minim pentru activare |
| `MAX_ACTIVE_GROUPS` | 16 | Top-K grupuri activate |
| `MEMBERSHIP_THRESHOLD` | 3.0 | Count minim pentru membru |
| `NEW_GROUP_THRESHOLD` | 0.5 | Surpriză minimă pentru grup nou |
| `MIN_OCCURRENCES_FOR_GROUP` | 3 | Recurențe pentru grup nou |
| `MERGE_THRESHOLD` | 0.8 | Jaccard minim pentru merge |
| `DECAY_INTERVAL` | 1000 | Updates între decay-uri |
| `DECAY_AMOUNT` | 0.1 | Decrement per decay |

---

## 10. Pseudocod Complet: Training Step

```typescript
function trainStep(
  input: string,
  context: Group[],
  reward: number | null,
  engine: BPCMEngine
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
