export function normalizeDifficulty(difficulty) {
  if (difficulty === undefined || difficulty === null || difficulty === '') return null;
  const value = String(difficulty).trim().toLowerCase();
  if (value === '1' || value === 'easy') return 'easy';
  if (value === '2' || value === 'medium' || value === 'med') return 'medium';
  if (value === '3' || value === 'hard') return 'hard';
  throw new Error(`Invalid difficulty=${JSON.stringify(difficulty)} (expected easy|medium|hard)`);
}

export function difficultyToLevel(difficulty) {
  const normalized = normalizeDifficulty(difficulty);
  if (normalized === null) return null;
  if (normalized === 'easy') return 1;
  if (normalized === 'medium') return 2;
  if (normalized === 'hard') return 3;
  return null;
}

