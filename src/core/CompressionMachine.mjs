/**
 * CompressionMachine - Procedural compression for BSP (DS-021)
 * 
 * Implements a "Turing machine" for compression that uses operators
 * like COPY, REPEAT, and TEMPLATE to achieve better compression than
 * simple group-based matching.
 */

/**
 * A compression program is a sequence of operations that generate tokens
 */
class Program {
  constructor() {
    /** @type {Operation[]} */
    this.operations = [];
    this._cachedCost = null;
  }

  /**
   * Add an operation to the program
   * @param {Operation} op
   */
  add(op) {
    this.operations.push(op);
    this._cachedCost = null;
  }

  /**
   * Total cost of this program in bits
   * @returns {number}
   */
  get cost() {
    if (this._cachedCost === null) {
      this._cachedCost = this.operations.reduce((sum, op) => sum + op.cost, 0);
    }
    return this._cachedCost;
  }

  /**
   * Execute the program to produce tokens
   * @param {string[]} context - Previous tokens for COPY operations
   * @returns {string[]}
   */
  execute(context = []) {
    const result = [];
    for (const op of this.operations) {
      result.push(...op.execute(context, result));
    }
    return result;
  }

  /**
   * Get human-readable representation
   */
  toString() {
    return this.operations.map(op => op.toString()).join(' + ');
  }

  toJSON() {
    return {
      operations: this.operations.map(op => op.toJSON()),
      cost: this.cost,
    };
  }
}

/**
 * Base class for compression operations
 */
class Operation {
  constructor(type, params = {}) {
    this.type = type;
    this.params = params;
  }

  get cost() {
    throw new Error('Subclass must implement cost');
  }

  execute(context, accumulated) {
    throw new Error('Subclass must implement execute');
  }

  toString() {
    return `${this.type}(${JSON.stringify(this.params)})`;
  }

  toJSON() {
    return { type: this.type, params: this.params, cost: this.cost };
  }
}

/**
 * LITERAL - Emit tokens directly
 * Cost: tokens.length * log2(vocabSize)
 */
class LiteralOp extends Operation {
  constructor(tokens, vocabSize = 10000) {
    super('LITERAL', { tokens });
    this.vocabSize = vocabSize;
  }

  get cost() {
    return this.params.tokens.length * Math.log2(this.vocabSize);
  }

  execute() {
    return [...this.params.tokens];
  }

  toString() {
    const preview = this.params.tokens.slice(0, 3).join(' ');
    const suffix = this.params.tokens.length > 3 ? '...' : '';
    return `LIT[${preview}${suffix}]`;
  }
}

/**
 * COPY - Copy tokens from context
 * Cost: log2(contextLen) + log2(maxCopyLen)
 */
class CopyOp extends Operation {
  constructor(offset, length, contextLen, maxCopyLen = 64) {
    super('COPY', { offset, length });
    this.contextLen = contextLen;
    this.maxCopyLen = maxCopyLen;
  }

  get cost() {
    // Cost to specify where to copy from + how many tokens
    const offsetCost = Math.log2(Math.max(1, this.contextLen));
    const lengthCost = Math.log2(this.maxCopyLen);
    return offsetCost + lengthCost;
  }

  execute(context) {
    const { offset, length } = this.params;
    return context.slice(offset, offset + length);
  }

  toString() {
    return `COPY[${this.params.offset}:${this.params.length}]`;
  }
}

/**
 * REPEAT - Repeat a pattern N times
 * Cost: pattern encoding + log2(maxRepeat)
 */
class RepeatOp extends Operation {
  constructor(pattern, count, vocabSize = 10000, maxRepeat = 16) {
    super('REPEAT', { pattern, count });
    this.vocabSize = vocabSize;
    this.maxRepeat = maxRepeat;
  }

  get cost() {
    // Cost = pattern + count encoding
    const patternCost = this.params.pattern.length * Math.log2(this.vocabSize);
    const countCost = Math.log2(this.maxRepeat);
    return patternCost + countCost;
  }

  execute() {
    const result = [];
    for (let i = 0; i < this.params.count; i++) {
      result.push(...this.params.pattern);
    }
    return result;
  }

  toString() {
    const preview = this.params.pattern.slice(0, 2).join(' ');
    return `REPEAT[${preview}... x${this.params.count}]`;
  }
}

/**
 * TEMPLATE - Apply a learned template with slot values
 * Cost: log2(numTemplates) + slots * log2(vocabSize)
 */
class TemplateOp extends Operation {
  constructor(templateId, slotValues, template, numTemplates = 100, vocabSize = 10000) {
    super('TEMPLATE', { templateId, slotValues });
    this.template = template;  // { fixed: string[], slots: number[] }
    this.numTemplates = numTemplates;
    this.vocabSize = vocabSize;
  }

  get cost() {
    const templateIdCost = Math.log2(this.numTemplates);
    const slotsCost = this.params.slotValues.length * Math.log2(this.vocabSize);
    return templateIdCost + slotsCost;
  }

  execute() {
    // Fill template slots with values
    const result = [];
    let slotIdx = 0;
    
    for (let i = 0; i < this.template.fixed.length; i++) {
      if (this.template.fixed[i] !== null) {
        result.push(this.template.fixed[i]);
      }
      if (i < this.template.slots.length && this.template.slots[i]) {
        result.push(this.params.slotValues[slotIdx++]);
      }
    }
    
    return result;
  }

  toString() {
    return `TEMPLATE[#${this.params.templateId}](${this.params.slotValues.join(', ')})`;
  }
}

/**
 * CompressionMachine - Main orchestrator
 */
class CompressionMachine {
  constructor(options = {}) {
    this.vocabSize = options.vocabSize || 10000;
    this.maxContextLen = options.maxContextLen || 256;
    this.maxCopyLen = options.maxCopyLen || 64;
    this.maxRepeat = options.maxRepeat || 16;
    this.minCopyLen = options.minCopyLen || 3;
    this.minRepeatCount = options.minRepeatCount || 2;

    // Word-level vocabulary (separate from n-gram vocab)
    // This gives more accurate costs for compression
    this.wordVocab = new Set();
    this.minWordVocab = options.minWordVocab || 500;  // Minimum assumed vocab

    // Learned templates
    this.templates = new Map();
    this.nextTemplateId = 0;

    // Statistics
    this.stats = {
      totalEncodes: 0,
      copyOpsUsed: 0,
      repeatOpsUsed: 0,
      templateOpsUsed: 0,
      totalSavings: 0,
    };
  }

  /**
   * Get effective vocabulary size for cost calculation
   * Uses word-level vocab, not n-gram vocab
   */
  get effectiveVocabSize() {
    return Math.max(this.minWordVocab, this.wordVocab.size * 2);
  }

  /**
   * Observe tokens to build word vocabulary
   * @param {string[]} tokens
   */
  observeTokens(tokens) {
    for (const t of tokens) {
      this.wordVocab.add(t);
    }
  }

  /**
   * Find the best program to encode tokens given context
   * @param {string[]} tokens - Tokens to encode
   * @param {string[]} context - Previous tokens (for COPY)
   * @returns {Program}
   */
  encode(tokens, context = []) {
    this.stats.totalEncodes++;

    // Update word vocabulary
    this.observeTokens(tokens);

    // Use effective vocab size for costs
    const effectiveVocab = this.effectiveVocabSize;

    // Baseline: literal encoding
    const literalCost = tokens.length * Math.log2(effectiveVocab);
    
    // Try to find better encodings
    const candidates = [];

    // Option 1: Pure literal
    const literalProg = new Program();
    literalProg.add(new LiteralOp(tokens, effectiveVocab));
    candidates.push(literalProg);

    // Option 2: COPY-based encoding
    const copyProg = this._tryCopyEncoding(tokens, context, effectiveVocab);
    if (copyProg) candidates.push(copyProg);

    // Option 3: REPEAT-based encoding
    const repeatProg = this._tryRepeatEncoding(tokens, effectiveVocab);
    if (repeatProg) candidates.push(repeatProg);

    // Option 4: Template-based encoding
    const templateProg = this._tryTemplateEncoding(tokens, effectiveVocab);
    if (templateProg) candidates.push(templateProg);

    // Option 5: Hybrid (COPY + LITERAL for residual)
    const hybridProg = this._tryHybridEncoding(tokens, context);
    if (hybridProg) candidates.push(hybridProg);

    // Select best
    candidates.sort((a, b) => a.cost - b.cost);
    const best = candidates[0];

    // Track savings
    const savings = literalCost - best.cost;
    if (savings > 0) {
      this.stats.totalSavings += savings;
      if (best.operations.some(op => op.type === 'COPY')) this.stats.copyOpsUsed++;
      if (best.operations.some(op => op.type === 'REPEAT')) this.stats.repeatOpsUsed++;
      if (best.operations.some(op => op.type === 'TEMPLATE')) this.stats.templateOpsUsed++;
    }

    return best;
  }

  /**
   * Try to encode using COPY from context
   * @private
   */
  _tryCopyEncoding(tokens, context, vocabSize) {
    if (context.length < this.minCopyLen) return null;
    const effectiveVocab = vocabSize || this.effectiveVocabSize;

    const copies = this._findCopyMatches(tokens, context, effectiveVocab);
    if (copies.length === 0) return null;

    // Greedy: take best non-overlapping copies
    copies.sort((a, b) => b.savings - a.savings);
    
    const prog = new Program();
    let pos = 0;
    const usedRanges = [];

    for (const copy of copies) {
      // Check for overlap with already used ranges
      if (usedRanges.some(r => 
        (copy.targetOffset >= r.start && copy.targetOffset < r.end) ||
        (copy.targetOffset + copy.length > r.start && copy.targetOffset + copy.length <= r.end)
      )) {
        continue;
      }

      // Emit literals before this copy
      if (copy.targetOffset > pos) {
        const literals = tokens.slice(pos, copy.targetOffset);
        prog.add(new LiteralOp(literals, effectiveVocab));
      }

      // Emit copy
      prog.add(new CopyOp(copy.sourceOffset, copy.length, context.length, this.maxCopyLen));
      
      usedRanges.push({ start: copy.targetOffset, end: copy.targetOffset + copy.length });
      pos = copy.targetOffset + copy.length;
    }

    // Emit remaining literals
    if (pos < tokens.length) {
      prog.add(new LiteralOp(tokens.slice(pos), effectiveVocab));
    }

    return prog.cost < tokens.length * Math.log2(effectiveVocab) ? prog : null;
  }

  /**
   * Find copy matches between tokens and context
   * @private
   */
  _findCopyMatches(tokens, context, vocabSize) {
    const matches = [];
    const effectiveVocab = vocabSize || this.effectiveVocabSize;

    for (let i = 0; i < tokens.length; i++) {
      // Find longest match starting at position i
      let bestLen = 0;
      let bestOffset = -1;

      for (let j = 0; j <= context.length - this.minCopyLen; j++) {
        let len = 0;
        while (
          i + len < tokens.length &&
          j + len < context.length &&
          tokens[i + len] === context[j + len] &&
          len < this.maxCopyLen
        ) {
          len++;
        }

        if (len >= this.minCopyLen && len > bestLen) {
          bestLen = len;
          bestOffset = j;
        }
      }

      if (bestLen >= this.minCopyLen) {
        const copyCost = Math.log2(context.length) + Math.log2(this.maxCopyLen);
        const literalCost = bestLen * Math.log2(effectiveVocab);
        const savings = literalCost - copyCost;

        if (savings > 0) {
          matches.push({
            sourceOffset: bestOffset,
            targetOffset: i,
            length: bestLen,
            savings,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Try to encode using REPEAT
   * @private
   */
  _tryRepeatEncoding(tokens, vocabSize) {
    if (tokens.length < 4) return null;
    const effectiveVocab = vocabSize || this.effectiveVocabSize;

    // Try different pattern lengths
    for (let patLen = 1; patLen <= Math.min(10, Math.floor(tokens.length / 2)); patLen++) {
      const pattern = tokens.slice(0, patLen);
      let count = 1;

      // Count how many times pattern repeats
      for (let i = patLen; i <= tokens.length - patLen; i += patLen) {
        let matches = true;
        for (let j = 0; j < patLen; j++) {
          if (tokens[i + j] !== pattern[j]) {
            matches = false;
            break;
          }
        }
        if (matches) count++;
        else break;
      }

      if (count >= this.minRepeatCount) {
        const repeatOp = new RepeatOp(pattern, count, effectiveVocab, this.maxRepeat);
        const repeatedLen = patLen * count;
        
        const prog = new Program();
        prog.add(repeatOp);

        // Add residual
        if (repeatedLen < tokens.length) {
          prog.add(new LiteralOp(tokens.slice(repeatedLen), this.vocabSize));
        }

        const literalCost = tokens.length * Math.log2(this.vocabSize);
        if (prog.cost < literalCost) {
          return prog;
        }
      }
    }

    return null;
  }

  /**
   * Try to encode using a learned template
   * @private
   */
  _tryTemplateEncoding(tokens) {
    if (this.templates.size === 0) return null;

    // Find best matching template
    let bestMatch = null;
    let bestCost = Infinity;

    for (const [id, template] of this.templates) {
      const match = this._matchTemplate(tokens, template);
      if (match && match.cost < bestCost) {
        bestMatch = { id, template, ...match };
        bestCost = match.cost;
      }
    }

    if (!bestMatch) return null;

    const prog = new Program();
    prog.add(new TemplateOp(
      bestMatch.id,
      bestMatch.slotValues,
      bestMatch.template,
      this.templates.size,
      this.vocabSize
    ));

    // Add residual
    if (bestMatch.residual && bestMatch.residual.length > 0) {
      prog.add(new LiteralOp(bestMatch.residual, this.vocabSize));
    }

    const literalCost = tokens.length * Math.log2(this.vocabSize);
    return prog.cost < literalCost ? prog : null;
  }

  /**
   * Match tokens against a template
   * @private
   */
  _matchTemplate(tokens, template) {
    const { fixed, slotPositions } = template;
    
    // Check if fixed parts match
    let tokenIdx = 0;
    const slotValues = [];
    
    for (let i = 0; i < fixed.length; i++) {
      if (slotPositions.includes(i)) {
        // This is a slot - consume one token
        if (tokenIdx >= tokens.length) return null;
        slotValues.push(tokens[tokenIdx++]);
      } else {
        // This is fixed - must match exactly
        if (tokenIdx >= tokens.length || tokens[tokenIdx] !== fixed[i]) {
          return null;
        }
        tokenIdx++;
      }
    }

    const residual = tokens.slice(tokenIdx);
    const templateOp = new TemplateOp(
      0, slotValues, template, this.templates.size, this.vocabSize
    );

    return {
      slotValues,
      residual,
      cost: templateOp.cost + residual.length * Math.log2(this.vocabSize),
    };
  }

  /**
   * Try hybrid encoding (COPY for some, LITERAL for rest)
   * @private
   */
  _tryHybridEncoding(tokens, context) {
    if (context.length < this.minCopyLen) return null;
    
    // This is handled by _tryCopyEncoding which already does hybrid
    return null;
  }

  /**
   * Learn templates from a sequence of token arrays
   * @param {string[][]} sequences
   */
  learnTemplates(sequences) {
    if (sequences.length < 10) return;

    // Find recurring patterns with differences
    const patterns = new Map();

    for (const seq of sequences) {
      const key = seq.length + ':' + seq.slice(0, 2).join(',');
      if (!patterns.has(key)) {
        patterns.set(key, []);
      }
      patterns.get(key).push(seq);
    }

    // For each group, find common structure
    for (const [key, group] of patterns) {
      if (group.length < 3) continue;

      // Find positions that vary
      const refSeq = group[0];
      const varying = new Set();

      for (let i = 1; i < group.length; i++) {
        for (let j = 0; j < refSeq.length && j < group[i].length; j++) {
          if (refSeq[j] !== group[i][j]) {
            varying.add(j);
          }
        }
      }

      // Create template if we have some fixed and some varying
      if (varying.size > 0 && varying.size < refSeq.length * 0.5) {
        const fixed = refSeq.map((t, i) => varying.has(i) ? null : t);
        const slotPositions = [...varying].sort((a, b) => a - b);

        const template = { fixed, slotPositions, count: group.length };
        this.templates.set(this.nextTemplateId++, template);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      templateCount: this.templates.size,
      avgSavingsPerEncode: this.stats.totalEncodes > 0 
        ? this.stats.totalSavings / this.stats.totalEncodes 
        : 0,
    };
  }

  /**
   * Serialize
   */
  toJSON() {
    return {
      vocabSize: this.vocabSize,
      maxContextLen: this.maxContextLen,
      templates: [...this.templates.entries()],
      stats: this.stats,
    };
  }

  /**
   * Deserialize
   */
  static fromJSON(json) {
    const machine = new CompressionMachine({
      vocabSize: json.vocabSize,
      maxContextLen: json.maxContextLen,
    });
    machine.templates = new Map(json.templates);
    machine.stats = json.stats || machine.stats;
    return machine;
  }
}

export { 
  CompressionMachine, 
  Program, 
  Operation, 
  LiteralOp, 
  CopyOp, 
  RepeatOp, 
  TemplateOp 
};
