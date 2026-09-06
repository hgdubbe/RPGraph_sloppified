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
