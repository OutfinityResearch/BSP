# BSP Compression Insights & Future Optimizations

**Generated:** 2026-01-16  
**Based on:** 5k lines TinyStories training, 1.9k lines test

---

## 1. What Works Exceptionally Well

### 1.1 COPY Operations (85% Win Rate)
**Observation**: CompressionMachine wins 85% of time on 5k training, primarily through COPY.

**Why it works**:
- TinyStories has high repetition (children's stories with recurring phrases)
- Context window captures previous sentences effectively
- Cost: `log₂(contextLen) + log₂(maxCopyLen) ≈ 14 bits`
- vs LITERAL: `6 tokens × 11 bits = 66 bits`
- **Savings: 79% per match**

**Usage**: 3,637 COPY operations, 26 bits average savings each

**Insight**: LZ77-style compression is extremely effective for narrative text with recurring patterns.

---

### 1.2 Adaptive Universe Sizing
**Observation**: Dynamic universe size based on observed vocabulary.

**Impact**:
- Fixed universe: `log₂(100k) = 16.6 bits/surprise`
- Adaptive (5k lines): `log₂(8966) = 13.1 bits/surprise`
- **Reduction: 21% cost per surprise bit**

**Key Learning**: MDL principle works - use minimum description length for current knowledge state.

---

### 1.3 Vocabulary Decoupling
**Observation**: Separate vocabularies for different purposes.

**Architecture**:
```
BSPEngine.vocabTracker (4,483 tokens)
├── N-grams (1-3) for semantic grouping
└── Used for surprise calculation

CompressionMachine.wordVocab (~1,200 tokens)
├── Unigrams only for cost calculation
└── Used for LITERAL/REPEAT/TEMPLATE costs
```

**Impact**: 21% BPC improvement on 5k training (2.79 → 2.20)

**Insight**: Different subsystems need different granularities - don't force one vocabulary on all.

---

## 2. What Doesn't Work Yet

### 2.1 REPEAT Operations (1 use in 5k lines)
**Observation**: Almost never triggered despite implementation.

**Why it fails**:
- TinyStories has varied vocabulary, not exact repetitions
- "The cat sat. The dog sat." → Different subjects, same structure
- Current REPEAT requires **exact token match**

**Potential Fix**: Fuzzy REPEAT with template-like slots
```javascript
// Current: "A B A B A B" (exact)
// Needed: "The X sat. The Y sat. The Z sat." (pattern with slots)
```

---

### 2.2 Template Learning (0 templates learned)
**Observation**: Structure exists but learning logic not active.

**Why it's not active**:
- Requires pairwise comparison of sentences (O(N²))
- Need fuzzy matching, not exact match
- Threshold tuning needed (how similar is "similar enough"?)

**Expected Impact**: 50% compression on template-matching sentences
- "The [noun] was [adjective]." → 2 slots vs 6 tokens
- Cost: `log₂(templates) + 2×log₂(vocab) ≈ 30 bits`
- vs LITERAL: `6 × 11 = 66 bits`
- **Potential savings: 55%**

---

### 2.3 Group-Based Compression (2.98 BPC alone)
**Observation**: Groups alone perform 26% worse than combined system.

**Why groups struggle**:
- Surprise count stays high (many tokens don't match groups)
- N-gram vocabulary inflates universe size (13.1 bits/surprise)
- No temporal structure captured (just set membership)

**Insight**: Groups are good for **semantic clustering**, not compression. CompressionMachine handles compression.

---

## 3. Scaling Behavior

### 3.1 Training Data Scaling
| Lines | BPC | Program Wins | Groups | Vocab | Throughput |
|-------|-----|--------------|--------|-------|------------|
| 1k | 2.04 | 48.1% | 595 | 2,156 | 535 l/s |
| 5k | 2.20 | 85.0% | 1,144 | 4,483 | 338 l/s |

**Observations**:
- BPC increases slightly (2.04 → 2.20) but stays well below Gzip (2.41)
- Program win rate increases dramatically (48% → 85%)
- Throughput decreases due to O(N×M) COPY search
- Groups scale linearly (~0.23 groups/line)

**Insight**: More training data → more context → better COPY matches → higher win rate.

---

### 3.2 Performance Bottleneck
**Current**: `_findCopyMatches` is O(N×M)
- N = context length (grows with training)
- M = tokens to encode
- Impact: 535 → 338 lines/sec (37% slowdown)

**Solution**: Suffix Array
- Build once per context update: O(N log N)
- Query: O(log N + M)
- Expected throughput: 500+ lines/sec

---

## 4. Compression Strategy Insights

### 4.1 Hybrid Architecture Works
**Observation**: Racing group-based vs program-based encoding.

```javascript
const groupCost = surpriseBits × log₂(effectiveUniverse);
const programCost = program.cost;  // COPY/REPEAT/TEMPLATE
const bestCost = Math.min(groupCost, programCost);
```

**Results**:
- Group-only: 2.98 BPC
- Program-only: Would be worse (no semantic understanding)
- **Combined: 2.20 BPC** (26% better than groups alone)

**Insight**: Complementary systems - groups for semantics, programs for structure.

---

### 4.2 Context Window is Critical
**Observation**: COPY operations dominate when context is available.

**Current**: Sliding window of recent tokens
**Usage**: 3,637 COPY operations (85% of encodings)

**Potential Improvements**:
1. **Longer context**: More opportunities for matches
2. **Semantic context**: Copy from similar (not just recent) content
3. **Hierarchical context**: Paragraph-level, document-level

---

### 4.3 Cost Model Accuracy Matters
**Observation**: Incorrect vocabulary size caused 21% BPC degradation.

**Lesson**: Cost calculation must reflect **actual encoding cost**, not theoretical maximum.

**Applied**:
- ✅ Use unigram vocab for LITERAL cost (not n-grams)
- ✅ Use adaptive universe for surprise cost (not fixed 100k)
- ⏳ TODO: Frequency-weighted coding (Huffman-style)

---

## 5. Future Optimization Priorities

### Priority 1: Template Learning 🎯
**Expected Impact**: 2.20 → ~1.80 BPC (18% improvement)

**Why**: TinyStories has highly repetitive structures
- "Once upon a time, there was a [noun]."
- "The [noun] was [adjective]."
- "[Name] went to the [place]."

**Implementation**:
1. Collect sentence buffer (100-500 sentences)
2. Cluster by length and structure
3. Pairwise alignment (Needleman-Wunsch or simple diff)
4. Extract templates with >50% fixed content
5. Store template ID + slot values

**Cost Model**:
```javascript
templateCost = log₂(numTemplates) + slots.length × log₂(vocab)
// Example: log₂(100) + 2×log₂(1200) ≈ 7 + 22 = 29 bits
// vs LITERAL: 6 × 11 = 66 bits
// Savings: 56%
```

---

### Priority 2: Suffix Array for COPY 🚀
**Expected Impact**: 338 → 500+ lines/sec (48% throughput increase)

**Why**: Current O(N×M) scan is bottleneck

**Implementation**:
1. Build suffix array on context window
2. Use binary search for longest match
3. Update incrementally as context slides

**Complexity**:
- Build: O(N log N) once per context update
- Query: O(log N + M) per encoding
- vs Current: O(N × M) per encoding

---

### Priority 3: Frequency-Weighted Coding
**Expected Impact**: 2.20 → ~1.90 BPC (14% improvement)

**Why**: High-frequency words should cost less

**Current**: All words cost `log₂(vocab) ≈ 11 bits`

**Proposed**: Huffman-style encoding
- Top 100 words (50% of text): ~7 bits
- Common words (30% of text): ~10 bits
- Rare words (20% of text): ~14 bits
- **Average: ~9 bits** (18% reduction)

**Implementation**:
1. Track word frequencies during training
2. Build Huffman tree or use static code table
3. Update cost calculations in all operators

---

## 6. Theoretical Limits

### 6.1 Shannon Entropy: 4.38 BPC
**Observation**: Character-level entropy of TinyStories test set.

**Current**: 2.20 BPC (50% of entropy)
**Gzip**: 2.41 BPC (55% of entropy)

**Insight**: We're already compressing below character entropy by exploiting word-level structure.

---

### 6.2 Compression Ceiling
**Estimate**: ~1.50 BPC achievable with all optimizations

**Breakdown**:
- Current: 2.20 BPC
- Template learning: -0.30 BPC → 1.90
- Frequency coding: -0.20 BPC → 1.70
- Better grouping: -0.20 BPC → 1.50

**Limit**: Semantic content + grammatical structure ≈ 1.50 BPC for children's stories.

---

## 7. Key Takeaways

1. **LZ77-style COPY dominates** for narrative text (85% win rate)
2. **Vocabulary decoupling is critical** - different subsystems need different granularities
3. **Adaptive sizing works** - MDL principle reduces cost by 21%
4. **Hybrid architecture is essential** - groups for semantics, programs for structure
5. **Template learning is the next big win** - 18% expected improvement
6. **Performance optimization needed** - Suffix array for 48% throughput gain
7. **Cost model accuracy matters** - incorrect vocab caused 21% degradation

---

## 8. Comparison to Traditional LLMs

| Aspect | Traditional LLM | BSP |
|--------|-----------------|-----|
| **Compression** | Implicit (in weights) | Explicit (programs + groups) |
| **Repetition** | Memorized patterns | COPY operations |
| **Structure** | Attention mechanism | Templates |
| **Semantics** | Embeddings | Groups |
| **Learning** | Batch gradient descent | Online incremental |
| **Interpretability** | Opaque | Transparent (see programs) |

**BSP Advantage**: Explicit compression makes it clear **why** something compresses well.

---

**Next Session**: Implement Template Learning and measure impact on BPC.
