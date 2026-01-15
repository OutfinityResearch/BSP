/**
 * SimpleBitset - A CPU-friendly bitset implementation without external dependencies
 * Supports up to 1M bits efficiently using Uint32Array
 */

class SimpleBitset {
  /**
   * @param {number} [maxSize=1000000] - Maximum number of bits
   */
  constructor(maxSize = 1000000) {
    this.maxSize = maxSize;
    this.wordCount = Math.ceil(maxSize / 32);
    this.words = new Uint32Array(this.wordCount);
    this._size = 0; // Cached count of set bits
    this._dirty = false;
    // Optional fast-path for bitsets built from sparse arrays (e.g. per-input encodings)
    this._sparseBits = null;
  }

  /**
   * Set a bit
   * @param {number} bit - Bit index to set
   */
  add(bit) {
    if (bit < 0 || bit >= this.maxSize) return;
    const wordIndex = bit >>> 5;
    const bitMask = 1 << (bit & 31);
    if (!(this.words[wordIndex] & bitMask)) {
      this.words[wordIndex] |= bitMask;
      this._dirty = true;
      this._sparseBits = null;
    }
  }

  /**
   * Check if bit is set
   * @param {number} bit - Bit index
   * @returns {boolean}
   */
  has(bit) {
    if (bit < 0 || bit >= this.maxSize) return false;
    const wordIndex = bit >>> 5;
    const bitMask = 1 << (bit & 31);
    return (this.words[wordIndex] & bitMask) !== 0;
  }

  /**
   * Remove a bit
   * @param {number} bit - Bit index to clear
   */
  remove(bit) {
    if (bit < 0 || bit >= this.maxSize) return;
    const wordIndex = bit >>> 5;
    const bitMask = 1 << (bit & 31);
    if (this.words[wordIndex] & bitMask) {
      this.words[wordIndex] &= ~bitMask;
      this._dirty = true;
      this._sparseBits = null;
    }
  }

  /**
   * Clear all bits
   */
  clear() {
    this.words.fill(0);
    this._size = 0;
    this._dirty = false;
    this._sparseBits = null;
  }

  /**
   * Count set bits (popcount)
   * @returns {number}
   */
  get size() {
    if (this._sparseBits && !this._dirty) return this._sparseBits.length;
    if (this._dirty) {
      this._size = 0;
      for (let i = 0; i < this.wordCount; i++) {
        this._size += this._popcount32(this.words[i]);
      }
      this._dirty = false;
    }
    return this._size;
  }

  /**
   * Popcount for 32-bit integer
   * @private
   */
  _popcount32(n) {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return ((n + (n >>> 4) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }

  /**
   * Iterate over set bits
   * @yields {number}
   */
  *[Symbol.iterator]() {
    if (this._sparseBits && !this._dirty) {
      for (const bit of this._sparseBits) yield bit;
      return;
    }
    for (let wordIndex = 0; wordIndex < this.wordCount; wordIndex++) {
      let word = this.words[wordIndex];
      if (word === 0) continue;
      const baseIndex = wordIndex << 5;
      while (word !== 0) {
        const tz = this._trailingZeros(word);
        yield baseIndex + tz;
        word &= word - 1; // Clear lowest set bit
      }
    }
  }

  /**
   * Get all set bits as array
   * @returns {number[]}
   */
  toArray() {
    if (this._sparseBits && !this._dirty) return [...this._sparseBits];
    return [...this];
  }

  /**
   * Trailing zeros count
   * @private
   */
  _trailingZeros(n) {
    if (n === 0) return 32;
    let count = 0;
    while ((n & 1) === 0) {
      count++;
      n >>>= 1;
    }
    return count;
  }

  /**
   * AND operation (intersection)
   * @param {SimpleBitset} other
   * @returns {SimpleBitset} New bitset with intersection
   */
  and(other) {
    const result = new SimpleBitset(Math.min(this.maxSize, other.maxSize));
    const minWords = Math.min(this.wordCount, other.wordCount);
    for (let i = 0; i < minWords; i++) {
      result.words[i] = this.words[i] & other.words[i];
    }
    result._dirty = true;
    return result;
  }

  /**
   * OR operation (union)
   * @param {SimpleBitset} other
   * @returns {SimpleBitset} New bitset with union
   */
  or(other) {
    const result = new SimpleBitset(Math.max(this.maxSize, other.maxSize));
    const maxWords = Math.max(this.wordCount, other.wordCount);
    for (let i = 0; i < maxWords; i++) {
      const a = i < this.wordCount ? this.words[i] : 0;
      const b = i < other.wordCount ? other.words[i] : 0;
      result.words[i] = a | b;
    }
    result._dirty = true;
    return result;
  }

  /**
   * AND-NOT operation (difference: this \ other)
   * @param {SimpleBitset} other
   * @returns {SimpleBitset}
   */
  andNot(other) {
    const result = new SimpleBitset(this.maxSize);
    for (let i = 0; i < this.wordCount; i++) {
      const b = i < other.wordCount ? other.words[i] : 0;
      result.words[i] = this.words[i] & ~b;
    }
    result._dirty = true;
    return result;
  }

  /**
   * In-place OR
   * @param {SimpleBitset} other
   */
  orInPlace(other) {
    const minWords = Math.min(this.wordCount, other.wordCount);
    for (let i = 0; i < minWords; i++) {
      this.words[i] |= other.words[i];
    }
    this._dirty = true;
    this._sparseBits = null;
  }

  /**
   * Count intersection size without creating new bitset
   * @param {SimpleBitset} other
   * @returns {number}
   */
  andCardinality(other) {
    if (other?._sparseBits && !other._dirty) {
      let count = 0;
      for (const bit of other._sparseBits) {
        if (this.has(bit)) count++;
      }
      return count;
    }
    let count = 0;
    const minWords = Math.min(this.wordCount, other.wordCount);
    for (let i = 0; i < minWords; i++) {
      count += this._popcount32(this.words[i] & other.words[i]);
    }
    return count;
  }

  /**
   * Clone this bitset
   * @returns {SimpleBitset}
   */
  clone() {
    const result = new SimpleBitset(this.maxSize);
    result.words.set(this.words);
    result._size = this._size;
    result._dirty = this._dirty;
    result._sparseBits = this._sparseBits ? [...this._sparseBits] : null;
    return result;
  }

  /**
   * Compute Jaccard similarity
   * @param {SimpleBitset} other
   * @returns {number} 0-1
   */
  jaccard(other) {
    let intersection = 0;
    let union = 0;
    const maxWords = Math.max(this.wordCount, other.wordCount);
    for (let i = 0; i < maxWords; i++) {
      const a = i < this.wordCount ? this.words[i] : 0;
      const b = i < other.wordCount ? other.words[i] : 0;
      intersection += this._popcount32(a & b);
      union += this._popcount32(a | b);
    }
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Create from array of bits
   * @param {number[]} bits
   * @param {number} [maxSize]
   * @returns {SimpleBitset}
   */
  static fromArray(bits, maxSize = 1000000) {
    const result = new SimpleBitset(maxSize);
    for (const bit of bits) {
      result.add(bit);
    }
    // If caller provides unique sparse bits (typical for tokenizer outputs),
    // keep them for fast iteration/intersection during activation and learning.
    result._sparseBits = Array.isArray(bits) ? [...new Set(bits)] : null;
    result._size = result._sparseBits ? result._sparseBits.length : result._size;
    result._dirty = false;
    return result;
  }

  /**
   * Serialize to JSON-friendly format
   * @returns {object}
   */
  toJSON() {
    // For sparse bitsets, store as array of set bits
    // For dense, store as base64
    const setBits = this.toArray();
    if (setBits.length < this.wordCount * 2) {
      return { type: 'sparse', bits: setBits, maxSize: this.maxSize };
    } else {
      // Convert Uint32Array to base64
      const buffer = Buffer.from(this.words.buffer);
      return { type: 'dense', data: buffer.toString('base64'), maxSize: this.maxSize };
    }
  }

  /**
   * Deserialize from JSON
   * @param {object} json
   * @returns {SimpleBitset}
   */
  static fromJSON(json) {
    const result = new SimpleBitset(json.maxSize);
    if (json.type === 'sparse') {
      for (const bit of json.bits) {
        result.add(bit);
      }
    } else {
      const buffer = Buffer.from(json.data, 'base64');
      const words = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
      result.words.set(words);
      result._dirty = true;
    }
    return result;
  }
}

module.exports = { SimpleBitset };
