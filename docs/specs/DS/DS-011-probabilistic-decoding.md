# DS-011: Probabilistic Decoding (Beam Search / Viterbi-like)

**Version**: 1.0  
**Status**: Implemented (token-level) + Planned Improvements  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

DS-009 introduces a bigram word-order model, but a purely greedy decoder is prone to “garden path” failures: it can choose a locally good token that leads to a dead end or forces incoherent continuation.

This DS specifies a probabilistic decoder that approximates the globally best sequence using **beam search**, which is a practical, bounded-cost approximation to Viterbi-style decoding for Markov models.

This idea appears in two places in BSP:
- **Token-level decoding** (SequenceModel): beam search over word sequences.
- **Group-level prediction** (DeductionGraph): multi-hop expansion already prunes to a beam (`beamWidth`) at each depth.

---

## 2. Problem

Greedy decoding is local:
- it picks the next token/group based only on immediate score
- it does not consider whether that choice leads to a good continuation

Common failure modes:
1. **Dead ends**: the chosen token has no learned outgoing transitions.
2. **Local traps**: the decoder enters repetitive loops due to high-probability cycles.
3. **Topic loss**: the decoder drifts away from the intended “seed” tokens.

---

## 3. Objective: Best Sequence Under a Scoring Function

We want to find a sequence `w_0..w_T` that is both:
- probable under the learned transition model
- aligned with the content we want to express (seed tokens)

### 3.1 Base Probabilistic Model

From DS-009, the bigram model provides (smoothed) probabilities:

```
P_backoff(w_{t+1} | w_t)
```

### 3.2 Augmented Path Score

We maximize a log-score that combines probability and heuristics:

```
Score(w_0..w_T) =
  Σ_{t=0..T-1} log(P_backoff(w_{t+1} | w_t) + ε)
  + λ_seed * Σ_t I[w_t ∈ seeds]
  - λ_rep  * Σ_t I[w_t repeats in path]
  - λ_jump * (# of dead-end seed jumps)
```

Where:
- `ε` avoids `log(0)` in practice
- `I[·]` is an indicator function
- `λ_*` are tunable constants (currently hardcoded in the implementation)

This is not a strict HMM emission model; it is a pragmatic objective designed for bounded-cost decoding in a chat-like setting.

---

## 4. Algorithm: Beam Search (Viterbi-like)

Beam search maintains the top `K` partial paths at each step and expands them by considering likely next tokens.

```typescript
function beamDecode(seedTokens, options): string[] {
  const {
    maxLength = 12,
    beamWidth = 5,
    topTransitionsPerStep = 10,
  } = options;

  const start = selectStart(seedTokens);
  let beam = [{ tokens: [start], score: 0 }];

  for (let step = 0; step < maxLength; step++) {
    const expanded = [];

    for (const path of beam) {
      const last = path.tokens[path.tokens.length - 1];

      if (isEndToken(last) && path.tokens.length >= 4) {
        expanded.push(path); // completed path
        continue;
      }

      const next = getNextCandidates(last).slice(0, topTransitionsPerStep);

      if (next.length === 0) {
        // dead end: optionally jump to an unused seed with a penalty
        expanded.push({ tokens: path.tokens, score: path.score - 2.0 });
        continue;
      }

      for (const cand of next) {
        const logP = Math.log(pBackoff(last, cand.token) + 1e-10);
        const bonus = seedTokens.includes(cand.token) ? 2.0 : 0.0;
        const rep = path.tokens.includes(cand.token) ? 3.0 : 0.0;

        expanded.push({
          tokens: [...path.tokens, cand.token],
          score: path.score + logP + bonus - rep,
        });
      }
    }

    expanded.sort((a, b) => b.score - a.score);
    beam = expanded.slice(0, beamWidth);

    if (beam[0] && isEndToken(beam[0].tokens.at(-1)) && beam[0].tokens.length >= 4) {
      break;
    }
  }

  return beam[0]?.tokens || [];
}
```

Key properties:
- bounded compute: `O(maxLength * beamWidth * topTransitionsPerStep)`
- robustness to local traps: multiple continuations survive until disambiguated
- controllable behavior via beam size and heuristics

---

## 5. Integration in BSP

### 5.1 Token-Level Decoding (Implemented)

The current implementation lives in `SequenceModel.generateBeamSearch(...)` and is used by the response generator. It combines:
- smoothed bigram probabilities (`addAlpha`)
- unigram backoff
- seed boosts, repetition penalties, and dead-end jumps

Relevant modules:
- `src/core/SequenceModel.mjs`
- `src/core/ResponseGenerator.mjs`

### 5.2 Group-Level Prediction (Already Beam-Limited)

`DeductionGraph.predictMultiHop(...)` expands multi-hop deductions and prunes to a `beamWidth` at each depth. This is structurally similar to beam search, but operates over groups rather than tokens.

Relevant module:
- `src/core/DeductionGraph.mjs`

---

## 6. Configuration

### 6.1 Currently implemented knobs

Token-level:
- `SequenceModel.generateBeamSearch({ beamWidth, maxLength, preferSeeds })`
- `SequenceModel.smoothing`, `SequenceModel.smoothingAlpha`

Group-level:
- `DeductionGraph.predictMultiHop({ maxDepth, beamWidth, depthDecay })`

### 6.2 Planned knobs (to make behavior controllable)

Token-level:
- `sequence.topTransitionsPerStep`
- `sequence.seedBonus`
- `sequence.repeatPenalty`
- `sequence.deadEndJumpPenalty`
- `sequence.minStopLength`

Group-level:
- `deduction.maxDepth` / `deduction.beamWidth` / `deduction.depthDecay` (as engine config)

---

## 7. Expected Impact

- Eliminates "dead ends" in generation.
- Produces globally coherent sentences.
- Allows for "backtracking" logic implicitly (by keeping multiple paths alive).

---

## 8. Risks and Open Questions

1. **Beam collapse**: if the beam is too small, decoding becomes almost greedy again.
2. **Heuristic dominance**: large seed bonuses can override probability.
3. **Probability calibration**: current bigram probability normalization is approximate (see DS-009 note).
4. **Mismatch between token sources**: candidates extracted from groups may not match sequence-model tokens; normalization must be consistent.

Planned improvements:
- unify token normalization between `Tokenizer.tokenizeWords()` and group token extraction
- expose heuristics as config and add tests that lock in intended behavior
