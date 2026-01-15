/**
 * System VIII: Analogy (Proportional Reasoning)
 * 
 * Logic: A:B :: C:D - Transform applied to one pair transfers to another
 * Grammar: transform(king, male->female) = queen
 * Real-World: Word embeddings, IQ tests, Metaphors
 * Task: Given A:B and C, predict D
 * Metric: Analogy Completion Accuracy
 */

export const SYSTEM_ID = '08_analogy';
export const SYSTEM_NAME = 'Analogy';
export const SYSTEM_DESCRIPTION = 'Proportional relational reasoning';

export class AnalogyGrammar {
  constructor(config = {}) {
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
      this.transforms.push(`T${String(t).padStart(2, '0')}`);
    }
    
    // Create domains with items that follow transforms
    let itemId = 0;
    
    for (let d = 0; d < this.numDomains; d++) {
      const domain = {
        name: `D${String(d).padStart(2, '0')}`,
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
    
    for (let i = 0; i < count; i++) {
      const domain = this.domains[Math.floor(Math.random() * this.domains.length)];
      const transform = this.transforms[Math.floor(Math.random() * this.transforms.length)];
      const item = domain.items[Math.floor(Math.random() * domain.items.length)];
      
      // Base -> Transformed relationship
      lines.push(`${item.base} ${transform} ${item.transformed[transform]}`);
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const domain = this.domains[Math.floor(Math.random() * this.domains.length)];
      const transform = this.transforms[Math.floor(Math.random() * this.transforms.length)];
      
      // Pick two different items from same domain
      const idx1 = Math.floor(Math.random() * domain.items.length);
      let idx2;
      do {
        idx2 = Math.floor(Math.random() * domain.items.length);
      } while (idx2 === idx1);
      
      const item1 = domain.items[idx1];
      const item2 = domain.items[idx2];
      
      // A:B :: C:?
      // item1.base : item1.transformed[T] :: item2.base : item2.transformed[T]
      const expected = item2.transformed[transform];
      lines.push(`${item1.base} : ${item1.transformed[transform]} :: ${item2.base} : ?\t${expected}`);
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
  return new AnalogyGrammar(config);
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
