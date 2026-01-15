/**
 * System XIII: Exceptions (Default + Override)
 * 
 * Logic: General rules apply unless more specific exception exists
 * Grammar: Bird -> canFly, Penguin (subset of Bird) -> !canFly
 * Real-World: Legal rules, OOP override, Grammar irregularities
 * Task: Apply correct rule based on specificity
 * Metric: Exception Handling Accuracy
 */

export const SYSTEM_ID = '13_exceptions';
export const SYSTEM_NAME = 'Exceptions';
export const SYSTEM_DESCRIPTION = 'Default rules with specific overrides';

export class ExceptionsGrammar {
  constructor(config = {}) {
    this.numCategories = config.numCategories || 10;
    this.instancesPerCategory = config.instancesPerCategory || 10;
    this.exceptionRatio = config.exceptionRatio || 0.2;
    
    this.categories = []; // [{name, defaultProperty, instances, exceptions}]
    this._init();
  }

  _init() {
    for (let c = 0; c < this.numCategories; c++) {
      const category = {
        name: `cat${String(c).padStart(2, '0')}`,
        defaultProperty: `prop${String(c).padStart(2, '0')}`,
        instances: [],
        exceptions: new Set()
      };
      
      for (let i = 0; i < this.instancesPerCategory; i++) {
        const instance = `${category.name}_inst${String(i).padStart(2, '0')}`;
        category.instances.push(instance);
        
        // Some instances are exceptions
        if (Math.random() < this.exceptionRatio) {
          category.exceptions.add(instance);
        }
      }
      
      this.categories.push(category);
    }
  }

  getProperty(instance) {
    for (const category of this.categories) {
      if (category.instances.includes(instance)) {
        if (category.exceptions.has(instance)) {
          return `!${category.defaultProperty}`; // Negated (exception)
        }
        return category.defaultProperty; // Default
      }
    }
    return null;
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (const category of this.categories) {
      // Default rule
      lines.push(`${category.name} -> ${category.defaultProperty}`);
      
      // Specific exceptions
      for (const exception of category.exceptions) {
        lines.push(`${exception} -> !${category.defaultProperty}`);
        lines.push(`${exception} EXCEPTION ${category.name}`);
      }
      
      // Regular instances
      for (const instance of category.instances) {
        if (!category.exceptions.has(instance)) {
          lines.push(`${instance} isa ${category.name}`);
        }
      }
    }
    
    // Repeat to reach count
    while (lines.length < count) {
      const category = this.categories[Math.floor(Math.random() * this.categories.length)];
      const instance = category.instances[Math.floor(Math.random() * category.instances.length)];
      const prop = this.getProperty(instance);
      lines.push(`${instance} has ${prop}`);
    }
    
    return lines.slice(0, count);
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const category = this.categories[i % this.categories.length];
      const instance = category.instances[Math.floor(Math.random() * category.instances.length)];
      const expected = this.getProperty(instance);
      const isException = category.exceptions.has(instance);
      
      lines.push(`${instance}\t${expected}\t${isException ? 'exception' : 'default'}`);
    }
    
    return lines;
  }
}

export function createGrammar(config) {
  return new ExceptionsGrammar(config);
}

export const defaultConfig = {
  numCategories: 10,
  instancesPerCategory: 10,
  exceptionRatio: 0.2
};

export const metrics = {
  primary: 'exceptionHandlingAccuracy',
  secondary: ['defaultRuleAccuracy', 'exceptionRecognition']
};
