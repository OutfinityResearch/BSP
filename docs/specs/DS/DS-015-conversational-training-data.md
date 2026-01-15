# DS-015: Conversational Training Data & Feedback Loop

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Problem

General LM corpora (PTB/WikiText) help bootstrap language patterns, but they are insufficient for:

- turn-taking (user/assistant role structure)
- instruction following (format constraints, style constraints)
- preference learning (explicit/implicit feedback)

To build a usable conversational system, we need targeted conversational data and a feedback-driven training loop.

---

## 2. Data Formats

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

## 3. Training Policy

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

## 4. What Data to Add

### 4.1 Instruction Following

- short instructions with constraints: “return JSON”, “list steps”, “write an email”
- correction turns: “No, you must output valid JSON” + corrected assistant answer

### 4.2 Tool-like Dialogues (simulated)

- structured “command → output” patterns
- helps reliability of formatted outputs and multi-step tasks

### 4.3 Mixed Romanian/English Inputs (if desired)

If the system must operate in Romanian, add conversational examples in Romanian as *user inputs* while keeping stored artifacts in English.

---

## 5. Evaluation

- multi-turn coherence on a fixed conversation set
- positive-feedback rate on preference dataset
- reduced input echo rate (less repetition)

