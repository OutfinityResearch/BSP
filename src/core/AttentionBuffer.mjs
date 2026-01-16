/**
 * AttentionBuffer - Priority queue of unresolved compression problems
 * 
 * Part of the unified learning architecture (DS-024):
 * - High surprise inputs get priority for sleep processing
 * - Recurrence detection boosts problem priority
 * - Problems that persist across sessions get additional priority boosts
 */

/**
 * @typedef {object} AttentionItem
 * @property {number[]} inputBits - Sparse representation of input
 * @property {number} inputHash - 64-bit hash for similarity detection
 * @property {number} surprise - Number of unexplained bits
 * @property {number} inputSize - Total input size for ratio calculation
 * @property {number[]} [context] - Group IDs from context
 * @property {number} timestamp - When added
 * @property {number} recurrence - How many similar items seen
 * @property {number} priority - Computed priority for queue ordering
 * @property {boolean} resolved - Whether this problem was solved
 */

class AttentionBuffer {
  /**
   * @param {object} options
   * @param {number} [options.maxItems=10000] - Maximum capacity
   * @param {number} [options.surpriseWeight=1.0] - Weight for surprise in priority
   * @param {number} [options.recurrenceWeight=2.0] - Weight for recurrence in priority
   * @param {number} [options.recencyDecay=0.99] - Decay factor for recency
   * @param {number} [options.similarityThreshold=0.8] - Jaccard threshold for "similar" items
   */
  constructor(options = {}) {
    this.maxItems = options.maxItems || 10000;
    this.surpriseWeight = options.surpriseWeight ?? 1.0;
    this.recurrenceWeight = options.recurrenceWeight ?? 2.0;
    this.recencyDecay = options.recencyDecay ?? 0.99;
    this.similarityThreshold = options.similarityThreshold ?? 0.8;
    
    /** @type {AttentionItem[]} */
    this.items = [];
    
    // Hash index for fast similarity/recurrence detection
    /** @type {Map<bigint, number[]>} hash -> indices of similar items */
    this.hashIndex = new Map();
    
    // Statistics
    this.stats = {
      totalAdded: 0,
      totalResolved: 0,
      totalEvicted: 0,
    };
  }

  /**
   * Add a problem to the buffer
   * @param {import('./Bitset.mjs').SimpleBitset} input - The problematic input
   * @param {number} surprise - Number of unexplained bits
   * @param {number[]} [context] - Group IDs from context
   */
  add(input, surprise, context = null) {
    const inputBits = input.toArray();
    const inputHash = input.hash64();
    const inputSize = input.size;
    
    // Check for recurrence (similar items already in buffer)
    const recurrence = this._countSimilar(inputHash, inputBits);
    
    const item = {
      inputBits,
      inputHash,
      surprise,
      inputSize,
      context: context ? [...context] : null,
      timestamp: Date.now(),
      recurrence,
      priority: this._computePriority(surprise, inputSize, recurrence, 1.0),
      resolved: false,
    };
    
    // Add to buffer
    this.items.push(item);
    this._addToHashIndex(inputHash, this.items.length - 1);
    this.stats.totalAdded++;
    
    // Update recurrence counts for similar items
    this._updateRecurrence(inputHash);
    
    // Evict if over capacity
    if (this.items.length > this.maxItems) {
      this._evictLowestPriority();
    }
    
    // Re-sort by priority (could be optimized with heap)
    this._sortByPriority();
  }

  /**
   * Get top N problems for sleep processing
   * @param {number} n
   * @returns {AttentionItem[]}
   */
  getTopProblems(n) {
    // Apply recency decay before returning
    this._applyRecencyDecay();
    this._sortByPriority();
    
    return this.items
      .filter(item => !item.resolved)
      .slice(0, n);
  }

  /**
   * Mark a problem as resolved
   * @param {AttentionItem} item
   */
  markResolved(item) {
    item.resolved = true;
    this.stats.totalResolved++;
  }

  /**
   * Get unresolved items (for session end persistence)
   * @returns {AttentionItem[]}
   */
  getUnresolved() {
    return this.items.filter(item => !item.resolved);
  }

  /**
   * Compute priority for an item
   * @private
   */
  _computePriority(surprise, inputSize, recurrence, recencyFactor) {
    const surpriseFactor = inputSize > 0 ? surprise / inputSize : 0;
    
    return this.surpriseWeight * surpriseFactor * 
           (1 + this.recurrenceWeight * recurrence) * 
           recencyFactor;
  }

  /**
   * Count similar items in buffer (for recurrence detection)
   * @private
   */
  _countSimilar(hash, bits) {
    const indices = this.hashIndex.get(hash);
    if (!indices) return 0;
    
    // Count items with same hash (approximate similarity)
    let count = 0;
    for (const idx of indices) {
      if (idx < this.items.length && !this.items[idx].resolved) {
        count++;
      }
    }
    return count;
  }

  /**
   * Update recurrence counts when new similar item added
   * @private
   */
  _updateRecurrence(hash) {
    const indices = this.hashIndex.get(hash);
    if (!indices) return;
    
    for (const idx of indices) {
      if (idx < this.items.length) {
        const item = this.items[idx];
        item.recurrence++;
        item.priority = this._computePriority(
          item.surprise,
          item.inputSize,
          item.recurrence,
          1.0 // Recency will be applied later
        );
      }
    }
  }

  /**
   * Add to hash index
   * @private
   */
  _addToHashIndex(hash, index) {
    if (!this.hashIndex.has(hash)) {
      this.hashIndex.set(hash, []);
    }
    this.hashIndex.get(hash).push(index);
  }

  /**
   * Apply recency decay to all items
   * @private
   */
  _applyRecencyDecay() {
    const now = Date.now();
    const decayInterval = 60000; // 1 minute
    
    for (const item of this.items) {
      if (item.resolved) continue;
      
      const age = now - item.timestamp;
      const decayPeriods = Math.floor(age / decayInterval);
      const recencyFactor = Math.pow(this.recencyDecay, decayPeriods);
      
      item.priority = this._computePriority(
        item.surprise,
        item.inputSize,
        item.recurrence,
        recencyFactor
      );
    }
  }

  /**
   * Sort items by priority (descending)
   * @private
   */
  _sortByPriority() {
    this.items.sort((a, b) => b.priority - a.priority);
    
    // Rebuild hash index after sort
    this.hashIndex.clear();
    for (let i = 0; i < this.items.length; i++) {
      this._addToHashIndex(this.items[i].inputHash, i);
    }
  }

  /**
   * Evict lowest priority item
   * @private
   */
  _evictLowestPriority() {
    if (this.items.length === 0) return;
    
    // Find minimum priority (already sorted, so it's at the end)
    const removed = this.items.pop();
    this.stats.totalEvicted++;
    
    // Clean up hash index
    const indices = this.hashIndex.get(removed.inputHash);
    if (indices) {
      const idx = indices.indexOf(this.items.length); // Was at this position
      if (idx !== -1) indices.splice(idx, 1);
      if (indices.length === 0) this.hashIndex.delete(removed.inputHash);
    }
  }

  /**
   * Clear resolved items
   */
  clearResolved() {
    const unresolved = this.items.filter(item => !item.resolved);
    this.items = unresolved;
    
    // Rebuild hash index
    this.hashIndex.clear();
    for (let i = 0; i < this.items.length; i++) {
      this._addToHashIndex(this.items[i].inputHash, i);
    }
  }

  /**
   * Get buffer size
   */
  get size() {
    return this.items.length;
  }

  /**
   * Get unresolved count
   */
  get unresolvedCount() {
    return this.items.filter(item => !item.resolved).length;
  }

  /**
   * Serialize to JSON
   * @returns {object}
   */
  toJSON() {
    return {
      maxItems: this.maxItems,
      surpriseWeight: this.surpriseWeight,
      recurrenceWeight: this.recurrenceWeight,
      recencyDecay: this.recencyDecay,
      similarityThreshold: this.similarityThreshold,
      items: this.items.map(item => ({
        inputBits: item.inputBits,
        inputHash: item.inputHash.toString(), // BigInt to string
        surprise: item.surprise,
        inputSize: item.inputSize,
        context: item.context,
        timestamp: item.timestamp,
        recurrence: item.recurrence,
        priority: item.priority,
        resolved: item.resolved,
      })),
      stats: this.stats,
    };
  }

  /**
   * Deserialize from JSON
   * @param {object} json
   * @returns {AttentionBuffer}
   */
  static fromJSON(json) {
    const buffer = new AttentionBuffer({
      maxItems: json.maxItems,
      surpriseWeight: json.surpriseWeight,
      recurrenceWeight: json.recurrenceWeight,
      recencyDecay: json.recencyDecay,
      similarityThreshold: json.similarityThreshold,
    });
    
    buffer.stats = json.stats || buffer.stats;
    
    for (const item of json.items) {
      buffer.items.push({
        inputBits: item.inputBits,
        inputHash: BigInt(item.inputHash),
        surprise: item.surprise,
        inputSize: item.inputSize,
        context: item.context,
        timestamp: item.timestamp,
        recurrence: item.recurrence,
        priority: item.priority,
        resolved: item.resolved,
      });
    }
    
    // Rebuild hash index
    for (let i = 0; i < buffer.items.length; i++) {
      buffer._addToHashIndex(buffer.items[i].inputHash, i);
    }
    
    return buffer;
  }
}

export { AttentionBuffer };
