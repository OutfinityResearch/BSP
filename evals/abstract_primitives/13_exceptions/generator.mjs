/**
 * System XIII: Exceptions (Default + Override)
 * 
 * Logic: General rules apply unless more specific exception exists
 * Grammar: Bird -> canFly, Penguin (subset of Bird) -> !canFly
 * Real-World: Legal rules, OOP override, Grammar irregularities
 * Task: Apply correct rule based on specificity
 * Metric: Exception Handling Accuracy
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '13_exceptions';
export const SYSTEM_NAME = 'Exceptions';
export const SYSTEM_DESCRIPTION = 'Default rules with specific overrides';

export class ExceptionsGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
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
        const instance = `${category.name}xinst${String(i).padStart(2, '0')}`;
        category.instances.push(instance);
        
        // Some instances are exceptions
        if (this.rng() < this.exceptionRatio) {
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
          return `not${category.defaultProperty}`; // Negated (exception)
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
      lines.push(`${category.name} default ${category.defaultProperty}`);
      
      // Specific exceptions
      for (const exception of category.exceptions) {
        lines.push(`${exception} has not${category.defaultProperty}`);
        lines.push(`${exception} exceptionof ${category.name}`);
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
      const category = this.categories[Math.floor(this.rng() * this.categories.length)];
      const instance = category.instances[Math.floor(this.rng() * category.instances.length)];
      const prop = this.getProperty(instance);
      lines.push(`${instance} has ${prop}`);
    }
    
    return lines.slice(0, count);
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const category = this.categories[i % this.categories.length];
      const instance = category.instances[Math.floor(this.rng() * category.instances.length)];
      const expected = this.getProperty(instance);
      const isException = category.exceptions.has(instance);

      const kind = isException ? 'exception' : 'default';
      const expectedJson = JSON.stringify(expected);
      const metaJson = JSON.stringify({
        difficulty: this.difficultyLevel !== null ? this.difficultyLevel : (isException ? 3 : 1),
        family: 'exceptions',
        kind
      });

      lines.push(`${instance}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numCategories: 5, instancesPerCategory: 8, exceptionRatio: 0.1 }
      : difficulty === 'hard'
        ? { numCategories: 20, instancesPerCategory: 12, exceptionRatio: 0.3 }
        : {};
  return new ExceptionsGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
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
