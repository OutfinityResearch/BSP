/**
 * SequenceModel - Learns word order patterns for coherent text generation
 * Implements DS-009: Sequence-Aware Text Generation
 */

class SequenceModel {
  constructor(options = {}) {
    this.maxTransitions = options.maxTransitions || 100000;
    this.maxVocab = options.maxVocab || 50000;
    this.smoothing = options.smoothing || 'none'; // 'none' | 'addAlpha'
    this.smoothingAlpha = options.smoothingAlpha ?? 0.1;
    
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
   * Smoothed transition probability.
   * For add-alpha: (c + α) / (total + α * V)
   * @param {string} current
   * @param {string} next
   * @returns {number}
   */
  getTransitionProbSmoothed(current, next) {
    if (this.smoothing !== 'addAlpha') return this.getTransitionProb(current, next);

    const alpha = Math.max(0, Number(this.smoothingAlpha) || 0);
    const nextMap = this.transitions.get(current);
    const count = nextMap ? (nextMap.get(next) || 0) : 0;
    const total = this.tokenCounts.get(current) || 0;
    const vocabSize = Math.max(1, this.tokenCounts.size);
    return (count + alpha) / (total + alpha * vocabSize);
  }

  /**
   * Unigram probability as a backoff when no bigram evidence exists.
   * @param {string} token
   * @returns {number}
   */
  getUnigramProb(token) {
    const tokenCount = this.tokenCounts.get(token) || 0;
    let total = 0;
    for (const c of this.tokenCounts.values()) total += c;
    return total > 0 ? tokenCount / total : 0;
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
      const selected = this.weightedSelect(scored, temperature);
      
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
          const p = this.getTransitionProbSmoothed(lastToken, token) || prob;
          const backoff = p > 0 ? p : this.getUnigramProb(token);
          let logProb = Math.log(backoff + 1e-10);
          
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
   * Compute the sequence cost (negative log probability) for a token sequence.
   * This is the fundamental measure: unlikely sequences cost more bits.
   * 
   * Cost = -Σ log₂(P(token_i | token_{i-1}))
   * 
   * Grammar emerges naturally: "the cats are" has low cost (frequent),
   * "the cats is" has high cost (rare/unseen).
   * 
   * @param {string[]} tokens - Sequence of tokens
   * @param {object} [options]
   * @param {boolean} [options.perToken=false] - Return cost per token instead of total
   * @param {number} [options.unkPenalty=10] - Bits penalty for unknown transitions
   * @returns {number} Cost in bits (lower = more likely sequence)
   */
  getSequenceCost(tokens, options = {}) {
    const { perToken = false, unkPenalty = 10 } = options;
    
    if (!tokens || tokens.length < 2) {
      return 0;
    }
    
    let totalCost = 0;
    let transitionCount = 0;
    
    for (let i = 0; i < tokens.length - 1; i++) {
      const current = tokens[i];
      const next = tokens[i + 1];
      
      // Get transition probability (with smoothing if configured)
      let prob = this.getTransitionProbSmoothed(current, next);
      
      // If no transition data, use unigram backoff
      if (prob === 0) {
        prob = this.getUnigramProb(next);
      }
      
      // Compute cost in bits
      if (prob > 0) {
        // Cost = -log₂(prob)
        totalCost += -Math.log2(prob);
      } else {
        // Unknown transition: apply penalty
        // This naturally penalizes unseen/ungrammatical sequences
        totalCost += unkPenalty;
      }
      
      transitionCount++;
    }
    
    if (perToken && transitionCount > 0) {
      return totalCost / transitionCount;
    }
    
    return totalCost;
  }

  /**
   * Compare two sequences and return which is more likely.
   * Useful for minimal pair evaluation (like BLiMP).
   * 
   * @param {string[]} seq1 - First sequence
   * @param {string[]} seq2 - Second sequence
   * @returns {{winner: 1|2, cost1: number, cost2: number, ratio: number}}
   */
  compareSequences(seq1, seq2) {
    const cost1 = this.getSequenceCost(seq1);
    const cost2 = this.getSequenceCost(seq2);
    
    return {
      winner: cost1 <= cost2 ? 1 : 2,
      cost1,
      cost2,
      ratio: cost1 > 0 ? cost2 / cost1 : Infinity,
    };
  }

  // ============================================================
  // DS-022: Transition Entropy for Separator Detection
  // ============================================================

  /**
   * Compute transition entropy for a token.
   * High entropy = many possible followers = separator token.
   * Low entropy = few possible followers = tight coupling.
   * 
   * @param {string} token
   * @returns {number} Entropy in bits
   */
  getTransitionEntropy(token) {
    const nextMap = this.transitions.get(token);
    if (!nextMap || nextMap.size === 0) {
      return 0;
    }
    
    const total = this.tokenCounts.get(token) || 1;
    let entropy = 0;
    
    for (const count of nextMap.values()) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    
    return entropy;
  }

  /**
   * Compute entropy map for all tokens
   * @returns {Map<string, number>} token -> entropy
   */
  computeEntropyMap() {
    const entropyMap = new Map();
    
    for (const token of this.transitions.keys()) {
      entropyMap.set(token, this.getTransitionEntropy(token));
    }
    
    return entropyMap;
  }

  /**
   * Find natural separator tokens (high transition entropy)
   * These are tokens like . ! ? \n that can be followed by many things.
   * 
   * @param {number} [threshold=5.0] - Minimum entropy to be considered separator
   * @returns {Array<{token: string, entropy: number}>}
   */
  findSeparators(threshold = 5.0) {
    const entropyMap = this.computeEntropyMap();
    
    return [...entropyMap.entries()]
      .filter(([_, entropy]) => entropy >= threshold)
      .map(([token, entropy]) => ({ token, entropy }))
      .sort((a, b) => b.entropy - a.entropy);
  }

  /**
   * Find tightly coupled token pairs (low transition entropy)
   * These are grammatical patterns like "of the", "in a", etc.
   * 
   * @param {number} [threshold=2.0] - Maximum entropy to be considered tight
   * @returns {Array<{token: string, entropy: number, topNext: string}>}
   */
  findTightCouplings(threshold = 2.0) {
    const results = [];
    
    for (const [token, nextMap] of this.transitions) {
      const entropy = this.getTransitionEntropy(token);
      
      if (entropy <= threshold && entropy > 0 && nextMap.size > 0) {
        // Find most common next token
        let topNext = null;
        let topCount = 0;
        for (const [next, count] of nextMap) {
          if (count > topCount) {
            topCount = count;
            topNext = next;
          }
        }
        
        results.push({ token, entropy, topNext });
      }
    }
    
    return results.sort((a, b) => a.entropy - b.entropy);
  }

  /**
   * Get hierarchical boundary strength for a token.
   * Higher = stronger boundary (like sentence end)
   * Lower = weaker boundary (like within phrase)
   * 
   * @param {string} token
   * @returns {number} 0-1 normalized boundary strength
   */
  getBoundaryStrength(token) {
    const entropy = this.getTransitionEntropy(token);
    const maxEntropy = Math.log2(this.tokenCounts.size || 1);
    
    // Normalize to 0-1
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
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
      totalSentences: this.totalSentences,
      smoothing: this.smoothing,
      smoothingAlpha: this.smoothingAlpha
    };
  }

  /**
   * Deserialize from JSON
   * @param {object} json 
   * @returns {SequenceModel}
   */
  static fromJSON(json) {
    const model = new SequenceModel({
      smoothing: json.smoothing,
      smoothingAlpha: json.smoothingAlpha,
    });
    
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

export { SequenceModel };
