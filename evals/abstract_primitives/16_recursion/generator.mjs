/**
 * System XVI: Recursion (Self-Similar Structures)
 * 
 * Logic: Structures that contain smaller versions of themselves
 * Grammar: S -> a S b | epsilon (generates a^n b^n)
 * Real-World: Nested parentheses, Fractals, Recursive functions
 * Task: Given prefix, predict correct recursive closure
 * Metric: Nesting Depth Accuracy
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '16_recursion';
export const SYSTEM_NAME = 'Recursion';
export const SYSTEM_DESCRIPTION = 'Self-similar nested structures';

export class RecursionGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.maxDepth = config.maxDepth || 8;
    this.numPatterns = config.numPatterns || 5;
    
    this.patterns = []; // [{open, close}]
    this._init();
  }

  _init() {
    const pairs = [
      { open: 'op0', close: 'cl0' },
      { open: 'op1', close: 'cl1' },
      { open: 'op2', close: 'cl2' },
      { open: 'op3', close: 'cl3' },
      { open: 'begin', close: 'end' }
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
      const depth = 1 + Math.floor(this.rng() * this.maxDepth);
      
      const seq = this.generateNested(pattern, depth);
      lines.push(seq.join(' '));
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pattern = this.patterns[i % this.patterns.length];
      const depth = 1 + Math.floor(this.rng() * this.maxDepth);
      
      const full = this.generateNested(pattern, depth);
      
      // Give partial (only opens), expect closes
      const opens = full.slice(0, depth);
      const closes = full.slice(depth);

      let difficulty = 1;
      if (depth >= 6) difficulty = 3;
      else if (depth >= 3) difficulty = 2;
      if (this.difficultyLevel !== null) difficulty = this.difficultyLevel;

      const expectedJson = JSON.stringify(closes);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'recursion',
        depth,
        open: pattern.open,
        close: pattern.close
      });

      lines.push(`${opens.join(' ')}\t${expectedJson}\t${metaJson}`);
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
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { maxDepth: 3, numPatterns: 2 }
      : difficulty === 'hard'
        ? { maxDepth: 12, numPatterns: 5 }
        : {};
  return new RecursionGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  maxDepth: 8,
  numPatterns: 5
};

export const metrics = {
  primary: 'nestingDepthAccuracy',
  secondary: ['balancedPrediction', 'depthTracking']
};
