# DS-015: Conversational Training Data & Feedback Loop

**Version**: 1.1  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

General language-modeling corpora help BSP bootstrap language patterns, but a usable chat system requires additional structure around turn-taking, constraints, and feedback.

This DS defines practical data formats and a training loop that connects:
- `engine.process(...)` (online learning and reward ingestion)
- `DeductionGraph` (cross-turn transition learning)
- reward/importance modulation (DS-005)

---

## 2. Problem

General LM corpora (PTB/WikiText) help bootstrap language patterns, but they are insufficient for:

- turn-taking (user/assistant role structure)
- instruction following (format constraints, style constraints)
- preference learning (explicit/implicit feedback)

To build a usable conversational system, we need targeted conversational data and a feedback-driven training loop.

---

## 3. Goals and Non-goals

### 3.1 Goals

1. Provide a training data format that is easy to generate, version, and stream.
2. Enable multi-turn learning of stable conversational “chains” via deductions:
   - user intent → assistant behavior
   - correction → improved behavior
3. Support reward and importance signals without requiring a separate RL framework.

### 3.2 Non-goals

1. Full “SFT on tokens” training like transformer models; BSP learns via groups/deductions.
2. A single dataset that solves all alignment; we aim for a practical starting point.

---

## 4. Definitions

- **Conversation**: an ordered list of turns sharing a `conversation_id`.
- **Turn**: `{ role, content }`, where `role ∈ {user, assistant}`.
- **Episode**: a training unit. In this DS, an episode is typically one conversation (but could be a window of turns).
- **Feedback event**: a record that attaches a preference signal to a specific assistant turn (rating, reward, comment).
- **Reward**: numeric scalar passed as `reward` into `engine.process(...)`. Recommended range: `[-1, +1]`.
- **Role marker**: a deterministic token inserted into the text stream to make role conditioning learnable (see §7).
- **Correction turn**: a user message indicating the assistant response was wrong, followed by a corrected assistant response.

---

## 5. Data Formats

The recommended storage format is JSONL to support streaming and easy splitting/versioning.

### 5.1 Dialogue JSONL (recommended)

One JSON object per line:

```json
{
  "conversation_id": "c_001",
  "turns": [
    {"role": "user", "content": "Explain binary search."},
    {"role": "assistant", "content": "Binary search works on sorted arrays..."}
  ],
  "tags": ["instruction", "cs"],
  "quality": 0.9
}
```

Notes:
- Keep `turns` as the canonical source of text.
- Keep `tags` and `quality` optional; they are useful for filtering and curriculum sampling.

### 5.2 Feedback/Preference Events (optional)

```json
{"conversation_id":"c_001","turn_index":1,"rating":1,"reward":0.8,"comment":"Helpful"}
```

Interpretation:
- `turn_index` references the index within `turns` (0-based or 1-based, but pick one and keep it consistent).
- `rating` is a discrete preference label (e.g. `-1/0/+1`) suitable for UI ingestion.
- `reward` is an optional continuous value. If present, it should be used directly as the engine reward.

### 5.3 Joining Feedback to Turns

To feed feedback into training:

1. Load a conversation episode.
2. Join feedback events by `(conversation_id, turn_index)`.
3. For assistant turns:
   - if `reward` exists, use it
   - else map `rating` → `reward` using a fixed mapping (example below)

A simple mapping:

```
rating = +1 → reward = +0.8
rating =  0 → reward =  0.0
rating = -1 → reward = -0.8
```

The absolute scale should be kept small and stable because reward influences importance modulation and salience updates in `BSPEngine`.

---

## 6. Training Policy

### 6.1 How to Feed Turns Into BSP (Core Loop)

Recommended processing order:

1. Reset context between conversations to avoid cross-conversation leakage.
2. Process turns in order, using `learn=true`.
3. Apply reward primarily on assistant turns.

Minimal pseudocode:

```js
engine.resetContext();
for (const turn of episode.turns) {
  const reward = turn.role === "assistant" ? rewardForTurn(turn) : 0;
  engine.process(turnTextWithRoleMarker(turn), { learn: true, reward });
}
```

Notes:
- Keeping context across turns is essential: it is the mechanism by which `Learner.updateDeductions(...)` learns cross-turn transitions (DS-004).
- If you process a *window* of turns as an episode, reset context at the window boundary.

### 6.2 Two-Stage Bootstrap (Practical Curriculum)

1. **Conversation pass (no reward, or small uniform reward)**
   - Teach stable role-conditioned patterns: asking questions, giving answers, formatting responses.
2. **Feedback shaping (reward-driven)**
   - Use explicit feedback events to increase learning pressure on helpful behaviors (DS-005).

This is not “full RL”: it is a pragmatic way to exploit `reward` and replay/consolidation to bias the online learner.

### 6.3 RL Pressure and Importance

`BSPEngine` supports a tunable RL pressure parameter (`engine.setRLPressure(rho)`, where `rho ∈ [0, 1]`) that changes how strongly reward affects the effective importance.

Practical guidance:
- `rho ≈ 0.0` during early bootstrap (learn mostly from novelty)
- `rho ≈ 0.3–0.7` during feedback shaping (reward matters)

If needed, training scripts may set `importanceOverride` to stabilize learning rate across datasets, but this should be done intentionally because it bypasses novelty-driven adaptation.

---

## 7. Role Conditioning (Recommended)

`engine.process(text)` learns from tokenized text. If “user” and “assistant” turns are indistinguishable at the token level, the system must infer roles implicitly, which is unnecessarily hard and unstable.

Recommended approaches (planning):

### 7.1 Preferred: Marker Tokens (String-Level)

Prefix a reserved marker token to every turn:
- `bsp_user` for user turns
- `bsp_assistant` for assistant turns

The simplest implementation is to prefix the raw text:

```text
bsp_user Explain binary search.
bsp_assistant Binary search works on sorted arrays...
```

This ensures the role marker appears as a distinct token under `Tokenizer.tokenizeWords(...)`, allowing role-dependent patterns and deductions to form.

### 7.2 Alternative: Natural Prefixes (Lower Effort, Less Clean)

Prepend `User:` / `Assistant:` to the raw text and rely on tokenization.

This is less robust because:
- punctuation is normalized/stripped
- tokens like `user` and `assistant` can collide with normal content

For now, datasets should store `role` explicitly, even if the training script chooses a simpler encoding.

---

## 8. What Data to Add (High-Value Categories)

### 8.1 Instruction Following with Constraints

- short instructions with constraints: “return JSON”, “list steps”, “write an email”
- correction turns: “No, you must output valid JSON” + corrected assistant answer

### 8.2 Tool-like Dialogues (Simulated)

- structured “command → output” patterns
- helps reliability of formatted outputs and multi-step tasks

### 8.3 Multilingual Inputs (Optional)

If the system must operate in multiple languages (e.g., Romanian + English), add conversational examples in the target language(s) as *user inputs*. Keep datasets and metadata consistently structured; do not mix languages inside schema keys or control tokens.

---

## 9. Evaluation

Recommended evaluation should cover both coherence and controllability.

- multi-turn coherence on a fixed conversation set
- positive-feedback rate on preference dataset
- reduced input echo rate (less repetition)

Additional concrete checks:
1. **Constraint adherence rate**: for “return JSON”, compute the percentage of responses that parse as JSON.
2. **Correction learning**: measure whether negative feedback reduces repetition of the corrected behavior.
3. **Topic continuity**: measure overlap with context keywords (DS-013) over 2–3 turns.

---

## 10. Implementation Plan (For Development Planning)

1. Add a training script mode for JSONL dialogues:
   - stream turns
   - inject role markers
   - call `engine.process(turnText, { reward, learn: true })`
2. Add a feedback ingestion step:
   - join feedback events to turns
   - map `rating` and `reward` to the engine’s `reward` parameter
3. Add evaluation harness:
   - constraint adherence tests
   - coherence tests on fixed prompts
