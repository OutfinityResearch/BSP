/**
 * GroupStore - Manages groups (concepts) in BSP
 * Each group represents a cluster of co-occurring identities
 */

const { SimpleBitset } = require('./Bitset');

/**
 * @typedef {object} Group
 * @property {number} id - Unique identifier
 * @property {SimpleBitset} members - Identity bits in this group
 * @property {Map<number, number>} memberCounts - Count per identity
 * @property {number} salience - Importance score (0-1)
 * @property {number} age - Steps since creation
 * @property {number} usageCount - Total activations
 * @property {number} lastUsed - Timestamp of last activation
 * @property {number} created - Creation timestamp
 */

class GroupStore {
  /**
   * @param {object} options
   * @param {number} [options.maxGroups=10000] - Maximum groups allowed
   * @param {number} [options.universeSize=100000] - Size of identity space
   */
  constructor(options = {}) {
    this.maxGroups = options.maxGroups || 10000;
    this.universeSize = options.universeSize || 100000;
    
    /** @type {Map<number, Group>} */
    this.groups = new Map();
    this.nextId = 0;
    
    // Inverse index: identity -> set of group IDs
    /** @type {Map<number, Set<number>>} */
    this.belongsTo = new Map();
    
    // Statistics
    this.stats = {
      totalActivations: 0,
      totalCreations: 0,
      totalMerges: 0,
      totalPrunes: 0,
    };
  }

  /**
   * Create a new group
   * @param {SimpleBitset} initialMembers - Initial member bits
   * @param {number} [initialSalience=0.5] - Initial salience
   * @returns {Group}
   */
  create(initialMembers, initialSalience = 0.5) {
    if (this.groups.size >= this.maxGroups) {
      this._pruneLowestSalience();
    }

    const id = this.nextId++;
    const group = {
      id,
      members: initialMembers.clone(),
      memberCounts: new Map(),
      salience: initialSalience,
      age: 0,
      usageCount: 0,
      lastUsed: Date.now(),
      created: Date.now(),
    };

    // Initialize counts
    for (const bit of initialMembers) {
      group.memberCounts.set(bit, 1);
    }

    this.groups.set(id, group);
    this._updateIndex(group, 'add');
    this.stats.totalCreations++;

    return group;
  }

  /**
   * Get a group by ID
   * @param {number} id
   * @returns {Group|undefined}
   */
  get(id) {
    return this.groups.get(id);
  }

  /**
   * Delete a group
   * @param {number} id
   */
  delete(id) {
    const group = this.groups.get(id);
    if (group) {
      this._updateIndex(group, 'remove');
      this.groups.delete(id);
    }
  }

  /**
   * Get all groups
   * @returns {IterableIterator<Group>}
   */
  getAll() {
    return this.groups.values();
  }

  /**
   * Get group count
   * @returns {number}
   */
  get size() {
    return this.groups.size;
  }

  /**
   * Get candidate groups for an input bitset
   * @param {SimpleBitset} input
   * @returns {Set<number>} Set of group IDs
   */
  getCandidates(input) {
    const candidates = new Set();
    
    for (const identity of input) {
      const groups = this.belongsTo.get(identity);
      if (groups) {
        for (const groupId of groups) {
          candidates.add(groupId);
        }
      }
    }
    
    return candidates;
  }

  /**
   * Get top groups by salience
   * @param {number} k
   * @returns {Group[]}
   */
  getTopBySalience(k) {
    return [...this.groups.values()]
      .sort((a, b) => b.salience - a.salience)
      .slice(0, k);
  }

  /**
   * Mark a group as used
   * @param {Group} group
   */
  markUsed(group) {
    group.usageCount++;
    group.lastUsed = Date.now();
    this.stats.totalActivations++;
  }

  /**
   * Add identity to group
   * @param {Group} group
   * @param {number} identity
   * @param {number} [count=1]
   */
  addMember(group, identity, count = 1) {
    const current = group.memberCounts.get(identity) || 0;
    group.memberCounts.set(identity, current + count);
    
    if (!group.members.has(identity)) {
      group.members.add(identity);
      this._addToIndex(identity, group.id);
    }
  }

  /**
   * Remove identity from group
   * @param {Group} group
   * @param {number} identity
   */
  removeMember(group, identity) {
    group.memberCounts.delete(identity);
    if (group.members.has(identity)) {
      group.members.remove(identity);
      this._removeFromIndex(identity, group.id);
    }
  }

  /**
   * Update inverse index
   * @private
   */
  _updateIndex(group, action) {
    for (const identity of group.members) {
      if (action === 'add') {
        this._addToIndex(identity, group.id);
      } else {
        this._removeFromIndex(identity, group.id);
      }
    }
  }

  _addToIndex(identity, groupId) {
    if (!this.belongsTo.has(identity)) {
      this.belongsTo.set(identity, new Set());
    }
    this.belongsTo.get(identity).add(groupId);
  }

  _removeFromIndex(identity, groupId) {
    const groups = this.belongsTo.get(identity);
    if (groups) {
      groups.delete(groupId);
      if (groups.size === 0) {
        this.belongsTo.delete(identity);
      }
    }
  }

  /**
   * Prune groups with lowest salience when at capacity
   * @private
   */
  _pruneLowestSalience() {
    const sorted = [...this.groups.values()]
      .sort((a, b) => a.salience - b.salience);
    
    // Remove bottom 10%
    const toRemove = Math.max(1, Math.floor(sorted.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      this.delete(sorted[i].id);
      this.stats.totalPrunes++;
    }
  }

  /**
   * Apply decay to all groups
   * @param {number} decayAmount
   */
  applyDecay(decayAmount) {
    for (const group of this.groups.values()) {
      group.age++;
      
      // Decay member counts
      for (const [identity, count] of group.memberCounts) {
        const newCount = count - decayAmount;
        if (newCount <= 0) {
          this.removeMember(group, identity);
        } else {
          group.memberCounts.set(identity, newCount);
        }
      }
      
      // Decay salience for unused groups
      const unusedTime = Date.now() - group.lastUsed;
      if (unusedTime > 60000) { // 1 minute
        group.salience *= 0.999;
      }
    }
  }

  /**
   * Prune small or low-salience groups
   * @param {object} options
   * @returns {number} Number of pruned groups
   */
  prune(options = {}) {
    const {
      minSize = 2,
      minSalience = 0.01,
      maxUnusedTime = 3600000, // 1 hour
    } = options;

    let pruned = 0;
    const now = Date.now();

    for (const group of [...this.groups.values()]) {
      const shouldPrune =
        group.members.size < minSize ||
        (group.salience < minSalience && group.age > 100) ||
        (now - group.lastUsed > maxUnusedTime);

      if (shouldPrune) {
        this.delete(group.id);
        pruned++;
      }
    }

    this.stats.totalPrunes += pruned;
    return pruned;
  }

  /**
   * Merge two groups
   * @param {Group} g1
   * @param {Group} g2
   * @returns {Group} The merged group (keeps g1, deletes g2)
   */
  merge(g1, g2) {
    // Union members
    g1.members.orInPlace(g2.members);
    
    // Combine counts
    for (const [identity, count] of g2.memberCounts) {
      const current = g1.memberCounts.get(identity) || 0;
      g1.memberCounts.set(identity, current + count);
    }
    
    // Update salience
    g1.salience = Math.max(g1.salience, g2.salience);
    g1.usageCount += g2.usageCount;
    
    // Update index and delete g2
    this._updateIndex(g2, 'remove');
    this._updateIndex(g1, 'add');
    this.groups.delete(g2.id);
    
    this.stats.totalMerges++;
    return g1;
  }

  /**
   * Serialize store
   * @returns {object}
   */
  toJSON() {
    const groups = [];
    for (const group of this.groups.values()) {
      groups.push({
        id: group.id,
        members: group.members.toJSON(),
        memberCounts: [...group.memberCounts.entries()],
        salience: group.salience,
        age: group.age,
        usageCount: group.usageCount,
        lastUsed: group.lastUsed,
        created: group.created,
      });
    }
    
    return {
      maxGroups: this.maxGroups,
      universeSize: this.universeSize,
      nextId: this.nextId,
      groups,
      stats: this.stats,
    };
  }

  /**
   * Deserialize store
   * @param {object} json
   * @returns {GroupStore}
   */
  static fromJSON(json) {
    const store = new GroupStore({
      maxGroups: json.maxGroups,
      universeSize: json.universeSize,
    });
    
    store.nextId = json.nextId;
    store.stats = json.stats || store.stats;
    
    for (const g of json.groups) {
      const group = {
        id: g.id,
        members: SimpleBitset.fromJSON(g.members),
        memberCounts: new Map(g.memberCounts),
        salience: g.salience,
        age: g.age,
        usageCount: g.usageCount,
        lastUsed: g.lastUsed,
        created: g.created,
      };
      
      store.groups.set(group.id, group);
      store._updateIndex(group, 'add');
    }
    
    return store;
  }
}

module.exports = { GroupStore };
