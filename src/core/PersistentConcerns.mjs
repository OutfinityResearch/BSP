/**
 * PersistentConcerns - Cross-session memory of hard problems
 * 
 * Part of the unified learning architecture (DS-024):
 * - Problems that recur across sessions are promoted to persistent concerns
 * - They get priority boosts in future sessions
 * - Enables long-term learning of difficult patterns
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * @typedef {object} AttemptRecord
 * @property {number} timestamp
 * @property {number} [transformId] - Transform ID tried
 * @property {number} improvement - Bits saved (negative if worse)
 */

/**
 * @typedef {object} PersistentConcern
 * @property {number[]} signatureBits - Common pattern in failed compressions
 * @property {string} signatureHash - Hash string for lookup
 * @property {number} occurrences - Total times seen
 * @property {number} firstSeen - Timestamp
 * @property {number} lastSeen - Timestamp
 * @property {number} sessions - How many sessions it appeared in
 * @property {number} persistenceBonus - Priority multiplier (grows with sessions)
 * @property {AttemptRecord[]} attempts - Previous solution attempts
 * @property {AttemptRecord} [bestAttempt] - Best partial solution so far
 */

class PersistentConcerns {
  /**
   * @param {object} options
   * @param {string} [options.storagePath] - Path to persistence file
   * @param {number} [options.minRecurrence=3] - Threshold for persistence
   * @param {number} [options.minSessions=2] - Minimum sessions before persisting
   * @param {number} [options.persistenceBonusGrowth=1.1] - Bonus growth per session
   * @param {number} [options.maxConcerns=1000] - Maximum persistent concerns
   */
  constructor(options = {}) {
    this.storagePath = options.storagePath || null;
    this.minRecurrence = options.minRecurrence ?? 3;
    this.minSessions = options.minSessions ?? 2;
    this.persistenceBonusGrowth = options.persistenceBonusGrowth ?? 1.1;
    this.maxConcerns = options.maxConcerns ?? 1000;
    
    /** @type {Map<string, PersistentConcern>} hash -> concern */
    this.concerns = new Map();
    
    // Session tracking
    this.currentSession = Date.now();
    this.sessionCount = 0;
    
    // Statistics
    this.stats = {
      totalPromoted: 0,
      totalResolved: 0,
      totalPruned: 0,
    };
  }

  /**
   * Find existing concern matching a signature
   * @param {import('./Bitset.mjs').SimpleBitset} signature
   * @returns {PersistentConcern | undefined}
   */
  find(signature) {
    const hash = signature.hash64().toString();
    return this.concerns.get(hash);
  }

  /**
   * Find by hash string directly
   * @param {string} hashStr
   * @returns {PersistentConcern | undefined}
   */
  findByHash(hashStr) {
    return this.concerns.get(hashStr);
  }

  /**
   * Add or update a concern from an attention item
   * @param {object} problem - AttentionItem
   * @param {import('./Bitset.mjs').SimpleBitset} [signature] - Optional pre-computed signature
   */
  addOrUpdate(problem, signature = null) {
    const hashStr = problem.inputHash.toString();
    const existing = this.concerns.get(hashStr);
    
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = Date.now();
      // Don't increment sessions here - that happens at session end
    } else {
      const concern = {
        signatureBits: problem.inputBits,
        signatureHash: hashStr,
        occurrences: problem.recurrence || 1,
        firstSeen: problem.timestamp || Date.now(),
        lastSeen: Date.now(),
        sessions: 1,
        persistenceBonus: 1.0,
        attempts: [],
        bestAttempt: null,
      };
      this.concerns.set(hashStr, concern);
      this.stats.totalPromoted++;
    }
    
    // Evict if over capacity
    if (this.concerns.size > this.maxConcerns) {
      this._evictLowestPriority();
    }
  }

  /**
   * Record a solution attempt
   * @param {PersistentConcern} concern
   * @param {number} [transformId]
   * @param {number} improvement
   */
  recordAttempt(concern, transformId, improvement) {
    const attempt = {
      timestamp: Date.now(),
      transformId,
      improvement,
    };
    
    concern.attempts.push(attempt);
    
    // Update best attempt
    if (!concern.bestAttempt || improvement > concern.bestAttempt.improvement) {
      concern.bestAttempt = attempt;
    }
    
    // Check if resolved (significant improvement)
    if (improvement > 0.5 * concern.signatureBits.length) {
      this.markResolved(concern);
    }
  }

  /**
   * Mark a concern as resolved (remove from persistent storage)
   * @param {PersistentConcern} concern
   */
  markResolved(concern) {
    this.concerns.delete(concern.signatureHash);
    this.stats.totalResolved++;
  }

  /**
   * Called at session start - boost priorities of existing concerns
   */
  onSessionStart() {
    this.currentSession = Date.now();
    this.sessionCount++;
    
    for (const concern of this.concerns.values()) {
      concern.persistenceBonus *= this.persistenceBonusGrowth;
    }
  }

  /**
   * Called at session end - promote recurring attention items
   * @param {import('./AttentionBuffer.mjs').AttentionBuffer} attentionBuffer
   */
  onSessionEnd(attentionBuffer) {
    const unresolved = attentionBuffer.getUnresolved();
    
    for (const problem of unresolved) {
      // Check if this problem should be promoted
      if (problem.recurrence >= this.minRecurrence) {
        const hashStr = problem.inputHash.toString();
        const existing = this.concerns.get(hashStr);
        
        if (existing) {
          existing.sessions++;
          existing.lastSeen = Date.now();
        } else {
          this.addOrUpdate(problem);
        }
      }
    }
    
    // Increment session count for all concerns that appeared this session
    // (already handled in addOrUpdate)
  }

  /**
   * Get concerns sorted by priority (for sleep processing)
   * @param {number} n
   * @returns {PersistentConcern[]}
   */
  getTopConcerns(n) {
    return [...this.concerns.values()]
      .sort((a, b) => {
        const priorityA = a.occurrences * a.sessions * a.persistenceBonus;
        const priorityB = b.occurrences * b.sessions * b.persistenceBonus;
        return priorityB - priorityA;
      })
      .slice(0, n);
  }

  /**
   * Evict lowest priority concern
   * @private
   */
  _evictLowestPriority() {
    let lowestPriority = Infinity;
    let lowestKey = null;
    
    for (const [key, concern] of this.concerns) {
      const priority = concern.occurrences * concern.sessions * concern.persistenceBonus;
      if (priority < lowestPriority) {
        lowestPriority = priority;
        lowestKey = key;
      }
    }
    
    if (lowestKey) {
      this.concerns.delete(lowestKey);
      this.stats.totalPruned++;
    }
  }

  /**
   * Prune old, inactive concerns
   * @param {number} maxAgeDays - Maximum age in days
   */
  prune(maxAgeDays = 30) {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let pruned = 0;
    
    for (const [key, concern] of this.concerns) {
      const age = now - concern.lastSeen;
      if (age > maxAgeMs && concern.sessions < this.minSessions) {
        this.concerns.delete(key);
        pruned++;
      }
    }
    
    this.stats.totalPruned += pruned;
    return pruned;
  }

  /**
   * Get count
   */
  get size() {
    return this.concerns.size;
  }

  /**
   * Load from disk
   */
  load() {
    if (!this.storagePath || !existsSync(this.storagePath)) {
      return [];
    }
    
    try {
      const data = readFileSync(this.storagePath, 'utf8');
      const json = JSON.parse(data);
      
      this.sessionCount = json.sessionCount || 0;
      this.stats = json.stats || this.stats;
      
      for (const concern of json.concerns) {
        this.concerns.set(concern.signatureHash, concern);
      }
      
      return [...this.concerns.values()];
    } catch (err) {
      console.warn('PersistentConcerns: Failed to load:', err.message);
      return [];
    }
  }

  /**
   * Save to disk
   */
  save() {
    if (!this.storagePath) {
      return;
    }
    
    try {
      const json = {
        version: '1.0',
        timestamp: Date.now(),
        sessionCount: this.sessionCount,
        stats: this.stats,
        concerns: [...this.concerns.values()],
      };
      
      writeFileSync(this.storagePath, JSON.stringify(json, null, 2));
    } catch (err) {
      console.warn('PersistentConcerns: Failed to save:', err.message);
    }
  }

  /**
   * Serialize to JSON (for embedding in larger state)
   * @returns {object}
   */
  toJSON() {
    return {
      minRecurrence: this.minRecurrence,
      minSessions: this.minSessions,
      persistenceBonusGrowth: this.persistenceBonusGrowth,
      maxConcerns: this.maxConcerns,
      sessionCount: this.sessionCount,
      stats: this.stats,
      concerns: [...this.concerns.values()],
    };
  }

  /**
   * Deserialize from JSON
   * @param {object} json
   * @param {object} [options]
   * @returns {PersistentConcerns}
   */
  static fromJSON(json, options = {}) {
    const pc = new PersistentConcerns({
      ...options,
      minRecurrence: json.minRecurrence,
      minSessions: json.minSessions,
      persistenceBonusGrowth: json.persistenceBonusGrowth,
      maxConcerns: json.maxConcerns,
    });
    
    pc.sessionCount = json.sessionCount || 0;
    pc.stats = json.stats || pc.stats;
    
    for (const concern of json.concerns || []) {
      pc.concerns.set(concern.signatureHash, concern);
    }
    
    return pc;
  }
}

export { PersistentConcerns };
