/**
 * DS-019: Synthetic Grammar Definition
 * 
 * Defines a convergent grammar where non-terminals eventually reach
 * a specific terminal state.
 */

export class SyntheticGrammar {
  constructor(config = {}) {
    this.numTerminals = config.numTerminals || 100;
    this.numIntermediates = config.numIntermediates || 1000;
    this.minPathLength = config.minPathLength || 3;
    this.maxPathLength = config.maxPathLength || 15;
    
    this.terminals = Array.from({length: this.numTerminals}, (_, i) => `t${String(i).padStart(2, '0')}`);
    this.intermediates = Array.from({length: this.numIntermediates}, (_, i) => `s${String(i).padStart(4, '0')}`);
    
    this.transitions = new Map(); // State -> [NextState]
    this.init();
  }

  init() {
    // 1. Assign each intermediate state to a specific target terminal (Convergence Property)
    // This ensures that from any state, we know the "Ground Truth" final destination.
    this.stateTargets = new Map();
    for (const state of this.intermediates) {
      const targetIndex = Math.floor(Math.random() * this.numTerminals);
      this.stateTargets.set(state, this.terminals[targetIndex]);
    }

    // 2. Build graph (Transitions)
    // We want chains like: S1 -> S2 -> ... -> Target
    // We enforce that if A -> B, then Target(A) === Target(B)
    
    for (const state of this.intermediates) {
      const myTarget = this.stateTargets.get(state);
      
      // Determine if this state should transition to another intermediate or to the terminal
      // Simple heuristic: States with higher indices are "closer" to terminals to prevent cycles? 
      // Or just random DAG generation.
      
      const isTerminalStep = Math.random() < 0.1; // 10% chance to reach terminal directly
      
      if (isTerminalStep) {
        this.transitions.set(state, [myTarget]);
      } else {
        // Find other intermediates that share the same target
        // Implementation detail: In a real large-scale system, we'd index this.
        // For now, picking random potential next states is sufficient for the scaffold.
        const potentialNext = this.intermediates.filter(s => 
          s !== state && this.stateTargets.get(s) === myTarget
        );
        
        if (potentialNext.length > 0) {
            // Pick 1-2 possible next states
            const count = 1 + Math.floor(Math.random() * 2);
            const nextStates = [];
            for(let i=0; i<count; i++) {
                nextStates.push(potentialNext[Math.floor(Math.random() * potentialNext.length)]);
            }
            this.transitions.set(state, nextStates);
        } else {
            // Fallback to terminal
            this.transitions.set(state, [myTarget]);
        }
      }
    }
  }

  /**
   * Generates a sequence ending in a terminal.
   */
  generateSequence() {
    // Pick a random start state
    let current = this.intermediates[Math.floor(Math.random() * this.intermediates.length)];
    const sequence = [current];
    
    // Walk until terminal
    let steps = 0;
    while (!this.terminals.includes(current) && steps < this.maxPathLength) {
      const options = this.transitions.get(current);
      if (!options || options.length === 0) break;
      
      current = options[Math.floor(Math.random() * options.length)];
      sequence.push(current);
      steps++;
    }
    
    // Force termination if loop or stuck
    if (!this.terminals.includes(current)) {
       sequence.push(this.stateTargets.get(sequence[0]));
    }
    
    return sequence;
  }
}
