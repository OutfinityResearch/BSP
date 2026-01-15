# DS-015: Conversational Training Data & Feedback Loop

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

General language-modeling corpora help BSP bootstrap language patterns, but a usable chat system requires additional structure:
- role conditioning (user vs assistant)
- instruction following under constraints (format, style, “do X, not Y”)
- preference learning from explicit and implicit feedback

This DS defines practical data formats and a training loop that connects:
- `engine.process(...)` (online learning)
- `DeductionGraph` (cross-turn transitions)
- RL/importance signals (DS-005)

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

## 4. Data Formats

### 2.1 Dialogue JSONL (recommended)

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

### 2.2 Feedback/Preference Events (optional)

```json
{"conversation_id":"c_001","turn_index":1,"rating":1,"reward":0.8,"comment":"Helpful"}
```

---

## 5. Training Policy

### 3.1 Two-Stage Bootstrap

1. **Conversation SFT-style pass (no reward):**
   - Learn stable patterns of role-conditioned language and task structure.
2. **RL shaping (with reward):**
   - Use explicit/implicit feedback (DS-005) to update salience and prioritize replay consolidation.

### 3.2 How to Feed Turns Into BSP

For each conversation turn:

- `process(user_turn, learn=true, reward=0)`
- `process(assistant_turn, learn=true, reward=+0.1 default)` (or reward from feedback)
- Update inter-turn deductions:
  - previous active groups → current active groups

This creates stable conversational chains in the DeductionGraph.

---

## 6. Making Roles Explicit (Recommended)

BSP’s core `process(text)` does not currently encode role explicitly. For role conditioning we should introduce a deterministic role marker so the engine can learn different patterns for user vs assistant turns.

Recommended approaches (planning):

1. **Prefix tokens (string-level)**
   - Add a reserved marker token at the beginning of each turn:
     - `bsp_user` for user turns
     - `bsp_assistant` for assistant turns
   - Then encode from tokens:
     - `encodeFromTokens([roleToken, ...tokenizeWords(content)])`

2. **Text prefix (lowest effort, less clean)**
   - Prepend `User:` / `Assistant:` to the raw text and rely on tokenization.
   - This is less robust because punctuation is stripped and the markers can collide with natural text.

For now, datasets should store `role` explicitly, even if the training script chooses a simpler encoding.

---

## 7. What Data to Add

### 4.1 Instruction Following

- short instructions with constraints: “return JSON”, “list steps”, “write an email”
- correction turns: “No, you must output valid JSON” + corrected assistant answer

### 4.2 Tool-like Dialogues (simulated)

- structured “command → output” patterns
- helps reliability of formatted outputs and multi-step tasks

### 4.3 Mixed Romanian/English Inputs (if desired)

If the system must operate in Romanian, add conversational examples in Romanian as *user inputs* while keeping stored artifacts in English.

---

## 8. Evaluation

Recommended evaluation should cover both coherence and controllability.

- multi-turn coherence on a fixed conversation set
- positive-feedback rate on preference dataset
- reduced input echo rate (less repetition)

Additional concrete checks:
1. **Constraint adherence rate**: for “return JSON”, compute the percentage of responses that parse as JSON.
2. **Correction learning**: measure whether negative feedback reduces repetition of the corrected behavior.
3. **Topic continuity**: measure overlap with context keywords (DS-013) over 2–3 turns.

---

## 9. Implementation Plan (For Development Planning)

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
