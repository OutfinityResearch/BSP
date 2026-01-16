/**
 * System XX: Transfer Learning (Domain Shift)
 * 
 * Logic: Apply knowledge from one domain to structurally similar new domain
 * Grammar: Domain1 {a,b,c} with rules R, Domain2 {α,β,γ} with isomorphic R'
 * Real-World: Second language, Math to physics, Code in new framework
 * Task: After learning Domain1, learn Domain2 with fewer examples
 * Metric: Sample Efficiency Ratio
 */

export const SYSTEM_ID = '20_transfer';
export const SYSTEM_NAME = 'Transfer';
export const SYSTEM_DESCRIPTION = 'Domain adaptation and transfer';

export class TransferGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.numSymbolsPerDomain = config.numSymbolsPerDomain || 10;
    this.numRules = config.numRules || 20;
    
    this.domain1 = { name: 'D1', symbols: [], rules: [] };
    this.domain2 = { name: 'D2', symbols: [], rules: [] };
    this._init();
  }

  _init() {
    // Create Domain 1 symbols
    for (let i = 0; i < this.numSymbolsPerDomain; i++) {
      this.domain1.symbols.push(`d1x${String(i).padStart(2, '0')}`);
      this.domain2.symbols.push(`d2x${String(i).padStart(2, '0')}`);
    }
    
    // Create isomorphic rules
    // Rule: symbol_i + symbol_j -> symbol_k
    for (let r = 0; r < this.numRules; r++) {
      const i = Math.floor(this.rng() * this.numSymbolsPerDomain);
      const j = Math.floor(this.rng() * this.numSymbolsPerDomain);
      const k = Math.floor(this.rng() * this.numSymbolsPerDomain);
      
      this.domain1.rules.push({
        input1: this.domain1.symbols[i],
        input2: this.domain1.symbols[j],
        output: this.domain1.symbols[k]
      });
      
      // Isomorphic rule in domain 2
      this.domain2.rules.push({
        input1: this.domain2.symbols[i],
        input2: this.domain2.symbols[j],
        output: this.domain2.symbols[k]
      });
    }
  }

  generateDomainData(domain, count) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const rule = domain.rules[i % domain.rules.length];
      lines.push(`${rule.input1} ${rule.input2} ${rule.output}`);
    }
    
    return lines;
  }

  generateTrainingData(count = 10000) {
    // Full training on Domain 1
    return this.generateDomainData(this.domain1, count);
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    // Test on Domain 2 with minimal examples provided
    const fewShotExamples = 5; // Number of D2 examples shown
    
    // First, provide few-shot examples
    for (let i = 0; i < fewShotExamples; i++) {
      const rule = this.domain2.rules[i];
      const expectedJson = JSON.stringify(rule.output);
      const metaJson = JSON.stringify({
        difficulty: 1,
        family: 'transfer',
        domain: 'd2',
        kind: 'support'
      });
      lines.push(`${rule.input1} ${rule.input2}\t${expectedJson}\t${metaJson}`);
    }
    
    // Then test on remaining rules
    for (let i = fewShotExamples; i < Math.min(count, this.domain2.rules.length); i++) {
      const rule = this.domain2.rules[i];
      const expectedJson = JSON.stringify(rule.output);
      const metaJson = JSON.stringify({
        difficulty: 2,
        family: 'transfer',
        domain: 'd2',
        kind: 'query'
      });
      lines.push(`${rule.input1} ${rule.input2}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  // Map from D1 symbol to D2 symbol
  getMapping() {
    const mapping = new Map();
    for (let i = 0; i < this.numSymbolsPerDomain; i++) {
      mapping.set(this.domain1.symbols[i], this.domain2.symbols[i]);
    }
    return mapping;
  }
}

export function createGrammar(config) {
  return new TransferGrammar(config);
}

export const defaultConfig = {
  numSymbolsPerDomain: 10,
  numRules: 20
};

export const metrics = {
  primary: 'sampleEfficiencyRatio',
  secondary: ['domain1Accuracy', 'domain2Accuracy', 'transferRate']
};
