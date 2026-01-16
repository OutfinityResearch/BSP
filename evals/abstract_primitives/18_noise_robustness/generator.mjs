/**
 * System XVIII: Noise Robustness (Partial Matching)
 * 
 * Logic: Recognize patterns even when inputs are noisy or incomplete
 * Grammar: Train on [A,B,C,D]->X, test with missing/corrupted elements
 * Real-World: OCR, Speech recognition, Typo tolerance
 * Task: Correctly classify despite noise
 * Metric: Degradation Curve (accuracy vs noise level)
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '18_noise_robustness';
export const SYSTEM_NAME = 'Noise Robustness';
export const SYSTEM_DESCRIPTION = 'Pattern recognition under noise';

export class NoiseRobustnessGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numPatterns = config.numPatterns || 50;
    this.patternLength = config.patternLength || 6;
    this.numNoiseTokens = config.numNoiseTokens || 20;
    this.noiseLevels = Array.isArray(config.noiseLevels) && config.noiseLevels.length > 0
      ? config.noiseLevels.map((v) => Number(v))
      : [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    
    this.patterns = []; // [{tokens, label}]
    this.noiseTokens = [];
    this._init();
  }

  _init() {
    let tokenId = 0;
    
    // Create clean patterns
    for (let p = 0; p < this.numPatterns; p++) {
      const tokens = [];
      for (let i = 0; i < this.patternLength; i++) {
        tokens.push(`t${String(tokenId++).padStart(4, '0')}`);
      }
      this.patterns.push({
        tokens,
        label: `label${String(p).padStart(2, '0')}`
      });
    }
    
    // Create noise tokens
    for (let n = 0; n < this.numNoiseTokens; n++) {
      this.noiseTokens.push(`noise${String(n).padStart(2, '0')}`);
    }
  }

  addNoise(pattern, noiseLevel) {
    const noisy = [...pattern.tokens];
    const numCorruptions = Math.floor(noisy.length * noiseLevel);
    
    for (let i = 0; i < numCorruptions; i++) {
      const idx = Math.floor(this.rng() * noisy.length);
      const noiseType = this.rng();
      
      if (noiseType < 0.33) {
        // Replace with noise token
        noisy[idx] = this.noiseTokens[Math.floor(this.rng() * this.noiseTokens.length)];
      } else if (noiseType < 0.66) {
        // Replace with mask
        noisy[idx] = 'gap';
      } else {
        // Swap with neighbor
        if (idx > 0) {
          [noisy[idx], noisy[idx - 1]] = [noisy[idx - 1], noisy[idx]];
        }
      }
    }
    
    return noisy;
  }

  generateTrainingData(count = 10000) {
    const lines = [];

    // Seed tokens that only appear in evaluation prompts so they exist in the vocabulary.
    lines.push('gap');
    for (const token of this.noiseTokens) {
      lines.push(token);
    }
    
    for (let i = 0; i < count; i++) {
      const pattern = this.patterns[i % this.patterns.length];
      lines.push(`${pattern.tokens.join(' ')} ${pattern.label}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pattern = this.patterns[i % this.patterns.length];
      const noiseLevel = this.noiseLevels[i % this.noiseLevels.length];
      
      const noisy = this.addNoise(pattern, noiseLevel);
      
      let difficulty = 1;
      if (noiseLevel >= 0.4) difficulty = 3;
      else if (noiseLevel >= 0.2) difficulty = 2;
      if (this.difficultyLevel !== null) difficulty = this.difficultyLevel;

      const expectedJson = JSON.stringify(pattern.label);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'noise_robustness',
        noise: noiseLevel
      });

      lines.push(`${noisy.join(' ')}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  findClosestPattern(noisyTokens) {
    let bestMatch = null;
    let bestScore = -1;
    
    for (const pattern of this.patterns) {
      let matches = 0;
      for (let i = 0; i < Math.min(noisyTokens.length, pattern.tokens.length); i++) {
        if (noisyTokens[i] === pattern.tokens[i]) {
          matches++;
        }
      }
      
      if (matches > bestScore) {
        bestScore = matches;
        bestMatch = pattern;
      }
    }
    
    return bestMatch;
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numPatterns: 40, patternLength: 4, numNoiseTokens: 10, noiseLevels: [0, 0.1, 0.2] }
      : difficulty === 'hard'
        ? { numPatterns: 80, patternLength: 8, numNoiseTokens: 40, noiseLevels: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7] }
        : {};
  return new NoiseRobustnessGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numPatterns: 50,
  patternLength: 6,
  numNoiseTokens: 20
};

export const metrics = {
  primary: 'degradationCurve',
  secondary: ['cleanAccuracy', 'noisyAccuracy', 'gracefulDegradation']
};
