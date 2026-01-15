/**
 * System XIV: Interpolation (Gap Filling)
 * 
 * Logic: Complete missing elements based on surrounding context
 * Grammar: A, _, C, D -> B (infer missing)
 * Real-World: Cloze tests, Missing data, BERT masking
 * Task: Predict missing element(s)
 * Metric: Gap-Fill Accuracy
 */

export const SYSTEM_ID = '14_interpolation';
export const SYSTEM_NAME = 'Interpolation';
export const SYSTEM_DESCRIPTION = 'Gap filling from context';

export class InterpolationGrammar {
  constructor(config = {}) {
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
      const gapIdx = 1 + Math.floor(Math.random() * (seq.length - 2));
      const masked = [...seq];
      const missing = masked[gapIdx];
      masked[gapIdx] = '_';
      
      lines.push(`${masked.join(' ')}\t${missing}\t${gapIdx}`);
    }
    
    return lines;
  }

  fillGap(maskedSequence) {
    const tokens = maskedSequence.split(/\s+/);
    const gapIdx = tokens.indexOf('_');
    
    // Find matching sequence
    for (const seq of this.sequences) {
      let matches = true;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] !== '_' && tokens[i] !== seq[i]) {
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
  return new InterpolationGrammar(config);
}

export const defaultConfig = {
  numSequences: 100,
  sequenceLength: 5
};

export const metrics = {
  primary: 'gapFillAccuracy',
  secondary: ['contextUtilization', 'positionInvariance']
};
