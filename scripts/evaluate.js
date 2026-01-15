/**
 * BSP Evaluation Script
 * Evaluate a trained model on test data with scientific metrics
 * Usage:
 *   node scripts/evaluate.js                      # Runs full suite on all available data
 *   node scripts/evaluate.js --type text ...      # Runs specific text evaluation
 *   node scripts/evaluate.js --type lambada ...   # Runs specific lambada evaluation
 */

const fs = require('fs');
const path = require('path');
const { BPCMEngine } = require('../src/core');

// Parse args
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx < args.length - 1) return args[idx + 1];
  return null;
}

// Global Config Defaults
const DEFAULT_MODEL = 'data/model_wiki.json';
const DATA_PATHS = {
  wikitext2: 'data/wikitext2_test.txt',
  lambada: 'data/lambada_test.txt',
  simple: 'data/test.txt'
};

async function main() {
  const specificType = getArg('--type');
  const modelPath = getArg('--model') || DEFAULT_MODEL;

  // Check model existence
  if (!fs.existsSync(modelPath)) {
    console.error(`\x1b[31mError: Model file not found at ${modelPath}\x1b[0m`);
    console.error('Please run training first: npm run train');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('BSP Evaluation Suite');
  console.log('='.repeat(60));
  
  // Load model once
  console.log(`Loading model from ${modelPath}...`);
  const state = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const engine = BPCMEngine.fromJSON(state);
  console.log(`Model loaded: ${engine.store.size} groups, ${engine.graph.edgeCount} edges.`);

  if (specificType) {
    // Single Run Mode
    const testPath = getArg('--test');
    if (specificType === 'lambada') {
      await evaluateLambada(engine, testPath || DATA_PATHS.lambada);
    } else {
      await evaluateLanguageModeling(engine, testPath || DATA_PATHS.simple, specificType);
    }
  } else {
    // Full Suite Mode
    await runFullSuite(engine);
  }
}

async function runFullSuite(engine) {
  console.log('\nRunning Full Evaluation Suite...');
  
  // 1. Evaluate on WikiText-2 (Language Modeling)
  if (fs.existsSync(DATA_PATHS.wikitext2)) {
    console.log('\n[1/3] Dataset: WikiText-2 (Language Modeling)');
    await evaluateLanguageModeling(engine, DATA_PATHS.wikitext2, 'WikiText-2');
  } else {
    console.log('\n[1/3] WikiText-2 skipped (file not found)');
  }

  // 2. Evaluate on LAMBADA (Reasoning/Deduction)
  if (fs.existsSync(DATA_PATHS.lambada)) {
    console.log('\n[2/3] Dataset: LAMBADA (Reasoning & Deduction)');
    await evaluateLambada(engine, DATA_PATHS.lambada);
  } else {
    console.log('\n[2/3] LAMBADA skipped (file not found)');
  }

  // 3. Evaluate on Simple Test (Sanity Check)
  if (fs.existsSync(DATA_PATHS.simple)) {
    console.log('\n[3/3] Dataset: Simple/Sanity Check');
    await evaluateLanguageModeling(engine, DATA_PATHS.simple, 'Simple');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Suite Complete');
}

async function evaluateLanguageModeling(engine, testPath, datasetName = 'Text') {
  if (!fs.existsSync(testPath)) {
    console.error(`Test file not found: ${testPath}`);
    return;
  }

  const text = fs.readFileSync(testPath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  
  console.log(`Evaluating on ${lines.length} lines...`);
  
  let totalBits = 0;
  let totalChars = 0;
  let totalSurprise = 0;
  let totalInputSize = 0;
  
  const startTime = Date.now();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const result = engine.process(line, { learn: false });
    
    // Metrics accumulation
    // 1. Model cost: Active Groups * log2(TotalGroups)
    // We assume groups are pointers in a set of size N
    const modelBits = result.activeGroups.length * Math.log2(Math.max(2, engine.store.size));
    
    // 2. Data cost: Surprise Bits * log2(UniverseSize)
    const dataBits = result.surprise * Math.log2(engine.config.universeSize);
    
    totalBits += modelBits + dataBits;
    totalChars += line.length;
    
    totalSurprise += result.surprise;
    totalInputSize += result.inputSize;
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  // Results
  const bpc = totalChars > 0 ? totalBits / totalChars : 0;
  const surpriseRate = totalInputSize > 0 ? totalSurprise / totalInputSize : 0;
  const approxPerplexity = Math.pow(2, bpc * 5); // Rough conversion
  
  console.log(`\n--- Results for ${datasetName} ---`);
  console.log(`  Bits Per Character (BPC): \x1b[36m${bpc.toFixed(4)}\x1b[0m`);
  console.log(`  Surprise Rate:            ${(surpriseRate * 100).toFixed(2)}%`);
  console.log(`  Approx. Word Perplexity:  ${approxPerplexity.toFixed(2)}`);
  console.log(`  Speed:                    ${(lines.length / duration).toFixed(0)} lines/sec`);
}

async function evaluateLambada(engine, testPath) {
  if (!fs.existsSync(testPath)) {
    console.error(`Test file not found: ${testPath}`);
    return;
  }

  const content = fs.readFileSync(testPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  
  console.log(`Evaluating on ${lines.length} examples...`);
  
  let correct = 0;
  let total = 0;
  
  for (let i = 0; i < lines.length; i++) {
    try {
      const json = JSON.parse(lines[i]);
      const text = json.text;
      
      const words = text.split(' ');
      const target = words.pop();
      const context = words.join(' ');
      
      // 1. Process context
      const result = engine.process(context, { learn: false });
      
      // 2. Get predictions
      const predictions = result.predictions; // [{groupId, score}]
      
      // 3. Check target
      const targetInput = engine.encode(target);
      const targetGroups = engine.learner.activate(targetInput, engine.store);
      const targetGroupIds = new Set(targetGroups.map(g => g.id));
      
      let hit = false;
      // Check top 5 predictions
      for (const pred of predictions.slice(0, 5)) {
        if (targetGroupIds.has(pred.groupId)) {
          hit = true;
          break;
        }
      }
      
      if (hit) correct++;
      total++;
      
    } catch (e) {
      // ignore parse errors
    }
  }
  
  console.log(`\n--- Results for LAMBADA ---`);
  console.log(`  Accuracy (Top-5 Group Match): \x1b[36m${(correct/total*100).toFixed(2)}%\x1b[0m`);
  console.log(`  Evaluated:                    ${total} examples`);
}

main().catch(console.error);
