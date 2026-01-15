# DS-009: Sequence-Aware Text Generation

## Status: Draft
## Author: BPCM Team
## Date: 2026-01-15

## 1. Problem Statement

Current response generation outputs words in arbitrary order:
```
Input: "The window was broken from inside."
Output: "upon window broken that and of in"
```

The words are relevant but lack grammatical structure. We need to:
1. Learn word order patterns (what follows what)
2. Generate sequences that respect learned transitions
3. Produce readable phrases, not word bags

## 2. Solution Overview

### 2.1 Bigram Transition Matrix

Track which tokens follow which:
```
P(word_j | word_i) = count(word_i -> word_j) / count(word_i)
```

Store as sparse matrix: `Map<tokenId, Map<tokenId, count>>`

### 2.2 Sequence Generation Algorithm

```
1. Start with seed tokens from active groups
2. For each position:
   a. Get candidate next tokens from predictions
   b. Score by: P(next | current) * group_membership
   c. Select highest scoring token
   d. Repeat until length limit or end token
```

### 2.3 Data Structures

```javascript
class SequenceModel {
  transitions: Map<number, Map<number, number>>  // token -> next -> count
  tokenCounts: Map<number, number>               // token -> total count
  startTokens: Map<number, number>               // tokens that start sentences
  endTokens: Set<number>                         // tokens that end sentences
}
```

## 3. Implementation Details

### 3.1 Learning Phase

During `process()`:
```javascript
const tokens = tokenizer.tokenizeWords(text);
for (let i = 0; i < tokens.length - 1; i++) {
  sequenceModel.addTransition(tokens[i], tokens[i + 1]);
}
sequenceModel.addStart(tokens[0]);
sequenceModel.addEnd(tokens[tokens.length - 1]);
```

### 3.2 Generation Phase

```javascript
function generateSequence(seedTokens, maxLength = 10) {
  const sequence = [];
  let current = selectStart(seedTokens);
  
  while (sequence.length < maxLength) {
    sequence.push(current);
    
    if (isEndToken(current)) break;
    
    const candidates = getNextCandidates(current);
    if (candidates.length === 0) break;
    
    current = selectWeighted(candidates);
  }
  
  return sequence;
}
```

### 3.3 Scoring Function

```javascript
function scoreTransition(current, next, groupContext) {
  const transitionProb = getTransitionProb(current, next);
  const groupRelevance = groupContext.has(next) ? 1.5 : 1.0;
  const frequency = Math.log(tokenCounts.get(next) + 1);
  
  return transitionProb * groupRelevance / frequency;
}
```

## 4. Integration Points

- **Tokenizer**: Add `encodeWithPositions()` for sequence tracking
- **Learner**: Call `sequenceModel.learn()` on each input
- **ResponseGenerator**: Use `sequenceModel.generate()` instead of word bags
- **Serialization**: Save/load transition matrix with model

## 5. Performance Considerations

- Limit matrix size to top 50,000 transitions
- Prune low-count transitions periodically
- Use sparse representation (Map, not 2D array)

## 6. Expected Output

Before:
```
"upon window broken that and of in"
```

After:
```
"the window was broken and he saw"
```

## 7. Success Metrics

- Generated sequences are grammatically plausible
- Word order matches training distribution
- Response length: 5-15 tokens
- No repeated tokens in sequence
