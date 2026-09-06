# Code Quality Cleanup Review

Review scope: whole project with the accumulated applied project state on `master` / `codex/code-review`, not only the latest diff.

Primary focus: code quality, maintainability, architecture, and cleanup risk.

Baseline checked: `npm run build` passes in `C:\Users\hen\Documents\ChatGPT\rpgraph\.worktrees\code-review`.

## 🔴 Critical Issues

No security-critical or merge-blocking correctness issue was confirmed during this review pass. The findings below are still important because they are already making the UI brittle and slowing future development.

## 🟡 Suggestions

### 1. Consolidate duplicated phone tray markup

References:

- `src/components/PhonePanel.tsx:1084`
- `src/components/PhonePanel.tsx:1834`

Problem:

`phoneSystemTrayControls` exists as a shared overlay, but the old desktop-only tray markup still exists later in the desktop branch. This duplicates the mood picker, settings menu, event handlers, ARIA roles, and the same `desktopSettingsRef`. Duplicate interactive markup makes behavior hard to reason about because one state/ref can point at different DOM subtrees depending on the current screen.

Suggested solution:

Keep one rendering path. Prefer a small component:

```tsx
type PhoneSystemTrayControlsProps = {
  moodStatus: PhoneMoodStatusId;
  onMoodStatusChange: (status: PhoneMoodStatusId) => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
};

function PhoneSystemTrayControls(props: PhoneSystemTrayControlsProps) {
  return (
    <div className="phone-system-tray-controls">
      {/* mood picker + quick settings */}
    </div>
  );
}
```

Then delete the duplicated tray block from the desktop branch and mount the component once per phone screen.

Rationale:

This is the same area that produced the mood alignment and disappearing-control regressions. A single component gives the tray one owner and one set of layout rules.

### 2. Move phone mood definitions and prompt context into one typed module

References:

- `src/components/PhonePanel.tsx:184`
- `src/App.tsx:613`
- `src/App.tsx:4689`

Problem:

Mood options are defined in `PhonePanel`, while their prompt context strings are keyed separately in `App`. Adding or renaming a mood requires changing two unrelated files, and `phoneMoodStatus` is stored as a plain `string`, so TypeScript cannot prove every selected mood has a valid context mapping.

Suggested solution:

Create a shared module:

```ts
export const phoneMoodStatuses = [
  {
    id: 'amused',
    label: 'Amused',
    symbol: '😂',
    monoSymbol: '〃',
    context: 'Phone status context: the sender is currently amused or laughing.',
  },
] as const;

export type PhoneMoodStatusId = typeof phoneMoodStatuses[number]['id'];

export function phoneMoodContext(id: PhoneMoodStatusId) {
  return phoneMoodStatuses.find((status) => status.id === id)?.context ?? '';
}
```

Use `PhoneMoodStatusId` in runtime state:

```ts
const [phoneMoodStatus, setPhoneMoodStatus] = useState<PhoneMoodStatusId>('online');
```

Rationale:

This removes stringly typed coupling and makes mood additions one-edit operations.

### 3. Replace long positional `runGraph` calls with an object request

References:

- `src/App.tsx:4701`
- `src/App.tsx:3917`
- `src/App.tsx:4391`
- `src/app/useGraphRun.ts:872`

Problem:

`runGraph` is called with long positional argument lists, often containing many `undefined` placeholders followed by booleans and optional metadata. This is fragile: adding message context, turn variants, reply references, or phone metadata can silently land in the wrong parameter slot.

Suggested solution:

Move toward a named request object:

```ts
runGraph({
  inputText: message,
  images,
  historyMessages: messagesRef.current,
  selectedCharacter,
  isPhoneMessage: true,
  phoneRecipient: selectedPhoneContact.character,
  role: 'user',
  replyTo,
  structuredInput: inputPayload,
  contextComment: phoneRunContextComment,
});
```

If a full migration is too large, introduce wrappers first:

```ts
function runPhoneGraphMessage(request: PhoneGraphMessageRequest) {
  return runGraph(
    request.message,
    request.images,
    undefined,
    request.historyMessages,
    // all positional mapping is isolated here
  );
}
```

Rationale:

The feature surface is now too wide for positional calls. Named fields reduce accidental regressions and make future refactors safer.

### 4. Extract phone desktop, tray, routing, and layout behavior from `PhonePanel`

References:

- `src/components/PhonePanel.tsx:203`
- `src/components/PhonePanel.tsx:1084`
- `src/components/PhonePanel.tsx:1261`
- `src/components/PhonePanel.tsx:2489`

Problem:

`PhonePanel` now owns phone desktop layout, widget dragging/resizing, system tray controls, app routing, gallery mode, banking, notes, ChatGPD, social apps, camera, WhatsUp chat, and composer behavior. The file is roughly 2,444 lines. Small phone UI changes now require editing a very large component with many unrelated responsibilities.

Suggested solution:

Split by responsibility:

```text
src/phone/PhoneAppRouter.tsx
src/phone/PhoneDesktop.tsx
src/phone/PhoneSystemTray.tsx
src/phone/usePhoneDesktopLayout.ts
src/phone/moodStatus.ts
```

Keep `PhonePanel` as a coordinator that passes domain data and callbacks into those pieces.

Rationale:

This will make the phone simulation easier to evolve without accidental cross-effects between desktop widgets, tray controls, app internals, and chat composition.

### 5. Let `RoleplayPhoneDevice` own phone chrome slots

References:

- `src/components/RoleplayPhoneDevice.tsx:28`
- `src/components/RoleplayPhoneDevice.tsx:30`
- `src/components/PhonePanel.tsx:1084`

Problem:

`RoleplayPhoneDevice` renders the static status chrome (`5G`, notch, `100%`), while `PhonePanel` renders dynamic chrome controls over the same top bar. That split forces manual absolute positioning against unrelated CSS and is why the mood selector kept drifting into the battery text.

Suggested solution:

Add explicit chrome slots to `RoleplayPhoneDevice`:

```tsx
export function RoleplayPhoneDevice({
  children,
  statusStart,
  statusEnd,
  systemControls,
}: Props) {
  return (
    <div className="roleplay-phone-device">
      <div className="roleplay-phone-status">
        <span>{statusStart}</span>
        <i />
        <div className="roleplay-phone-status-end">{statusEnd}</div>
      </div>
      <div className="roleplay-phone-system-controls">{systemControls}</div>
      <div className="roleplay-phone-screen">{children}</div>
    </div>
  );
}
```

Rationale:

The phone frame should own the geometry of the phone. App panels should not need to know where the notch or battery cluster lives.

### 6. Consolidate repeated phone CSS and reduce late override blocks

References:

- `src/styles.css:8944`
- `src/styles.css:9472`
- `src/styles.css:9985`
- `src/styles.css:13071`

Problem:

The phone styles are spread through distant sections of a stylesheet that is roughly 25,501 lines. `.phone-desktop-settings` is declared multiple times, with later blocks overriding z-index and dimensions. This makes visual fixes order-dependent and hard to audit.

Suggested solution:

Group phone simulation styles into local stylesheet sections or separate files:

```text
src/styles/phone-shell.css
src/styles/phone-desktop.css
src/styles/phone-tray.css
src/styles/phone-apps.css
```

Within each section, keep base styles and portrait/landscape overrides adjacent:

```css
.phone-system-tray-controls { ... }
.roleplay-phone-device.landscape .phone-system-tray-controls { ... }
```

Rationale:

The phone UI is now a subsystem. Consolidated CSS will reduce alignment regressions and make visual tuning much faster.

### 7. Share the RAM-draft/apply pattern between storybook editor surfaces

References:

- `src/components/StorybookEditorDialog.tsx:723`
- `src/components/AppDialogs.tsx:3365`
- `src/components/AppDialogs.tsx:3406`
- `src/components/AppDialogs.tsx:3456`

Problem:

The “edit in RAM, then apply” behavior exists in multiple forms. `StorybookEditorDialog` has `applyFields`, while the larger creator/editor flow in `AppDialogs` has separate draft refs, pending field IDs, applied checkmark timing, and field apply props. These implementations are likely to drift.

Suggested solution:

Extract a hook:

```ts
function useApplyDraft<T>(source: T, onApply: (draft: T, status: string) => void) {
  const draftRef = useRef(structuredClone(source));
  const [snapshot, setSnapshot] = useState(draftRef.current);
  const [pendingFields, setPendingFields] = useState(() => new Set<string>());
  const [appliedField, setAppliedField] = useState<string | null>(null);

  return {
    snapshot,
    updateField,
    applyAll,
    applyField,
    revertAll,
    pendingFields,
    appliedField,
  };
}
```

Use the hook in both storybook editor surfaces.

Rationale:

The RAM-edit pattern is important for performance and user trust. A shared hook keeps Apply semantics consistent and makes dirty-state warnings easier to add.

### 8. Split `App.tsx` into route-level and workflow orchestration modules

References:

- `src/App.tsx:631`
- `src/App.tsx:2550`
- `src/App.tsx:3917`
- `src/App.tsx:6956`

Problem:

`App.tsx` is roughly 6,956 lines and now owns top-level app state, workflow persistence, graph execution, RP session state, phone submission, turn variants, dialogs, and shell composition. This makes cleanup risky because unrelated behavior shares one render scope and many callbacks close over the same state.

Suggested solution:

Extract coarse orchestration modules before fine-grained cleanup:

```text
src/app/useStudioModeShell.ts
src/app/useSessionPersistence.ts
src/app/useTurnRegeneration.ts
src/app/usePhoneSubmission.ts
src/app/AppDialogsHost.tsx
```

Move one responsibility at a time, preserving existing tests after each extraction.

Rationale:

Large files are not automatically bad, but this file now crosses several product boundaries. Separating orchestration domains will reduce accidental coupling and make code review manageable.

### 9. Replace nondeterministic turn variant IDs with injectable or stable ID generation

References:

- `src/chat/turnVariants.ts:16`
- `src/chat/turnVariants.ts:17`

Problem:

Variant IDs are generated from `Date.now()` and a lowercased label. That is simple, but it makes tests and replay/debugging less deterministic. It can also collide in very fast variant creation if the same turn and label are used within the same millisecond.

Suggested solution:

Inject an ID factory or use `crypto.randomUUID()` when available:

```ts
type VariantIdFactory = (turn: TurnRecord, label: string) => string;

const defaultVariantId: VariantIdFactory = () => crypto.randomUUID();

function turnVariant(
  turn: TurnRecord,
  label: string,
  checkpoint?: TurnCheckpoint,
  idFactory = defaultVariantId,
) {
  return {
    id: idFactory(turn, label),
    label,
    createdAt: new Date().toISOString(),
    turn: turnWithoutVariants(turn),
    checkpoint: checkpoint ? structuredClone(checkpoint) : undefined,
  };
}
```

Rationale:

Stable ID generation improves tests and avoids timestamp edge cases in variant-heavy workflows.

### 10. Avoid intentionally unused parameters in update helpers

References:

- `src/components/AppDialogs.tsx:3420`
- `src/components/AppDialogs.tsx:3425`

Problem:

`updateCharacterPatch` accepts `status` but immediately discards it with `void status`. This tells future readers there was probably planned behavior that no longer exists, and it weakens trust in the function signature.

Suggested solution:

Remove the parameter if it is not needed:

```ts
function updateCharacterPatch(
  characterId: string,
  patch: (character: RpStorybookCharacter) => RpStorybookCharacter,
) {
  markDraftFieldPending(`${characterId}.settings`);
  // update draft...
}
```

Or use it consistently if callers need status feedback.

Rationale:

Small signature cleanup matters in a file that is already close to 5,000 lines. Avoiding dead parameters keeps call sites honest.

### 11. Split the Electron backend into explicit service modules

References:

- `electron/main.cjs:3485`
- `electron/main.cjs:4279`
- `electron/main.cjs:4770`
- `electron/main.cjs:5035`
- `electron/main.cjs:5701`

Problem:

`electron/main.cjs` is roughly 5,424 lines and owns provider model management, chat completions, streaming, Comfy workflows, settings, autosaves, file dialogs, resource stats, and window controls. The app now has several backend domains, but they all share one file and one mutable process scope. That makes crash investigation and provider changes harder because unrelated backend behavior sits beside the failure site.

Suggested solution:

Move handlers behind domain modules that register their own IPC surface:

```js
// electron/ipc/registerIpc.cjs
function registerIpcHandlers(deps) {
  registerProviderHandlers(deps);
  registerLlmHandlers(deps);
  registerComfyHandlers(deps);
  registerFileHandlers(deps);
  registerSettingsHandlers(deps);
  registerWindowHandlers(deps);
}
```

Keep shared primitives such as `requestLlmResponse`, safe file writes, encryption helpers, and abort handling in small modules used by those handlers.

Rationale:

The backend is already a real application layer, not just a bootstrap script. Splitting by domain gives failures a smaller search area and makes future migrations to the fork less risky.

### 12. Add schema validation at the Electron IPC boundary

References:

- `electron/preload.cjs:59`
- `electron/main.cjs:4279`
- `electron/main.cjs:5154`
- `electron/main.cjs:5413`
- `electron/main.cjs:5670`

Problem:

The renderer calls many IPC handlers with broad objects, while the main process often reaches directly into nested fields such as `request.connection`, `request.workflow`, `request.session`, or `settings`. Some handlers validate file names, file paths, and character-card format well, but the validation pattern is inconsistent across providers, settings, LLM requests, and JSON export.

Suggested solution:

Introduce small validators beside each handler group:

```js
function assertChatCompletionRequest(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid chat completion request.');
  }
  if (!value.connection || typeof value.prompt !== 'string') {
    throw new Error('Chat completion requires a connection and prompt.');
  }
  return value;
}

ipcMain.handle('llm:chat-completion', async (_event, rawRequest) => {
  const request = assertChatCompletionRequest(rawRequest);
  // existing provider routing...
});
```

For shared payloads, prefer one runtime schema per persisted format and IPC command. Zod, Valibot, or local handwritten guards would all be acceptable as long as the same guard is used in tests.

Rationale:

TypeScript protects the renderer during development, but IPC receives runtime data. Boundary validation turns corrupted state, old settings, or malformed calls into controlled errors instead of undefined behavior.

### 13. Narrow and group the preload API

References:

- `electron/preload.cjs:59`
- `electron/preload.cjs:113`
- `electron/preload.cjs:146`
- `electron/preload.cjs:172`

Problem:

The preload exposes nearly every app capability as flat methods under `window.rpgraph`: model loading, speech generation, chat completion, file IO, Comfy workflow operations, settings, autosave, system stats, and native window controls. The flat shape makes it hard to see which renderer feature uses which native capability, and new code can reach unrelated backend powers without crossing a meaningful API boundary.

Suggested solution:

Introduce grouped namespaces while preserving a backwards-compatible adapter during migration:

```js
const api = {
  llm: { chatCompletion, streamChatCompletion, listModels },
  files: { list, load, saveToPath, delete },
  settings: { load, save },
  comfy: { runWorkflow, inspectWorkflow },
  window: { minimize, toggleMaximize, close },
};

contextBridge.exposeInMainWorld('rpgraph', {
  ...legacyFlatApi,
  api,
});
```

Then migrate renderer call sites feature by feature to `window.rpgraph.api.*`.

Rationale:

A grouped preload reads like a capability map. It lowers accidental coupling and makes security review much easier.

### 14. Consolidate provider adapters outside the IPC handlers

References:

- `electron/main.cjs:2297`
- `electron/main.cjs:3485`
- `electron/main.cjs:3665`
- `electron/main.cjs:4072`
- `electron/main.cjs:4111`
- `electron/main.cjs:4279`

Problem:

Provider-specific behavior for LM Studio, llama.cpp, OpenRouter, composite providers, Venice, Gemini, and Ollama is implemented in the same file as IPC registration. `llm:chat-completion` and `llm:chat-completion-stream` contain routing logic plus request construction plus response normalization. That shape encourages every provider fix to touch the central backend file.

Suggested solution:

Create provider adapter modules with a common interface:

```ts
type ProviderAdapter = {
  listModels(connection: ProviderConnection, signal: AbortSignal): Promise<string[]>;
  chat(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse>;
  stream?(request: ChatRequest, events: StreamEvents, signal: AbortSignal): Promise<ChatResponse>;
};
```

Then keep the IPC handler as orchestration:

```js
const adapter = providerAdapterFor(request.connection);
return adapter.chat(request, abort.signal);
```

Rationale:

Provider logic is one of the most failure-prone areas of the app. A common adapter boundary makes provider bugs smaller and makes test fixtures possible without launching Electron.

### 15. Add renderer and child-process crash telemetry

References:

- `electron/main.cjs:5761`
- `electron/main.cjs:5768`
- `electron/main.cjs:5771`
- `electron/main.cjs:5788`

Problem:

The app configures navigation, permissions, window state saves, and close cleanup, but there is no confirmed handler for `render-process-gone`, `unresponsive`, `responsive`, or `child-process-gone`. Earlier debugging involved a UI crash while the process continued running. Without these events logged to a persistent local file, the next crash is likely to be diagnosed from screenshots and terminal fragments again.

Suggested solution:

Add a small diagnostics logger in Electron main:

```js
function registerCrashDiagnostics(window) {
  window.webContents.on('render-process-gone', (_event, details) => {
    void appendDiagnosticLog('render-process-gone', details);
  });
  window.on('unresponsive', () => {
    void appendDiagnosticLog('window-unresponsive', {});
  });
}

app.on('child-process-gone', (_event, details) => {
  void appendDiagnosticLog('child-process-gone', details);
});
```

Store the last few crash records in `app.getPath('userData')`, and surface a short recovery notice on next startup.

Rationale:

The app now has heavy renderer state, local models, media workflows, and Electron chrome. Persistent crash telemetry is the fastest way to distinguish renderer exceptions, GPU failures, native process exits, and provider crashes.

### 16. Break `useGraphRun` into a staged execution pipeline

References:

- `src/app/useGraphRun.ts:460`
- `src/app/useGraphRun.ts:636`
- `src/app/useGraphRun.ts:1741`
- `src/app/useGraphRun.ts:1800`
- `src/app/useGraphRun.ts:2975`

Problem:

`useGraphRun.ts` is roughly 2,944 lines and `runGraph` handles command parsing, runtime snapshots, replacement turns, graph-node state reset, prompt execution, output parsing, phone app messages, image descriptions, translations, audio, checkpointing, and failure recovery. This is too much for one hook to own, especially because it mutates refs and React state throughout the same async flow.

Suggested solution:

Split the flow into named stages with explicit input/output objects:

```ts
async function runGraph(request: RunGraphRequest) {
  const prepared = prepareRun(request, currentState());
  const execution = await executeWorkflow(prepared);
  const parsed = parseRunOutputs(execution);
  const commits = buildTurnCommits(prepared, parsed);
  applyRunCommits(commits);
  return commits.result;
}
```

A good first extraction target is phone/social side effects, because they already have domain-specific parsing and attachment logic.

Rationale:

The current hook works, but it is difficult to reason about partial failure. A staged pipeline makes rollback, regeneration variants, autosave, and provider failure handling easier to test.

### 17. Move settings load/save state out of `src/settings.ts`

References:

- `src/settings.ts:1010`
- `src/settings.ts:1032`
- `src/settings.ts:1111`
- `src/settings.ts:1154`

Problem:

`src/settings.ts` owns many individual React state atoms and a long load/save effect that maps persisted settings to UI state one setter at a time. Every new option adds more dependency-list entries and more manual mapping. This makes settings saves noisy and increases the risk of missing a field in either load or save.

Suggested solution:

Use a reducer or store object with one normalization path:

```ts
type SettingsState = ReturnType<typeof defaultSettingsState>;

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  // update one option group at a time
}

function settingsStateFromAppSettings(settings: AppSettings): SettingsState {
  return normalizeSettingsState(settings);
}
```

Then persist a derived snapshot from `SettingsState` instead of rebuilding the settings payload across a large effect.

Rationale:

Settings have become product state. Treating them as a coherent model reduces missed fields and makes autosave-related changes less likely to slow the UI.

### 18. Replace raw `innerHTML` in popout setup with DOM construction

References:

- `src/components/PopoutWindow.tsx:13`
- `src/components/PopoutWindow.tsx:43`

Problem:

`PopoutWindow` uses `innerHTML` to clear copied styles and create the popout root. The current strings are static, so this is not an immediate injection bug, but it introduces a habit that should be avoided in shared windowing code.

Suggested solution:

Use DOM APIs instead:

```tsx
function clearHead(targetDocument: Document) {
  targetDocument.head.replaceChildren();
}

const root = popup.document.createElement('main');
root.id = 'roleplay-popout-root';
popup.document.body.replaceChildren(root);
```

Rationale:

The popout component is infrastructure. Keeping it free of raw HTML assignment makes future feature additions safer if dynamic titles, classes, or embedded markup are ever introduced.

### 19. Keep custom-node sandbox policy documented and tested as a boundary

References:

- `src/nodes/custom-node/sandbox.ts:1`
- `src/nodes/custom-node/sandbox.ts:36`
- `src/nodes/custom-node/sandbox.ts:130`
- `src/nodes/custom-node/sandbox.ts:178`
- `src/nodes/custom-node/runtime.ts:272`

Problem:

The custom-node sandbox has strong intent: opaque iframe, Web Worker, deny-all CSP, removed network/storage globals, and a watchdog. That is good. The remaining code-quality issue is that it relies on string-built worker code and `AsyncFunction` in two places, which means sandbox assumptions must stay synchronized manually between `sandbox.ts` and `runtime.ts`.

Suggested solution:

Add dedicated tests and docs for the sandbox contract:

```ts
it('blocks browser and electron capability access from custom node code', async () => {
  await expect(runCustomNode('return { outputs: { fetchType: typeof fetch } }'))
    .resolves.toMatchObject({ outputs: { fetchType: 'undefined' } });
});
```

Also consider moving the runner argument list and prelude to one shared source module that both runtime and sandbox code consume.

Rationale:

This boundary allows imported workflow code to execute. The implementation is thoughtful, but it needs tests that fail loudly when future cleanup accidentally reopens a capability.

### 20. Split giant test fixtures into domain-focused files

References:

- `src/workflow/validation.fixtures.test.ts:1640`
- `src/workflow/validation.fixtures.test.ts:2663`
- `src/workflow/validation.fixtures.test.ts:4656`
- `src/workflow/validation.fixtures.test.ts:6679`

Problem:

`validation.fixtures.test.ts` is roughly 6,928 lines and covers storybook media, session migration, workflow validation, plugin compatibility, checkpoint/runtime validation, and social/phone data. It is valuable coverage, but its size makes it slow to navigate and raises the cost of adding focused regression tests.

Suggested solution:

Split by persisted format and feature area:

```text
src/workflow/validation.workflow.test.ts
src/workflow/validation.session.test.ts
src/workflow/validation.storybook-media.test.ts
src/workflow/validation.social-phone.test.ts
src/workflow/validation.checkpoints.test.ts
```

Keep shared fixtures in `src/workflow/testFixtures.ts`.

Rationale:

The test coverage is an asset. Splitting it preserves that value while making the suite easier to extend during cleanup.

## ✅ Good Practices

### Focused tests were added for new behavior

References:

- `src/chat/turnVariants.test.ts`
- `src/workflow/textHelpers.contextNotes.test.ts`
- `test/e2e/uiOverhaulShell.spec.ts:394`

The turn variant behavior, context note formatting, and visible Apply interaction have targeted coverage. This gives future cleanup a foothold: extract modules, then move and expand these tests around the extracted APIs.

### Autosave uses two rotating files

References:

- `electron/main.cjs:767`
- `electron/main.cjs:811`

The turn autosave implementation uses a bounded two-file rotation instead of creating unlimited recovery files. This satisfies the product requirement and avoids unbounded local storage growth.

### Storybook editing avoids persistent writes on every keystroke

References:

- `src/components/AppDialogs.tsx:3345`
- `src/components/AppDialogs.tsx:3365`
- `src/components/StorybookEditorDialog.tsx:723`

The draft/ref/apply direction is the right architecture for fixing slow text input. The cleanup task is to share and simplify the pattern, not to return to direct persistent updates.

### The phone frame extraction is a useful first step

References:

- `src/components/RoleplayPhoneDevice.tsx:1`

Creating `RoleplayPhoneDevice` is a good step toward making the phone simulation coherent. It should become the owner of phone geometry and chrome slots so app screens can stay focused on app behavior.

### Build remains green after the accumulated changes

Reference:

- `npm run build`

The project still compiles after the accumulated UI, persistence, and RP workflow changes. That gives cleanup a stable starting point.
