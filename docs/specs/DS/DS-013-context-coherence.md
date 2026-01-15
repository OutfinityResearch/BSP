# DS-013: Context-Based Response Coherence (ConversationContext)

**Version**: 1.1  
**Status**: Implemented (v1) + Planned Improvements  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

BSP learns patterns and predicts likely next concepts, but a chat system requires **continuity across turns**:
- keep talking about the same topic unless the user shifts
- reuse relevant entities/keywords from earlier messages
- avoid “topic jumping” (random unrelated tokens)

This DS specifies a per-session `ConversationContext` that tracks:
1. recency-weighted tokens (short-term memory)
2. topic groups (group IDs with a decayed strength)
3. lightweight keywords (token-level salience across turns)

The context is used as a multiplier in candidate token scoring and influences seed selection for DS-009/DS-011 sequence generation.

---

## 2. Problem

Without context tracking, responses can lose continuity:

```
User: The detective examined the room.
BSP:  upon room it and of his

User: He found a clue.
BSP:  upon to and it of        <- lost "detective", "room"
```

The system has learned some relevant groups/tokens, but generation is not anchored to the conversation history.

---

## 3. Goals and Non-goals

### 3.1 Goals

1. Preserve topical continuity across 2–3 turns by default.
2. Provide a bounded-memory representation (fixed windows, decay, caps).
3. Keep scoring cheap (simple arithmetic; no expensive similarity search).
4. Make the mechanism serializable so sessions can be saved/restored.

### 3.2 Non-goals

1. Full entity tracking/coreference resolution.
2. Long-term memory across many sessions (that is a separate system concern).
3. Perfect discourse planning; this is a heuristic coherence layer.

---

## 4. Data Model

### 4.1 Turn

A “turn” is a single user message (or training input line). It has:
- tokens from `Tokenizer.tokenizeWords()`
- active groups returned by the engine
- optional importance (e.g. explicit feedback or higher weight)

### 4.2 Stored State (Per Session)

`ConversationContext` maintains:

- `recentTokens: string[]` (FIFO window)
- `tokenWeights: Map<string, number>` (recency-weighted token strength)
- `activeTopics: Map<number, number>` (groupId → strength)
- `keywords: Map<string, number>` (token → keyword score)
- `turnCount: number`

All maps are capped/decayed to keep memory bounded.

---

## 5. Update Rules

On each turn, we call:

```
context.addTurn(tokens, activeGroups, { importance })
```

Where `importance` defaults to 1.0 but can be increased for important messages.

### 5.1 Token Recency Weights

For token `t` at position `i` in a sentence of length `L`:

```
positionWeight(i, L) = 0.7 + 0.3 * (i / max(1, L-1))
tokenWeight(t) = importance * positionWeight(i, L)
```

Then:
- append tokens into a FIFO `recentTokens` window
- store the maximum observed weight for that token:
  ```
  tokenWeights[t] = max(tokenWeights[t], tokenWeight(t))
  ```

When tokens fall out of the FIFO window:
- reduce their weights (`weight *= 0.5`)
- delete tokens with very small weight (`<= 0.1`)

This creates a short-term memory that fades quickly but smoothly.

### 5.2 Topic Tracking (Group IDs)

When the engine activates groups for the turn, we boost topic strengths:

```
topicBoost(g) = (g.salience || 0.5) * importance
activeTopics[g.id] += topicBoost(g)
```

Then we decay topics:

```
activeTopics[id] *= topicDecay
delete if < 0.05
```

Finally, we cap to `maxTopics` by keeping only the strongest topics.

### 5.3 Keyword Tracking

Keywords are token-level signals that persist across turns longer than pure recency.

Update:
- for each token `t` with `len(t) >= 3`, do:
  ```
  keywords[t] += importance
  ```

Decay:
```
keywords[t] *= 0.9
delete if < 0.1
```

Cap:
- keep only the top-N keywords (implementation keeps up to ~50).

---

## 6. Scoring: How Context Influences Generation

Context is used in candidate token scoring (inside response generation).

### 6.1 Token Relevance

Token relevance combines recency and keyword score:

```
relevance(t) = tokenWeights[t] + 0.5 * keywords[t]
```

### 6.2 Candidate Score Multiplier

Given candidate token `t` coming from group `g`:

```
scoreCandidate(t, g) =
  (1 + relevance(t))
  * (1 + 0.5 * activeTopics[g])
  * keywordBoost(t)
```

Where `keywordBoost(t) = 1.2` if `t` is currently a keyword, otherwise `1.0`.

This multiplier is applied on top of base scores derived from:
- prediction score (`DeductionGraph` output)
- group salience
- semantic weighting (DS-012)

---

## 7. Interaction with DS-009 / DS-011

Context affects sequence generation in two ways:

1. **Candidate scoring**: context boosts certain tokens and topics so they rise to the top.
2. **Seed selection**: when choosing seed tokens for beam-search decoding, the generator can prefer tokens that are also context keywords.

The practical effect is:
- turn-to-turn continuity in output tokens
- reduced random drift into unrelated tokens

---

## 8. Integration in BSP

Relevant modules:
- `src/core/ConversationContext.mjs`
- `src/core/ResponseGenerator.mjs`
- `src/server/Server.mjs` (stores a context instance per session)

Serialization:
- `ConversationContext.toJSON()` / `ConversationContext.fromJSON()`

---

## 9. Example Behavior

Before:
```
User: The detective examined the room.
BSP:  upon room it and of his

User: He found a clue.
BSP:  upon to and it of
```

After:
```
User: The detective examined the room.
BSP:  evidence floor window careful

User: He found a clue.
BSP:  detective case mystery solved evidence
```

---

## 10. Success Metrics

1. **Topic persistence**: topic keywords appear across multiple turns when the user stays on the topic.
2. **Context relevance**: ≥ 30% of response tokens overlap with recent tokens/keywords (excluding stopwords).
3. **Reduced topic jumping**: fewer responses that contain no meaningful overlap with the last 1–2 turns.
4. **Bounded memory**: context state size stays under configured caps.

---

## 11. Planned Improvements

1. Use IDF-aware keyword selection (avoid promoting stopwords into `keywords`).
2. Tie context importance to reward/importance signals (DS-005), so important corrections persist longer.
3. Add a small “novelty penalty” so responses do not over-repeat the user’s last input (avoid echoing).
