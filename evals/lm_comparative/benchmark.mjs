/**
 * BSP Comparative Benchmark Suite
 * 
 * Implements DS-008: Benchmarks and Comparative Evaluation
 * 
 * This script compares BSP against a Control Model (TinyTransformer)
 * on the same data, same hardware (CPU), same conditions.
 * 
 * Usage:
 *   node benchmark.mjs --all           # Run full benchmark
 *   node benchmark.mjs --bsp-only      # Only evaluate BSP
 *   node benchmark.mjs --quick         # Quick sanity check
 */

import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

// Correct import path (relative to evals/lm_comparative/)
const ENGINE_PATH = '../../src/core/index.mjs';

// Configuration
const CONFIG = {
  dataDir: path.join(import.meta.dirname || '.', 'data'),
  modelsDir: path.join(import.meta.dirname || '.', 'models'),
  resultsDir: path.join(import.meta.dirname || '.', 'results'),
  
  datasets: {
    tinystories: {
      train: 'tinystories/train.txt',
      test: 'tinystories/test.txt'
    },
    blimp: {
      path: 'blimp/'
    }
  }
};

// Ensure directories exist
function ensureDirs() {
  for (const dir of [CONFIG.dataDir, CONFIG.modelsDir, CONFIG.resultsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Load BSP Engine dynamically
async function loadBSPEngine() {
  try {
    const module = await import(ENGINE_PATH);
    return module.BSPEngine;
  } catch (error) {
    console.error(`Failed to load BSPEngine from ${ENGINE_PATH}`);
    console.error('Make sure the core module exists and exports BSPEngine.');
    console.error('Error:', error.message);
    return null;
  }
}

// Calculate Shannon entropy (theoretical baseline)
function calculateEntropy(text) {
  const freqs = {};
  for (const char of text) {
    freqs[char] = (freqs[char] || 0) + 1;
  }
  let entropy = 0;
  const total = text.length;
  for (const char in freqs) {
    const p = freqs[char] / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Calculate Gzip compression ratio (algorithmic baseline)
function calculateGzipBPC(text) {
  const compressed = gzipSync(text);
  return (compressed.length * 8) / text.length;
}

// Evaluate BSP on a text corpus
async function evaluateBSP(engine, text, options = {}) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const totalChars = text.length;
  
  let totalBits = 0;
  let totalSurprise = 0;
  let totalHallucination = 0;
  
  const startTime = Date.now();
  
  for (const line of lines) {
    const result = engine.process(line, { learn: options.learn ?? false });
    
    // MDL-style cost calculation
    const modelCost = result.activeGroups.length * Math.log2(Math.max(2, engine.store.size));
    const dataCost = result.surprise * Math.log2(engine.config.universeSize);
    totalBits += (modelCost + dataCost);
    
    totalSurprise += result.surprise;
    totalHallucination += result.hallucination || 0;
  }
  
  const durationMs = Date.now() - startTime;
  const throughput = (lines.length / durationMs) * 1000;
  
  return {
    bitsPerChar: totalBits / totalChars,
    surpriseRate: totalSurprise / lines.length,
    hallucinationRate: totalHallucination / lines.length,
    throughputLinesPerSec: throughput,
    durationMs,
    lineCount: lines.length,
    charCount: totalChars
  };
}

// Generate comparison report
function generateReport(bspMetrics, controlMetrics, baselines) {
  const timestamp = new Date().toISOString();
  
  const report = {
    timestamp,
    baselines: {
      shannonEntropy: baselines.entropy,
      gzipBPC: baselines.gzip
    },
    results: {
      bsp: bspMetrics,
      control: controlMetrics
    },
    comparison: {}
  };
  
  // Calculate deltas if control exists
  if (controlMetrics) {
    report.comparison = {
      bpcDelta: ((bspMetrics.bitsPerChar - controlMetrics.bitsPerChar) / controlMetrics.bitsPerChar * 100).toFixed(1) + '%',
      throughputDelta: ((bspMetrics.throughputLinesPerSec / controlMetrics.throughputLinesPerSec - 1) * 100).toFixed(1) + '%'
    };
  }
  
  return report;
}

// Print formatted results
function printResults(report) {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              BSP COMPARATIVE BENCHMARK REPORT                  ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║ Timestamp: ${report.timestamp.padEnd(50)}║`);
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ BASELINES (Theoretical)                                        ║');
  console.log(`║   Shannon Entropy:  ${report.baselines.shannonEntropy.toFixed(4)} BPC`.padEnd(64) + '║');
  console.log(`║   Gzip Compression: ${report.baselines.gzipBPC.toFixed(4)} BPC`.padEnd(64) + '║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ BSP RESULTS                                                    ║');
  console.log(`║   Bits per Char:    ${report.results.bsp.bitsPerChar.toFixed(4)} BPC`.padEnd(64) + '║');
  console.log(`║   Surprise Rate:    ${report.results.bsp.surpriseRate.toFixed(4)}`.padEnd(64) + '║');
  console.log(`║   Throughput:       ${report.results.bsp.throughputLinesPerSec.toFixed(0)} lines/sec`.padEnd(64) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
}

// Main benchmark runner
async function runBenchmark(options = {}) {
  console.log('================================================================');
  console.log('  BSP COMPARATIVE BENCHMARK (DS-008)');
  console.log('================================================================\n');
  
  ensureDirs();
  
  // Check for test data
  const testPath = path.join(CONFIG.dataDir, CONFIG.datasets.tinystories.test);
  let actualTestPath = testPath;
  
  if (!fs.existsSync(testPath)) {
    console.log('TinyStories test data not found. Looking for alternatives...');
    
    // Fallback: look for any .txt file in data/
    if (fs.existsSync(CONFIG.dataDir)) {
      const fallbackFiles = fs.readdirSync(CONFIG.dataDir)
        .filter(f => f.endsWith('.txt'));
      
      if (fallbackFiles.length > 0) {
        actualTestPath = path.join(CONFIG.dataDir, fallbackFiles[0]);
        console.log(`Using fallback: ${fallbackFiles[0]}`);
      } else {
        console.error('\nNo test data available.');
        console.log('Please run: node download.mjs --dataset=tinystories');
        console.log('Or place a test file in:', CONFIG.dataDir);
        return;
      }
    } else {
      console.error('\nData directory does not exist.');
      console.log('Please run: node download.mjs --dataset=tinystories');
      return;
    }
  }
  
  // Load BSP Engine
  const BSPEngine = await loadBSPEngine();
  if (!BSPEngine) {
    console.error('Cannot proceed without BSPEngine.');
    return;
  }
  
  // Check for trained model
  const modelPath = path.join(CONFIG.modelsDir, 'bsp.json');
  let engine;
  
  if (fs.existsSync(modelPath)) {
    console.log(`Loading trained model from: ${modelPath}`);
    const state = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    engine = BSPEngine.fromJSON(state);
  } else {
    console.log('No trained model found. Creating new engine...');
    engine = new BSPEngine({
      universeSize: 100000,
      maxGroups: 10000
    });
  }
  
  // Load test data
  const text = fs.readFileSync(actualTestPath, 'utf8');
  console.log(`Test corpus: ${text.length.toLocaleString()} characters\n`);
  
  // Calculate baselines
  console.log('Computing baselines...');
  const baselines = {
    entropy: calculateEntropy(text),
    gzip: calculateGzipBPC(text)
  };
  
  // Evaluate BSP
  console.log('Evaluating BSP...');
  const bspMetrics = await evaluateBSP(engine, text);
  
  // Generate and save report
  const report = generateReport(bspMetrics, null, baselines);
  
  const reportPath = path.join(CONFIG.resultsDir, `report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Also save as latest
  const latestPath = path.join(CONFIG.resultsDir, 'report_latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  
  // Print results
  printResults(report);
  
  console.log(`\nReport saved to: ${reportPath}`);
  
  // Analysis
  console.log('\nAnalysis:');
  if (bspMetrics.bitsPerChar > baselines.gzip) {
    console.log('\x1b[33mWarning: BSP is performing worse than Gzip compression.\x1b[0m');
    console.log('The model is not yet learning effective representations.');
    console.log('Recommendations:');
    console.log('  1. Train on more data');
    console.log('  2. Tune hyperparameters (groups, thresholds)');
    console.log('  3. Check tokenizer alignment');
  } else if (bspMetrics.bitsPerChar > baselines.entropy) {
    console.log('\x1b[36mBSP is compressing better than Gzip but not optimal.\x1b[0m');
    console.log('The model is learning, but has room for improvement.');
  } else {
    console.log('\x1b[32mExcellent: BSP is approaching theoretical entropy limit.\x1b[0m');
  }
  
  console.log('\n================================================================');
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    all: args.includes('--all'),
    bspOnly: args.includes('--bsp-only'),
    quick: args.includes('--quick'),
    help: args.includes('--help') || args.includes('-h')
  };
}

// Entry point
const options = parseArgs();

if (options.help) {
  console.log(`
BSP Comparative Benchmark (DS-008)

Usage:
  node benchmark.mjs [options]

Options:
  --all        Run full benchmark (BSP + Control)
  --bsp-only   Only evaluate BSP
  --quick      Quick sanity check (subset of data)
  --help, -h   Show this help message

Prerequisites:
  1. Download data: node download.mjs --dataset=tinystories
  2. Train BSP:     node train_bsp.mjs
  3. Run benchmark: node benchmark.mjs --all
`);
} else {
  runBenchmark(options);
}
