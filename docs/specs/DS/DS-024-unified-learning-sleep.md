# DS-024: Unified Learning Through Compression-Driven Sleep

**Version**: 1.0  
**Status**: Design  
**Author**: BSP Team  
**Date**: 2026-01-16

---

## 1. Core Insight

### 1.1 Unification of Learning and Sleep

**There is no separate "learning" vs "sleep" - only compression with varying compute budgets.**

| Mode | Budget | What Happens |
|------|--------|--------------|
| **Awake** | Low | Try to compress with existing knowledge |
| **Light Sleep** | Medium | Replay recent failures, find local patterns |
| **Deep Sleep** | High | Search for new transforms, reorganize |

### 1.2 The Three Components

```
┌─────────────────────────────────────────────────────────────┐
│                    LEARNING = COMPRESSION                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. DURATION (How long/deep to process)                     │
│     └─ Compute budget: micro-seconds to hours               │
│                                                              │
│  2. ATTENTION (What to focus on)                            │
│     └─ Priority queue of unresolved problems                │
│                                                              │
│  3. PERSISTENCE (What carries across sessions)              │
│     └─ Recurring problems that need deeper work             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Duration: Compute Budget

### 2.1 The Spectrum

Learning depth is not discrete - it's a continuous spectrum:

```
         AWAKE              LIGHT SLEEP           DEEP SLEEP
    ──────────────────────────────────────────────────────────►
    │                   │                    │                │
    Instant             Seconds              Minutes          Hours
    compression         local patterns       new transforms   reorganize
```

### 2.2 What Happens at Each Level

| Level | Budget | Operations | Outcome |
|-------|--------|------------|---------|
| **Instant** | <10ms | Lookup existing groups/transforms | Recognize known patterns |
| **Quick** | 10-100ms | Try multiple encodings | Best compression from library |
| **Local Search** | 100ms-1s | Compare with recent failures | Cluster similar problems |
| **Pattern Discovery** | 1s-10s | Compute deltas, find consensus | New transforms |
| **Deep Reorganization** | 10s+ | Re-rank, prune, merge | Optimized library |

### 2.3 Implementation

```javascript
class CompressionBudget {
  maxTimeMs: number;      // Hard time limit
  maxOperations: number;  // Limit on expensive ops
  depth: 'instant' | 'quick' | 'local' | 'discovery' | 'deep';
  
  static AWAKE = { maxTimeMs: 10, depth: 'instant' };
  static LIGHT_SLEEP = { maxTimeMs: 1000, depth: 'local' };
  static DEEP_SLEEP = { maxTimeMs: 60000, depth: 'deep' };
}

function process(input, budget = CompressionBudget.AWAKE) {
  const startTime = Date.now();
  
  // Always try instant compression first
  let result = tryInstantCompression(input);
  if (result.success || budget.depth === 'instant') {
    return result;
  }
  
  // If budget allows, try harder
  if (budget.depth >= 'quick' && !result.success) {
    result = tryMultipleStrategies(input);
  }
  
  if (budget.depth >= 'local' && !result.success) {
    result = compareWithRecentFailures(input);
  }
  
  if (budget.depth >= 'discovery' && !result.success) {
    // This input is hard - mark for attention
    attentionBuffer.add(input, result.surprise);
  }
  
  return result;
}
```

---

## 3. Attention: What to Focus On

### 3.1 The Attention Buffer

Not just storage - an **agenda of unsolved problems** with priorities:

```javascript
class AttentionBuffer {
  // Priority queue of items needing attention
  items: PriorityQueue<AttentionItem>;
  
  // Capacity limits
  maxItems: number;
  
  add(input, surprise, context) {
    const priority = this.computePriority(input, surprise, context);
    this.items.insert({ input, surprise, context, timestamp: Date.now() }, priority);
    
    // Evict lowest priority if over capacity
    if (this.items.size > this.maxItems) {
      this.items.removeMin();
    }
  }
  
  computePriority(input, surprise, context) {
    // High surprise = needs attention
    const surpriseFactor = surprise / input.size;
    
    // Recurrence = persistent problem
    const recurrence = this.countSimilar(input);
    
    // Recency = fresh problem
    const recency = 1.0; // Decays over time
    
    return surpriseFactor * (1 + recurrence) * recency;
  }
  
  // Get top N items for current sleep session
  getTopProblems(n) {
    return this.items.peekTop(n);
  }
}
```

### 3.2 Priority Factors

| Factor | Meaning | Effect |
|--------|---------|--------|
| **Surprise** | How badly compression failed | Higher = more attention |
| **Recurrence** | How often similar problems appear | Higher = more urgent |
| **Recency** | How recent the problem is | Decays slowly |
| **Utility** | RL signal if available | Boosts important failures |

### 3.3 Attention During Sleep

```javascript
function sleepSession(budget) {
  // Get problems sorted by priority
  const problems = attentionBuffer.getTopProblems(budget.maxProblems);
  
  // Focus on top problems first
  for (const problem of problems) {
    if (budget.exhausted()) break;
    
    // Try to solve this problem
    const solution = searchForPattern(problem, budget);
    
    if (solution.found) {
      // Create/strengthen transform
      transformStore.addOrStrengthen(solution.transform);
      attentionBuffer.markResolved(problem);
    }
  }
}
```

---

## 4. Persistence: Across-Session Memory

### 4.1 The Problem

Some problems are too hard for a single session:
- Need more examples to see the pattern
- Need more compute than available
- Need cross-domain connections

### 4.2 Persistent Concerns

```javascript
class PersistentConcerns {
  // Problems that survive across sessions
  concerns: Map<hash, PersistentConcern>;
  
  // Threshold for persistence
  minRecurrence: number = 3;
  minAge: number = 2; // sessions
}

class PersistentConcern {
  // The problem signature
  signature: Bitset;  // Common pattern in failed compressions
  
  // Statistics
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  sessions: number;   // How many sessions it appeared in
  
  // Attempted solutions
  attempts: AttemptRecord[];
  bestAttempt: AttemptRecord | null;
  
  // Priority boost
  persistenceBonus: number;  // Grows with each session
}
```

### 4.3 Session Lifecycle

```javascript
// At session start
function onSessionStart() {
  // Load persistent concerns
  const concerns = persistentStore.load();
  
  // Boost their priority in attention buffer
  for (const concern of concerns) {
    concern.persistenceBonus *= 1.1; // 10% boost per session
    attentionBuffer.addWithBonus(concern, concern.persistenceBonus);
  }
}

// At session end
function onSessionEnd() {
  // Identify problems that should persist
  const unresolved = attentionBuffer.getUnresolved();
  
  for (const problem of unresolved) {
    const existing = persistentConcerns.find(problem.signature);
    
    if (existing) {
      existing.sessions++;
      existing.lastSeen = Date.now();
    } else if (problem.recurrence >= minRecurrence) {
      // Promote to persistent concern
      persistentConcerns.add(problem);
    }
  }
  
  // Save to disk
  persistentStore.save(persistentConcerns);
}
```

### 4.4 Cross-Session Learning

Persistent concerns enable:
- **Accumulation**: Collect more examples over time
- **Background processing**: Dedicate future sleep to hard problems
- **Transfer**: Connect problems from different contexts

---

## 5. The Unified Loop

### 5.1 Complete Processing Model

```
┌─────────────────────────────────────────────────────────────┐
│                     SESSION START                            │
│  1. Load persistent concerns                                │
│  2. Boost their priority                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     AWAKE PHASE                              │
│  For each input:                                            │
│    1. Try instant compression                               │
│    2. If fail → add to attention buffer with priority       │
│    3. Store (input, result) for later replay                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     LIGHT SLEEP                              │
│  (Triggered periodically or when buffer fills)              │
│  1. Get top N problems from attention buffer                │
│  2. Compare pairwise, find common patterns                  │
│  3. Create candidate transforms                             │
│  4. Test on held-out problems                               │
│  5. Keep transforms that help                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     DEEP SLEEP                               │
│  (Triggered on session end or explicit command)             │
│  1. Process ALL attention buffer                            │
│  2. Search for cross-problem patterns                       │
│  3. Reorganize transform library                            │
│  4. Re-rank by utility                                      │
│  5. Prune unused transforms                                 │
│  6. Merge similar groups                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     SESSION END                              │
│  1. Identify unresolved problems                            │
│  2. Promote recurring → persistent concerns                 │
│  3. Save state                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Continuous Operation

In continuous mode (server):
- **Awake**: Process requests in real-time
- **Light sleep**: Every N requests or M seconds
- **Deep sleep**: Every hour or on low activity

---

## 6. Connection to Other DS

### 6.1 Replaces/Unifies

| Old DS | New Role |
|--------|----------|
| **DS-003** (Learning) | Awake phase: instant compression + failure marking |
| **DS-010** (Sleep) | Sleep phases: pattern discovery + reorganization |

### 6.2 Integrates With

| DS | Integration |
|----|-------------|
| **DS-005** (RL) | Utility signal affects attention priority |
| **DS-023** (Transforms) | Sleep discovers transforms |
| **DS-022** (Sequence) | Temporal patterns in attention |

---

## 7. Implementation Plan

### Phase 1: AttentionBuffer
1. Create priority queue with surprise-based ranking
2. Add recurrence detection
3. Integrate into process() loop

### Phase 2: Budget-Based Processing
1. Define CompressionBudget levels
2. Modify process() to respect budget
3. Add timeout handling

### Phase 3: Sleep Phases
1. Implement lightSleep() with local pattern search
2. Implement deepSleep() with full reorganization
3. Add triggers (periodic, buffer-full, explicit)

### Phase 4: Persistence
1. Define PersistentConcern structure
2. Implement session start/end hooks
3. Add cross-session priority boosting

### Phase 5: Integration
1. Connect to BSPEngine
2. Add configuration options
3. Benchmark impact on BLiMP and BPC

---

## 8. Configuration

```javascript
const DEFAULT_CONFIG = {
  // Attention buffer
  attention: {
    maxItems: 10000,
    surpriseWeight: 1.0,
    recurrenceWeight: 2.0,
    recencyDecay: 0.99,
  },
  
  // Sleep triggers
  sleep: {
    lightSleepInterval: 1000,     // Every 1000 inputs
    lightSleepDuration: 1000,     // 1 second
    deepSleepInterval: 3600000,   // Every hour
    deepSleepDuration: 60000,     // 1 minute
  },
  
  // Persistence
  persistence: {
    minRecurrence: 3,
    minSessions: 2,
    persistenceBonusGrowth: 1.1,
  },
};
```

---

## 9. Metrics

### 9.1 Attention Quality

- **Resolution rate**: % of attention items eventually resolved
- **Time to resolution**: Sessions until pattern found
- **Priority accuracy**: Do high-priority items get resolved faster?

### 9.2 Sleep Efficiency

- **Transforms discovered per sleep**: Productivity of sleep phases
- **Compression improvement**: BPC before/after sleep
- **Prune rate**: % of unused knowledge removed

### 9.3 Persistence Value

- **Cross-session resolution**: Problems solved after multiple sessions
- **Accumulation effect**: Quality improvement from persistence

---

## 10. Philosophical Note

This architecture mirrors biological learning:
- **Awake**: Fast pattern matching (recognition)
- **Attention**: Emotional/surprise tagging (amygdala)
- **Light sleep**: Local consolidation (hippocampus replay)
- **Deep sleep**: Reorganization (cortical integration)
- **Persistence**: Long-term memory formation

The key insight: **Learning IS compression. Sleep IS search. Attention IS priority.**

There's no magic - just compute applied where it matters most.
