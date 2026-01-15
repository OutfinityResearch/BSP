# DS-008: Benchmarks and GPT-2 Comparison Plan

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

This document defines the benchmarking plan for BSP, including training/evaluation datasets, comparison metrics against GPT-2, and the testing methodology.

---

## 2. Evaluation Objectives

### 2.1 Primary Metrics

1. **Compression** (Language Modeling): How well the system predicts/compresses text
2. **Deduction** (Long-range): Ability to make long-range inferences
3. **Adaptation** (RL): Speed of adapting to feedback
4. **Efficiency** (Resources): CPU time, memory, latency

### 2.2 Comparison with GPT-2

| Model | Parameters | Context | Training |
|-------|-----------|---------|-----------|
| GPT-2 Small | 124M | 1024 | ~40GB text |
| GPT-2 Medium | 355M | 1024 | ~40GB text |
| BSP (MVP) | ~100K groups | Unlimited | Online |

---

## 3. Datasets

### 3.1 For Training

#### PTB (Penn Treebank)
- **Purpose**: Initial training and quick validation
- **Size**: ~929K train tokens, ~73K valid tokens, ~82K test tokens
- **Source**: https://github.com/pytorch/examples/tree/main/word_language_model/data/ptb
- **Preprocessing**: Lower-case, limited vocabulary

```typescript
interface PTBConfig {
  trainPath: string;
  validPath: string;
  testPath: string;
  vocabSize: number;  // Typically 10K
}
```

#### WikiText-2
- **Purpose**: Standard benchmark for perplexity
- **Size**: ~2M train tokens, ~217K valid tokens, ~245K test tokens
- **Source**: https://huggingface.co/datasets/wikitext
- **Preprocessing**: Standard tokenization

#### TinyStories (Subset)
- **Purpose**: Training on simple and coherent data
- **Size**: Select 1M-10M tokens
- **Source**: https://huggingface.co/datasets/roneneldan/TinyStories
- **Preprocessing**: Filtering and deduplication

### 3.2 For Evaluation

#### LAMBADA
- **Purpose**: Test long-range dependencies / deduction
- **Size**: 10,022 passages (dev + test)
- **Source**: https://huggingface.co/datasets/cimec/lambada
- **Metric**: Accuracy on the last word

#### Custom RL Tasks
- **Purpose**: Evaluate adaptation with feedback
- **Format**: Dialog tasks with explicit reward

### 3.3 Synthetic Grammar (DS-019)
- **Purpose**: Architectural validation (transitive closures, long-range dependencies)
- **Generation**: Deterministic/probabilistic formal grammars
- **Task**: Predict the final state from an intermediate state
- **Details**: See [DS-019: Synthetic Evaluation System](./DS-019-synthetic-evaluation.md)

---

## 4. GPT-2 Reference Results

### 4.1 Perplexity

| Model | WikiText-2 | PTB |
|-------|------------|-----|
| GPT-2 Small | 37.50 | 85.70 |
| GPT-2 Medium | 29.41 | 65.85 |
| GPT-2 Large | 25.55 | - |

### 4.2 LAMBADA Accuracy

| Model | Accuracy |
|-------|----------|
| GPT-2 Small | 45.99% |
| GPT-2 Medium | 55.48% |
| GPT-2 Large | 60.12% |

---

## 5. Equivalent BSP Metrics

### 5.1 Surprise Metrics

We define metrics that approximate perplexity:

```typescript
interface BSPMetrics {
  // Surprise rate: proportion of unexplained bits
  surpriseRate: number;  // |surprise| / |input|
  
  // Hallucination rate: proportion of extra bits
  hallucinationRate: number;  // |hallucination| / |reconstruction|
  
  // Cross-entropy proxy (if we have probabilities)
  crossEntropyProxy: number;
  
  // Bits per token (for direct comparison)
  bitsPerToken: number;
  
  // Compression ratio
  compressionRatio: number;  // |input| / |activeGroups|
}
```

### 5.2 Mapare la Perplexity

```typescript
// Approximation: perplexity ≈ 2^(bits_per_token)
function approximatePerplexity(metrics: BSPMetrics): number {
  // surpriseRate → unexplained bits per bit
  // Assume unexplained bits are uniformly distributed
  const bitsPerUnexplained = 10;  // approx log2(vocab_size)
  
  const avgBitsPerToken = 
    metrics.surpriseRate * bitsPerUnexplained +
    (1 - metrics.surpriseRate) * 0;  // explained bits = 0 surprise
  
  return Math.pow(2, avgBitsPerToken);
}
```

### 5.3 Deduction Accuracy

For LAMBADA-style tasks:

```typescript
interface DeductionMetrics {
  // Accuracy: how often the last token/concept is in the top-K predictions
  top1Accuracy: number;
  top5Accuracy: number;
  top10Accuracy: number;
  
  // Mean Reciprocal Rank
  mrr: number;
}
```

---

## 6. Evaluation Pipeline

### 6.1 Structure

```typescript
class EvaluationPipeline {
  private engine: BSPEngine;
  private datasets: Map<string, Dataset>;
  
  async evaluate(datasetName: string): Promise<EvaluationResult> {
    const dataset = this.datasets.get(datasetName);
    if (!dataset) throw new Error(`Dataset not found: ${datasetName}`);
    
    switch (dataset.type) {
      case 'language_modeling':
        return this.evaluateLanguageModeling(dataset);
      case 'cloze':
        return this.evaluateCloze(dataset);
      case 'rl_task':
        return this.evaluateRLTask(dataset);
      default:
        throw new Error(`Unknown dataset type: ${dataset.type}`);
    }
  }
  
  private async evaluateLanguageModeling(
    dataset: Dataset
  ): Promise<LanguageModelingResult> {
    const results: BSPMetrics[] = [];
    
    for await (const batch of dataset.iterate(BATCH_SIZE)) {
      // Encode
      const encoded = batch.map(text => this.engine.encode(text));
      
      // Process and collect metrics
      for (const x of encoded) {
        const activeGroups = this.engine.activate(x);
        const reconstruction = this.engine.reconstruct(activeGroups);
        const {surprise, hallucination} = this.engine.computeSurprise(x, reconstruction);
        
        results.push({
          surpriseRate: surprise.size / x.size,
          hallucinationRate: hallucination.size / reconstruction.size,
          compressionRatio: x.size / activeGroups.length,
          crossEntropyProxy: 0,  // Computed separately if we have probabilities
          bitsPerToken: 0,
        });
      }
    }
    
    return {
      dataset: dataset.name,
      sampleCount: results.length,
      avgSurpriseRate: mean(results.map(r => r.surpriseRate)),
      avgHallucinationRate: mean(results.map(r => r.hallucinationRate)),
      avgCompressionRatio: mean(results.map(r => r.compressionRatio)),
      approximatePerplexity: approximatePerplexity(aggregate(results)),
    };
  }
  
  private async evaluateCloze(dataset: Dataset): Promise<ClozeResult> {
    let correct = 0;
    let total = 0;
    const ranks: number[] = [];
    
    for await (const example of dataset.iterate(1)) {
      const {context, target} = example;
      
      // Encode context
      const contextEncoded = this.engine.encode(context);
      const contextGroups = this.engine.activate(contextEncoded);
      
      // Predict next
      const predictions = this.engine.predictNext(contextGroups, TOP_K);
      
      // Check if target is in predictions
      const targetEncoded = this.engine.encode(target);
      const targetGroups = this.engine.activate(targetEncoded);
      
      const rank = this.findRank(predictions, targetGroups);
      
      if (rank === 1) correct++;
      if (rank > 0) ranks.push(rank);
      total++;
    }
    
    return {
      dataset: dataset.name,
      sampleCount: total,
      top1Accuracy: correct / total,
      mrr: ranks.length > 0 ? mean(ranks.map(r => 1/r)) : 0,
    };
  }
}
```

### 6.2 Training Pipeline

```typescript
class TrainingPipeline {
  private engine: BSPEngine;
  
  async train(
    dataset: Dataset,
    config: TrainingConfig
  ): Promise<TrainingResult> {
    const metrics: TrainingMetrics[] = [];
    let step = 0;
    
    for (let epoch = 0; epoch < config.epochs; epoch++) {
      for await (const batch of dataset.iterate(config.batchSize)) {
        for (const text of batch) {
          // Encode
          const x = this.engine.encode(text);
          
          // Get context from previous tokens (window)
          const context = this.getContext(step);
          
          // Train step
          const result = this.engine.trainStep(x, context, null);
          
          // Log metrics periodically
          if (step % config.logInterval === 0) {
            metrics.push({
              step,
              epoch,
              surprise: result.surprise,
              groupCount: this.engine.store.size,
              deductionCount: this.engine.graph.edgeCount,
            });
          }
          
          // Evaluate periodically
          if (step % config.evalInterval === 0) {
            const evalResult = await this.evaluate(config.validDataset);
            console.log(`Step ${step}: ${JSON.stringify(evalResult)}`);
          }
          
          step++;
        }
      }
      
      // End of epoch consolidation
      await this.engine.consolidate(config.consolidateEpisodes);
    }
    
    return {
      totalSteps: step,
      finalMetrics: metrics[metrics.length - 1],
      history: metrics,
    };
  }
}
```

---

## 7. Experimental Setup

### 7.1 Baseline Experiments

#### Experiment 1: Convergence on PTB
- **Objective**: Verify that BSP learns and converges
- **Setup**: 
  - Train on PTB train
  - Evaluate on PTB valid every 1K steps
- **Metrics**: Surprise rate, group count, deduction count
- **Estimated duration**: 1-2 hours on CPU

#### Experiment 2: WikiText-2 Comparison
- **Objective**: Direct comparison with GPT-2 on perplexity
- **Setup**:
  - Train on WikiText-2 train
  - Eval on WikiText-2 test
- **Metrics**: Surprise rate → approximate perplexity
- **Target**: Perplexity proxy < 100 (realistic for MVP)

#### Experiment 3: LAMBADA Deduction
- **Objective**: Test deduction capability
- **Setup**:
  - Train on WikiText-2 or TinyStories
  - Eval on LAMBADA test
- **Metrics**: Top-1, Top-5, Top-10 accuracy, MRR
- **Target**: Top-10 accuracy > 20%

#### Experiment 4: RL Adaptation
- **Objective**: Verify adaptation with feedback
- **Setup**:
  - Pre-train on text
  - Fine-tune with RL on dialog tasks
  - Sweep ρ: 0, 0.3, 0.7, 1.0
- **Metrics**: Mean reward, stability (perplexity drift)

### 7.2 Ablation Studies

#### Ablation 1: Number of Groups (K)
- K ∈ {4, 8, 16, 32, 64}
- Measure: surprise vs K, compute time vs K

#### Ablation 2: Deduction Depth
- Depth ∈ {1, 2, 3, 4, 5}
- Measure: LAMBADA accuracy vs depth, time vs depth

#### Ablation 3: RL Pressure
- ρ ∈ {0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0}
- Measure: reward vs ρ, perplexity drift vs ρ

---

## 8. Data Loaders

### 8.1 Generic Loader

```typescript
interface Dataset {
  name: string;
  type: 'language_modeling' | 'cloze' | 'rl_task';
  
  iterate(batchSize: number): AsyncGenerator<string[]>;
  size(): Promise<number>;
}

class PTBDataset implements Dataset {
  name = 'ptb';
  type = 'language_modeling' as const;
  
  private path: string;
  private split: 'train' | 'valid' | 'test';
  
  constructor(basePath: string, split: 'train' | 'valid' | 'test') {
    this.path = `${basePath}/${split}.txt`;
    this.split = split;
  }
  
  async *iterate(batchSize: number): AsyncGenerator<string[]> {
    const content = await fs.readFile(this.path, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    
    for (let i = 0; i < lines.length; i += batchSize) {
      yield lines.slice(i, i + batchSize);
    }
  }
  
  async size(): Promise<number> {
    const content = await fs.readFile(this.path, 'utf8');
    return content.split('\n').filter(l => l.trim()).length;
  }
}

class WikiText2Dataset implements Dataset {
  // Similar, but with handling for the specific format
}

class LAMBADADataset implements Dataset {
  name = 'lambada';
  type = 'cloze' as const;
  
  async *iterate(batchSize: number): AsyncGenerator<{context: string, target: string}[]> {
    // Load and parse LAMBADA format
    // Each example: context + last word
  }
}
```

### 8.2 Download Script

```typescript
async function downloadDatasets(targetDir: string): Promise<void> {
  const datasets = [
    {
      name: 'ptb',
      url: 'https://raw.githubusercontent.com/pytorch/examples/main/word_language_model/data/ptb/',
      files: ['train.txt', 'valid.txt', 'test.txt'],
    },
    // WikiText-2, LAMBADA etc.
  ];
  
  for (const dataset of datasets) {
    const dir = `${targetDir}/${dataset.name}`;
    await fs.mkdir(dir, { recursive: true });
    
    for (const file of dataset.files) {
      const response = await fetch(`${dataset.url}${file}`);
      const content = await response.text();
      await fs.writeFile(`${dir}/${file}`, content);
    }
    
    console.log(`Downloaded ${dataset.name}`);
  }
}
```

---

## 9. Reporting

### 9.1 Metrics Dashboard

```typescript
interface BenchmarkReport {
  timestamp: number;
  config: SystemConfig;
  
  // Core metrics
  datasets: {
    [name: string]: {
      surpriseRate: number;
      approximatePerplexity: number;
      accuracy?: number;  // For cloze
    };
  };
  
  // Comparison with GPT-2
  comparison: {
    wikitext2Perplexity: {
      bsp: number;
      gpt2Medium: 29.41;
      ratio: number;
    };
    lambadaAccuracy: {
      bsp: number;
      gpt2Medium: 0.5548;
      ratio: number;
    };
  };
  
  // Resource usage
  resources: {
    trainingTimeMs: number;
    inferenceLatencyMs: number;
    memoryMB: number;
    groupCount: number;
  };
}

function generateReport(results: EvaluationResult[]): string {
  const markdown = `
# BSP Benchmark Report
Generated: ${new Date().toISOString()}

## Language Modeling (WikiText-2)

| Metric | BSP | GPT-2 Medium | Ratio |
|--------|------|--------------|-------|
| Perplexity (approx) | ${results.wikitext2.perplexity} | 29.41 | ${(results.wikitext2.perplexity / 29.41).toFixed(2)}x |
| Surprise Rate | ${results.wikitext2.surpriseRate} | - | - |

## Deduction (LAMBADA)

| Metric | BSP | GPT-2 Medium | Ratio |
|--------|------|--------------|-------|
| Top-1 Accuracy | ${results.lambada.top1} | 55.48% | ${(results.lambada.top1 / 0.5548).toFixed(2)}x |
| Top-10 Accuracy | ${results.lambada.top10} | - | - |

## Resources

- Training time: ${results.resources.trainingTimeMs}ms
- Inference latency: ${results.resources.inferenceLatencyMs}ms
- Memory: ${results.resources.memoryMB}MB
- Groups: ${results.resources.groupCount}
`;
  
  return markdown;
}
```

---

## 10. Implementation Plan

### Phase 1: Dataset Setup (2-3 days)
1. [ ] Download script for PTB, WikiText-2, LAMBADA
2. [ ] Data loaders implemented
3. [ ] Preprocessing and tokenization

### Phase 2: Evaluation Pipeline (3-4 days)
1. [ ] Metrics computations
2. [ ] Language modeling evaluation
3. [ ] Cloze evaluation (LAMBADA-style)
4. [ ] Reporting

### Phase 3: Baseline Experiments (5-7 days)
1. [ ] Experiment 1: PTB convergence
2. [ ] Experiment 2: WikiText-2 comparison
3. [ ] Experiment 3: LAMBADA deduction
4. [ ] Document results

### Phase 4: RL Experiments (3-4 days)
1. [ ] RL task definition
2. [ ] Experiment 4: RL adaptation
3. [ ] ρ sweep analysis

### Phase 5: Ablations and Optimizations (5-7 days)
1. [ ] All ablation studies
2. [ ] Identify bottlenecks
3. [ ] Optimize critical paths
4. [ ] Final report

---

## 11. File Structure

```
evals/
├── gpt2/                  # Comparative benchmarks
│   ├── data/
│   │   ├── ptb/
│   │   ├── wikitext2/
│   │   └── lambada/
│   ├── benchmark_comparative.mjs
│   └── README.md
│
└── synthetic/             # Architectural validation (DS-019)
    ├── grammar.mjs        # Grammar definition
    ├── generate.mjs       # Dataset generator
    ├── evaluate.mjs       # Evaluation runner
    └── README.md
```
