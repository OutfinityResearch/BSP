/**
 * System XVI: Recursion (Self-Similar Structures)
 * 
 * Logic: Structures that contain smaller versions of themselves
 * Grammar: S -> a S b | epsilon (generates a^n b^n)
 * Real-World: Nested parentheses, Fractals, Recursive functions
 * Task: Given prefix, predict correct recursive closure
 * Metric: Nesting Depth Accuracy
 */

export const SYSTEM_ID = '16_recursion';
export const SYSTEM_NAME = 'Recursion';
export const SYSTEM_DESCRIPTION = 'Self-similar nested structures';

export class RecursionGrammar {
  constructor(config = {}) {
    this.maxDepth = config.maxDepth || 8;
    this.numPatterns = config.numPatterns || 5;
    
    this.patterns = []; // [{open, close}]
    this._init();
  }

  _init() {
    const pairs = [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '<', close: '>' },
      { open: 'BEGIN', close: 'END' }
    ];
    
    for (let i = 0; i < Math.min(this.numPatterns, pairs.length); i++) {
      this.patterns.push(pairs[i]);
    }
  }

  generateBalanced(pattern, depth) {
    const tokens = [];
    for (let i = 0; i < depth; i++) {
      tokens.push(pattern.open);
    }
    for (let i = 0; i < depth; i++) {
      tokens.push(pattern.close);
    }
    return tokens;
  }

  generateNested(pattern, depth) {
    if (depth === 0) return [];
    
    const inner = this.generateNested(pattern, depth - 1);
    return [pattern.open, ...inner, pattern.close];
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pattern = this.patterns[i % this.patterns.length];
      const depth = 1 + Math.floor(Math.random() * this.maxDepth);
      
      const seq = this.generateNested(pattern, depth);
      lines.push(seq.join(' '));
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pattern = this.patterns[i % this.patterns.length];
      const depth = 1 + Math.floor(Math.random() * this.maxDepth);
      
      const full = this.generateNested(pattern, depth);
      
      // Give partial (only opens), expect closes
      const opens = full.slice(0, depth);
      const closes = full.slice(depth);
      
      lines.push(`${opens.join(' ')}\t${closes.join(' ')}\t${depth}`);
    }
    
    return lines;
  }

  countUnclosed(sequence) {
    const tokens = sequence.trim().split(/\s+/);
    const stack = [];
    
    for (const token of tokens) {
      const openPattern = this.patterns.find(p => p.open === token);
      const closePattern = this.patterns.find(p => p.close === token);
      
      if (openPattern) {
        stack.push(openPattern);
      } else if (closePattern && stack.length > 0) {
        stack.pop();
      }
    }
    
    return stack.length;
  }
}

export function createGrammar(config) {
  return new RecursionGrammar(config);
}

export const defaultConfig = {
  maxDepth: 8,
  numPatterns: 5
};

export const metrics = {
  primary: 'nestingDepthAccuracy',
  secondary: ['balancedPrediction', 'depthTracking']
};
