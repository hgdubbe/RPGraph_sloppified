import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';
import { useRpgraphFiles } from './useRpgraphFiles';
import { emptyRpStorybook } from '../nodes/rp-storybook/model';
import { currentSessionFormatVersion, currentSessionWorkflowFormatVersion } from '../session/version';

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: <T,>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (update: SetStateAction<T>) => {
      hooks.slots[index] = typeof update === 'function' ? (update as (value: T) => T)(hooks.slots[index] as T) : update;
    }];
  },
  useRef: <T,>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
}));
beforeEach(() => { hooks.slots = []; hooks.index = 0; });
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const result = { fileName: 'game.json', name: 'Game', filePath: '/files/game.json' };
  const bridge = {
    saveSession: vi.fn(async () => result), saveStorybook: vi.fn(async () => result),
    saveCurrentSession: vi.fn(async () => result),
    saveCurrentWorkflow: vi.fn(async () => result),
    saveRpgraphFileToPath: vi.fn(async () => ({ ...result, canceled: false })),
    listFiles: vi.fn(async () => []),
    listTurnAutosaves: vi.fn<() => Promise<import('./useRpgraphFiles').LoadedRpgraphFile[]>>(async () => []),
    loadStartupWorkflow: vi.fn(async () => ({ ...result, protection: 'plain', workflow: { nodes: [], edges: [] } })),
    loadFilePath: vi.fn(async () => ({ ...result, type: 'storybook', protection: 'encrypted', value: emptyRpStorybook })),
  };
  vi.stubGlobal('window', { rpgraph: bridge });
  const options = {
    currentWorkflowForSave: async () => ({}), currentSession: async () => ({}),
    currentStorybookForSave: () => ({ storybook: emptyRpStorybook, name: 'Book', nodeId: 'book' }),
    latestSessionTurnNumber: () => 1, suggestedSessionName: () => 'Game', suggestedWorkflowName: () => 'Graph',
    updateRuntimeNode: vi.fn(), notifySystem: vi.fn(), errorMessage: String,
    setActiveStorybookProtection: vi.fn(), setActiveWorkflowProtection: vi.fn(),
    applyStorybookToNode: vi.fn(() => true), onWorkspacePasswordChange: vi.fn(async () => {}),
    applyLoadedWorkflow: vi.fn(), applyLoadedRpgraphFile: vi.fn(), clearWorkspaceForLockedStartup: vi.fn(),
  } as unknown as Parameters<typeof useRpgraphFiles>[0];
  function render() {
    hooks.index = 0;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRpgraphFiles(options);
  }
  return { render, bridge, options };
}

it('saves imported protected content inside the account without another password or external destination', async () => {
  const { render, bridge } = harness();
  Object.assign(bridge, { accounts: {} });
  render().setWorkspacePassword('legacy-import-password');
  render().requestSaveSession();
  render().setFileProtection('encrypted');
  render().setChooseSaveLocation(true);
  await render().saveSession();
  expect(bridge.saveRpgraphFileToPath).not.toHaveBeenCalled();
  expect(bridge.saveSession).toHaveBeenCalledWith('Game', {}, 'plain', '', false);
  expect(render().encryptionRequired).toBe(false);
});

it.each(['/imports/game.json', 'C:\\imports\\game.json'])('opens account Save As instead of overwriting external %s', async (filePath) => {
  const { render, bridge } = harness();
  Object.assign(bridge, { accounts: {} });
  render().activeSessionPathRef.current = filePath;
  render().setActiveSessionFileName('game.json');
  await render().saveCurrentSession();
  expect(bridge.saveCurrentSession).not.toHaveBeenCalled();
  expect(render().sessionPasswordAction).toBe('save-session');
  render().activateWorkflowPath(filePath, 'game.json');
  await render().saveCurrentWorkflow();
  expect(bridge.saveCurrentWorkflow).not.toHaveBeenCalled();
  expect(render().sessionPasswordAction).toBe('save-workflow');
});

it('keeps account-owned quick saves without forwarding legacy encryption passwords', async () => {
  const { render, bridge } = harness();
  Object.assign(bridge, { accounts: {} });
  const filePath = 'C:\\profile\\account-workspaces\\account-id\\files\\game.json';
  render().activeSessionPathRef.current = filePath;
  render().setActiveSessionFileName('game.json');
  render().setWorkspacePassword('legacy-password');
  await render().saveCurrentSession();
  expect(bridge.saveCurrentSession).toHaveBeenCalledWith(filePath, {}, 'plain', '');
});

it.each([false, true])('requires startup consent before reading saved content (autosaves=%s)', async (preferTurnAutosave) => {
  const { render, bridge, options } = harness();
  await render().loadStartupWorkflow({ preferTurnAutosave });
  expect(render().startupRestorePending).toBe(true);
  expect(bridge.listTurnAutosaves).not.toHaveBeenCalled();
  expect(bridge.loadStartupWorkflow).not.toHaveBeenCalled();
  expect(options.applyLoadedWorkflow).not.toHaveBeenCalled();
  render().declineTurnAutosaveChoices();
  await render().confirmStartupRestore();
  expect(render().startupRestorePending).toBe(false);
  expect(bridge.loadStartupWorkflow).not.toHaveBeenCalled();
  await render().loadStartupWorkflow({ preferTurnAutosave });
  await render().confirmStartupRestore();
  expect(bridge.loadStartupWorkflow).toHaveBeenCalledTimes(1);
  expect(options.applyLoadedWorkflow).toHaveBeenCalledTimes(1);
});

it.each([1, 2])('requires selection for %s autosaves and never loads a workflow on decline', async (count) => {
  const { render, bridge, options } = harness();
  const session = {
    format: 'rpgraph-session', formatVersion: currentSessionFormatVersion,
    name: 'Test', savedAt: '2026-01-01',
    metadata: { settings: { englishProcessingEnabled: false, displayLanguage: 'en' } },
    workflow: { format: 'rpgraph-workflow', formatVersion: currentSessionWorkflowFormatVersion, graph: { nodes: [], edges: [] } },
    timeline: [], entities: { images: {}, events: {}, memory: {} },
    runtime: { current: { workflowVariables: {}, nodes: {} }, undo: [] },
    ui: { phoneSeenByConversation: {}, bankingSeenByCharacter: {}, bankingContactsByCharacter: {},
      socialLikesByAccount: {}, dynamicSocialUsers: {}, socialConnectionsByCharacter: {},
      onlyFriendsPurchasesByCharacter: {}, phoneDividerAfterByConversation: {} },
  };
  const choices = Array.from({ length: count }, (_, index) => ({
    fileName: `autosave-${index}.json`, name: 'Test', filePath: '/test',
    type: 'session' as const, protection: 'plain' as const, value: session,
  }));
  bridge.listTurnAutosaves.mockResolvedValue(choices);
  await render().loadStartupWorkflow({ preferTurnAutosave: true });
  await render().confirmStartupRestore();
  expect(render().turnAutosaveChoices).toHaveLength(count);
  expect(options.applyLoadedRpgraphFile).not.toHaveBeenCalled();
  render().declineTurnAutosaveChoices();
  expect(bridge.loadStartupWorkflow).not.toHaveBeenCalled();
  expect(options.applyLoadedWorkflow).not.toHaveBeenCalled();
  await render().loadStartupWorkflow({ preferTurnAutosave: true });
  await render().confirmStartupRestore();
  await render().chooseTurnAutosave(choices[0]);
  expect(options.applyLoadedRpgraphFile).toHaveBeenCalledWith(choices[0], '');
});

it('lists encrypted autosaves without opening them and retains choices after a wrong password', async () => {
  const { render, bridge, options } = harness();
  const choice = { fileName: 'autosave.json', filePath: '/files/autosave.json', name: 'Turn Autosave',
    type: 'session' as const, protection: 'encrypted' as const, value: null };
  bridge.listTurnAutosaves.mockResolvedValue([choice]);
  await render().loadStartupWorkflow({ preferTurnAutosave: true });
  await render().confirmStartupRestore();
  expect(render().turnAutosaveChoices).toEqual([choice]);
  expect(bridge.loadFilePath).not.toHaveBeenCalled();
  bridge.loadFilePath.mockRejectedValueOnce(new Error('Wrong password'));
  await expect(render().chooseTurnAutosave(choice, 'wrong')).rejects.toThrow('Wrong password');
  expect(options.applyLoadedRpgraphFile).not.toHaveBeenCalled();
  expect(render().turnAutosaveChoices).toEqual([choice]);
  await render().chooseTurnAutosave(choice, 'secret');
  expect(bridge.loadFilePath).toHaveBeenLastCalledWith(choice.filePath, 'secret');
  expect(options.applyLoadedRpgraphFile).toHaveBeenCalledWith(expect.anything(), 'secret');
  expect(render().turnAutosaveChoices).toEqual([]);
});

it('asks for a protected workspace password only after startup consent', async () => {
  const { render, bridge, options } = harness();
  bridge.loadStartupWorkflow.mockResolvedValue(Object.assign({
    fileName: 'locked.json', name: 'Locked', filePath: '/files/locked.json',
    protection: 'encrypted', workflow: { nodes: [], edges: [] },
  }, { requiresPassword: true }));
  await render().loadStartupWorkflow();
  expect(render().sessionPasswordAction).toBeNull();
  expect(bridge.loadStartupWorkflow).not.toHaveBeenCalled();
  await render().confirmStartupRestore();
  expect(render().sessionPasswordAction).toBe('load');
  expect(options.applyLoadedWorkflow).not.toHaveBeenCalled();
  await render().confirmStartupRestore();
  expect(bridge.loadStartupWorkflow).toHaveBeenCalledTimes(1);
});

it.each([false, true])('inherits an encrypted Storybook password for RP saves (chosen path: %s)', async (choosePath) => {
  const { render, bridge } = harness();
  render().requestSaveStorybook();
  render().setFileProtection('encrypted');
  render().setSessionPassword('book-secret');
  await render().saveStorybook();
  expect(render().encryptionRequired).toBe(true);
  render().requestSaveSession();
  render().setFileProtection('plain');
  render().setSessionPassword('different');
  render().setChooseSaveLocation(choosePath);
  expect(render().fileProtection).toBe('encrypted');
  expect(render().sessionPassword).toBe('book-secret');
  await render().saveSession();
  if (choosePath) expect(bridge.saveRpgraphFileToPath).toHaveBeenCalledWith(expect.objectContaining({ protection: 'encrypted', password: 'book-secret' }));
  else expect(bridge.saveSession).toHaveBeenCalledWith('Game', {}, 'encrypted', 'book-secret', false);
});

it('upgrades an existing plain RP quick save after loading a protected Storybook', async () => {
  const { render, bridge } = harness();
  render().activeSessionPathRef.current = '/files/plain.json';
  render().setActiveSessionFileName('plain.json');
  render().setActiveSessionProtection('plain');
  render().setPendingStorybookLoad({ nodeId: 'book', fileName: 'book.json', filePath: '/files/book.json' });
  render().setSessionPassword('book-secret');
  await render().unlockStorybookFile();
  await render().saveCurrentSession();
  expect(bridge.saveCurrentSession).toHaveBeenCalledWith('/files/plain.json', {}, 'encrypted', 'book-secret');
});

it('rejects a conflicting Storybook password without applying its content', async () => {
  const { render, options } = harness();
  render().setWorkspacePassword('first');
  render().setPendingStorybookLoad({ nodeId: 'book', fileName: 'book.json', filePath: '/files/book.json' });
  render().setSessionPassword('second');
  await render().unlockStorybookFile();
  expect(options.applyStorybookToNode).not.toHaveBeenCalled();
  expect(render().workspacePasswordRef.current).toBe('first');
});

it('allows a replacement Storybook password when the workflow is unprotected', async () => {
  const { render, options } = harness();
  options.workflowRequiresProtection = () => false;
  render().setWorkspacePassword('first');
  render().setPendingStorybookLoad({ nodeId: 'book', fileName: 'book.json', filePath: '/files/book.json' });
  render().setSessionPassword('second');
  await render().unlockStorybookFile();
  expect(options.applyStorybookToNode).toHaveBeenCalled();
  expect(render().workspacePasswordRef.current).toBe('second');
});

it('preserves the workflow name and source protection when saving an RP', async () => {
  const { render, options } = harness();
  render().activateWorkflowPath('/files/original.json', 'original.json');
  render().requestSaveSession();
  await render().saveSession();
  expect(render().activeWorkflowFileName).toBe('original.json');
  expect(options.setActiveWorkflowProtection).not.toHaveBeenCalled();
});

it.each([false, true])('releases Storybook-only protection on replacement (protected workflow: %s)', (protectedWorkflow) => {
  const { render, options } = harness();
  options.workflowRequiresProtection = () => protectedWorkflow;
  render().setWorkspacePassword('book-secret');
  render().completeStorybookReplacement('plain');
  expect(render().encryptionRequired).toBe(protectedWorkflow);
  expect(render().workspacePasswordRef.current).toBe(protectedWorkflow ? 'book-secret' : '');
  expect(options.onWorkspacePasswordChange).toHaveBeenLastCalledWith(protectedWorkflow ? 'book-secret' : '');
});

it.each(['plain', 'encrypted'] as const)('makes an RP-derived workflow follow the replacement Storybook: %s', (protection) => {
  const { render, options } = harness();
  options.workflowRequiresProtection = () => true;
  options.workflowFollowsStorybookProtection = () => true;
  render().setWorkspacePassword('old-save-secret');
  render().completeStorybookReplacement(protection);
  expect(options.setActiveWorkflowProtection).toHaveBeenLastCalledWith(protection);
  if (protection === 'plain') {
    expect(render().encryptionRequired).toBe(false);
    expect(options.onWorkspacePasswordChange).toHaveBeenLastCalledWith('');
  }
});

it('replaces an inherited RP password with the new encrypted Storybook password', async () => {
  const { render, options } = harness();
  options.workflowRequiresProtection = () => true;
  options.workflowFollowsStorybookProtection = () => true;
  render().setWorkspacePassword('old-save-secret');
  render().setPendingStorybookLoad({ nodeId: 'book', fileName: 'book.json', filePath: '/files/book.json' });
  render().setSessionPassword('new-book-secret');
  await render().unlockStorybookFile();
  expect(options.applyStorybookToNode).toHaveBeenCalled();
  expect(render().workspacePasswordRef.current).toBe('new-book-secret');
});
