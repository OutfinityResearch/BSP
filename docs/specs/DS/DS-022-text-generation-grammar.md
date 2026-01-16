# DS-022: Emergent Grammar Through Compression

**Version**: 2.0  
**Status**: Design Principle  
**Author**: BSP Team  
**Date**: 2026-01-16

---

## 1. Core Principle

### 1.1 The Fundamental Insight

**Grammar is NOT something we add - it EMERGES from proper compression.**

If our compression is truly optimal, grammatical sequences MUST have lower cost than ungrammatical ones, because:
- Grammatical sequences are MORE FREQUENT in training data
- More frequent = more predictable = lower surprise = better compression
- Therefore: **optimal compression ⟹ grammatical understanding**

### 1.2 Why We Were Failing

Our compression was incomplete:
- **Group-based compression**: Captures co-occurrence (which words appear together)
- **Missing**: Sequence cost (which word ORDER is likely)

```
Current MDL = surprise_bits × log₂(universe)
              ↑ only measures WHAT appears, not in what ORDER
```

### 1.3 The Fix

```
Complete MDL = group_cost + sequence_cost

where:
  group_cost    = surprise_bits × log₂(universe)    [WHAT appears]
  sequence_cost = -Σ log₂(P(token_i | token_{i-1})) [in what ORDER]
```

**This is domain-agnostic** - works for language, music, signals, any sequential data.

---

## 2. Why This Works

### 2.1 Grammar = Transition Patterns

Consider:
- "the cat is" → frequent transition pattern → low sequence cost
- "the cat are" → rare transition pattern → high sequence cost

**We don't need POS tags or grammar rules.** The transition model learns:
- "the" is usually followed by nouns
- singular nouns are usually followed by singular verbs
- etc.

All from raw statistics of what sequences appear in training data.

### 2.2 Mathematical Foundation

For a sequence of tokens `t₁, t₂, ..., tₙ`:

```
P(sequence) = P(t₁) × P(t₂|t₁) × P(t₃|t₂) × ... × P(tₙ|tₙ₋₁)

Cost(sequence) = -log₂(P(sequence))
               = -log₂(P(t₁)) - Σᵢ log₂(P(tᵢ|tᵢ₋₁))
```

**Lower cost = higher probability = more grammatical/natural**

### 2.3 BLiMP Prediction

For minimal pairs like:
- Good: "The authors have helped"
- Bad: "The authors has helped"

The model that better compresses training data will:
1. Have seen "authors have" more than "authors has"
2. Assign lower cost to the good sentence
3. Choose correctly in BLiMP evaluation

---

## 3. Implementation

### 3.1 SequenceModel Already Exists

We already have `SequenceModel` with:
- `learn(tokens)` - learns transition probabilities
- `getTransitionProb(current, next)` - returns P(next|current)

**What was missing**: Using this in MDL cost!

### 3.2 New Method: getSequenceCost()

```javascript
getSequenceCost(tokens) {
  let cost = 0;
  for (let i = 0; i < tokens.length - 1; i++) {
    const prob = this.getTransitionProb(tokens[i], tokens[i+1]);
    cost += prob > 0 ? -Math.log2(prob) : UNKNOWN_PENALTY;
  }
  return cost;
}
```

### 3.3 Enhanced MDL in BSPEngine

```javascript
computeMDLCost(surpriseBits, tokens) {
  const groupCost = surpriseBits * Math.log2(this.effectiveUniverseSize);
  const sequenceCost = this.sequenceModel.getSequenceCost(tokens);
  
  // Weight factor balances the two components
  return groupCost + this.config.sequenceCostWeight * sequenceCost;
}
```

---

## 4. Design Constraints

### 4.1 NO Hardcoded Rules

❌ **WRONG approach**:
```javascript
if (subject.number !== verb.number) {
  penalty += 10; // Hardcoded grammar rule
}
```

✅ **CORRECT approach**:
```javascript
// Just use transition probability
const cost = -log2(P("are" | "cats")); // Learned from data
```

### 4.2 NO Domain-Specific Knowledge

❌ **WRONG**: POS tags, grammar categories, linguistic features
✅ **CORRECT**: Raw transition probabilities from observed sequences

The system should work identically for:
- English text
- Romanian text
- Musical notes
- Protein sequences
- Any sequential data

### 4.3 NO External Dependencies

- Pure statistics from training data
- No NLP libraries
- No pre-trained models
- Everything learned online

---

## 5. Expected Behavior

### 5.1 After Training on English

The model will have learned (implicitly):
- "the cat is" has low cost (frequent pattern)
- "the cat are" has high cost (rare pattern)
- "cats are" has low cost
- "cats is" has high cost

**Without ever knowing what "singular" or "plural" means.**

### 5.2 For BLiMP Evaluation

```
Sentence A: "The cats are sleeping"
Sentence B: "The cats is sleeping"

sequence_cost(A) < sequence_cost(B)

Because P("are"|"cats") >> P("is"|"cats")

Therefore: Model prefers A (correct!)
```

### 5.3 For Generation

When generating after "The cats":
- Candidate "are": low cost → high probability → likely selected
- Candidate "is": high cost → low probability → unlikely selected

**Grammar emerges naturally from compression objective.**

---

## 6. Configuration

### 6.1 Parameters

```javascript
{
  // Weight of sequence cost in total MDL
  sequenceCostWeight: 1.0,
  
  // Penalty for unknown transitions (in bits)
  unknownTransitionPenalty: 10,
  
  // Smoothing for transition probabilities
  smoothing: 'addAlpha',
  smoothingAlpha: 0.1,
}
```

### 6.2 Tuning

- `sequenceCostWeight` too low → ignores word order → bad grammar
- `sequenceCostWeight` too high → ignores content → repetitive output
- Optimal value found empirically (start with 1.0)

---

## 7. Metrics

### 7.1 BLiMP Score

Target: From current ~25% to >50% (better than random)

The improvement should be **automatic** - just from adding sequence cost to MDL.

### 7.2 Sequence Perplexity

```
PPL = 2^(average_sequence_cost_per_token)
```

Lower PPL = better sequence model = better grammar.

### 7.3 Compression Ratio

BPC should stay the same or improve - grammar helps compression.

---

## 8. Why This Is Fundamental

### 8.1 Occam's Razor

The simplest explanation:
- Grammar = patterns that appear frequently
- Frequent patterns = low cost to encode
- Therefore: Grammar = low encoding cost

No additional machinery needed.

### 8.2 Universality

This approach works for ANY sequential domain:
- Language: "the cat is" vs "the cat are"
- Music: chord progressions that "sound right"
- DNA: valid vs invalid gene sequences
- Code: syntactically valid vs invalid programs

**Same algorithm, different training data.**

### 8.3 Emergence

Grammar is not programmed - it emerges from:
1. Training data (what sequences are frequent)
2. Compression objective (minimize cost)
3. Statistical learning (transition probabilities)

This is how humans learn grammar too - from exposure, not rules.

---

## 9. Anti-Patterns to Avoid

### 9.1 Rule-Based Grammar

❌ Don't add:
- POS taggers
- Agreement checkers
- Syntax parsers
- Grammar rules

These are symptoms of not trusting the compression principle.

### 9.2 Domain-Specific Features

❌ Don't add:
- Linguistic features (number, person, tense)
- Language-specific rules
- Hardcoded word lists

If you need these, your compression is incomplete.

### 9.3 Post-Hoc Filtering

❌ Don't:
- Generate then filter ungrammatical sentences
- Add grammar check as post-processing

Grammar should be IN the generation process via cost.

---

## 10. Boundary Tokens Are IN The Signal

### 10.1 The Key Insight

**We don't ADD boundary tokens - they ALREADY EXIST in the input signal.**

Every structured signal has natural separators:

| Domain | Level 1 | Level 2 | Level 3 | Level 4 |
|--------|---------|---------|---------|---------|
| **Text** | space (word) | . ! ? (sentence) | \n\n (paragraph) | === (section) |
| **Music** | rest (phrase) | bar line (measure) | fermata (section) | movement end |
| **Code** | ; (statement) | } (block) | blank line (section) | file end |
| **Video** | cut (shot) | fade (scene) | title card (act) | credits |
| **DNA** | codon (amino acid) | stop codon (protein) | promoter (gene) | chromosome end |

### 10.2 How To Recognize Separators

A separator is a token with **high transition entropy**:

```javascript
function isSeparator(token) {
  // Get all tokens that can follow this one
  const nextTokens = getNextCandidates(token);
  
  // Compute entropy of next-token distribution
  const entropy = -sum(nextTokens.map(t => t.prob * log2(t.prob)));
  
  // High entropy = many possible followers = separator
  return entropy > SEPARATOR_THRESHOLD;
}

// Examples:
// "." → entropy ≈ 8 bits (can be followed by almost any word)
// "the" → entropy ≈ 3 bits (usually followed by noun/adjective)
// "of" → entropy ≈ 4 bits (followed by noun phrase)
```

### 10.3 Hierarchical Structure Emerges

The system automatically discovers:
1. **Word level**: spaces separate tokens
2. **Phrase level**: certain words have low transition entropy (tight coupling)
3. **Sentence level**: . ! ? have high transition entropy (reset context)
4. **Paragraph level**: \n\n has even higher entropy (topic change)

**No hardcoding required** - just entropy analysis of transitions.

### 10.4 Implementation

```javascript
class TransitionAnalyzer {
  // Compute transition entropy for each token
  computeEntropyMap() {
    const entropyMap = new Map();
    
    for (const [token, nextMap] of this.transitions) {
      const total = this.tokenCounts.get(token);
      let entropy = 0;
      
      for (const count of nextMap.values()) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
      
      entropyMap.set(token, entropy);
    }
    
    return entropyMap;
  }
  
  // Find natural separator tokens
  findSeparators(threshold = 5.0) {
    const entropyMap = this.computeEntropyMap();
    return [...entropyMap.entries()]
      .filter(([_, entropy]) => entropy > threshold)
      .map(([token, _]) => token);
  }
}
```

### 10.5 Cross-Modal Generalization

The same algorithm works for ANY sequential data:
- Learn transition probabilities
- Compute entropy per token
- High entropy = separator
- Patterns within separators = structure

**One algorithm, infinite domains.**

---

## 11. Variable-Length Pattern Learning

### 11.1 The Insight

Grammar structures have **variable lengths**:
- "the cat" (2 tokens)
- "the big cat" (3 tokens)
- "the very big cat" (4 tokens)
- "the extremely very big cat" (5 tokens)

All are valid. The compression system should learn ALL of them, not just fixed-size n-grams.

### 11.2 How It Works

The CompressionMachine already does this via COPY operations:
1. **Observe**: "the cat is" appears frequently
2. **Store**: Add to pattern library with usage count
3. **Compress**: Next time "the cat is" appears, use COPY (cheap) instead of LITERAL (expensive)
4. **Rank**: Frequent patterns get lower cost (log₂(rank))

### 11.3 Pattern Storage During Sleep

```javascript
// During sleep consolidation:
function discoverPhrasePatterns(compressionStats) {
  // Find patterns that saved the most bits
  const topPatterns = compressionStats.getTopPatterns();
  
  for (const pattern of topPatterns) {
    if (pattern.frequency >= MIN_FREQUENCY) {
      // Promote to permanent phrase group
      const phraseGroup = groupStore.create(
        encodePhrase(pattern.tokens),
        0.5,
        'CONTENT'  // Phrase groups are content, not transforms
      );
      phraseGroup.tokens = pattern.tokens;  // Store original tokens
      phraseGroup.rank = pattern.rank;
    }
  }
}
```

### 11.4 BLiMP Evaluation Using Compression Cost

The key insight: **grammatical sentences compress better**.

```javascript
function evaluateBLiMP(goodSentence, badSentence) {
  // Full compression cost, not just bigram transitions
  const goodCost = compressionMachine.encode(
    tokenize(goodSentence), 
    globalContext
  ).cost;
  
  const badCost = compressionMachine.encode(
    tokenize(badSentence),
    globalContext
  ).cost;
  
  // Lower cost = more compressible = more frequent = more grammatical
  return goodCost < badCost;
}
```

---

## 12. Summary

**One sentence**: Grammar emerges from sequence transition costs in the MDL objective.

**One equation**: `MDL = group_cost + sequence_cost`

**One principle**: If it's frequent in data, it has low cost. Grammar is what's frequent.

---

## References

- DS-009: Sequence Generation (SequenceModel implementation)
- DS-020: Adaptive Universe (MDL cost calculation)
- DS-021: Compression Machine (alternative encoding)

---

**Remember**: Every time you're tempted to add a grammar rule, ask yourself: "Why doesn't my compression already capture this?" The answer is always: "Because I'm not measuring the right thing."
