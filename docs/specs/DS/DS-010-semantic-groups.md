# DS-010: Semantic Group Specialization

## Status: Draft
## Author: BPCM Team
## Date: 2026-01-15

## 1. Problem Statement

Current groups are too generic, containing mostly stopwords:
```
G0: and, to, was, my, i, the, had, with, she, in...
G1: and, to, was, my, i, the, had, in, of, it...
```

Groups should capture **semantic concepts**, not just co-occurring function words:
```
G_ship: ship, sail, captain, crew, ocean, voyage, deck
G_detective: detective, clue, evidence, mystery, case, solve
```

## 2. Solution Overview

### 2.1 TF-IDF Weighting for Group Members

Not all tokens are equally important. Weight by inverse document frequency:
```
weight(token) = log(totalDocs / docsWithToken)
```

Stopwords appear everywhere → low weight
Content words appear selectively → high weight

### 2.2 Group Purity Score

Measure how "focused" a group is:
```
purity = sum(weights of content words) / sum(all weights)
```

Split groups with low purity into specialized subgroups.

### 2.3 Semantic Clustering

When creating groups, prefer tokens that:
1. Co-occur frequently (existing behavior)
2. Have similar IDF weights (new)
3. Share n-gram patterns (new)

## 3. Implementation Details

### 3.1 IDF Computation

```javascript
class IDFTracker {
  documentCount: number
  tokenDocCounts: Map<number, number>  // token -> docs containing it
  
  update(tokens: Set<number>) {
    this.documentCount++;
    for (const token of tokens) {
      this.tokenDocCounts.set(token, 
        (this.tokenDocCounts.get(token) || 0) + 1);
    }
  }
  
  getIDF(token: number): number {
    const docCount = this.tokenDocCounts.get(token) || 1;
    return Math.log(this.documentCount / docCount);
  }
  
  isStopword(token: number): boolean {
    // Appears in more than 30% of documents
    return (this.tokenDocCounts.get(token) || 0) > 
           this.documentCount * 0.3;
  }
}
```

### 3.2 Group Creation with IDF

```javascript
maybeCreateGroup(surprise, input, store) {
  // Filter out stopwords from group seed
  const inputBits = input.toArray();
  const contentBits = inputBits.filter(
    bit => !this.idfTracker.isStopword(bit)
  );
  
  // Only create group from content words
  if (contentBits.length >= this.minGroupSize) {
    return store.create(contentBits, 0.5);
  }
  return null;
}
```

### 3.3 Group Splitting

Periodically check groups for purity:
```javascript
function splitLowPurityGroups(store, idfTracker) {
  for (const group of store.getAll()) {
    const purity = computePurity(group, idfTracker);
    
    if (purity < 0.3) {
      // Split into content-focused subgroups
      const contentBits = group.members.toArray()
        .filter(b => !idfTracker.isStopword(b));
      
      if (contentBits.length >= 2) {
        store.create(contentBits, group.salience);
      }
    }
  }
}
```

### 3.4 Stopword Handling

Don't ignore stopwords entirely - they're useful for:
- Sequence generation (grammar)
- Context matching

But exclude them from:
- Group creation seeds
- Group purity calculations
- Response content word selection

## 4. Data Structures

```javascript
// Add to Learner
class Learner {
  idfTracker: IDFTracker
  
  // Existing fields...
}

// Add to GroupStore
class GroupStore {
  getContentGroups(): Group[]  // Groups with purity > threshold
  getTopicGroups(): Group[]    // Groups representing semantic topics
}
```

## 5. Integration Points

- **Learner**: Track IDF during learning, filter group creation
- **GroupStore**: Add purity computation, group splitting
- **ResponseGenerator**: Prefer content words from high-purity groups
- **Serialization**: Save IDF statistics

## 6. Expected Output

Before (generic groups):
```
G0: and, to, was, my, i, the, had, with, she, in...
```

After (semantic groups):
```
G_nautical: ship, captain, sail, ocean, deck, crew, voyage
G_mystery: detective, clue, evidence, crime, suspect, murder
G_nature: forest, tree, river, mountain, sky, wind, rain
```

## 7. Success Metrics

- Average group purity > 0.5
- Content word ratio in responses > 60%
- Semantic coherence: group members are topically related
- Fewer redundant groups (groups with high Jaccard similarity)
