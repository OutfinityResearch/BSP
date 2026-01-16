/**
 * System XVII: Inhibition (Competitive Suppression)
 * 
 * Logic: When multiple candidates compete, strongest wins and suppresses others
 * Grammar: Input -> {A (0.9), B (0.7), C (0.3)} - only A should output
 * Real-World: Attention, Lateral inhibition, Elections
 * Task: Given competing activations, produce only the winner
 * Metric: Winner Selection Accuracy, Suppression Rate
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '17_inhibition';
export const SYSTEM_NAME = 'Inhibition';
export const SYSTEM_DESCRIPTION = 'Competitive winner-take-all suppression';

export class InhibitionGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numInputs = config.numInputs || 50;
    this.numCandidates = config.numCandidates || 5;
    
    this.competitions = new Map(); // input -> [{candidate, strength}]
    this._init();
  }

  _init() {
    let candidateId = 0;
    
    for (let i = 0; i < this.numInputs; i++) {
      const input = `inp${String(i).padStart(3, '0')}`;
      const candidates = [];
      
      for (let c = 0; c < this.numCandidates; c++) {
        candidates.push({
          candidate: `cand${String(candidateId++).padStart(4, '0')}`,
          strength: this.rng()
        });
      }
      
      // Sort by strength descending
      candidates.sort((a, b) => b.strength - a.strength);
      this.competitions.set(input, candidates);
    }
  }

  getWinner(input) {
    const candidates = this.competitions.get(input);
    return candidates ? candidates[0].candidate : null;
  }

  getLosers(input) {
    const candidates = this.competitions.get(input);
    return candidates ? candidates.slice(1).map(c => c.candidate) : [];
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    const inputs = Array.from(this.competitions.keys());
    
    for (let i = 0; i < count; i++) {
      const input = inputs[i % inputs.length];
      const candidates = this.competitions.get(input);
      const winner = candidates[0];
      
      // Show competition with winner
      const allCandidates = [];
      for (const c of candidates) {
        const score = Math.max(0, Math.min(99, Math.floor(c.strength * 100)));
        allCandidates.push(c.candidate, `score${String(score).padStart(2, '0')}`);
      }
      lines.push(`${input} candidates ${allCandidates.join(' ')} winner ${winner.candidate}`);
      
      // Explicit winner statement
      lines.push(`${input} winner ${winner.candidate}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    const inputs = Array.from(this.competitions.keys());
    
    for (let i = 0; i < count; i++) {
      const input = inputs[i % inputs.length];
      const candidates = this.competitions.get(input);
      const winner = candidates[0].candidate;
      const losers = candidates.slice(1).map(c => c.candidate);
      const margin = candidates.length > 1 ? (candidates[0].strength - candidates[1].strength) : 1;

      let difficulty = 1;
      if (margin < 0.1) difficulty = 3;
      else if (margin < 0.3) difficulty = 2;
      if (this.difficultyLevel !== null) difficulty = this.difficultyLevel;

      const expectedJson = JSON.stringify(winner);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'inhibition',
        margin: Number(margin.toFixed(6)),
        losers
      });
      
      lines.push(`${input}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numInputs: 30, numCandidates: 3 }
      : difficulty === 'hard'
        ? { numInputs: 80, numCandidates: 8 }
        : {};
  return new InhibitionGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numInputs: 50,
  numCandidates: 5
};

export const metrics = {
  primary: 'winnerSelectionAccuracy',
  secondary: ['suppressionRate', 'strengthCorrelation']
};
