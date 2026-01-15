# DS-016: Reasoning Curriculum, Synthetic Tasks, and Data

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Problem

The DeductionGraph (DS-004) supports multi-hop inference, but raw LM data rarely forces explicit multi-hop structure. Without a curriculum:

- the system learns mostly local co-occurrence
- long-range chains are sparse and noisy
- sample efficiency for “reasoning” is poor

We want a small, high-signal dataset that induces reliable chains.

---

## 2. Curriculum (easy → hard)

1. **Single-fact cloze:** “Paris is the capital of ___.”
2. **Two-hop facts:** “A is in B. B is in C. A is in ___.”
3. **Coreference:** “John has a book. He reads it. What does he read?”
4. **Procedural tasks:** numbered steps → final answer (lightweight “program” traces).

---

## 3. Synthetic Data Generators (offline)

### 3.1 Knowledge-Graph Templates

Generate triples and queries that require chaining:

- `located_in(a,b)`, `part_of(b,c)`, `owns(x,y)`, `causes(x,y)`

Dialogue form:

```text
User: A is in B. B is in C. Where is A?
Assistant: A is in C.
```

### 3.2 Trace-as-Text (optional)

Train explainable chains by emitting intermediate steps:

```text
Assistant: Step1: A in B. Step2: B in C. Therefore A in C. Answer: C.
```

This reinforces intermediate group transitions and makes chain extraction easier.

---

## 4. Training Integration

### 4.1 Reward Shaping

- positive reward for correct answers
- negative reward for incorrect answers
- optional bonus if the trace includes relevant entities/relations (reduces hallucination)

### 4.2 Replay Prioritization

Prioritize episodes with:

- high surprise + high absolute reward
- high surprise + explicit correction (negative feedback)

Consolidate these more frequently to stabilize chains.

---

## 5. Evaluation

- LAMBADA (DS-008) for long-range dependency
- custom 2-hop accuracy + MRR
- chain coverage: can we extract a reasoning chain for correct answers?

