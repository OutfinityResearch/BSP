# Frequency-Weighted Coding Experiment
**Date:** 2026-01-16  
**Status:** ⚠️ PARTIAL - Needs more work  

---

## Implementation

- Created `FrequencyCodeTable` class
- Tracks word frequencies during encoding
- Builds Shannon code table: bitLength = -log2(frequency/total)
- Added `getTokenCost()` and `getTokensCost()` methods

---

## Problem Discovered

**Inconsistent cost calculation** breaks operator selection:

- `LiteralOp`: Uses frequency costs → cheaper
- `CopyOp`: Uses fixed log2(vocab) → more expensive
- Result: COPY ops dropped from 1,595 → 279 (82% decrease!)

**Root cause**: All operators (COPY, REPEAT, TEMPLATE, LITERAL) must use same cost basis for fair comparison.

---

## What's Needed

To make frequency coding work:

1. **Update all operators** to accept code table
2. **Consistent cost calculation**:
   - LITERAL: sum of frequency costs
   - COPY: offset cost + length cost (fixed)
   - REPEAT: pattern frequency costs + count
   - TEMPLATE: template ID + slot frequency costs

3. **Rebuild operators** to use frequency-based costs

**Complexity**: High - requires refactoring all 4 operators

---

## Decision

**DISABLED** frequency coding for now because:
- ❌ Breaks COPY operations (82% decrease)
- ❌ Requires major refactoring of all operators
- ❌ Complex to get cost model right
- ⏰ Time investment too high for uncertain gain

**Alternative approach**: Focus on simpler optimizations first (N-gram pruning, lazy activation)

---

## Future Work

If revisited:
1. Refactor operators to accept `costFunction` parameter
2. Make cost calculation pluggable
3. Test with consistent frequency costs across all operators
4. Expected: 10-15% BPC improvement (if done correctly)

---

## Code Status

- `FrequencyCodeTable.mjs`: ✅ Implemented (available but not used)
- `CompressionMachine`: ⚠️ Partial integration (disabled by default)
- Flag: `useFrequencyCoding: false`
