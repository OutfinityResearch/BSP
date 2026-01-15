/**
 * SequenceModel - Learns word order patterns for coherent text generation
 * Implements DS-009: Sequence-Aware Text Generation
 */

class SequenceModel {
  constructor(options = {}) {
    this.maxTransitions = options.maxTransitions || 100000;
    this.maxVocab = options.maxVocab || 50000;
    
    // Bigram transition counts: token -> (next_token -> count)
    this.transitions = new Map();
    
    // Token frequency counts
    this.tokenCounts = new Map();
    
    // Sentence boundary tokens
    this.startTokens = new Map();  // token -> count (tokens that start sentences)
    this.endTokens = new Set();    // tokens that commonly end sentences
    
    // Total counts for probability calculation
    this.totalTransitions = 0;
    this.totalSentences = 0;
  }

  /**
   * Learn transitions from a sequence of tokens
   * @param {string[]} tokens - Word tokens in order
   */
  learn(tokens) {
    if (tokens.length < 2) return;
    
    this.totalSentences++;
    
    // Track start token
    const startToken = tokens[0];
    this.startTokens.set(startToken, (this.startTokens.get(startToken) || 0) + 1);
    
    // Track end token
    const endToken = tokens[tokens.length - 1];
    this.endTokens.add(endToken);
    
    // Learn transitions
    for (let i = 0; i < tokens.length - 1; i++) {
      const current = tokens[i];
      const next = tokens[i + 1];
      
      this.addTransition(current, next);
      
      // Update token counts
      this.tokenCounts.set(current, (this.tokenCounts.get(current) || 0) + 1);
    }
    
    // Count last token too
    const lastToken = tokens[tokens.length - 1];
    this.tokenCounts.set(lastToken, (this.tokenCounts.get(lastToken) || 0) + 1);
    
    // Periodic pruning
    if (this.totalTransitions > this.maxTransitions * 1.5) {
      this.prune();
    }
  }

  /**
   * Add a single transition
   * @param {string} current 
   * @param {string} next 
   */
  addTransition(current, next) {
    if (!this.transitions.has(current)) {
      this.transitions.set(current, new Map());
    }
    
    const nextMap = this.transitions.get(current);
    nextMap.set(next, (nextMap.get(next) || 0) + 1);
    this.totalTransitions++;
  }

  /**
   * Get probability of next token given current
   * @param {string} current 
   * @param {string} next 
   * @returns {number} Probability 0-1
   */
  getTransitionProb(current, next) {
    const nextMap = this.transitions.get(current);
    if (!nextMap) return 0;
    
    const count = nextMap.get(next) || 0;
    const total = this.tokenCounts.get(current) || 1;
    
    return count / total;
  }

  /**
   * Get all possible next tokens with their probabilities
   * @param {string} current 
   * @returns {Array<{token: string, prob: number}>}
   */
  getNextCandidates(current) {
    const nextMap = this.transitions.get(current);
    if (!nextMap) return [];
    
    const total = this.tokenCounts.get(current) || 1;
    const candidates = [];
    
    for (const [token, count] of nextMap) {
      candidates.push({
        token,
        prob: count / total,
        count
      });
    }
    
    // Sort by probability
    candidates.sort((a, b) => b.prob - a.prob);
    
    return candidates;
  }

  /**
   * Select a good starting token from candidates
   * @param {string[]} seedTokens - Tokens to prefer as starts
   * @returns {string|null}
   */
  selectStart(seedTokens) {
    // Prefer seed tokens that are known starters
    for (const token of seedTokens) {
      if (this.startTokens.has(token)) {
        return token;
      }
    }
    
    // Fall back to most common starter
    let bestStart = null;
    let bestCount = 0;
    
    for (const [token, count] of this.startTokens) {
      if (count > bestCount) {
        bestCount = count;
        bestStart = token;
      }
    }
    
    return bestStart || (seedTokens.length > 0 ? seedTokens[0] : null);
  }

  /**
   * Check if token commonly ends sentences
   * @param {string} token 
   * @returns {boolean}
   */
  isEndToken(token) {
    return this.endTokens.has(token);
  }

  /**
   * Generate a sequence of tokens
   * @param {string[]} seedTokens - Tokens to incorporate
   * @param {object} options
   * @returns {string[]}
   */
  generate(seedTokens, options = {}) {
    const {
      maxLength = 12,
      temperature = 1.0,
      preferSeeds = true
    } = options;
    
    if (seedTokens.length === 0) {
      return [];
    }
    
    const sequence = [];
    const used = new Set();
    
    // Start with a seed token
    let current = this.selectStart(seedTokens);
    if (!current) {
      current = seedTokens[0];
    }
    
    sequence.push(current);
    used.add(current);
    
    // Generate rest of sequence
    while (sequence.length < maxLength) {
      const candidates = this.getNextCandidates(current);
      
      if (candidates.length === 0) {
        // No transitions known, try to use a seed token
        const unusedSeeds = seedTokens.filter(t => !used.has(t));
        if (unusedSeeds.length > 0) {
          current = unusedSeeds[0];
          sequence.push(current);
          used.add(current);
          continue;
        }
        break;
      }
      
      // Score candidates
      const scored = candidates.map(c => {
        let score = c.prob;
        
        // Boost seed tokens significantly if they are valid next tokens
        if (preferSeeds && seedTokens.includes(c.token)) {
          score *= 5.0;  // Strong boost for staying on topic
        }
        
        // Penalize already used tokens (avoid loops)
        if (used.has(c.token)) {
          score *= 0.05;
        }
        
        return { ...c, score };
      });
      
      // Select based on score with temperature
      // Lower temperature = more deterministic/grammatical
      const selected = this.weightedSelect(scored, 0.7);
      
      if (!selected) break;
      
      current = selected.token;
      sequence.push(current);
      used.add(current);
      
      // Check for natural end
      if (this.isEndToken(current) && sequence.length >= 4) {
        break;
      }
    }
    
    return sequence;
  }

  /**
   * Generate a sequence using Beam Search (DS-011)
   * Finds the most probable sequence of tokens
   * @param {string[]} seedTokens - Tokens to incorporate
   * @param {object} options
   * @returns {string[]}
   */
  generateBeamSearch(seedTokens, options = {}) {
    const {
      maxLength = 12,
      beamWidth = 5,
      preferSeeds = true
    } = options;
    
    if (seedTokens.length === 0) return [];
    
    // Initial beam: start with seed tokens
    let beam = [];
    const startToken = this.selectStart(seedTokens) || seedTokens[0];
    
    beam.push({
      tokens: [startToken],
      score: 0, // Log probability (0 = log(1))
      usedSeeds: new Set(seedTokens.includes(startToken) ? [startToken] : [])
    });
    
    // Expand beam step by step
    for (let t = 0; t < maxLength; t++) {
      const candidates = [];
      
      for (const path of beam) {
        const lastToken = path.tokens[path.tokens.length - 1];
        
        // Stop if end token or max length
        if (this.isEndToken(lastToken) && path.tokens.length >= 4) {
          candidates.push(path); // Finished path
          continue;
        }
        
        // Get transitions
        const nextTokens = this.getNextCandidates(lastToken);
        
        if (nextTokens.length === 0) {
          // Dead end, maybe try unused seed
          const unusedSeeds = seedTokens.filter(s => !path.usedSeeds.has(s));
          if (unusedSeeds.length > 0) {
            const nextSeed = unusedSeeds[0];
            candidates.push({
              tokens: [...path.tokens, nextSeed],
              score: path.score - 2.0, // Penalty for jump
              usedSeeds: new Set([...path.usedSeeds, nextSeed])
            });
          } else {
            candidates.push(path); // Keep as is
          }
          continue;
        }
        
        // Expand
        for (const { token, prob } of nextTokens.slice(0, 10)) { // Consider top 10 transitions
          let logProb = Math.log(prob + 1e-10);
          
          // Boost seeds
          if (preferSeeds && seedTokens.includes(token)) {
            logProb += 2.0;
          }
          
          // Penalize repetition
          if (path.tokens.includes(token)) {
            logProb -= 3.0;
          }
          
          candidates.push({
            tokens: [...path.tokens, token],
            score: path.score + logProb,
            usedSeeds: new Set([...path.usedSeeds, token])
          });
        }
      }
      
      // Prune beam: Keep top K candidates
      candidates.sort((a, b) => b.score - a.score);
      beam = candidates.slice(0, beamWidth);
      
      // Early exit if top path is finished
      if (beam[0] && this.isEndToken(beam[0].tokens[beam[0].tokens.length - 1]) && beam[0].tokens.length >= 4) {
        break;
      }
    }
    
    // Return best path
    return beam.length > 0 ? beam[0].tokens : [];
  }

  /**
   * Weighted random selection with temperature
   * @param {Array<{token: string, score: number}>} candidates 
   * @param {number} temperature 
   * @returns {{token: string, score: number}|null}
   */
  weightedSelect(candidates, temperature = 1.0) {
    if (candidates.length === 0) return null;
    
    // Apply temperature
    const adjusted = candidates.map(c => ({
      ...c,
      weight: Math.pow(c.score, 1 / temperature)
    }));
    
    // Normalize
    const totalWeight = adjusted.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return candidates[0];
    
    // Random selection
    let random = Math.random() * totalWeight;
    for (const c of adjusted) {
      random -= c.weight;
      if (random <= 0) return c;
    }
    
    return candidates[0];
  }

  /**
   * Prune low-frequency transitions to save memory
   */
  prune() {
    const minCount = 2;
    let removed = 0;
    
    for (const [current, nextMap] of this.transitions) {
      for (const [next, count] of nextMap) {
        if (count < minCount) {
          nextMap.delete(next);
          removed++;
        }
      }
      
      if (nextMap.size === 0) {
        this.transitions.delete(current);
      }
    }
    
    this.totalTransitions -= removed;
  }

  /**
   * Get statistics
   * @returns {object}
   */
  getStats() {
    return {
      uniqueTokens: this.tokenCounts.size,
      totalTransitions: this.totalTransitions,
      transitionTypes: this.transitions.size,
      sentences: this.totalSentences,
      startTokens: this.startTokens.size,
      endTokens: this.endTokens.size
    };
  }

  /**
   * Serialize to JSON
   * @returns {object}
   */
  toJSON() {
    // Convert Maps to arrays for JSON
    const transitions = [];
    for (const [current, nextMap] of this.transitions) {
      const nexts = [];
      for (const [next, count] of nextMap) {
        if (count >= 2) {  // Only save significant transitions
          nexts.push([next, count]);
        }
      }
      if (nexts.length > 0) {
        transitions.push([current, nexts]);
      }
    }
    
    return {
      transitions,
      tokenCounts: [...this.tokenCounts.entries()].slice(0, this.maxVocab),
      startTokens: [...this.startTokens.entries()],
      endTokens: [...this.endTokens],
      totalTransitions: this.totalTransitions,
      totalSentences: this.totalSentences
    };
  }

  /**
   * Deserialize from JSON
   * @param {object} json 
   * @returns {SequenceModel}
   */
  static fromJSON(json) {
    const model = new SequenceModel();
    
    // Restore transitions
    if (json.transitions) {
      for (const [current, nexts] of json.transitions) {
        const nextMap = new Map();
        for (const [next, count] of nexts) {
          nextMap.set(next, count);
        }
        model.transitions.set(current, nextMap);
      }
    }
    
    // Restore token counts
    if (json.tokenCounts) {
      for (const [token, count] of json.tokenCounts) {
        model.tokenCounts.set(token, count);
      }
    }
    
    // Restore start/end tokens
    if (json.startTokens) {
      for (const [token, count] of json.startTokens) {
        model.startTokens.set(token, count);
      }
    }
    
    if (json.endTokens) {
      for (const token of json.endTokens) {
        model.endTokens.add(token);
      }
    }
    
    model.totalTransitions = json.totalTransitions || 0;
    model.totalSentences = json.totalSentences || 0;
    
    return model;
  }
}

module.exports = { SequenceModel };
