# BSP Backlog (Consolidated)

This backlog consolidates:

- The Discovery evaluation plan defined by `docs/specs/DS/DS-019-synthetic-evaluation.md`.
- All useful items from the legacy `todo.backlog` (merged, de-duplicated, and re-scoped where needed).

Scope:
- Benchmark-comparison tasks are intentionally excluded from this backlog.

Priority is implied by **chapter order**. Within a chapter, tasks are ordered by prerequisites and dependency flow.

Each task includes:

- **Description:** what/why
- **Proposal:** what to implement (detailed, reviewable plan)
- **Check:** how to verify correctness

---

## Chapter 2 — Discovery Evals (Synthetic / Artificial, Architecture Discovery)

### DISC-005 — Implement system-specific scorers for all 20 synthetic systems (DS-019)
Chapter: Discovery Evals

Description:
Each synthetic system has a different intended metric (DS-019), but the current evaluator uses a generic “token inclusion in predicted group members” heuristic. This loses signal and can be actively misleading.

Proposal:
- For each system `evals/abstract_primitives/XX_system/`, add `scorer.mjs` exporting:
  - `parseTestLine(line) -> { prompt, expected, meta }`
  - `score({ engine, prompt, expected, meta, options }) -> { correct, details, metrics }`
- Implement DS-019-aligned metrics (minimum set per system):
  - 01 Convergence: terminal prediction accuracy; accuracy by prompt-hop bucket (short/medium/long)
  - 02 Divergence: Top-1/Top-5 coverage + KL divergence between target distribution and normalized predicted scores
    - Normalization: `p_hat(o) = softmax(score(o))` over outcomes observed in predictions
    - KL: `Σ p_true(o) * log(p_true(o) / (p_hat(o) + ε))`
  - 03 Cycles: next-step accuracy; multi-step rollout accuracy for horizon `H=10`
  - 04 Hierarchy: immediate parent accuracy; ancestor recall@5 (any ancestor predicted in top-5)
  - 05 Composition: novel-pair accuracy; report seen vs unseen pairs separately
  - 06 Negation: exclusion accuracy@5 (forbidden token not in top-5) + contradiction rate
  - 07 Conditional gates: accuracy per gate type; macro-average across types
  - 14 Interpolation: Top-1 and Top-5 gap-fill accuracy
  - 20 Transfer: sample-efficiency ratio computed from steps-to-threshold between domains
- Update `evals/abstract_primitives/evaluate.mjs` to delegate scoring to each system scorer.
- Store metric definitions in `metadata.json` and ensure they match implemented metrics.

Expected file changes:
- NEW: `evals/abstract_primitives/*/scorer.mjs` (20 files)
- `evals/abstract_primitives/evaluate.mjs`
- `evals/abstract_primitives/*/metadata.json` (regenerated to include scorer/metric definitions)

Check:
- For 2–3 systems, hand-check a tiny dataset where the correct answer is obvious and ensure the scorer reports correct/incorrect as expected.
- Ensure the evaluator prints and saves per-system metric breakdowns and does not silently fall back to generic scoring.

---

### DISC-006 — Add learning curves and “time-to-threshold” (TTC) metrics for synthetic systems
Chapter: Discovery Evals

Description:
Discovery needs to optimize learning speed (fewer steps/data). Final accuracy alone hides whether changes improve sample efficiency.

Proposal:
- Extend the synthetic evaluator to run periodic evaluation checkpoints during training:
  - evaluate every `N=500` training lines
- For each system, record:
  - score at each checkpoint
  - `steps_to_50%`, `steps_to_80%`
  - AULC over the first `M=5000` steps
- Output:
  - machine-readable JSON: per system, per checkpoint, full curve
  - a human-readable text summary (console and `summary.txt`): “TTC@80% = 3,500 steps”
- Keep this strictly in Discovery outputs.

Expected file changes:
- `evals/abstract_primitives/evaluate.mjs`
- NEW: `evals/abstract_primitives/results/` (gitignored)

Check:
- Run a single system with a small budget and confirm:
  - the JSON contains multiple checkpoints
  - TTC metrics match the curve (first step where score crosses threshold)

---

### DISC-007 — Add difficulty levels and curriculum runner for synthetic tasks
Chapter: Discovery Evals

Description:
DS-019 describes difficulty progression; without it, scores can saturate early on easy regimes or become too noisy on hard regimes. Curriculum is a tool to both measure and improve learning dynamics.

Proposal:
- Extend each grammar to support difficulty knobs (where meaningful):
  - noise rate, chain length, distractor count, etc.
- Update generator CLI:
  - `--difficulty=easy|medium|hard`
- Add a curriculum runner:
  - start on easy
  - unlock higher difficulty when average score exceeds 80%
  - record curriculum progression events in the output JSON

Expected file changes:
- `evals/abstract_primitives/generate.mjs`
- `evals/abstract_primitives/*/generator.mjs` (difficulty parameters)
- NEW: `evals/abstract_primitives/curriculum.mjs`

Check:
- Run curriculum mode on a small subset (Tier 1) and verify the runner transitions difficulty levels only when thresholds are met.

---

## Chapter 3 — Experimentation (Ablations, Optimization, Learning-Speed Engineering)

### EXP-001 — Implement ablation sweep runner (K, depth, ρ, tokenizer ngrams, index caps)
Chapter: Experimentation

Description:
Ablations are required to understand what improves learning speed and stability, and to validate DS-017 recommendations with data.

Proposal:
- Create an ablation runner that:
  - takes a base config + a sweep definition
  - runs training/eval with each config
  - records metrics and footprint consistently
- Default sweeps:
  - `learner.topK`: `[4, 8, 16, 32, 64]`
  - `DeductionGraph.predictMultiHop.maxDepth`: `[1..5]`
  - `rlPressure`: `[0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0]`
  - tokenizer ngrams: `[1]`, `[1,2]`, `[1,2,3]`
  - `index.maxGroupsPerIdentity`: `[64, 128, 256, 512]`
- Output:
  - per-config JSON + a summary table

Expected file changes:
- NEW: `evals/abstract_primitives/ablations.mjs`

Check:
- Ablation runner produces one result record per config and the summary ranks configs deterministically by chosen metric.

---

### EXP-002 — Add instrumentation for “why learning is slow” (fan-out, churn, drift)
Chapter: Experimentation

Description:
To optimize sample efficiency, we need diagnostics beyond final scores: candidate fan-out distribution, group churn, edge churn, and stability signals.

Proposal:
- Add lightweight counters/metrics:
  - candidate fan-out per input (size of `GroupStore.getCandidates`)
  - group churn: created/merged/pruned per N steps
  - edge churn: strengthens/weaken/prunes per N steps
  - average active groups per input, surprise/hallucination rates
- Expose via `BSPEngine.getStats()` extensions and have the Discovery eval runner persist the returned stats in result JSON.

Expected file changes:
- `src/core/BSPEngine.mjs`
- `evals/abstract_primitives/*` (persist stats to discovery results)

Check:
- Metrics are stable and bounded in overhead (no large per-step allocations).
- Run a perf smoke test to ensure throughput does not regress significantly.

---

### EXP-003 — RL adaptation micro-benchmarks (custom, but standardized internally)
Chapter: Experimentation

Description:
DS-005 describes RL pressure and adaptation. We need a repeatable internal benchmark that measures “steps to adapt” and “stability after adaptation”.

Proposal:
- Create a small synthetic preference/correction dataset:
  - JSONL episodes with `turns` and expected “preferred answer”
  - reward shaping rules: +1 correct, -1 incorrect (clamped)
- Evaluation:
  - run online training with rewards
  - measure steps-to-threshold accuracy and post-adaptation drift on a held-out set
  - sweep `rlPressure`

Expected file changes:
- NEW: `evals/rl/data/*.jsonl`
- NEW: `evals/rl/evaluate.mjs`

Check:
- Running with `rlPressure=0` should show slower adaptation but higher stability; higher `rlPressure` should adapt faster but may drift (expected trade-off).

---

## Chapter 4 — Reporting & Visualization (Non-core, Useful for Review)

### RPT-001 — Learning curve outputs and plotting (no external dependencies)
Chapter: Reporting & Visualization

Description:
Discovery runs benefit from learning curve visualization, but external plotting libraries should be avoided.

Proposal:
- Ensure the Discovery eval runner emits curve JSON (TTC curves).
- Provide a minimal plotter that outputs:
  - ASCII sparkline summary in terminal
  - a static HTML report with inline SVG (vanilla JS)

Expected file changes:
- NEW: `evals/abstract_primitives/plot.mjs`

Check:
- Plot scripts run on saved JSON and produce deterministic output.

---

### RPT-002 — Abstract primitives profile dashboard (Discovery-only)
Chapter: Reporting & Visualization

Description:
Discovery results are easier to act on with a dashboard that highlights weaknesses and correlates them with config choices.

Proposal:
- Generate an HTML report from Discovery results JSON:
  - per-system score + TTC
  - tier summaries
  - “weakness list” for targeted optimization
- Implement as static HTML + inline JS (no external deps).

Expected file changes:
- NEW: `evals/abstract_primitives/dashboard.mjs`
- NEW: `evals/abstract_primitives/templates/profile.html`

Check:
- Opening the generated HTML displays all systems and matches the JSON metrics.

---

## Chapter 5 — Documentation & Spec Hygiene

### DOC-001 — Fix English-only policy violations and DS inconsistencies
Chapter: Documentation & Spec Hygiene

Description:
Some DS docs contain non-English fragments and duplicated legacy content. DS-002 suggests external dependencies that conflict with the repo’s “no external runtime deps” policy.

Proposal:
- Fix DS-007: remove/translate the Romanian fragment to English.
- Remove duplicated legacy sections in:
  - DS-010 (post “Implementation Status” duplication)
  - DS-016 (duplicated sections appended at end)
- Align DS-002 with reality:
  - remove external dependency suggestions and replace them with built-in equivalents
  - ensure DS-018’s policy is consistent across specs
- Clarify DS-006 examples that mention external libraries by replacing them with built-in alternatives.

Expected file changes:
- `docs/specs/DS/DS-007-serialization-sessions.md`
- `docs/specs/DS/DS-010-memory-consolidation.md`
- `docs/specs/DS/DS-016-reasoning-curriculum-and-data.md`
- `docs/specs/DS/DS-002-data-structures.md`
- `docs/specs/DS/DS-006-http-server-chat.md` (clarifications only)

Check:
- Grep for Romanian fragments returns none in `docs/specs/DS/`.
- DS-002/DS-018 policies no longer conflict.

---

### DOC-002 — Document how to run Discovery evals (and keep docs in sync)
Chapter: Documentation & Spec Hygiene

Description:
Users need clear entry points for Discovery evaluation. Current docs reference scripts that have evolved.

Proposal:
- Update:
  - `README.md` with:
    - “Discovery evals” section
    - minimal commands to run it end-to-end
  - `docs/eval.html` to reflect the Discovery eval structure and script names
- Ensure docs do not suggest external runtime dependencies.

Expected file changes:
- `README.md`
- `docs/eval.html`

Check:
- Following README instructions from a clean checkout yields a successful run of one Discovery eval.

---

## Chapter 6 — Operations (CI, QA, Packaging)

### OPS-001 — Continuous benchmarking in CI (fast PR + nightly full runs)
Chapter: Operations

Description:
Regression tracking requires automation, but full benchmarks can be expensive.

Proposal:
- Add CI scripts:
  - PR: run fast unit tests + small eval smoke tests (tiny subsets)
  - Nightly: run the full Discovery suite + save results artifacts
- Store results in JSON artifacts only; do not commit benchmark results to git.

Expected file changes:
- NEW: `.github/workflows/benchmarks.yml`
- NEW: `evals/ci/*.mjs`

Check:
- CI fails on real regressions (e.g., import errors) and does not “pass” with mock scores.

---

### OPS-002 — Improve test reliability and perf gating
Chapter: Operations

Description:
Long-running or flaky tests undermine iteration speed. Perf tests should be gated or labeled.

Proposal:
- Ensure all async tests have timeouts.
- Gate perf tests behind an env var (e.g., `BSP_TEST_PERF=1`) if not already.
- Add targeted unit tests for DeductionGraph invariants and for any new dataset loaders.

Expected file changes:
- `tests/*` as needed
- `tests/_runner.mjs`

Check:
- `npm test` completes reliably and deterministically.
- Perf tests run only when explicitly enabled.
