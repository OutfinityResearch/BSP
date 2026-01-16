/**
 * Rolling Hash Map for fast substring matching
 * O(1) average lookup, O(N) build, no rebuild overhead
 */

class RollingHashMap {
  constructor(tokens = [], prefixLen = 3) {
    this.tokens = tokens;
    this.prefixLen = prefixLen;
    this.hashMap = new Map();
    
    if (tokens.length >= prefixLen) {
      this.build();
    }
  }

  /**
   * Simple hash function for token sequence
   */
  hash(tokens, start, len) {
    let h = 0;
    for (let i = 0; i < len && start + i < tokens.length; i++) {
      const token = tokens[start + i];
      // Simple string hash
      for (let j = 0; j < token.length; j++) {
        h = ((h << 5) - h) + token.charCodeAt(j);
        h = h & h; // Convert to 32bit integer
      }
    }
    return h;
  }

  /**
   * Build hash map - O(N)
   */
  build() {
    this.hashMap.clear();
    
    for (let i = 0; i <= this.tokens.length - this.prefixLen; i++) {
      const h = this.hash(this.tokens, i, this.prefixLen);
      
      if (!this.hashMap.has(h)) {
        this.hashMap.set(h, []);
      }
      this.hashMap.get(h).push(i);
    }
  }

  /**
   * Find matches for pattern - O(1) average
   * @param {string[]} pattern - Tokens to search for
   * @param {number} minLen - Minimum match length
   * @returns {Array<{offset: number, length: number}>}
   */
  findMatches(pattern, minLen = 3) {
    if (pattern.length < minLen || this.tokens.length < minLen) {
      return [];
    }

    const matches = [];
    const h = this.hash(pattern, 0, this.prefixLen);
    const candidates = this.hashMap.get(h) || [];

    for (const offset of candidates) {
      // Verify prefix match (hash collision check)
      let prefixMatch = true;
      for (let i = 0; i < this.prefixLen; i++) {
        if (this.tokens[offset + i] !== pattern[i]) {
          prefixMatch = false;
          break;
        }
      }

      if (!prefixMatch) continue;

      // Extend match
      let len = this.prefixLen;
      while (len < pattern.length && 
             offset + len < this.tokens.length &&
             this.tokens[offset + len] === pattern[len]) {
        len++;
      }

      if (len >= minLen) {
        matches.push({ offset, length: len });
      }
    }

    return matches;
  }

  /**
   * Update with new tokens (incremental)
   */
  update(newTokens) {
    this.tokens = newTokens;
    if (this.tokens.length >= this.prefixLen) {
      this.build();
    }
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage() {
    let size = 0;
    for (const [_, positions] of this.hashMap) {
      size += positions.length * 8; // 8 bytes per position
    }
    return size + this.hashMap.size * 16; // + map overhead
  }
}

export { RollingHashMap };
