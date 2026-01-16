/**
 * Suffix Array for fast substring matching
 * Used by CompressionMachine for O(log N) COPY operation lookup
 */

class SuffixArray {
  constructor(tokens = []) {
    this.tokens = tokens;
    this.suffixArray = [];
    this.lcp = []; // Longest Common Prefix array
    
    if (tokens.length > 0) {
      this.build();
    }
  }

  /**
   * Build suffix array - O(N log N)
   */
  build() {
    const n = this.tokens.length;
    
    // Create suffix array with indices
    this.suffixArray = Array.from({ length: n }, (_, i) => i);
    
    // Sort suffixes lexicographically
    this.suffixArray.sort((a, b) => {
      for (let i = 0; i < n - Math.max(a, b); i++) {
        if (this.tokens[a + i] !== this.tokens[b + i]) {
          return this.tokens[a + i] < this.tokens[b + i] ? -1 : 1;
        }
      }
      return a - b;
    });
    
    // Build LCP array for optimization
    this.buildLCP();
  }

  /**
   * Build Longest Common Prefix array
   */
  buildLCP() {
    const n = this.tokens.length;
    this.lcp = new Array(n).fill(0);
    
    const rank = new Array(n);
    for (let i = 0; i < n; i++) {
      rank[this.suffixArray[i]] = i;
    }
    
    let h = 0;
    for (let i = 0; i < n; i++) {
      if (rank[i] > 0) {
        const j = this.suffixArray[rank[i] - 1];
        while (i + h < n && j + h < n && this.tokens[i + h] === this.tokens[j + h]) {
          h++;
        }
        this.lcp[rank[i]] = h;
        if (h > 0) h--;
      }
    }
  }

  /**
   * Find longest match for pattern - O(log N + M)
   * @param {string[]} pattern - Tokens to search for (first few tokens)
   * @param {number} minLen - Minimum match length
   * @returns {Array<{offset: number, length: number}>} Matches
   */
  findMatches(pattern, minLen = 3) {
    if (pattern.length === 0 || this.tokens.length === 0) return [];
    
    const matches = [];
    const n = this.tokens.length;
    const searchLen = Math.min(pattern.length, minLen);
    
    // Search for prefix match
    const prefix = pattern.slice(0, searchLen);
    
    // Binary search for first occurrence of prefix
    let left = 0;
    let right = n - 1;
    let firstMatch = -1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const suffixIdx = this.suffixArray[mid];
      
      // Compare prefix with suffix
      let cmp = 0;
      for (let i = 0; i < prefix.length && suffixIdx + i < n; i++) {
        if (prefix[i] < this.tokens[suffixIdx + i]) {
          cmp = -1;
          break;
        } else if (prefix[i] > this.tokens[suffixIdx + i]) {
          cmp = 1;
          break;
        }
      }
      
      if (cmp === 0) {
        firstMatch = mid;
        right = mid - 1; // Continue searching left for first occurrence
      } else if (cmp < 0) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    
    if (firstMatch === -1) return matches;
    
    // Collect all matches with same prefix and extend
    for (let i = firstMatch; i < n; i++) {
      const suffixIdx = this.suffixArray[i];
      
      // Check if prefix still matches
      let prefixMatches = true;
      for (let j = 0; j < prefix.length; j++) {
        if (suffixIdx + j >= n || prefix[j] !== this.tokens[suffixIdx + j]) {
          prefixMatches = false;
          break;
        }
      }
      
      if (!prefixMatches) break; // No more matches
      
      // Extend match as far as possible
      let matchLen = prefix.length;
      while (matchLen < pattern.length && 
             suffixIdx + matchLen < n &&
             pattern[matchLen] === this.tokens[suffixIdx + matchLen]) {
        matchLen++;
      }
      
      if (matchLen >= minLen) {
        matches.push({ offset: suffixIdx, length: matchLen });
      }
      
      // Stop after finding a few good matches
      if (matches.length >= 10) break;
    }
    
    return matches;
  }

  /**
   * Update with new tokens (incremental)
   * For now, just rebuild - can optimize later
   */
  update(newTokens) {
    this.tokens = newTokens;
    if (this.tokens.length > 0) {
      this.build();
    }
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage() {
    return this.suffixArray.length * 8 + this.lcp.length * 8; // bytes
  }
}

export { SuffixArray };
