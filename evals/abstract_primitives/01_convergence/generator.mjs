/**
 * System I: Convergence (Diagnostics)
 * 
 * Logic: Many distinct paths lead to a single, stable conclusion.
 * Grammar: S_i -> ... -> S_j -> T (Deterministic target)
 * Real-World: Medical diagnosis, Software debugging, River basins
 * Task: Given a start state, predict the final terminal T.
 * Metric: Transitive Closure Accuracy
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '01_convergence';
export const SYSTEM_NAME = 'Convergence';
export const SYSTEM_DESCRIPTION = 'Many paths lead to a single conclusion';

export class ConvergenceGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numTerminals = config.numTerminals || 50;
    this.numIntermediates = config.numIntermediates || 500;
    this.minPathLength = config.minPathLength || 3;
    this.maxPathLength = config.maxPathLength || 8;
    this.terminalStepProb = Number.isFinite(config.terminalStepProb) ? config.terminalStepProb : 0.1;
    this.maxNextStates = Number.isInteger(config.maxNextStates) ? config.maxNextStates : 2;
    
    this.terminals = Array.from(
      { length: this.numTerminals }, 
      (_, i) => `t${String(i).padStart(2, '0')}`
    );
    this.intermediates = Array.from(
      { length: this.numIntermediates }, 
      (_, i) => `s${String(i).padStart(4, '0')}`
    );
    
    this.transitions = new Map();
    this.stateTargets = new Map();
    this._init();
  }

  _init() {
    // Assign each intermediate state to a specific target terminal
    for (const state of this.intermediates) {
      const targetIndex = Math.floor(this.rng() * this.numTerminals);
      this.stateTargets.set(state, this.terminals[targetIndex]);
    }

    // Build transition graph ensuring convergence property
    for (const state of this.intermediates) {
      const myTarget = this.stateTargets.get(state);
      const isTerminalStep = this.rng() < this.terminalStepProb;
      
      if (isTerminalStep) {
        this.transitions.set(state, [myTarget]);
      } else {
        const potentialNext = this.intermediates.filter(s => 
          s !== state && this.stateTargets.get(s) === myTarget
        );
        
        if (potentialNext.length > 0) {
          const count = 1 + Math.floor(this.rng() * this.maxNextStates);
          const nextStates = [];
          for (let i = 0; i < count; i++) {
            nextStates.push(potentialNext[Math.floor(this.rng() * potentialNext.length)]);
          }
          this.transitions.set(state, nextStates);
        } else {
          this.transitions.set(state, [myTarget]);
        }
      }
    }
  }

  generateSequence() {
    let current = this.intermediates[Math.floor(this.rng() * this.intermediates.length)];
    const sequence = [current];
    let steps = 0;
    
    while (!this.terminals.includes(current) && steps < this.maxPathLength) {
      const options = this.transitions.get(current);
      if (!options || options.length === 0) break;
      
      current = options[Math.floor(this.rng() * options.length)];
      sequence.push(current);
      steps++;
    }
    
    if (!this.terminals.includes(current)) {
      sequence.push(this.stateTargets.get(sequence[0]));
    }
    
    return sequence;
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const seq = this.generateSequence();
      const target = seq[seq.length - 1];
      
      // Full sequence
      lines.push(seq.join(' '));
      
      // Shortcut: start -> target
      lines.push(`${seq[0]} ${target}`);
      
      // Random subsequences -> target
      if (seq.length > 2) {
        for (let j = 0; j < 2; j++) {
          const startIdx = Math.floor(this.rng() * (seq.length - 1));
          const subSeq = [seq[startIdx]];
          if (startIdx + 1 < seq.length - 1) {
            subSeq.push(seq[startIdx + 1]);
          }
          subSeq.push(target);
          lines.push(subSeq.join(' '));
        }
      }
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    for (let i = 0; i < count; i++) {
      const seq = this.generateSequence();
      const start = seq[0];
      const target = seq[seq.length - 1];
      const pathLength = Math.max(1, seq.length - 1);

      let difficulty = 1;
      if (pathLength >= 7) difficulty = 3;
      else if (pathLength >= 4) difficulty = 2;
      if (this.difficultyLevel !== null) difficulty = this.difficultyLevel;

      const expectedJson = JSON.stringify(target);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'convergence',
        pathLength
      });
      lines.push(`${start}\t${expectedJson}\t${metaJson}`);
    }
    return lines;
  }

  // For evaluation: extract ground truth
  getGroundTruth(sequence) {
    const tokens = sequence.trim().split(/\s+/);
    return {
      start: tokens[0],
      target: tokens[tokens.length - 1],
      next: tokens.length > 1 ? tokens[1] : null
    };
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { maxPathLength: 5, terminalStepProb: 0.25, maxNextStates: 1 }
      : difficulty === 'hard'
        ? { maxPathLength: 12, terminalStepProb: 0.05, maxNextStates: 3 }
        : {};
  return new ConvergenceGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numTerminals: 50,
  numIntermediates: 500,
  minPathLength: 3,
  maxPathLength: 8
};

export const metrics = {
  primary: 'transitiveClosureAccuracy',
  secondary: ['nextStepAccuracy', 'pathLengthCorrelation']
};
