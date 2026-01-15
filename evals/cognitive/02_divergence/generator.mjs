/**
 * System II: Divergence (Forecasting)
 * 
 * Logic: A single state can transition to multiple outcomes with specific probabilities.
 * Grammar: A -> {B (80%), C (20%)}
 * Real-World: Weather forecasting, Stock market, Narrative branching
 * Task: Given A, predict the distribution of next states
 * Metric: KL Divergence, Top-K Coverage
 */

export const SYSTEM_ID = '02_divergence';
export const SYSTEM_NAME = 'Divergence';
export const SYSTEM_DESCRIPTION = 'Single state leads to multiple probabilistic outcomes';

export class DivergenceGrammar {
  constructor(config = {}) {
    this.numStates = config.numStates || 100;
    this.numOutcomes = config.numOutcomes || 50;
    this.minBranches = config.minBranches || 2;
    this.maxBranches = config.maxBranches || 5;
    
    this.states = Array.from(
      { length: this.numStates },
      (_, i) => `s${String(i).padStart(3, '0')}`
    );
    this.outcomes = Array.from(
      { length: this.numOutcomes },
      (_, i) => `o${String(i).padStart(2, '0')}`
    );
    
    this.distributions = new Map(); // state -> [{outcome, probability}]
    this._init();
  }

  _init() {
    for (const state of this.states) {
      const numBranches = this.minBranches + 
        Math.floor(Math.random() * (this.maxBranches - this.minBranches + 1));
      
      // Generate random probabilities that sum to 1
      const rawProbs = Array.from({ length: numBranches }, () => Math.random());
      const sum = rawProbs.reduce((a, b) => a + b, 0);
      const probs = rawProbs.map(p => p / sum);
      
      // Assign outcomes
      const usedOutcomes = new Set();
      const distribution = [];
      
      for (let i = 0; i < numBranches; i++) {
        let outcome;
        do {
          outcome = this.outcomes[Math.floor(Math.random() * this.outcomes.length)];
        } while (usedOutcomes.has(outcome));
        usedOutcomes.add(outcome);
        distribution.push({ outcome, probability: probs[i] });
      }
      
      // Sort by probability descending
      distribution.sort((a, b) => b.probability - a.probability);
      this.distributions.set(state, distribution);
    }
  }

  sampleOutcome(state) {
    const dist = this.distributions.get(state);
    if (!dist) return null;
    
    const r = Math.random();
    let cumulative = 0;
    for (const { outcome, probability } of dist) {
      cumulative += probability;
      if (r <= cumulative) return outcome;
    }
    return dist[dist.length - 1].outcome;
  }

  generateSequence(length = 3) {
    const state = this.states[Math.floor(Math.random() * this.states.length)];
    const sequence = [state];
    
    for (let i = 0; i < length - 1; i++) {
      const outcome = this.sampleOutcome(sequence[0]); // Always from first state
      sequence.push(outcome);
    }
    
    return sequence;
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const state = this.states[Math.floor(Math.random() * this.states.length)];
      const outcome = this.sampleOutcome(state);
      lines.push(`${state} ${outcome}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    const statesUsed = new Set();
    
    // Ensure variety
    for (let i = 0; i < count; i++) {
      const state = this.states[i % this.states.length];
      const dist = this.distributions.get(state);
      // Format: state | expected_distribution (for evaluation)
      const distStr = dist.map(d => `${d.outcome}:${d.probability.toFixed(3)}`).join(',');
      lines.push(`${state}\t${distStr}`);
    }
    
    return lines;
  }

  getGroundTruth(state) {
    return this.distributions.get(state) || [];
  }
}

export function createGrammar(config) {
  return new DivergenceGrammar(config);
}

export const defaultConfig = {
  numStates: 100,
  numOutcomes: 50,
  minBranches: 2,
  maxBranches: 5
};

export const metrics = {
  primary: 'klDivergence',
  secondary: ['topKCoverage', 'mostLikelyAccuracy']
};
