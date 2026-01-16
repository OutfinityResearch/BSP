# Grammar Enhancement Implementation Plan

**Goal**: Improve BLiMP from 25% → 50%+ by adding grammatical understanding  
**Principle**: Compression = Understanding, not compression for its own sake

---

## Current Gap Analysis

### What Works
- ✅ Statistical co-occurrence (groups form well)
- ✅ COPY operations (87% win rate)
- ✅ Compression quality (BPC 2.15 < Gzip 2.41)

### What's Missing
- ❌ Grammatical structure (no POS, no features)
- ❌ Agreement checking (subject-verb, det-noun)
- ❌ Sentence boundaries (don't know when to stop)
- ❌ Syntactic constraints (no penalty for errors)

### Why It Matters
**Compression without grammar = pattern matching without understanding**
- Can compress but can't generate coherently
- Can predict but can't maintain agreement
- Can continue but can't stop appropriately

---

## Phase 1: Syntactic Features (Foundation)

### Goal
Add grammatical features to tokens and groups without breaking existing system.

### Components

#### 1.1 Simple POS Tagger
```javascript
// src/core/utils/SimplePOSTagger.mjs
class SimplePOSTagger {
  tag(word) {
    // Rule-based: suffixes, patterns, common words
    if (word.endsWith('ing')) return 'VERB';
    if (word.endsWith('ed')) return 'VERB';
    if (word.endsWith('ly')) return 'ADV';
    if (['the', 'a', 'an'].includes(word)) return 'DET';
    if (['is', 'are', 'was', 'were'].includes(word)) return 'VERB';
    // ... more rules
    return 'NOUN'; // default
  }
  
  extractFeatures(word, pos) {
    const features = { pos };
    
    if (pos === 'NOUN') {
      features.number = word.endsWith('s') ? 'PLURAL' : 'SINGULAR';
    }
    
    if (pos === 'VERB') {
      if (['is', 'was'].includes(word)) features.number = 'SINGULAR';
      if (['are', 'were'].includes(word)) features.number = 'PLURAL';
    }
    
    if (['he', 'she', 'it'].includes(word)) {
      features.person = 'THIRD';
      features.number = 'SINGULAR';
    }
    
    return features;
  }
}
```

#### 1.2 Extend Tokenizer
```javascript
// In Tokenizer.mjs
import { SimplePOSTagger } from './utils/SimplePOSTagger.mjs';

constructor(options) {
  // ... existing code ...
  this.tagger = new SimplePOSTagger();
  this.trackSyntax = options.trackSyntax !== false;
}

tokenize(text) {
  const tokens = this.basicTokenize(text);
  
  if (this.trackSyntax) {
    return tokens.map(word => ({
      word,
      id: this.getOrCreateId(word),
      pos: this.tagger.tag(word),
      features: this.tagger.extractFeatures(word, pos),
    }));
  }
  
  return tokens; // backward compatible
}
```

#### 1.3 Syntactic Groups
```javascript
// In GroupStore.mjs
createGroup(tokens) {
  const group = {
    id: this.nextId++,
    members: new SimpleBitset(this.universeSize),
    // ... existing fields ...
    
    // NEW: Syntactic features
    syntacticProfile: this.extractSyntacticProfile(tokens),
  };
  
  return group;
}

extractSyntacticProfile(tokens) {
  const posCounts = {};
  const features = {};
  
  for (const token of tokens) {
    if (token.pos) {
      posCounts[token.pos] = (posCounts[token.pos] || 0) + 1;
    }
    if (token.features) {
      // Aggregate features
      for (const [key, val] of Object.entries(token.features)) {
        if (!features[key]) features[key] = {};
        features[key][val] = (features[key][val] || 0) + 1;
      }
    }
  }
  
  return {
    dominantPOS: Object.keys(posCounts).sort((a,b) => posCounts[b] - posCounts[a])[0],
    features,
    diversity: Object.keys(posCounts).length,
  };
}
```

#### 1.4 Grammar-Aware Cost
```javascript
// In BSPEngine.mjs
computeMDLCost(surpriseBits, tokens) {
  const baseCost = surpriseBits * Math.log2(this.effectiveUniverseSize);
  
  if (!this.config.useGrammarPenalty) {
    return baseCost;
  }
  
  // Check for grammatical violations
  const grammarPenalty = this.checkGrammar(tokens);
  
  return baseCost + grammarPenalty;
}

checkGrammar(tokens) {
  let penalty = 0;
  
  // Simple agreement check
  for (let i = 0; i < tokens.length - 1; i++) {
    const curr = tokens[i];
    const next = tokens[i + 1];
    
    // Subject-verb agreement
    if (curr.pos === 'NOUN' && next.pos === 'VERB') {
      if (curr.features?.number !== next.features?.number) {
        penalty += 10; // High penalty for disagreement
      }
    }
    
    // Determiner-noun agreement
    if (curr.pos === 'DET' && next.pos === 'NOUN') {
      // 'a' + plural noun = error
      if (curr.word === 'a' && next.features?.number === 'PLURAL') {
        penalty += 5;
      }
    }
  }
  
  return penalty;
}
```

### Expected Impact
- BLiMP: 25% → 40-45%
- BPC: Should stay ~2.15 (grammar helps compression)
- Generation: Basic agreement correctness

---

## Phase 2: Sequence Model Enhancement

### Goal
Capture longer-range dependencies for better grammar understanding.

### Components

#### 2.1 Extended Context Window
```javascript
// In SequenceModel.mjs
learn(tokens, syntacticFeatures) {
  // Current: bigrams/trigrams
  // Enhanced: 5-grams with syntax
  
  for (let i = 0; i < tokens.length - 4; i++) {
    const context = tokens.slice(i, i + 4);
    const target = tokens[i + 4];
    
    // Store with syntactic constraints
    const key = this.makeKey(context, syntacticFeatures);
    this.transitions.set(key, target);
  }
}

predict(context, syntacticConstraints) {
  // Find matches that satisfy constraints
  const candidates = this.findMatches(context);
  
  return candidates.filter(c => 
    this.satisfiesConstraints(c, syntacticConstraints)
  );
}
```

#### 2.2 Dependency Tracking
```javascript
// Simple dependency heuristics
class SimpleDependencyTracker {
  findSubject(tokens) {
    // Heuristic: first noun before verb
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].pos === 'NOUN') {
        // Look for verb after
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].pos === 'VERB') {
            return { subject: tokens[i], verb: tokens[j], distance: j - i };
          }
        }
      }
    }
    return null;
  }
  
  checkAgreement(subject, verb) {
    return subject.features?.number === verb.features?.number;
  }
}
```

### Expected Impact
- BLiMP: 45% → 55-60%
- Better long-range agreement
- Improved context coherence

---

## Phase 3: Generation Control

### Goal
Know when to stop generating, maintain sentence boundaries.

### Components

#### 3.1 Sentence Boundary Detection
```javascript
// In BSPEngine.mjs
isSentenceComplete(tokens) {
  // Check for:
  // 1. Ending punctuation
  if (['.', '!', '?'].includes(tokens[tokens.length - 1]?.word)) {
    // 2. Has subject + verb
    const deps = this.dependencyTracker.findSubject(tokens);
    if (deps && deps.subject && deps.verb) {
      return true;
    }
  }
  
  return false;
}

generate(prompt, maxTokens = 50) {
  const tokens = this.tokenizer.tokenize(prompt);
  
  for (let i = 0; i < maxTokens; i++) {
    const next = this.predictNext(tokens);
    tokens.push(next);
    
    // Stop if sentence complete
    if (this.isSentenceComplete(tokens)) {
      break;
    }
  }
  
  return tokens.map(t => t.word).join(' ');
}
```

#### 3.2 Coherence Scoring
```javascript
scoreCoherence(tokens) {
  let score = 1.0;
  
  // Penalize agreement violations
  const violations = this.findGrammarViolations(tokens);
  score -= violations.length * 0.1;
  
  // Penalize incomplete sentences
  if (!this.isSentenceComplete(tokens)) {
    score -= 0.2;
  }
  
  // Reward proper structure
  if (this.hasProperStructure(tokens)) {
    score += 0.1;
  }
  
  return Math.max(0, Math.min(1, score));
}
```

### Expected Impact
- BLiMP: 60% → 70%+
- Generation: Complete, coherent sentences
- Stopping: Knows when to end

---

## Implementation Order

### Week 1: Foundation
1. Implement SimplePOSTagger
2. Extend Tokenizer with syntax tracking
3. Add syntacticProfile to groups
4. Test: Does it break existing functionality?

### Week 2: Grammar Penalties
5. Implement checkGrammar() in BSPEngine
6. Add grammar penalty to MDL cost
7. Retrain and measure BLiMP
8. Target: 40%+ BLiMP

### Week 3: Dependencies
9. Implement SimpleDependencyTracker
10. Enhance SequenceModel with longer context
11. Add agreement checking to predictions
12. Target: 55%+ BLiMP

### Week 4: Generation
13. Implement sentence boundary detection
14. Add generation control (stopping)
15. Implement coherence scoring
16. Target: 70%+ BLiMP

---

## Success Metrics

### Quantitative
- BLiMP > 50% (Phase 1-2)
- BLiMP > 70% (Phase 3)
- BPC maintained < 2.20
- Throughput > 250 l/s

### Qualitative
**Can generate**:
```
Prompt: "The cat"
Bad: "The cat are running dogs happy"
Good: "The cat is sleeping on the mat."
```

**Maintains agreement**:
```
Prompt: "The dogs"
Bad: "The dogs is playing"
Good: "The dogs are playing in the park."
```

**Knows when to stop**:
```
Prompt: "Once upon a time"
Bad: "Once upon a time there was a cat dog running happy..."
Good: "Once upon a time there was a little cat."
```

---

## Key Principles

1. **Compression = Understanding**
   - Grammar improves compression
   - Better compression = better understanding
   - Not compression for its own sake

2. **No External Dependencies**
   - Pure Node.js implementation
   - Rule-based, simple heuristics
   - Learn from data, not hardcoded rules

3. **Incremental Enhancement**
   - Don't break existing system
   - Add features gradually
   - Measure impact at each step

4. **Grammar Emerges from Compression**
   - Add grammar features to cost
   - Let compression pressure discover rules
   - Online learning continues

---

**Next Action**: Start with Phase 1 - SimplePOSTagger implementation
