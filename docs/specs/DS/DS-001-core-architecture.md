# DS-001: Core Architecture - BSP (Bitset System for Prediction)

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

BSP este un sistem de învățare continuă bazat pe CPU care folosește bitset-uri ca reprezentări și un obiectiv de compresie/minimizare surpriză, fără dependență de arhitecturi Transformer.

### 1.1 Principii Fundamentale

- **Essence**: Grupurile devin "identitatea de sens" stabilă
- **Grouping**: Identitățile rămân împreună dacă apar împreună predictibil
- **Deduction**: Legături între grupuri din co-apariție temporală + condiționare
- **Continuous Learning**: RL permanent din interacțiuni

### 1.2 Diferențe față de LLM-uri Tradiționale

| Aspect | LLM Tradițional | BSP |
|--------|-----------------|------|
| Reprezentări | Embeddings float + attention | Bitset-uri + seturi discrete |
| Memorie | Ponderile rețelei | Grupuri explicite + contori |
| Inference | Forward pass matrice | Intersecții seturi + popcount |
| Învățare | Batch training offline | Online, incremental |
| Interpretabilitate | Opacă | Grupuri = liste de identități |

---

## 2. Arhitectura Sistem

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

## 3. Flow Principal

### 3.1 Procesare Input

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
│ Activate    │ → A: top-K grupuri active
└─────────────┘
    │
    ▼
┌─────────────┐
│ Predict     │ → Â: grupuri anticipate (din context)
└─────────────┘
    │
    ▼
┌─────────────┐
│ Surprise    │ → biți neexplicați + halucinare
└─────────────┘
    │
    ▼
┌─────────────┐
│ Learn       │ → update grupuri + deducții
└─────────────┘
```

### 3.2 Predicție și Generare

```
Context Groups (A_prev)
    │
    ▼
┌─────────────────┐
│ Expand Deductions│ → candidați din deduce[g]
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Score & Rank    │ → Â: top grupuri probabile
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Decode to Bits  │ → x̂: biți anticipați
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Map to Tokens   │ → text output (sau embedding pentru generare)
└─────────────────┘
```

---

## 4. Componente Principale

### 4.1 GroupStore
- Stochează grupurile (concepte)
- Fiecare grup: members (bitset), memberCounts, salience, age, usage

### 4.2 BitmapIndex
- Index invers: belongsTo[identity] → grupuri
- Permite retrieval rapid

### 4.3 DeductionGraph
- Legături între grupuri: deduce[g] → h
- Contori/greutăți pentru probabilități

### 4.4 Learner
- Update memberships bazat pe surpriză
- Creare/split/merge grupuri
- Update deducții din tranziții temporale

### 4.5 Importance Module
- Calculează importance = f(novelty, utility, stability)
- Modulează learning rate

### 4.6 ReplayBuffer
- Stochează experiențe prioritizate
- Permite consolidare (offline learning)

---

## 5. Metrici și Obiective

### 5.1 Loss Principal (MDL-style)

```
L = |surprise| + β*|hallucination| + γ*|A|
```

Unde:
- `surprise` = x \ x_hat (biți neexplicați)
- `hallucination` = x_hat \ x (biți explicați dar inexistenți)
- `|A|` = numărul de grupuri folosite

### 5.2 Metrici de Evaluare

- **Surprise Rate**: |surprise| / |x|
- **Hallucination Rate**: |hallucination| / |x_hat|
- **Compression Ratio**: |x| / |A|
- **Prediction Accuracy**: pentru next-token tasks

---

## 6. Parametri Globali (MVP)

| Parametru | Valoare Default | Descriere |
|-----------|-----------------|-----------|
| K (top groups) | 16 | Grupuri active per input |
| Activation threshold | 0.2 | Prag minim scor grup |
| Membership threshold | 3 | Count minim pentru bit în grup |
| Decay rate | -1/1000 | Decrement la fiecare 1k updates |
| Deduction depth | 3 | Adâncime maximă BFS |
| Beam width | 128 | Noduri explorate în inferență |
| Replay buffer size | 50,000 | Episoade stocate |
| RL pressure (ρ) | 0.3 | Echilibru LM vs RL |

---

## 7. Extinderi Viitoare

1. **Multi-modal**: Suport pentru imagini/audio ca identități
2. **Distributed**: Sharding pe mai multe procese
3. **Hierarchical Groups**: Grupuri de grupuri pentru abstracție
4. **External Memory**: Integrare cu storage persistent pentru scale mare

---

## 8. Referințe

- Roaring Bitmaps: https://roaringbitmap.org/
- MDL (Minimum Description Length): Rissanen, 1978
- Predictive Coding: Rao & Ballard, 1999
