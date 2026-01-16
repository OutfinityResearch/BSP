/**
 * System VIII: Analogy (Proportional Reasoning)
 * 
 * Logic: A:B :: C:D - Transform applied to one pair transfers to another
 * Grammar: transform(king, male->female) = queen
 * Real-World: Word embeddings, IQ tests, Metaphors
 * Task: Given A:B and C, predict D
 * Metric: Analogy Completion Accuracy
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '08_analogy';
export const SYSTEM_NAME = 'Analogy';
export const SYSTEM_DESCRIPTION = 'Proportional relational reasoning';

export class AnalogyGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.numDomains = config.numDomains || 10;
    this.numTransforms = config.numTransforms || 5;
    this.itemsPerDomain = config.itemsPerDomain || 8;
    
    this.domains = []; // [{name, items: [{base, transformed}]}]
    this.transforms = []; // transform names
    this._init();
  }

  _init() {
    // Create transforms
    for (let t = 0; t < this.numTransforms; t++) {
      this.transforms.push(`t${String(t).padStart(2, '0')}`);
    }
    
    // Create domains with items that follow transforms
    let itemId = 0;
    
    for (let d = 0; d < this.numDomains; d++) {
      const domain = {
        name: `d${String(d).padStart(2, '0')}`,
        items: []
      };
      
      for (let i = 0; i < this.itemsPerDomain; i++) {
        const base = `i${String(itemId++).padStart(4, '0')}`;
        const transformedVersions = {};
        
        for (const transform of this.transforms) {
          transformedVersions[transform] = `i${String(itemId++).padStart(4, '0')}`;
        }
        
        domain.items.push({ base, transformed: transformedVersions });
      }
      
      this.domains.push(domain);
    }
  }

  generateTrainingData(count = 10000) {
    const lines = [];

    // Seed prompt-only marker used in test queries so it exists in the vocabulary.
    lines.push('as');
    
    for (let i = 0; i < count; i++) {
      const domain = this.domains[Math.floor(this.rng() * this.domains.length)];
      const transform = this.transforms[Math.floor(this.rng() * this.transforms.length)];
      const item = domain.items[Math.floor(this.rng() * domain.items.length)];
      
      // Base -> Transformed relationship
      lines.push(`${item.base} ${transform} ${item.transformed[transform]}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const domain = this.domains[Math.floor(this.rng() * this.domains.length)];
      const transform = this.transforms[Math.floor(this.rng() * this.transforms.length)];
      
      // Pick two different items from same domain
      const idx1 = Math.floor(this.rng() * domain.items.length);
      let idx2;
      do {
        idx2 = Math.floor(this.rng() * domain.items.length);
      } while (idx2 === idx1);
      
      const item1 = domain.items[idx1];
      const item2 = domain.items[idx2];
      
      const expected = item2.transformed[transform];
      const difficulty = this.difficultyLevel !== null ? this.difficultyLevel : 2;
      const expectedJson = JSON.stringify(expected);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'analogy',
        transform
      });
      lines.push(`${item1.base} ${item1.transformed[transform]} as ${item2.base}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  applyTransform(item, transform) {
    for (const domain of this.domains) {
      for (const domainItem of domain.items) {
        if (domainItem.base === item) {
          return domainItem.transformed[transform];
        }
      }
    }
    return null;
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { numDomains: 5, numTransforms: 2, itemsPerDomain: 6 }
      : difficulty === 'hard'
        ? { numDomains: 20, numTransforms: 8, itemsPerDomain: 10 }
        : {};
  return new AnalogyGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  numDomains: 10,
  numTransforms: 5,
  itemsPerDomain: 8
};

export const metrics = {
  primary: 'analogyCompletionAccuracy',
  secondary: ['crossDomainTransfer', 'transformConsistency']
};
