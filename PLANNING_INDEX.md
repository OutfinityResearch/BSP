# BSP Planning & Optimization Documents Index

Quick reference to all planning and optimization documentation.

---

## 📋 Quick Start

**Want to know what to do next?** → Read [`NEXT_STEPS.md`](NEXT_STEPS.md)

**Want to understand what we did today?** → Read [`SESSION_2026-01-16_vocab_fix.md`](SESSION_2026-01-16_vocab_fix.md)

**Want to see the optimization journey?** → Open [`docs/guides/optimizations.html`](docs/guides/optimizations.html) in browser

---

## 📚 Document Guide

### Planning Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [`NEXT_STEPS.md`](NEXT_STEPS.md) | Immediate next action (Template Learning) | Developer starting work |
| [`optimisation_plan.md`](optimisation_plan.md) | Current status + detailed implementation guide | Developer implementing |
| [`EXPERIMENTAL_ROADMAP.md`](EXPERIMENTAL_ROADMAP.md) | All planned experiments with metrics | Project manager / Researcher |

### Analysis Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [`COMPRESSION_INSIGHTS.md`](COMPRESSION_INSIGHTS.md) | Deep insights about what works and why | Researcher / Architect |
| [`SESSION_2026-01-16_vocab_fix.md`](SESSION_2026-01-16_vocab_fix.md) | Complete session summary with results | Anyone reviewing progress |

### Web Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [`docs/guides/optimizations.html`](docs/guides/optimizations.html) | Interactive optimization timeline | End user / Stakeholder |
| [`docs/index.html`](docs/index.html) | Main documentation portal | End user |

---

## 🎯 Current Status (2026-01-16)

**Completed Today:**
- ✅ Vocabulary decoupling fix (21% BPC improvement)
- ✅ Scaling issue resolved (now beats Gzip at all scales)
- ✅ Documentation complete

**Current Metrics:**
- BPC: 2.20 (beats Gzip 2.41 by 8.6%)
- Program win rate: 85%
- Throughput: 338 lines/sec

**Next Action:**
- 🎯 Implement Template Learning (target: 2.20 → 1.80 BPC)

---

## 🔍 Finding Information

### "How do I run benchmarks?"
→ See [`NEXT_STEPS.md`](NEXT_STEPS.md) - Measurement Protocol section

### "What experiments are planned?"
→ See [`EXPERIMENTAL_ROADMAP.md`](EXPERIMENTAL_ROADMAP.md) - Experiment Queue section

### "What did we achieve today?"
→ See [`SESSION_2026-01-16_vocab_fix.md`](SESSION_2026-01-16_vocab_fix.md) - Results section

### "Why does COPY work so well?"
→ See [`COMPRESSION_INSIGHTS.md`](COMPRESSION_INSIGHTS.md) - Section 1.1

### "How do I implement templates?"
→ See [`optimisation_plan.md`](optimisation_plan.md) - Section 5, Step 1

### "What's the theoretical limit?"
→ See [`COMPRESSION_INSIGHTS.md`](COMPRESSION_INSIGHTS.md) - Section 6

---

## 📊 Quick Reference

### Benchmark Commands
```bash
# Quick test (1k lines, ~17s)
node evals/runLM_Comp.mjs --quick --retrain

# Full test (5k lines, ~1.3min)
node evals/runLM_Comp.mjs --retrain

# View results
cat evals/lm_comparative/results/latest.json | jq
```

### Key Metrics
- **BPC:** Bits per character (lower is better)
- **vs Gzip:** Percentage improvement over Gzip baseline
- **Program Win Rate:** % of times CompressionMachine beats groups
- **Throughput:** Lines processed per second

### Success Criteria
- ✅ BPC < 2.00 (currently 2.20)
- ✅ vs Gzip > +10% (currently +8.6%)
- ✅ Program wins > 80% (currently 85%)
- ✅ Throughput > 300 l/s (currently 338)

---

## 🗺️ Document Relationships

```
NEXT_STEPS.md (start here)
    ↓
optimisation_plan.md (implementation details)
    ↓
EXPERIMENTAL_ROADMAP.md (all experiments)
    ↓
COMPRESSION_INSIGHTS.md (why things work)
    ↓
SESSION_2026-01-16_vocab_fix.md (what we did)
    ↓
docs/guides/optimizations.html (visual timeline)
```

---

## 📝 Update Protocol

When completing an experiment:

1. Update [`NEXT_STEPS.md`](NEXT_STEPS.md) with new baseline metrics
2. Update [`optimisation_plan.md`](optimisation_plan.md) with implementation status
3. Update [`EXPERIMENTAL_ROADMAP.md`](EXPERIMENTAL_ROADMAP.md) with results
4. Create new session summary (e.g., `SESSION_2026-01-17_templates.md`)
5. Update [`docs/guides/optimizations.html`](docs/guides/optimizations.html) with new timeline entry

---

**Last Updated:** 2026-01-16  
**Next Review:** After Template Learning implementation
