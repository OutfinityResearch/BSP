/**
 * DeductionGraph - Manages temporal/causal links between groups
 * Enables prediction and multi-hop reasoning
 */

class DeductionGraph {
  /**
   * @param {object} options
   * @param {number} [options.threshold=1.0] - Weight threshold for strong links
   * @param {number} [options.decayFactor=0.999] - Decay per step
   * @param {number} [options.maxEdgesPerNode=100] - Max outgoing edges per group
   */
  constructor(options = {}) {
    this.threshold = options.threshold || 1.0;
    this.decayFactor = options.decayFactor || 0.999;
    this.maxEdgesPerNode = options.maxEdgesPerNode || 100;
    
    // Forward links: source -> Map<target, weight>
    /** @type {Map<number, Map<number, number>>} */
    this.forward = new Map();
    
    // Backward links: target -> Map<source, weight>
    /** @type {Map<number, Map<number, number>>} */
    this.backward = new Map();
    
    // Statistics
    this.stats = {
      edgeCount: 0,
      strengthenOps: 0,
      weakenOps: 0,
    };
  }

  /**
   * Strengthen a deduction link
   * @param {number} from - Source group ID
   * @param {number} to - Target group ID
   * @param {number} delta - Amount to add
   */
  strengthen(from, to, delta) {
    if (from === to) return; // No self-loops
    
    // Get or create forward map
    if (!this.forward.has(from)) {
      this.forward.set(from, new Map());
    }
    const fwdMap = this.forward.get(from);
    
    // Update weight
    const currentWeight = fwdMap.get(to) || 0;
    const newWeight = currentWeight + delta;
    fwdMap.set(to, newWeight);
    
    // Limit edges per node
    if (fwdMap.size > this.maxEdgesPerNode) {
      this._pruneWeakest(fwdMap);
    }
    
    // Update backward
    if (!this.backward.has(to)) {
      this.backward.set(to, new Map());
    }
    this.backward.get(to).set(from, newWeight);
    
    // Track if new edge
    if (currentWeight === 0) {
      this.stats.edgeCount++;
    }
    
    this.stats.strengthenOps++;
  }

  /**
   * Weaken a deduction link
   * @param {number} from
   * @param {number} to
   * @param {number} delta
   */
  weaken(from, to, delta) {
    const fwdMap = this.forward.get(from);
    if (!fwdMap) return;
    
    const currentWeight = fwdMap.get(to);
    if (currentWeight === undefined) return;
    
    const newWeight = Math.max(0, currentWeight - delta);
    
    if (newWeight <= 0) {
      fwdMap.delete(to);
      this.backward.get(to)?.delete(from);
      this.stats.edgeCount--;
    } else {
      fwdMap.set(to, newWeight);
      this.backward.get(to)?.set(from, newWeight);
    }
    
    this.stats.weakenOps++;
  }

  /**
   * Get direct deductions from a group
   * @param {number} groupId
   * @returns {Map<number, number>} Map of target -> weight
   */
  getDeductions(groupId) {
    return this.forward.get(groupId) || new Map();
  }

  /**
   * Get groups that point to this group
   * @param {number} groupId
   * @returns {Map<number, number>}
   */
  getBackward(groupId) {
    return this.backward.get(groupId) || new Map();
  }

  /**
   * Get strong deductions (above threshold)
   * @param {number} groupId
   * @returns {number[]} Array of target group IDs
   */
  getStrongDeductions(groupId) {
    const deductions = this.forward.get(groupId);
    if (!deductions) return [];
    
    const strong = [];
    for (const [target, weight] of deductions) {
      if (weight >= this.threshold) {
        strong.push(target);
      }
    }
    return strong;
  }

  /**
   * Predict next groups using multi-hop BFS
   * @param {number[]} startGroups - Currently active groups
   * @param {object} options
   * @returns {Map<number, number>} Map of groupId -> score
   */
  predictMultiHop(startGroups, options = {}) {
    const {
      maxDepth = 3,
      beamWidth = 128,
      depthDecay = 0.7,
    } = options;
    
    const scores = new Map();
    const startSet = new Set(startGroups);
    
    // Initialize with start groups
    let frontier = new Set(startGroups);
    
    for (let depth = 1; depth <= maxDepth; depth++) {
      const decay = Math.pow(depthDecay, depth);
      const nextFrontier = new Map(); // target -> accumulated score
      
      for (const sourceId of frontier) {
        const deductions = this.forward.get(sourceId);
        if (!deductions) continue;
        
        for (const [targetId, weight] of deductions) {
          // Skip if in start set
          if (startSet.has(targetId)) continue;
          
          const propagatedScore = weight * decay;
          const existing = nextFrontier.get(targetId) || 0;
          nextFrontier.set(targetId, existing + propagatedScore);
        }
      }
      
      // Beam: keep top-M
      const sorted = [...nextFrontier.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, beamWidth);
      
      frontier = new Set();
      for (const [id, score] of sorted) {
        frontier.add(id);
        const existing = scores.get(id) || 0;
        scores.set(id, existing + score);
      }
      
      if (frontier.size === 0) break;
    }
    
    return scores;
  }

  /**
   * Simple direct prediction
   * @param {number[]} activeGroups
   * @returns {Map<number, number>}
   */
  predictDirect(activeGroups) {
    const predictions = new Map();
    
    for (const groupId of activeGroups) {
      const deductions = this.forward.get(groupId);
      if (!deductions) continue;
      
      for (const [target, weight] of deductions) {
        const current = predictions.get(target) || 0;
        predictions.set(target, Math.max(current, weight));
      }
    }
    
    return predictions;
  }

  /**
   * Extract reasoning chain between start and target groups
   * @param {number[]} startGroups
   * @param {number[]} targetGroups
   * @param {number} [maxDepth=3]
   * @returns {object[]} Array of chains
   */
  extractChains(startGroups, targetGroups, maxDepth = 3) {
    const targetSet = new Set(targetGroups);
    const chains = [];
    
    const dfs = (current, depth, path, score) => {
      if (depth > maxDepth) return;
      
      if (targetSet.has(current) && path.length > 0) {
        chains.push({
          steps: [...path],
          totalScore: score,
        });
        return;
      }
      
      const deductions = this.forward.get(current);
      if (!deductions) return;
      
      for (const [next, weight] of deductions) {
        // Avoid cycles
        if (path.some(s => s.to === next)) continue;
        
        const newScore = score * weight * 0.7;
        if (newScore < 0.01) continue; // Prune low-score paths
        
        path.push({ from: current, to: next, weight });
        dfs(next, depth + 1, path, newScore);
        path.pop();
      }
    };
    
    for (const start of startGroups) {
      dfs(start, 0, [], 1.0);
    }
    
    return chains.sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Apply decay to all edges
   */
  applyDecay() {
    for (const [from, targets] of this.forward) {
      for (const [to, weight] of targets) {
        const newWeight = weight * this.decayFactor;
        if (newWeight < 0.01) {
          targets.delete(to);
          this.backward.get(to)?.delete(from);
          this.stats.edgeCount--;
        } else {
          targets.set(to, newWeight);
          this.backward.get(to)?.set(from, newWeight);
        }
      }
      
      // Clean up empty maps
      if (targets.size === 0) {
        this.forward.delete(from);
      }
    }
  }

  /**
   * Prune weakest edges from a map
   * @private
   */
  _pruneWeakest(edgeMap) {
    const sorted = [...edgeMap.entries()]
      .sort((a, b) => a[1] - b[1]);
    
    const toRemove = sorted.slice(0, Math.floor(sorted.length * 0.2));
    for (const [target] of toRemove) {
      edgeMap.delete(target);
    }
  }

  /**
   * Remove all edges for a group
   * @param {number} groupId
   */
  removeGroup(groupId) {
    // Remove forward edges
    const forward = this.forward.get(groupId);
    if (forward) {
      for (const [target] of forward) {
        this.backward.get(target)?.delete(groupId);
      }
      this.stats.edgeCount -= forward.size;
      this.forward.delete(groupId);
    }
    
    // Remove backward edges
    const backward = this.backward.get(groupId);
    if (backward) {
      for (const [source] of backward) {
        this.forward.get(source)?.delete(groupId);
      }
      this.stats.edgeCount -= backward.size;
      this.backward.delete(groupId);
    }
  }

  /**
   * Get edge count
   * @returns {number}
   */
  get edgeCount() {
    return this.stats.edgeCount;
  }

  /**
   * Serialize graph
   * @returns {object}
   */
  toJSON() {
    const edges = [];
    for (const [from, targets] of this.forward) {
      for (const [to, weight] of targets) {
        edges.push({ from, to, weight });
      }
    }
    
    return {
      threshold: this.threshold,
      decayFactor: this.decayFactor,
      maxEdgesPerNode: this.maxEdgesPerNode,
      edges,
      stats: this.stats,
    };
  }

  /**
   * Deserialize graph
   * @param {object} json
   * @returns {DeductionGraph}
   */
  static fromJSON(json) {
    const graph = new DeductionGraph({
      threshold: json.threshold,
      decayFactor: json.decayFactor,
      maxEdgesPerNode: json.maxEdgesPerNode,
    });
    
    for (const { from, to, weight } of json.edges) {
      if (!graph.forward.has(from)) {
        graph.forward.set(from, new Map());
      }
      graph.forward.get(from).set(to, weight);
      
      if (!graph.backward.has(to)) {
        graph.backward.set(to, new Map());
      }
      graph.backward.get(to).set(from, weight);
    }
    
    graph.stats = json.stats || graph.stats;
    graph.stats.edgeCount = json.edges.length;
    
    return graph;
  }
}

module.exports = { DeductionGraph };
