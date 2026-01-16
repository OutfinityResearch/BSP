/**
 * System II: Divergence (Forecasting)
 * 
 * Logic: A single state can transition to multiple outcomes with specific probabilities.
 * Grammar: A -> {B (80%), C (20%)}
 * Real-World: Weather forecasting, Stock market, Narrative branching
 * Task: Given A, predict the distribution of next states
 * Metric: KL Divergence, Top-K Coverage
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '02_divergence';
export const SYSTEM_NAME = 'Divergence';
export const SYSTEM_DESCRIPTION = 'Single state leads to multiple probabilistic outcomes';

export class DivergenceGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
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
        Math.floor(this.rng() * (this.maxBranches - this.minBranches + 1));
      
      // Generate random probabilities that sum to 1
      const rawProbs = Array.from({ length: numBranches }, () => this.rng());
      const sum = rawProbs.reduce((a, b) => a + b, 0);
      const probs = rawProbs.map(p => p / sum);
      
      // Assign outcomes
      const usedOutcomes = new Set();
      const distribution = [];
      
      for (let i = 0; i < numBranches; i++) {
        let outcome;
        do {
          outcome = this.outcomes[Math.floor(this.rng() * this.outcomes.length)];
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
    
    const r = this.rng();
    let cumulative = 0;
    for (const { outcome, probability } of dist) {
      cumulative += probability;
      if (r <= cumulative) return outcome;
    }
    return dist[dist.length - 1].outcome;
  }

  generateSequence(length = 3) {
    const state = this.states[Math.floor(this.rng() * this.states.length)];
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
      const state = this.states[Math.floor(this.rng() * this.states.length)];
      const outcome = this.sampleOutcome(state);
      lines.push(`${state} ${outcome}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    // Ensure variety
    for (let i = 0; i < count; i++) {
      const state = this.states[i % this.states.length];
      const dist = this.distributions.get(state);

      const branches = dist.length;
      let difficulty = 1;
      if (branches >= 5) difficulty = 3;
      else if (branches >= 3) difficulty = 2;
      if (this.difficultyLevel !== null) difficulty = this.difficultyLevel;

      const expected = dist.map(({ outcome, probability }) => ({
        outcome,
        p: Number(probability.toFixed(6))
      }));

      const expectedJson = JSON.stringify(expected);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'divergence',
        branches
      });
      lines.push(`${state}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  getGroundTruth(state) {
    return this.distributions.get(state) || [];
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { minBranches: 2, maxBranches: 2 }
      : difficulty === 'hard'
        ? { minBranches: 3, maxBranches: 7 }
        : {};
  return new DivergenceGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
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
