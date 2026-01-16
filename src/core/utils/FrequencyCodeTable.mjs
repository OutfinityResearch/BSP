/**
 * Frequency-based code table for compression
 * Assigns shorter codes to frequent words (Huffman-style)
 */

class FrequencyCodeTable {
  constructor() {
    this.frequencies = new Map();
    this.codeTable = new Map();
    this.totalWords = 0;
  }

  /**
   * Track word frequency
   */
  observe(word) {
    this.frequencies.set(word, (this.frequencies.get(word) || 0) + 1);
    this.totalWords++;
  }

  /**
   * Build code table from frequencies
   * Simple approximation: log2(totalWords / frequency)
   */
  build() {
    this.codeTable.clear();
    
    for (const [word, freq] of this.frequencies) {
      // Shannon coding: -log2(p) where p = freq/total
      const probability = freq / this.totalWords;
      const bitLength = Math.max(1, Math.ceil(-Math.log2(probability)));
      this.codeTable.set(word, bitLength);
    }
  }

  /**
   * Get bit length for word
   */
  getBitLength(word) {
    return this.codeTable.get(word) || this.getDefaultBitLength();
  }

  /**
   * Default bit length for unknown words
   */
  getDefaultBitLength() {
    // Use vocabulary size as fallback
    const vocabSize = this.frequencies.size || 1000;
    return Math.ceil(Math.log2(vocabSize));
  }

  /**
   * Get average bit length
   */
  getAverageBitLength() {
    if (this.codeTable.size === 0) return this.getDefaultBitLength();
    
    let totalBits = 0;
    let totalFreq = 0;
    
    for (const [word, freq] of this.frequencies) {
      totalBits += this.getBitLength(word) * freq;
      totalFreq += freq;
    }
    
    return totalFreq > 0 ? totalBits / totalFreq : this.getDefaultBitLength();
  }

  /**
   * Serialize
   */
  toJSON() {
    return {
      frequencies: [...this.frequencies.entries()],
      totalWords: this.totalWords,
    };
  }

  /**
   * Deserialize
   */
  static fromJSON(json) {
    const table = new FrequencyCodeTable();
    table.frequencies = new Map(json.frequencies);
    table.totalWords = json.totalWords;
    table.build();
    return table;
  }
}

export { FrequencyCodeTable };
