# Increase Context Size Optimization
**Date:** 2026-01-16  
**Status:** ✅ SUCCESS - Significant improvement  

---

## Implementation

Changed `maxContextTokens` from 256 → 1024 (4x increase)

---

## Results

| Metric | 256 Context | 1024 Context | Improvement |
|--------|-------------|--------------|-------------|
| **BPC** | 2.21 | **2.15** | **-3%** ✅ |
| **vs Gzip** | +8.5% | **+10.9%** | +2.4% ✅ |
| **COPY Ops** | 3,637 | **4,395** | **+21%** ✅ |
| **Avg Savings/Op** | 26.4 bits | **37.8 bits** | **+43%** ✅ |
| **Program Win Rate** | 85% | **87.5%** | +2.5% ✅ |
| **Throughput** | 310 l/s | **319 l/s** | +3% ✅ |

---

## Analysis

**Why it works:**
- More context → more COPY opportunities
- Longer matches possible (more history to search)
- Hash map handles 1024 efficiently (O(1) lookup)
- Average savings per COPY increased 43%!

**Memory impact:**
- Context: 256 → 1024 tokens (~3KB increase)
- Hash map: ~8KB (acceptable)
- Total: ~11KB additional memory

**Throughput:**
- Stayed at 319 l/s (vs 310 baseline)
- Hash map scales well
- No performance degradation

---

## Decision

**KEEP** 1024 context as new default because:
- ✅ 3% BPC improvement
- ✅ 21% more COPY operations
- ✅ 43% better savings per operation
- ✅ No throughput regression
- ✅ Minimal memory cost

---

## Next Steps

With better compression (2.15 BPC), focus on:
1. Frequency-weighted coding → target 1.90 BPC
2. N-gram pruning → reduce vocab, improve speed
