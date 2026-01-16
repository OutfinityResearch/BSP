# RL Evals (Deferred)

This directory is reserved for internal RL adaptation micro-benchmarks.

Current state:
- Only evaluation outputs exist under `results/`.
- No runnable evaluator script is present in this folder yet.

Next required work (do not start in the current optimization thread):
1. Add a deterministic dataset definition under `evals/rl/data/` (JSONL).
2. Implement `evals/rl/evaluate.mjs` (Node.js built-ins only, ESM) to run:
   - pre-train phase (baseline mapping)
   - adaptation phase (mapping shift) with online rewards
   - stability phase (continued training + drift measurement)
3. Emit deterministic outputs:
   - `evals/rl/results/seed_<seed>/rl_adaptation.json`
   - `evals/rl/results/seed_<seed>/rl_adaptation_summary.txt`
4. Define acceptance checks:
   - With `rlPressure=0`, adaptation is slower but stability is higher.
   - With higher `rlPressure`, steps-to-threshold decreases while drift/forgetting increases.

