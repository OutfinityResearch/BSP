# BSP Optimization Plan & Session Report

**Date**: 2026-01-16
**Status**: Active Development
**Focus**: Compression Efficiency & Scaling

---

## 1. Session Summary: What We Built

We successfully moved BSP from a static encoding model to a dynamic, procedural one.

### 1.1 DS-020: Adaptive Universe (Implemented)
- **Concept**: Instead of paying a fixed cost of `log₂(100,000) ≈ 16.6` bits for every surprise, we pay a cost based on the **observed vocabulary**.
- **Mechanism**: Added `vocabTracker` to `BSPEngine`.
- **Result**: Cost per bit dropped to ~10-11 bits in early training.

### 1.2 DS-021: Compression Machine (Implemented)
- **Concept**: A "Turing machine" for compression that finds algorithmic patterns in text.
- **Operators**:
  - `LITERAL`: Direct token encoding.
  - `COPY`: LZ77-style copying from context (great for narrative continuity).
  - `REPEAT`: Run-length encoding for patterns (great for repetition).
  - `TEMPLATE`: (Structure defined, learning logic pending).
- **Integration**: `BSPEngine` now competes Group-Based encoding vs. Program-Based encoding and picks the winner per line.

### 1.3 Results
- **Quick Test (1000 lines)**:
  - BPC: **2.27** (vs Gzip 2.41)
  - **PASSED**: We beat Gzip by 5.9%.
- **Full Test (5000 lines)**:
  - BPC: **2.79** (vs Gzip 2.41)
  - **FAILED**: Performance degraded with more data.

---

## 2. The Scaling Problem (Root Cause Analysis)

Why did performance drop when training on more data?

### 2.1 The Vocabulary Explosion
The current `Tokenizer` generates n-grams (unigrams, bigrams, trigrams).
- Input: "The cat sat"
- Tokens: `["the", "cat", "sat", "the_cat", "cat_sat", "the_cat_sat"]`

As we process more text, the number of unique n-grams grows rapidly.
- 1000 lines ≈ 2,000 unique tokens → Cost ~11 bits
- 5000 lines ≈ 4,500 unique tokens → Cost ~13.5 bits

### 2.2 Contaminated Compression Cost
The `CompressionMachine` was using the engine's global universe size (inflated by n-grams) to calculate the cost of `LITERAL` operations.
- Ideally, `LITERAL("cat")` should cost `log₂(word_count)`.
- Currently, it costs `log₂(ngram_count)`.

Since n-gram count is 3-4x larger than word count, we are overpaying for every literal token.

---

## 3. Detailed Optimization Plan

### Phase 1: Decouple Vocabularies (IMMEDIATE PRIORITY)
**Goal**: Reduce the cost base for the Compression Machine.

1.  **Separate Word-Level Vocab**: 
    - Keep `BSPEngine` using n-grams for Group detection (good for semantic meaning).
    - Make `CompressionMachine` use *only* unique unigrams (words) for cost calculation.
    - *Status*: Started in `CompressionMachine.mjs`, needs to be finalized in `_tryRepeatEncoding` and `_tryTemplateEncoding`.

2.  **Expected Impact**: 
    - `log₂(1000 words)` ≈ 10 bits.
    - `log₂(4500 n-grams)` ≈ 12.2 bits.
    - Immediate ~15-20% reduction in program costs.

### Phase 2: Activate Template Learning
**Goal**: Capture structural redundancy ("The [X] is [Y]").

1.  **Implement `learnTemplates`**:
    - Analyze the `vocabTracker` or `replayBuffer`.
    - Find sequences with high Edit Distance similarity.
    - Extract fixed skeletons and variable slots.
2.  **Enable `TEMPLATE` operator**:
    - Allow the machine to reference these templates.

### Phase 3: Algorithmic Optimization
**Goal**: Speed up the `COPY` operator (currently O(N*M)).

1.  **Suffix Array / Suffix Tree**:
    - Instead of linear scan for COPY matches, build a suffix structure on the `contextTokens`.
    - Allows finding the longest match in O(log N).

---

## 4. Strategy & Approach

1.  **Fix the Math First**: Finish Phase 1 (Word Vocab). If the cost model is wrong, advanced features won't help. We need accurate pricing for `LITERAL` ops to know when `COPY` is actually better.
2.  **Verify on Benchmark**: Re-run the 5000-line benchmark immediately after Phase 1. If we get close to 2.41 BPC, we are on the right track.
3.  **Iterate on Structure**: Only after the math is fixed, move to Template Learning. Templates are powerful but add overhead; they only pay off if the basic encoding is solid.

---

## 5. Key Insights from this Session

1.  **Procedural > Set-Based**: For raw compression, describing *how* to generate the string (Program) is often cheaper than describing *what* it contains (Groups).
2.  **Hybrid is Essential**: 
    - Groups are still better for "surprising" semantic content (novel combinations).
    - Programs are better for repetitive or structural content.
    - The `Math.min(groupCost, programCost)` approach is the winning architecture.
3.  **Context is King**: The `COPY` operator provided the massive gains in specific examples (94% savings). Maximizing the use of context is the path to beating Gzip consistently.

---

**Next Immediate Step**: Finish replacing `this.vocabSize` with `effectiveVocab` in the remaining methods of `CompressionMachine.mjs`.
