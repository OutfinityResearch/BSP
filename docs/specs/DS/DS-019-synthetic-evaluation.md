# DS-019: Synthetic Abstract Primitives Benchmarks

**Version**: 3.0  
**Status**: Proposal  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

This specification defines a suite of **20 synthetic benchmarks** designed to evaluate BSP's ability to model fundamental "shapes" of information found in the real world. Unlike natural language, these use formal grammars with known ground truth to isolate specific reasoning capabilities.

The benchmarks are organized into three tiers:
- **Tier 1 (I-V):** Core primitives — fundamental building blocks
- **Tier 2 (VI-XV):** Extended primitives — advanced reasoning patterns  
- **Tier 3 (XVI-XX):** Learning & robustness primitives — learning dynamics and stability

---

## 2. Tier 1: Core Abstract Primitives (I-V)

### 2.1 System I: Convergence (Diagnostics)
**Logic:** Many distinct paths lead to a single, stable conclusion.
*   **Grammar:** $S_i \to \dots \to S_j \to T$ (Deterministic target).
*   **Real-World Analogue:** Medical diagnosis (Symptoms A, B, C $\to$ Flu), Software Debugging (Logs $\to$ Bug ID), River Basins.
*   **Task:** Given a start state $S_{start}$, predict the final terminal $T$.
*   **Key Metric:** Transitive Closure Accuracy.

### 2.2 System II: Divergence (Forecasting)
**Logic:** A single state can transition to multiple outcomes with specific probabilities.
*   **Grammar:** $A \to \{B (80\%), C (20\%)\}$.
*   **Real-World Analogue:** Weather forecasting, Stock market, Narrative branching, Risk assessment.
*   **Task:** Given $A$, predict the *distribution* of next states (or the most likely one).
*   **Key Metric:** Kullback-Leibler Divergence (between predicted weights and true probabilities) or Top-K Coverage.

### 2.3 System III: Cycles (Temporal Patterns)
**Logic:** Sequences repeat in a deterministic loop.
*   **Grammar:** $A \to B \to C \to A$.
*   **Real-World Analogue:** Days of the week, Traffic lights, Seasonal economic cycles, Engine cycles.
*   **Task:** Given a sequence $A, B$, predict $C$ (and eventually $A$ again). Long-horizon stability.
*   **Key Metric:** Periodicity Retention (does it hallucinate a break in the cycle?).

### 2.4 System IV: Hierarchy (Taxonomy)
**Logic:** Inheritance and Set Containment. If $x$ is a Dog, $x$ is an Animal.
*   **Grammar:** Tree structure. Leaves emit "Tokens".
    *   $Class_A \to \{Instance_1, Instance_2, SubClass_B\}$
*   **Real-World Analogue:** Biological taxonomy, Object Oriented Programming, Organization Charts.
*   **Task:** Given an instance $I$, predict its Superclass $S$. Given a Superclass $S$, predict potential Instances.
*   **Key Metric:** Ancestry Recall.

### 2.5 System V: Composition (Syntax/Logic)
**Logic:** Two independent inputs combine to form a unique output.
*   **Grammar:** $Operator(Feature_A, Feature_B) \to Result$.
    *   e.g., $Color \times Shape \to Object$.
    *   $Red, Square \to RedSquare$.
    *   $Blue, Square \to BlueSquare$.
*   **Real-World Analogue:** Grammar (Adjective + Noun), Chemistry (Elements -> Compound), Arithmetic ($2 + 2 = 4$).
*   **Task:** Zero-shot combination. Train on ($Red, Circle$) and ($Blue, Square$). Test on ($Red, Square$). 
*   **Key Metric:** Compositional Generalization.

---

## 3. Tier 2: Extended Abstract Primitives (VI-XV)

### 3.1 System VI: Negation (Mutual Exclusion)
**Logic:** If A is true, then B cannot be true. Groups are mutually exclusive.
*   **Grammar:** $A \to \{X, Y\}$ | $B \to \{Z, W\}$ where $A \otimes B = \emptyset$ (never co-occur).
*   **Real-World Analogue:** Differential diagnosis (if Flu, NOT Covid), Boolean toggles (ON/OFF), Gender classification.
*   **Task:** Given a state, predict what *cannot* follow. Avoid contradictory predictions.
*   **Key Metric:** Exclusion Accuracy (percentage of cases where mutually exclusive items are correctly separated).

### 3.2 System VII: Conditional Gates (Boolean Logic)
**Logic:** Output depends on logical combinations of inputs: AND, OR, XOR.
*   **Grammar:** 
    *   $(A \land B) \to C$
    *   $(A \land \neg B) \to D$  
    *   $(\neg A \land B) \to E$
    *   $(\neg A \land \neg B) \to F$
*   **Real-World Analogue:** Digital circuits, Access control rules (user + password $\to$ access), Feature flags.
*   **Task:** Given premises, predict the correct conclusion based on the logical gate.
*   **Key Metric:** Logic Gate Accuracy (per operator: AND, OR, XOR, NAND, etc.).

### 3.3 System VIII: Analogy (Proportional Reasoning)
**Logic:** Relational proportions: A:B :: C:D. Transform applied to one pair transfers to another.
*   **Grammar:** 
    *   $transform(king, male \to female) = queen$
    *   $transform(man, male \to female) = woman$
    *   General: $transform(X, R) = Y$ implies $transform(X', R) = Y'$
*   **Real-World Analogue:** Word embeddings (king - man + woman = queen), IQ tests, Metaphors.
*   **Task:** Given A:B and C, predict D.
*   **Key Metric:** Analogy Completion Accuracy.

### 3.4 System IX: Context Switching
**Logic:** The same input produces different outputs depending on the active context.
*   **Grammar:** 
    *   $[Ctx_1]\ A \to B$
    *   $[Ctx_2]\ A \to C$
*   **Real-World Analogue:** Polysemy (bank = financial institution / riverbank), Mode switching (edit/view mode), Language switching.
*   **Task:** Given context and input, predict the context-appropriate output.
*   **Key Metric:** Context-Conditional Accuracy.

### 3.5 System X: Chunking (Sub-pattern Recognition)
**Logic:** Recognition and reuse of recurring sub-patterns as atomic units.
*   **Grammar:** 
    *   $Chunk_\alpha = [A, B, C]$
    *   Sequences: $\dots \alpha \dots \alpha \dots \alpha \dots$
*   **Real-World Analogue:** Idioms, Reusable functions/macros, Musical riffs, Phone number groups.
*   **Task:** Identify the repeating chunk and predict continuation.
*   **Key Metric:** Chunk Discovery Rate + Compression Ratio improvement.

### 3.6 System XI: Reversibility (Bidirectional Inference)
**Logic:** If forward mapping A$	o$B is learned, can the system infer B$	o$A?
*   **Grammar:** 
    *   $encode(X) \to Y$
    *   $decode(Y) \to X$ (implicit, not trained)
*   **Real-World Analogue:** Encryption/Decryption, Translation (EN$	o$FR, FR$	o$EN), Cause-Effect reversal.
*   **Task:** Train on A$	o$B mappings, test on B$	o$A queries.
*   **Key Metric:** Inverse Recall.

### 3.7 System XII: Temporal Order (Sequence Sensitivity)
**Logic:** Order matters: [A, B] $\neq$ [B, A].
*   **Grammar:** 
    *   $[A, B] \to X$
    *   $[B, A] \to Y$ (where $X \neq Y$)
*   **Real-World Analogue:** Grammar (SVO vs SOV languages), Workflow steps, Recipe order, Stack operations (LIFO).
*   **Task:** Given ordered elements, predict the correct result.
*   **Key Metric:** Order Sensitivity Score.

### 3.8 System XIII: Exceptions (Default + Override)
**Logic:** General rules apply unless a more specific exception exists.
*   **Grammar:** 
    *   Default: $Bird \to canFly$
    *   Exception: $Penguin \subset Bird \to \neg canFly$
*   **Real-World Analogue:** Legal rules with exceptions, OOP inheritance with override, Grammar irregularities.
*   **Task:** Apply the correct rule (default or exception) based on specificity.
*   **Key Metric:** Exception Handling Accuracy.

### 3.9 System XIV: Interpolation (Gap Filling)
**Logic:** Complete missing elements in a sequence based on surrounding context.
*   **Grammar:** 
    *   Given: $A, \_, C, D$
    *   Predict: $B$ (the missing element)
*   **Real-World Analogue:** Cloze tests, Missing data imputation, Melody completion, BERT-style masking.
*   **Task:** Given incomplete context, predict the missing element(s).
*   **Key Metric:** Gap-Fill Accuracy.

### 3.10 System XV: Counting (Threshold-based Decisions)
**Logic:** Count occurrences and make decisions based on thresholds.
*   **Grammar:** 
    *   $A^n \to B$ if $n \geq 3$
    *   $A^n \to C$ if $n < 3$
*   **Real-World Analogue:** Rate limiting, Voting thresholds, Quorum decisions, Pattern frequency detection.
*   **Task:** After N repetitions, predict the correct transition.
*   **Key Metric:** Threshold Detection Accuracy.

---

## 4. Tier 3: Learning & Robustness Primitives (XVI-XX)

### 4.1 System XVI: Recursion (Self-Similar Structures)
**Logic:** Structures that contain smaller versions of themselves.
*   **Grammar:** 
    *   $S \to a\ S\ b$ | $S \to \epsilon$
    *   Generates: $ab$, $aabb$, $aaabbb$, ...
*   **Real-World Analogue:** Nested parentheses, Fractal structures, Recursive functions, Russian dolls.
*   **Task:** Given a prefix, predict the correct recursive continuation/closure.
*   **Key Metric:** Nesting Depth Accuracy (how deep can it correctly track?).

### 4.2 System XVII: Inhibition (Competitive Suppression)
**Logic:** When multiple candidates compete, the strongest wins and suppresses others.
*   **Grammar:** 
    *   $Input \to \{A (0.9), B (0.7), C (0.3)\}$
    *   Only A should be output (winner-take-all).
*   **Real-World Analogue:** Attention mechanisms, Lateral inhibition in neurons, Election systems.
*   **Task:** Given competing activations, produce only the winner (suppress losers).
*   **Key Metric:** Winner Selection Accuracy + Suppression Rate.

### 4.3 System XVIII: Noise Robustness (Partial Matching)
**Logic:** Recognize patterns even when inputs are noisy or incomplete.
*   **Grammar:** 
    *   Train: $[A, B, C, D] \to X$
    *   Test: $[A, B, \_, D] \to X$ or $[A, B, C', D] \to X$ (C' is corruption)
*   **Real-World Analogue:** OCR with smudges, Speech recognition with background noise, Typo tolerance.
*   **Task:** Correctly classify despite missing or corrupted elements.
*   **Key Metric:** Degradation Curve (accuracy vs noise level).

### 4.4 System XIX: Memory Decay (Recency Effects)
**Logic:** Recent information is more reliable/relevant than older information.
*   **Grammar:** 
    *   Context window with recency weighting.
    *   $[A_1, A_2, \dots, A_n, B] \to C$ where influence of $A_i$ decreases with age.
*   **Real-World Analogue:** Working memory, News relevance, Cache invalidation.
*   **Task:** Predict based on context, measuring how recency affects accuracy.
*   **Key Metric:** Recency Sensitivity Curve.

### 4.5 System XX: Transfer Learning (Domain Shift)
**Logic:** Apply knowledge learned in one domain to a structurally similar but superficially different domain.
*   **Grammar:** 
    *   Domain 1: $\{a, b, c\}$ with rules $R$
    *   Domain 2: $\{\alpha, \beta, \gamma\}$ with isomorphic rules $R'$
    *   Train on Domain 1, test on Domain 2 with minimal examples.
*   **Real-World Analogue:** Learning a second language, Applying math to physics, Code in new framework.
*   **Task:** After learning Domain 1 fully, learn Domain 2 with fewer examples.
*   **Key Metric:** Sample Efficiency Ratio (examples needed for Domain 2 / Domain 1).

---

## 5. Summary Table

| # | System | Capability | BSP Component Tested |
|---|--------|---------------------|---------------------|
| I | Convergence | Multi-path $\to$ single conclusion | Deduction graph (forward chaining) |
| II | Divergence | Single $\to$ multiple (probabilistic) | Probabilistic deductions |
| III | Cycles | Temporal loops | Cycle detection in deductions |
| IV | Hierarchy | Inheritance/taxonomy | Group nesting, salience |
| V | Composition | Zero-shot combination | Feature binding across groups |
| VI | Negation | Mutual exclusion | Group competition/inhibition |
| VII | Conditional Gates | Boolean logic | Multi-premise deduction |
| VIII | Analogy | Proportional reasoning | Transform transfer between groups |
| IX | Context Switching | Context-dependent output | Context-conditioned activation |
| X | Chunking | Sub-pattern reuse | Composite group formation |
| XI | Reversibility | Bidirectional inference | Backward deduction links |
| XII | Temporal Order | Sequence sensitivity | Order-preserving encoding |
| XIII | Exceptions | Default + override | Specificity in salience |
| XIV | Interpolation | Gap filling | Reconstruction from partial input |
| XV | Counting | Threshold decisions | Counters and accumulation |
| XVI | Recursion | Self-similar nesting | Recursive group references |
| XVII | Inhibition | Winner-take-all | Competitive activation |
| XVIII | Noise Robustness | Partial matching | Fuzzy group matching |
| XIX | Memory Decay | Recency effects | Temporal decay in counters |
| XX | Transfer | Domain adaptation | Structural isomorphism detection |

---

## 6. Implementation Plan

### 6.1 Directory Structure
```
evals/abstract_primitives/          # Synthetic diagnostic suite
├── 01_convergence/
│   ├── generator.mjs
│   ├── train.txt
│   ├── test.txt
│   └── metadata.json
├── 02_divergence/
│   └── ...
├── ...                             # (all 20 systems)
├── generate.mjs                    # Unified generator
├── evaluate.mjs                    # Unified evaluator
├── generation_summary.json
└── README.md
```

### 6.2 Evaluation Strategy

Each system will produce:
1.  `train.txt`: Sequences exposing the structure.
2.  `test.txt`: Prompts requiring the specific deduction.

The `evaluate.mjs` script will run them sequentially and report an **Abstract Primitives Profile** scorecard for the engine.

### 6.3 Abstract Primitives Profile Output

```
╔═══════════════════════════════════════════════════════════════╗
║              BSP ABSTRACT PRIMITIVES PROFILE                   ║
╠═══════════════════════════════════════════════════════════════╣
║ TIER 1: CORE PRIMITIVES                                        ║
║   I.   Convergence ............ 94.2%  ████████████████████░   ║
║   II.  Divergence ............. 87.5%  █████████████████░░░░   ║
║   III. Cycles ................. 99.1%  ████████████████████░   ║
║   IV.  Hierarchy .............. 82.3%  ████████████████░░░░░   ║
║   V.   Composition ............ 71.0%  ██████████████░░░░░░░   ║
╠═══════════════════════════════════════════════════════════════╣
║ TIER 2: EXTENDED PRIMITIVES                                    ║
║   VI.  Negation ............... 88.0%  █████████████████░░░░   ║
║   VII. Conditional Gates ...... 76.5%  ███████████████░░░░░░   ║
║   VIII.Analogy ................ 65.2%  █████████████░░░░░░░░   ║
║   IX.  Context Switching ...... 91.0%  ██████████████████░░░   ║
║   X.   Chunking ............... 85.3%  █████████████████░░░░   ║
║   XI.  Reversibility .......... 58.7%  ███████████░░░░░░░░░░   ║
║   XII. Temporal Order ......... 79.4%  ███████████████░░░░░░   ║
║   XIII.Exceptions ............. 73.1%  ██████████████░░░░░░░   ║
║   XIV. Interpolation .......... 81.9%  ████████████████░░░░░   ║
║   XV.  Counting ............... 67.8%  █████████████░░░░░░░░   ║
╠═══════════════════════════════════════════════════════════════╣
║ TIER 3: LEARNING & ROBUSTNESS                                  ║
║   XVI. Recursion .............. 45.2%  █████████░░░░░░░░░░░░   ║
║   XVII.Inhibition ............. 89.5%  █████████████████░░░░   ║
║   XVIII.Noise Robustness ...... 72.4%  ██████████████░░░░░░░   ║
║   XIX. Memory Decay ........... 83.6%  ████████████████░░░░░   ║
║   XX.  Transfer ............... 51.0%  ██████████░░░░░░░░░░░   ║
╠═══════════════════════════════════════════════════════════════╣
║ OVERALL SCORE: 77.3%                                           ║
║ STRENGTHS: Cycles, Convergence, Context Switching              ║
║ WEAKNESSES: Recursion, Transfer, Reversibility                 ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## 7. Difficulty Progression

### 7.1 Per-System Difficulty Levels

Each system should support multiple difficulty levels:

| Level | Description | Example (Cycles) |
|-------|-------------|------------------|
| Easy | Short patterns, no noise | Period = 3, no variation |
| Medium | Longer patterns, slight variation | Period = 7, 5% noise |
| Hard | Very long, nested, or noisy | Period = 13, nested cycles, 10% noise |

### 7.2 Curriculum Strategy

1. **Start with Tier 1** at Easy level
2. **Progress to Medium** once >80% accuracy achieved
3. **Add Tier 2** systems progressively
4. **Tier 3** serves as advanced diagnostics

---

## 8. References

- Compositional Generalization: Lake & Baroni, 2018
- Recursive Neural Networks: Socher et al., 2011
- Analogical Reasoning: Gentner, 1983
- MDL Principle: Rissanen, 1978
- Predictive Coding: Rao & Ballard, 1999