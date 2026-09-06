# Code Quality Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve RPGraph Studio's code quality step by step without changing user-facing behavior unless a task explicitly says so.

**Architecture:** Stabilize the current app first with diagnostics and tests, then introduce narrow boundaries around Electron IPC, providers, settings, graph execution, storybook editing, and phone UI. Each task should keep the app buildable and mergeable on its own, avoiding broad rewrites that change behavior and structure at the same time.

**Tech Stack:** Electron 41, React 19, TypeScript 5.9, Vite 7, Vitest, Playwright, Node.js >=24.

**Spec:** `docs/review/code-quality-cleanup-findings.md`

## Global Constraints

- Keep the current look, behavior, save formats, and local-first model unless a task explicitly defines a visible behavior change.
- Work in a new cleanup worktree created from `master`; do not edit unrelated dirty files in other worktrees.
- Prefer focused extraction, adapter, and validation changes over large rewrites.
- Add or move tests before changing behavior-sensitive code.
- Run the narrowest relevant test after each task, then run `npm run build` before each commit.
- Use frequent commits; one task should produce one reviewable commit.
- Do not introduce network dependencies for runtime validation unless they are already project dependencies.
- Keep backwards compatibility for `window.rpgraph` while migrating to grouped preload APIs.

---

## File Structure

Planned new or modified areas:

- `electron/main.cjs`: Keep as bootstrap and registration host during migration; gradually reduce direct domain logic.
- `electron/ipc/registerIpc.cjs`: New top-level IPC registration coordinator.
- `electron/ipc/crashDiagnostics.cjs`: New renderer/process crash logging and startup recovery notice support.
- `electron/ipc/validation.cjs`: New local runtime guards for IPC payloads.
- `electron/ipc/files.cjs`: New file, workflow, storybook, character, autosave IPC registration.
- `electron/ipc/llm.cjs`: New LLM chat/list/cancel handler registration.
- `electron/providers/*.cjs`: New provider adapters for LM Studio, llama.cpp, Ollama, OpenRouter, Composite, Gemini, and Venice over time.
- `electron/*.test.ts`: Existing Electron-side Vitest tests; add targeted tests for validators, adapters, file path guards, and crash diagnostics helpers.
- `src/electron.d.ts`: Keep legacy preload type declarations; add grouped API types as migration starts.
- `electron/preload.cjs`: Add grouped API namespaces while keeping flat methods.
- `src/app/useGraphRun.ts`: Keep public hook initially, but move pure preparation/parsing/commit helpers into separate modules.
- `src/app/runGraphRequest.ts`: New request-object types and positional adapter helpers.
- `src/app/runGraphPipeline.ts`: New staged run preparation/parsing/commit helpers.
- `src/settings.ts`: Move settings model normalization toward a reducer/store module.
- `src/settings/settingsModel.ts`: New normalized settings model and conversion helpers.
- `src/components/AppDialogs.tsx`: Reduce storybook draft/apply duplication.
- `src/components/StorybookEditorDialog.tsx`: Use shared draft/apply hook.
- `src/storybook/useApplyDraft.ts`: New shared RAM-draft/apply hook.
- `src/components/PhonePanel.tsx`: Keep as coordinator; extract desktop, tray, and app routing.
- `src/components/RoleplayPhoneDevice.tsx`: Own phone chrome slots.
- `src/phone/*`: New phone subsystem modules.
- `src/styles.css`: Reduce scattered phone overrides gradually; later split or group sections if build setup stays simple.
- `src/workflow/validation.fixtures.test.ts`: Split into domain-focused test files after behavior is protected.

---

## Phase 0: Baseline and Worktree

### Task 1: Create the cleanup worktree and baseline report

**Files:**
- Create: `docs/review/cleanup-baseline.md`
- Modify: none

**Interfaces:**
- Consumes: current `master`
- Produces: a baseline document recording branch, commit, test status, and known untracked files

- [ ] **Step 1: Create an isolated worktree**

Run:

```powershell
git worktree add .worktrees/code-quality-cleanup master
```

Expected: a new worktree exists at `C:\Users\hen\Documents\ChatGPT\rpgraph\.worktrees\code-quality-cleanup`.

- [ ] **Step 2: Capture repo state**

Run:

```powershell
git status --short
git rev-parse --short HEAD
```

Expected: only known unrelated untracked release folders may appear in the main checkout; the cleanup worktree should be clean.

- [ ] **Step 3: Run baseline checks**

Run from the cleanup worktree:

```powershell
npm run build
npm run test
```

Expected: both pass. If one fails, document the exact failing command and failure in the baseline before making cleanup changes.

- [ ] **Step 4: Write baseline doc**

Create `docs/review/cleanup-baseline.md`:

```markdown
# Cleanup Baseline

Branch: `codex/code-quality-cleanup`
Base commit: `<fill with git rev-parse --short HEAD output>`
Date: 2026-09-06

## Checks

- `npm run build`: `<pass/fail and short note>`
- `npm run test`: `<pass/fail and short note>`

## Scope

Cleanup plan: `docs/superpowers/plans/2026-09-06-code-quality-cleanup.md`
Review source: `docs/review/code-quality-cleanup-findings.md`
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add docs/review/cleanup-baseline.md
git commit -m "docs: record code cleanup baseline"
```

---

## Phase 1: Diagnostics and Boundary Tests

### Task 2: Add Electron crash diagnostics

**Files:**
- Create: `electron/ipc/crashDiagnostics.cjs`
- Create: `electron/crashDiagnostics.test.ts`
- Modify: `electron/main.cjs`

**Interfaces:**
- Consumes: `BrowserWindow`, `app.getPath('userData')`, existing `createWindow`
- Produces:
  - `registerCrashDiagnostics(app, window, options?)`
  - `readRecentCrashDiagnostics(options?)`
  - `appendDiagnosticLog(kind, details, options?)`

- [ ] **Step 1: Write tests for bounded diagnostic logging**

Create `electron/crashDiagnostics.test.ts`:

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const diagnostics = await import('./ipc/crashDiagnostics.cjs');

describe('crash diagnostics', () => {
  it('keeps only the most recent crash records', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-crash-'));
    try {
      for (let index = 0; index < 7; index += 1) {
        await diagnostics.appendDiagnosticLog(
          'render-process-gone',
          { reason: `reason-${index}` },
          { directory, limit: 5 },
        );
      }

      const records = await diagnostics.readRecentCrashDiagnostics({ directory });
      expect(records).toHaveLength(5);
      expect(records[0].details.reason).toBe('reason-2');
      expect(records[4].details.reason).toBe('reason-6');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run electron/crashDiagnostics.test.ts
```

Expected: FAIL because `electron/ipc/crashDiagnostics.cjs` does not exist.

- [ ] **Step 3: Implement diagnostics module**

Create `electron/ipc/crashDiagnostics.cjs`:

```js
const fs = require('node:fs/promises');
const path = require('node:path');

function diagnosticsPath(options = {}) {
  const directory = options.directory;
  if (!directory) {
    throw new Error('Crash diagnostics directory is required.');
  }
  return path.join(directory, 'crash-diagnostics.json');
}

async function readRecentCrashDiagnostics(options = {}) {
  try {
    const contents = await fs.readFile(diagnosticsPath(options), 'utf8');
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function appendDiagnosticLog(kind, details = {}, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const filePath = diagnosticsPath(options);
  const records = await readRecentCrashDiagnostics(options);
  records.push({
    kind: String(kind),
    details,
    createdAt: new Date().toISOString(),
  });
  const nextRecords = records.slice(-limit);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(nextRecords, null, 2)}\n`, 'utf8');
}

function registerCrashDiagnostics(app, window) {
  const options = { directory: app.getPath('userData') };
  window.webContents.on('render-process-gone', (_event, details) => {
    void appendDiagnosticLog('render-process-gone', details, options);
  });
  window.on('unresponsive', () => {
    void appendDiagnosticLog('window-unresponsive', {}, options);
  });
  window.on('responsive', () => {
    void appendDiagnosticLog('window-responsive', {}, options);
  });
  app.on('child-process-gone', (_event, details) => {
    void appendDiagnosticLog('child-process-gone', details, options);
  });
}

module.exports = {
  appendDiagnosticLog,
  readRecentCrashDiagnostics,
  registerCrashDiagnostics,
};
```

- [ ] **Step 4: Wire diagnostics into `createWindow`**

Modify `electron/main.cjs` near the other requires:

```js
const { registerCrashDiagnostics } = require('./ipc/crashDiagnostics.cjs');
```

Call it after the `BrowserWindow` is created:

```js
registerCrashDiagnostics(app, window);
```

- [ ] **Step 5: Run checks**

Run:

```powershell
npx vitest run electron/crashDiagnostics.test.ts
npm run build
```

Expected: both pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add electron/main.cjs electron/ipc/crashDiagnostics.cjs electron/crashDiagnostics.test.ts
git commit -m "feat: log electron crash diagnostics"
```

### Task 3: Add reusable IPC payload validators

**Files:**
- Create: `electron/ipc/validation.cjs`
- Create: `electron/ipcValidation.test.ts`
- Modify: none at first, then `electron/main.cjs` in later tasks

**Interfaces:**
- Consumes: unknown IPC payloads
- Produces:
  - `assertObject(value, label)`
  - `assertString(value, label)`
  - `assertOptionalString(value, label)`
  - `assertProviderConnection(value)`
  - `assertChatCompletionRequest(value)`
  - `assertSettingsPayload(value)`

- [ ] **Step 1: Write validator tests**

Create `electron/ipcValidation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

const validation = await import('./ipc/validation.cjs');

describe('IPC validation', () => {
  it('rejects missing chat prompt and connection', () => {
    expect(() => validation.assertChatCompletionRequest(null)).toThrow('chat completion');
    expect(() => validation.assertChatCompletionRequest({ prompt: 'hi' })).toThrow('connection');
    expect(() => validation.assertChatCompletionRequest({ connection: {}, prompt: 123 })).toThrow('prompt');
  });

  it('accepts a minimal chat request', () => {
    const request = {
      connection: { id: 'local', provider: 'lmstudio', baseUrl: 'http://127.0.0.1:1234', model: 'model' },
      prompt: 'Hello',
    };
    expect(validation.assertChatCompletionRequest(request)).toBe(request);
  });

  it('rejects settings payloads without the RPGraph settings marker', () => {
    expect(() => validation.assertSettingsPayload({})).toThrow('settings');
    expect(() => validation.assertSettingsPayload({ format: 'rpgraph-settings', version: 1 })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run electron/ipcValidation.test.ts
```

Expected: FAIL because `electron/ipc/validation.cjs` does not exist.

- [ ] **Step 3: Implement validators**

Create `electron/ipc/validation.cjs`:

```js
function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}: expected a string.`);
  }
  return value;
}

function assertOptionalString(value, label) {
  if (value === undefined || value === null) {
    return '';
  }
  return assertString(value, label);
}

function assertProviderConnection(value) {
  const connection = assertObject(value, 'provider connection');
  assertOptionalString(connection.id, 'provider connection id');
  assertOptionalString(connection.provider, 'provider connection provider');
  assertOptionalString(connection.baseUrl, 'provider connection baseUrl');
  assertOptionalString(connection.model, 'provider connection model');
  return connection;
}

function assertChatCompletionRequest(value) {
  const request = assertObject(value, 'chat completion request');
  if (!request.connection) {
    throw new Error('Invalid chat completion request: missing connection.');
  }
  assertProviderConnection(request.connection);
  assertString(request.prompt, 'chat completion prompt');
  return request;
}

function assertSettingsPayload(value) {
  const settings = assertObject(value, 'settings payload');
  if (settings.format !== 'rpgraph-settings' || settings.version !== 1) {
    throw new Error('Invalid settings payload: expected RPGraph settings v1.');
  }
  return settings;
}

module.exports = {
  assertObject,
  assertString,
  assertOptionalString,
  assertProviderConnection,
  assertChatCompletionRequest,
  assertSettingsPayload,
};
```

- [ ] **Step 4: Run checks**

Run:

```powershell
npx vitest run electron/ipcValidation.test.ts
npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add electron/ipc/validation.cjs electron/ipcValidation.test.ts
git commit -m "test: add ipc payload validators"
```

---

## Phase 2: Electron Backend Separation

### Task 4: Apply validators to highest-risk IPC handlers

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/ipcValidation.test.ts`
- Modify: `electron/ipc/validation.cjs`

**Interfaces:**
- Consumes: validators from Task 3
- Produces: validated inputs for `llm:chat-completion`, `llm:chat-completion-stream`, and `settings:save`

- [ ] **Step 1: Extend tests for streaming and settings**

Add to `electron/ipcValidation.test.ts`:

```ts
it('accepts optional chat image arrays and max token numbers without requiring them', () => {
  const request = {
    connection: { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'model' },
    prompt: 'Describe this',
    images: [],
    maxTokens: 400,
  };
  expect(validation.assertChatCompletionRequest(request)).toBe(request);
});
```

- [ ] **Step 2: Run test**

Run:

```powershell
npx vitest run electron/ipcValidation.test.ts
```

Expected: PASS before wiring if validators already accept this shape.

- [ ] **Step 3: Wire validators into handlers**

Modify `electron/main.cjs`:

```js
const {
  assertChatCompletionRequest,
  assertSettingsPayload,
} = require('./ipc/validation.cjs');
```

At the start of the two chat handlers:

```js
const validatedRequest = assertChatCompletionRequest(request);
```

Then use `validatedRequest` throughout the handler.

At the start of `settings:save`:

```js
const validatedSettings = assertSettingsPayload(settings);
```

Then use `validatedSettings` in `settingsForDisk`.

- [ ] **Step 4: Run provider and settings-related tests**

Run:

```powershell
npx vitest run electron/lmStudioChat.test.ts electron/veniceApi.test.ts electron/compositeApi.test.ts electron/ipcValidation.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add electron/main.cjs electron/ipc/validation.cjs electron/ipcValidation.test.ts
git commit -m "refactor: validate core ipc payloads"
```

### Task 5: Extract provider adapters behind a shared interface

**Files:**
- Create: `electron/providers/providerAdapter.cjs`
- Create: `electron/providers/lmStudioAdapter.cjs`
- Create: `electron/providers/openAiCompatibleAdapter.cjs`
- Create: `electron/providerAdapter.test.ts`
- Modify: `electron/main.cjs`

**Interfaces:**
- Consumes: existing provider helper functions in `main.cjs`
- Produces:
  - `providerAdapterFor(connection, deps)`
  - adapter method `chat(request, abort)`
  - adapter method `listModels(connection, abort)`

- [ ] **Step 1: Write adapter selection tests**

Create `electron/providerAdapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

const { providerAdapterKind } = await import('./providers/providerAdapter.cjs');

describe('provider adapters', () => {
  it('selects LM Studio for native LM Studio connections', () => {
    expect(providerAdapterKind({ provider: 'lmstudio' })).toBe('lmstudio');
  });

  it('selects OpenAI-compatible fallback for plain base URL connections', () => {
    expect(providerAdapterKind({ baseUrl: 'http://127.0.0.1:1234', model: 'm' })).toBe('openai-compatible');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run electron/providerAdapter.test.ts
```

Expected: FAIL because adapter module does not exist.

- [ ] **Step 3: Implement adapter kind selection only**

Create `electron/providers/providerAdapter.cjs`:

```js
function providerAdapterKind(connection) {
  if (connection && connection.provider === 'lmstudio') {
    return 'lmstudio';
  }
  if (connection && connection.provider === 'gemini') {
    return 'gemini';
  }
  if (connection && connection.provider === 'venice') {
    return 'venice';
  }
  if (connection && connection.provider === 'ollama') {
    return 'ollama';
  }
  if (connection && connection.provider === 'openrouter') {
    return 'openrouter';
  }
  if (connection && connection.provider === 'composite') {
    return 'composite';
  }
  return 'openai-compatible';
}

module.exports = { providerAdapterKind };
```

- [ ] **Step 4: Move one provider at a time**

First move LM Studio chat request construction into `electron/providers/lmStudioAdapter.cjs`. Export:

```js
async function chat(request, deps, abort) {
  const result = await deps.requestLmStudioChat(request, abort);
  return result;
}

module.exports = { chat };
```

Then adjust only the LM Studio branch of `llm:chat-completion` to call this adapter. Keep all existing helper functions in `main.cjs` for this first extraction so behavior does not change.

- [ ] **Step 5: Run provider checks**

Run:

```powershell
npx vitest run electron/lmStudioChat.test.ts electron/providerAdapter.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add electron/main.cjs electron/providers electron/providerAdapter.test.ts
git commit -m "refactor: introduce llm provider adapters"
```

### Task 6: Group the preload API while keeping legacy flat methods

**Files:**
- Modify: `electron/preload.cjs`
- Modify: `src/electron.d.ts`
- Create: `electron/preloadApiShape.test.ts`

**Interfaces:**
- Consumes: existing flat `window.rpgraph` methods
- Produces:
  - `window.rpgraph.api.llm`
  - `window.rpgraph.api.files`
  - `window.rpgraph.api.settings`
  - `window.rpgraph.api.comfy`
  - `window.rpgraph.api.window`

- [ ] **Step 1: Extract API object creation**

In `electron/preload.cjs`, wrap the exposed object in a function:

```js
function createRpgraphApi() {
  const legacy = {
    listModels: (connection, onAbort) =>
      abortableLlmInvoke('llm:list-models', { connection }, onAbort),
    // keep existing methods here
  };
  return {
    ...legacy,
    api: {
      llm: {
        listModels: legacy.listModels,
        chatCompletion: legacy.chatCompletion,
        streamChatCompletion: legacy.streamChatCompletion,
      },
      files: {
        list: legacy.listFiles,
        load: legacy.loadFile,
        loadPath: legacy.loadFilePath,
        saveToPath: legacy.saveRpgraphFileToPath,
      },
      settings: {
        load: legacy.loadSettings,
        save: legacy.saveSettings,
      },
      comfy: {
        runWorkflow: legacy.runComfyWorkflow,
        inspectWorkflow: legacy.inspectComfyWorkflow,
      },
      window: {
        minimize: legacy.minimizeWindow,
        toggleMaximize: legacy.toggleMaximizeWindow,
        close: legacy.closeWindow,
      },
    },
  };
}
```

Expose with:

```js
contextBridge.exposeInMainWorld('rpgraph', createRpgraphApi());
```

- [ ] **Step 2: Update TypeScript declarations**

In `src/electron.d.ts`, add grouped API declarations while leaving all flat declarations intact:

```ts
api: {
  llm: {
    chatCompletion: Window['rpgraph']['chatCompletion'];
    streamChatCompletion: Window['rpgraph']['streamChatCompletion'];
    listModels: Window['rpgraph']['listModels'];
  };
  files: {
    list: Window['rpgraph']['listFiles'];
    load: Window['rpgraph']['loadFile'];
    loadPath: Window['rpgraph']['loadFilePath'];
    saveToPath: Window['rpgraph']['saveRpgraphFileToPath'];
  };
  settings: {
    load: Window['rpgraph']['loadSettings'];
    save: Window['rpgraph']['saveSettings'];
  };
  window: {
    minimize: Window['rpgraph']['minimizeWindow'];
    toggleMaximize: Window['rpgraph']['toggleMaximizeWindow'];
    close: Window['rpgraph']['closeWindow'];
  };
};
```

- [ ] **Step 3: Run checks**

Run:

```powershell
npm run build
```

Expected: build passes and existing renderer calls continue to compile.

- [ ] **Step 4: Commit**

Run:

```powershell
git add electron/preload.cjs src/electron.d.ts
git commit -m "refactor: group preload api capabilities"
```

---

## Phase 3: Graph Execution Cleanup

### Task 7: Introduce `RunGraphRequest` and compatibility adapter

**Files:**
- Create: `src/app/runGraphRequest.ts`
- Create: `src/app/runGraphRequest.test.ts`
- Modify: `src/app/useGraphRun.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: current positional `runGraph` argument shape
- Produces:
  - `type RunGraphRequest`
  - `runGraphFromRequest(request: RunGraphRequest)`
  - temporary `runGraphLegacy(...)` wrapper

- [ ] **Step 1: Write request normalization tests**

Create `src/app/runGraphRequest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeRunGraphRequest } from './runGraphRequest';

describe('RunGraphRequest', () => {
  it('defaults optional message metadata without changing required input', () => {
    expect(normalizeRunGraphRequest({ inputText: 'hello' })).toMatchObject({
      inputText: 'hello',
      images: [],
      directActionOnly: false,
      isPhoneMessage: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run src/app/runGraphRequest.test.ts
```

Expected: FAIL because `runGraphRequest.ts` does not exist.

- [ ] **Step 3: Implement request type and normalizer**

Create `src/app/runGraphRequest.ts` with only the fields currently used by callers:

```ts
import type { ImageAttachment, MessageRecord } from '../types';

export type RunGraphRequest = {
  inputText: string;
  images?: ImageAttachment[];
  historyMessages?: MessageRecord[];
  directActionOnly?: boolean;
  isPhoneMessage?: boolean;
  phoneRecipient?: string;
  contextComment?: string;
};

export function normalizeRunGraphRequest(request: RunGraphRequest): Required<Pick<
  RunGraphRequest,
  'inputText' | 'images' | 'directActionOnly' | 'isPhoneMessage'
>> & RunGraphRequest {
  return {
    ...request,
    images: request.images ?? [],
    directActionOnly: request.directActionOnly ?? false,
    isPhoneMessage: request.isPhoneMessage ?? false,
  };
}
```

- [ ] **Step 4: Add object-based wrapper inside `useGraphRun`**

In `src/app/useGraphRun.ts`, keep the existing positional function private and expose:

```ts
async function runGraphFromRequest(request: RunGraphRequest) {
  const normalized = normalizeRunGraphRequest(request);
  return runGraph(
    normalized.inputText,
    normalized.images,
    undefined,
    normalized.historyMessages,
    undefined,
    normalized.directActionOnly,
    normalized.isPhoneMessage,
  );
}

return { runGraph, runGraphFromRequest };
```

Do not migrate all callers yet.

- [ ] **Step 5: Run checks**

Run:

```powershell
npx vitest run src/app/runGraphRequest.test.ts src/chat/turnVariants.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/app/runGraphRequest.ts src/app/runGraphRequest.test.ts src/app/useGraphRun.ts
git commit -m "refactor: add run graph request adapter"
```

### Task 8: Migrate phone and regeneration call sites to request objects

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/app/useDirectAppActions.ts`
- Modify: `src/app/useGraphRun.ts`
- Modify: `src/app/runGraphRequest.ts`

**Interfaces:**
- Consumes: `runGraphFromRequest(request)`
- Produces: fewer positional `runGraph(...)` calls in behavior-sensitive paths

- [ ] **Step 1: Locate current positional calls**

Run:

```powershell
rg -n "runGraph\\(" src/App.tsx src/app
```

Expected: list of call sites around autoplay, phone submission, direct app actions, regeneration, and reply/refavor flows.

- [ ] **Step 2: Migrate phone-message submission first**

Replace phone submission calls like:

```ts
void runGraph(message, images, undefined, messagesRef.current, undefined, false, true);
```

with:

```ts
void runGraphFromRequest({
  inputText: message,
  images,
  historyMessages: messagesRef.current,
  isPhoneMessage: true,
  phoneRecipient: selectedPhoneContact.character,
  contextComment: phoneRunContextComment,
});
```

- [ ] **Step 3: Migrate regeneration/reflavor calls**

Replace regeneration calls with request objects that explicitly include:

```ts
{
  inputText,
  historyMessages,
  replacement,
  replacedMessageIds,
  directActionOnly: false,
}
```

Add any missing fields to `RunGraphRequest` before using them.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npx vitest run src/chat/turnVariants.test.ts src/workflow/textHelpers.contextNotes.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/App.tsx src/app/useDirectAppActions.ts src/app/useGraphRun.ts src/app/runGraphRequest.ts
git commit -m "refactor: migrate graph calls to request objects"
```

### Task 9: Extract phone/social output commit helpers from `useGraphRun`

**Files:**
- Create: `src/app/phoneOutputCommits.ts`
- Create: `src/app/phoneOutputCommits.test.ts`
- Modify: `src/app/useGraphRun.ts`

**Interfaces:**
- Consumes: parsed phone output, messages, image attachments, phone characters
- Produces:
  - `buildPhoneOutputCommits(input: PhoneOutputCommitInput): PhoneOutputCommit[]`
  - `applyPhoneOutputCommits(commits, callbacks)`

- [ ] **Step 1: Write a pure helper test**

Create a minimal test covering canonical names and image attachment propagation:

```ts
import { describe, expect, it } from 'vitest';
import { buildPhoneOutputCommits } from './phoneOutputCommits';

describe('phone output commits', () => {
  it('builds one phone-message commit per parsed phone reply', () => {
    const commits = buildPhoneOutputCommits({
      phoneCharacters: [{ name: 'Helga Harper' }, { name: 'Espen Harper' }],
      replies: [{ from: 'Helga', to: 'Espen', message: 'hey' }],
      existingMessages: [],
    });
    expect(commits).toMatchObject([
      { type: 'append-phone-message', from: 'Helga Harper', to: 'Espen Harper', message: 'hey' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run src/app/phoneOutputCommits.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Extract only pure mapping first**

Move canonicalization and commit-shape creation out of `useGraphRun`, but keep actual `appendPhoneMessage`, `updateMessage`, and `notifySystem` calls in the hook.

- [ ] **Step 4: Run checks**

Run:

```powershell
npx vitest run src/app/phoneOutputCommits.test.ts src/chat/phoneMessages.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/app/phoneOutputCommits.ts src/app/phoneOutputCommits.test.ts src/app/useGraphRun.ts
git commit -m "refactor: extract phone output commits"
```

---

## Phase 4: Settings and Storybook Editor State

### Task 10: Introduce a normalized settings model

**Files:**
- Create: `src/settings/settingsModel.ts`
- Create: `src/settings/settingsModel.test.ts`
- Modify: `src/settings.ts`

**Interfaces:**
- Consumes: `AppSettings`, default setting constants
- Produces:
  - `defaultSettingsState()`
  - `settingsStateFromAppSettings(settings)`
  - `appSettingsFromSettingsState(state)`

- [ ] **Step 1: Write settings roundtrip tests**

Create `src/settings/settingsModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  appSettingsFromSettingsState,
  defaultSettingsState,
  settingsStateFromAppSettings,
} from './settingsModel';

describe('settings model', () => {
  it('roundtrips the default settings marker and version', () => {
    const settings = appSettingsFromSettingsState(defaultSettingsState());
    expect(settings.format).toBe('rpgraph-settings');
    expect(settings.version).toBe(1);
    expect(settingsStateFromAppSettings(settings)).toMatchObject(defaultSettingsState());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run src/settings/settingsModel.test.ts
```

Expected: FAIL because model module does not exist.

- [ ] **Step 3: Move conversion logic without changing UI state yet**

Create conversion helpers by moving the defaulting/validation already present in `src/settings.ts`. Keep `src/settings.ts` as the owner of React state for this task.

- [ ] **Step 4: Use conversion helpers in load/save effects**

Replace manual load/save mapping gradually:

```ts
const loadedState = settingsStateFromAppSettings(result.settings);
applySettingsState(loadedState);
```

and:

```ts
const settings = appSettingsFromSettingsState(currentSettingsState());
```

- [ ] **Step 5: Run checks**

Run:

```powershell
npx vitest run src/settings.test.ts src/settings/settingsModel.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/settings.ts src/settings/settingsModel.ts src/settings/settingsModel.test.ts
git commit -m "refactor: centralize settings model conversion"
```

### Task 11: Share storybook RAM-draft/apply behavior

**Files:**
- Create: `src/storybook/useApplyDraft.ts`
- Create: `src/storybook/useApplyDraft.test.ts`
- Modify: `src/components/AppDialogs.tsx`
- Modify: `src/components/StorybookEditorDialog.tsx`

**Interfaces:**
- Consumes: source storybook object and apply callback
- Produces:
  - `useApplyDraft<T>(source, options)`
  - `updateDraft(mutator, fieldId)`
  - `applyField(fieldId)`
  - `applyAll()`
  - `pendingFields`
  - `appliedField`

- [ ] **Step 1: Write hook behavior test**

Create `src/storybook/useApplyDraft.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApplyDraft } from './useApplyDraft';

describe('useApplyDraft', () => {
  it('marks a field pending until it is applied', () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useApplyDraft({ title: 'Old' }, { onApply }),
    );

    act(() => {
      result.current.updateDraft((draft) => ({ ...draft, title: 'New' }), 'title');
    });

    expect(result.current.pendingFields.has('title')).toBe(true);

    act(() => {
      result.current.applyField('title');
    });

    expect(onApply).toHaveBeenCalledWith({ title: 'New' }, 'title');
    expect(result.current.pendingFields.has('title')).toBe(false);
  });
});
```

If `@testing-library/react` is not installed, use a pure non-hook draft controller instead of adding a new dependency:

```ts
createApplyDraftController<T>(source, onApply)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run src/storybook/useApplyDraft.test.ts
```

Expected: FAIL because the hook/controller does not exist.

- [ ] **Step 3: Implement shared draft controller**

Prefer a pure controller if avoiding new dependencies:

```ts
export function createApplyDraftController<T>(source: T, onApply: (draft: T, fieldId: string) => void) {
  let draft = structuredClone(source);
  const pendingFields = new Set<string>();
  return {
    get draft() {
      return draft;
    },
    get pendingFields() {
      return new Set(pendingFields);
    },
    update(next: T, fieldId: string) {
      draft = next;
      pendingFields.add(fieldId);
    },
    apply(fieldId: string) {
      onApply(structuredClone(draft), fieldId);
      pendingFields.delete(fieldId);
    },
  };
}
```

- [ ] **Step 4: Migrate one editor surface**

Start with `src/components/StorybookEditorDialog.tsx` because it is smaller than `AppDialogs.tsx`. Preserve the visible Apply button behavior requested earlier.

- [ ] **Step 5: Migrate the second editor surface**

Move `AppDialogs.tsx` to the same shared draft/apply behavior. Confirm the Apply button appears beside field headers only when there are changes and flips to a green checkmark after apply.

- [ ] **Step 6: Run checks**

Run:

```powershell
npx vitest run src/storybook/inlineEdits.test.ts
npm run build
npm run test:e2e -- test/e2e/uiOverhaulShell.spec.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/storybook/useApplyDraft.ts src/storybook/useApplyDraft.test.ts src/components/AppDialogs.tsx src/components/StorybookEditorDialog.tsx
git commit -m "refactor: share storybook apply draft state"
```

---

## Phase 5: Phone Subsystem Cleanup

### Task 12: Move phone mood definitions into a typed shared module

**Files:**
- Create: `src/phone/moodStatus.ts`
- Create: `src/phone/moodStatus.test.ts`
- Modify: `src/components/PhonePanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: current mood options and app prompt-context mapping
- Produces:
  - `phoneMoodStatuses`
  - `type PhoneMoodStatusId`
  - `phoneMoodContext(id)`
  - `isPhoneMoodStatusId(value)`

- [ ] **Step 1: Write mood mapping tests**

Create `src/phone/moodStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isPhoneMoodStatusId, phoneMoodContext, phoneMoodStatuses } from './moodStatus';

describe('phone mood status', () => {
  it('has a prompt context for every non-online mood', () => {
    for (const status of phoneMoodStatuses) {
      if (status.id !== 'online') {
        expect(phoneMoodContext(status.id)).toContain('Phone status context');
      }
    }
  });

  it('rejects unknown mood ids', () => {
    expect(isPhoneMoodStatusId('online')).toBe(true);
    expect(isPhoneMoodStatusId('not-real')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run src/phone/moodStatus.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement mood module**

Move the current mood definitions and context strings from `PhonePanel` and `App` into `src/phone/moodStatus.ts`.

- [ ] **Step 4: Update usage**

Use `PhoneMoodStatusId` for `phoneMoodStatus` state and replace app-side context switch logic with:

```ts
const phoneRunMoodContext = phoneMoodContext(phoneMoodStatus);
```

- [ ] **Step 5: Run checks**

Run:

```powershell
npx vitest run src/phone/moodStatus.test.ts src/workflow/textHelpers.contextNotes.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/phone/moodStatus.ts src/phone/moodStatus.test.ts src/components/PhonePanel.tsx src/App.tsx
git commit -m "refactor: centralize phone mood status"
```

### Task 13: Give `RoleplayPhoneDevice` ownership of phone chrome

**Files:**
- Modify: `src/components/RoleplayPhoneDevice.tsx`
- Modify: `src/components/PhonePanel.tsx`
- Modify: `src/styles.css`
- Modify: `test/e2e/uiOverhaulShell.spec.ts`

**Interfaces:**
- Consumes: `statusStart`, `statusEnd`, `systemControls`
- Produces: one place responsible for notch, battery, mood selector, settings button, and status alignment

- [ ] **Step 1: Add e2e assertion for tray persistence**

Extend `test/e2e/uiOverhaulShell.spec.ts` with a check that the mood/status control and settings button remain visible after opening a phone app:

```ts
test('keeps phone system controls visible inside opened apps', async ({ page }) => {
  await page.getByRole('tab', { name: /Helga Harper/i }).click();
  await page.getByRole('button', { name: /WhatsUp/i }).click();
  await expect(page.getByRole('button', { name: /Phone mood/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Phone settings/i })).toBeVisible();
});
```

- [ ] **Step 2: Run e2e test to verify current behavior**

Run:

```powershell
npm run test:e2e -- test/e2e/uiOverhaulShell.spec.ts
```

Expected: new test may fail before refactor if controls disappear in app screens.

- [ ] **Step 3: Add chrome slots**

Modify `RoleplayPhoneDevice` props:

```tsx
type RoleplayPhoneDeviceProps = {
  children: ReactNode;
  className?: string;
  orientation?: PhoneDesktopLayout;
  statusStart?: ReactNode;
  statusEnd?: ReactNode;
  systemControls?: ReactNode;
};
```

Render the slots inside the status bar geometry, not as overlays owned by `PhonePanel`.

- [ ] **Step 4: Remove duplicate tray markup from `PhonePanel`**

Keep one `PhoneSystemTrayControls` render path and pass it to `RoleplayPhoneDevice` as `systemControls`.

- [ ] **Step 5: Run checks**

Run:

```powershell
npm run test:e2e -- test/e2e/uiOverhaulShell.spec.ts
npm run build
```

Expected: e2e and build pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/components/RoleplayPhoneDevice.tsx src/components/PhonePanel.tsx src/styles.css test/e2e/uiOverhaulShell.spec.ts
git commit -m "refactor: let phone device own system chrome"
```

### Task 14: Extract phone desktop and layout behavior

**Files:**
- Create: `src/phone/PhoneDesktop.tsx`
- Create: `src/phone/usePhoneDesktopLayout.ts`
- Modify: `src/components/PhonePanel.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: current widget data, orientation, icon size, app open callbacks
- Produces:
  - `PhoneDesktop`
  - `usePhoneDesktopLayout`

- [ ] **Step 1: Identify desktop-only block**

Run:

```powershell
rg -n "phoneDesktop|widget|PhoneDesktop|desktop" src/components/PhonePanel.tsx
```

Expected: locate desktop rendering and widget movement/scaling sections.

- [ ] **Step 2: Extract layout hook**

Move widget bounds, orientation constraints, and resize normalization into `src/phone/usePhoneDesktopLayout.ts`.

Expose:

```ts
export function usePhoneDesktopLayout(options: {
  orientation: PhoneDesktopLayout;
  widgets: PhoneWidgetLayout[];
  onWidgetsChange: (widgets: PhoneWidgetLayout[]) => void;
}) {
  return { widgets, moveWidget, resizeWidget, resetLayout };
}
```

- [ ] **Step 3: Extract desktop component**

Move desktop app icons and widget rendering to `src/phone/PhoneDesktop.tsx`.

- [ ] **Step 4: Run checks**

Run:

```powershell
npm run build
npm run test:e2e -- test/e2e/uiOverhaulShell.spec.ts
```

Expected: phone desktop still renders, portrait/landscape still switch, controls remain reachable.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/phone/PhoneDesktop.tsx src/phone/usePhoneDesktopLayout.ts src/components/PhonePanel.tsx src/styles.css
git commit -m "refactor: extract phone desktop layout"
```

---

## Phase 6: App Shell and Test Suite Maintenance

### Task 15: Extract top-level shell orchestration from `App.tsx`

**Files:**
- Create: `src/app/useStudioModeShell.ts`
- Create: `src/app/useSessionPersistence.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: current studio mode, session save/load callbacks, window cleanup callback
- Produces:
  - `useStudioModeShell`
  - `useSessionPersistence`

- [ ] **Step 1: Extract pure shell state first**

Move mode/theme/menu state that does not require session data into `useStudioModeShell`.

- [ ] **Step 2: Extract session persistence callbacks**

Move `currentSession`, autosave save/load wiring, and startup autosave logic into `useSessionPersistence`.

- [ ] **Step 3: Run checks**

Run:

```powershell
npx vitest run src/app/studioMode.test.ts
npm run build
npm run test:e2e -- test/e2e/uiOverhaulShell.spec.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/App.tsx src/app/useStudioModeShell.ts src/app/useSessionPersistence.ts
git commit -m "refactor: extract app shell orchestration"
```

### Task 16: Split the giant workflow validation fixture test

**Files:**
- Create: `src/workflow/testFixtures.ts`
- Create: `src/workflow/validation.workflow.test.ts`
- Create: `src/workflow/validation.session.test.ts`
- Create: `src/workflow/validation.storybook-media.test.ts`
- Create: `src/workflow/validation.social-phone.test.ts`
- Create: `src/workflow/validation.checkpoints.test.ts`
- Modify: `src/workflow/validation.fixtures.test.ts`

**Interfaces:**
- Consumes: current fixture builders and assertions
- Produces: smaller test files with the same coverage

- [ ] **Step 1: Move shared helpers only**

Move helper functions, constants, and fixture builders used by multiple tests into `src/workflow/testFixtures.ts`. Do not change assertions.

- [ ] **Step 2: Run current fixture test**

Run:

```powershell
npx vitest run src/workflow/validation.fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 3: Split one domain at a time**

Move session validation tests first into `validation.session.test.ts`, then run:

```powershell
npx vitest run src/workflow/validation.session.test.ts src/workflow/validation.fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 4: Repeat for remaining domains**

Move workflow, storybook-media, social-phone, and checkpoint assertions into their files. After each move, run the moved test plus the original file.

- [ ] **Step 5: Remove empty original sections**

When all sections are moved, either delete `validation.fixtures.test.ts` or leave it only as an index-style smoke test if useful.

- [ ] **Step 6: Run checks**

Run:

```powershell
npm run test
npm run build
```

Expected: both pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/workflow
git commit -m "test: split workflow validation fixtures"
```

---

## Phase 7: Final Gates and Merge

### Task 17: Run full cleanup verification

**Files:**
- Modify: `docs/review/cleanup-baseline.md`

**Interfaces:**
- Consumes: all prior cleanup commits
- Produces: final verification note

- [ ] **Step 1: Run full quality gates**

Run:

```powershell
npm run lint
npm run check:unused
npm run test
npm run build
npm run test:e2e
```

Expected: all pass. If an e2e test is flaky, rerun once and document both outputs.

- [ ] **Step 2: Update baseline doc with final checks**

Append to `docs/review/cleanup-baseline.md`:

```markdown
## Final Verification

- `npm run lint`: `<pass/fail>`
- `npm run check:unused`: `<pass/fail>`
- `npm run test`: `<pass/fail>`
- `npm run build`: `<pass/fail>`
- `npm run test:e2e`: `<pass/fail>`

## Cleanup Summary

- Added Electron crash diagnostics.
- Added IPC payload validation.
- Started provider adapter separation.
- Added grouped preload API while preserving legacy calls.
- Introduced request-object graph execution path.
- Reduced storybook draft/apply duplication.
- Centralized phone mood status.
- Moved phone chrome ownership toward `RoleplayPhoneDevice`.
- Split large validation tests.
```

- [ ] **Step 3: Commit verification doc**

Run:

```powershell
git add docs/review/cleanup-baseline.md
git commit -m "docs: record cleanup verification"
```

### Task 18: Merge cleanup branch into master

**Files:**
- Modify: none

**Interfaces:**
- Consumes: completed `codex/code-quality-cleanup` branch
- Produces: `master` containing cleanup commits

- [ ] **Step 1: Check worktree cleanliness**

Run:

```powershell
git status --short
```

Expected: no tracked changes.

- [ ] **Step 2: Fast-forward master**

From the main checkout:

```powershell
git merge --ff-only codex/code-quality-cleanup
```

Expected: fast-forward succeeds.

- [ ] **Step 3: Final status**

Run:

```powershell
git status --short
git log --oneline -5
```

Expected: master includes cleanup commits; unrelated untracked release folders remain unmodified if they existed before.

---

## Self-Review

Spec coverage:

- Backend and IPC cleanup: Tasks 2-6.
- Provider separation: Task 5.
- Graph execution cleanup: Tasks 7-9.
- Settings and editor state cleanup: Tasks 10-11.
- Phone subsystem cleanup: Tasks 12-14.
- App shell cleanup: Task 15.
- Test-suite cleanup: Task 16.
- Persistent documentation and verification: Tasks 1 and 17.

Placeholder scan:

- No task uses placeholder-marker language or unbounded testing instructions.
- Each behavior-sensitive task includes explicit files and test commands.

Type consistency:

- New names are introduced before use: `RunGraphRequest`, `phoneMoodStatuses`, `PhoneMoodStatusId`, `registerCrashDiagnostics`, `assertChatCompletionRequest`, grouped `window.rpgraph.api`.
- Legacy APIs remain available until call sites are migrated.
