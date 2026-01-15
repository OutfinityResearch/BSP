# DS-016: Reasoning Curriculum, Synthetic Tasks, and Data

**Version**: 1.1  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

BSP’s `DeductionGraph` (DS-004) can represent multi-hop transitions (a “chain” of deductions), but most raw language modeling data does not *force* multi-step structure in a way that is easy for an online, local learner to capture reliably.

This DS specifies a **reasoning curriculum** and a set of **synthetic task generators** that produce small, high-signal datasets. The goal is not to “solve reasoning in general”, but to produce repeatable, measurable training conditions that:

- induce stable, reusable deduction chains
- improve sample efficiency for multi-step inference
- provide a practical planning guide for development and evaluation

---

## 2. Problem

Without targeted training data, the system tends to learn:

1. **Local co-occurrence over multi-step structure**
   - Frequent words and near-neighbors dominate the group store and sequence model (DS-009).
2. **Sparse and noisy long-range chains**
   - Multi-hop transitions are underrepresented, and accidental correlations can look like “chains”.
3. **Weak supervision for intermediate steps**
   - If the only training signal is the final answer, the DeductionGraph may not acquire a path that corresponds to the intended reasoning steps.

We need datasets that explicitly control:
- chain length (how many steps are required)
- ambiguity (how many competing paths exist)
- distractor density (how much irrelevant information is present)
- trace format (whether intermediate steps are visible and learnable)

---

## 3. Goals and Non-goals

### 3.1 Goals

1. Provide a **curriculum** (easy → hard) expressed in measurable parameters.
2. Provide **data generator specifications** that are deterministic and reproducible.
3. Support both:
   - **answer-only** training (compact, low overhead)
   - **trace-assisted** training (explicit intermediate steps)
4. Integrate cleanly with the existing online engine API:
   - `engine.process(text, { reward, learn, importanceOverride })`
5. Define evaluation metrics that can be used to compare changes over time and guide implementation work.

### 3.2 Non-goals

1. A complete benchmark suite for all “cognition” (see DS-019 for a broader synthetic evaluation plan).
2. Solving open-domain reasoning from natural language alone.
3. Building an external theorem prover or symbolic executor.

---

## 4. Definitions

- **Episode**: a self-contained training sample consisting of one or more turns.
- **Turn**: one `engine.process(...)` call. A turn may be “user” or “assistant” (see DS-015).
- **Fact**: a short statement that introduces a relation or constraint.
- **Query**: a question whose answer depends on one or more facts.
- **Answer**: the target response (often a single token/entity for synthetic tasks).
- **Trace**: an explicit sequence of intermediate steps leading to the answer.
- **Chain length (k)**: number of reasoning steps required, where `k = 1` is direct retrieval and `k ≥ 2` is multi-hop.
- **Distractor**: a fact not needed for the correct answer.
- **Difficulty (d)**: a scalar used to schedule curriculum settings. In generators, `d` typically controls `k`, distractor count, and noise.

---

## 5. Curriculum Design (Easy → Hard)

The curriculum is expressed as a family of distributions over task parameters.

### 5.1 Difficulty Parameters

For a synthetic episode, define:

- `k` = chain length (integer ≥ 1)
- `m` = number of distractor facts
- `p_para` = probability of paraphrasing a fact template (string variation)
- `p_coref` = probability of introducing a coreference link
- `p_noise` = probability of inserting irrelevant “filler” tokens

A simple schedule is:

- Early training: `k ∈ {1,2}`, low `m`, `p_para ≈ 0`, `p_noise ≈ 0`
- Mid training: `k ∈ {2,3}`, moderate `m`, `p_para > 0`
- Late training: `k ∈ {3,5}`, higher `m`, `p_para` and `p_noise` non-zero, optional coreference

If we want a single scalar `d ∈ [0, 1]`, a practical mapping is:

```
k(d) = 1 + floor(4d)          // 1..5
m(d) = floor(10d)             // 0..10
p_para(d) = 0.3d              // 0..0.3
p_noise(d) = 0.2d             // 0..0.2
p_coref(d) = 0.2 * max(0, d-0.5) / 0.5   // 0..0.2 (only after d>0.5)
```

These are intentionally simple: they are easy to implement and tune.

### 5.2 Task Families

The curriculum should cover multiple “reasoning shapes”. Each family below includes:
- the core pattern we want the DeductionGraph to learn
- a template (or grammar)
- an example episode

#### Family A: Single-Fact Cloze (k = 1)

**Pattern:** Direct retrieval from one fact.

Template:
- Fact: `X is the capital of Y.`
- Query: `X is the capital of ___.`
- Answer: `Y`

Example:

```text
User: Paris is the capital of France. Paris is the capital of ___.
Assistant: France.
```

#### Family B: Transitive Multi-Hop Facts (k ≥ 2)

**Pattern:** A transitive relation composed across multiple steps.

Template (transitive “in” relation):
- Facts: `A is in B. B is in C. ...`
- Query: `Where is A?`
- Answer: `C` (for `k=2`), or the k-step destination.

Example (k = 2):

```text
User: A is in B. B is in C. Where is A?
Assistant: A is in C.
```

#### Family C: Join/Bridge Relations (k ≥ 2, not necessarily transitive)

**Pattern:** Multi-step retrieval where each hop changes the relation type.

Example schema:
- `owns(person, object)`
- `color(object, color)`

Episode (k = 2):

```text
User: Alex owns a ball. The ball is red. What color is the thing Alex owns?
Assistant: Red.
```

This family is useful because it is less dependent on transitivity and more like “database joins”.

#### Family D: Coreference (k ≥ 2, with entity linking)

**Pattern:** A fact introduces an entity; later steps refer to it indirectly (“he”, “it”, “the object”).

Episode:

```text
User: John has a book. He reads it. What does he read?
Assistant: He reads the book.
```

Coreference is a controlled way to introduce context sensitivity that should interact with DS-013.

#### Family E: Procedural State Updates (k ≥ 2, step-by-step)

**Pattern:** Apply a short program-like sequence of operations.

Episode:

```text
User: Start with 3. Add 2. Multiply by 4. What is the result?
Assistant: 20.
```

This family is a pragmatic bridge between pure relational reasoning and real instruction-following tasks (DS-015).

---

## 6. Synthetic Data Generators (Offline)

All generators should output deterministic JSONL (one episode per line) so that:
- datasets can be versioned
- training runs are reproducible
- evaluation sets can be held fixed

### 6.1 Recommended Episode Schema

Minimal schema (extensible):

```json
{
  "id": "kg_join_000123",
  "family": "join",
  "difficulty": 0.55,
  "chain_length": 2,
  "facts": ["Alex owns a ball.", "The ball is red."],
  "query": "What color is the thing Alex owns?",
  "answer": "Red",
  "trace": ["Alex owns a ball.", "The ball is red.", "Therefore the thing Alex owns is red."],
  "turns": [
    {"role": "user", "content": "Alex owns a ball. The ball is red. What color is the thing Alex owns?"},
    {"role": "assistant", "content": "Red."}
  ]
}
```

Notes:
- `turns` is included to match DS-015’s dialogue format directly.
- `facts/query/answer/trace` are included so evaluators can compute correctness without parsing free-form text.

### 6.2 Knowledge-Graph Templates (Relational Families)

For relational tasks, generate a small graph `G = (V, E)`:
- `V`: entity names (`A, B, C...` for simplest runs; later use name lists)
- `E`: labeled edges `(u, r, v)` where `r` is a relation type

#### 6.2.1 Chain Sampling

To generate a k-hop query:

1. Sample a path `v_0 → v_1 → ... → v_k` with relations `r_1..r_k`.
2. Generate textual facts for each edge.
3. Generate a query that asks for `v_k` given `v_0` and the facts.
4. Add distractors that do not create an alternative correct path.

If we want to ensure unambiguous supervision, add a constraint:

- The sampled query should have a **unique answer** under the generated fact set.

Practical uniqueness checks:
- For transitive “in” tasks: ensure `v_0` has only one outgoing `in` edge (or only one path of length k).
- For join tasks: ensure the intermediate object referenced by `owns` is unique for that person.

#### 6.2.2 Distractors

Distractors should be:
- syntactically similar to true facts (so the model cannot ignore them trivially)
- semantically irrelevant to the query’s answer

Example:

```text
User: Alex owns a ball. The ball is red. Maya owns a kite. The kite is blue. What color is the thing Alex owns?
Assistant: Red.
```

### 6.3 Trace-as-Text (Optional, but Recommended for Planning)

Traces are useful for two separate reasons:
1. They create intermediate textual states that can become explicit DeductionGraph nodes.
2. They make debugging easier: we can inspect whether the model learned stable intermediate patterns.

There are two supported training encodings:

#### Option 1: Single-Turn Trace (compact)

```text
User: A is in B. B is in C. Where is A?
Assistant: Step 1: A is in B. Step 2: B is in C. Therefore A is in C. Answer: C.
```

This is easy to generate, but it only creates one deduction update (user → assistant).

#### Option 2: Multi-Turn Trace (preferred for DeductionGraph chains)

```text
User: A is in B. B is in C. Where is A?
Assistant: Step 1: A is in B.
Assistant: Step 2: B is in C.
Assistant: Therefore A is in C.
Assistant: Answer: C.
```

This yields multiple deduction updates:
- user → step 1
- step 1 → step 2
- step 2 → therefore
- therefore → answer

That structure is closer to the “reasoning chain” we want to exist in DS-004.

---

## 7. Training Integration

### 7.1 Feeding Episodes Into BSP

For each episode:

1. Reset or isolate context if you want episodes to be independent.
2. Process each turn with `learn=true`.
3. Apply reward on assistant turns based on correctness.

Minimal pseudocode:

```js
for (const turn of episode.turns) {
  const reward = turn.role === "assistant" ? episodeReward : 0;
  engine.process(turn.content, { learn: true, reward });
}
```

If role conditioning is required, follow DS-015 and prepend a deterministic role marker token (preferred), or include role prefixes in the text.

### 7.2 Reward Shaping

Reward should stay within a stable numeric range (recommended `[-1, +1]`) because:
- `BSPEngine._modulateImportance(...)` uses reward magnitude
- salience updates clamp, but large rewards can saturate quickly

We recommend a composed reward:

```
r_total = clamp(r_answer + λ * r_trace + μ * r_format, -1, +1)
```

Where:
- `r_answer ∈ {-1, +1}` (incorrect/correct), or `{0, +1}` if you prefer non-punitive shaping.
- `r_trace ∈ [0, 1]` measures trace quality (only if a trace is required).
- `r_format ∈ [0, 1]` measures format adherence (e.g., “Answer: X.”), useful for strict parsing.
- `λ, μ` are small (e.g., `λ = 0.2`, `μ = 0.1`) so the final answer still dominates.

Trace scoring can be simple and deterministic:
- per-step entity coverage (does the step mention the correct entities?)
- relation token coverage (does it mention the relation for that hop?)

### 7.3 Replay Prioritization and Consolidation

The replay buffer already records `surprise`, `reward`, and `importance` (see `src/core/BSPEngine.mjs`).

For reasoning curricula, episodes worth replaying more often are typically:
- high absolute reward (strong supervision signal)
- high surprise + positive reward (novel but correct)
- high surprise + negative reward (novel error worth correcting)

When combined with DS-010 (sleep consolidation), this helps stabilize frequently used chains and compress redundant groups.

---

## 8. Evaluation

Evaluation should measure both:
- **answer correctness**
- **chain structure** (did the DeductionGraph capture something path-like?)

### 8.1 Core Metrics

1. **Accuracy by chain length**
   - Report accuracy separately for each `k`.
2. **MRR / Top-K (optional)**
   - If the response generator produces ranked candidates, compute mean reciprocal rank.
3. **Trace accuracy (if traces are required)**
   - Step-level correctness, plus “final answer present and correct”.
4. **Chain coverage**
   - For each correct episode, attempt to extract a path in the DeductionGraph from query state to answer state within `k` hops.

### 8.2 Relationship to Other DS

- DS-019 defines a broader synthetic evaluation plan. DS-016’s generators are compatible and can be used as training subsets for DS-019 tasks, but DS-019 remains the canonical evaluation specification.
- DS-008 includes LAMBADA and related benchmarks; those remain useful as a long-range dependency proxy, but they do not isolate reasoning chains the way synthetic tasks do.

---

## 9. Implementation Status and TODOs

### 9.1 Current Status

- The core engine already supports reward and importance modulation via `engine.process(..., { reward, importanceOverride, learn })`.
- There is no dedicated reasoning curriculum generator or harness in the repo yet; this DS is a design + planning spec.

### 9.2 Planned Work Items

1. Add a Node.js (ESM) generator script that produces JSONL episodes for families A–E with fixed seeds.
2. Add a training runner that:
   - streams episodes
   - feeds turns into `engine.process(...)`
   - applies reward shaping
   - periodically runs maintenance (consolidation / sleep merge)
3. Add an evaluation harness:
   - answer accuracy by `k`
   - chain coverage extraction from `DeductionGraph`
4. Add dataset versioning and fixed “held-out” splits to prevent regressions.

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
