/**
 * System IV: Hierarchy (Taxonomy)
 * 
 * Logic: Inheritance and Set Containment. If x is a Dog, x is an Animal.
 * Grammar: Tree structure with leaves emitting tokens
 * Real-World: Biological taxonomy, OOP, Organization charts
 * Task: Given instance I, predict Superclass S
 * Metric: Ancestry Recall
 */

import { difficultyToLevel, normalizeDifficulty } from '../difficulty.mjs';

export const SYSTEM_ID = '04_hierarchy';
export const SYSTEM_NAME = 'Hierarchy';
export const SYSTEM_DESCRIPTION = 'Inheritance and taxonomic containment';

export class HierarchyGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.difficultyLevel = Number.isInteger(config.difficultyLevel) ? config.difficultyLevel : null;
    this.depth = config.depth || 4;
    this.branchingFactor = config.branchingFactor || 3;
    
    this.nodes = new Map(); // id -> { parent, children, level }
    this.leaves = [];
    this._init();
  }

  _init() {
    let nodeId = 0;
    
    // Create root
    const root = `n${String(nodeId++).padStart(4, '0')}`;
    this.nodes.set(root, { parent: null, children: [], level: 0 });
    
    // BFS to build tree
    const queue = [root];
    
    while (queue.length > 0) {
      const current = queue.shift();
      const node = this.nodes.get(current);
      
      if (node.level >= this.depth - 1) {
        this.leaves.push(current);
        continue;
      }
      
      const numChildren = 2 + Math.floor(this.rng() * this.branchingFactor);
      
      for (let i = 0; i < numChildren; i++) {
        const childId = `n${String(nodeId++).padStart(4, '0')}`;
        this.nodes.set(childId, { 
          parent: current, 
          children: [], 
          level: node.level + 1 
        });
        node.children.push(childId);
        queue.push(childId);
      }
    }
  }

  getAncestors(nodeId) {
    const ancestors = [];
    let current = nodeId;
    
    while (current) {
      const node = this.nodes.get(current);
      if (!node || !node.parent) break;
      ancestors.push(node.parent);
      current = node.parent;
    }
    
    return ancestors;
  }

  getDescendants(nodeId) {
    const descendants = [];
    const queue = [nodeId];
    
    while (queue.length > 0) {
      const current = queue.shift();
      const node = this.nodes.get(current);
      if (!node) continue;
      
      for (const child of node.children) {
        descendants.push(child);
        queue.push(child);
      }
    }
    
    return descendants;
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      // Random leaf
      const leaf = this.leaves[Math.floor(this.rng() * this.leaves.length)];
      const ancestors = this.getAncestors(leaf);
      
      // Instance -> Class relationships
      lines.push(`${leaf} isa ${ancestors[0]}`);
      
      // Full path from leaf to root
      const path = [leaf, ...ancestors];
      lines.push(path.join(' '));
      
      // Sibling relationships
      const parent = ancestors[0];
      const parentNode = this.nodes.get(parent);
      if (parentNode && parentNode.children.length > 1) {
        const siblings = parentNode.children.filter(c => c !== leaf);
        if (siblings.length > 0) {
          const sibling = siblings[Math.floor(this.rng() * siblings.length)];
          lines.push(`${leaf} sibling ${sibling}`);
        }
      }
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const leaf = this.leaves[Math.floor(this.rng() * this.leaves.length)];
      const ancestors = this.getAncestors(leaf);
      
      // Test: given leaf, what is its immediate parent?
      const depth = ancestors.length;
      let difficulty = 1;
      if (depth >= 4) difficulty = 3;
      else if (depth >= 2) difficulty = 2;
      if (this.difficultyLevel !== null) difficulty = this.difficultyLevel;

      const expectedJson = JSON.stringify(ancestors[0]);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'hierarchy',
        ancestors
      });
      lines.push(`${leaf}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  getGroundTruth(instance) {
    return this.getAncestors(instance);
  }
}

export function createGrammar(config) {
  const difficulty = normalizeDifficulty(config?.difficulty);
  const preset =
    difficulty === 'easy'
      ? { depth: 3, branchingFactor: 2 }
      : difficulty === 'hard'
        ? { depth: 6, branchingFactor: 4 }
        : {};
  return new HierarchyGrammar({ ...config, ...preset, difficultyLevel: difficultyToLevel(difficulty) });
}

export const defaultConfig = {
  depth: 4,
  branchingFactor: 3
};

export const metrics = {
  primary: 'ancestryRecall',
  secondary: ['immediateParentAccuracy', 'siblingRecognition']
};
