/**
 * System IX: Context Switching
 * 
 * Logic: Same input produces different outputs depending on active context
 * Grammar: [Ctx1] A -> B, [Ctx2] A -> C
 * Real-World: Polysemy, Mode switching, Language switching
 * Task: Given context and input, predict context-appropriate output
 * Metric: Context-Conditional Accuracy
 */

export const SYSTEM_ID = '09_context_switching';
export const SYSTEM_NAME = 'Context Switching';
export const SYSTEM_DESCRIPTION = 'Context-dependent output mapping';

export class ContextSwitchingGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.numContexts = config.numContexts || 5;
    this.numInputs = config.numInputs || 50;
    
    this.contexts = Array.from(
      { length: this.numContexts },
      (_, i) => `ctx${String(i).padStart(2, '0')}`
    );
    this.inputs = Array.from(
      { length: this.numInputs },
      (_, i) => `inp${String(i).padStart(3, '0')}`
    );
    
    this.mappings = new Map(); // "ctx_inp" -> output
    this._init();
  }

  _init() {
    let outputId = 0;
    
    for (const ctx of this.contexts) {
      for (const inp of this.inputs) {
        const key = `${ctx}_${inp}`;
        const output = `out${String(outputId++).padStart(4, '0')}`;
        this.mappings.set(key, output);
      }
    }
  }

  getOutput(context, input) {
    return this.mappings.get(`${context}_${input}`);
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const ctx = this.contexts[Math.floor(this.rng() * this.contexts.length)];
      const inp = this.inputs[Math.floor(this.rng() * this.inputs.length)];
      const output = this.getOutput(ctx, inp);
      
      lines.push(`${ctx} ${inp} ${output}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const ctx = this.contexts[i % this.contexts.length];
      const inp = this.inputs[Math.floor(this.rng() * this.inputs.length)];
      const expected = this.getOutput(ctx, inp);
      
      const expectedJson = JSON.stringify(expected);
      const metaJson = JSON.stringify({
        difficulty: 1,
        family: 'context_switching',
        context: ctx
      });
      lines.push(`${ctx} ${inp}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }
}

export function createGrammar(config) {
  return new ContextSwitchingGrammar(config);
}

export const defaultConfig = {
  numContexts: 5,
  numInputs: 50
};

export const metrics = {
  primary: 'contextConditionalAccuracy',
  secondary: ['contextConfusionRate', 'inputInvarianceScore']
};
