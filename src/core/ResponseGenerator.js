/**
 * Response Generator - Generates text from learned patterns
 * NO HARDCODED TEMPLATES - everything comes from the learned groups and predictions
 */

class ResponseGenerator {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Generate a response purely from learned patterns
   * @param {object} result - Processing result from engine
   * @param {object} options - Additional context
   * @returns {object} Response with text and metadata
   */
  generate(result, options = {}) {
    const { input } = options;
    
    // Get predictions from the deduction graph
    const predictions = result.predictions || [];
    const activeGroups = result.activeGroups || [];
    
    // Extract input tokens for filtering common words
    const inputTokens = new Set(
      this.engine.tokenizer.tokenizeWords(input || '')
    );
    
    // Build response from what the system actually learned
    const generatedTokens = this._generateFromPredictions(
      predictions, 
      activeGroups,
      inputTokens
    );
    
    // If we have generated content, use it
    let text = '';
    
    if (generatedTokens.length > 0) {
      text = generatedTokens.join(' ');
    } else if (activeGroups.length > 0) {
      // Fall back to describing active groups
      text = this._describeActiveGroups(activeGroups, inputTokens);
    } else {
      // Nothing learned yet - output the raw state
      text = this._describeRawState(result);
    }
    
    return {
      text: text,
      generated: generatedTokens,
      fromPredictions: predictions.length > 0,
      groupCount: activeGroups.length,
      surprise: result.surprise,
    };
  }

  /**
   * Generate tokens from predictions
   * Prioritizes content words over stopwords
   */
  _generateFromPredictions(predictions, activeGroups, inputTokens) {
    const tokens = [];
    const seen = new Set();
    
    // Common stopwords to deprioritize
    const stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'it', 'its',
      'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our',
      'their', 'this', 'that', 'these', 'those', 'which', 'what', 'who', 'whom',
      'not', 'no', 'so', 'if', 'then', 'than', 'when', 'where', 'how', 'all',
      'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'only', 'own', 'same', 'just', 'also', 'very', 'too', 'up', 'down', 'out',
      'him', 'me', 'us', 'them', 'there', 'here', 'now', 'one', 'two'
    ]);
    
    // Content words (interesting words)
    const contentWords = [];
    // Context words (common but relevant)
    const contextWords = [];
    
    // Get tokens from predictions first (what comes next)
    for (const pred of predictions.slice(0, 15)) {
      const group = this.engine.store.get(pred.groupId);
      if (!group || !group.members) continue;
      
      const groupTokens = this._extractTokensFromGroup(group);
      for (const token of groupTokens) {
        if (seen.has(token)) continue;
        if (token.length < 2) continue;
        
        seen.add(token);
        
        // Skip tokens from input (we want predictions, not echoes)
        if (inputTokens.has(token)) continue;
        
        if (stopwords.has(token)) {
          contextWords.push(token);
        } else {
          contentWords.push(token);
        }
      }
    }
    
    // Also get tokens from active groups
    for (const group of activeGroups.slice(0, 5)) {
      const groupTokens = this._extractTokensFromGroup(group);
      for (const token of groupTokens) {
        if (seen.has(token)) continue;
        if (token.length < 2) continue;
        
        seen.add(token);
        
        if (stopwords.has(token)) {
          contextWords.push(token);
        } else {
          contentWords.push(token);
        }
      }
    }
    
    // Prioritize content words, limit context words
    const maxContent = 12;
    const maxContext = 4;
    
    // Take content words first
    for (const w of contentWords.slice(0, maxContent)) {
      tokens.push(w);
    }
    
    // Add some context words if we don't have enough
    if (tokens.length < 5) {
      for (const w of contextWords.slice(0, maxContext)) {
        if (!tokens.includes(w)) {
          tokens.push(w);
        }
      }
    }
    
    return tokens;
  }

  /**
   * Extract readable tokens from a group
   */
  _extractTokensFromGroup(group) {
    if (!group || !group.members) return [];
    
    const bits = group.members.toArray();
    const decoded = this.engine.tokenizer.decode(bits);
    
    // Filter and clean tokens
    const tokens = [];
    for (const t of decoded) {
      if (!t || t.length < 2) continue;
      if (t.startsWith('#')) continue;  // Skip hash tokens
      
      // If it's an n-gram, split it
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

  /**
   * Describe active groups (what patterns matched)
   */
  _describeActiveGroups(activeGroups, inputTokens) {
    const allTokens = [];
    
    for (const group of activeGroups.slice(0, 5)) {
      const tokens = this._extractTokensFromGroup(group);
      for (const t of tokens.slice(0, 5)) {
        if (!allTokens.includes(t) && !inputTokens.has(t)) {
          allTokens.push(t);
        }
      }
    }
    
    if (allTokens.length === 0) {
      return '[learning]';
    }
    
    return allTokens.slice(0, 10).join(' ');
  }

  /**
   * Describe raw state when nothing is learned
   */
  _describeRawState(result) {
    const parts = [];
    
    if (result.surprise !== undefined) {
      parts.push(`surprise:${result.surprise}`);
    }
    if (result.inputSize !== undefined) {
      parts.push(`input:${result.inputSize}`);
    }
    
    const stats = this.engine.getStats();
    parts.push(`groups:${stats.groupCount}`);
    parts.push(`edges:${stats.edgeCount}`);
    
    return parts.join(' ');
  }
}

module.exports = { ResponseGenerator };
