const { Tokenizer } = require('../../src/core');

test('Tokenizer: tokenizeWords normalizes and splits', () => {
  const tok = new Tokenizer();
  const words = tok.tokenizeWords('Hello, World!');
  assertEqual(words.length, 2);
  assertEqual(words[0], 'hello');
  assertEqual(words[1], 'world');
});

test('Tokenizer: encode produces IDs in range (hash mode)', () => {
  const tok = new Tokenizer({ universeSize: 1000 });
  const ids = tok.encode('The cat sat on the mat');
  assert(ids.length > 0);
  assert(ids.every((id) => id >= 0 && id < 1000), 'IDs should be in range');
});

test('Tokenizer: generateNgrams includes unigrams and bigrams', () => {
  const tok = new Tokenizer({ ngramMin: 1, ngramMax: 2 });
  const ngrams = tok.generateNgrams(['a', 'b', 'c']);
  assert(ngrams.includes('a'));
  assert(ngrams.includes('a_b'));
});

test('Tokenizer: vocab mode can freeze vocab growth', () => {
  const tok = new Tokenizer({ useVocab: true });

  const first = tok.encodeFromTokens(['hello'], { allowVocabGrowth: true });
  assert(first.length > 0);
  const nextId = tok.nextVocabId;

  const second = tok.encodeFromTokens(['newtoken'], { allowVocabGrowth: false });
  assertEqual(second.length, 0);
  assertEqual(tok.nextVocabId, nextId);
});

