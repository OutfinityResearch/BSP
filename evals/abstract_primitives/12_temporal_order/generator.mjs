/**
 * System XII: Temporal Order (Sequence Sensitivity)
 * 
 * Logic: Order matters: [A, B] != [B, A]
 * Grammar: [A, B] -> X, [B, A] -> Y where X != Y
 * Real-World: Grammar SVO/SOV, Workflows, Recipes, Stack ops
 * Task: Given ordered elements, predict result
 * Metric: Order Sensitivity Score
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '12_temporal_order';
export const SYSTEM_NAME = 'Temporal Order';
export const SYSTEM_DESCRIPTION = 'Sequence order sensitivity';

export class TemporalOrderGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numElements = config.numElements || 20;
    this.sequenceLength = config.sequenceLength || 3;
    
    this.elements = Array.from(
      { length: this.numElements },
      (_, i) => `e${String(i).padStart(2, '0')}`
    );
    
    this.orderMappings = new Map(); // "e1_e2_e3" -> result
    this._init();
  }

  _init() {
    let resultId = 0;
    
    // Generate subset of permutations (not all to keep manageable)
    const numMappings = Math.min(500, Math.pow(this.numElements, this.sequenceLength));
    
    for (let i = 0; i < numMappings; i++) {
      // Generate random sequence
      const seq = [];
      for (let j = 0; j < this.sequenceLength; j++) {
        seq.push(this.elements[Math.floor(this.rng() * this.elements.length)]);
      }
      
      const key = seq.join('_');
      if (!this.orderMappings.has(key)) {
        this.orderMappings.set(key, `r${String(resultId++).padStart(4, '0')}`);
      }
    }
  }

  getResult(sequence) {
    const key = sequence.join('_');
    return this.orderMappings.get(key);
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    const mappings = Array.from(this.orderMappings.entries());
    
    for (let i = 0; i < count; i++) {
      const [key, result] = mappings[i % mappings.length];
      const seq = key.split('_');
      lines.push(`${seq.join(' ')} ${result}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    const mappings = Array.from(this.orderMappings.entries());
    
    for (let i = 0; i < count; i++) {
      const [key, result] = mappings[i % mappings.length];
      const seq = key.split('_');
      
      // Also test reversed order (should give different result or none)
      const reversed = [...seq].reverse();
      const reversedKey = reversed.join('_');
      const reversedResult = this.orderMappings.get(reversedKey) || 'none';

      const difficulty = reversedResult === 'none' ? 1 : 2;
      const resolvedDifficulty = this.difficultyLevel !== null ? this.difficultyLevel : difficulty;
      const expectedJson = JSON.stringify(result);
      const metaJson = JSON.stringify({
        difficulty: resolvedDifficulty,
        family: 'temporal_order',
        reversedResult
      });

      lines.push(`${seq.join(' ')}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numElements: 10, sequenceLength: 2 }
      : difficulty === 'hard'
        ? { numElements: 30, sequenceLength: 4 }
        : {};
  return new TemporalOrderGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numElements: 20,
  sequenceLength: 3
};

export const metrics = {
  primary: 'orderSensitivityScore',
  secondary: ['correctOrderAccuracy', 'reversedOrderDifferentiation']
};
