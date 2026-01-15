# DS-009: Sequence-Aware Text Generation (Word-Order Model)

**Version**: 1.1  
**Status**: Implemented (v1)  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

BSP’s core engine predicts *sets* of likely concepts/tokens (via groups + deductions), but sets have no inherent order. Without an ordering mechanism, response generation degenerates into a bag-of-words output, even when the selected words are relevant.

This document specifies a lightweight, CPU-friendly word-order model (`SequenceModel`) that learns from observed word sequences and turns unordered candidate tokens into short, locally coherent phrases.

Related DS:
- DS-011 extends this with probabilistic decoding (beam search / Viterbi-like search).
- DS-012 and DS-013 influence which tokens become *seeds* for sequence generation (semantic weighting + conversation context).

---

## 2. Problem

Example failure mode (unordered output):

```
Input:  "The window was broken from inside."
Output: "upon window broken that and of in"
```

The output contains topical words but lacks:
- consistent word order (syntax)
- phrase boundaries
- avoidance of repetition/loops

---

## 3. Goals and Non-goals

### 3.1 Goals

1. Produce short sequences (typically 4–12 tokens) that are *more readable* than a bag of words.
2. Learn incrementally online from the same text stream used for BSP training (no offline parser required).
3. Keep runtime cost bounded and predictable (small branching factor, small beam, pruning).
4. Work as a plug-in: the engine can generate tokens from groups/predictions, and the sequence model orders them.

### 3.2 Non-goals

1. Full grammatical correctness or long-form generation.
2. Transformer-like global coherence; this is a local n-gram model.
3. Hardcoded templates. Output should be driven by learned transitions and scored candidates.

---

## 4. Definitions

- **Word token**: a normalized string produced by `Tokenizer.tokenizeWords(text)`.
- **Seed tokens**: a short list of tokens that should appear in the output if possible (high-scoring candidates; optionally constrained by context keywords).
- **Start token**: token observed at the beginning of an input sentence/line.
- **End token**: token observed at the end of an input sentence/line (used as a soft stop signal).
- **Bigram transition**: an observed adjacency `(w_t → w_{t+1})` in a token sequence.
- **Vocabulary size (V)**: number of unique tokens tracked by the sequence model.

---

## 5. Model: Bigram Transitions + Backoff

The sequence model is a first-order Markov model over word tokens.

### 5.1 Counts

Let:
- `c(w)` be the count of token `w` in the stream.
- `c(w, u)` be the count of the bigram `w → u`.

### 5.2 Unsmooothed Bigram Probability

```
P(u | w) = c(w, u) / c_out(w)
```

Where `c_out(w) = Σ_u c(w, u)` is the total number of outgoing transitions observed from `w`.

Implementation note: the current implementation uses a `tokenCounts` map as the denominator. This is close to `c_out(w)` but includes occurrences of `w` in last positions as well. It is “good enough” for a lightweight heuristic decoder, but if we want a more principled probability estimate, we should store `c_out(w)` explicitly.

### 5.3 Add-α Smoothing

To avoid zero probabilities and improve early-stage decoding:

```
P_α(u | w) = (c(w, u) + α) / (c_out(w) + α * V)
```

Where `α > 0` is typically small (e.g. `0.1`).

### 5.4 Unigram Backoff

When bigram evidence is missing, fall back to unigram frequency:

```
P_uni(u) = c(u) / Σ_v c(v)
```

Decoder behavior:
- Prefer `P_α(u|w)` when available.
- Use `P_uni(u)` when `P_α(u|w)` is near zero.

---

## 6. Learning (Online Updates)

### 6.1 Input

The training signal is the word sequence produced by `Tokenizer.tokenizeWords(text)`, not the hashed identity space used by the bitset encoder.

### 6.2 Updates Per Document

For a token sequence `w_0..w_{n-1}`:

1. Increment start token: `startTokens[w_0] += 1`
2. Mark end token: `endTokens.add(w_{n-1})`
3. For each adjacent pair `w_i → w_{i+1}`:
   - `c(w_i, w_{i+1}) += 1`
   - `c(w_i) += 1`
4. Increment the last token count `c(w_{n-1}) += 1`

### 6.3 Pruning Policy

To bound memory:
- Maintain `maxTransitions` and prune low-count transitions when total transitions exceed a threshold.
- The current implementation removes transitions with `count < 2`.

This makes the model resistant to one-off noise and typos but also means very new phrases may not be usable until repeated.

---

## 7. Decoding: From Candidates to a Sequence

Sequence generation is driven by:
1. A set of **seed tokens** (preferred content words).
2. The learned transition probabilities.
3. Heuristics to prevent degenerate loops and to bias topicality.

Two decoders exist:

### 7.1 Greedy Decoder (Temperature Sampling)

At each step, for current token `w_t`, consider the next-token candidates from the learned transition map.

For candidate `u`, compute a heuristic score:

```
score(u) = P(u | w_t) * seedBoost(u) * repeatPenalty(u)
```

Where:
- `seedBoost(u)` is a multiplicative boost if `u` is in `seedTokens`
- `repeatPenalty(u)` is a multiplicative penalty if `u` is already used in the sequence

Selection:
- Convert `score(u)` into sampling weights using temperature `T`:

```
weight(u) = score(u)^(1/T)
```

Lower `T` makes the output more deterministic (more grammatical but less diverse).

### 7.2 Beam Search Decoder (DS-011)

Beam search keeps multiple candidate sequences alive and selects the highest-scoring path under a log-probability score:

```
pathScore = Σ_t log(P_backoff(w_{t+1} | w_t)) + bonuses - penalties
```

Where (current implementation):
- `P_backoff = P_α` if available, otherwise unigram backoff
- `+ seedBonus` when a token is a seed (encourages topical inclusion)
- `- repeatPenalty` when a token repeats in the path
- When a node has no outgoing transitions, the decoder may jump to an unused seed with a fixed penalty

Beam search is the default in response generation because it reduces “garden path” failures of greedy decoding.

Stopping conditions:
- stop if the best path ends with an end token and has length ≥ 4
- stop at `maxLength` otherwise

---

## 8. Integration in BSP

### 8.1 Where It Learns

- `BSPEngine.process()` learns transitions on each input when `learn=true` by calling `sequenceModel.learn(wordTokens)`.

### 8.2 Where It Generates

The response generator:
1. Collects candidate tokens from predicted groups and active groups.
2. Applies semantic weighting (DS-012) and context scoring (DS-013).
3. Builds `seedTokens` from top content candidates (and optionally context keywords).
4. Generates ordered output with:
   - `SequenceModel.generateBeamSearch(seedTokens, ...)`
   - fallbacks when the model is not trained enough

Relevant modules:
- `src/core/SequenceModel.mjs`
- `src/core/ResponseGenerator.mjs`
- `tests/unit/sequence.test.mjs`

---

## 9. Configuration

### 9.1 Implemented Options (`SequenceModel`)

- `sequenceModel.maxTransitions` (number): transition cap (default `100000`)
- `sequenceModel.maxVocab` (number): token count cap for serialization (default `50000`)
- `sequenceModel.smoothing` (`"none"|"addAlpha"`): smoothing mode
- `sequenceModel.smoothingAlpha` (number): α for add-α smoothing

### 9.2 Recommended Options to Expose (Not Yet Plumbed)

These are hardcoded in the current generator and should become configuration flags:
- `sequence.maxLength`
- `sequence.beamWidth`
- `sequence.topTransitionsPerStep`
- `sequence.seedBonus`
- `sequence.repeatPenalty`
- `sequence.deadEndJumpPenalty`
- `sequence.minStopLength` (minimum length before honoring end tokens)

---

## 10. Metrics and Evaluation

### 10.1 Basic Quality Metrics

- **Average output length**: should converge to a target range (e.g. 4–12).
- **Repetition rate**: fraction of outputs containing repeated tokens; should be low.
- **Seed coverage**: fraction of seed tokens included; should be high when transitions exist.

### 10.2 Probabilistic Metrics

- **Average log-probability** of generated sequences under the model.
- **Dead-end rate**: how often generation terminates because a token has no outgoing transitions.

### 10.3 Human/Task-Level Metrics

- Readability (manual spot checks).
- Topical relevance (overlap with candidate tokens / predicted groups).

---

## 11. Risks and Failure Modes

1. **Early sparsity**: transitions are too sparse early on, causing short or incoherent sequences.
   - Mitigation: smoothing + backoff + candidate-based fallback generation.
2. **Looping/repetition**: common n-grams can trap the decoder in cycles.
   - Mitigation: repetition penalties; avoid selecting already used tokens.
3. **Over-bias to seeds**: strong seed boosts can make outputs repetitive.
   - Mitigation: tune seed bonus; consider diversity penalties.
4. **Tokenization mismatch**: tokens extracted from groups may not match `tokenizeWords()` outputs (e.g. underscores from n-grams).
   - Mitigation: normalize extracted tokens to the same scheme and avoid mixing incompatible token spaces.

---

## 12. Implementation Status and Next Steps

### 12.1 Implemented (as of this repo)

- [x] Online learning of bigram transitions from `Tokenizer.tokenizeWords()`
- [x] Greedy decoding with temperature (`SequenceModel.generate`)
- [x] Beam search decoding (`SequenceModel.generateBeamSearch`) used by the response generator
- [x] Serialization via `SequenceModel.toJSON()` / `SequenceModel.fromJSON()`

### 12.2 Planned Improvements

1. Track explicit `c_out(w)` separately for more correct probabilities.
2. Add additional smoothing/backoff schemes (Witten–Bell, Kneser–Ney) if needed (see DS-017).
3. Make decoding constants configurable and testable.
4. Add regression tests for repetition avoidance and end-token stopping behavior.
