# BLiMP Grammatical Competence Analysis
**Date:** 2026-01-16  
**Current Score:** 25.3% (below random 50%)  
**Status:** ⚠️ NEEDS IMPROVEMENT

---

## Problem Analysis

### Current Results
- Anaphor agreement: 26.2%
- Determiner-noun 1: 12.6%
- Determiner-noun 2: 37.1%
- **Average: 25.3%** (worse than random!)

### Root Causes

1. **BSP learns co-occurrence, not grammar**
   - Groups form based on "what appears together"
   - No understanding of syntactic rules
   - No subject-verb agreement tracking

2. **Sequence Model is too simple**
   - Current: Bigram/trigram patterns
   - Needed: Long-range dependencies (5-10 tokens)
   - Subject-verb can be separated by many words

3. **Training data has errors**
   - TinyStories is for children, has grammatical errors
   - Model learns incorrect patterns
   - No explicit grammar supervision

4. **Scoring was wrong** (FIXED)
   - Was using `surprise` (novelty)
   - Now using `mdlCost` (probability)
   - Still low because model doesn't understand grammar

---

## Solutions (Priority Order)

### 1. Enhanced Sequence Model 🎯

**Problem**: Current sequence model only tracks bigrams/trigrams

**Solution**: Add longer n-gram context + syntactic features
```javascript
// Current
sequenceModel.learn([word1, word2, word3]);

// Enhanced
sequenceModel.learn([word1, word2, word3, word4, word5], {
  syntax: {
    subject: word1,
    verb: word3,
    agreement: checkAgreement(word1, word3),
  }
});
```

**Expected Impact**: 25% → 35-40% BLiMP

**Effort**: Medium (1-2 days)

---

### 2. Syntactic Groups 🔧

**Problem**: Groups don't distinguish nouns from verbs

**Solution**: Add POS tagging + syntactic group types
```javascript
// Tag tokens
const tagged = posTag(tokens);
// [{ word: 'cat', pos: 'NOUN' }, { word: 'is', pos: 'VERB' }]

// Create syntactic groups
group.type = 'NOUN_SINGULAR';
group.features = { number: 'singular', person: 'third' };

// Check agreement
if (subject.number !== verb.number) {
  penalizeCost();
}
```

**Expected Impact**: 25% → 45-55% BLiMP

**Effort**: High (3-5 days)

---

### 3. Grammar Rules Layer 📚

**Problem**: No explicit grammar knowledge

**Solution**: Add rule-based grammar checker
```javascript
// Define rules
const rules = [
  { pattern: '[NOUN_SINGULAR] [VERB_PLURAL]', valid: false },
  { pattern: '[NOUN_PLURAL] [VERB_SINGULAR]', valid: false },
  { pattern: '[PRONOUN_MALE] himself', valid: true },
  { pattern: '[PRONOUN_FEMALE] himself', valid: false },
];

// Apply during scoring
if (violatesRule(sentence, rules)) {
  cost += GRAMMAR_PENALTY;
}
```

**Expected Impact**: 25% → 60-70% BLiMP

**Effort**: High (5-7 days)

---

### 4. Contrastive Training 🧪

**Problem**: Model never sees good/bad pairs during training

**Solution**: Train on BLiMP-style contrastive pairs
```javascript
// During training
for (const pair of blimpPairs) {
  const goodCost = engine.process(pair.good);
  const badCost = engine.process(pair.bad);
  
  // Reward if good < bad
  if (goodCost < badCost) {
    reinforceGroups(pair.good);
  } else {
    adjustGroups(pair.good, pair.bad);
  }
}
```

**Expected Impact**: 25% → 50-60% BLiMP

**Effort**: Medium (2-3 days)

---

## Recommended Approach

### Phase 1: Quick Win (Start Here)
1. **Fix scoring** ✅ DONE (surprise → mdlCost)
2. **Enhanced Sequence Model** - Add 5-gram context
3. **Target**: 35-40% BLiMP

### Phase 2: Syntactic Awareness
4. **Add POS tagging** (use simple rule-based tagger)
5. **Syntactic groups** with features
6. **Target**: 45-55% BLiMP

### Phase 3: Grammar Rules
7. **Implement basic agreement rules**
8. **Grammar penalty in cost calculation**
9. **Target**: 60-70% BLiMP

---

## Why BLiMP Matters

**For Language Generation:**
- Good grammar = readable output
- Agreement errors = broken sentences
- BLiMP tests core competencies needed for generation

**Current State:**
- Compression: ✅ Excellent (2.15 BPC)
- Generation: ⚠️ Poor (25% BLiMP)

**Conclusion**: BSP compresses well but doesn't understand grammar. For text generation, we NEED to improve BLiMP.

---

## Implementation Priority

**If goal is text generation**: HIGH priority
- Start with Enhanced Sequence Model (1-2 days)
- Then add Syntactic Groups (3-5 days)
- Target: 50%+ BLiMP within 1 week

**If goal is just compression**: LOW priority
- BLiMP doesn't affect compression quality
- Focus on BPC improvement instead

---

## Next Steps

1. Clarify goal: Compression only OR Generation?
2. If generation: Implement Enhanced Sequence Model
3. Measure impact on BLiMP
4. Iterate based on results

---

**Status**: ⚠️ BLiMP scoring fixed, but fundamental grammar understanding needed for good generation.
