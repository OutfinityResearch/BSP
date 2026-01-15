# DS-001: Core Architecture - BSP (Bitset System for Prediction)

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

BSP is a CPU-based continuous-learning system that uses bitsets as representations and an MDL-style compression/minimum-surprise objective, without relying on Transformer architectures.

### 1.1 Fundamental Principles

- **Essence**: Groups become a stable "identity of meaning"
- **Grouping**: Identities stay together when they co-occur predictably
- **Deduction**: Links between groups learned from temporal co-occurrence + conditioning
- **Continuous Learning**: Continuous RL signals from interactions

### 1.2 Differences vs Traditional LLMs

| Aspect | Traditional LLM | BSP |
|--------|-----------------|------|
| Representations | Float embeddings + attention | Bitsets + discrete sets |
| Memory | Network weights | Explicit groups + counters |
| Inference | Matrix forward pass | Set intersections + popcount |
| Learning | Offline batch training | Online, incremental |
| Interpretability | Opaque | Groups = explicit identity lists |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Server                               │
│                     (Chat Interface)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   Tokenizer  │───▶│   Encoder    │───▶│  Group Activator │   │
│  │  (text→IDs)  │    │  (IDs→bitset)│    │   (bitset→A)     │   │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘   │
│                                                    │             │
│  ┌──────────────────────────────────────────────────┼──────────┐ │
│  │                 Core Engine                      ▼          │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │ │
│  │  │ GroupStore │  │DeductionGraph│ │   Predictor          │ │ │
│  │  │(members,   │◀▶│(deduce links)│◀▶│  (next groups/bits)  │ │ │
│  │  │ salience)  │  │             │  └────────────────────────┘ │ │
│  │  └────────────┘  └────────────┘                             │ │
│  │        ▲              ▲                                      │ │
│  │        │              │                                      │ │
│  │  ┌─────┴──────────────┴─────┐  ┌─────────────────────────┐  │ │
│  │  │       Learner           │◀─│    Importance Module     │  │ │
│  │  │ (update groups/deduce)  │  │ (novelty, utility, RL)   │  │ │
│  │  └─────────────────────────┘  └─────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ ReplayBuffer │    │ Serializer   │    │ Session Manager  │   │
│  │(prioritized) │    │(save/load)   │    │  (continuity)    │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Main Flow

### 3.1 Input Processing

```
Text Input
    │
    ▼
┌─────────────┐
│ Tokenize    │ → token IDs
└─────────────┘
    │
    ▼
┌─────────────┐
│ Hash/Encode │ → feature IDs (0..N-1, N≤1M)
└─────────────┘
    │
    ▼
┌─────────────┐
│ Bitset      │ → x: RoaringBitmap
└─────────────┘
    │
    ▼
┌─────────────┐
│ Activate    │ → A: top-K active groups
└─────────────┘
    │
    ▼
┌─────────────┐
│ Predict     │ → A_hat: predicted groups (from context)
└─────────────┘
    │
    ▼
┌─────────────┐
│ Surprise    │ → unexplained bits + hallucination
└─────────────┘
    │
    ▼
┌─────────────┐
│ Learn       │ → update groups + deductions
└─────────────┘
```

### 3.2 Prediction and Generation

```
Context Groups (A_prev)
    │
    ▼
┌─────────────────┐
│ Expand Deductions│ → candidates from deduce[g]
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Score & Rank    │ → A_hat: top likely groups
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Decode to Bits  │ → x̂: predicted bits
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Map to Tokens   │ → text output (or embeddings for generation)
└─────────────────┘
```

---

## 4. Core Components

### 4.1 GroupStore
- Stores groups (concepts)
- Each group: members (bitset), memberCounts, salience, age, usage

### 4.2 BitmapIndex
- Inverted index: belongsTo[identity] → groups
- Enables fast candidate retrieval

### 4.3 DeductionGraph
- Links between groups: deduce[g] → h
- Counters/weights for estimating link strength/probabilities

### 4.4 Learner
- Membership updates driven by surprise
- Group create/split/merge
- Deduction updates from temporal transitions

### 4.5 Importance Module
- Computes importance = f(novelty, utility, stability)
- Modulates learning rate

### 4.6 ReplayBuffer
- Stores prioritized experiences
- Enables consolidation (offline learning)

---

## 5. Metrics and Objectives

### 5.1 Primary Loss (MDL-style)

```
L = |surprise| + β*|hallucination| + γ*|A|
```

Where:
- `surprise` = x \ x_hat (unexplained bits)
- `hallucination` = x_hat \ x (explained-but-absent bits)
- `|A|` = the number of groups used

### 5.2 Evaluation Metrics

- **Surprise Rate**: |surprise| / |x|
- **Hallucination Rate**: |hallucination| / |x_hat|
- **Compression Ratio**: |x| / |A|
- **Prediction Accuracy**: for next-token tasks

---

## 6. Global Parameters (MVP)

| Parameter | Default Value | Description |
|-----------|-----------------|-----------|
| K (top groups) | 16 | Active groups per input |
| Activation threshold | 0.2 | Minimum group score threshold |
| Membership threshold | 3 | Minimum count for an identity to be considered a member |
| Decay rate | -1/1000 | Decrement applied every 1k updates |
| Deduction depth | 3 | Maximum BFS depth |
| Beam width | 128 | Nodes explored during inference |
| Replay buffer size | 50,000 | Stored episodes |
| RL pressure (ρ) | 0.3 | LM vs RL trade-off |

---

## 7. Future Extensions

1. **Multi-modal**: Support images/audio as identities
2. **Distributed**: Sharding across multiple processes
3. **Hierarchical Groups**: Groups-of-groups for abstraction
4. **External Memory**: Integration with persistent storage at larger scale

---

## 8. References

- Roaring Bitmaps: https://roaringbitmap.org/
- MDL (Minimum Description Length): Rissanen, 1978
- Predictive Coding: Rao & Ballard, 1999
