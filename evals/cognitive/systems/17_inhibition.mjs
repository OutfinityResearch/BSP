/**
 * System XVII: Inhibition (Competitive Suppression)
 * 
 * Logic: When multiple candidates compete, strongest wins and suppresses others
 * Grammar: Input -> {A (0.9), B (0.7), C (0.3)} - only A should output
 * Real-World: Attention, Lateral inhibition, Elections
 * Task: Given competing activations, produce only the winner
 * Metric: Winner Selection Accuracy, Suppression Rate
 */

export const SYSTEM_ID = '17_inhibition';
export const SYSTEM_NAME = 'Inhibition';
export const SYSTEM_DESCRIPTION = 'Competitive winner-take-all suppression';

export class InhibitionGrammar {
  constructor(config = {}) {
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
          strength: Math.random()
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
      const allCandidates = candidates.map(c => 
        `${c.candidate}:${c.strength.toFixed(2)}`
      ).join(' ');
      
      lines.push(`${input} [${allCandidates}] -> ${winner.candidate}`);
      
      // Explicit winner statement
      lines.push(`${input} WINNER ${winner.candidate}`);
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
      const losers = candidates.slice(1).map(c => c.candidate).join(',');
      
      lines.push(`${input}\t${winner}\t${losers}`);
    }
    
    return lines;
  }
}

export function createGrammar(config) {
  return new InhibitionGrammar(config);
}

export const defaultConfig = {
  numInputs: 50,
  numCandidates: 5
};

export const metrics = {
  primary: 'winnerSelectionAccuracy',
  secondary: ['suppressionRate', 'strengthCorrelation']
};
