# DS-011: Context-Based Response Coherence

## Status: Draft
## Author: BPCM Team  
## Date: 2026-01-15

## 1. Problem Statement

Current responses lack coherence:
1. No connection between consecutive turns
2. Responses don't build on previous context
3. No topic continuity in conversation

Example:
```
User: The detective examined the room.
BPCM: upon room it and of his

User: He found a clue.
BPCM: upon to and it of        <- Lost context of "detective", "room"
```

## 2. Solution Overview

### 2.1 Conversation Context Window

Maintain a sliding window of recent tokens and active groups:
```javascript
class ConversationContext {
  recentTokens: number[]      // Last N tokens seen
  activeTopics: Set<number>   // Group IDs representing topics
  turnCount: number
  
  // Decay older context, boost recent
  getWeightedContext(): Map<number, number>
}
```

### 2.2 Context-Aware Prediction

Modify prediction scoring to consider conversation history:
```
score(prediction) = base_score 
                  * context_relevance 
                  * topic_continuity
```

### 2.3 Topic Tracking

Identify dominant topics in conversation:
```javascript
function updateTopics(activeGroups, context) {
  for (const group of activeGroups) {
    if (group.purity > 0.5) {  // Content-rich group
      context.activeTopics.add(group.id);
    }
  }
  
  // Decay old topics
  context.decayTopics();
}
```

## 3. Implementation Details

### 3.1 Context Window

```javascript
class ConversationContext {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 100;
    this.topicDecay = options.topicDecay || 0.9;
    
    this.recentTokens = [];
    this.tokenWeights = new Map();  // token -> recency weight
    this.activeTopics = new Map();  // groupId -> strength
  }
  
  addTurn(tokens, groups) {
    // Add tokens with recency weight
    for (let i = 0; i < tokens.length; i++) {
      const weight = 1.0 - (i / tokens.length) * 0.5;
      this.recentTokens.push(tokens[i]);
      this.tokenWeights.set(tokens[i], weight);
    }
    
    // Trim to window size
    while (this.recentTokens.length > this.windowSize) {
      const old = this.recentTokens.shift();
      this.tokenWeights.delete(old);
    }
    
    // Update topics
    for (const group of groups) {
      const current = this.activeTopics.get(group.id) || 0;
      this.activeTopics.set(group.id, current + 1);
    }
    
    // Decay all topics
    for (const [id, strength] of this.activeTopics) {
      const newStrength = strength * this.topicDecay;
      if (newStrength < 0.1) {
        this.activeTopics.delete(id);
      } else {
        this.activeTopics.set(id, newStrength);
      }
    }
  }
  
  getContextRelevance(token) {
    return this.tokenWeights.get(token) || 0;
  }
  
  getTopicStrength(groupId) {
    return this.activeTopics.get(groupId) || 0;
  }
}
```

### 3.2 Context-Aware Response Generation

```javascript
function generateWithContext(predictions, context, sequenceModel) {
  const candidates = [];
  
  for (const pred of predictions) {
    const group = store.get(pred.groupId);
    const tokens = extractTokens(group);
    
    for (const token of tokens) {
      const score = 
        pred.strength *                           // Base prediction
        (1 + context.getContextRelevance(token)) * // Context boost
        (1 + context.getTopicStrength(pred.groupId) * 0.5); // Topic continuity
      
      candidates.push({ token, score, groupId: pred.groupId });
    }
  }
  
  // Sort by score and generate sequence
  candidates.sort((a, b) => b.score - a.score);
  return sequenceModel.generateFrom(candidates.slice(0, 20));
}
```

### 3.3 Topic Continuity Bonus

When a response relates to an ongoing topic, boost it:
```javascript
function computeTopicBonus(group, context) {
  // Check if group shares tokens with active topics
  let bonus = 0;
  
  for (const [topicId, strength] of context.activeTopics) {
    const topicGroup = store.get(topicId);
    if (topicGroup) {
      const overlap = group.members.andCardinality(topicGroup.members);
      bonus += overlap * strength * 0.1;
    }
  }
  
  return Math.min(bonus, 2.0);  // Cap bonus
}
```

## 4. Integration Points

- **Session**: Store ConversationContext per session
- **BPCMEngine.process()**: Update context after each turn
- **ResponseGenerator**: Use context for scoring
- **Serialization**: Save/restore context with session

## 5. Session-Level Changes

```javascript
class Session {
  constructor(id, engine) {
    this.id = id;
    this.engine = engine;
    this.context = new ConversationContext();
    // ...
  }
  
  processMessage(content) {
    const result = this.engine.process(content);
    
    // Update conversation context
    const tokens = this.engine.tokenizer.tokenizeWords(content);
    this.context.addTurn(tokens, result.activeGroups);
    
    // Generate with context
    const response = this.responseGenerator.generateWithContext(
      result, 
      this.context
    );
    
    return response;
  }
}
```

## 6. Expected Behavior

Before:
```
User: The detective examined the room.
BPCM: upon room it and of his

User: He found a clue.
BPCM: upon to and it of
```

After:
```
User: The detective examined the room.
BPCM: evidence floor window careful

User: He found a clue.  
BPCM: detective case mystery solved evidence  <- Maintains topic
```

## 7. Success Metrics

- Topic persistence: Same topic words appear across 2-3 turns
- Context relevance: 30%+ of response tokens relate to recent context
- Conversation coherence score (manual evaluation)
- Reduced "topic jumping" between unrelated concepts
