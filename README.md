# BPCM - Bitset Predictive Coding Memory

> CPU-friendly continuous learning without transformers

BPCM is an experimental approach to building LLM-like capabilities using **bitsets** as representations and a **compression/surprise minimization** objective. It runs entirely on CPU without large matrix operations.

**Zero external dependencies** - Pure Node.js implementation (~3,800 lines of code).

## Core Concepts

- **Essence**: Groups become stable "identity of meaning" through predictive co-occurrence
- **Grouping**: Identities stay together if they appear together predictably
- **Deduction**: Links between groups from temporal co-occurrence + conditioning
- **Continuous Learning**: Permanent RL from every interaction

## Key Differentiators

| Aspect | Traditional LLM | BPCM |
|--------|-----------------|------|
| Representations | Float embeddings + attention | Bitsets + discrete sets |
| Memory | Network weights | Explicit groups + counters |
| Inference | Matrix forward pass | Set intersections + popcount |
| Learning | Batch training offline | Online, incremental |
| Interpretability | Opaque | Groups = explicit identity lists |

## Documentation

Open `docs/index.html` in a browser for the full documentation portal.

### Design Specifications

| ID | Title | Description |
|----|-------|-------------|
| [DS-001](docs/specs/DS/DS-001-core-architecture.md) | Core Architecture | System design, components, data flow |
| [DS-002](docs/specs/DS/DS-002-data-structures.md) | Data Structures | Bitsets, groups, indexes, memory layout |
| [DS-003](docs/specs/DS/DS-003-learning-algorithms.md) | Learning Algorithms | Online learning, group lifecycle, decay |
| [DS-004](docs/specs/DS/DS-004-deduction-engine.md) | Deduction Engine | Temporal links, multi-hop reasoning |
| [DS-005](docs/specs/DS/DS-005-rl-importance.md) | RL Integration | Importance, rewards, RL pressure |
| [DS-006](docs/specs/DS/DS-006-http-server-chat.md) | HTTP Server & Chat | REST API, WebSocket, chat commands |
| [DS-007](docs/specs/DS/DS-007-serialization-sessions.md) | Serialization | State persistence, sessions, snapshots |
| [DS-008](docs/specs/DS/DS-008-benchmarks-comparison.md) | Benchmarks | Datasets, metrics, GPT-2 comparison |

### Implementation

See [docs/ROADMAP.md](docs/ROADMAP.md) for the complete 14-week implementation plan.

## Quick Start (Coming Soon)

```bash
# Install dependencies
npm install

# Start chat server
npm run server

# Open chat UI
open http://localhost:3000
```

## Benchmarks Target

| Metric | GPT-2 Medium | BPCM Target |
|--------|--------------|-------------|
| WikiText-2 Perplexity | 29.41 | <100 |
| LAMBADA Accuracy | 55.48% | >20% |
| Parameters | 355M | ~100K groups |
| Training | GPU, 40GB | CPU, online |
| Memory | ~1.5GB | <200MB |

## Training Data

Minimal datasets for comparison:
- **PTB** (Penn Treebank): ~929K tokens - rapid iteration
- **WikiText-2**: ~2M tokens - standard benchmark
- **LAMBADA**: 10K passages - deduction testing

## Chat Interface

The system includes an HTTP server for interactive chat:

```
User: Explain machine learning
BPCM: [activates relevant groups, predicts next concepts]

User: +++ /important
BPCM: [increases importance weight for consolidation]

User: /stats
BPCM: Groups: 1,234 | Deductions: 5,678 | Surprise: 0.23

User: /save mysession
BPCM: Session saved to ./sessions/mysession.bpcm
```

## RL Pressure

Control the balance between stable learning (LM-like) and adaptive learning (RL):

```
ρ = 0.0  →  Pure compression/surprise minimization
ρ = 0.5  →  Balanced (default)
ρ = 1.0  →  Maximum adaptation to feedback
```

## Architecture

```
Text → Tokenize → Encode → Bitset → Activate Groups → Predict → Learn
                                          ↓
                              Surprise + Hallucination
                                          ↓
                              Importance Modulation
                                          ↓
                              Update Groups + Deductions
```

## License

MIT

## Contributing

See the roadmap and pick a task! All contributions welcome.
