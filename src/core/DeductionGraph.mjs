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
   * Remove an edge while preserving forward/backward invariants.
   * Treat the forward map as the source of truth for edge count.
   * @param {number} from
   * @param {number} to
   * @returns {boolean} True if a forward edge existed and was removed.
   * @private
   */
  _removeEdge(from, to) {
    const fwdMap = this.forward.get(from);
    if (!fwdMap) {
      const backMap = this.backward.get(to);
      if (backMap) {
        backMap.delete(from);
        if (backMap.size === 0) this.backward.delete(to);
      }
      return false;
    }

    const hadForward = fwdMap.has(to);
    if (!hadForward) {
      const backMap = this.backward.get(to);
      if (backMap) {
        backMap.delete(from);
        if (backMap.size === 0) this.backward.delete(to);
      }
      return false;
    }

    fwdMap.delete(to);
    if (fwdMap.size === 0) this.forward.delete(from);

    const backMap = this.backward.get(to);
    if (backMap) {
      backMap.delete(from);
      if (backMap.size === 0) this.backward.delete(to);
    }

    this.stats.edgeCount--;
    return true;
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
    const hadEdge = fwdMap.has(to);
    const currentWeight = fwdMap.get(to) || 0;
    const newWeight = currentWeight + delta;
    fwdMap.set(to, newWeight);

    // Update backward
    if (!this.backward.has(to)) {
      this.backward.set(to, new Map());
    }
    this.backward.get(to).set(from, newWeight);
    
    // Track if new edge
    if (!hadEdge) {
      this.stats.edgeCount++;
    }

    // Limit edges per node
    if (fwdMap.size > this.maxEdgesPerNode) {
      this._pruneWeakest(from, fwdMap);
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
      this._removeEdge(from, to);
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
    for (const from of [...this.forward.keys()]) {
      const targets = this.forward.get(from);
      if (!targets) continue;
      for (const [to, weight] of targets) {
        const newWeight = weight * this.decayFactor;
        if (newWeight < 0.01) {
          this._removeEdge(from, to);
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
  _pruneWeakest(from, edgeMap) {
    const toRemoveCount = edgeMap.size - this.maxEdgesPerNode;
    if (toRemoveCount <= 0) return;

    const sorted = [...edgeMap.entries()]
      .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));

    for (const [target] of sorted.slice(0, toRemoveCount)) {
      this._removeEdge(from, target);
    }
  }

  /**
   * Merge two nodes, redirecting edges from source to target
   * @param {number} targetId
   * @param {number} sourceId
   */
  mergeNodes(targetId, sourceId) {
    if (targetId === sourceId) return;

    // 1. Move outgoing edges from source to target
    const sourceOutgoing = this.forward.get(sourceId);
    if (sourceOutgoing) {
      for (const [to, weight] of sourceOutgoing) {
        if (to !== targetId) { // Avoid self-loop
          this.strengthen(targetId, to, weight);
        }
      }
    }

    // 2. Move incoming edges pointing to source, to point to target
    const sourceIncoming = this.backward.get(sourceId);
    if (sourceIncoming) {
      for (const [from, weight] of sourceIncoming) {
        if (from !== targetId) { // Avoid self-loop
          this.strengthen(from, targetId, weight);
        }
      }
    }

    // 3. Remove source node
    this.removeGroup(sourceId);
  }

  /**
   * Remove all edges for a group
   * @param {number} groupId
   */
  removeGroup(groupId) {
    const outgoing = this.forward.get(groupId);
    if (outgoing) {
      for (const target of [...outgoing.keys()]) {
        this._removeEdge(groupId, target);
      }
    }

    const incoming = this.backward.get(groupId);
    if (incoming) {
      for (const source of [...incoming.keys()]) {
        this._removeEdge(source, groupId);
      }
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

export { DeductionGraph };
