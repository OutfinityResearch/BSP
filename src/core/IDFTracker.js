/**
 * IDFTracker - Tracks Inverse Document Frequency for semantic weighting
 * Implements DS-010: Semantic Group Specialization
 */

class IDFTracker {
  constructor(options = {}) {
    this.stopwordThreshold = options.stopwordThreshold || 0.25;  // 25% of docs
    this.maxVocab = options.maxVocab || 100000;
    
    this.documentCount = 0;
    this.tokenDocCounts = new Map();  // token -> number of docs containing it
  }

  /**
   * Update IDF counts from a document (sentence/input)
   * @param {string[]|Set<string>} tokens - Unique tokens in document
   */
  update(tokens) {
    this.documentCount++;
    
    // Get unique tokens
    const uniqueTokens = tokens instanceof Set ? tokens : new Set(tokens);
    
    for (const token of uniqueTokens) {
      this.tokenDocCounts.set(token, (this.tokenDocCounts.get(token) || 0) + 1);
    }
    
    // Periodic cleanup
    if (this.documentCount % 10000 === 0) {
      this.prune();
    }
  }

  /**
   * Get IDF score for a token
   * Higher = more rare/specific, Lower = more common
   * @param {string} token 
   * @returns {number}
   */
  getIDF(token) {
    const docCount = this.tokenDocCounts.get(token) || 1;
    return Math.log((this.documentCount + 1) / (docCount + 1));
  }

  /**
   * Get TF-IDF score for a token given its frequency in a document
   * @param {string} token 
   * @param {number} termFrequency 
   * @returns {number}
   */
  getTFIDF(token, termFrequency = 1) {
    return termFrequency * this.getIDF(token);
  }

  /**
   * Check if token is a stopword (very common)
   * @param {string} token 
   * @returns {boolean}
   */
  isStopword(token) {
    if (this.documentCount === 0) return false;
    
    const docCount = this.tokenDocCounts.get(token) || 0;
    return docCount > this.documentCount * this.stopwordThreshold;
  }

  /**
   * Check if token is a content word (not a stopword)
   * @param {string} token 
   * @returns {boolean}
   */
  isContentWord(token) {
    return !this.isStopword(token);
  }

  /**
   * Get document frequency ratio
   * @param {string} token 
   * @returns {number} 0-1
   */
  getDocFrequencyRatio(token) {
    if (this.documentCount === 0) return 0;
    return (this.tokenDocCounts.get(token) || 0) / this.documentCount;
  }

  /**
   * Filter tokens to content words only
   * @param {string[]} tokens 
   * @returns {string[]}
   */
  filterContentWords(tokens) {
    return tokens.filter(t => this.isContentWord(t));
  }

  /**
   * Score tokens by semantic importance (IDF)
   * @param {string[]} tokens 
   * @returns {Array<{token: string, score: number}>}
   */
  scoreTokens(tokens) {
    return tokens.map(token => ({
      token,
      score: this.getIDF(token),
      isContent: this.isContentWord(token)
    })).sort((a, b) => b.score - a.score);
  }

  /**
   * Get top content words from tokens
   * @param {string[]} tokens 
   * @param {number} n 
   * @returns {string[]}
   */
  getTopContentWords(tokens, n = 10) {
    return this.scoreTokens(tokens)
      .filter(t => t.isContent)
      .slice(0, n)
      .map(t => t.token);
  }

  /**
   * Compute purity of a set of tokens (ratio of content to total)
   * @param {string[]} tokens 
   * @returns {number} 0-1
   */
  computePurity(tokens) {
    if (tokens.length === 0) return 0;
    
    const contentWords = tokens.filter(t => this.isContentWord(t));
    return contentWords.length / tokens.length;
  }

  /**
   * Prune low-frequency tokens to save memory
   */
  prune() {
    if (this.tokenDocCounts.size <= this.maxVocab) return;
    
    // Keep tokens that appear in at least 2 docs
    const minDocs = 2;
    for (const [token, count] of this.tokenDocCounts) {
      if (count < minDocs) {
        this.tokenDocCounts.delete(token);
      }
    }
  }

  /**
   * Get statistics
   * @returns {object}
   */
  getStats() {
    let stopwordCount = 0;
    let contentCount = 0;
    
    for (const [token, count] of this.tokenDocCounts) {
      if (count > this.documentCount * this.stopwordThreshold) {
        stopwordCount++;
      } else {
        contentCount++;
      }
    }
    
    return {
      documentCount: this.documentCount,
      vocabularySize: this.tokenDocCounts.size,
      stopwordCount,
      contentCount,
      stopwordThreshold: this.stopwordThreshold
    };
  }

  /**
   * Serialize to JSON
   * @returns {object}
   */
  toJSON() {
    // Only save tokens with significant frequency
    const minCount = Math.max(2, Math.floor(this.documentCount * 0.001));
    const tokenCounts = [];
    
    for (const [token, count] of this.tokenDocCounts) {
      if (count >= minCount) {
        tokenCounts.push([token, count]);
      }
    }
    
    return {
      documentCount: this.documentCount,
      stopwordThreshold: this.stopwordThreshold,
      tokenDocCounts: tokenCounts
    };
  }

  /**
   * Deserialize from JSON
   * @param {object} json 
   * @returns {IDFTracker}
   */
  static fromJSON(json) {
    const tracker = new IDFTracker({
      stopwordThreshold: json.stopwordThreshold
    });
    
    tracker.documentCount = json.documentCount || 0;
    
    if (json.tokenDocCounts) {
      for (const [token, count] of json.tokenDocCounts) {
        tracker.tokenDocCounts.set(token, count);
      }
    }
    
    return tracker;
  }
}

module.exports = { IDFTracker };
