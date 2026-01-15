/**
 * Learner - Implements learning algorithms for BSP
 * Handles activation, surprise computation, and updates
 */

import { SimpleBitset } from './Bitset.mjs';

class Learner {
  /**
   * @param {object} options
   * @param {number} [options.topK=16] - Max active groups
   * @param {number} [options.activationThreshold=0.1] - Min score for activation (lowered)
   * @param {number} [options.membershipThreshold=2] - Count threshold for membership (lowered)
   * @param {number} [options.alpha=0.2] - Learning rate (increased)
   * @param {number} [options.alphaDecay=0.05] - Decay rate for hallucination
   * @param {number} [options.alphaDeduction=0.2] - Learning rate for deductions (increased)
   * @param {number} [options.newGroupThreshold=0.3] - Surprise threshold for new group (lowered)
   * @param {number} [options.mergeThreshold=0.7] - Jaccard threshold for merge (lowered)
   * @param {number} [options.sizePenalty=0.005] - Penalty for large groups (reduced)
   * @param {number} [options.minGroupSize=2] - Minimum bits for a group
   */
  constructor(options = {}) {
    this.topK = options.topK || 16;
    this.activationThreshold = options.activationThreshold || 0.05; // Lowered from 0.2
    this.membershipThreshold = options.membershipThreshold || 2;   // Lowered from 3
    this.alpha = options.alpha || 0.2;                             // Increased from 0.1
    this.alphaDecay = options.alphaDecay || 0.05;
    this.alphaDeduction = options.alphaDeduction || 0.15;
    this.newGroupThreshold = options.newGroupThreshold || 0.2;     // Lowered from 0.5
    this.mergeThreshold = options.mergeThreshold || 0.8;
    this.sizePenalty = options.sizePenalty || 0.01;
    
    // Pattern tracker for group creation
    this.recentPatterns = new Map(); // hash -> { bits, count, lastSeen }
    this.patternMaxAge = 10000; // ms
    this.minOccurrences = 2; // Lowered from 3

    // Co-occurrence tracking
    this.ngramFrequencies = new Map();
    this.cooccurrenceMatrix = new Map();
    this.totalInputs = 0;
    this.minGroupSize = options.minGroupSize || 2;
  }

  /**
   * Compute score for a group given input
   * @param {object} group
   * @param {SimpleBitset} input
   * @returns {number}
   */
  computeScore(group, input) {
    const intersection = group.members.andCardinality(input);
    const groupSize = group.members.size;
    const inputSize = input.size;
    
    if (groupSize === 0 || inputSize === 0) return 0;
    
    // Coverage: how much of group is present in input
    const groupCoverage = intersection / groupSize;
    
    // Input coverage: how much of input is explained by group
    const inputCoverage = intersection / inputSize;
    
    // Combined score: balance both directions
    const coverage = (groupCoverage + inputCoverage) / 2;
    
    // Size penalty (reduced for better matching on small inputs)
    const penalty = this.sizePenalty * Math.log(groupSize + 1) * 0.5;
    
    // Salience boost
    const salienceBoost = 0.1 * group.salience;
    
    // Bonus for having any intersection
    const matchBonus = intersection > 0 ? 0.05 : 0;
    
    return coverage - penalty + salienceBoost + matchBonus;
  }

  /**
   * Activate groups for an input
   * @param {SimpleBitset} input
   * @param {import('./GroupStore').GroupStore} store
   * @returns {object[]} Active groups
   */
  activate(input, store) {
    // Get candidates
    const candidateIds = store.getCandidates(input);
    const inputBits = input.toArray();
    
    // Score candidates
    const scored = [];
    for (const groupId of candidateIds) {
      const group = store.get(groupId);
      if (!group) continue;
      
      const score = this.computeScore(group, input);
      if (score >= this.activationThreshold) {
        scored.push({ group, score });
      }
    }
    
    // Sort by score
    scored.sort((a, b) => b.score - a.score);
    
    // Greedy selection to reduce redundancy
    const selected = [];
    const explained = new Set();
    
    for (const { group, score } of scored) {
      if (selected.length >= this.topK) break;
      
      // Check marginal value
      let marginalValue = 0;
      for (const bit of inputBits) {
        if (explained.has(bit)) continue;
        if (group.members.has(bit)) marginalValue++;
      }
      
      if (marginalValue >= 1) {
        selected.push(group);
        
        // Only mark input bits as explained (we only need overlap with input)
        for (const bit of inputBits) {
          if (group.members.has(bit)) explained.add(bit);
        }
        store.markUsed(group);
      }
    }
    
    return selected;
  }

  /**
   * Reconstruct input from active groups
   * @param {object[]} activeGroups
   * @param {number} maxSize
   * @returns {SimpleBitset}
   */
  reconstruct(activeGroups, maxSize = 100000) {
    const result = new SimpleBitset(maxSize);
    for (const group of activeGroups) {
      result.orInPlace(group.members);
    }
    return result;
  }

  /**
   * Compute surprise (unexplained bits) and hallucination
   * @param {SimpleBitset} input
   * @param {SimpleBitset} reconstruction
   * @returns {{ surprise: SimpleBitset, hallucination: SimpleBitset }}
   */
  computeSurprise(input, reconstruction) {
    return {
      surprise: input.andNot(reconstruction),
      hallucination: reconstruction.andNot(input),
    };
  }

  /**
   * Update group memberships based on input
   * @param {object[]} activeGroups
   * @param {SimpleBitset} input
   * @param {SimpleBitset} hallucination
   * @param {number} importance
   * @param {import('./GroupStore').GroupStore} store
   */
  updateMemberships(activeGroups, input, hallucination, importance, store) {
    const effectiveAlpha = this.alpha * importance;
    const effectiveDecay = this.alphaDecay * importance;
    
    for (const group of activeGroups) {
      // Strengthen input identities
      for (const identity of input) {
        const current = group.memberCounts.get(identity) || 0;
        const newCount = current + effectiveAlpha;
        group.memberCounts.set(identity, newCount);
        
        // Add to members if above threshold
        if (newCount >= this.membershipThreshold && !group.members.has(identity)) {
          group.members.add(identity);
          store._addToIndex(identity, group.id);
        }
      }
      
      // Weaken hallucinated identities
      for (const identity of hallucination) {
        if (group.members.has(identity)) {
          const current = group.memberCounts.get(identity) || 0;
          const newCount = Math.max(0, current - effectiveDecay);
          
          if (newCount < this.membershipThreshold) {
            store.removeMember(group, identity);
          } else {
            group.memberCounts.set(identity, newCount);
          }
        }
      }
    }
  }

  /**
   * Update deductions based on temporal transition
   * @param {number[]} previousGroupIds
   * @param {number[]} currentGroupIds
   * @param {number} importance
   * @param {import('./DeductionGraph').DeductionGraph} graph
   */
  updateDeductions(previousGroupIds, currentGroupIds, importance, graph) {
    const delta = this.alphaDeduction * importance;
    
    for (const prev of previousGroupIds) {
      for (const curr of currentGroupIds) {
        graph.strengthen(prev, curr, delta);
      }
    }
  }

  /**
   * Maybe create a new group from surprise pattern
   * Now much more aggressive - creates groups from frequent co-occurrences
   * @param {SimpleBitset} surprise
   * @param {SimpleBitset} input
   * @param {import('./GroupStore').GroupStore} store
   * @returns {object|null} New group or null
   */
  maybeCreateGroup(surprise, input, store) {
    this.totalInputs++;
    
    // Track all input bits for frequency analysis
    const inputBits = input.toArray();
    for (const bit of inputBits) {
      this.ngramFrequencies.set(bit, (this.ngramFrequencies.get(bit) || 0) + 1);
    }
    
    // Track co-occurrences (pairs of bits that appear together) - sample only
    const sampleSize = Math.min(8, inputBits.length);
    for (let i = 0; i < sampleSize; i++) {
      for (let j = i + 1; j < sampleSize; j++) {
        const key = inputBits[i] < inputBits[j] 
          ? `${inputBits[i]},${inputBits[j]}`
          : `${inputBits[j]},${inputBits[i]}`;
        this.cooccurrenceMatrix.set(key, (this.cooccurrenceMatrix.get(key) || 0) + 1);
      }
    }
    
    // Limit cooccurrence matrix size periodically
    if (this.totalInputs % 500 === 0 && this.cooccurrenceMatrix.size > 20000) {
      const entries = [...this.cooccurrenceMatrix.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10000);
      this.cooccurrenceMatrix = new Map(entries);
    }
    
    const surpriseRatio = surprise.size / Math.max(1, input.size);
    
    // Method 1: Create group directly from high-frequency co-occurrences
    if (this.totalInputs % 100 === 0 && this.totalInputs > 50) {
      const newGroup = this._createFromCooccurrence(store);
      if (newGroup) return newGroup;
    }
    
    // Method 2: Create from surprise if ratio is high enough
    if (surpriseRatio >= this.newGroupThreshold && surprise.size >= this.minGroupSize) {
      // Check if pattern is recurring (with similarity tolerance)
      const patternHash = this._hashPattern(surprise);
      const now = Date.now();
      
      let patternInfo = this.recentPatterns.get(patternHash);
      
      if (patternInfo) {
        // Merge patterns with intersection (common bits)
        const intersection = patternInfo.bits.and(surprise);
        if (intersection.size >= this.minGroupSize) {
          patternInfo.bits = intersection;
          patternInfo.count++;
          patternInfo.lastSeen = now;
        }
      } else {
        patternInfo = {
          bits: surprise.clone(),
          count: 1,
          lastSeen: now,
        };
        this.recentPatterns.set(patternHash, patternInfo);
      }
      
      // Clean old patterns periodically
      if (this.totalInputs % 50 === 0) {
        this._cleanPatterns(now);
      }
      
      // Create group if pattern is stable enough
      if (patternInfo.count >= this.minOccurrences && patternInfo.bits.size >= this.minGroupSize) {
        const newGroup = store.create(patternInfo.bits, 0.5);
        this.recentPatterns.delete(patternHash);
        return newGroup;
      }
    }
    
    // Method 3: Create from input directly if it's large and diverse enough
    if (surprise.size >= 5 && surpriseRatio > 0.7) {
      // Take the most frequent bits from the input
      const frequentBits = inputBits
        .filter(b => (this.ngramFrequencies.get(b) || 0) >= 2)
        .slice(0, 10);
      
      if (frequentBits.length >= this.minGroupSize) {
        const newBits = new SimpleBitset(input.maxSize);
        for (const bit of frequentBits) {
          newBits.add(bit);
        }
        return store.create(newBits, 0.4);
      }
    }
    
    return null;
  }
  
  /**
   * Create a group from high-frequency co-occurrences
   * @private
   */
  _createFromCooccurrence(store) {
    // Find pairs that occur frequently together
    const minCooccurrence = Math.max(3, Math.floor(this.totalInputs * 0.01));
    const frequentPairs = [];
    
    for (const [key, count] of this.cooccurrenceMatrix) {
      if (count >= minCooccurrence) {
        const [a, b] = key.split(',').map(Number);
        frequentPairs.push({ a, b, count });
      }
    }
    
    if (frequentPairs.length === 0) return null;
    
    // Sort by count and take top pairs
    frequentPairs.sort((x, y) => y.count - x.count);
    
    // Build a group from the top frequent pair and related bits
    const topPair = frequentPairs[0];
    const groupBits = new SimpleBitset(100000);
    groupBits.add(topPair.a);
    groupBits.add(topPair.b);
    
    // Add other bits that co-occur frequently with this pair
    for (const pair of frequentPairs.slice(1, 10)) {
      if (pair.a === topPair.a || pair.a === topPair.b ||
          pair.b === topPair.a || pair.b === topPair.b) {
        groupBits.add(pair.a);
        groupBits.add(pair.b);
      }
    }
    
    // Only create if we have enough bits and it's not a duplicate
    if (groupBits.size >= this.minGroupSize) {
      // Check if similar group already exists
      const candidates = store.getCandidates(groupBits);
      for (const candId of candidates) {
        const cand = store.get(candId);
        if (cand && cand.members.jaccard(groupBits) > 0.6) {
          // Too similar, skip
          return null;
        }
      }
      
      // Remove this pair from tracking to avoid recreating
      this.cooccurrenceMatrix.delete(`${topPair.a},${topPair.b}`);
      
      return store.create(groupBits, 0.6);
    }
    
    return null;
  }

  /**
   * Perform sleep consolidation (DS-010)
   * Merges similar groups efficiently using hierarchical clustering approximation
   * @param {import('./GroupStore').GroupStore} store
   * @param {import('./DeductionGraph').DeductionGraph} graph
   * @returns {number} Number of merges
   */
  performSleepConsolidation(store, graph) {
    const groups = [...store.getAll()];
    // Sort by size (merge smaller into larger) - descending
    groups.sort((a, b) => b.members.size - a.members.size);
    
    const visited = new Set();
    let merges = 0;
    
    for (const primary of groups) {
      if (visited.has(primary.id)) continue;
      if (!store.get(primary.id)) continue; // Already merged away
      
      // Find merge candidates using inverse index
      const candidates = store.getCandidates(primary.members);
      
      for (const candidateId of candidates) {
        if (candidateId === primary.id) continue;
        if (visited.has(candidateId)) continue;
        
        const candidate = store.get(candidateId);
        if (!candidate) continue;
        
        const jaccard = primary.members.jaccard(candidate.members);
        
        if (jaccard >= this.mergeThreshold) {
          // Merge candidate into primary
          this._mergeGroups(primary, candidate, store, graph);
          visited.add(candidate.id);
          merges++;
        }
      }
      
      visited.add(primary.id);
    }
    
    return merges;
  }

  _mergeGroups(target, source, store, graph) {
    // Merge graph edges first (redirect source edges to target)
    graph.mergeNodes(target.id, source.id);
    
    // Merge group content
    store.merge(target, source);
  }

  /**
   * Check and merge similar groups (legacy O(N^2) method)
   * @deprecated Use performSleepConsolidation instead
   * @param {import('./GroupStore').GroupStore} store
   * @returns {number} Number of merges
   */
  maybeMerge(store) {
    const groups = [...store.getAll()];
    let merges = 0;
    
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const g1 = groups[i];
        const g2 = groups[j];
        
        if (!store.get(g1.id) || !store.get(g2.id)) continue;
        
        const jaccard = g1.members.jaccard(g2.members);
        
        if (jaccard >= this.mergeThreshold) {
          store.merge(g1, g2);
          merges++;
        }
      }
    }
    
    return merges;
  }

  /**
   * Hash a pattern for tracking
   * @private
   */
  _hashPattern(bits) {
    // Simple hash based on first few set bits
    const arr = bits.toArray().slice(0, 10);
    let hash = 0;
    for (const b of arr) {
      hash = (hash * 31 + b) >>> 0;
    }
    return hash;
  }

  /**
   * Clean old patterns
   * @private
   */
  _cleanPatterns(now) {
    for (const [hash, info] of this.recentPatterns) {
      if (now - info.lastSeen > this.patternMaxAge) {
        this.recentPatterns.delete(hash);
      }
    }
  }

  /**
   * Compute importance for an interaction
   * @param {object} factors
   * @returns {number} 0.1 to 1.0
   */
  computeImportance(factors) {
    const {
      novelty = 0,      // |surprise| / |input|
      utility = 0,      // reward value
      stability = 0,    // recurrence
      explicitMark = false,
    } = factors;
    
    const weights = {
      novelty: 0.25,
      utility: 0.35,
      stability: 0.20,
      explicit: 0.20,
    };
    
    const raw =
      weights.novelty * Math.min(1, novelty) +
      weights.utility * Math.min(1, Math.abs(utility)) +
      weights.stability * Math.min(1, stability) +
      weights.explicit * (explicitMark ? 1 : 0);
    
    return Math.max(0.1, Math.min(1.0, raw + 0.1)); // Clamp to [0.1, 1.0]
  }

  /**
   * Serialize learner config
   * @returns {object}
   */
  toJSON() {
    return {
      topK: this.topK,
      activationThreshold: this.activationThreshold,
      membershipThreshold: this.membershipThreshold,
      alpha: this.alpha,
      alphaDecay: this.alphaDecay,
      alphaDeduction: this.alphaDeduction,
      newGroupThreshold: this.newGroupThreshold,
      mergeThreshold: this.mergeThreshold,
      sizePenalty: this.sizePenalty,
      minGroupSize: this.minGroupSize,
      totalInputs: this.totalInputs,
      // Save top frequency data for warm start
      topFrequencies: Array.from(this.ngramFrequencies.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1000),
    };
  }

  /**
   * Create from config
   * @param {object} json
   * @returns {Learner}
   */
  static fromJSON(json) {
    const learner = new Learner(json);
    learner.totalInputs = json.totalInputs || 0;
    if (json.topFrequencies) {
      for (const [bit, count] of json.topFrequencies) {
        learner.ngramFrequencies.set(bit, count);
      }
    }
    return learner;
  }
}

export { Learner };
