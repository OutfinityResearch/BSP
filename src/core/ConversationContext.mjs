/**
 * ConversationContext - Tracks conversation state for coherent responses
 * Implements DS-013: Context-Based Response Coherence
 */

class ConversationContext {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 100;
    this.topicDecay = options.topicDecay || 0.85;
    this.maxTopics = options.maxTopics || 20;
    
    // Recent tokens with recency weights
    this.recentTokens = [];
    this.tokenWeights = new Map();  // token -> weight
    
    // Active topics (group IDs) with strength
    this.activeTopics = new Map();  // groupId -> strength
    
    // Turn counter
    this.turnCount = 0;
    
    // Keywords from conversation
    this.keywords = new Map();  // token -> importance score
  }

  /**
   * Add a new turn to the context
   * @param {string[]} tokens - Tokens from the input
   * @param {object[]} activeGroups - Groups activated by this input
   * @param {object} options
   */
  addTurn(tokens, activeGroups, options = {}) {
    const { importance = 1.0 } = options;
    
    this.turnCount++;
    
    // Add tokens with recency weight
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // Position-based weight (earlier in sentence = slightly lower)
      const positionWeight = 0.7 + 0.3 * (i / Math.max(1, tokens.length - 1));
      const weight = importance * positionWeight;
      
      this.recentTokens.push(token);
      this.tokenWeights.set(token, Math.max(
        this.tokenWeights.get(token) || 0,
        weight
      ));
    }
    
    // Trim to window size (FIFO)
    while (this.recentTokens.length > this.windowSize) {
      const oldToken = this.recentTokens.shift();
      // Reduce weight of old tokens
      const currentWeight = this.tokenWeights.get(oldToken) || 0;
      if (currentWeight <= 0.1) {
        this.tokenWeights.delete(oldToken);
      } else {
        this.tokenWeights.set(oldToken, currentWeight * 0.5);
      }
    }
    
    // Update active topics from groups
    for (const group of activeGroups) {
      const current = this.activeTopics.get(group.id) || 0;
      // Boost based on group salience and importance
      const boost = (group.salience || 0.5) * importance;
      this.activeTopics.set(group.id, current + boost);
    }
    
    // Decay all topics
    this._decayTopics();
    
    // Update keywords
    this._updateKeywords(tokens, importance);
  }

  /**
   * Decay topic strengths over time
   * @private
   */
  _decayTopics() {
    const toRemove = [];
    
    for (const [topicId, strength] of this.activeTopics) {
      const newStrength = strength * this.topicDecay;
      
      if (newStrength < 0.05) {
        toRemove.push(topicId);
      } else {
        this.activeTopics.set(topicId, newStrength);
      }
    }
    
    // Remove weak topics
    for (const id of toRemove) {
      this.activeTopics.delete(id);
    }
    
    // Limit number of topics
    if (this.activeTopics.size > this.maxTopics) {
      const sorted = [...this.activeTopics.entries()]
        .sort((a, b) => b[1] - a[1]);
      
      this.activeTopics = new Map(sorted.slice(0, this.maxTopics));
    }
  }

  /**
   * Update keyword importance
   * @private
   */
  _updateKeywords(tokens, importance) {
    for (const token of tokens) {
      if (token.length < 3) continue;  // Skip short tokens
      
      const current = this.keywords.get(token) || 0;
      this.keywords.set(token, current + importance);
    }
    
    // Decay keywords
    for (const [token, score] of this.keywords) {
      const newScore = score * 0.9;
      if (newScore < 0.1) {
        this.keywords.delete(token);
      } else {
        this.keywords.set(token, newScore);
      }
    }
    
    // Limit keywords
    if (this.keywords.size > 100) {
      const sorted = [...this.keywords.entries()]
        .sort((a, b) => b[1] - a[1]);
      this.keywords = new Map(sorted.slice(0, 50));
    }
  }

  /**
   * Get relevance score for a token based on context
   * @param {string} token 
   * @returns {number}
   */
  getTokenRelevance(token) {
    const recency = this.tokenWeights.get(token) || 0;
    const keyword = this.keywords.get(token) || 0;
    
    return recency + keyword * 0.5;
  }

  /**
   * Get strength of a topic (group)
   * @param {number} groupId 
   * @returns {number}
   */
  getTopicStrength(groupId) {
    return this.activeTopics.get(groupId) || 0;
  }

  /**
   * Check if a topic is currently active
   * @param {number} groupId 
   * @returns {boolean}
   */
  isTopicActive(groupId) {
    return this.activeTopics.has(groupId);
  }

  /**
   * Get all active topic IDs sorted by strength
   * @returns {number[]}
   */
  getActiveTopicIds() {
    return [...this.activeTopics.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }

  /**
   * Get top keywords from context
   * @param {number} n 
   * @returns {string[]}
   */
  getTopKeywords(n = 10) {
    return [...this.keywords.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([token]) => token);
  }

  /**
   * Score a candidate response token
   * @param {string} token 
   * @param {number} groupId - Group this token came from
   * @returns {number}
   */
  scoreCandidate(token, groupId) {
    let score = 1.0;
    
    // Context relevance boost
    const relevance = this.getTokenRelevance(token);
    score *= (1 + relevance);
    
    // Topic continuity boost
    const topicStrength = this.getTopicStrength(groupId);
    score *= (1 + topicStrength * 0.5);
    
    // Keyword boost
    if (this.keywords.has(token)) {
      score *= 1.2;
    }
    
    return score;
  }

  /**
   * Clear context (start fresh)
   */
  reset() {
    this.recentTokens = [];
    this.tokenWeights.clear();
    this.activeTopics.clear();
    this.keywords.clear();
    this.turnCount = 0;
  }

  /**
   * Get statistics
   * @returns {object}
   */
  getStats() {
    return {
      turnCount: this.turnCount,
      recentTokens: this.recentTokens.length,
      activeTopics: this.activeTopics.size,
      keywords: this.keywords.size,
      topTopics: [...this.activeTopics.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, strength]) => ({ id, strength: strength.toFixed(2) }))
    };
  }

  /**
   * Serialize to JSON
   * @returns {object}
   */
  toJSON() {
    return {
      turnCount: this.turnCount,
      recentTokens: this.recentTokens.slice(-50),  // Keep last 50
      tokenWeights: [...this.tokenWeights.entries()].slice(0, 100),
      activeTopics: [...this.activeTopics.entries()],
      keywords: [...this.keywords.entries()].slice(0, 50)
    };
  }

  /**
   * Deserialize from JSON
   * @param {object} json 
   * @returns {ConversationContext}
   */
  static fromJSON(json) {
    const context = new ConversationContext();
    
    context.turnCount = json.turnCount || 0;
    context.recentTokens = json.recentTokens || [];
    
    if (json.tokenWeights) {
      for (const [token, weight] of json.tokenWeights) {
        context.tokenWeights.set(token, weight);
      }
    }
    
    if (json.activeTopics) {
      for (const [id, strength] of json.activeTopics) {
        context.activeTopics.set(id, strength);
      }
    }
    
    if (json.keywords) {
      for (const [token, score] of json.keywords) {
        context.keywords.set(token, score);
      }
    }
    
    return context;
  }
}

export { ConversationContext };
