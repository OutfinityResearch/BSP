# DS-008: Benchmarks and Comparative Evaluation

**Version**: 3.0  
**Status**: Active  
**Author**: BSP Team  
**Date**: 2026-01-16

---

## 1. Purpose

This document defines the benchmark strategy for BSP (Bitset System for Prediction). The goal is to answer one question:

> **Is BSP a viable alternative to standard neural language models on CPU?**

We are NOT trying to beat GPT-4. We are trying to prove that the BSP architecture offers a meaningful trade-off (efficiency vs. quality) compared to a Transformer of equivalent size, on CPU.

---

## 2. The "Triangle" Evaluation Framework

We validate BSP across three orthogonal dimensions:

```
                    ┌─────────────────────┐
                    │  A. EMERGENCE       │
                    │  (TinyStories)      │
                    │  "Does it learn?"   │
                    └─────────┬───────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
   ┌──────────▼──────────┐         ┌──────────▼──────────┐
   │  B. COMPETENCE      │         │  C. EFFICIENCY      │
   │  (BLiMP)            │         │  (CPU Throughput)   │
   │  "Does it reason?"  │         │  "Is it faster?"    │
   └─────────────────────┘         └─────────────────────┘
```

| Vertex | Dataset | Question Answered | Key Metric |
|--------|---------|-------------------|------------|
| **A** | TinyStories | Can BSP model coherent text? | Perplexity (PPL) |
| **B** | BLiMP | Does BSP learn grammar rules? | Accuracy (%) |
| **C** | (same data) | Is BSP faster than a Transformer? | Tokens/sec, Memory |

---

## 3. The Apples-to-Apples Baseline

Comparing BSP to a pre-trained GPT-2 (124M params, trained on 40GB) is unfair. Instead, we train a **Control Model** from scratch under identical conditions.

### 3.1 Control Model: TinyTransformer

A minimal Transformer Decoder (e.g., NanoGPT) trained on the same data as BSP.

| Constraint | Value |
|------------|-------|
| Tokenizer | Shared (GPT-2 BPE or custom) |
| Parameters | 1M - 10M (to match BSP memory footprint) |
| Context Window | 256 tokens |
| Training Data | TinyStories (1 epoch, ~2M tokens) |
| Hardware | **CPU only** (no GPU) |

### 3.2 Why This Matters

- **Same data**: No advantage from pre-training.
- **Same size**: Fair comparison of learning efficiency.
- **Same hardware**: Proves CPU viability.

---

## 4. Datasets

### 4.1 Training: TinyStories

| Property | Value |
|----------|-------|
| Source | `huggingface.co/datasets/roneneldan/TinyStories` |
| Size | ~2GB text (~500M tokens) |
| Subset Used | First 2M tokens (configurable) |
| Why | Designed to show coherence in small models |

### 4.2 Evaluation: BLiMP

| Property | Value |
|----------|-------|
| Source | `huggingface.co/datasets/blimp` |
| Format | Minimal pairs (correct vs. incorrect sentence) |
| Size | 67 sub-tasks, ~1000 examples each |
| Why | Tests grammar without generation |

**Example (Subject-Verb Agreement):**
```
Correct:   "The dogs run quickly."      → P = 0.85
Incorrect: "The dogs runs quickly."     → P = 0.12
Result:    P(correct) > P(incorrect)    → ✓ Pass
```

### 4.3 Legacy: WikiText-2

| Property | Value |
|----------|-------|
| Purpose | Backward compatibility with literature |
| When | Only after passing TinyStories/BLiMP tests |

---

## 5. Success Criteria

BSP is considered viable if it achieves **at least one** of the following:

### Scenario A: Efficiency Win
- Perplexity: Within ±15% of Control
- BLiMP: Within ±5% of Control
- **Throughput: >2x Control** (tokens/sec on CPU)
- **Memory: <50% of Control**

### Scenario B: Quality Win
- **Perplexity: Better than Control**
- **BLiMP: Better than Control**
- Throughput: At least 0.5x Control

### Scenario C: Failure
- Throughput: High
- Perplexity/BLiMP: Significantly worse than Control (>30% gap)
- **Verdict**: Architecture needs rethinking.

---

## 6. File Structure

```
evals/
├── lm_comparative/              # THIS SPEC (DS-008)
│   ├── benchmark.mjs            # Main benchmark runner
│   ├── train_bsp.mjs            # Train BSP on TinyStories
│   ├── train_control.mjs        # Train TinyTransformer (Python)
│   ├── eval_blimp.mjs           # BLiMP evaluation
│   ├── data/                    # Downloaded datasets
│   │   ├── tinystories/
│   │   └── blimp/
│   └── results/                 # JSON reports
│       └── report_YYYYMMDD.json
│
└── abstract_primitives/         # DS-019 (Cognitive Primitives)
    ├── 01_convergence/
    ├── ...
    └── evaluate.mjs
```

---

## 7. Commands (How to Run)

### Step 1: Download Data
```bash
node evals/lm_comparative/download.mjs --dataset=tinystories
node evals/lm_comparative/download.mjs --dataset=blimp
```

### Step 2: Train Control Model (Python)
```bash
# Requires: pip install torch transformers
python evals/lm_comparative/train_control.py \
  --data=evals/lm_comparative/data/tinystories/train.txt \
  --output=evals/lm_comparative/models/control.pt \
  --params=5M \
  --device=cpu
```

### Step 3: Train BSP
```bash
node evals/lm_comparative/train_bsp.mjs \
  --data=evals/lm_comparative/data/tinystories/train.txt \
  --output=evals/lm_comparative/models/bsp.json
```

### Step 4: Evaluate Both
```bash
node evals/lm_comparative/benchmark.mjs --all
```

### Step 5: View Report
```bash
cat evals/lm_comparative/results/report_latest.json
```

---

## 8. Metrics Collected

| Metric | Description | Unit |
|--------|-------------|------|
| `ppl_tinystories` | Perplexity on TinyStories test set | Float |
| `blimp_accuracy` | Average accuracy across BLiMP tasks | % |
| `train_throughput` | Training speed | tokens/sec |
| `infer_throughput` | Inference speed | tokens/sec |
| `memory_peak` | Peak memory usage | MB |
| `model_size` | Serialized model size | MB |

---

## 9. Report Format

The benchmark produces a JSON report:

```json
{
  "timestamp": "2026-01-16T10:30:00Z",
  "config": {
    "train_tokens": 2000000,
    "context_length": 256
  },
  "results": {
    "control": {
      "ppl_tinystories": 28.4,
      "blimp_accuracy": 0.62,
      "train_throughput": 120,
      "infer_throughput": 450,
      "memory_peak": 1200
    },
    "bsp": {
      "ppl_tinystories": 31.2,
      "blimp_accuracy": 0.58,
      "train_throughput": 890,
      "infer_throughput": 2100,
      "memory_peak": 340
    }
  },
  "verdict": "EFFICIENCY_WIN"
}
```

Human-readable summary is also generated:

```
╔═══════════════════════════════════════════════════════════════╗
║              BSP vs CONTROL BENCHMARK REPORT                   ║
╠═══════════════════════════════════════════════════════════════╣
║ Metric              │ Control │ BSP     │ Delta   │ Winner    ║
╠═════════════════════╪═════════╪═════════╪═════════╪═══════════╣
║ Perplexity          │ 28.4    │ 31.2    │ +9.9%   │ Control   ║
║ BLiMP Accuracy      │ 62%     │ 58%     │ -6.5%   │ Control   ║
║ Train Speed (tok/s) │ 120     │ 890     │ +642%   │ BSP ✓     ║
║ Infer Speed (tok/s) │ 450     │ 2100    │ +367%   │ BSP ✓     ║
║ Memory (MB)         │ 1200    │ 340     │ -72%    │ BSP ✓     ║
╠═══════════════════════════════════════════════════════════════╣
║ VERDICT: EFFICIENCY WIN                                        ║
║ BSP is 7x faster with 3.5x less memory, at ~10% quality cost. ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## 10. Current State vs. Target

| File | Status | Action Needed |
|------|--------|---------------|
| `evals/lm_comparative/benchmark.mjs` | Exists (legacy) | Refactor to match this spec |
| `evals/lm_comparative/download.mjs` | Missing | Create |
| `evals/lm_comparative/train_bsp.mjs` | Missing | Create |
| `evals/lm_comparative/train_control.py` | Missing | Create |
| `evals/lm_comparative/eval_blimp.mjs` | Missing | Create |

---

## 11. References

- TinyStories: Eldan & Li, 2023. "TinyStories: How Small Can Language Models Be and Still Speak Coherent English?"
- BLiMP: Warstadt et al., 2020. "BLiMP: The Benchmark of Linguistic Minimal Pairs for English"
- lm-evaluation-harness: EleutherAI, github.com/EleutherAI/lm-evaluation-harness