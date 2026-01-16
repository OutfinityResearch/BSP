/**
 * System X: Chunking (Sub-pattern Recognition)
 * 
 * Logic: Recognition and reuse of recurring sub-patterns as atomic units
 * Grammar: Chunk_alpha = [A, B, C], Sequences contain repeated chunks
 * Real-World: Idioms, Functions, Musical riffs, Phone numbers
 * Task: Identify repeating chunk and predict continuation
 * Metric: Chunk Discovery Rate, Compression Ratio
 */

export const SYSTEM_ID = '10_chunking';
export const SYSTEM_NAME = 'Chunking';
export const SYSTEM_DESCRIPTION = 'Sub-pattern recognition and reuse';

export class ChunkingGrammar {
  constructor(config = {}) {
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.numChunks = config.numChunks || 30;
    this.minChunkSize = config.minChunkSize || 3;
    this.maxChunkSize = config.maxChunkSize || 6;
    this.numFillers = config.numFillers || 20;
    
    this.chunks = []; // [{id, tokens}]
    this.fillers = [];
    this._init();
  }

  _init() {
    let tokenId = 0;
    
    // Create chunks
    for (let c = 0; c < this.numChunks; c++) {
      const size = this.minChunkSize + 
        Math.floor(this.rng() * (this.maxChunkSize - this.minChunkSize + 1));
      
      const tokens = [];
      for (let i = 0; i < size; i++) {
        tokens.push(`c${String(c).padStart(2, '0')}x${String(i).padStart(2, '0')}`);
      }
      
      this.chunks.push({ id: `chunk${String(c).padStart(2, '0')}`, tokens });
    }
    
    // Create fillers (non-chunk tokens)
    for (let f = 0; f < this.numFillers; f++) {
      this.fillers.push(`f${String(f).padStart(3, '0')}`);
    }
  }

  generateSequence(numChunks = 3, includeFillers = true) {
    const sequence = [];
    
    for (let i = 0; i < numChunks; i++) {
      // Maybe add filler
      if (includeFillers && this.rng() < 0.3) {
        const numFillers = 1 + Math.floor(this.rng() * 2);
        for (let f = 0; f < numFillers; f++) {
          sequence.push(this.fillers[Math.floor(this.rng() * this.fillers.length)]);
        }
      }
      
      // Add chunk
      const chunk = this.chunks[Math.floor(this.rng() * this.chunks.length)];
      sequence.push(...chunk.tokens);
    }
    
    return sequence;
  }

  generateTrainingData(count = 10000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const numChunks = 2 + Math.floor(this.rng() * 4);
      const seq = this.generateSequence(numChunks, true);
      lines.push(seq.join(' '));
    }
    
    return lines;
  }

  generateTestData(count = 1000) {
    const lines = [];
    
    for (let i = 0; i < count; i++) {
      const chunk = this.chunks[i % this.chunks.length];
      
      // Give partial chunk, expect continuation
      const cutPoint = 1 + Math.floor(this.rng() * (chunk.tokens.length - 1));
      const context = chunk.tokens.slice(0, cutPoint);
      const expected = chunk.tokens[cutPoint];
      
      let difficulty = 1;
      if (cutPoint <= 1) difficulty = 3;
      else if (cutPoint <= Math.floor(chunk.tokens.length / 2)) difficulty = 2;

      const expectedJson = JSON.stringify(expected);
      const metaJson = JSON.stringify({
        difficulty,
        family: 'chunking',
        chunkId: chunk.id,
        cutPoint,
        chunkSize: chunk.tokens.length
      });
      lines.push(`${context.join(' ')}\t${expectedJson}\t${metaJson}`);
    }
    
    return lines;
  }

  getChunkContinuation(partialChunk) {
    const tokens = partialChunk.trim().split(/\s+/);
    
    for (const chunk of this.chunks) {
      let matches = true;
      for (let i = 0; i < tokens.length && i < chunk.tokens.length; i++) {
        if (tokens[i] !== chunk.tokens[i]) {
          matches = false;
          break;
        }
      }
      if (matches && tokens.length < chunk.tokens.length) {
        return chunk.tokens[tokens.length];
      }
    }
    return null;
  }
}

export function createGrammar(config) {
  return new ChunkingGrammar(config);
}

export const defaultConfig = {
  numChunks: 30,
  minChunkSize: 3,
  maxChunkSize: 6,
  numFillers: 20
};

export const metrics = {
  primary: 'chunkDiscoveryRate',
  secondary: ['compressionRatio', 'chunkCompletionAccuracy']
};
