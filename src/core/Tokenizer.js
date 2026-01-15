/**
 * Simple Tokenizer - Converts text to identity IDs without external dependencies
 * Uses hash-based approach for vocabulary-free operation
 */

class Tokenizer {
  /**
   * @param {object} options
   * @param {number} [options.universeSize=100000] - Size of identity space
   * @param {number} [options.ngramMin=1] - Minimum n-gram size
   * @param {number} [options.ngramMax=3] - Maximum n-gram size
   */
  constructor(options = {}) {
    this.universeSize = options.universeSize || 100000;
    this.ngramMin = options.ngramMin || 1;
    this.ngramMax = options.ngramMax || 3;
    
    // Optional vocabulary for interpretability
    this.vocab = new Map(); // token -> id
    this.reverseVocab = new Map(); // id -> token
    this.nextVocabId = 0;
    this.useVocab = options.useVocab || false;
  }

  /**
   * Hash a string to an integer in [0, universeSize)
   * Using FNV-1a hash
   * @param {string} str
   * @returns {number}
   */
  hash(str) {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0; // FNV prime, keep as uint32
    }
    return hash % this.universeSize;
  }

  /**
   * Tokenize text into word tokens
   * @param {string} text
   * @returns {string[]}
   */
  tokenizeWords(text) {
    // Normalize: lowercase, split on non-alphanumeric
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /**
   * Generate n-grams from tokens
   * @param {string[]} tokens
   * @returns {string[]}
   */
  generateNgrams(tokens) {
    const ngrams = [];
    
    for (let n = this.ngramMin; n <= this.ngramMax; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const ngram = tokens.slice(i, i + n).join('_');
        ngrams.push(ngram);
      }
    }
    
    return ngrams;
  }

  /**
   * Encode text to identity IDs
   * @param {string} text
   * @param {object} [options]
   * @returns {number[]}
   */
  encode(text, options = {}) {
    const tokens = this.tokenizeWords(text);
    return this.encodeFromTokens(tokens, options);
  }

  /**
   * Encode pre-tokenized words to identity IDs.
   * @param {string[]} tokens
   * @param {object} [options]
   * @param {boolean} [options.allowVocabGrowth=true]
   * @returns {number[]}
   */
  encodeFromTokens(tokens, options = {}) {
    const { allowVocabGrowth = true } = options;
    const ngrams = this.generateNgrams(tokens);
    
    const ids = new Set();
    
    for (const ngram of ngrams) {
      if (this.useVocab) {
        // Use vocabulary-based encoding
        if (!this.vocab.has(ngram)) {
          if (!allowVocabGrowth) continue;
          const id = this.nextVocabId++;
          this.vocab.set(ngram, id);
          this.reverseVocab.set(id, ngram);
        }
        ids.add(this.vocab.get(ngram));
      } else {
        // Use hash-based encoding
        ids.add(this.hash(ngram));
      }
    }
    
    return [...ids];
  }

  /**
   * Decode IDs back to tokens (only works with vocabulary mode)
   * @param {number[]} ids
   * @returns {string[]}
   */
  decode(ids) {
    if (!this.useVocab) {
      return ids.map(id => `#${id}`);
    }
    return ids.map(id => this.reverseVocab.get(id) || `#${id}`);
  }

  /**
   * Get token for ID (vocabulary mode only)
   * @param {number} id
   * @returns {string|null}
   */
  getToken(id) {
    return this.reverseVocab.get(id) || null;
  }

  /**
   * Serialize tokenizer state
   * @returns {object}
   */
  toJSON() {
    return {
      universeSize: this.universeSize,
      ngramMin: this.ngramMin,
      ngramMax: this.ngramMax,
      useVocab: this.useVocab,
      vocab: this.useVocab ? [...this.vocab.entries()] : [],
      nextVocabId: this.nextVocabId,
    };
  }

  /**
   * Deserialize tokenizer
   * @param {object} json
   * @returns {Tokenizer}
   */
  static fromJSON(json) {
    const tokenizer = new Tokenizer({
      universeSize: json.universeSize,
      ngramMin: json.ngramMin,
      ngramMax: json.ngramMax,
      useVocab: json.useVocab,
    });
    
    if (json.useVocab && json.vocab) {
      for (const [token, id] of json.vocab) {
        tokenizer.vocab.set(token, id);
        tokenizer.reverseVocab.set(id, token);
      }
      tokenizer.nextVocabId = json.nextVocabId;
    }
    
    return tokenizer;
  }
}

/**
 * Character-level tokenizer for finer granularity
 */
class CharTokenizer {
  constructor(options = {}) {
    this.universeSize = options.universeSize || 10000;
    this.windowSize = options.windowSize || 5;
  }

  /**
   * Encode text using character n-grams
   * @param {string} text
   * @returns {number[]}
   */
  encode(text) {
    const normalized = text.toLowerCase();
    const ids = new Set();
    
    // Character-level features
    for (let i = 0; i < normalized.length; i++) {
      // Single char
      ids.add(normalized.charCodeAt(i) % this.universeSize);
      
      // Character bigrams
      if (i < normalized.length - 1) {
        const bigram = normalized.substring(i, i + 2);
        ids.add(this._hash(bigram));
      }
      
      // Character trigrams
      if (i < normalized.length - 2) {
        const trigram = normalized.substring(i, i + 3);
        ids.add(this._hash(trigram));
      }
    }
    
    return [...ids];
  }

  _hash(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash % this.universeSize;
  }
}

module.exports = { Tokenizer, CharTokenizer };
