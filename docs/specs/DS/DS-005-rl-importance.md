# DS-005: RL Integration and Importance Mechanism

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

This document describes the integration of Reinforcement Learning (RL) into BSP and the "importance" mechanism that modulates learning speed and consolidation.

---

## 2. RL Philosophy in BSP

### 2.1 Principles

1. **Every conversation is RL**: Each interaction provides implicit or explicit feedback
2. **Importance is subjective**: The user can explicitly mark how important an input is
3. **LM ↔ RL balance**: Parameter ρ controls the trade-off between compression and adaptation
4. **Continuous learning**: There is no strict training/inference separation

### 2.2 Reward Types

| Type | Source | Example |
|-----|-------|---------|
| **Explicit** | User (direct) | 👍/👎, rating 1-5, "important!" |
| **Implicit Positive** | Behavior | User continues the conversation, accepts the suggestion |
| **Implicit Negative** | Behavior | User corrects, abandons, rephrases |
| **Task-based** | Completion | Task completed successfully |

---

## 3. Reward Structure

### 3.1 Reward Signal

```typescript
interface RewardSignal {
  value: number;           // -1 to +1 (normalized)
  type: RewardType;
  source: RewardSource;
  timestamp: number;
  confidence: number;      // 0-1, how confident we are
}

enum RewardType {
  EXPLICIT_POSITIVE = 'explicit_positive',
  EXPLICIT_NEGATIVE = 'explicit_negative',
  IMPLICIT_CONTINUE = 'implicit_continue',
  IMPLICIT_ACCEPT = 'implicit_accept',
  IMPLICIT_CORRECT = 'implicit_correct',
  IMPLICIT_ABANDON = 'implicit_abandon',
  TASK_SUCCESS = 'task_success',
  TASK_FAILURE = 'task_failure',
}

enum RewardSource {
  USER_EXPLICIT = 'user',
  SYSTEM_INFERRED = 'system',
  TASK_METRIC = 'task',
}
```

### 3.2 Reward Parser

```typescript
class RewardParser {
  // Parse input for explicit reward
  parseExplicit(input: string): RewardSignal | null {
    // Patterns for explicit feedback
    const patterns = [
      {regex: /\+{1,3}|👍|good|correct|yes\\b/i, value: 0.5},
      {regex: /\+{4,}|excellent|perfect/i, value: 1.0},
      {regex: /-{1,3}|👎|bad|wrong|no\\b/i, value: -0.5},
      {regex: /-{4,}|terrible|totally wrong/i, value: -1.0},
      {regex: /important!?/i, value: 0.8, type: 'importance_marker'},
      {regex: /ignore|skip/i, value: -0.3, type: 'skip_marker'},
    ];
    
    for (const pattern of patterns) {
      if (pattern.regex.test(input)) {
        return {
          value: pattern.value,
          type: pattern.value > 0 ? 
            RewardType.EXPLICIT_POSITIVE : 
            RewardType.EXPLICIT_NEGATIVE,
          source: RewardSource.USER_EXPLICIT,
          timestamp: Date.now(),
          confidence: 0.9,
        };
      }
    }
    
    return null;
  }
  
  // Infer reward from behavior
  inferImplicit(
    prevContext: ConversationContext,
    currentInput: string
  ): RewardSignal {
    // User continues the conversation => implicit positive
    if (prevContext.awaitingResponse && currentInput.length > 10) {
      return {
        value: 0.1,
        type: RewardType.IMPLICIT_CONTINUE,
        source: RewardSource.SYSTEM_INFERRED,
        timestamp: Date.now(),
        confidence: 0.5,
      };
    }
    
    // User corrects => implicit negative
    if (this.detectCorrection(prevContext, currentInput)) {
      return {
        value: -0.3,
        type: RewardType.IMPLICIT_CORRECT,
        source: RewardSource.SYSTEM_INFERRED,
        timestamp: Date.now(),
        confidence: 0.6,
      };
    }
    
    // Default: neutral
    return {
      value: 0,
      type: RewardType.IMPLICIT_CONTINUE,
      source: RewardSource.SYSTEM_INFERRED,
      timestamp: Date.now(),
      confidence: 0.3,
    };
  }
}
```

---

## 4. Importance

### 4.1 Formula

```typescript
function computeImportance(factors: ImportanceFactors): number {
  const {
    novelty,      // |surprise| / |input|
    utility,      // reward value
    stability,    // recurrence over time
    recency,      // how recent
    explicitMark, // user explicitly marked it
  } = factors;
  
  // Configurable weights
  const W = {
    novelty: 0.25,
    utility: 0.35,
    stability: 0.20,
    recency: 0.10,
    explicit: 0.10,
  };
  
  const raw = 
    W.novelty * novelty +
    W.utility * Math.abs(utility) +  // Both positive and negative feedback can be important
    W.stability * stability +
    W.recency * recency +
    W.explicit * (explicitMark ? 1 : 0);
  
  // Clamp and scale
  return clamp(raw, 0.1, 1.0);
}

interface ImportanceFactors {
  novelty: number;
  utility: number;
  stability: number;
  recency: number;
  explicitMark: boolean;
}
```

### 4.2 Modulating Learning Rate

```typescript
function getEffectiveLearningRate(
  baseAlpha: number,
  importance: number,
  rlPressure: number  // ρ
): number {
  // Formula: α_eff = α_base * (0.2 + 0.8 * importance) * (1 + ρ * boost)
  const importanceFactor = 0.2 + 0.8 * importance;
  const rlBoost = 1 + rlPressure * 0.5;
  
  return baseAlpha * importanceFactor * rlBoost;
}
```

---

## 5. RL Pressure (ρ)

### 5.1 Conceptul

ρ ∈ [0, 1] controls the balance:
- ρ = 0: Pure "LM" learning (surprise minimization, stability)
- ρ = 1: Aggressive "policy shaping" adaptation (risk of drift)

### 5.2 How It Affects the System

```typescript
class RLPressureController {
  private rho: number = 0.3;  // Default
  
  // Apply RL pressure to loss/update
  computeLoss(
    surprise: number,
    hallucination: number,
    groupCount: number,
    reward: number
  ): number {
    // LM loss (compression)
    const lmLoss = surprise + BETA * hallucination + GAMMA * groupCount;
    
    // Loss RL (reward)
    const rlLoss = -reward;  // Maximize reward = minimize negative
    
    // Combination
    return (1 - this.rho) * lmLoss + this.rho * rlLoss;
  }
  
  // Apply to consolidation
  shouldConsolidate(episode: Episode): boolean {
    if (this.rho < 0.2) {
      // Low ρ: consolidate based on surprise
      return episode.surprise > SURPRISE_THRESHOLD;
    } else {
      // High ρ: consolidate based on reward
      return Math.abs(episode.reward) > REWARD_THRESHOLD;
    }
  }
  
  // Dynamic setting
  setRho(value: number): void {
    this.rho = clamp(value, 0, 1);
  }
  
  // Auto-adjust based on performance
  autoAdjust(metrics: PerformanceMetrics): void {
    if (metrics.rewardVariance > HIGH_VARIANCE) {
      // Lots of contradictory feedback => reduce RL pressure
      this.rho *= 0.9;
    } else if (metrics.avgReward > GOOD_REWARD_THRESHOLD) {
      // Consistently good reward => can increase
      this.rho = Math.min(this.rho * 1.05, 0.8);
    }
  }
}
```

---

## 6. Value Function Over Groups

### 6.1 Salience as Value

```typescript
function updateGroupSalience(
  group: Group,
  reward: number,
  importance: number,
  baseline: number
): void {
  // TD-like update
  const advantage = reward - baseline;
  const delta = SALIENCE_LR * importance * advantage;
  
  group.salience = clamp(group.salience + delta, 0, 1);
}

function computeBaseline(recentRewards: number[]): number {
  if (recentRewards.length === 0) return 0;
  return recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
}
```

### 6.2 Value Propagation

```typescript
function propagateValue(
  activeGroups: Group[],
  reward: number,
  graph: DeductionGraph,
  store: GroupStore
): void {
  const baseline = computeBaseline(recentRewards);
  
  // Directly active groups receive the full update
  for (const group of activeGroups) {
    updateGroupSalience(group, reward, 1.0, baseline);
  }
  
  // Back-propagation over the graph (credit assignment)
  for (const group of activeGroups) {
    const predecessors = graph.getBackwardLinks(group.id);
    
    for (const [predId, weight] of predecessors) {
      const predGroup = store.get(predId);
      if (predGroup) {
        // Discount based on weight and depth
        const discountedReward = reward * weight * CREDIT_DECAY;
        updateGroupSalience(predGroup, discountedReward, 0.5, baseline);
      }
    }
  }
}
```

---

## 7. Flow Integration

### 7.1 Training Step with RL

```typescript
async function trainStepWithRL(
  input: string,
  explicitReward: number | null,
  engine: BSPEngine,
  rlController: RLPressureController
): Promise<TrainResult> {
  // 1. Parse reward explicit
  const explicitSignal = engine.rewardParser.parseExplicit(input);
  
  // 2. Infer implicit reward from context
  const implicitSignal = engine.rewardParser.inferImplicit(
    engine.context,
    input
  );
  
  // 3. Combine rewards
  const reward = combineRewards(explicitSignal, implicitSignal, explicitReward);
  
  // 4. Compute importance
  const importance = computeImportance({
    novelty: 0,  // Computed after encoding
    utility: reward.value,
    stability: engine.getPatternStability(input),
    recency: 1.0,
    explicitMark: explicitSignal?.type === 'importance_marker',
  });
  
  // 5. Encode and activate
  const x = engine.encode(input);
  const activeGroups = engine.activate(x);
  
  // 6. Update importance with the true novelty
  const reconstruction = engine.reconstruct(activeGroups);
  const {surprise} = engine.computeSurprise(x, reconstruction);
  
  const finalImportance = computeImportance({
    novelty: surprise.size / x.size,
    utility: reward.value,
    stability: engine.getPatternStability(input),
    recency: 1.0,
    explicitMark: explicitSignal?.type === 'importance_marker',
  });
  
  // 7. Get effective learning rate
  const alpha = getEffectiveLearningRate(
    BASE_ALPHA,
    finalImportance,
    rlController.getRho()
  );
  
  // 8. Learn with modulated α
  engine.learn(activeGroups, x, alpha);
  
  // 9. Update salience (value function)
  propagateValue(activeGroups, reward.value, engine.graph, engine.store);
  
  // 10. Store in replay buffer with priority
  engine.buffer.add({
    input: x,
    activeGroups: activeGroups.map(g => g.id),
    surprise: surprise.size,
    reward: reward.value,
    importance: finalImportance,
    priority: finalImportance * (1 + Math.abs(reward.value)),
  });
  
  return {
    activeGroups,
    surprise: surprise.size,
    reward: reward.value,
    importance: finalImportance,
  };
}
```

---

## 8. RL Metrics

### 8.1 Tracking

```typescript
interface RLMetrics {
  // Reward statistics
  avgReward: number;
  rewardVariance: number;
  positiveRewardRate: number;
  
  // Learning dynamics
  avgImportance: number;
  salienceDistribution: {mean: number, std: number};
  
  // Stability
  groupChurn: number;  // How many groups changed significantly
  deductionChurn: number;
  
  // RL pressure
  currentRho: number;
  rhoHistory: number[];
}

class RLMetricsTracker {
  private rewardHistory: number[] = [];
  private importanceHistory: number[] = [];
  
  record(reward: number, importance: number): void {
    this.rewardHistory.push(reward);
    this.importanceHistory.push(importance);
    
    // Keep last N
    if (this.rewardHistory.length > 1000) {
      this.rewardHistory.shift();
      this.importanceHistory.shift();
    }
  }
  
  getMetrics(): RLMetrics {
    return {
      avgReward: mean(this.rewardHistory),
      rewardVariance: variance(this.rewardHistory),
      positiveRewardRate: this.rewardHistory.filter(r => r > 0).length / 
                          this.rewardHistory.length,
      avgImportance: mean(this.importanceHistory),
      // ... etc
    };
  }
}
```

---

## 9. API for User Control

### 9.1 Explicit Commands

```typescript
interface RLUserCommands {
  // Importance markers
  markImportant(): void;      // /important
  markIgnore(): void;         // /ignore
  
  // Feedback
  thumbsUp(): void;           // 👍 or /good
  thumbsDown(): void;         // 👎 or /bad
  rate(value: number): void;  // /rate 4
  
  // Control RL pressure
  setRLPressure(rho: number): void;  // /rl-pressure 0.5
  
  // Visualization
  showSalience(): Group[];    // /show-salience
  showMetrics(): RLMetrics;   // /rl-metrics
}
```

### 9.2 Chat Syntax

```
User: This is very important! +++ /important

User: No, wrong ---

User: /rl-pressure 0.7

User: /show-salience
System: Top 10 groups by salience:
  1. [cooking_terms] salience=0.89
  2. [user_preferences] salience=0.85
  ...
```

---

## 10. Parameters

| Parameter | Value | Description |
|-----------|---------|-----------|
| `DEFAULT_RHO` | 0.3 | Default RL pressure |
| `BASE_ALPHA` | 0.1 | Base learning rate |
| `SALIENCE_LR` | 0.05 | Learning rate salience |
| `CREDIT_DECAY` | 0.5 | Decay for propagation |
| `IMPORTANCE_MIN` | 0.1 | Minimum importance |
| `REWARD_THRESHOLD` | 0.3 | Threshold for RL consolidation |
| `SURPRISE_THRESHOLD` | 0.4 | Threshold for LM consolidation |

---

## 11. RL Flow Diagram

```
User Input
    │
    ▼
┌─────────────────┐
│ Parse Explicit  │──── Reward? ────► RewardSignal
│ Reward          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Infer Implicit  │──── Context ────► RewardSignal
│ Reward          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Combine Rewards │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Compute         │
│ Importance      │◄──── novelty, utility, stability
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Modulate α      │◄──── ρ (RL pressure)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Learn           │──── Update Groups, Deductions
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update Salience │──── Propagate Value
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Replay Buffer   │──── Prioritized by importance
└─────────────────┘
```
