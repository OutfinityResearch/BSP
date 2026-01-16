/**
 * System XV: Counting (Threshold-based Decisions)
 * 
 * Logic: Count occurrences and decide based on threshold
 * Grammar: A^n -> B if n >= 3, A^n -> C if n < 3
 * Real-World: Rate limiting, Voting, Quorum, Pattern frequency
 * Task: After N repetitions, predict correct transition
 * Metric: Threshold Detection Accuracy
 */

export const SYSTEM_ID = '15_counting';
export const SYSTEM_NAME = 'Counting';
export const SYSTEM_DESCRIPTION = 'Threshold-based counting decisions';

export class CountingGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.numPatterns = config.numPatterns || 20;
    this.minThreshold = config.minThreshold || 2;
    this.maxThreshold = config.maxThreshold || 6;
    
    this.patterns = []; // [{token, threshold, belowResult, aboveResult}]
    this._init();
  }

  _init() {
    for (let p = 0; p < this.numPatterns; p++) {
      const threshold = this.minThreshold + 
        Math.floor(this.rng() * (this.maxThreshold - this.minThreshold + 1));
      
      this.patterns.push({
        token: `p${String(p).padStart(2, '0')}`,
        threshold,
        belowResult: `below${String(p).padStart(2, '0')}`,
        aboveResult: `above${String(p).padStart(2, '00')}`
      });
    }
  }

  getResult(token, count) {
    const pattern = this.patterns.find(p => p.token === token);
    if (!pattern) return null;
    
    return count >= pattern.threshold ? pattern.aboveResult : pattern.belowResult;
  }

  generateSequence(pattern, count) {
    const tokens = Array(count).fill(pattern.token);
    const result = count >= pattern.threshold ? pattern.aboveResult : pattern.belowResult;
    return [...tokens, result];
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pattern = this.patterns[i % this.patterns.length];
      
      // Vary count around threshold
      const countVariation = Math.floor(this.rng() * (this.maxThreshold + 2));
      const seq = this.generateSequence(pattern, countVariation);
      
      lines.push(seq.join(' '));
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pattern = this.patterns[i % this.patterns.length];
      
      // Test various counts
      const testCount = 1 + (i % (this.maxThreshold + 2));
      const tokens = Array(testCount).fill(pattern.token);
      const expected = this.getResult(pattern.token, testCount);

      const distance = Math.abs(testCount - pattern.threshold);
      let difficulty = 1;
      if (distance === 0) difficulty = 3;
      else if (distance === 1) difficulty = 2;

      const expectedJson = JSON.stringify(expected);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'counting',
        count: testCount,
        threshold: pattern.threshold
      });

      lines.push(`${tokens.join(' ')}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }
}

export function createGrammar(config) {
  return new CountingGrammar(config);
}

export const defaultConfig = {
  numPatterns: 20,
  minThreshold: 2,
  maxThreshold: 6
};

export const metrics = {
  primary: 'thresholdDetectionAccuracy',
  secondary: ['belowThresholdAccuracy', 'aboveThresholdAccuracy', 'boundaryAccuracy']
};
