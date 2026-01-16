/**
 * Unified Generator for Abstract Primitives Benchmarks
 * 
 * Generates train/test data for all 20 systems.
 * Usage:
 *   node generate.mjs --all --seed=123
 *   node generate.mjs --system=01 --seed=123
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { createRng, deriveSeed, normalizeSeed } from './rng.mjs';
import { normalizeDifficulty } from './difficulty.mjs';
import { Tokenizer } from '../../src/core/Tokenizer.mjs';

const SAFE_TOKEN_RE = /^[a-z][a-z0-9]*$/;

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

async function loadSystem(systemId) {
  const modulePath = `./${systemId}/generator.mjs`;
  return await import(modulePath);
}

function validatePromptTokens(systemId, line, tokenizer) {
  const raw = line.trim().split(/\s+/).filter(Boolean);
  if (raw.length === 0) return;

  for (const token of raw) {
    if (!SAFE_TOKEN_RE.test(token)) {
      throw new Error(
        `Token alphabet violation in ${systemId}: ` +
        `token=${JSON.stringify(token)} line=${JSON.stringify(line)}`
      );
    }
  }

  const tokenized = tokenizer.tokenizeWords(line);
  if (tokenized.length !== raw.length) {
    throw new Error(
      `Tokenizer mismatch in ${systemId}: rawCount=${raw.length} tokenizerCount=${tokenized.length} ` +
      `line=${JSON.stringify(line)}`
    );
  }

  for (let i = 0; i < raw.length; i++) {
    if (tokenized[i] !== raw[i]) {
      throw new Error(
        `Tokenizer mismatch in ${systemId}: raw=${JSON.stringify(raw[i])} tokenizer=${JSON.stringify(tokenized[i])} ` +
        `line=${JSON.stringify(line)}`
      );
    }
  }
}

function validateGeneratedData(systemId, trainData, testData) {
  const tokenizer = new Tokenizer();
  const expectedFamily = systemId.replace(/^[0-9]+_/, '');

  for (const line of trainData) {
    if (!line.trim()) continue;
    validatePromptTokens(systemId, line, tokenizer);
  }

  for (const line of testData) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length !== 3) {
      throw new Error(
        `Test format violation in ${systemId}: expected 3 fields separated by exactly 2 tabs; ` +
        `gotFields=${parts.length} line=${JSON.stringify(line)}`
      );
    }

    const prompt = parts[0] || '';
    const expectedRaw = parts[1] || '';
    const metaRaw = parts[2] || '';

    validatePromptTokens(systemId, prompt, tokenizer);

    let expected;
    try {
      expected = JSON.parse(expectedRaw);
    } catch (error) {
      throw new Error(
        `Test format violation in ${systemId}: expected_json is not valid JSON; ` +
        `value=${JSON.stringify(expectedRaw)} line=${JSON.stringify(line)}`
      );
    }
    if (expected === null || (typeof expected !== 'string' && typeof expected !== 'object')) {
      throw new Error(
        `Test format violation in ${systemId}: expected_json must be a JSON string or object/array; ` +
        `type=${expected === null ? 'null' : typeof expected} line=${JSON.stringify(line)}`
      );
    }

    let meta;
    try {
      meta = JSON.parse(metaRaw);
    } catch (error) {
      throw new Error(
        `Test format violation in ${systemId}: meta_json is not valid JSON; ` +
        `value=${JSON.stringify(metaRaw)} line=${JSON.stringify(line)}`
      );
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      throw new Error(
        `Test format violation in ${systemId}: meta_json must be a JSON object; ` +
        `line=${JSON.stringify(line)}`
      );
    }
    if (!Number.isInteger(meta.difficulty) || meta.difficulty < 1 || meta.difficulty > 3) {
      throw new Error(
        `Test format violation in ${systemId}: meta_json.difficulty must be 1|2|3; ` +
        `value=${JSON.stringify(meta.difficulty)} line=${JSON.stringify(line)}`
      );
    }
    if (typeof meta.family !== 'string' || meta.family !== expectedFamily) {
      throw new Error(
        `Test format violation in ${systemId}: meta_json.family must equal ${JSON.stringify(expectedFamily)}; ` +
        `value=${JSON.stringify(meta.family)} line=${JSON.stringify(line)}`
      );
    }
  }
}

async function generateSystem(systemId, config = {}) {
  const baseSeed = normalizeSeed(config.seed ?? 1);
  const systemSeed = deriveSeed(baseSeed, systemId);
  const rng = createRng(systemSeed);

  const diffLabel = config.difficulty ? ` difficulty=${config.difficulty}` : '';
  console.log(`\n=== Generating: ${systemId} (seed=${systemSeed}${diffLabel}) ===`);
  
  const module = await loadSystem(systemId);
  const grammar = module.createGrammar({ ...config, rng });
  
  const systemDir = path.join(__dirname, systemId);
  await fs.mkdir(systemDir, { recursive: true });
  
  // Generate training data
  console.log('  Generating training data...');
  const trainData = grammar.generateTrainingData(config.trainCount || 10000);
  
  // Generate test data
  console.log('  Generating test data...');
  const testData = grammar.generateTestData(config.testCount || 1000);

  validateGeneratedData(systemId, trainData, testData);

  const trainPath = path.join(systemDir, 'train.txt');
  await fs.writeFile(trainPath, trainData.join('\n') + '\n');
  console.log(`  -> ${trainData.length} training samples written`);

  const testPath = path.join(systemDir, 'test.txt');
  await fs.writeFile(testPath, testData.join('\n') + '\n');
  console.log(`  -> ${testData.length} test samples written`);
  
  // Write metadata
  const metadata = {
    systemId: module.SYSTEM_ID,
    systemName: module.SYSTEM_NAME,
    description: module.SYSTEM_DESCRIPTION,
    metrics: module.metrics,
    config: module.defaultConfig,
    difficulty: config.difficulty || null,
    baseSeed,
    systemSeed,
    trainCount: trainData.length,
    testCount: testData.length
  };
  
  const metaPath = path.join(systemDir, 'metadata.json');
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  
  return metadata;
}

async function generateAll(config = {}) {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       ABSTRACT PRIMITIVES BENCHMARK DATA GENERATOR             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`Seed: ${normalizeSeed(config.seed ?? 1)}`);
  
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
  const summaryPath = path.join(__dirname, 'generation_summary.json');
  const baseSeed = normalizeSeed(config.seed ?? 1);
  await fs.writeFile(summaryPath, JSON.stringify({
    baseSeed,
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
    testCount: 1000,
    seed: 1,
    difficulty: null,
  };
  
  for (const arg of args) {
    if (arg === '--all' || arg === '-a') {
      config.all = true;
    } else if (arg.startsWith('--seed=')) {
      config.seed = normalizeSeed(arg.split('=')[1]);
    } else if (arg.startsWith('--difficulty=')) {
      config.difficulty = normalizeDifficulty(arg.split('=')[1]);
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

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
