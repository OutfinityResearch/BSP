/**
 * System VI: Negation (Mutual Exclusion)
 * 
 * Logic: If A is true, then B cannot be true. Groups are mutually exclusive.
 * Grammar: A -> {X, Y} | B -> {Z, W} where A and B never co-occur
 * Real-World: Differential diagnosis, Boolean toggles, Gender
 * Task: Predict what cannot follow
 * Metric: Exclusion Accuracy
 */

export const SYSTEM_ID = '06_negation';
export const SYSTEM_NAME = 'Negation';
export const SYSTEM_DESCRIPTION = 'Mutual exclusion between groups';

export class NegationGrammar {
  constructor(config = {}) {
    this.numExclusionPairs = config.numExclusionPairs || 20;
    this.numOutputsPerGroup = config.numOutputsPerGroup || 5;
    
    this.exclusionPairs = []; // [{groupA, groupB, outputsA, outputsB}]
    this._init();
  }

  _init() {
    let groupId = 0;
    let outputId = 0;
    
    for (let i = 0; i < this.numExclusionPairs; i++) {
      const groupA = `g${String(groupId++).padStart(3, '0')}`;
      const groupB = `g${String(groupId++).padStart(3, '0')}`;
      
      const outputsA = Array.from(
        { length: this.numOutputsPerGroup },
        () => `o${String(outputId++).padStart(3, '0')}`
      );
      const outputsB = Array.from(
        { length: this.numOutputsPerGroup },
        () => `o${String(outputId++).padStart(3, '0')}`
      );
      
      this.exclusionPairs.push({ groupA, groupB, outputsA, outputsB });
    }
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pair = this.exclusionPairs[Math.floor(Math.random() * this.exclusionPairs.length)];
      const useA = Math.random() < 0.5;
      
      if (useA) {
        const output = pair.outputsA[Math.floor(Math.random() * pair.outputsA.length)];
        lines.push(`${pair.groupA} ${output}`);
        // Explicit negation
        lines.push(`${pair.groupA} NOT ${pair.groupB}`);
      } else {
        const output = pair.outputsB[Math.floor(Math.random() * pair.outputsB.length)];
        lines.push(`${pair.groupB} ${output}`);
        lines.push(`${pair.groupB} NOT ${pair.groupA}`);
      }
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const pair = this.exclusionPairs[i % this.exclusionPairs.length];
      const useA = i % 2 === 0;
      
      if (useA) {
        // Given groupA, groupB should NOT appear
        lines.push(`${pair.groupA}\t${pair.groupB}\texcluded`);
      } else {
        lines.push(`${pair.groupB}\t${pair.groupA}\texcluded`);
      }
    }
    
    return lines;
  }

  getExcludedGroup(group) {
    for (const pair of this.exclusionPairs) {
      if (pair.groupA === group) return pair.groupB;
      if (pair.groupB === group) return pair.groupA;
    }
    return null;
  }
}

export function createGrammar(config) {
  return new NegationGrammar(config);
}

export const defaultConfig = {
  numExclusionPairs: 20,
  numOutputsPerGroup: 5
};

export const metrics = {
  primary: 'exclusionAccuracy',
  secondary: ['falsePositiveRate', 'mutualExclusionConsistency']
};
