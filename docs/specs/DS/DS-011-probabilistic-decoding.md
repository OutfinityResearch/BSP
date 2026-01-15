# DS-011: Probabilistic Decoding (Viterbi)

**Version**: 1.0  
**Status**: Proposal  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Problem

Current generation (DS-009) is **Greedy** or **Local**.
- At each step, it picks the best next token/group.
- It does not look ahead.
- Result: "Garden Path" sentences that start well but end nonsensically.

## 2. Proposed Solution: Viterbi Decoding

Treat the `DeductionGraph` and `SequenceModel` as a **Hidden Markov Model (HMM)**.

- **States:** Groups or Tokens.
- **Transitions:** Edge weights ($P(State_{t+1} | State_t)$).
- **Emissions:** The generated text.

### 2.1 The Algorithm

Instead of picking the `max()` at each step, we maintain a **Beam** of the $K$ most probable *paths* up to time $t$.

```typescript
function viterbiGenerate(startGroup, length): Path {
    let paths = [{ score: 1.0, history: [startGroup] }];
    
    for (let t = 0; t < length; t++) {
        let newPaths = [];
        
        for (const path of paths) {
            const lastNode = path.history[path.history.length - 1];
            const nextCandidates = getTopTransitions(lastNode);
            
            for (const next of nextCandidates) {
                const newScore = path.score * next.weight;
                newPaths.push({
                    score: newScore,
                    history: [...path.history, next.id]
                });
            }
        }
        
        // Prune: Keep only top K paths (Beam Search)
        newPaths.sort((a, b) => b.score - a.score);
        paths = newPaths.slice(0, BEAM_WIDTH);
    }
    
    return paths[0]; // The single most probable global path
}
```

## 3. Integration with Token Sequence

This logic applies at two levels:
1. **Macro (Concept):** Finding the coherent sequence of *Groups* (Story Arc).
2. **Micro (Token):** Finding the coherent sequence of *Words* within a Group's potential output.

## 4. Expected Impact

- Eliminates "dead ends" in generation.
- Produces globally coherent sentences.
- Allows for "backtracking" logic implicitly (by keeping multiple paths alive).
