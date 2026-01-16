# Next Steps Summary
**Date:** 2026-01-16  
**Current Status:** Vocabulary fix complete, ready for next optimization phase

---

## 🎯 Immediate Next Action: Template Learning

**Goal:** Reduce BPC from 2.20 → 1.80 (18% improvement)

**Why this first:**
- Highest impact / effort ratio
- Low risk (can disable if fails)
- TinyStories has perfect structure for templates
- Infrastructure already in place

**Implementation time:** 2-3 hours

**Files to modify:**
1. `src/core/CompressionMachine.mjs` - implement `learnTemplates()` and `_findDifferences()`
2. `src/core/BSPEngine.mjs` - add sentence buffer and periodic learning calls

---

## 📋 Experiment Queue (Priority Order)

### 1. Template Learning 🎯
- **Impact:** High (18% BPC reduction)
- **Effort:** Medium (2-3 hours)
- **Risk:** Low
- **Status:** Ready to implement

### 2. Suffix Array for COPY 🚀
- **Impact:** Medium (48% throughput increase)
- **Effort:** High (4-5 hours)
- **Risk:** Medium
- **Status:** Planned

### 3. Frequency-Weighted Coding 📊
- **Impact:** Medium (14% BPC reduction)
- **Effort:** Medium (3-4 hours)
- **Risk:** Low
- **Status:** Planned

### 4. Fuzzy REPEAT 🔬
- **Impact:** Unknown
- **Effort:** Medium (2-3 hours)
- **Risk:** High
- **Status:** Exploratory

### 5. Semantic COPY 🧪
- **Impact:** Unknown
- **Effort:** High (5+ hours)
- **Risk:** High
- **Status:** Exploratory

---

## 📊 Current Metrics (Baseline)

| Metric | Value | Target |
|--------|-------|--------|
| BPC (5k) | 2.20 | < 1.80 |
| vs Gzip | +8.6% | +20% |
| Throughput | 338 l/s | > 500 l/s |
| Program Wins | 85% | > 80% |
| COPY Ops | 3,637 | Maintain |
| Template Ops | 0 | > 100 |

---

## 🔬 Measurement Protocol

**Before experiment:**
```bash
node evals/runLM_Comp.mjs --retrain
cp evals/lm_comparative/results/latest.json baseline_$(date +%Y%m%d).json
```

**After experiment:**
```bash
node evals/runLM_Comp.mjs --retrain
# Compare results
```

**Success criteria:**
- ✅ BPC < 2.00
- ✅ Template ops > 100
- ✅ Program win rate > 80%
- ✅ No throughput regression

---

## 📚 Documentation Created

1. **`docs/guides/optimizations.html`** - Interactive optimization journey page
2. **`EXPERIMENTAL_ROADMAP.md`** - Detailed experiment plans with metrics
3. **`optimisation_plan.md`** - Updated with current status and next steps
4. **`COMPRESSION_INSIGHTS.md`** - Deep insights about what works and why
5. **`SESSION_2026-01-16_vocab_fix.md`** - Complete session summary

---

## 🎓 Key Learnings from Today

1. **Vocabulary decoupling is critical** - Different subsystems need different granularities
2. **LZ77-style COPY dominates** - 85% win rate on narrative text
3. **Hybrid architecture works** - Groups for semantics, programs for structure
4. **Cost model accuracy matters** - Incorrect vocab caused 21% degradation
5. **Scaling behavior is good** - More data → better COPY matches → higher win rate

---

## 🚀 Ready to Start

**Next command to run:**
```bash
# Open the implementation file
code src/core/CompressionMachine.mjs

# Navigate to line ~565 (learnTemplates method)
# Implement the algorithm from optimisation_plan.md section 5
```

**Pseudo-code ready in:** `optimisation_plan.md` section 5, step 1

**Expected completion:** 2-3 hours

**Benchmark after:** `node evals/runLM_Comp.mjs --retrain`

---

**Status:** 🟢 Ready to proceed with Template Learning implementation
