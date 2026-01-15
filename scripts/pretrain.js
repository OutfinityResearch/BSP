#!/usr/bin/env node
/**
 * Pre-train BPCM model on large corpus
 * Creates a base model that all chat sessions will use
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const CORPUS_FILE = path.join(DATA_DIR, 'corpus.txt');
const PRETRAINED_PATH = path.join(DATA_DIR, 'pretrained.json');

// Add core modules to path
const { BPCMEngine } = require('../src/core/BPCMEngine');

async function pretrain(options = {}) {
  const {
    epochs = 10,
    batchSize = 100,
    saveEvery = 1000,
    maxSentences = null,  // null = use all
    rlPressure = 0.1,     // Low RL pressure during pretraining
  } = options;

  console.log('============================================================');
  console.log('BPCM Pre-training');
  console.log('============================================================\n');

  // Check for corpus
  if (!fs.existsSync(CORPUS_FILE)) {
    console.log('No corpus found. Downloading training data...\n');
    const { downloadCorpus } = require('./download-corpus');
    await downloadCorpus();
  }

  // Load corpus
  console.log('Loading corpus...');
  const corpusText = fs.readFileSync(CORPUS_FILE, 'utf8');
  let sentences = corpusText.split('\n').filter(s => s.trim().length > 10);
  
  if (maxSentences && sentences.length > maxSentences) {
    // Shuffle and take subset
    for (let i = sentences.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sentences[i], sentences[j]] = [sentences[j], sentences[i]];
    }
    sentences = sentences.slice(0, maxSentences);
  }
  
  console.log(`Loaded ${sentences.length} sentences`);
  console.log(`Total characters: ${corpusText.length.toLocaleString()}`);

  // Create engine with vocabulary enabled for interpretable tokens
  console.log('\nCreating engine...');
  const engine = new BPCMEngine({
    useVocab: true,  // IMPORTANT: Enable vocabulary for readable output
    tokenizer: {
      ngramSizes: [1, 2, 3],  // Unigrams, bigrams, trigrams
    },
    learner: {
      groupCreationThreshold: 0.3,
      minGroupSize: 2,
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

    // Shuffle sentences each epoch
    for (let i = sentences.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sentences[i], sentences[j]] = [sentences[j], sentences[i]];
    }

    // Process in batches
    for (let i = 0; i < sentences.length; i += batchSize) {
      const batch = sentences.slice(i, i + batchSize);
      
      for (const sentence of batch) {
        const result = engine.process(sentence, {
          reward: 0,  // No reward during pretraining
        });
        
        epochSurprise += result.surprise;
        epochCount++;
        totalProcessed++;
      }

      // Progress update every batch
      if (totalProcessed % (batchSize * 10) === 0) {
        const stats = engine.getStats();
        const progress = ((i / sentences.length) * 100).toFixed(1);
        process.stdout.write(`\r  Epoch ${epoch}/${epochs}: ${progress}% | Groups: ${stats.groupCount} | Edges: ${stats.edgeCount}`);
      }

      // Periodic consolidation
      if (totalProcessed % 500 === 0) {
        engine.consolidate(20);
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
    } else if (args[i] === '--max' && args[i + 1]) {
      options.maxSentences = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--rho' && args[i + 1]) {
      options.rlPressure = parseFloat(args[i + 1]);
      i++;
    }
  }

  pretrain(options).catch(err => {
    console.error('Pre-training failed:', err);
    process.exit(1);
  });
}

module.exports = { pretrain };
