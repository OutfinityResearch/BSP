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
    
    // Build response from what the system actually learned
    const generatedTokens = this._generateFromPredictions(predictions, activeGroups);
    
    // If we have generated content, use it
    let text = '';
    
    if (generatedTokens.length > 0) {
      text = generatedTokens.join(' ');
    } else if (activeGroups.length > 0) {
      // Fall back to describing active groups
      text = this._describeActiveGroups(activeGroups);
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
   * Uses the DeductionGraph to predict what comes next
   */
  _generateFromPredictions(predictions, activeGroups) {
    const tokens = [];
    const seen = new Set();
    
    // Get tokens from top predictions
    for (const pred of predictions.slice(0, 10)) {
      const group = this.engine.store.get(pred.groupId);
      if (!group || !group.members) continue;
      
      // Extract tokens from this group
      const groupTokens = this._extractTokensFromGroup(group);
      for (const token of groupTokens) {
        if (!seen.has(token) && token.length > 1) {
          seen.add(token);
          tokens.push(token);
          if (tokens.length >= 15) break;
        }
      }
      if (tokens.length >= 15) break;
    }
    
    // Also add tokens from active groups
    for (const group of activeGroups.slice(0, 5)) {
      const groupTokens = this._extractTokensFromGroup(group);
      for (const token of groupTokens) {
        if (!seen.has(token) && token.length > 1) {
          seen.add(token);
          tokens.push(token);
          if (tokens.length >= 20) break;
        }
      }
      if (tokens.length >= 20) break;
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
      if (t.startsWith('#')) continue;
      
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
  _describeActiveGroups(activeGroups) {
    const allTokens = [];
    
    for (const group of activeGroups.slice(0, 5)) {
      const tokens = this._extractTokensFromGroup(group);
      for (const t of tokens.slice(0, 5)) {
        if (!allTokens.includes(t)) {
          allTokens.push(t);
        }
      }
    }
    
    if (allTokens.length === 0) {
      return '[no patterns]';
    }
    
    return allTokens.join(' ');
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
