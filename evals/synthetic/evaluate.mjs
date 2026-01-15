import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { BSPEngine } from '../../src/core/BSPEngine.mjs';

const DATA_DIR = 'evals/synthetic/data';
const TRAIN_FILE = path.join(DATA_DIR, 'train.txt');
const TEST_FILE = path.join(DATA_DIR, 'test.txt');

async function evaluate() {
  console.log('Initializing BSP Engine...');
  const engine = new BSPEngine({
    universeSize: 10000, // Sufficient for our grammar
    maxGroups: 2000,
    rlPressure: 0.1,     // Low pressure, mostly learn patterns
    useVocab: true       // Map STATE_XX to distinct IDs
  });

  // --- TRAINING PHASE ---
  console.log('--- Phase 1: Training ---');
  const trainStream = fs.createReadStream(TRAIN_FILE);
  const trainRl = readline.createInterface({ input: trainStream, crlfDelay: Infinity });

  let lineCount = 0;
  const start = Date.now();
  
  // Multiple Epochs
  for (let epoch = 1; epoch <= 3; epoch++) {
    console.log(`Starting Epoch ${epoch}...`);
    const epochStream = fs.createReadStream(TRAIN_FILE);
    const epochRl = readline.createInterface({ input: epochStream, crlfDelay: Infinity });
    
    for await (const line of epochRl) {
      if (!line.trim()) continue;
      await engine.process(line);
      lineCount++;
      if (lineCount % 5000 === 0) {
        process.stdout.write(`\rProcessed ${lineCount} sequences (Epoch ${epoch})...`);
      }
    }
    console.log(''); // Newline
  }
  console.log(`\nTraining complete. ${lineCount} sequences in ${(Date.now() - start) / 1000}s.`);
  console.log(`Engine Stats: ${engine.store.size} groups, ${engine.graph.edgeCount} edges.`);

  // --- TESTING PHASE ---
  console.log('\n--- Phase 2: Evaluation (Transitive Closure) ---');
  // We want to see if feeding the START of a sequence makes the engine predict the END.
  
  const testStream = fs.createReadStream(TEST_FILE);
  const testRl = readline.createInterface({ input: testStream, crlfDelay: Infinity });
  
  let totalTests = 0;
  let correctTop1 = 0;
  let correctTop5 = 0;
  let correctTop10 = 0;
  
  // Also measure if the prediction is just the "next step" (local) or the "target" (global)
  let directNextHits = 0; 

  for await (const line of testRl) {
    if (!line.trim()) continue;
    
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 2) continue;
    
    const startToken = tokens[0];
    const nextToken = tokens[1];
    const targetToken = tokens[tokens.length - 1];
    
    // Reset context to simulate a fresh prompt
    engine.resetContext();
    
    // Feed ONLY the start token.
    // We explicitly DISABLE learning here to treat it as inference.
    // However, engine.process() always learns currently. 
    // For this benchmark, we can just process. 
    // Ideally we'd have a 'learn: false' flag, but let's stick to the public API.
    // If we process 'startToken', the engine tries to predict what comes NEXT.
    
    const result = await engine.process(startToken);
    
    // Check predictions
    // result.predictions is array of { groupId, score }
    // We need to decode the Group IDs back to tokens to verify against targetToken.
    
    const predictedTokens = [];
    for (const pred of result.predictions) {
      // Get the group
      const group = engine.store.get(pred.groupId);
      if (!group) continue;
      
      // Decode the group's members
      // The group might contain [STATE_01, STATE_02], etc.
      // We check if the group *contains* the target token.
      const memberBits = group.members.toArray();
      const decodedMembers = engine.tokenizer.decode(memberBits);
      
      if (decodedMembers.includes(targetToken)) {
        predictedTokens.push(targetToken); // Match found in this group
      } else if (decodedMembers.includes(nextToken)) {
        predictedTokens.push(nextToken);
      } else {
        predictedTokens.push(decodedMembers[0]); // Just take the first one for logging
      }
    }
    
    // Check Rank
    // Note: This logic is slightly fuzzy because a group can contain multiple tokens.
    // But in our grammar, states are distinct. Ideally 1 group = 1 state/concept.
    
    const foundIndex = predictedTokens.indexOf(targetToken);
    const nextIndex = predictedTokens.indexOf(nextToken);
    
    if (foundIndex === 0) correctTop1++;
    if (foundIndex !== -1 && foundIndex < 5) correctTop5++;
    if (foundIndex !== -1 && foundIndex < 10) correctTop10++;
    
    if (nextIndex === 0) directNextHits++; // It predicted the immediate next step
    
    totalTests++;
    if (totalTests % 100 === 0) {
       process.stdout.write(`\rTested ${totalTests} sequences...`);
    }
  }
  
  console.log(`\n\nResults (${totalTests} sequences):`);
  console.log(`Top-1 Accuracy (Final Target): ${(correctTop1 / totalTests * 100).toFixed(2)}%`);
  console.log(`Top-5 Accuracy (Final Target): ${(correctTop5 / totalTests * 100).toFixed(2)}%`);
  console.log(`Top-10 Accuracy (Final Target): ${(correctTop10 / totalTests * 100).toFixed(2)}%`);
  console.log(`Next-Step Accuracy (Local): ${(directNextHits / totalTests * 100).toFixed(2)}%`);
  
  console.log('\nInterpretation:');
  console.log('- High Next-Step means it learned the chain links (A->B).');
  console.log('- High Final Target means it learned the Transitive Closure (A->...->T).');
  console.log('- If Final Target is low but Next-Step is high, DeductionGraph is strictly local.');
}

evaluate().catch(console.error);
