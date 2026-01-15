/**
 * Unified Generator for Cognitive Benchmarks
 * 
 * Generates train/test data for all 20 cognitive systems.
 * Usage: node generate.mjs [--system=01] [--all]
 */

import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
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

// Resolve paths relative to this script's location
const __dirname = new URL('.', import.meta.url).pathname;
const DATA_DIR = path.join(__dirname, 'data');

async function loadSystem(systemId) {
  const modulePath = `./systems/${systemId}.mjs`;
  return await import(modulePath);
}

async function generateSystem(systemId, config = {}) {
  console.log(`\n=== Generating: ${systemId} ===`);
  
  const module = await loadSystem(systemId);
  const grammar = module.createGrammar(config);
  
  const systemDataDir = path.join(DATA_DIR, systemId);
  await fs.mkdir(systemDataDir, { recursive: true });
  
  // Generate training data
  console.log('  Generating training data...');
  const trainData = grammar.generateTrainingData(config.trainCount || 10000);
  const trainPath = path.join(systemDataDir, 'train.txt');
  await fs.writeFile(trainPath, trainData.join('\n') + '\n');
  console.log(`  -> ${trainData.length} training samples written to ${trainPath}`);
  
  // Generate test data
  console.log('  Generating test data...');
  const testData = grammar.generateTestData(config.testCount || 1000);
  const testPath = path.join(systemDataDir, 'test.txt');
  await fs.writeFile(testPath, testData.join('\n') + '\n');
  console.log(`  -> ${testData.length} test samples written to ${testPath}`);
  
  // Write metadata
  const metadata = {
    systemId: module.SYSTEM_ID,
    systemName: module.SYSTEM_NAME,
    description: module.SYSTEM_DESCRIPTION,
    metrics: module.metrics,
    config: module.defaultConfig,
    generatedAt: new Date().toISOString(),
    trainCount: trainData.length,
    testCount: testData.length
  };
  
  const metaPath = path.join(systemDataDir, 'metadata.json');
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  
  return metadata;
}

async function generateAll(config = {}) {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           COGNITIVE BENCHMARK DATA GENERATOR                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  const results = [];
  
  for (const systemId of SYSTEMS) {
    try {
      const metadata = await generateSystem(systemId, config);
      results.push({ systemId, status: 'success', ...metadata });
    } catch (error) {
      console.error(`  ERROR: ${error.message}`);
      results.push({ systemId, status: 'error', error: error.message });
    }
  }
  
  // Write summary
  const summaryPath = path.join(DATA_DIR, 'generation_summary.json');
  await fs.writeFile(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    systems: results
  }, null, 2));
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('GENERATION COMPLETE');
  console.log(`  Total systems: ${SYSTEMS.length}`);
  console.log(`  Successful: ${results.filter(r => r.status === 'success').length}`);
  console.log(`  Failed: ${results.filter(r => r.status === 'error').length}`);
  console.log(`  Summary: ${summaryPath}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  return results;
}

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    systems: [],
    all: false,
    trainCount: 10000,
    testCount: 1000
  };
  
  for (const arg of args) {
    if (arg === '--all' || arg === '-a') {
      config.all = true;
    } else if (arg.startsWith('--system=')) {
      config.systems.push(arg.split('=')[1]);
    } else if (arg.startsWith('--train=')) {
      config.trainCount = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--test=')) {
      config.testCount = parseInt(arg.split('=')[1], 10);
    }
  }
  
  return config;
}

async function main() {
  const config = parseArgs();
  
  if (config.all || config.systems.length === 0) {
    await generateAll(config);
  } else {
    for (const systemId of config.systems) {
      const fullId = SYSTEMS.find(s => s.startsWith(systemId) || s === systemId);
      if (fullId) {
        await generateSystem(fullId, config);
      } else {
        console.error(`Unknown system: ${systemId}`);
        console.log(`Available systems: ${SYSTEMS.join(', ')}`);
      }
    }
  }
}

main().catch(console.error);
