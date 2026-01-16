/**
 * System XIV: Interpolation (Gap Filling)
 * 
 * Logic: Complete missing elements based on surrounding context
 * Grammar: A, _, C, D -> B (infer missing)
 * Real-World: Cloze tests, Missing data, BERT masking
 * Task: Predict missing element(s)
 * Metric: Gap-Fill Accuracy
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '14_interpolation';
export const SYSTEM_NAME = 'Interpolation';
export const SYSTEM_DESCRIPTION = 'Gap filling from context';

export class InterpolationGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numSequences = config.numSequences || 100;
    this.sequenceLength = config.sequenceLength || 5;
    
    this.sequences = []; // Fixed sequences
    this._init();
  }

  _init() {
    let tokenId = 0;
    
    for (let s = 0; s < this.numSequences; s++) {
      const seq = [];
      for (let i = 0; i < this.sequenceLength; i++) {
        seq.push(`t${String(tokenId++).padStart(4, '0')}`);
      }
      this.sequences.push(seq);
    }
  }

  generateTrainingData(count = 10000) {
    const lines = [];

    // Seed the gap marker used in test prompts so it exists in the vocabulary.
    lines.push('gap');
    
    for (let i = 0; i < count; i++) {
      const seq = this.sequences[i % this.sequences.length];
      lines.push(seq.join(' '));
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const seq = this.sequences[i % this.sequences.length];
      
      // Remove one element (not first or last for better context)
      const gapIdx = 1 + Math.floor(this.rng() * (seq.length - 2));
      const masked = [...seq];
      const missing = masked[gapIdx];
      masked[gapIdx] = 'gap';
      
      const expectedJson = JSON.stringify(missing);
      const isEdge = gapIdx === 1 || gapIdx === masked.length - 2;
      const metaJson = JSON.stringify({
        difficulty: this.difficultyLevel !== null ? this.difficultyLevel : (isEdge ? 3 : 1),
        family: 'interpolation',
        gapIndex: gapIdx,
        sequenceLength: masked.length
      });
      lines.push(`${masked.join(' ')}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  fillGap(maskedSequence) {
    const tokens = maskedSequence.split(/\s+/);
    const gapIdx = tokens.indexOf('gap');
    
    // Find matching sequence
    for (const seq of this.sequences) {
      let matches = true;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] !== 'gap' && tokens[i] !== seq[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return seq[gapIdx];
      }
    }
    return null;
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numSequences: 50, sequenceLength: 4 }
      : difficulty === 'hard'
        ? { numSequences: 200, sequenceLength: 8 }
        : {};
  return new InterpolationGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numSequences: 100,
  sequenceLength: 5
};

export const metrics = {
  primary: 'gapFillAccuracy',
  secondary: ['contextUtilization', 'positionInvariance']
};
