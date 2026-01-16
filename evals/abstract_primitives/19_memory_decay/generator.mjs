/**
 * System XIX: Memory Decay (Recency Effects)
 * 
 * Logic: Recent information is more reliable/relevant than older
 * Grammar: Context window with recency weighting
 * Real-World: Working memory, News relevance, Cache invalidation
 * Task: Predict based on context with recency effects
 * Metric: Recency Sensitivity Curve
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '19_memory_decay';
export const SYSTEM_NAME = 'Memory Decay';
export const SYSTEM_DESCRIPTION = 'Recency effects in context';

export class MemoryDecayGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numTokens = config.numTokens || 50;
    this.contextLength = config.contextLength || 10;
    
    this.tokens = Array.from(
      { length: this.numTokens },
      (_, i) => `tok${String(i).padStart(3, '0')}`
    );
    
    // Each token predicts a specific next token
    this.predictions = new Map();
    this._init();
  }

  _init() {
    for (let i = 0; i < this.tokens.length; i++) {
      // Token i predicts token (i+1) % length
      this.predictions.set(
        this.tokens[i], 
        this.tokens[(i + 1) % this.tokens.length]
      );
    }
  }

  generateSequence(length) {
    const start = Math.floor(this.rng() * this.tokens.length);
    const seq = [];
    
    for (let i = 0; i < length; i++) {
      seq.push(this.tokens[(start + i) % this.tokens.length]);
    }
    
    return seq;
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const length = 3 + Math.floor(this.rng() * (this.contextLength - 2));
      const seq = this.generateSequence(length);
      lines.push(seq.join(' '));
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      // Generate context with varying "signal" position
      const contextLen = this.contextLength;
      const signalPos = i % contextLen; // Position of the relevant token
      
      const context = [];
      const signalToken = this.tokens[Math.floor(this.rng() * this.tokens.length)];
      const expected = this.predictions.get(signalToken);
      
      // Fill context with noise, place signal at specific position
      for (let j = 0; j < contextLen; j++) {
        if (j === contextLen - 1 - signalPos) {
          context.push(signalToken);
        } else {
          // Random distractor
          context.push(this.tokens[Math.floor(this.rng() * this.tokens.length)]);
        }
      }
      
      // Recency = how far from end (0 = most recent)
      const recency = signalPos;
      
      let difficulty = 1;
      if (recency >= 6) difficulty = 3;
      else if (recency >= 3) difficulty = 2;
      if (this.difficultyLevel !== null) difficulty = this.difficultyLevel;

      const expectedJson = JSON.stringify(expected);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'memory_decay',
        recency
      });

      lines.push(`${context.join(' ')}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  getMostRecentPrediction(context) {
    const tokens = context.trim().split(/\s+/);
    // Most recent token determines prediction
    const lastToken = tokens[tokens.length - 1];
    return this.predictions.get(lastToken);
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numTokens: 30, contextLength: 6 }
      : difficulty === 'hard'
        ? { numTokens: 80, contextLength: 20 }
        : {};
  return new MemoryDecayGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numTokens: 50,
  contextLength: 10
};

export const metrics = {
  primary: 'recencySensitivityCurve',
  secondary: ['recentAccuracy', 'distantAccuracy', 'decayRate']
};
