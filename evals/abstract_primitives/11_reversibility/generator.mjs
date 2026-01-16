/**
 * System XI: Reversibility (Bidirectional Inference)
 * 
 * Logic: If A->B is learned, can the system infer B->A?
 * Grammar: encode(X) -> Y, decode(Y) -> X
 * Real-World: Encryption, Translation, Cause-Effect
 * Task: Train on A->B, test on B->A
 * Metric: Inverse Recall
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '11_reversibility';
export const SYSTEM_NAME = 'Reversibility';
export const SYSTEM_DESCRIPTION = 'Bidirectional inference capability';

export class ReversibilityGrammar {
  constructor(config = {}) {
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numPairs = config.numPairs || 200;
    
    this.forwardMap = new Map(); // A -> B
    this.reverseMap = new Map(); // B -> A
    this._init();
  }

  _init() {
    for (let i = 0; i < this.numPairs; i++) {
      const a = `a${String(i).padStart(4, '0')}`;
      const b = `b${String(i).padStart(4, '0')}`;
      
      this.forwardMap.set(a, b);
      this.reverseMap.set(b, a);
    }
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    const pairs = Array.from(this.forwardMap.entries());

    // Seed the query marker used in test prompts so it exists in the vocabulary.
    lines.push('decode');
    
    for (let i = 0; i < count; i++) {
      const [a, b] = pairs[i % pairs.length];
      // Only train forward direction
      lines.push(`${a} ${b}`);
      lines.push(`encode ${a} ${b}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    const pairs = Array.from(this.reverseMap.entries());
    
    // Test reverse direction (never trained)
    for (let i = 0; i < count; i++) {
      const [b, a] = pairs[i % pairs.length];
      const difficulty = this.difficultyLevel !== null ? this.difficultyLevel : 2;
      const expectedJson = JSON.stringify(a);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'reversibility',
        direction: 'reverse'
      });
      lines.push(`decode ${b}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  encode(a) {
    return this.forwardMap.get(a);
  }

  decode(b) {
    return this.reverseMap.get(b);
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numPairs: 50 }
      : difficulty === 'hard'
        ? { numPairs: 500 }
        : {};
  return new ReversibilityGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numPairs: 200
};

export const metrics = {
  primary: 'inverseRecall',
  secondary: ['forwardAccuracy', 'bidirectionalConsistency']
};
