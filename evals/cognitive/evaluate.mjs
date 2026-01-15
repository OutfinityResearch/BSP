/**
 * Unified Evaluator for Cognitive Benchmarks
 * 
 * Runs BSP engine against all cognitive systems and produces a Cognitive Profile.
 * Usage: node evaluate.mjs [--system=01] [--all]
 */

import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const SYSTEMS = [
  '01_convergence',
  '02_divergence',
  '03_cycles',
  '04_hierarchy',
  '05_composition',
  '06_negation',
  '07_conditional_gates',
  '08_analogy',
  '09_context_switching',
  '10_chunking',
  '11_reversibility',
  '12_temporal_order',
  '13_exceptions',
  '14_interpolation',
  '15_counting',
  '16_recursion',
  '17_inhibition',
  '18_noise_robustness',
  '19_memory_decay',
  '20_transfer'
];

const TIERS = {
  1: ['01_convergence', '02_divergence', '03_cycles', '04_hierarchy', '05_composition'],
  2: ['06_negation', '07_conditional_gates', '08_analogy', '09_context_switching', '10_chunking',
      '11_reversibility', '12_temporal_order', '13_exceptions', '14_interpolation', '15_counting'],
  3: ['16_recursion', '17_inhibition', '18_noise_robustness', '19_memory_decay', '20_transfer']
};

const DATA_DIR = 'evals/cognitive/data';

async function loadEngine() {
  // Try to import BSPEngine
  try {
    const { BSPEngine } = await import('../../src/core/BSPEngine.mjs');
    return BSPEngine;
  } catch (error) {
    console.warn('BSPEngine not found, using mock evaluator');
    return null;
  }
}

async function evaluateSystem(systemId, BSPEngine) {
  console.log(`\n=== Evaluating: ${systemId} ===`);
  
  const systemDataDir = path.join(DATA_DIR, systemId);
  const trainPath = path.join(systemDataDir, 'train.txt');
  const testPath = path.join(systemDataDir, 'test.txt');
  const metaPath = path.join(systemDataDir, 'metadata.json');
  
  // Check if data exists
  if (!fs.existsSync(trainPath)) {
    console.error(`  Training data not found: ${trainPath}`);
    console.log('  Run: node generate.mjs --all');
    return { systemId, status: 'no_data', score: 0 };
  }
  
  // Load metadata
  let metadata = {};
  try {
    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch (e) {
    // No metadata, continue anyway
  }
  
  if (!BSPEngine) {
    // Mock evaluation - random scores for demonstration
    const score = Math.random() * 100;
    console.log(`  [MOCK] Score: ${score.toFixed(1)}%`);
    return {
      systemId,
      systemName: metadata.systemName || systemId,
      status: 'mock',
      score,
      metrics: {}
    };
  }
  
  // Real evaluation with BSPEngine
  const engine = new BSPEngine({
    universeSize: 10000,
    maxGroups: 5000,
    useVocab: true
  });
  
  // Training phase
  console.log('  Training...');
  const trainStream = fs.createReadStream(trainPath);
  const trainRl = readline.createInterface({ input: trainStream, crlfDelay: Infinity });
  
  let trainCount = 0;
  for await (const line of trainRl) {
    if (!line.trim()) continue;
    await engine.process(line);
    trainCount++;
    if (trainCount % 2000 === 0) {
      process.stdout.write(`\r  Trained ${trainCount} samples...`);
    }
  }
  console.log(`\r  Trained ${trainCount} samples.`);
  
  // Testing phase
  console.log('  Testing...');
  const testStream = fs.createReadStream(testPath);
  const testRl = readline.createInterface({ input: testStream, crlfDelay: Infinity });
  
  let correct = 0;
  let total = 0;
  
  for await (const line of testRl) {
    if (!line.trim()) continue;
    
    const parts = line.split('\t');
    const input = parts[0];
    const expected = parts[1];
    
    if (!expected) {
      // No expected value, skip
      continue;
    }
    
    engine.resetContext();
    const result = await engine.process(input);
    
    // Check if prediction matches expected
    // This is simplified - each system needs custom evaluation logic
    const predictions = result.predictions || [];
    const predictedTokens = [];
    
    for (const pred of predictions.slice(0, 5)) {
      const group = engine.store.get(pred.groupId);
      if (group) {
        const memberBits = group.members.toArray();
        const decoded = engine.tokenizer.decode(memberBits);
        predictedTokens.push(...decoded);
      }
    }
    
    if (predictedTokens.includes(expected.trim())) {
      correct++;
    }
    
    total++;
  }
  
  const score = total > 0 ? (correct / total) * 100 : 0;
  
  console.log(`  Score: ${score.toFixed(1)}% (${correct}/${total})`);
  
  return {
    systemId,
    systemName: metadata.systemName || systemId,
    status: 'evaluated',
    score,
    correct,
    total,
    metrics: {
      primary: score
    }
  };
}

function renderBar(score, width = 20) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function printCognitiveProfile(results) {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    BSP COGNITIVE PROFILE                       ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  
  // Tier 1
  console.log('║ TIER 1: CORE PRIMITIVES                                        ║');
  for (const systemId of TIERS[1]) {
    const result = results.find(r => r.systemId === systemId);
    if (result) {
      const name = result.systemName.padEnd(20);
      const score = result.score.toFixed(1).padStart(5);
      const bar = renderBar(result.score);
      console.log(`║   ${name} ${score}%  ${bar}   ║`);
    }
  }
  
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ TIER 2: EXTENDED PRIMITIVES                                    ║');
  for (const systemId of TIERS[2]) {
    const result = results.find(r => r.systemId === systemId);
    if (result) {
      const name = result.systemName.padEnd(20);
      const score = result.score.toFixed(1).padStart(5);
      const bar = renderBar(result.score);
      console.log(`║   ${name} ${score}%  ${bar}   ║`);
    }
  }
  
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ TIER 3: META-COGNITIVE                                         ║');
  for (const systemId of TIERS[3]) {
    const result = results.find(r => r.systemId === systemId);
    if (result) {
      const name = result.systemName.padEnd(20);
      const score = result.score.toFixed(1).padStart(5);
      const bar = renderBar(result.score);
      console.log(`║   ${name} ${score}%  ${bar}   ║`);
    }
  }
  
  // Summary
  const validResults = results.filter(r => r.score !== undefined);
  const avgScore = validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length;
  
  const sorted = [...validResults].sort((a, b) => b.score - a.score);
  const strengths = sorted.slice(0, 3).map(r => r.systemName).join(', ');
  const weaknesses = sorted.slice(-3).reverse().map(r => r.systemName).join(', ');
  
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║ OVERALL SCORE: ${avgScore.toFixed(1)}%`.padEnd(64) + '║');
  console.log(`║ STRENGTHS: ${strengths}`.padEnd(64) + '║');
  console.log(`║ WEAKNESSES: ${weaknesses}`.padEnd(64) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
}

async function evaluateAll() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           COGNITIVE BENCHMARK EVALUATOR                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  const BSPEngine = await loadEngine();
  const results = [];
  
  for (const systemId of SYSTEMS) {
    try {
      const result = await evaluateSystem(systemId, BSPEngine);
      results.push(result);
    } catch (error) {
      console.error(`  ERROR: ${error.message}`);
      results.push({ systemId, status: 'error', score: 0, error: error.message });
    }
  }
  
  // Print cognitive profile
  printCognitiveProfile(results);
  
  // Save results
  const resultsPath = path.join(DATA_DIR, 'evaluation_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    evaluatedAt: new Date().toISOString(),
    results
  }, null, 2));
  
  console.log(`\nResults saved to: ${resultsPath}`);
  
  return results;
}

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    systems: [],
    all: false
  };
  
  for (const arg of args) {
    if (arg === '--all' || arg === '-a') {
      config.all = true;
    } else if (arg.startsWith('--system=')) {
      config.systems.push(arg.split('=')[1]);
    }
  }
  
  return config;
}

async function main() {
  const config = parseArgs();
  
  if (config.all || config.systems.length === 0) {
    await evaluateAll();
  } else {
    const BSPEngine = await loadEngine();
    for (const systemId of config.systems) {
      const fullId = SYSTEMS.find(s => s.startsWith(systemId) || s === systemId);
      if (fullId) {
        await evaluateSystem(fullId, BSPEngine);
      } else {
        console.error(`Unknown system: ${systemId}`);
      }
    }
  }
}

main().catch(console.error);
