/**
 * Response Generator - Generates coherent text from learned patterns
 * Implements DS-009 (Sequences), DS-012 (Semantic), DS-013 (Context)
 * NO HARDCODED TEMPLATES - everything from learned patterns
 */

class ResponseGenerator {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Generate a response from learned patterns
   * @param {object} result - Processing result from engine
   * @param {object} options - Additional context
   * @param {ConversationContext} context - Conversation context (DS-013)
   * @returns {object} Response with text and metadata
   */
  generate(result, options = {}, context = null) {
    const { input } = options;
    
    const predictions = result.predictions || [];
    const activeGroups = result.activeGroups || [];
    
    // Get input tokens for filtering
    const inputTokens = new Set(result.wordTokens || 
      this.engine.tokenizer.tokenizeWords(input || ''));
    
    // Collect candidate tokens from groups and predictions
    const candidates = this._collectCandidates(predictions, activeGroups, inputTokens, context);
    
    // Generate sequence using SequenceModel (DS-009)
    const sequence = this._generateSequence(candidates, context);
    
    let text = '';
    if (sequence.length > 0) {
      text = sequence.join(' ');
    } else if (candidates.length > 0) {
      // Fallback: just use top candidates
      text = candidates.slice(0, 8).map(c => c.token).join(' ');
    } else {
      text = '[learning]';
    }
    
    return {
      text,
      generated: sequence,
      candidates: candidates.slice(0, 10),
      fromPredictions: predictions.length > 0,
      groupCount: activeGroups.length,
      surprise: result.surprise,
    };
  }

  /**
   * Collect and score candidate tokens
   * @private
   */
  _collectCandidates(predictions, activeGroups, inputTokens, context) {
    const candidates = new Map();  // token -> {score, groupId, isContent}
    
    const idf = this.engine.idfTracker;
    const hasIDF = idf.documentCount > 0;
    
    // Get tokens from predictions
    for (const pred of predictions.slice(0, 15)) {
      const group = this.engine.store.get(pred.groupId);
      if (!group || !group.members) continue;
      
      const tokens = this._extractTokens(group);
      for (const token of tokens) {
        if (inputTokens.has(token)) continue;  // Skip input echo
        if (token.length < 2) continue;
        
        let score = pred.score;
        
        // IDF boost for content words (DS-012)
        const isContent = hasIDF ? idf.isContentWord(token) : token.length > 3;
        if (isContent) {
          score *= 2.0;
        }
        
        // Context boost (DS-013)
        if (context) {
          score *= context.scoreCandidate(token, pred.groupId);
        }
        
        const existing = candidates.get(token);
        if (!existing || existing.score < score) {
          candidates.set(token, { 
            token, 
            score, 
            groupId: pred.groupId,
            isContent 
          });
        }
      }
    }
    
    // Get tokens from active groups
    for (const group of activeGroups.slice(0, 5)) {
      const tokens = this._extractTokens(group);
      for (const token of tokens) {
        if (inputTokens.has(token)) continue;
        if (token.length < 2) continue;
        
        let score = group.salience || 0.5;
        
        const isContent = hasIDF ? idf.isContentWord(token) : token.length > 3;
        if (isContent) {
          score *= 1.5;
        }
        
        if (context) {
          score *= context.scoreCandidate(token, group.id);
        }
        
        const existing = candidates.get(token);
        if (!existing || existing.score < score) {
          candidates.set(token, { 
            token, 
            score, 
            groupId: group.id,
            isContent 
          });
        }
      }
    }
    
    // Sort by score
    return [...candidates.values()]
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Generate a coherent sequence using SequenceModel
   * @private
   */
  _generateSequence(candidates, context) {
    const seq = this.engine.sequenceModel;
    
    // If no sequence data learned yet, fall back to scored candidates
    if (seq.totalSentences < 10) {
      return this._fallbackGeneration(candidates);
    }
    
    // Get seed tokens (prefer content words AND context keywords)
    const seedTokens = candidates
      .filter(c => c.isContent && (!context || context.keywords.has(c.token)))
      .slice(0, 5)
      .map(c => c.token);
    
    // If no strict context matches, fall back to any content words
    if (seedTokens.length === 0) {
      const contentSeeds = candidates
        .filter(c => c.isContent)
        .slice(0, 8)
        .map(c => c.token);
      seedTokens.push(...contentSeeds);
    }
    
    if (seedTokens.length === 0) {
      seedTokens.push(...candidates.slice(0, 5).map(c => c.token));
    }
    
    // Generate sequence with Beam Search (DS-011)
    const sequence = seq.generateBeamSearch(seedTokens, {
      maxLength: 12,
      beamWidth: 5,
      preferSeeds: true
    });
    
    // If sequence is too short, add more candidates
    if (sequence.length < 4) {
      const existing = new Set(sequence);
      for (const c of candidates) {
        if (!existing.has(c.token) && c.isContent) {
          sequence.push(c.token);
          if (sequence.length >= 8) break;
        }
      }
    }
    
    return sequence;
  }

  /**
   * Fallback generation when SequenceModel has insufficient data
   * @private
   */
  _fallbackGeneration(candidates) {
    const sequence = [];
    const used = new Set();
    
    // Take content words first
    for (const c of candidates) {
      if (c.isContent && !used.has(c.token)) {
        sequence.push(c.token);
        used.add(c.token);
        if (sequence.length >= 10) break;
      }
    }
    
    // Add some context words if needed
    if (sequence.length < 4) {
      for (const c of candidates) {
        if (!used.has(c.token)) {
          sequence.push(c.token);
          used.add(c.token);
          if (sequence.length >= 6) break;
        }
      }
    }
    
    return sequence;
  }

  /**
   * Extract readable tokens from a group
   * @private
   */
  _extractTokens(group) {
    if (!group || !group.members) return [];
    
    const bits = group.members.toArray();
    const decoded = this.engine.tokenizer.decode(bits);
    
    const tokens = [];
    for (const t of decoded) {
      if (!t || t.length < 2) continue;
      if (t.startsWith('#')) continue;
      
      // Split n-grams
      if (t.includes('_')) {
        const parts = t.split('_');
        for (const p of parts) {
          if (p.length >= 2 && !tokens.includes(p)) {
            tokens.push(p);
          }
        }
      } else {
        if (!tokens.includes(t)) {
          tokens.push(t);
        }
      }
    }
    
    return tokens;
  }
}

module.exports = { ResponseGenerator };
