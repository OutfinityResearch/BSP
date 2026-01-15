# DS-008: Benchmarks and GPT-2 Comparison Plan

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

Acest document definește planul de benchmarking pentru BSP, incluzând seturi de date pentru antrenare/evaluare, metrici de comparație cu GPT-2, și metodologia de testare.

---

## 2. Obiective de Evaluare

### 2.1 Metrici Principale

1. **Compresie** (Language Modeling): Cât de bine prezice/comprimă textul
2. **Deducție** (Long-range): Capacitatea de a face inferențe pe distanțe lungi
3. **Adaptare** (RL): Viteza de adaptare la feedback
4. **Eficiență** (Resources): CPU time, memorie, latență

### 2.2 Comparație cu GPT-2

| Model | Parametri | Context | Antrenare |
|-------|-----------|---------|-----------|
| GPT-2 Small | 124M | 1024 | ~40GB text |
| GPT-2 Medium | 355M | 1024 | ~40GB text |
| BSP (MVP) | ~100K groups | Illimitat | Online |

---

## 3. Seturi de Date

### 3.1 Pentru Antrenare

#### PTB (Penn Treebank)
- **Scop**: Antrenare inițială și validare rapidă
- **Dimensiune**: ~929K tokens train, ~73K valid, ~82K test
- **Sursa**: https://github.com/pytorch/examples/tree/main/word_language_model/data/ptb
- **Preprocesare**: Lower-case, vocabulary limitat

```typescript
interface PTBConfig {
  trainPath: string;
  validPath: string;
  testPath: string;
  vocabSize: number;  // Typically 10K
}
```

#### WikiText-2
- **Scop**: Benchmark standard pentru perplexity
- **Dimensiune**: ~2M tokens train, ~217K valid, ~245K test
- **Sursa**: https://huggingface.co/datasets/wikitext
- **Preprocesare**: Tokenizare standard

#### TinyStories (Subset)
- **Scop**: Antrenare cu date simple și coerente
- **Dimensiune**: Selectăm 1M-10M tokens
- **Sursa**: https://huggingface.co/datasets/roneneldan/TinyStories
- **Preprocesare**: Filtrare și deduplicare

### 3.2 Pentru Evaluare

#### LAMBADA
- **Scop**: Testare dependențe lungi / deducție
- **Dimensiune**: 10,022 pasaje (dev + test)
- **Sursa**: https://huggingface.co/datasets/cimec/lambada
- **Metric**: Accuracy pe ultimul cuvânt

#### Custom RL Tasks
- **Scop**: Evaluare adaptare cu feedback
- **Format**: Dialog tasks cu reward explicit

### 3.3 Synthetic Grammar (DS-019)
- **Scop**: Validare arhitecturală (transitive closures, long-range dependencies)
- **Generare**: Gramatici formale deterministe/probabiliste
- **Task**: Predicția stării finale dintr-o stare intermediară
- **Detalii**: Vezi [DS-019: Synthetic Evaluation System](./DS-019-synthetic-evaluation.md)

---

## 4. Rezultate GPT-2 de Referință

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

## 5. Metrici BSP Echivalente

### 5.1 Surprise Metrics

Definim metrici care aproximează perplexity:

```typescript
interface BSPMetrics {
  // Surprise rate: proporția de biți neexplicați
  surpriseRate: number;  // |surprise| / |input|
  
  // Hallucination rate: proporția de biți excesivi
  hallucinationRate: number;  // |hallucination| / |reconstruction|
  
  // Cross-entropy proxy (dacă avem probabilități)
  crossEntropyProxy: number;
  
  // Bits per token (pentru comparație directă)
  bitsPerToken: number;
  
  // Compression ratio
  compressionRatio: number;  // |input| / |activeGroups|
}
```

### 5.2 Mapare la Perplexity

```typescript
// Aproximare: perplexity ≈ 2^(bits_per_token)
function approximatePerplexity(metrics: BSPMetrics): number {
  // surpriseRate → bits neexplicate per bit
  // Presupunem că biții neexplicați au distribuție uniformă
  const bitsPerUnexplained = 10;  // log2(vocab_size) aproximativ
  
  const avgBitsPerToken = 
    metrics.surpriseRate * bitsPerUnexplained +
    (1 - metrics.surpriseRate) * 0;  // explained bits = 0 surprise
  
  return Math.pow(2, avgBitsPerToken);
}
```

### 5.3 Deduction Accuracy

Pentru LAMBADA-style tasks:

```typescript
interface DeductionMetrics {
  // Accuracy: cât de des ultimul token/concept e în top-K predicții
  top1Accuracy: number;
  top5Accuracy: number;
  top10Accuracy: number;
  
  // Mean Reciprocal Rank
  mrr: number;
}
```

---

## 6. Pipeline de Evaluare

### 6.1 Structura

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
      
      // Process și colectează metrici
      for (const x of encoded) {
        const activeGroups = this.engine.activate(x);
        const reconstruction = this.engine.reconstruct(activeGroups);
        const {surprise, hallucination} = this.engine.computeSurprise(x, reconstruction);
        
        results.push({
          surpriseRate: surprise.size / x.size,
          hallucinationRate: hallucination.size / reconstruction.size,
          compressionRatio: x.size / activeGroups.length,
          crossEntropyProxy: 0,  // Calculat separat dacă avem probabilități
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

### 7.1 Experimente de Bază

#### Experiment 1: Convergență pe PTB
- **Obiectiv**: Verifică că BSP învață și converge
- **Setup**: 
  - Train pe PTB train
  - Evaluare pe PTB valid la fiecare 1K steps
- **Metrici**: Surprise rate, group count, deduction count
- **Durată estimată**: 1-2 ore pe CPU

#### Experiment 2: Comparație WikiText-2
- **Obiectiv**: Comparație directă cu GPT-2 pe perplexity
- **Setup**:
  - Train pe WikiText-2 train
  - Eval pe WikiText-2 test
- **Metrici**: Surprise rate → aproximare perplexity
- **Target**: Perplexity proxy < 100 (realist pentru MVP)

#### Experiment 3: LAMBADA Deduction
- **Obiectiv**: Testare capacitate de deducție
- **Setup**:
  - Train pe WikiText-2 sau TinyStories
  - Eval pe LAMBADA test
- **Metrici**: Top-1, Top-5, Top-10 accuracy, MRR
- **Target**: Top-10 accuracy > 20%

#### Experiment 4: RL Adaptation
- **Obiectiv**: Verifică adaptarea cu feedback
- **Setup**:
  - Pre-train pe text
  - Fine-tune cu RL pe dialog tasks
  - Variază ρ: 0, 0.3, 0.7, 1.0
- **Metrici**: Reward mediu, stability (perplexity drift)

### 7.2 Ablation Studies

#### Ablation 1: Număr de grupuri (K)
- K ∈ {4, 8, 16, 32, 64}
- Măsurăm: surprise vs K, compute time vs K

#### Ablation 2: Adâncime deducție
- Depth ∈ {1, 2, 3, 4, 5}
- Măsurăm: accuracy LAMBADA vs depth, time vs depth

#### Ablation 3: RL Pressure
- ρ ∈ {0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0}
- Măsurăm: reward vs ρ, perplexity drift vs ρ

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
  // Similar, dar cu handling pentru format specific
}

class LAMBADADataset implements Dataset {
  name = 'lambada';
  type = 'cloze' as const;
  
  async *iterate(batchSize: number): AsyncGenerator<{context: string, target: string}[]> {
    // Load și parsează LAMBADA format
    // Fiecare exemplu: context + ultimul cuvânt
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
      accuracy?: number;  // Pentru cloze
    };
  };
  
  // Comparison cu GPT-2
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

## 10. Plan de Implementare

### Faza 1: Dataset Setup (2-3 zile)
1. [ ] Download script pentru PTB, WikiText-2, LAMBADA
2. [ ] Data loaders implementați
3. [ ] Preprocesare și tokenizare

### Faza 2: Evaluation Pipeline (3-4 zile)
1. [ ] Metrics computations
2. [ ] Language modeling evaluation
3. [ ] Cloze evaluation (LAMBADA-style)
4. [ ] Reporting

### Faza 3: Baseline Experiments (5-7 zile)
1. [ ] Experiment 1: PTB convergence
2. [ ] Experiment 2: WikiText-2 comparison
3. [ ] Experiment 3: LAMBADA deduction
4. [ ] Document results

### Faza 4: RL Experiments (3-4 zile)
1. [ ] RL task definition
2. [ ] Experiment 4: RL adaptation
3. [ ] ρ sweep analysis

### Faza 5: Ablations și Optimizări (5-7 zile)
1. [ ] All ablation studies
2. [ ] Identify bottlenecks
3. [ ] Optimize critical paths
4. [ ] Final report

---

## 11. Structura Fișiere

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
