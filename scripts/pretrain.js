#!/usr/bin/env node
/**
 * Pre-train BSP model on large corpus
 * Creates a base model that all chat sessions will use
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '../data');
const CORPUS_FILE = path.join(DATA_DIR, 'corpus.txt');
const PRETRAINED_PATH = path.join(DATA_DIR, 'pretrained.json');

// Add core modules to path
const { BSPEngine } = require('../src/core/BSPEngine');

function fnv1a64(str) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash;
}

async function reservoirSampleSentences(filePath, sampleSize, options) {
  const {
    minLen = 10,
    maxLen = 500,
    dedup = false,
  } = options;

  const samples = [];
  const seen = dedup ? new Set() : null;
  let seenCount = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const s = (line || '').trim();
    if (s.length <= minLen || s.length > maxLen) continue;

    if (seen) {
      const h = fnv1a64(s);
      if (seen.has(h)) continue;
      seen.add(h);
    }

    seenCount++;
    if (samples.length < sampleSize) {
      samples.push(s);
    } else {
      const j = Math.floor(Math.random() * seenCount);
      if (j < sampleSize) samples[j] = s;
    }
  }

  return samples;
}

async function* iterateCorpus(filePath, options) {
  const {
    minLen = 10,
    maxLen = 500,
    dedup = false,
  } = options;

  const seen = dedup ? new Set() : null;
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const s = (line || '').trim();
    if (s.length <= minLen || s.length > maxLen) continue;
    if (seen) {
      const h = fnv1a64(s);
      if (seen.has(h)) continue;
      seen.add(h);
    }
    yield s;
  }
}

async function pretrain(options = {}) {
  const {
    epochs = 10,
    batchSize = 100,
    saveEvery = 1000,
    maxSentences = null,  // null = use all
    rlPressure = 0.1,     // Low RL pressure during pretraining
    minLen = 10,
    maxLen = 500,
    dedup = false,
    shuffle = true,
    subsample = true,
    subsampleT = 1e-3,
  } = options;

  console.log('============================================================');
  console.log('BSP Pre-training');
  console.log('============================================================\n');

  // Check for corpus
  if (!fs.existsSync(CORPUS_FILE)) {
    console.log('No corpus found. Downloading training data...\n');
    const { downloadCorpus } = require('./download-corpus');
    await downloadCorpus();
  }

  let sentences = null;
  if (maxSentences) {
    console.log('Sampling corpus...');
    sentences = await reservoirSampleSentences(CORPUS_FILE, maxSentences, { minLen, maxLen, dedup });
    console.log(`Sampled ${sentences.length} sentences`);
  } else {
    console.log('Streaming corpus (no in-memory load)...');
    console.log(`Filters: minLen>${minLen}, maxLen<=${maxLen}, dedup=${dedup}`);
    if (!shuffle) {
      // ok
    } else {
      console.log('Note: shuffle is disabled when streaming the full corpus.');
    }
  }

  // Create engine with vocabulary enabled for interpretable tokens
  console.log('\nCreating engine...');
  const engine = new BSPEngine({
    useVocab: true,  // IMPORTANT: Enable vocabulary for readable output
    tokenizer: {
      ngramSizes: [1, 2, 3],  // Unigrams, bigrams, trigrams
      subsampleHotTokens: subsample,
      subsampleT: subsampleT,
    },
    learner: {
      // More aggressive group creation during pretraining helps bootstrap concepts faster.
      newGroupThreshold: 0.2,
      minGroupSize: 2,
    },
    // Prevent candidate explosion on very frequent identities.
    index: {
      maxGroupsPerIdentity: 256,
      indexEvictPolicy: 'lowestUsage',
    },
    // Improve early decoding quality when transition counts are sparse.
    sequenceModel: {
      smoothing: 'addAlpha',
      smoothingAlpha: 0.1,
    },
    rlPressure: rlPressure,
  });

  // Training stats
  let totalProcessed = 0;
  let lastSave = 0;
  const startTime = Date.now();

  console.log(`\nTraining with ${epochs} epochs...`);
  console.log(`RL Pressure: ${rlPressure}`);
  console.log('-'.repeat(60));

  for (let epoch = 1; epoch <= epochs; epoch++) {
    const epochStart = Date.now();
    let epochSurprise = 0;
    let epochCount = 0;

    if (sentences) {
      if (shuffle) {
        for (let i = sentences.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [sentences[i], sentences[j]] = [sentences[j], sentences[i]];
        }
      }

      for (let i = 0; i < sentences.length; i += batchSize) {
        const batch = sentences.slice(i, i + batchSize);

        for (const sentence of batch) {
          const result = engine.process(sentence, { reward: 0 });
          epochSurprise += result.surprise;
          epochCount++;
          totalProcessed++;
        }

        if (totalProcessed % (batchSize * 10) === 0) {
          const stats = engine.getStats();
          const progress = ((i / sentences.length) * 100).toFixed(1);
          process.stdout.write(`\r  Epoch ${epoch}/${epochs}: ${progress}% | Groups: ${stats.groupCount} | Edges: ${stats.edgeCount}`);
        }

        if (totalProcessed % 500 === 0) {
          engine.consolidate(20);
        }
      }
    } else {
      let batch = [];
      let batchIndex = 0;

      for await (const sentence of iterateCorpus(CORPUS_FILE, { minLen, maxLen, dedup })) {
        batch.push(sentence);
        if (batch.length < batchSize) continue;

        for (const s of batch) {
          const result = engine.process(s, { reward: 0 });
          epochSurprise += result.surprise;
          epochCount++;
          totalProcessed++;
        }
        batch = [];
        batchIndex++;

        if (batchIndex % 10 === 0) {
          const stats = engine.getStats();
          process.stdout.write(`\r  Epoch ${epoch}/${epochs}: processed=${epochCount.toLocaleString()} | Groups: ${stats.groupCount} | Edges: ${stats.edgeCount}`);
        }

        if (totalProcessed % 500 === 0) {
          engine.consolidate(20);
        }
      }

      if (batch.length > 0) {
        for (const s of batch) {
          const result = engine.process(s, { reward: 0 });
          epochSurprise += result.surprise;
          epochCount++;
          totalProcessed++;
        }
      }
    }

    // Epoch complete
    const epochTime = ((Date.now() - epochStart) / 1000).toFixed(1);
    const avgSurprise = (epochSurprise / epochCount).toFixed(2);
    const stats = engine.getStats();
    
    console.log(`\r  Epoch ${epoch}/${epochs}: AvgSurprise=${avgSurprise} | Groups=${stats.groupCount} | Edges=${stats.edgeCount} | Time=${epochTime}s`);

    // Save checkpoint
    if (epoch % 2 === 0 || epoch === epochs) {
      const checkpointPath = path.join(DATA_DIR, `checkpoint_epoch${epoch}.json`);
      fs.writeFileSync(checkpointPath, JSON.stringify(engine.toJSON()));
      console.log(`    Checkpoint saved: ${checkpointPath}`);
    }

    // Run consolidation at end of each epoch
    console.log('    Consolidating...');
    engine.consolidate(100);
  }

  // Final consolidation
  console.log('\nFinal consolidation...');
  engine.consolidate(200);

  // Save pretrained model
  console.log('Saving pretrained model...');
  const modelData = engine.toJSON();
  fs.writeFileSync(PRETRAINED_PATH, JSON.stringify(modelData));

  // Stats
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const fileSize = fs.statSync(PRETRAINED_PATH).size;
  const finalStats = engine.getStats();

  console.log('\n============================================================');
  console.log('Pre-training Complete!');
  console.log('============================================================');
  console.log(`  Training time: ${totalTime}s`);
  console.log(`  Sentences processed: ${totalProcessed.toLocaleString()}`);
  console.log(`  Groups learned: ${finalStats.groupCount}`);
  console.log(`  Deduction edges: ${finalStats.edgeCount}`);
  console.log(`  Model size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Saved to: ${PRETRAINED_PATH}`);
  console.log('============================================================\n');

  // Show sample groups
  console.log('Sample learned groups:');
  const topGroups = engine.getTopGroups(10);
  for (let i = 0; i < topGroups.length; i++) {
    console.log(`  ${i + 1}. ${topGroups[i].description}`);
  }
  console.log('');

  return {
    groupCount: finalStats.groupCount,
    edgeCount: finalStats.edgeCount,
    trainTime: totalTime,
    modelSize: fileSize,
  };
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--epochs' && args[i + 1]) {
      options.epochs = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--batch' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--max' && args[i + 1]) {
      options.maxSentences = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--rho' && args[i + 1]) {
      options.rlPressure = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--minLen' && args[i + 1]) {
      options.minLen = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--maxLen' && args[i + 1]) {
      options.maxLen = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--dedup') {
      options.dedup = true;
    } else if (args[i] === '--no-shuffle') {
      options.shuffle = false;
    } else if (args[i] === '--subsample') {
      options.subsample = true;
    } else if (args[i] === '--no-subsample') {
      options.subsample = false;
    } else if (args[i] === '--subsampleT' && args[i + 1]) {
      options.subsampleT = parseFloat(args[i + 1]);
      i++;
    }
  }

  pretrain(options).catch(err => {
    console.error('Pre-training failed:', err);
    process.exit(1);
  });
}

module.exports = { pretrain };
