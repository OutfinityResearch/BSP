/**
 * BSP Language Model Comparative Benchmark Runner
 * 
 * One-command runner that:
 * 1. Downloads datasets (if not cached)
 * 2. Trains BSP model (if not cached)
 * 3. Runs the benchmark
 * 4. Produces a report
 * 
 * Usage: node evals/runLM_Comp.mjs
 * 
 * All data is cached in evals/lm_comparative/data/ and evals/lm_comparative/models/
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const PATHS = {
  base: path.join(__dirname, 'lm_comparative'),
  data: path.join(__dirname, 'lm_comparative', 'data'),
  models: path.join(__dirname, 'lm_comparative', 'models'),
  results: path.join(__dirname, 'lm_comparative', 'results'),
  
  // Specific files
  tinyStoriesTrain: path.join(__dirname, 'lm_comparative', 'data', 'tinystories_train.txt'),
  tinyStoriesTest: path.join(__dirname, 'lm_comparative', 'data', 'tinystories_test.txt'),
  blimpData: path.join(__dirname, 'lm_comparative', 'data', 'blimp'),
  bspModel: path.join(__dirname, 'lm_comparative', 'models', 'bsp_tinystories.json'),
};

// Configuration
const CONFIG = {
  // TinyStories subset size (tokens to use for training)
  trainTokens: 500_000,  // ~500K tokens for MVP
  testTokens: 50_000,    // ~50K tokens for test
  
  // BSP hyperparameters
  bsp: {
    universeSize: 100_000,
    maxGroups: 20_000,
    topK: 16,
    // DS-022: Emergent grammar through sequence cost
    sequenceCostWeight: 0.1,  // Keep low - sequence cost already high
    unknownTransitionPenalty: 8,
    // Sequence model smoothing for unseen transitions
    sequenceModel: {
      smoothing: 'addAlpha',
      smoothingAlpha: 0.01,  // Small alpha for backoff
    },
  },
  
  // Training
  logInterval: 5000,
  saveInterval: 50000,
};

// Utility: ensure directories exist
function ensureDirs() {
  for (const dir of [PATHS.data, PATHS.models, PATHS.results, PATHS.blimpData]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Utility: format number with commas
function formatNum(n) {
  return n.toLocaleString();
}

// Utility: format duration
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// ============================================================================
// STEP 1: Download TinyStories
// ============================================================================

async function downloadTinyStories() {
  console.log('\n📥 Step 1: Checking TinyStories dataset...');
  
  if (fs.existsSync(PATHS.tinyStoriesTrain) && fs.existsSync(PATHS.tinyStoriesTest)) {
    const trainSize = fs.statSync(PATHS.tinyStoriesTrain).size;
    const testSize = fs.statSync(PATHS.tinyStoriesTest).size;
    if (trainSize > 10000 && testSize > 1000) {
      console.log(`   ✓ Already cached: train=${formatNum(trainSize)} bytes, test=${formatNum(testSize)} bytes`);
      return true;
    }
  }
  
  console.log('   Downloading TinyStories from HuggingFace...');
  
  // Try multiple URLs (validation set is smaller and faster to download)
  const URLS = [
    'https://huggingface.co/datasets/roneneldan/TinyStories/resolve/main/TinyStories-valid.txt',
    'https://huggingface.co/datasets/roneneldan/TinyStories/resolve/main/TinyStoriesV2-GPT4-valid.txt',
  ];
  
  for (const url of URLS) {
    try {
      console.log(`   Trying: ${url.split('/').pop()}`);
      
      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.log(`   ⚠ HTTP ${response.status}, trying next...`);
        continue;
      }
      
      const text = await response.text();
      console.log(`   Downloaded ${formatNum(text.length)} characters`);
      
      // Split into stories
      const stories = text.split('<|endoftext|>').filter(s => s.trim().length > 50);
      
      if (stories.length < 100) {
        // Try newline split instead
        const lines = text.split('\n\n').filter(s => s.trim().length > 50);
        if (lines.length > stories.length) {
          stories.length = 0;
          stories.push(...lines);
        }
      }
      
      console.log(`   Found ${formatNum(stories.length)} stories`);
      
      if (stories.length < 50) {
        console.log(`   ⚠ Too few stories, trying next URL...`);
        continue;
      }
      
      // Split 80/20 for train/test
      const splitIdx = Math.floor(stories.length * 0.8);
      const trainStories = stories.slice(0, splitIdx);
      const testStories = stories.slice(splitIdx);
      
      // Limit size to avoid huge files
      const maxTrainStories = Math.min(trainStories.length, 5000);
      const maxTestStories = Math.min(testStories.length, 500);
      
      // Save files
      fs.writeFileSync(PATHS.tinyStoriesTrain, trainStories.slice(0, maxTrainStories).join('\n\n'));
      fs.writeFileSync(PATHS.tinyStoriesTest, testStories.slice(0, maxTestStories).join('\n\n'));
      
      const trainSize = fs.statSync(PATHS.tinyStoriesTrain).size;
      const testSize = fs.statSync(PATHS.tinyStoriesTest).size;
      
      console.log(`   ✓ Saved train: ${formatNum(trainSize)} bytes (${maxTrainStories} stories)`);
      console.log(`   ✓ Saved test: ${formatNum(testSize)} bytes (${maxTestStories} stories)`);
      
      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`   ⚠ Timeout, trying next...`);
      } else {
        console.log(`   ⚠ ${error.message}, trying next...`);
      }
    }
  }
  
  console.log('   All download attempts failed. Using synthetic data...');
  return await generateFallbackData();
}

// Generate fallback synthetic data if download fails
async function generateFallbackData() {
  console.log('   Generating synthetic training data...');
  
  const patterns = [
    'The {animal} {action} in the {place}.',
    'Once upon a time, there was a {adjective} {animal}.',
    '{name} went to the {place} to {action}.',
    'The {adjective} {animal} liked to {action} every day.',
    'In the {place}, a {animal} found a {object}.',
  ];
  
  const vocab = {
    animal: ['cat', 'dog', 'bird', 'rabbit', 'mouse', 'fox', 'bear', 'deer'],
    action: ['runs', 'jumps', 'sleeps', 'eats', 'plays', 'hides', 'swims', 'flies'],
    place: ['forest', 'garden', 'house', 'park', 'river', 'mountain', 'field', 'cave'],
    adjective: ['big', 'small', 'happy', 'sad', 'fast', 'slow', 'brave', 'shy'],
    name: ['Tom', 'Lucy', 'Max', 'Emma', 'Jack', 'Lily', 'Sam', 'Anna'],
    object: ['ball', 'stick', 'flower', 'stone', 'leaf', 'berry', 'feather', 'shell'],
  };
  
  function generateSentence() {
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    return pattern.replace(/{(\w+)}/g, (_, key) => {
      const options = vocab[key];
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  
  function generateStory() {
    const sentences = [];
    const length = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < length; i++) {
      sentences.push(generateSentence());
    }
    return sentences.join(' ');
  }
  
  const trainStories = [];
  const testStories = [];
  
  for (let i = 0; i < 5000; i++) trainStories.push(generateStory());
  for (let i = 0; i < 500; i++) testStories.push(generateStory());
  
  fs.writeFileSync(PATHS.tinyStoriesTrain, trainStories.join('\n\n'));
  fs.writeFileSync(PATHS.tinyStoriesTest, testStories.join('\n\n'));
  
  console.log(`   ✓ Generated ${trainStories.length} train stories, ${testStories.length} test stories`);
  return true;
}

// ============================================================================
// STEP 2: Download BLiMP
// ============================================================================

async function downloadBLiMP() {
  console.log('\n📥 Step 2: Checking BLiMP dataset...');
  
  // Check if we have at least one BLiMP file cached
  const existingFiles = fs.existsSync(PATHS.blimpData) 
    ? fs.readdirSync(PATHS.blimpData).filter(f => f.endsWith('.jsonl'))
    : [];
  
  if (existingFiles.length >= 3) {
    console.log(`   ✓ Already cached: ${existingFiles.length} tasks`);
    return true;
  }
  
  console.log('   Downloading BLiMP from GitHub...');
  
  // BLiMP subtasks to download (actual file names from repo)
  const subtasks = [
    'determiner_noun_agreement_1',
    'determiner_noun_agreement_2', 
    'anaphor_number_agreement',
    'regular_plural_subject_verb_agreement_1',
    'irregular_plural_subject_verb_agreement_1',
  ];
  
  const BASE_URL = 'https://raw.githubusercontent.com/alexwarstadt/blimp/master/data/';
  
  for (const task of subtasks) {
    const url = `${BASE_URL}${task}.jsonl`;
    const outPath = path.join(PATHS.blimpData, `${task}.jsonl`);
    
    try {
      console.log(`   Fetching: ${task}...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`   ⚠ Could not download ${task}: HTTP ${response.status}`);
        continue;
      }
      
      const text = await response.text();
      fs.writeFileSync(outPath, text);
      
      const lines = text.split('\n').filter(l => l.trim()).length;
      console.log(`   ✓ ${task}: ${lines} examples`);
    } catch (error) {
      console.warn(`   ⚠ Failed to download ${task}: ${error.message}`);
    }
  }
  
  return true;
}

// ============================================================================
// STEP 3: Train BSP
// ============================================================================

async function trainBSP() {
  console.log('\n🔧 Step 3: Training BSP model...');
  
  // Check if model is already trained
  if (fs.existsSync(PATHS.bspModel)) {
    const stats = fs.statSync(PATHS.bspModel);
    console.log(`   ✓ Already trained: ${formatNum(stats.size)} bytes`);
    console.log(`   (Delete ${PATHS.bspModel} to retrain)`);
    return true;
  }
  
  // Load BSPEngine
  let BSPEngine;
  try {
    const module = await import('../src/core/index.mjs');
    BSPEngine = module.BSPEngine;
  } catch (error) {
    console.error(`   ✗ Failed to load BSPEngine: ${error.message}`);
    return false;
  }
  
  // Load training data
  if (!fs.existsSync(PATHS.tinyStoriesTrain)) {
    console.error('   ✗ Training data not found. Run download first.');
    return false;
  }
  
  const trainText = fs.readFileSync(PATHS.tinyStoriesTrain, 'utf8');
  let lines = trainText.split('\n').filter(l => l.trim().length > 0);
  
  // Limit lines based on mode
  // Full mode: 5000 lines (reasonable training time)
  // Quick mode: 1000 lines (fast testing)
  const maxLines = QUICK_MODE ? Math.min(lines.length, 1000) : Math.min(lines.length, 5000);
  lines = lines.slice(0, maxLines);
  
  console.log(`   Training on ${formatNum(lines.length)} lines...`);
  
  // Create engine with compression features enabled
  const engine = new BSPEngine({
    ...CONFIG.bsp,
    useVocab: true,
    adaptiveUniverse: true,
    useCompressionMachine: true,
  });
  
  // Training loop
  const startTime = Date.now();
  let totalSurprise = 0;
  let processedLines = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    try {
      const result = engine.process(line, { learn: true });
      totalSurprise += result.surprise || 0;
      processedLines++;
      
      // Log progress
      if ((i + 1) % CONFIG.logInterval === 0) {
        const elapsed = Date.now() - startTime;
        const avgSurprise = totalSurprise / processedLines;
        const throughput = (processedLines / elapsed) * 1000;
        
        console.log(`   [${i + 1}/${lines.length}] surprise=${avgSurprise.toFixed(2)}, ` +
                   `groups=${engine.store?.size || 0}, ${throughput.toFixed(0)} lines/sec`);
      }
      
      // Periodic save
      if ((i + 1) % CONFIG.saveInterval === 0) {
        const state = engine.toJSON();
        fs.writeFileSync(PATHS.bspModel, JSON.stringify(state));
        console.log(`   💾 Checkpoint saved`);
      }
    } catch (error) {
      console.warn(`   ⚠ Error processing line ${i}: ${error.message}`);
    }
  }
  
  // Final save
  const duration = Date.now() - startTime;
  const state = engine.toJSON();
  fs.writeFileSync(PATHS.bspModel, JSON.stringify(state));
  
  console.log(`   ✓ Training complete in ${formatDuration(duration)}`);
  console.log(`   ✓ Model saved: ${formatNum(JSON.stringify(state).length)} bytes`);
  console.log(`   ✓ Groups: ${engine.store?.size || 0}`);
  
  return true;
}

// ============================================================================
// STEP 4: Run Benchmark
// ============================================================================

async function runBenchmark() {
  console.log('\n📊 Step 4: Running benchmark...');
  
  // Load BSPEngine
  let BSPEngine;
  try {
    const module = await import('../src/core/index.mjs');
    BSPEngine = module.BSPEngine;
  } catch (error) {
    console.error(`   ✗ Failed to load BSPEngine: ${error.message}`);
    return null;
  }
  
  // Load trained model
  if (!fs.existsSync(PATHS.bspModel)) {
    console.error('   ✗ Trained model not found. Run training first.');
    return null;
  }
  
  const state = JSON.parse(fs.readFileSync(PATHS.bspModel, 'utf8'));
  const engine = BSPEngine.fromJSON(state);
  console.log(`   Loaded model: ${engine.store?.size || 0} groups`);
  
  // Load test data
  if (!fs.existsSync(PATHS.tinyStoriesTest)) {
    console.error('   ✗ Test data not found.');
    return null;
  }
  
  const testText = fs.readFileSync(PATHS.tinyStoriesTest, 'utf8');
  const lines = testText.split('\n').filter(l => l.trim().length > 0);
  console.log(`   Evaluating on ${formatNum(lines.length)} test lines...`);
  
  // Evaluation
  const startTime = Date.now();
  let totalBits = 0;
  let totalGroupBits = 0;
  let totalProgramBits = 0;
  let totalChars = 0;
  let totalSurprise = 0;
  let programWins = 0;
  let groupWins = 0;
  
  // Adaptive universe: use groups * 2 instead of fixed 100K
  const effectiveUniverse = ADAPTIVE_UNIVERSE 
    ? Math.max(1000, (engine.store?.size || 1000) * 2)
    : (engine.config?.universeSize || 100000);
  
  if (ADAPTIVE_UNIVERSE) {
    console.log(`   Using adaptive universe: ${effectiveUniverse} (groups=${engine.store?.size})`);
  }
  
  for (const line of lines) {
    const result = engine.process(line, { learn: false });
    
    // Use integrated MDL cost (best of group and program)
    const lineBits = result.mdlCost || 0;
    const lineGroupBits = result.groupMdlCost || lineBits;
    const lineProgramBits = result.programCost || Infinity;
    
    totalBits += lineBits;
    totalGroupBits += lineGroupBits;
    totalProgramBits += Math.min(lineProgramBits, lineGroupBits);
    totalChars += line.length;
    totalSurprise += result.surprise || 0;
    
    // Track which method wins
    if (result.compressionMethod === 'program') {
      programWins++;
    } else {
      groupWins++;
    }
  }
  
  const duration = Date.now() - startTime;
  
  // Baselines
  const { gzipSync } = await import('node:zlib');
  const gzipped = gzipSync(testText);
  const gzipBpc = (gzipped.length * 8) / testText.length;
  
  // Shannon entropy
  const freqs = {};
  for (const char of testText) freqs[char] = (freqs[char] || 0) + 1;
  let entropy = 0;
  for (const char in freqs) {
    const p = freqs[char] / testText.length;
    entropy -= p * Math.log2(p);
  }

  // Calculate BPCs
  const bpc = totalBits / totalChars;
  const groupOnlyBpc = totalGroupBits / totalChars;
  const avgSurprise = totalSurprise / lines.length;
  const throughput = (lines.length / duration) * 1000;
  
  const results = {
    timestamp: new Date().toISOString(),
    testSize: { lines: lines.length, chars: testText.length },
    config: {
      adaptiveUniverse: ADAPTIVE_UNIVERSE,
      effectiveUniverse: engine.effectiveUniverseSize || effectiveUniverse,
      useCompressionMachine: true,
    },
    bsp: {
      bpc,                          // Best of group + program
      groupOnlyBpc,                 // Group-based only
      avgSurprise,
      throughput,
      groups: engine.store?.size || 0,
      durationMs: duration,
      vocabSize: engine.vocabTracker?.size || 0,
    },
    compression: {
      programWins,
      groupWins,
      programWinRate: (programWins / (programWins + groupWins) * 100).toFixed(1) + '%',
      machineStats: engine.compressionMachine?.getStats() || null,
    },
    baselines: {
      gzipBpc,
      shannonEntropy: entropy,
    },
    improvement: {
      vsGzip: ((gzipBpc - bpc) / gzipBpc * 100).toFixed(1) + '%',
      vsGroupOnly: ((groupOnlyBpc - bpc) / groupOnlyBpc * 100).toFixed(1) + '%',
    },
    verdict: bpc < gzipBpc ? 'PASS' : 'NEEDS_IMPROVEMENT',
  };
  
  // Save results
  const resultPath = path.join(PATHS.results, `benchmark_${Date.now()}.json`);
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(PATHS.results, 'latest.json'), JSON.stringify(results, null, 2));
  
  return results;
}

// ============================================================================
// STEP 5: Run BLiMP Evaluation
// ============================================================================

async function runBLiMP() {
  console.log('\n📊 Step 5: Running BLiMP evaluation...');
  
  // Check if BLiMP data exists
  const blimpFiles = fs.existsSync(PATHS.blimpData) 
    ? fs.readdirSync(PATHS.blimpData).filter(f => f.endsWith('.jsonl'))
    : [];
  
  if (blimpFiles.length === 0) {
    console.log('   ⚠ No BLiMP data found. Skipping grammatical evaluation.');
    return null;
  }
  
  // Load BSPEngine
  let BSPEngine;
  try {
    const module = await import('../src/core/index.mjs');
    BSPEngine = module.BSPEngine;
  } catch (error) {
    console.error(`   ✗ Failed to load BSPEngine: ${error.message}`);
    return null;
  }
  
  // Load trained model
  if (!fs.existsSync(PATHS.bspModel)) {
    console.log('   ⚠ No trained model. Skipping BLiMP.');
    return null;
  }
  
  const state = JSON.parse(fs.readFileSync(PATHS.bspModel, 'utf8'));
  const engine = BSPEngine.fromJSON(state);
  
  const results = {};
  
  for (const file of blimpFiles) {
    const taskName = file.replace('.jsonl', '');
    const filePath = path.join(PATHS.blimpData, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const examples = content.split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e !== null);
    
    let correct = 0;
    let total = 0;
    
    for (const ex of examples) {
      if (!ex.sentence_good || !ex.sentence_bad) continue;
      
      // Score both sentences using MDL cost (lower = better/more probable)
      const goodResult = engine.process(ex.sentence_good, { learn: false });
      const badResult = engine.process(ex.sentence_bad, { learn: false });
      
      // Lower MDL cost = more probable = better
      const goodCost = goodResult.mdlCost || Infinity;
      const badCost = badResult.mdlCost || Infinity;
      
      if (goodCost < badCost) correct++;
      total++;
    }
    
    const accuracy = total > 0 ? correct / total : 0;
    results[taskName] = { correct, total, accuracy };
    console.log(`   ${taskName}: ${(accuracy * 100).toFixed(1)}% (${correct}/${total})`);
  }
  
  return results;
}

// ============================================================================
// Print Report
// ============================================================================

function printReport(benchResults, blimpResults) {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                    BSP BENCHMARK REPORT                            ║');
  console.log('╠═══════════════════════════════════════════════════════════════════╣');
  
  if (benchResults) {
    console.log('║ LANGUAGE MODELING (TinyStories)                                   ║');
    console.log('╠───────────────────────────────────────────────────────────────────╣');
    console.log(`║   BSP Bits-per-Char:     ${benchResults.bsp.bpc.toFixed(4).padEnd(41)}║`);
    if (benchResults.bsp.groupOnlyBpc) {
      console.log(`║   Group-only BPC:        ${benchResults.bsp.groupOnlyBpc.toFixed(4).padEnd(41)}║`);
    }
    console.log(`║   Gzip Baseline:         ${benchResults.baselines.gzipBpc.toFixed(4).padEnd(41)}║`);
    console.log(`║   Shannon Entropy:       ${benchResults.baselines.shannonEntropy.toFixed(4).padEnd(41)}║`);
    console.log(`║   Throughput:            ${(benchResults.bsp.throughput.toFixed(0) + ' lines/sec').padEnd(41)}║`);
    console.log(`║   Groups Learned:        ${formatNum(benchResults.bsp.groups).padEnd(41)}║`);
    console.log(`║   Vocab Size:            ${formatNum(benchResults.bsp.vocabSize || 0).padEnd(41)}║`);
    
    // Compression machine stats
    if (benchResults.compression) {
      console.log('╠───────────────────────────────────────────────────────────────────╣');
      console.log('║ COMPRESSION MACHINE (DS-021)                                      ║');
      console.log(`║   Program Wins:          ${benchResults.compression.programWinRate.padEnd(41)}║`);
      if (benchResults.compression.machineStats) {
        const stats = benchResults.compression.machineStats;
        console.log(`║   Copy Ops Used:         ${formatNum(stats.copyOpsUsed || 0).padEnd(41)}║`);
        console.log(`║   Repeat Ops Used:       ${formatNum(stats.repeatOpsUsed || 0).padEnd(41)}║`);
        console.log(`║   Avg Savings/Encode:    ${(stats.avgSavingsPerEncode || 0).toFixed(1).padEnd(38)}bits ║`);
      }
    }
    
    // Improvements
    if (benchResults.improvement) {
      console.log('╠───────────────────────────────────────────────────────────────────╣');
      console.log(`║   Improvement vs Gzip:   ${benchResults.improvement.vsGzip.padEnd(41)}║`);
      console.log(`║   Improvement vs Groups: ${benchResults.improvement.vsGroupOnly.padEnd(41)}║`);
    }
    
    const isGood = benchResults.bsp.bpc < benchResults.baselines.gzipBpc;
    const verdict = isGood ? '✓ PASS (Better than Gzip)' : '⚠ NEEDS WORK (Worse than Gzip)';
    console.log('╠───────────────────────────────────────────────────────────────────╣');
    console.log(`║   Verdict:               ${verdict.padEnd(41)}║`);
  }
  
  if (blimpResults && Object.keys(blimpResults).length > 0) {
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║ GRAMMATICAL COMPETENCE (BLiMP)                                    ║');
    console.log('╠───────────────────────────────────────────────────────────────────╣');
    
    let totalCorrect = 0;
    let totalExamples = 0;
    
    for (const [task, result] of Object.entries(blimpResults)) {
      const pct = (result.accuracy * 100).toFixed(1) + '%';
      console.log(`║   ${task.padEnd(30)} ${pct.padEnd(30)}║`);
      totalCorrect += result.correct;
      totalExamples += result.total;
    }
    
    const avgAccuracy = totalExamples > 0 ? (totalCorrect / totalExamples * 100).toFixed(1) : '0.0';
    console.log('╠───────────────────────────────────────────────────────────────────╣');
    console.log(`║   Average:               ${(avgAccuracy + '%').padEnd(41)}║`);
  }
  
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
}

// ============================================================================
// Main
// ============================================================================

// Parse CLI args
const QUICK_MODE = process.argv.includes('--quick');
const FORCE_RETRAIN = process.argv.includes('--retrain');
const ADAPTIVE_UNIVERSE = process.argv.includes('--adaptive');

if (QUICK_MODE) {
  CONFIG.trainTokens = 50_000;
  CONFIG.testTokens = 10_000;
  CONFIG.logInterval = 500;
}

if (ADAPTIVE_UNIVERSE) {
  console.log('🔄 Using ADAPTIVE universe size (groups × 2)');
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        BSP Language Model Comparative Benchmark                    ║');
  console.log('║        (DS-008 Implementation)                                     ║');
  if (QUICK_MODE) {
    console.log('║        [QUICK MODE - reduced dataset]                              ║');
  }
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  
  // Ensure directories exist
  ensureDirs();
  
  // Force retrain if requested
  if (FORCE_RETRAIN && fs.existsSync(PATHS.bspModel)) {
    fs.unlinkSync(PATHS.bspModel);
    console.log('\n🗑️  Deleted existing model (--retrain)');
  }
  
  // Step 1: Download TinyStories
  const downloadOk = await downloadTinyStories();
  if (!downloadOk) {
    console.error('\n❌ Failed to prepare training data. Aborting.');
    process.exit(1);
  }
  
  // Step 2: Download BLiMP
  await downloadBLiMP();
  
  // Step 3: Train BSP
  const trainOk = await trainBSP();
  if (!trainOk) {
    console.error('\n❌ Failed to train model. Aborting.');
    process.exit(1);
  }
  
  // Step 4: Run Benchmark
  const benchResults = await runBenchmark();
  
  // Step 5: Run BLiMP
  const blimpResults = await runBLiMP();
  
  // Print final report
  printReport(benchResults, blimpResults);
  
  const totalTime = Date.now() - startTime;
  console.log(`\n✓ Total time: ${formatDuration(totalTime)}`);
  console.log(`✓ Results saved to: ${PATHS.results}`);
}

// Check for help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
BSP Language Model Comparative Benchmark

Usage:
  node evals/runLM_Comp.mjs [options]

Options:
  --quick      Quick mode (1000 train lines, faster)
  --retrain    Force retraining (delete cached model)
  --adaptive   Use adaptive universe size (groups × 2 instead of fixed 100K)
  --help, -h   Show this help

The script will:
1. Download TinyStories dataset (cached in evals/lm_comparative/data/)
2. Download BLiMP grammar tests (cached)
3. Train BSP model (cached in evals/lm_comparative/models/)
4. Run perplexity benchmark
5. Run BLiMP grammatical evaluation
6. Print report and save to evals/lm_comparative/results/
`);
  process.exit(0);
}

main().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
