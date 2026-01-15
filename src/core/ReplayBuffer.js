/**
 * ReplayBuffer - Prioritized experience replay for consolidation
 */

class ReplayBuffer {
  /**
   * @param {object} options
   * @param {number} [options.maxSize=50000] - Maximum episodes
   * @param {number} [options.priorityExponent=0.6] - Priority sampling exponent
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 50000;
    this.priorityExponent = options.priorityExponent || 0.6;
    
    /** @type {Episode[]} */
    this.buffer = [];
    
    /** @type {number[]} */
    this.priorities = [];
    
    this.totalPriority = 0;
  }

  /**
   * @typedef {object} Episode
   * @property {number} timestamp
   * @property {number[]} inputBits - Input bits as array
   * @property {number[]} activeGroupIds - Active group IDs
   * @property {number[]} [contextGroupIds] - Previous context
   * @property {number} surprise - Surprise size
   * @property {number} reward - Reward signal
   * @property {number} importance - Computed importance
   */

  /**
   * Add an episode
   * @param {Episode} episode
   */
  add(episode) {
    const priority = this._computePriority(episode);
    
    if (this.buffer.length >= this.maxSize) {
      // Remove lowest priority episode
      const minIdx = this._findMinPriorityIndex();
      this.totalPriority -= this.priorities[minIdx];
      
      this.buffer[minIdx] = episode;
      this.priorities[minIdx] = priority;
    } else {
      this.buffer.push(episode);
      this.priorities.push(priority);
    }
    
    this.totalPriority += priority;
  }

  /**
   * Sample episodes proportional to priority
   * @param {number} k - Number to sample
   * @returns {Episode[]}
   */
  sample(k) {
    if (this.buffer.length === 0) return [];
    
    const sampled = [];
    const sampledIndices = new Set();
    
    k = Math.min(k, this.buffer.length);
    
    while (sampled.length < k) {
      const idx = this._sampleIndex();
      if (!sampledIndices.has(idx)) {
        sampledIndices.add(idx);
        sampled.push(this.buffer[idx]);
      }
    }
    
    return sampled;
  }

  /**
   * Get recent episodes (for context)
   * @param {number} k
   * @returns {Episode[]}
   */
  getRecent(k) {
    return this.buffer.slice(-k);
  }

  /**
   * Get size
   * @returns {number}
   */
  get size() {
    return this.buffer.length;
  }

  /**
   * Clear buffer
   */
  clear() {
    this.buffer = [];
    this.priorities = [];
    this.totalPriority = 0;
  }

  /**
   * Compute priority for episode
   * @private
   */
  _computePriority(episode) {
    // Priority based on importance and surprise
    const base = episode.importance * (1 + episode.surprise / 10);
    const rewardBoost = 1 + Math.abs(episode.reward);
    return Math.pow(base * rewardBoost, this.priorityExponent);
  }

  /**
   * Sample an index based on priority distribution
   * @private
   */
  _sampleIndex() {
    const r = Math.random() * this.totalPriority;
    let cumulative = 0;
    
    for (let i = 0; i < this.priorities.length; i++) {
      cumulative += this.priorities[i];
      if (cumulative >= r) {
        return i;
      }
    }
    
    return this.priorities.length - 1;
  }

  /**
   * Find index of minimum priority
   * @private
   */
  _findMinPriorityIndex() {
    let minIdx = 0;
    let minPriority = this.priorities[0];
    
    for (let i = 1; i < this.priorities.length; i++) {
      if (this.priorities[i] < minPriority) {
        minPriority = this.priorities[i];
        minIdx = i;
      }
    }
    
    return minIdx;
  }

  /**
   * Get statistics
   * @returns {object}
   */
  getStats() {
    if (this.buffer.length === 0) {
      return {
        size: 0,
        avgPriority: 0,
        avgSurprise: 0,
        avgReward: 0,
      };
    }
    
    let totalSurprise = 0;
    let totalReward = 0;
    
    for (const ep of this.buffer) {
      totalSurprise += ep.surprise;
      totalReward += ep.reward;
    }
    
    return {
      size: this.buffer.length,
      avgPriority: this.totalPriority / this.buffer.length,
      avgSurprise: totalSurprise / this.buffer.length,
      avgReward: totalReward / this.buffer.length,
    };
  }

  /**
   * Serialize buffer
   * @returns {object}
   */
  toJSON() {
    return {
      maxSize: this.maxSize,
      priorityExponent: this.priorityExponent,
      episodes: this.buffer,
      priorities: this.priorities,
    };
  }

  /**
   * Deserialize buffer
   * @param {object} json
   * @returns {ReplayBuffer}
   */
  static fromJSON(json) {
    const buffer = new ReplayBuffer({
      maxSize: json.maxSize,
      priorityExponent: json.priorityExponent,
    });
    
    buffer.buffer = json.episodes || [];
    buffer.priorities = json.priorities || [];
    buffer.totalPriority = buffer.priorities.reduce((a, b) => a + b, 0);
    
    return buffer;
  }
}

module.exports = { ReplayBuffer };
