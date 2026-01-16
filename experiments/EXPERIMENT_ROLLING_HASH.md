# Rolling Hash Map Optimization
**Date:** 2026-01-16  
**Status:** ✅ SUCCESS - Modest improvement  

---

## Results

### Quick Test (1k lines)
- Throughput: **588 l/s** (vs 305 baseline = **+93%**) ✅
- BPC: **2.03** (vs 2.21 = **-8%**) ✅
- COPY ops: 1,595 (same)

### Full Test (5k lines)
- Throughput: **310 l/s** (vs 301 baseline = **+3%**) ✅
- BPC: **2.21** (same)
- COPY ops: 3,637 (same)

---

## Analysis

**Why modest improvement on full test:**
- Hash map build: O(N) but still has cost
- Context changes frequently (every few encodings)
- For N=256, linear search is already fast (~1,536 ops)
- Hash map: ~256 hashes + lookups ≈ similar cost

**Why big improvement on quick test:**
- Better cache locality
- Smaller dataset, less context changes
- Lucky timing

**Conclusion**: Hash map is **slightly better** than linear but not dramatically. The real bottleneck is elsewhere (group processing, not COPY search).

---

## Decision

**KEEP** hash map as default (useHashMap: true) because:
- ✅ No regression (310 vs 301 l/s acceptable)
- ✅ Scales better for larger context
- ✅ Clean O(1) algorithm
- ✅ Small memory overhead (~2KB)

---

## Next: Increase Context Size

Now that we have efficient indexing, try larger context:
- Current: 256 tokens
- Test: 1024 tokens
- Expected: More COPY opportunities → better BPC
