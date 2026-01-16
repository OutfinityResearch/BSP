/**
 * BSPEngine - Main engine integrating all BSP components
 */

import { SimpleBitset } from './Bitset.mjs';
import { Tokenizer } from './Tokenizer.mjs';
import { GroupStore } from './GroupStore.mjs';
import { DeductionGraph } from './DeductionGraph.mjs';
import { Learner } from './Learner.mjs';
import { ReplayBuffer } from './ReplayBuffer.mjs';
import { SequenceModel } from './SequenceModel.mjs';
import { IDFTracker } from './IDFTracker.mjs';
import { CompressionMachine } from './CompressionMachine.mjs';

class BSPEngine {
  /**
   * @param {object} options
   */
  constructor(options = {}) {
    this.config = {
      universeSize: options.universeSize || 100000,
      maxGroups: options.maxGroups || 10000,
      useVocab: options.useVocab || false,
      rlPressure: options.rlPressure || 0.3,
      decayInterval: options.decayInterval || 1000,
      consolidateInterval: options.consolidateInterval || 100,
      adaptiveUniverse: options.adaptiveUniverse !== false, // DS-020: enabled by default
      // DS-022: Emergent grammar through sequence cost
      sequenceCostWeight: options.sequenceCostWeight ?? 1.0, // Weight of sequence cost in MDL
      unknownTransitionPenalty: options.unknownTransitionPenalty ?? 10, // Bits for unknown transitions
      ...options,
    };

    // NEW: Vocabulary tracker for adaptive universe sizing
    this.vocabTracker = {
      seen: new Set(),
      totalTokens: 0,
      observe(tokens) {
        for (const t of tokens) {
          this.seen.add(t);
          this.totalTokens++;
        }
      },
      get size() { return this.seen.size; },
    };
    
    const tokenizerConfig = options.tokenizerConfig || options.tokenizer || {};
    const learnerConfig = options.learnerConfig || options.learner || {};
    const sequenceConfig = options.sequenceModelConfig || options.sequenceModel || {};
    const idfConfig = options.idfTrackerConfig || options.idfTracker || {};
    const indexConfig = options.indexConfig || options.index || {};

    const ngramSizes = Array.isArray(tokenizerConfig.ngramSizes) ? tokenizerConfig.ngramSizes : null;
    const ngramMin = tokenizerConfig.ngramMin ?? (ngramSizes ? Math.min(...ngramSizes) : undefined);
    const ngramMax = tokenizerConfig.ngramMax ?? (ngramSizes ? Math.max(...ngramSizes) : undefined);

    // Core components
    this.tokenizer = new Tokenizer({
      universeSize: this.config.universeSize,
      useVocab: this.config.useVocab,
      ...(ngramMin !== undefined ? { ngramMin } : {}),
      ...(ngramMax !== undefined ? { ngramMax } : {}),
    });

    // Keep tokenizer-related flags for runtime decisions (e.g. subsampling).
    this.tokenizerConfig = {
      subsampleHotTokens: Boolean(tokenizerConfig.subsampleHotTokens),
      subsampleT: tokenizerConfig.subsampleT ?? 1e-3,
      stopwordDropThreshold: tokenizerConfig.stopwordDropThreshold ?? null,
    };
    
    this.store = new GroupStore({
      maxGroups: this.config.maxGroups,
      universeSize: this.config.universeSize,
      maxGroupsPerIdentity: indexConfig.maxGroupsPerIdentity,
      indexEvictPolicy: indexConfig.indexEvictPolicy,
    });
    
    this.graph = new DeductionGraph();
    
    this.learner = new Learner(learnerConfig);
    
    this.buffer = new ReplayBuffer({
      maxSize: options.replayBufferSize || 50000,
    });
    
    // NEW: Sequence model for word order (DS-009)
    this.sequenceModel = new SequenceModel(sequenceConfig);
    
    // NEW: IDF tracker for semantic weighting (DS-012)
    this.idfTracker = new IDFTracker(idfConfig);
    
    // State
    this.step = 0;
    this.context = []; // Current context group IDs
    this.recentRewards = [];
    this.maxRecentRewards = 100;
    
    // RL
    this.rlPressure = this.config.rlPressure;
    
    // Metrics
    this.metrics = {
      totalSteps: 0,
      avgSurprise: 0,
      avgReward: 0,
      groupsCreated: 0,
    };

    // Context window for compression machine (token sequences)
    this.contextTokens = [];
    this.maxContextTokens = options.maxContextTokens || 1024;  // Increased from 256

    // DS-021: Compression Machine for procedural encoding
    const compressionConfig = options.compressionMachine || options.compression || {};
    this.compressionMachine = new CompressionMachine({
      vocabSize: this.config.universeSize,
      maxContextLen: this.maxContextTokens,
      minCopyLen: compressionConfig.minCopyLen || 3,
      maxCopyLen: compressionConfig.maxCopyLen || 64,
      maxRepeat: compressionConfig.maxRepeat || 16,
      ...compressionConfig,
    });

    // Flag to enable/disable compression machine
    this.useCompressionMachine = options.useCompressionMachine !== false;
    
    // DS-021: Sentence buffer for template learning (DISABLED - see EXPERIMENT_TEMPLATE_LEARNING.md)
    this.sentenceBuffer = [];
    this.maxSentenceBuffer = options.maxSentenceBuffer || 500;
    this.templateLearningInterval = options.templateLearningInterval || Infinity;  // Disabled by default
    this.processedLines = 0;
  }

  /**
   * Get effective universe size based on observed vocabulary
   * This implements DS-020: Adaptive Universe
   * @returns {number}
   */
  get effectiveUniverseSize() {
    if (!this.config.adaptiveUniverse) {
      return this.config.universeSize;
    }

    // Use vocabulary size with 2x headroom, capped at config.universeSize
    // Minimum of 1000 to avoid extreme costs for very small vocabularies
    const vocabSize = this.vocabTracker.size || 1000;
    return Math.min(
      Math.max(1000, vocabSize * 2),
      this.config.universeSize
    );
  }

  /**
   * Compute MDL cost in bits for a given surprise count and token sequence.
   * 
   * DS-022: Complete MDL = group_cost + sequence_cost
   *   - group_cost: measures WHAT tokens appear (co-occurrence)
   *   - sequence_cost: measures in what ORDER they appear (grammar emerges from this)
   * 
   * @param {number} surpriseBits - Number of unexpected bits
   * @param {string[]} [tokens] - Token sequence for sequence cost (optional)
   * @returns {number} Cost in bits
   */
  computeMDLCost(surpriseBits, tokens = null) {
    // Group-based cost: how surprising is the content?
    const groupCost = surpriseBits * Math.log2(this.effectiveUniverseSize);
    
    // If no tokens or weight is 0, return just group cost
    if (!tokens || tokens.length < 2 || this.config.sequenceCostWeight === 0) {
      return groupCost;
    }
    
    // Sequence-based cost: how likely is this word order?
    // Grammar emerges naturally: unlikely sequences have high cost
    const sequenceCost = this.sequenceModel.getSequenceCost(tokens, {
      unkPenalty: this.config.unknownTransitionPenalty,
    });
    
    return groupCost + this.config.sequenceCostWeight * sequenceCost;
  }

  /**
   * Encode text to bitset
   * @param {string} text
   * @returns {SimpleBitset}
   */
  encode(text) {
    const ids = this.tokenizer.encode(text);
    return SimpleBitset.fromArray(ids, this.config.universeSize);
  }

  /**
   * Encode pre-tokenized words to bitset with tokenizer options.
   * @param {string[]} tokens
   * @param {object} tokenizerOptions
   * @returns {SimpleBitset}
   */
  encodeFromTokens(tokens, tokenizerOptions = {}) {
    const ids = this.tokenizer.encodeFromTokens(tokens, tokenizerOptions);
    return SimpleBitset.fromArray(ids, this.config.universeSize);
  }

  /**
   * Optional token filtering for feature extraction to reduce wasted work on very frequent words.
   * Uses IDFTracker document-frequency ratio as a proxy for token frequency.
   * @param {string[]} tokens
   * @returns {string[]}
   * @private
   */
  _filterTokensForEncoding(tokens) {
    if (!this.tokenizerConfig.subsampleHotTokens) return tokens;
    if (this.idfTracker.documentCount < 100) return tokens; // wait for a minimal history

    const t = Math.max(1e-8, Number(this.tokenizerConfig.subsampleT) || 1e-3);
    const filtered = [];

    for (const token of tokens) {
      const f = this.idfTracker.getDocFrequencyRatio(token);
      if (f <= 0) {
        filtered.push(token);
        continue;
      }

      // Mikolov-style subsampling using document frequency as a proxy:
      // P(discard) = 1 - sqrt(t / f)
      const keepProb = Math.min(1, Math.sqrt(t / f));
      if (Math.random() <= keepProb) {
        filtered.push(token);
      }
    }

    // Never return empty: fall back to a small slice of original tokens.
    return filtered.length > 0 ? filtered : tokens.slice(0, Math.min(tokens.length, 4));
  }

  /**
   * Activate groups for input
   * @param {SimpleBitset} input
   * @returns {object[]} Active groups
   */
  activate(input) {
    return this.learner.activate(input, this.store);
  }

  /**
   * Reconstruct from groups
   * @param {object[]} groups
   * @returns {SimpleBitset}
   */
  reconstruct(groups) {
    return this.learner.reconstruct(groups, this.config.universeSize);
  }

  /**
   * Predict next groups
   * @param {number[]} contextGroupIds
   * @param {number} [topK=10]
   * @returns {Array<{groupId: number, score: number}>}
   */
  predictNext(contextGroupIds, topK = 10) {
    const scores = this.graph.predictMultiHop(contextGroupIds);
    
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([groupId, score]) => ({ groupId, score }));
  }

  /**
   * Predict next bits
   * @param {number[]} contextGroupIds
   * @returns {SimpleBitset}
   */
  predictNextBits(contextGroupIds) {
    const predictions = this.predictNext(contextGroupIds, 10);
    const result = new SimpleBitset(this.config.universeSize);
    
    for (const { groupId, score } of predictions) {
      if (score < 0.1) continue;
      const group = this.store.get(groupId);
      if (group) {
        result.orInPlace(group.members);
      }
    }
    
    return result;
  }

  /**
   * Process input and learn
   * @param {string} text
   * @param {object} options
   * @returns {object} Result
   */
  process(text, options = {}) {
    const {
      reward = 0,
      importanceOverride = null,
      learn = true,
    } = options;
    
    // 1. Tokenize once (shared across encoding, sequence learning, and IDF stats)
    const wordTokens = this.tokenizer.tokenizeWords(text);

    // NEW: Track vocabulary for adaptive universe (DS-020)
    if (learn) {
      this.vocabTracker.observe(wordTokens);
    }

    // 2. Encode (optionally subsample hot tokens for feature extraction)
    // Never mutate model state when learn=false.
    if (learn) {
      // Update IDF statistics early (semantic weighting + subsampling signal)
      this.idfTracker.update(new Set(wordTokens));
    }

    const encodingTokens = learn ? this._filterTokensForEncoding(wordTokens) : wordTokens;
    const input = this.encodeFromTokens(encodingTokens, { allowVocabGrowth: learn });
    
    // 2. Activate
    const activeGroups = this.activate(input);
    const activeGroupIds = activeGroups.map(g => g.id);
    
    // 3. Reconstruct and compute surprise
    const reconstruction = this.reconstruct(activeGroups);
    const { surprise, hallucination } = this.learner.computeSurprise(input, reconstruction);
    
    // 4. Compute importance
    const novelty = surprise.size / Math.max(1, input.size);
    const importance = importanceOverride !== null
      ? importanceOverride
      : this.learner.computeImportance({
          novelty,
          utility: reward,
          stability: activeGroups.length > 0 ? 0.5 : 0,
        });
    
    // 5. Modulate learning rate with RL pressure
    const effectiveImportance = this._modulateImportance(importance, reward);
    
    if (learn) {
      // 6. Update memberships
      this.learner.updateMemberships(activeGroups, input, hallucination, effectiveImportance, this.store);
      
      // 7. Update deductions
      if (this.context.length > 0) {
        this.learner.updateDeductions(this.context, activeGroupIds, effectiveImportance, this.graph);
      }
      
      // 8. Maybe create new group
      const newGroup = this.learner.maybeCreateGroup(surprise, input, this.store);
      if (newGroup) {
        this.metrics.groupsCreated++;
      }
      
      // 9. Store in replay buffer
      this.buffer.add({
        timestamp: Date.now(),
        inputBits: input.toArray(),
        activeGroupIds,
        contextGroupIds: this.context.slice(),
        surprise: surprise.size,
        reward,
        importance: effectiveImportance,
      });
      
    // 10. Learn sequence patterns (DS-009)
      if (wordTokens.length >= 2) {
        this.sequenceModel.learn(wordTokens);
      }
      
      // 12. Periodic maintenance
      this.step++;
      this._periodicMaintenance();
    }
    
    // 13. Update context
    this.context = activeGroupIds;
    
    // 14. Track reward
    if (reward !== 0) {
      this.recentRewards.push(reward);
      if (this.recentRewards.length > this.maxRecentRewards) {
        this.recentRewards.shift();
      }
    }
    
    // 15. Update salience
    this._updateSalience(activeGroups, reward);
    
    // 16. Update metrics
    this._updateMetrics(surprise.size, reward);

    // 17. NEW: Update token context for compression machine
    this.contextTokens = [...this.contextTokens, ...wordTokens].slice(-this.maxContextTokens);

    // DS-021: Template Learning - DISABLED (see EXPERIMENT_TEMPLATE_LEARNING.md)
    // Sentence buffer collection and learning removed for performance

    // DS-022: Compute MDL cost with sequence cost (grammar emerges from this)
    // group_cost: measures WHAT tokens appear
    // sequence_cost: measures in what ORDER (frequent sequences = grammatical)
    const groupMdlCost = this.computeMDLCost(surprise.size, wordTokens);
    
    // Compute sequence cost separately for metrics
    const sequenceCost = wordTokens.length >= 2 
      ? this.sequenceModel.getSequenceCost(wordTokens, { unkPenalty: this.config.unknownTransitionPenalty })
      : 0;

    // DS-021: Compute compression machine cost (program-based)
    let programCost = Infinity;
    let compressionProgram = null;
    
    if (this.useCompressionMachine && wordTokens.length > 0) {
      // Use previous context (before adding current tokens)
      const prevContext = this.contextTokens.slice(0, -wordTokens.length);
      compressionProgram = this.compressionMachine.encode(wordTokens, prevContext);
      // DS-022: Add sequence cost to program cost as well
      // This ensures grammar is always part of the cost, regardless of compression method
      programCost = compressionProgram.cost + this.config.sequenceCostWeight * sequenceCost;
    }

    // Best cost is minimum of group-based and program-based
    // Both now include sequence cost (DS-022)
    const bestCost = Math.min(groupMdlCost, programCost);
    const compressionMethod = programCost < groupMdlCost ? 'program' : 'group';
    
    return {
      activeGroups,
      activeGroupIds,
      surprise: surprise.size,
      hallucination: hallucination.size,
      inputSize: input.size,
      importance: effectiveImportance,
      predictions: this.predictNext(activeGroupIds, 5),
      wordTokens,  // Include for response generation
      // MDL compression metrics
      mdlCost: bestCost,                    // Best of both methods
      groupMdlCost,                          // Group-based cost (includes sequence cost per DS-022)
      sequenceCost,                          // DS-022: Sequence cost component (grammar signal)
      programCost: programCost === Infinity ? null : programCost,  // Program-based cost
      compressionMethod,                     // Which method was better
      compressionProgram: compressionProgram ? compressionProgram.toString() : null,
      effectiveUniverseSize: this.effectiveUniverseSize,
      vocabSize: this.vocabTracker.size,
    };
  }

  /**
   * Modulate importance based on RL pressure
   * @private
   */
  _modulateImportance(importance, reward) {
    // rho = 0: pure LM (novelty-driven)
    // rho = 1: pure RL (reward-driven)
    const lmComponent = importance;
    const rlComponent = Math.abs(reward) > 0.1 ? 0.8 + 0.2 * Math.abs(reward) : 0.2;
    
    return (1 - this.rlPressure) * lmComponent + this.rlPressure * rlComponent;
  }

  /**
   * Update group salience based on reward
   * @private
   */
  _updateSalience(activeGroups, reward) {
    if (reward === 0) return;
    
    const baseline = this._computeBaseline();
    const advantage = reward - baseline;
    
    for (const group of activeGroups) {
      const delta = 0.05 * advantage;
      group.salience = Math.max(0, Math.min(1, group.salience + delta));
    }
  }

  /**
   * Compute reward baseline
   * @private
   */
  _computeBaseline() {
    if (this.recentRewards.length === 0) return 0;
    return this.recentRewards.reduce((a, b) => a + b, 0) / this.recentRewards.length;
  }

  /**
   * Periodic maintenance tasks
   * @private
   */
  _periodicMaintenance() {
    // Decay
    if (this.step % this.config.decayInterval === 0) {
      this.store.applyDecay(0.1);
      this.graph.applyDecay();
    }
    
    // Consolidation
    if (this.step % this.config.consolidateInterval === 0) {
      this.consolidate(10);
    }
    
    // Merge check (Sleep Consolidation)
    if (this.step % 500 === 0) {
      this.learner.performSleepConsolidation(this.store, this.graph);
    }
    
    // Prune
    if (this.step % 1000 === 0) {
      this.store.prune();
    }
  }

  /**
   * Update metrics
   * @private
   */
  _updateMetrics(surprise, reward) {
    this.metrics.totalSteps++;
    
    // Exponential moving average
    const alpha = 0.01;
    this.metrics.avgSurprise = (1 - alpha) * this.metrics.avgSurprise + alpha * surprise;
    this.metrics.avgReward = (1 - alpha) * this.metrics.avgReward + alpha * reward;
  }

  /**
   * Consolidate from replay buffer
   * @param {number} episodes
   */
  consolidate(episodes) {
    const samples = this.buffer.sample(episodes);
    
    for (const episode of samples) {
      // Re-process with reduced learning
      const input = SimpleBitset.fromArray(episode.inputBits, this.config.universeSize);
      const activeGroups = [];
      
      for (const id of episode.activeGroupIds) {
        const group = this.store.get(id);
        if (group) activeGroups.push(group);
      }
      
      if (activeGroups.length === 0) continue;
      
      const reconstruction = this.reconstruct(activeGroups);
      const { hallucination } = this.learner.computeSurprise(input, reconstruction);
      
      // Reduced learning rate for consolidation
      const consolidationImportance = episode.importance * 0.3;
      this.learner.updateMemberships(activeGroups, input, hallucination, consolidationImportance, this.store);
    }
  }

  /**
   * Run sleep consolidation phase (DS-010)
   * @returns {number} Merges performed
   */
  runSleepPhase() {
    return this.learner.performSleepConsolidation(this.store, this.graph);
  }

  /**
   * Set RL pressure
   * @param {number} rho - 0 to 1
   */
  setRLPressure(rho) {
    this.rlPressure = Math.max(0, Math.min(1, rho));
  }

  /**
   * Reset context
   */
  resetContext() {
    this.context = [];
  }

  /**
   * Get statistics
   * @returns {object}
   */
  getStats() {
    return {
      step: this.step,
      groupCount: this.store.size,
      edgeCount: this.graph.edgeCount,
      bufferSize: this.buffer.size,
      rlPressure: this.rlPressure,
      contextSize: this.context.length,
      metrics: this.metrics,
      storeStats: this.store.stats,
      graphStats: this.graph.stats,
      bufferStats: this.buffer.getStats(),
    };
  }

  /**
   * Describe a group (for interpretability)
   * @param {number} groupId
   * @returns {string}
   */
  describeGroup(groupId) {
    const group = this.store.get(groupId);
    if (!group) return `[Unknown group ${groupId}]`;
    
    const bits = group.members.toArray().slice(0, 10);
    const tokens = this.tokenizer.decode(bits);
    
    return `[G${groupId}: ${tokens.join(', ')}${group.members.size > 10 ? '...' : ''} (s=${group.salience.toFixed(2)})]`;
  }

  /**
   * Get top groups by salience
   * @param {number} k
   * @returns {object[]}
   */
  getTopGroups(k = 10) {
    return this.store.getTopBySalience(k).map(g => ({
      id: g.id,
      size: g.members.size,
      salience: g.salience,
      usageCount: g.usageCount,
      description: this.describeGroup(g.id),
    }));
  }

  /**
   * Explain prediction path
   * @param {number[]} startGroupIds
   * @param {number[]} targetGroupIds
   * @returns {string}
   */
  explainPrediction(startGroupIds, targetGroupIds) {
    const chains = this.graph.extractChains(startGroupIds, targetGroupIds, 3);
    
    if (chains.length === 0) {
      return 'No reasoning chain found';
    }
    
    const best = chains[0];
    const steps = best.steps.map(s => 
      `${this.describeGroup(s.from)} -> ${this.describeGroup(s.to)} (w=${s.weight.toFixed(2)})`
    );
    
    return steps.join(' -> ');
  }

  /**
   * Serialize engine state
   * @returns {object}
   */
  toJSON() {
    return {
      version: '1.3.0',  // Updated for compression machine integration
      timestamp: Date.now(),
      config: this.config,
      tokenizer: this.tokenizer.toJSON(),
      store: this.store.toJSON(),
      graph: this.graph.toJSON(),
      learner: this.learner.toJSON(),
      buffer: this.buffer.toJSON(),
      sequenceModel: this.sequenceModel.toJSON(),  // DS-009
      idfTracker: this.idfTracker.toJSON(),        // DS-012
      compressionMachine: this.compressionMachine.toJSON(),  // DS-021
      // DS-020: Vocabulary tracker for adaptive universe
      vocabTracker: {
        seen: [...this.vocabTracker.seen],
        totalTokens: this.vocabTracker.totalTokens,
      },
      state: {
        step: this.step,
        context: this.context,
        contextTokens: this.contextTokens,
        recentRewards: this.recentRewards,
        rlPressure: this.rlPressure,
        metrics: this.metrics,
        useCompressionMachine: this.useCompressionMachine,
        sentenceBuffer: this.sentenceBuffer,
        processedLines: this.processedLines,
      },
    };
  }

  /**
   * Deserialize engine state
   * @param {object} json
   * @returns {BSPEngine}
   */
  static fromJSON(json) {
    const engine = new BSPEngine(json.config);
    
    engine.tokenizer = Tokenizer.fromJSON(json.tokenizer);
    engine.store = GroupStore.fromJSON(json.store);
    engine.graph = DeductionGraph.fromJSON(json.graph);
    engine.learner = Learner.fromJSON(json.learner);
    engine.buffer = ReplayBuffer.fromJSON(json.buffer);
    
    // Load new components if present
    if (json.sequenceModel) {
      engine.sequenceModel = SequenceModel.fromJSON(json.sequenceModel);
    }
    if (json.idfTracker) {
      engine.idfTracker = IDFTracker.fromJSON(json.idfTracker);
    }
    // DS-021: Load compression machine
    if (json.compressionMachine) {
      engine.compressionMachine = CompressionMachine.fromJSON(json.compressionMachine);
    }
    
    // DS-020: Load vocabulary tracker
    if (json.vocabTracker) {
      engine.vocabTracker.seen = new Set(json.vocabTracker.seen);
      engine.vocabTracker.totalTokens = json.vocabTracker.totalTokens || 0;
    }
    
    engine.step = json.state.step;
    engine.context = json.state.context;
    engine.contextTokens = json.state.contextTokens || [];
    engine.recentRewards = json.state.recentRewards;
    engine.rlPressure = json.state.rlPressure;
    engine.metrics = json.state.metrics;
    engine.useCompressionMachine = json.state.useCompressionMachine !== false;
    engine.sentenceBuffer = json.state.sentenceBuffer || [];
    engine.processedLines = json.state.processedLines || 0;
    
    return engine;
  }
}

export { BSPEngine };
