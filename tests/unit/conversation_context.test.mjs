import { ConversationContext } from '../../src/core/index.mjs';

test('ConversationContext: addTurn updates tokens and topics', () => {
  const ctx = new ConversationContext({ windowSize: 3, topicDecay: 0.5, maxTopics: 2 });

  ctx.addTurn(['hello', 'world'], [{ id: 1, salience: 1.0 }], { importance: 1.0 });
  assertEqual(ctx.turnCount, 1);
  assert(ctx.recentTokens.length <= 3);
  assert(ctx.tokenWeights.get('hello') > 0);
  assert(ctx.isTopicActive(1));

  const beforeStrength = ctx.getTopicStrength(1);
  assert(beforeStrength > 0);

  ctx.addTurn(['foo', 'bar'], [{ id: 2, salience: 0.5 }], { importance: 1.0 });
  assertEqual(ctx.turnCount, 2);
  assert(ctx.recentTokens.length <= 3);
  assert(ctx.isTopicActive(2));

  const afterStrength = ctx.getTopicStrength(1);
  assert(afterStrength < beforeStrength, 'topicDecay must reduce strength over turns');
});

test('ConversationContext: toJSON/fromJSON roundtrip preserves scores', () => {
  const ctx = new ConversationContext({ windowSize: 10, topicDecay: 0.9, maxTopics: 20 });
  ctx.addTurn(['alpha', 'beta'], [{ id: 7, salience: 0.8 }], { importance: 1.0 });
  ctx.addTurn(['beta', 'gamma'], [{ id: 7, salience: 0.8 }, { id: 9, salience: 0.3 }], { importance: 0.5 });

  const before = {
    turnCount: ctx.turnCount,
    betaRelevance: ctx.getTokenRelevance('beta'),
    topic7: ctx.getTopicStrength(7),
    topic9: ctx.getTopicStrength(9),
    keywords: ctx.getTopKeywords(10),
  };

  const restored = ConversationContext.fromJSON(ctx.toJSON());
  assertEqual(restored.turnCount, before.turnCount);
  assert(Math.abs(restored.getTokenRelevance('beta') - before.betaRelevance) < 1e-12);
  assert(Math.abs(restored.getTopicStrength(7) - before.topic7) < 1e-12);
  assert(Math.abs(restored.getTopicStrength(9) - before.topic9) < 1e-12);
  assertDeepEqual(restored.getTopKeywords(10), before.keywords);
});

test('ConversationContext: reset clears state', () => {
  const ctx = new ConversationContext();
  ctx.addTurn(['one', 'two'], [{ id: 1, salience: 1.0 }], { importance: 1.0 });
  ctx.reset();
  assertEqual(ctx.turnCount, 0);
  assertEqual(ctx.recentTokens.length, 0);
  assertEqual(ctx.tokenWeights.size, 0);
  assertEqual(ctx.activeTopics.size, 0);
  assertEqual(ctx.keywords.size, 0);
});

