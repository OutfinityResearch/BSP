/**
 * System VII: Conditional Gates (Boolean Logic)
 * 
 * Logic: Output depends on logical combinations: AND, OR, XOR
 * Grammar: (A AND B) -> C, (A AND NOT B) -> D, etc.
 * Real-World: Digital circuits, Access control, Feature flags
 * Task: Given premises, predict correct conclusion
 * Metric: Logic Gate Accuracy per operator
 */

export const SYSTEM_ID = '07_conditional_gates';
export const SYSTEM_NAME = 'Conditional Gates';
export const SYSTEM_DESCRIPTION = 'Boolean logic combinations';

export class ConditionalGatesGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.numVariables = config.numVariables || 10;
    this.numGatesPerType = config.numGatesPerType || 20;
    
    this.variables = Array.from(
      { length: this.numVariables },
      (_, i) => `v${String(i).padStart(2, '0')}`
    );
    
    this.gates = []; // [{type, inputA, inputB, output}]
    this._init();
  }

  _init() {
    const gateTypes = ['and', 'or', 'xor', 'nand', 'nor'];
    let outputId = 0;
    
    for (const type of gateTypes) {
      for (let i = 0; i < this.numGatesPerType; i++) {
        const inputA = this.variables[Math.floor(this.rng() * this.variables.length)];
        let inputB;
        do {
          inputB = this.variables[Math.floor(this.rng() * this.variables.length)];
        } while (inputB === inputA);
        
        const output = `out${String(outputId++).padStart(3, '0')}`;
        this.gates.push({ type, inputA, inputB, output });
      }
    }
  }

  evaluateGate(type, a, b) {
    switch (type) {
      case 'and': return a && b;
      case 'or': return a || b;
      case 'xor': return a !== b;
      case 'nand': return !(a && b);
      case 'nor': return !(a || b);
      default: return false;
    }
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const gate = this.gates[i % this.gates.length];
      const valA = this.rng() < 0.5;
      const valB = this.rng() < 0.5;
      const result = this.evaluateGate(gate.type, valA, valB);
      
      const strA = valA ? gate.inputA : `not${gate.inputA}`;
      const strB = valB ? gate.inputB : `not${gate.inputB}`;
      const strResult = result ? gate.output : `not${gate.output}`;
      
      lines.push(`${strA} ${gate.type} ${strB} ${strResult}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const gate = this.gates[i % this.gates.length];
      const valA = this.rng() < 0.5;
      const valB = this.rng() < 0.5;
      const result = this.evaluateGate(gate.type, valA, valB);
      
      const strA = valA ? gate.inputA : `not${gate.inputA}`;
      const strB = valB ? gate.inputB : `not${gate.inputB}`;
      const expected = result ? gate.output : `not${gate.output}`;
      
      let difficulty = 1;
      if (gate.type === 'xor') difficulty = 2;
      else if (gate.type === 'nand' || gate.type === 'nor') difficulty = 3;

      const expectedJson = JSON.stringify(expected);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'conditional_gates',
        gate: gate.type
      });

      lines.push(`${strA} ${gate.type} ${strB}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  getGroundTruth(inputA, inputB, type) {
    return this.evaluateGate(type, inputA, inputB);
  }
}

export function createGrammar(config) {
  return new ConditionalGatesGrammar(config);
}

export const defaultConfig = {
  numVariables: 10,
  numGatesPerType: 20
};

export const metrics = {
  primary: 'logicGateAccuracy',
  secondary: ['andAccuracy', 'orAccuracy', 'xorAccuracy', 'nandAccuracy', 'norAccuracy']
};
