# BSP Experimental Roadmap
**Created:** 2026-01-16  
**Status:** Planning Phase  
**Current BPC:** 2.20 (5k lines) | Target: 1.50-1.80

---

## Experiment Queue

### 🎯 Experiment 1: Template Learning (HIGH PRIORITY)
**Status:** Ready to implement  
**Expected Impact:** 2.20 → 1.80 BPC (18% improvement)  
**Effort:** Medium (2-3 hours)  
**Risk:** Low (fallback to current system)

#### Hypothesis
TinyStories contains highly repetitive sentence structures that can be compressed as templates with variable slots, achieving 50%+ compression on matching sentences.

#### Implementation Steps
1. **Phase 1: Basic Template Extraction** (1 hour)
   - Implement `_findDifferences(seq1, seq2)` in CompressionMachine
   - Implement `learnTemplates(sequences)` with length-based clustering
   - Add sentence buffer to BSPEngine (max 500 sentences)
   - Call `learnTemplates()` every 100 lines

2. **Phase 2: Template Matching** (30 min)
   - Already implemented in `_tryTemplateEncoding()`
   - Verify cost calculation is correct
   - Test with manual templates first

3. **Phase 3: Tuning** (1 hour)
   - Adjust similarity threshold (currently 50%)
   - Experiment with max templates (currently unlimited)
   - Add template frequency tracking
   - Prune low-usage templates

#### Success Metrics
- ✅ Templates learned > 10
- ✅ Template ops used > 100 (>5% of encodings)
- ✅ BPC < 2.00
- ✅ Program win rate stays > 80%

#### Failure Conditions
- Templates learned = 0 (algorithm too strict)
- Template ops used < 10 (not matching)
- BPC increases (cost model wrong)

#### Rollback Plan
If experiment fails, disable template learning with flag:
```javascript
useTemplates: false
```

---

### 🚀 Experiment 2: Suffix Array for COPY (MEDIUM PRIORITY)
**Status:** Planned  
**Expected Impact:** 338 → 500+ lines/sec (48% throughput)  
**Effort:** High (4-5 hours)  
**Risk:** Medium (complexity in incremental updates)

#### Hypothesis
Current O(N×M) COPY search is the bottleneck. Suffix array will reduce to O(log N + M), significantly improving throughput without affecting compression quality.

#### Implementation Steps
1. **Phase 1: Suffix Array Implementation** (2 hours)
   - Create `src/core/utils/SuffixArray.mjs`
   - Implement build: O(N log N)
   - Implement query: O(log N + M)
   - Unit tests for correctness

2. **Phase 2: Integration** (1 hour)
   - Replace `_findCopyMatches` linear scan
   - Add incremental update on context slide
   - Benchmark build vs query cost tradeoff

3. **Phase 3: Optimization** (1-2 hours)
   - Cache suffix array between encodings
   - Lazy rebuild (only when context changes significantly)
   - Profile memory usage

#### Success Metrics
- ✅ Throughput > 500 lines/sec
- ✅ BPC unchanged (±0.01)
- ✅ Memory increase < 50MB

#### Failure Conditions
- Throughput < 400 lines/sec (overhead too high)
- BPC increases > 0.05 (matching quality degraded)
- Memory increase > 100MB

#### Alternative Approaches
If suffix array is too complex:
1. **Rolling Hash Map** (simpler, O(1) average case)
2. **Trie-based matching** (good for short patterns)
3. **Sampling** (check every Nth position)

---

### 📊 Experiment 3: Frequency-Weighted Coding (LOW PRIORITY)
**Status:** Planned  
**Expected Impact:** 2.20 → 1.90 BPC (14% improvement)  
**Effort:** Medium (3-4 hours)  
**Risk:** Low (well-understood technique)

#### Hypothesis
High-frequency words (top 100) appear in 50% of text but cost the same as rare words. Huffman-style encoding will reduce average cost from 11 → 9 bits.

#### Implementation Steps
1. **Phase 1: Frequency Tracking** (1 hour)
   - Add frequency counter to `wordVocab`
   - Track during training
   - Serialize/deserialize frequencies

2. **Phase 2: Code Table Generation** (1 hour)
   - Build Huffman tree from frequencies
   - Generate code table (word → bit length)
   - Or use static table for common English words

3. **Phase 3: Cost Model Update** (1 hour)
   - Update `LiteralOp.cost` to use code table
   - Update `RepeatOp.cost` for pattern encoding
   - Update `TemplateOp.cost` for slot values

4. **Phase 4: Verification** (1 hour)
   - Ensure cost model matches actual encoding
   - Test with manual frequency distribution
   - Benchmark impact

#### Success Metrics
- ✅ Average word cost < 10 bits
- ✅ BPC < 2.00
- ✅ Top 100 words cost < 8 bits

#### Failure Conditions
- Average cost > 11 bits (overhead too high)
- BPC increases (cost model inaccurate)

#### Notes
This requires actual encoding implementation, not just cost calculation. May defer until after template learning proves successful.

---

### 🔬 Experiment 4: Fuzzy REPEAT (EXPLORATORY)
**Status:** Idea phase  
**Expected Impact:** Unknown (REPEAT currently 1 use / 5k lines)  
**Effort:** Medium (2-3 hours)  
**Risk:** High (may not improve)

#### Hypothesis
Current REPEAT requires exact token match. TinyStories has structural repetition with variation: "The cat sat. The dog sat. The bird sat." should trigger REPEAT with a slot.

#### Implementation Steps
1. **Phase 1: Pattern Detection** (1 hour)
   - Detect sequences with same structure but different tokens
   - Use edit distance or alignment
   - Extract pattern with slots

2. **Phase 2: Cost Model** (1 hour)
   - Cost = pattern encoding + slot values + count
   - Compare to LITERAL and TEMPLATE

3. **Phase 3: Integration** (1 hour)
   - Add to `_tryRepeatEncoding`
   - Test on synthetic data first

#### Success Metrics
- ✅ REPEAT ops used > 10
- ✅ Average savings > 20 bits/op

#### Failure Conditions
- REPEAT ops used < 5 (not detecting patterns)
- Average savings < 10 bits (not worth it)

#### Decision Point
Only pursue if template learning doesn't capture these patterns.

---

### 🧪 Experiment 5: Semantic Context for COPY (EXPLORATORY)
**Status:** Idea phase  
**Expected Impact:** Unknown  
**Effort:** High (5+ hours)  
**Risk:** High (complex, may not work)

#### Hypothesis
Current COPY only uses recent context (sliding window). Semantic similarity could enable copying from distant but related content.

#### Implementation Steps
1. **Phase 1: Semantic Index** (2 hours)
   - Build group-based index of past content
   - Map sentences to activated groups
   - Store sentence → group signature

2. **Phase 2: Semantic Search** (2 hours)
   - Given current groups, find similar past sentences
   - Use Jaccard similarity on group sets
   - Return top-K candidates for COPY

3. **Phase 3: Integration** (1 hour)
   - Extend `_findCopyMatches` with semantic candidates
   - Adjust cost model (may need offset encoding)

#### Success Metrics
- ✅ Semantic COPY ops > 100
- ✅ BPC improvement > 0.10

#### Failure Conditions
- Semantic COPY ops < 10 (not finding matches)
- BPC increases (cost model wrong)
- Throughput < 200 lines/sec (too slow)

#### Notes
This is speculative. Only pursue if other optimizations plateau.

---

## Experiment Priority Matrix

| Experiment | Impact | Effort | Risk | Priority |
|------------|--------|--------|------|----------|
| Template Learning | High (18%) | Medium | Low | **1** |
| Suffix Array | Medium (48% speed) | High | Medium | **2** |
| Frequency Coding | Medium (14%) | Medium | Low | **3** |
| Fuzzy REPEAT | Low (?) | Medium | High | 4 |
| Semantic COPY | Unknown | High | High | 5 |

---

## Execution Plan

### Week 1: Template Learning
- **Day 1-2:** Implement basic template extraction and matching
- **Day 3:** Tune parameters and benchmark
- **Day 4:** Document results, update specs
- **Target:** BPC < 2.00

### Week 2: Performance Optimization
- **Day 1-3:** Implement suffix array for COPY
- **Day 4:** Benchmark and tune
- **Day 5:** Document results
- **Target:** Throughput > 500 lines/sec

### Week 3: Frequency Coding (if needed)
- **Day 1-2:** Implement frequency tracking and code table
- **Day 3:** Update cost models
- **Day 4:** Benchmark and verify
- **Target:** BPC < 1.90

### Week 4: Evaluation & Next Steps
- Run full benchmark suite
- Compare to baselines (Gzip, bzip2, LZMA)
- Decide on exploratory experiments
- Document findings

---

## Success Criteria (End of Month)

### Minimum Viable
- ✅ BPC < 2.00 (currently 2.20)
- ✅ Throughput > 400 lines/sec (currently 338)
- ✅ Template ops used > 100

### Target
- ✅ BPC < 1.80
- ✅ Throughput > 500 lines/sec
- ✅ Template ops used > 500

### Stretch
- ✅ BPC < 1.60
- ✅ Throughput > 600 lines/sec
- ✅ Multiple compression strategies active

---

## Measurement Protocol

### Before Each Experiment
1. Run baseline benchmark: `node evals/runLM_Comp.mjs --retrain`
2. Record: BPC, throughput, operator usage, memory
3. Save results: `evals/lm_comparative/results/baseline_YYYYMMDD.json`

### After Each Experiment
1. Run experiment benchmark with same data
2. Record same metrics
3. Calculate deltas and statistical significance
4. Document in experiment log

### Comparison Metrics
- **BPC:** Lower is better (target: < 2.00)
- **Throughput:** Higher is better (target: > 500 l/s)
- **Memory:** Lower is better (target: < 300MB)
- **Operator Usage:** Track which strategies win
- **BLiMP Accuracy:** Should not degrade (target: > 30%)

---

## Risk Mitigation

### Technical Risks
1. **Template learning doesn't match:** Start with manual templates to verify cost model
2. **Suffix array too slow:** Fall back to rolling hash or sampling
3. **Frequency coding overhead:** Use static table instead of dynamic Huffman

### Process Risks
1. **Experiments take longer:** Prioritize template learning, defer others
2. **Results don't replicate:** Use fixed random seed, document environment
3. **Regressions:** Keep baseline model, use feature flags for rollback

---

## Next Session Checklist

- [ ] Implement `_findDifferences()` in CompressionMachine
- [ ] Implement `learnTemplates()` with clustering
- [ ] Add sentence buffer to BSPEngine
- [ ] Call template learning every 100 lines
- [ ] Run benchmark and measure impact
- [ ] Document results in experiment log
- [ ] Update optimization plan based on findings

---

**Ready to start:** Template Learning (Experiment 1)
