/**
 * System V: Composition (Zero-shot Syntax)
 * 
 * Logic: Two independent inputs combine to form a unique output.
 * Grammar: Operator(Feature_A, Feature_B) -> Result
 * Real-World: Grammar (Adj+Noun), Chemistry, Arithmetic
 * Task: Zero-shot combination of unseen pairs
 * Metric: Compositional Generalization
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '05_composition';
export const SYSTEM_NAME = 'Composition';
export const SYSTEM_DESCRIPTION = 'Zero-shot combination of features';

export class CompositionGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numFeatureA = config.numFeatureA || 10; // e.g., colors
    this.numFeatureB = config.numFeatureB || 10; // e.g., shapes
    this.holdoutRatio = config.holdoutRatio || 0.2; // % of combinations for test
    
    this.featuresA = Array.from(
      { length: this.numFeatureA },
      (_, i) => `a${String(i).padStart(2, '0')}`
    );
    this.featuresB = Array.from(
      { length: this.numFeatureB },
      (_, i) => `b${String(i).padStart(2, '0')}`
    );
    
    this.compositions = new Map(); // "a_b" -> result
    this.trainPairs = [];
    this.testPairs = [];
    this._init();
  }

  _init() {
    let resultId = 0;
    const allPairs = [];
    
    // Create all combinations
    for (const a of this.featuresA) {
      for (const b of this.featuresB) {
        const key = `${a}_${b}`;
        const result = `r${String(resultId++).padStart(3, '0')}`;
        this.compositions.set(key, result);
        allPairs.push({ a, b, result, key });
      }
    }
    
    // Split into train/test ensuring:
    // - Each feature appears in training
    // - Some combinations are held out
    
    // Shuffle
    for (let i = allPairs.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
    }
    
    const holdoutCount = Math.floor(allPairs.length * this.holdoutRatio);
    
    // Ensure each feature appears at least once in training
    const seenA = new Set();
    const seenB = new Set();
    
    for (const pair of allPairs) {
      if (this.testPairs.length < holdoutCount && 
          seenA.has(pair.a) && seenB.has(pair.b)) {
        this.testPairs.push(pair);
      } else {
        this.trainPairs.push(pair);
        seenA.add(pair.a);
        seenB.add(pair.b);
      }
    }
  }

  compose(a, b) {
    return this.compositions.get(`${a}_${b}`);
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pair = this.trainPairs[i % this.trainPairs.length];
      lines.push(`${pair.a} ${pair.b} ${pair.result}`);
    }
    
    return lines;
  }

  generateTestData(count = null) {
    const lines = [];
    const testCount = count || this.testPairs.length;
    
    for (let i = 0; i < testCount; i++) {
      const pair = this.testPairs[i % this.testPairs.length];
      const difficulty = this.difficultyLevel !== null ? this.difficultyLevel : 2;
      const expectedJson = JSON.stringify(pair.result);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'composition',
        novel: true
      });
      lines.push(`${pair.a} ${pair.b}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  getGroundTruth(a, b) {
    return this.compose(a, b);
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numFeatureA: 6, numFeatureB: 6, holdoutRatio: 0.1 }
      : difficulty === 'hard'
        ? { numFeatureA: 14, numFeatureB: 14, holdoutRatio: 0.3 }
        : {};
  return new CompositionGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numFeatureA: 10,
  numFeatureB: 10,
  holdoutRatio: 0.2
};

export const metrics = {
  primary: 'compositionalGeneralization',
  secondary: ['seenPairAccuracy', 'novelPairAccuracy']
};
