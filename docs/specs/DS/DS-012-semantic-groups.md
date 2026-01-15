# DS-012: Semantic Group Specialization (IDF + Stopword Handling)

**Version**: 1.1  
**Status**: Implemented (IDF tracking + semantic weighting) + Planned Improvements  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

BSP’s group learning is driven by co-occurrence in a sparse identity space. In natural language, a large fraction of tokens are extremely frequent (“stopwords”), and without explicit handling they dominate:
- group membership
- candidate retrieval
- generated responses (generic filler tokens)

This DS introduces an **IDFTracker** that estimates token specificity online, enabling:
1. stopword detection
2. content-word preference in response generation
3. optional subsampling of very frequent tokens during feature extraction (reduces wasted work)

---

## 2. Problem

Example of overly generic groups (mostly stopwords / function words):

```
G0: and, to, was, my, i, the, had, with, she, in...
G1: and, to, was, my, i, the, had, in, of, it...
```

Desired behavior: emphasize content-bearing tokens:

```
G_nautical: ship, captain, sail, ocean, deck, crew, voyage
G_mystery:  detective, clue, evidence, mystery, case, solve
```

---

## 3. Definitions

### 3.1 Document Frequency

Define a “document” as a single training input (line/turn). For token `t`:
- `DF(t)` = number of documents that contain `t`
- `N` = number of documents seen so far

### 3.2 IDF (Inverse Document Frequency)

The implementation uses a numerically stable form:

```
IDF(t) = log((N + 1) / (DF(t) + 1))
```

Properties:
- higher IDF = rarer/more specific token
- lower IDF = more common token

### 3.3 Stopwords

A token is treated as a stopword when:

```
DF(t) / N > τ_stop
```

Where `τ_stop` is a configurable threshold (default in code: `0.25`).

### 3.4 Purity (Lightweight)

The current “purity” proxy is the ratio of content words:

```
purity(tokens) = |{t : t is content}| / |tokens|
```

This is intentionally simple and cheap. A weighted purity (using IDF magnitudes) is a planned improvement.

---

## 4. Design: Online IDF Tracking

### 4.1 Data Structures

The IDF tracker stores:
- `documentCount = N`
- `tokenDocCounts[t] = DF(t)`

It updates with **unique tokens per document** (set semantics), which makes DF meaningful.

### 4.2 Update Rule

For each training input:
1. tokenize text into word tokens
2. compute `uniqueTokens = Set(tokens)`
3. increment `DF(t)` for all `t ∈ uniqueTokens`
4. increment `N`

Periodic pruning:
- keep the map size under a cap (`maxVocab`)
- remove extremely rare tokens (implementation keeps tokens that appear in at least 2 documents)

---

## 5. How It Is Used in BSP

### 5.1 During Training / Processing

`BSPEngine.process(text, { learn=true })` updates IDF early:
- it calls `idfTracker.update(new Set(wordTokens))`

This makes IDF available both for response generation and for optional token subsampling.

### 5.2 Semantic Weighting in Response Generation

When scoring candidate tokens for response generation:
- content words (non-stopwords) are boosted
- stopwords are still allowed (they are useful for grammar/order), but they are not preferred as the main semantic payload

This improves outputs from:
```
and to was in of ...
```
to:
```
detective evidence clue ...
```

### 5.3 Subsampling Very Frequent Tokens (Optional)

Feature extraction can waste time on extremely frequent tokens that match many groups.

When enabled, the engine uses a Mikolov-style subsampling rule with document frequency as a proxy:

```
keepProb(t) = min(1, sqrt(T / f(t)))
```

Where:
- `f(t) = DF(t) / N`
- `T` is a small constant (e.g. `1e-3`)

This is applied only for encoding/features, not for sequence learning.

---

## 6. Implementation Details (Current Code)

The implementation is in:
- `src/core/IDFTracker.mjs`
- integrated in `src/core/BSPEngine.mjs`
- used by `src/core/ResponseGenerator.mjs`

Key methods:
- `update(tokens)`
- `getIDF(token)`
- `getDocFrequencyRatio(token)`
- `isStopword(token)` / `isContentWord(token)`
- `computePurity(tokens)`
- `toJSON()` / `fromJSON()`

---

## 7. Configuration

### 7.1 Implemented Options

IDF tracker:
- `idfTracker.stopwordThreshold` (default `0.25`)
- `idfTracker.maxVocab` (default `100000`)

Tokenizer / encoding:
- `tokenizer.subsampleHotTokens` (boolean)
- `tokenizer.subsampleT` (number, default `1e-3`)

### 7.2 Planned Options

- `idf.minDocsForStopword` (stabilize early estimates)
- weighted purity thresholds for “content-rich group” detection
- tying IDF into group creation/splitting decisions (see below)

---

## 8. Planned Improvements (For Development Planning)

1. **Weighted purity**
   - Current purity is unweighted; a group with many medium-frequency tokens can look “pure” even if not informative.
   - Proposed:
     ```
     purity_w = Σ_{t∈content} IDF(t) / Σ_{t∈all} IDF(t)
     ```

2. **IDF-aware group creation**
   - Prefer seeding new groups from content identities, not stopword-heavy inputs.

3. **IDF-aware consolidation**
   - During DS-010 merges, require overlap in high-IDF tokens to avoid merging broad but distinct concepts.

---

## 9. Success Metrics

1. **Response content ratio**: > 60% of response tokens are content words on representative prompts.
2. **Stopword dominance reduction**: fewer top-salience groups dominated by stopwords.
3. **Compute efficiency**: reduced candidate explosion when subsampling is enabled.
4. **Stability**: no major regression in surprise-rate metrics after enabling content weighting.
