# DS-005: RL Integration and Importance Mechanism

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

Acest document descrie integrarea Reinforcement Learning în BSP și mecanismul de "importanță" care modulează viteza de învățare și consolidare.

---

## 2. Filosofia RL în BSP

### 2.1 Principii

1. **Orice conversație e RL**: Fiecare interacțiune oferă feedback implicit sau explicit
2. **Importanța e subiectivă**: User-ul poate marca explicit cât de important e un input
3. **Echilibru LM ↔ RL**: Parametrul ρ controlează balanța între compresie și adaptare
4. **Învățare continuă**: Nu există separare training/inference

### 2.2 Tipuri de Reward

| Tip | Sursa | Exemplu |
|-----|-------|---------|
| **Explicit** | User direct | 👍/👎, rating 1-5, "important!" |
| **Implicit Pozitiv** | Comportament | User continuă conversația, acceptă sugestia |
| **Implicit Negativ** | Comportament | User corectează, abandonează, reformulează |
| **Task-based** | Completion | Task finalizat cu succes |

---

## 3. Structura Reward

### 3.1 Reward Signal

```typescript
interface RewardSignal {
  value: number;           // -1 to +1 (normalized)
  type: RewardType;
  source: RewardSource;
  timestamp: number;
  confidence: number;      // 0-1, cât de siguri suntem
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
  // Parsează input pentru reward explicit
  parseExplicit(input: string): RewardSignal | null {
    // Patterns pentru feedback explicit
    const patterns = [
      {regex: /\+{1,3}|👍|good|corect|da\b/i, value: 0.5},
      {regex: /\+{4,}|excelent|perfect/i, value: 1.0},
      {regex: /-{1,3}|👎|bad|greșit|nu\b/i, value: -0.5},
      {regex: /-{4,}|groaznic|total greșit/i, value: -1.0},
      {regex: /important!?/i, value: 0.8, type: 'importance_marker'},
      {regex: /ignoră|skip/i, value: -0.3, type: 'skip_marker'},
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
  
  // Inferă reward din comportament
  inferImplicit(
    prevContext: ConversationContext,
    currentInput: string
  ): RewardSignal {
    // User continuă conversația = implicit pozitiv
    if (prevContext.awaitingResponse && currentInput.length > 10) {
      return {
        value: 0.1,
        type: RewardType.IMPLICIT_CONTINUE,
        source: RewardSource.SYSTEM_INFERRED,
        timestamp: Date.now(),
        confidence: 0.5,
      };
    }
    
    // User corectează = implicit negativ
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

## 4. Importanță (Importance)

### 4.1 Formula

```typescript
function computeImportance(factors: ImportanceFactors): number {
  const {
    novelty,      // |surprise| / |input|
    utility,      // reward value
    stability,    // recurență în timp
    recency,      // cât de recent
    explicitMark, // user a marcat explicit
  } = factors;
  
  // Weights configurabile
  const W = {
    novelty: 0.25,
    utility: 0.35,
    stability: 0.20,
    recency: 0.10,
    explicit: 0.10,
  };
  
  const raw = 
    W.novelty * novelty +
    W.utility * Math.abs(utility) +  // Atât pozitiv cât și negativ e important
    W.stability * stability +
    W.recency * recency +
    W.explicit * (explicitMark ? 1 : 0);
  
  // Clamp și scale
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

ρ ∈ [0, 1] controlează echilibrul:
- ρ = 0: Învățare pură tip "LM" (minimizare surpriză, stabilitate)
- ρ = 1: Adaptare agresivă tip "policy shaping" (risc de drift)

### 5.2 Cum afectează sistemul

```typescript
class RLPressureController {
  private rho: number = 0.3;  // Default
  
  // Aplică presiunea RL la loss/update
  computeLoss(
    surprise: number,
    hallucination: number,
    groupCount: number,
    reward: number
  ): number {
    // Loss LM (compresie)
    const lmLoss = surprise + BETA * hallucination + GAMMA * groupCount;
    
    // Loss RL (reward)
    const rlLoss = -reward;  // Maximize reward = minimize negative
    
    // Combinație
    return (1 - this.rho) * lmLoss + this.rho * rlLoss;
  }
  
  // Aplică la consolidare
  shouldConsolidate(episode: Episode): boolean {
    if (this.rho < 0.2) {
      // Low ρ: consolidează bazat pe surpriză
      return episode.surprise > SURPRISE_THRESHOLD;
    } else {
      // High ρ: consolidează bazat pe reward
      return Math.abs(episode.reward) > REWARD_THRESHOLD;
    }
  }
  
  // Setare dinamică
  setRho(value: number): void {
    this.rho = clamp(value, 0, 1);
  }
  
  // Auto-adjust bazat pe performance
  autoAdjust(metrics: PerformanceMetrics): void {
    if (metrics.rewardVariance > HIGH_VARIANCE) {
      // Mult feedback contradictoriu → reduce RL pressure
      this.rho *= 0.9;
    } else if (metrics.avgReward > GOOD_REWARD_THRESHOLD) {
      // Reward consistent bun → poate crește
      this.rho = Math.min(this.rho * 1.05, 0.8);
    }
  }
}
```

---

## 6. Value Function pe Grupuri

### 6.1 Salience ca Value

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

### 6.2 Propagare Value

```typescript
function propagateValue(
  activeGroups: Group[],
  reward: number,
  graph: DeductionGraph,
  store: GroupStore
): void {
  const baseline = computeBaseline(recentRewards);
  
  // Grupurile direct active primesc update complet
  for (const group of activeGroups) {
    updateGroupSalience(group, reward, 1.0, baseline);
  }
  
  // Propagare backwards pe graf (credit assignment)
  for (const group of activeGroups) {
    const predecessors = graph.getBackwardLinks(group.id);
    
    for (const [predId, weight] of predecessors) {
      const predGroup = store.get(predId);
      if (predGroup) {
        // Discount bazat pe weight și depth
        const discountedReward = reward * weight * CREDIT_DECAY;
        updateGroupSalience(predGroup, discountedReward, 0.5, baseline);
      }
    }
  }
}
```

---

## 7. Integrare în Flow

### 7.1 Training Step cu RL

```typescript
async function trainStepWithRL(
  input: string,
  explicitReward: number | null,
  engine: BSPEngine,
  rlController: RLPressureController
): Promise<TrainResult> {
  // 1. Parse reward explicit
  const explicitSignal = engine.rewardParser.parseExplicit(input);
  
  // 2. Infer reward implicit din context
  const implicitSignal = engine.rewardParser.inferImplicit(
    engine.context,
    input
  );
  
  // 3. Combină rewards
  const reward = combineRewards(explicitSignal, implicitSignal, explicitReward);
  
  // 4. Compute importance
  const importance = computeImportance({
    novelty: 0,  // Se calculează după encoding
    utility: reward.value,
    stability: engine.getPatternStability(input),
    recency: 1.0,
    explicitMark: explicitSignal?.type === 'importance_marker',
  });
  
  // 5. Encode și activate
  const x = engine.encode(input);
  const activeGroups = engine.activate(x);
  
  // 6. Update importance cu novelty reală
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
  
  // 8. Learn cu α modulat
  engine.learn(activeGroups, x, alpha);
  
  // 9. Update salience (value function)
  propagateValue(activeGroups, reward.value, engine.graph, engine.store);
  
  // 10. Store în replay buffer cu prioritate
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

## 8. Metrici RL

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
  groupChurn: number;  // Câte grupuri s-au schimbat semnificativ
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

## 9. API pentru User Control

### 9.1 Comenzi Explicite

```typescript
interface RLUserCommands {
  // Marcaj importanță
  markImportant(): void;      // /important
  markIgnore(): void;         // /ignore
  
  // Feedback
  thumbsUp(): void;           // 👍 sau /good
  thumbsDown(): void;         // 👎 sau /bad
  rate(value: number): void;  // /rate 4
  
  // Control RL pressure
  setRLPressure(rho: number): void;  // /rl-pressure 0.5
  
  // Vizualizare
  showSalience(): Group[];    // /show-salience
  showMetrics(): RLMetrics;   // /rl-metrics
}
```

### 9.2 Sintaxa în Chat

```
User: Asta e foarte important! +++ /important

User: Nu, greșit --- 

User: /rl-pressure 0.7

User: /show-salience
System: Top 10 groups by salience:
  1. [cooking_terms] salience=0.89
  2. [user_preferences] salience=0.85
  ...
```

---

## 10. Parametri

| Parametru | Valoare | Descriere |
|-----------|---------|-----------|
| `DEFAULT_RHO` | 0.3 | Presiune RL default |
| `BASE_ALPHA` | 0.1 | Learning rate bază |
| `SALIENCE_LR` | 0.05 | Learning rate salience |
| `CREDIT_DECAY` | 0.5 | Decay pentru propagare |
| `IMPORTANCE_MIN` | 0.1 | Importanță minimă |
| `REWARD_THRESHOLD` | 0.3 | Prag pentru consolidare RL |
| `SURPRISE_THRESHOLD` | 0.4 | Prag pentru consolidare LM |

---

## 11. Diagrama Flow RL

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
