import { describe, expect, it } from 'vitest';
import { promptCommandIds } from '../nodes/shared/promptCommands';
import {
  advertisedStagedRecipes,
  legacyPromptCommandCoverage,
  stagedRecipeDefinitions,
  stagedRecipeInventory,
} from './recipeInventory';

describe('staged recipe inventory', () => {
  it('covers every requested action family without advertising pending adapters', () => {
    expect(stagedRecipeInventory.map((recipe) => recipe.id)).toEqual([
      'narration.speech',
      'whatsup.message',
      'whatsup.message-with-artifact',
      'whatsup.picture-message',
      'messenger.exchange',
      'voice.message',
      'image.lookup',
      'image.display',
      'image.generate',
      'image.describe',
      'image.caption',
      'social.post',
      'social.comment',
      'note.write',
      'assistant.chat',
      'bank.transfer',
      'choice.information',
      'ui.control',
    ]);

    expect(stagedRecipeInventory.every((recipe) =>
      recipe.implementation.status === 'executor-backed' || recipe.implementation.status === 'composer-only' || recipe.advertised === false,
    )).toBe(true);
  });

  it('advertises only shared-action-runtime or deterministic-composer backed recipes', () => {
    const advertised = advertisedStagedRecipes();
    expect(advertised.map((recipe) => recipe.id)).toEqual([
      'narration.speech',
      'whatsup.message',
      'whatsup.message-with-artifact',
      'whatsup.picture-message',
      'voice.message',
      'image.generate',
      'social.post',
      'social.comment',
      'note.write',
      'assistant.chat',
      'bank.transfer',
    ]);
    expect(advertised.every((recipe) =>
      (recipe.implementation.status === 'executor-backed' && recipe.implementation.executor === 'shared-action-runtime')
      || (recipe.implementation.status === 'composer-only' && recipe.implementation.executor === 'deterministic-composer'),
    )).toBe(true);
  });

  it('converts advertised recipes into compiler recipe definitions', () => {
    const definitions = stagedRecipeDefinitions();
    expect(definitions.map((recipe) => recipe.id)).toEqual([
      'narration.speech',
      'whatsup.message',
      'whatsup.message-with-artifact',
      'whatsup.picture-message',
      'voice.message',
      'image.generate',
      'social.post',
      'social.comment',
      'note.write',
      'assistant.chat',
      'bank.transfer',
    ]);
    expect(definitions.find((recipe) => recipe.id === 'narration.speech')?.steps.map((step) => step.kind))
      .toEqual(['generate-content']);
    expect(definitions.find((recipe) => recipe.id === 'whatsup.message')?.steps.map((step) => step.kind))
      .toEqual(['generate-content', 'execute-action']);
    expect(definitions.find((recipe) => recipe.id === 'voice.message')?.steps.map((step) => step.kind))
      .toEqual(['generate-content', 'execute-action']);
    expect(definitions.find((recipe) => recipe.id === 'social.post')?.steps.map((step) => step.kind))
      .toEqual(['generate-content', 'execute-action']);
    expect(definitions.find((recipe) => recipe.id === 'social.comment')?.steps.map((step) => step.kind))
      .toEqual(['generate-content', 'execute-action']);
    expect(definitions.find((recipe) => recipe.id === 'bank.transfer')?.steps.map((step) => step.kind))
      .toEqual(['generate-content', 'execute-action']);
    expect(definitions.find((recipe) => recipe.id === 'note.write')?.steps.map((step) => step.kind))
      .toEqual(['generate-content', 'generate-content', 'execute-action']);
    expect(definitions.find((recipe) => recipe.id === 'assistant.chat')?.steps.map((step) => step.kind))
      .toEqual(['generate-content', 'execute-action']);
    expect(definitions.find((recipe) => recipe.id === 'assistant.chat')?.steps.map((step) => step.output))
      .toEqual(['messages', 'receipt']);
    const imageSteps = definitions.find((recipe) => recipe.id === 'image.generate')?.steps ?? [];
    expect(imageSteps[imageSteps.length - 1]?.output).toBe('artifact');
    const pictureMessage = definitions.find((recipe) => recipe.id === 'whatsup.picture-message');
    expect(pictureMessage?.steps).toEqual([
      { key: 'prompt', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
      { key: 'artifact', kind: 'execute-action', output: 'artifact', inputs: ['prompt'], generations: 1 },
      { key: 'draft', kind: 'generate-content', output: 'text', inputs: ['context', 'prompt'], instruction: 'instructions', generations: 0 },
      { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: ['draft', 'artifact'], generations: 0 },
    ]);
  });

  it('restricts the compiled definitions to a route-authored allow-list (S9)', () => {
    const restricted = stagedRecipeDefinitions(['narration.speech', 'whatsup.message']);
    expect(restricted.map((recipe) => recipe.id)).toEqual(['narration.speech', 'whatsup.message']);
  });

  it('treats an empty or omitted allow-list as unrestricted, matching prior behavior', () => {
    expect(stagedRecipeDefinitions([]).map((recipe) => recipe.id)).toEqual(stagedRecipeDefinitions().map((recipe) => recipe.id));
  });

  it('keeps legacy command families inventoried but out of the advertised planner set', () => {
    const coverage = legacyPromptCommandCoverage();
    expect(Object.keys(coverage).sort()).toEqual([...promptCommandIds].sort());
    const advertisedIds = new Set(advertisedStagedRecipes().map((recipe) => recipe.id));

    for (const commandId of promptCommandIds) {
      expect(coverage[commandId].length).toBeGreaterThan(0);
    }
    // bank_transfer/create_note/simulate_ai_chat are all now advertised (2026-09-12:
    // ported to the shared staged executor, same as every other model-authorable
    // family) - assistant.chat needed a new `messages` content-step output kind to
    // carry its variable-length alternating array; see compileTurnPlan.ts/scheduler.ts.
    expect(coverage.bank_transfer.some((id) => advertisedIds.has(id))).toBe(true);
    expect(coverage.create_note.some((id) => advertisedIds.has(id))).toBe(true);
    expect(coverage.simulate_ai_chat.some((id) => advertisedIds.has(id))).toBe(true);
  });

  it('enforces conservative semantic validators for executor-backed recipes', () => {
    const catalog = { scope: { saveId: 'save', branchId: 'branch', turnId: 'turn' }, revision: 'catalog', characterIds: ['alice', 'bob'] };
    const message = stagedRecipeDefinitions().find((recipe) => recipe.id === 'whatsup.message');
    const voice = stagedRecipeDefinitions().find((recipe) => recipe.id === 'voice.message');
    const image = stagedRecipeDefinitions().find((recipe) => recipe.id === 'image.generate');
    const post = stagedRecipeDefinitions().find((recipe) => recipe.id === 'social.post');
    const comment = stagedRecipeDefinitions().find((recipe) => recipe.id === 'social.comment');

    expect(() => message?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { recipientId: 'bob' }, inputs: {} }))
      .not.toThrow();
    expect(() => message?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { recipientId: 'alice' }, inputs: {} }))
      .toThrow('must differ');
    expect(() => voice?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { recipientId: 'bob' }, inputs: {} }))
      .not.toThrow();
    expect(() => voice?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { recipientId: 'alice' }, inputs: {} }))
      .toThrow('must differ');
    expect(() => image?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { ownerId: 'bob' }, inputs: {} }))
      .toThrow('owner must match');
    const pictureMessage = stagedRecipeDefinitions().find((recipe) => recipe.id === 'whatsup.picture-message');
    expect(() => pictureMessage?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { ownerId: 'alice', recipientId: 'bob' }, inputs: {} }))
      .not.toThrow();
    expect(() => pictureMessage?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { ownerId: 'bob', recipientId: 'bob' }, inputs: {} }))
      .toThrow('owner must match');
    expect(() => pictureMessage?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { ownerId: 'alice', recipientId: 'alice' }, inputs: {} }))
      .toThrow('must differ');
    expect(() => post?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { app: 'fotogram' }, inputs: {} }))
      .not.toThrow();
    expect(() => post?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { app: 'myspace' }, inputs: {} }))
      .toThrow('fotogram or onlyfriends');
    expect(() => comment?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { app: 'onlyfriends', postId: 'onlyfriends-post-01' }, inputs: {} }))
      .not.toThrow();
    expect(() => comment?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { app: 'onlyfriends', postId: '' }, inputs: {} }))
      .toThrow('reference an existing post');

    const note = stagedRecipeDefinitions().find((recipe) => recipe.id === 'note.write');
    expect(() => note?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { ownerId: 'alice' }, inputs: {} }))
      .not.toThrow();
    expect(() => note?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { ownerId: 'bob' }, inputs: {} }))
      .toThrow('own Notes app');

    const chat = stagedRecipeDefinitions().find((recipe) => recipe.id === 'assistant.chat');
    expect(() => chat?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { ownerId: 'alice' }, inputs: {} }))
      .not.toThrow();
    expect(() => chat?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { ownerId: 'bob' }, inputs: {} }))
      .toThrow('own assistant app');

    const transfer = stagedRecipeDefinitions().find((recipe) => recipe.id === 'bank.transfer');
    expect(() => transfer?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { fromId: 'alice', toId: 'bob', amount: 25 }, inputs: {} }))
      .not.toThrow();
    expect(() => transfer?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { fromId: 'bob', toId: 'alice', amount: 25 }, inputs: {} }))
      .toThrow('own account');
    expect(() => transfer?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { fromId: 'alice', toId: 'alice', amount: 25 }, inputs: {} }))
      .toThrow('must differ');
    expect(() => transfer?.validate({ actorId: 'alice', initiator: 'model', catalog, args: { fromId: 'alice', toId: 'bob', amount: 0 }, inputs: {} }))
      .toThrow('positive number');
  });

  it('narration.speech is a content-only recipe requiring a known speaker', () => {
    const catalog = { scope: { saveId: 'save', branchId: 'branch', turnId: 'turn' }, revision: 'catalog', characterIds: ['alice', 'bob'] };
    const narration = stagedRecipeDefinitions().find((recipe) => recipe.id === 'narration.speech');
    expect(narration?.steps).toEqual([
      { key: 'speech', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
    ]);
    expect(() => narration?.validate({ actorId: 'alice', initiator: 'model', catalog, args: {}, inputs: {} })).not.toThrow();
    expect(() => narration?.validate({ actorId: 'mallory', initiator: 'model', catalog, args: {}, inputs: {} })).toThrow('speaker');
  });
});
