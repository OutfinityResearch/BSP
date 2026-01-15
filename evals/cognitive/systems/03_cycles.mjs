/**
 * System III: Cycles (Temporal Patterns)
 * 
 * Logic: Sequences repeat in a deterministic loop.
 * Grammar: A -> B -> C -> A
 * Real-World: Days of week, Traffic lights, Seasons, Engine cycles
 * Task: Given sequence A, B, predict C (and eventually A again)
 * Metric: Periodicity Retention
 */

export const SYSTEM_ID = '03_cycles';
export const SYSTEM_NAME = 'Cycles';
export const SYSTEM_DESCRIPTION = 'Deterministic temporal loops';

export class CyclesGrammar {
  constructor(config = {}) {
    this.numCycles = config.numCycles || 20;
    this.minPeriod = config.minPeriod || 3;
    this.maxPeriod = config.maxPeriod || 10;
    
    this.cycles = [];
    this._init();
  }

  _init() {
    let tokenId = 0;
    
    for (let c = 0; c < this.numCycles; c++) {
      const period = this.minPeriod + 
        Math.floor(Math.random() * (this.maxPeriod - this.minPeriod + 1));
      
      const cycle = [];
      for (let i = 0; i < period; i++) {
        cycle.push(`c${String(c).padStart(2, '0')}_${String(i).padStart(2, '0')}`);
      }
      
      this.cycles.push(cycle);
    }
  }

  generateSequence(numRotations = 3) {
    const cycleIdx = Math.floor(Math.random() * this.cycles.length);
    const cycle = this.cycles[cycleIdx];
    const startOffset = Math.floor(Math.random() * cycle.length);
    
    const sequence = [];
    for (let r = 0; r < numRotations; r++) {
      for (let i = 0; i < cycle.length; i++) {
        sequence.push(cycle[(startOffset + i) % cycle.length]);
      }
    }
    
    return sequence;
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const rotations = 2 + Math.floor(Math.random() * 3);
      const seq = this.generateSequence(rotations);
      lines.push(seq.join(' '));
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const cycleIdx = Math.floor(Math.random() * this.cycles.length);
      const cycle = this.cycles[cycleIdx];
      
      // Give partial sequence, expect continuation
      const contextLen = 2 + Math.floor(Math.random() * (cycle.length - 1));
      const startOffset = Math.floor(Math.random() * cycle.length);
      
      const context = [];
      for (let j = 0; j < contextLen; j++) {
        context.push(cycle[(startOffset + j) % cycle.length]);
      }
      
      const expectedNext = cycle[(startOffset + contextLen) % cycle.length];
      lines.push(`${context.join(' ')}\t${expectedNext}`);
    }
    
    return lines;
  }

  getGroundTruth(context) {
    // Find which cycle and position
    const tokens = context.trim().split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    
    for (const cycle of this.cycles) {
      const idx = cycle.indexOf(lastToken);
      if (idx !== -1) {
        return cycle[(idx + 1) % cycle.length];
      }
    }
    return null;
  }
}

export function createGrammar(config) {
  return new CyclesGrammar(config);
}

export const defaultConfig = {
  numCycles: 20,
  minPeriod: 3,
  maxPeriod: 10
};

export const metrics = {
  primary: 'periodicityRetention',
  secondary: ['nextStepAccuracy', 'cycleCompletionRate']
};
