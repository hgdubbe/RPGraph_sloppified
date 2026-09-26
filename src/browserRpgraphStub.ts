// Dev-only fallback for `window.rpgraph`, the API the Electron preload script
// normally injects. Electron always sets `window.rpgraph` before this module
// runs, so this only ever activates in a plain browser tab (e.g. `npm run dev`).
//
// Most call sites already guard with `window.rpgraph?.foo` and fall back to a
// browser-friendly path (see npcLibrary.ts, themeRegistry.ts, etc.), so this
// stub deliberately leaves window.rpgraph *unset* rather than replacing it
// wholesale — that would bypass those existing fallbacks. It only patches the
// handful of call sites that dereference window.rpgraph unconditionally
// outside a try/catch (so a real desktop-only crash doesn't also block
// browser-based visual/layout debugging).
//
// loadStartupWorkflow returns the bundled default workflow with its rp-storybook
// node's storybookJson swapped for a bundled sample storybook (full cast, banking,
// notes, ChatGPD chats, social posts) instead of the normal empty one, so a plain
// browser preview has real chat/phone content to look at instead of every screen
// being an empty state. Lazily loaded via import.meta.glob (like npcLibrary.ts)
// since these JSON files carry multi-MB embedded images and must stay out of the
// renderer entry chunk.
const defaultWorkflowLoader = import.meta.glob('../resources/default-content/default_normal_v35.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;
const mockStorybookLoader = import.meta.glob('../resources/default-content/Our_Family_Secrets_v1.0.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

async function buildBrowserMockStartupWorkflow(): Promise<unknown> {
  const [loadWorkflow] = Object.values(defaultWorkflowLoader);
  const [loadStorybook] = Object.values(mockStorybookLoader);
  if (!loadWorkflow || !loadStorybook) {
    return null;
  }
  const [workflowRaw, storybookJson] = await Promise.all([loadWorkflow(), loadStorybook()]);
  const workflow = JSON.parse(workflowRaw) as { nodes?: Array<{ data?: Record<string, unknown> }> };
  const storyNode = workflow.nodes?.find((node) => node.data?.nodeType === 'rp-storybook');
  if (storyNode?.data) {
    storyNode.data.storybookJson = storybookJson;
    storyNode.data.storybookFileName = 'Our_Family_Secrets_v1.0.json';
    storyNode.data.preview = 'Our Family Secrets (browser preview mock data)';
  }
  return workflow;
}

if (typeof window !== 'undefined' && !window.rpgraph) {
  window.rpgraph = {
    setZoomFactor: () => {},
    onWindowCleanupBeforeClose: () => () => {},
    finishWindowCloseCleanup: async () => {},
    saveSettings: async () => ({ filePath: '', apiKeyEncryptionAvailable: false }),
    loadSettings: async () => ({
      filePath: '',
      settings: null,
      apiKeyEncryptionAvailable: false,
      apiKeyDecryptionUnavailable: false,
    }),
    listFiles: async () => [],
    listTurnAutosaves: async () => [],
    loadStartupWorkflow: async () => ({
      fileName: 'browser-preview-mock.json',
      name: 'Browser Preview Mock Data',
      filePath: '',
      type: 'workflow',
      protection: 'plain',
      workflow: await buildBrowserMockStartupWorkflow(),
    }),
  } as unknown as Window['rpgraph'];
}
