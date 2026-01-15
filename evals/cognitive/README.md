# Cognitive Benchmarks for BSP

This directory contains **20 synthetic cognitive benchmarks** designed to evaluate BSP's ability to model fundamental "shapes" of information.

## Quick Start

```bash
# Generate all benchmark data
node generate.mjs --all

# Run evaluation on all systems
node evaluate.mjs --all

# Generate/evaluate specific system
node generate.mjs --system=01_convergence
node evaluate.mjs --system=01
```

## Directory Structure

```
cognitive/
├── systems/              # Grammar definitions for each cognitive primitive
│   ├── 01_convergence.mjs
│   ├── 02_divergence.mjs
│   └── ... (20 systems)
├── data/                 # Generated train/test data
│   ├── 01_convergence/
│   │   ├── train.txt
│   │   ├── test.txt
│   │   └── metadata.json
│   └── ...
├── generate.mjs          # Unified data generator
├── evaluate.mjs          # Unified evaluator
└── README.md
```

## The 20 Cognitive Primitives

### Tier 1: Core Primitives (I-V)

| # | System | What it Tests | Real-World Analogue |
|---|--------|--------------|---------------------|
| 01 | **Convergence** | Many paths → single conclusion | Diagnosis, debugging |
| 02 | **Divergence** | Single → multiple outcomes | Forecasting, risk |
| 03 | **Cycles** | Temporal loops | Days of week, seasons |
| 04 | **Hierarchy** | Taxonomy/inheritance | Biology, OOP |
| 05 | **Composition** | Zero-shot combination | Grammar, chemistry |

### Tier 2: Extended Primitives (VI-XV)

| # | System | What it Tests | Real-World Analogue |
|---|--------|--------------|---------------------|
| 06 | **Negation** | Mutual exclusion | Differential diagnosis |
| 07 | **Conditional Gates** | Boolean logic | Circuits, access control |
| 08 | **Analogy** | Proportional reasoning | IQ tests, metaphors |
| 09 | **Context Switching** | Context-dependent output | Polysemy, modes |
| 10 | **Chunking** | Sub-pattern recognition | Idioms, functions |
| 11 | **Reversibility** | Bidirectional inference | Encryption, translation |
| 12 | **Temporal Order** | Sequence sensitivity | Grammar, workflows |
| 13 | **Exceptions** | Default + override | Legal rules, OOP |
| 14 | **Interpolation** | Gap filling | Cloze tests, BERT |
| 15 | **Counting** | Threshold decisions | Rate limiting, voting |

### Tier 3: Meta-Cognitive (XVI-XX)

| # | System | What it Tests | Real-World Analogue |
|---|--------|--------------|---------------------|
| 16 | **Recursion** | Self-similar structures | Nested parens, fractals |
| 17 | **Inhibition** | Winner-take-all | Attention, elections |
| 18 | **Noise Robustness** | Partial matching | OCR, speech recognition |
| 19 | **Memory Decay** | Recency effects | Working memory, cache |
| 20 | **Transfer** | Domain adaptation | Second language, frameworks |

## Output: Cognitive Profile

After evaluation, you'll get a scorecard like:

```
╔═══════════════════════════════════════════════════════════════╗
║                    BSP COGNITIVE PROFILE                       ║
╠═══════════════════════════════════════════════════════════════╣
║ TIER 1: CORE PRIMITIVES                                        ║
║   Convergence           94.2%  ████████████████████░           ║
║   Divergence            87.5%  █████████████████░░░░           ║
║   ...                                                          ║
╠═══════════════════════════════════════════════════════════════╣
║ OVERALL SCORE: 77.3%                                           ║
║ STRENGTHS: Cycles, Convergence, Context Switching              ║
║ WEAKNESSES: Recursion, Transfer, Reversibility                 ║
╚═══════════════════════════════════════════════════════════════╝
```

## See Also

- [DS-019: Synthetic Cognitive Benchmarks](../../docs/specs/DS/DS-019-synthetic-evaluation.md) - Full specification
