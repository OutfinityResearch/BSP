
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { SyntheticGrammar } from './grammar.mjs';

const DATA_DIR = 'evals/synthetic/data';

async function generate() {
  // Ensure directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  console.log('Initializing Grammar...');
  const grammar = new SyntheticGrammar({
    numTerminals: 50,      // 50 distinct "Concepts" (Targets)
    numIntermediates: 500, // 500 intermediate states
    minPathLength: 3,
    maxPathLength: 8,
    branchingFactor: 2
  });

  console.log('Generating Training Data (10,000 sequences)...');
  const trainStream = createWriteStream(path.join(DATA_DIR, 'train.txt'));
  
  for (let i = 0; i < 10000; i++) {
    const seq = grammar.generateSequence();
    trainStream.write(seq.join(' ') + '\n');
  }
  trainStream.end();

  console.log('Generating Test Data (1,000 sequences)...');
  const testStream = createWriteStream(path.join(DATA_DIR, 'test.txt'));
  
  for (let i = 0; i < 1000; i++) {
    const seq = grammar.generateSequence();
    testStream.write(seq.join(' ') + '\n');
  }
  testStream.end();

  console.log('Done. Data saved to ' + DATA_DIR);
}

generate().catch(console.error);
