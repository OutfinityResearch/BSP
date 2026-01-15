# BSP Implementation Roadmap

## Overview

This document outlines the complete implementation plan for BSP (Bitset System for Prediction), 
a CPU-friendly continuous learning system that provides LLM-like capabilities using bitsets and 
compression-based learning.

**Total Estimated Duration**: 14 weeks (3.5 months)

---

## Phase 1: Foundation (Week 1-2)

### Goals
- Set up project infrastructure
- Implement core data structures
- Establish testing patterns

### Tasks

#### Week 1
- [ ] **Project Setup**
  - Initialize TypeScript project with ESM modules
  - Configure build (esbuild or tsc)
  - Setup testing framework (vitest or jest)
  - Configure linting (eslint) and formatting (prettier)
  
- [ ] **Roaring Bitmap Integration**
  - Install and configure `roaring` npm package
  - Create wrapper class with helper methods
  - Benchmark basic operations (AND, OR, popcount)

#### Week 2
- [ ] **Tokenizer**
  - Implement simple word-level tokenizer
  - Add n-gram hashing for feature extraction
  - Create identity mapping (token → ID)

- [ ] **Core Structures**
  - Implement `Group` interface
  - Implement `GroupStore` class
  - Implement `BitmapIndex` for inverse lookup
  - Unit tests for all structures

### Deliverables
- Working project with CI
- Core data structures with 80%+ test coverage
- Basic tokenization pipeline

---

## Phase 2: Core Learning (Week 3-4)

### Goals
- Implement the encoding/activation pipeline
- Implement learning rules
- Create basic training loop

### Tasks

#### Week 3
- [ ] **Activation Algorithm**
  - Implement candidate retrieval from `BitmapIndex`
  - Implement scoring function (coverage - size penalty)
  - Implement greedy top-K selection
  - Add activation threshold filtering

- [ ] **Reconstruction & Surprise**
  - Implement `reconstruct(groups)` → bitmap
  - Implement `computeSurprise(input, reconstruction)`
  - Define MDL-style loss function

#### Week 4
- [ ] **Membership Updates**
  - Implement `updateMemberships` with importance modulation
  - Implement count-based threshold for adding/removing bits
  - Add decay mechanism

- [ ] **Group Lifecycle**
  - Implement `maybeCreateGroup` for high surprise
  - Implement `maybeMerge` for similar groups
  - Implement `maybeSplit` for over-general groups
  - Implement `pruneGroups` for cleanup

- [ ] **Training Loop**
  - Create basic `trainStep(text, context, reward)` function
  - Implement context window management
  - Add periodic decay and pruning

### Deliverables
- Complete encoding → activation → learning pipeline
- Demonstrated convergence on small text corpus
- Metrics collection (surprise rate, group count)

---

## Phase 3: Deduction Engine (Week 5-6)

### Goals
- Implement temporal learning
- Enable prediction through deduction
- Add multi-hop reasoning

### Tasks

#### Week 5
- [ ] **DeductionGraph**
  - Implement forward/backward link storage
  - Implement `strengthen(from, to, delta)`
  - Implement `weaken(from, to, delta)`
  - Add bitset-based fast lookup

- [ ] **Temporal Learning**
  - Track previous context groups
  - Implement deduction update in training loop
  - Add decay for unused deductions

#### Week 6
- [ ] **Prediction**
  - Implement `predictDirect(activeGroups)` → scores
  - Implement `predictMultiHop(groups, depth, beamWidth)` with BFS
  - Implement `predictNextBits(context)` → bitmap

- [ ] **Reasoning Chains**
  - Implement `extractReasoningChains(start, target)`
  - Implement `explainPrediction(context, prediction)`
  - Add confidence scoring

### Deliverables
- Working prediction pipeline
- Demonstrated temporal associations
- Explainable reasoning chains

---

## Phase 4: RL Integration (Week 7-8)

### Goals
- Enable continuous learning from feedback
- Implement importance-weighted learning
- Add RL pressure control

### Tasks

#### Week 7
- [ ] **Reward Signals**
  - Implement `RewardParser` for explicit feedback
  - Implement implicit feedback detection
  - Create `combineRewards` aggregation

- [ ] **Importance Module**
  - Implement `computeImportance(novelty, utility, stability)`
  - Implement `getEffectiveLearningRate(base, importance, rho)`
  - Add explicit importance markers

#### Week 8
- [ ] **RL Pressure Controller**
  - Implement `RLPressureController` with `rho` parameter
  - Implement loss combination (LM vs RL)
  - Add auto-adjust based on performance

- [ ] **Value Propagation**
  - Implement salience updates on groups
  - Implement backward credit assignment
  - Track RL metrics

- [ ] **Replay Buffer**
  - Implement `ReplayBuffer` with prioritized sampling
  - Implement `consolidate(episodes)` for offline learning
  - Add priority computation

### Deliverables
- Feedback-responsive learning
- Configurable RL pressure
- Demonstrated adaptation to rewards

---

## Phase 5: Server & Chat (Week 9-10)

### Goals
- Create HTTP server for chat interface
- Implement WebSocket for real-time interaction
- Add chat commands

### Tasks

#### Week 9
- [ ] **HTTP Server**
  - Setup Node.js HTTP server (or Fastify)
  - Implement REST endpoints for sessions
  - Implement REST endpoints for messages
  - Add CORS and basic security

- [ ] **WebSocket**
  - Setup WebSocket server
  - Implement message protocol
  - Handle chat, feedback, and control messages
  - Add streaming support

#### Week 10
- [ ] **Session Manager**
  - Implement `SessionManager` class
  - Handle session lifecycle (create, get, close)
  - Add timeout and cleanup
  - Add auto-save

- [ ] **Chat Interface**
  - Implement command parser (`/help`, `/stats`, etc.)
  - Implement `CommandHandler` for all commands
  - Create basic HTML UI for testing

### Deliverables
- Working chat server on localhost
- Interactive conversation with BSP
- Session management

---

## Phase 6: Persistence (Week 11)

### Goals
- Implement state serialization
- Enable session continuity
- Add snapshots for time-travel

### Tasks

- [ ] **Serialization**
  - Implement `BSPSerializer` (MessagePack + gzip)
  - Implement `JSONSerializer` for debugging
  - Add header with version and checksum

- [ ] **Save/Load**
  - Implement `session.save(path)` and `session.load(path)`
  - Add to session manager auto-save
  - Benchmark performance targets

- [ ] **Delta Saves**
  - Implement `DeltaWriter` for incremental saves
  - Implement `applyDelta` for reconstruction

- [ ] **Snapshots**
  - Implement `SnapshotManager`
  - Add snapshot commands to chat
  - Implement time-travel restore

- [ ] **Export/Import**
  - Implement portable JSON export
  - Implement import with validation

### Deliverables
- Fast save/load (<500ms for 10K groups)
- Session continuity across restarts
- Snapshot-based time travel

---

## Phase 7: Benchmarks (Week 12-14)

### Goals
- Setup evaluation infrastructure
- Run baseline experiments
- Compare with GPT-2

### Tasks

#### Week 12
- [ ] **Dataset Setup**
  - Implement download scripts
  - Implement `PTBDataset` loader
  - Implement `WikiText2Dataset` loader
  - Implement `LAMBADADataset` loader

- [ ] **Metrics**
  - Implement surprise rate computation
  - Implement perplexity approximation
  - Implement deduction accuracy (top-K, MRR)

#### Week 13
- [ ] **Evaluation Pipeline**
  - Implement `EvaluationPipeline` class
  - Implement `TrainingPipeline` class
  - Add periodic evaluation during training
  - Create metrics dashboard

- [ ] **Experiments**
  - Experiment 1: PTB convergence
  - Experiment 2: WikiText-2 comparison
  - Experiment 3: LAMBADA deduction

#### Week 14
- [ ] **RL Experiments**
  - Setup RL task simulation
  - Run ρ sweep (0, 0.3, 0.7, 1.0)
  - Measure stability/plasticity tradeoff

- [ ] **Ablations**
  - Ablation 1: K (active groups)
  - Ablation 2: Deduction depth
  - Ablation 3: RL pressure

- [ ] **Final Report**
  - Compile all results
  - Generate comparison tables
  - Document findings and limitations

### Deliverables
- Benchmark results on PTB, WikiText-2, LAMBADA
- Comparison tables with GPT-2
- Ablation study results
- Final technical report

---

## Success Criteria

### MVP (Minimum Viable Product)
- [ ] Working chat interface with session persistence
- [ ] Demonstrated learning on PTB
- [ ] Surprise rate < 0.5 after training

### Full Release
- [ ] WikiText-2 perplexity proxy < 100
- [ ] LAMBADA top-10 accuracy > 20%
- [ ] RL adaptation demonstrated
- [ ] Save/load in < 500ms

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Roaring bitmap performance | Fallback to custom bitset for small sets |
| Memory usage explosion | Implement aggressive pruning, limit group count |
| Deduction graph too dense | Threshold + decay for edge removal |
| Poor prediction quality | Tune K, depth, beam width; add heuristics |
| Session state too large | Delta saves, compression, lazy loading |

---

## Resources Required

### Hardware
- Development: Any modern laptop (8GB+ RAM)
- Training benchmarks: 16GB RAM recommended

### Software
- Node.js 18+
- TypeScript 5+
- npm packages: roaring, msgpack-lite, ws

### Data
- PTB: ~5MB
- WikiText-2: ~12MB
- LAMBADA: ~3MB

---

## Team Allocation (if applicable)

| Phase | Estimated Effort | Parallelizable |
|-------|-----------------|----------------|
| Foundation | 2 person-weeks | No |
| Core Learning | 2 person-weeks | No |
| Deduction | 2 person-weeks | Partially |
| RL Integration | 2 person-weeks | Partially |
| Server & Chat | 2 person-weeks | Yes (frontend/backend) |
| Persistence | 1 person-week | Partially |
| Benchmarks | 3 person-weeks | Yes (experiments) |
