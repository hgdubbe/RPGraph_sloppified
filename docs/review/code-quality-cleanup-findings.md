# Code Quality Cleanup Findings

Review scope: whole project with the accumulated `codex/code-review` worktree diffs applied.

Focus: code quality, maintainability, and cleanup risks.

Baseline checked: `npm run build` passes in `C:\Users\hen\Documents\ChatGPT\rpgraph\.worktrees\code-review`.

## Critical Issues

No security-critical or merge-blocking correctness issue was confirmed during this pass. The items below are cleanup priorities because they are already causing brittle UI behavior and would make future changes unnecessarily risky.

## Suggestions

### 1. Consolidate duplicated phone tray markup

References:

- `src/components/PhonePanel.tsx:1084`
- `src/components/PhonePanel.tsx:1834`

Problem:

`phoneSystemTrayControls` was introduced as a shared overlay, but the original desktop-only tray markup still exists later in the desktop branch. This duplicates the mood picker, settings menu, handlers, ARIA roles, and the same `desktopSettingsRef`. Duplicate interactive markup makes behavior hard to reason about because one state/ref controls multiple possible DOM subtrees.

Suggested solution:

Keep one tray rendering path. Prefer a small component or render helper and use it everywhere:

```tsx
function PhoneSystemTrayControls(props: PhoneSystemTrayControlsProps) {
  return (
    <div className="phone-system-tray-controls" ref={props.containerRef}>
      {/* mood + quick settings */}
    </div>
  );
}
```

Then remove the duplicated desktop branch block and mount the same component once per returned phone screen.

Rationale:

This is the source of the recent alignment/disappearing-control churn. One component gives the tray a single ownership model and makes future changes to the mood selector or quick settings predictable.

### 2. Move phone mood definitions and prompt context into one typed module

References:

- `src/components/PhonePanel.tsx:184`
- `src/App.tsx:613`
- `src/App.tsx:4689`

Problem:

The mood IDs are defined in `PhonePanel`, while their prompt context strings are separately keyed in `App`. This is easy to desynchronize: adding a new emoji requires remembering to update two unrelated files, and TypeScript cannot prove that every selectable mood has prompt context.

Suggested solution:

Create a shared module, for example `src/phone/moodStatus.ts`:

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

Use `PhoneMoodStatusId` for runtime state instead of plain `string`.

Rationale:

This removes stringly typed coupling and makes future mood changes one-edit operations.

### 3. Replace long positional `runGraph` calls with an object request

References:

- `src/App.tsx:4701`
- `src/app/useGraphRun.ts:872`

Problem:

`submitPhoneMessage` passes more than twenty positional arguments to `runGraph`. Several are `undefined` placeholders followed by booleans and optional metadata. This is fragile: adding context comments, variants, reply references, or phone metadata can silently land in the wrong slot.

Suggested solution:

Introduce a request object:

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

If a full migration is too large, add a wrapper first:

```ts
function runPhoneGraphMessage(request: PhoneGraphMessageRequest) {
  return runGraph(
    request.message,
    request.images,
    undefined,
    request.historyMessages,
    // existing mapping isolated here
  );
}
```

Rationale:

The feature surface is now too wide for positional calls. A named request type reduces accidental regressions and gives future cleanup a stable seam.

### 4. Extract phone desktop, tray, and app-screen routing from `PhonePanel`

References:

- `src/components/PhonePanel.tsx:203`
- `src/components/PhonePanel.tsx:1084`
- `src/components/PhonePanel.tsx:1261`
- `src/components/PhonePanel.tsx:2489`

Problem:

`PhonePanel` now owns desktop layout, widget drag/resize, system tray controls, app routing, gallery mode, banking, notes, ChatGPD, social apps, camera, WhatsUp chat, and composer behavior. The file grew by more than 1,000 lines in this change set, so small phone UI requests now require touching a very large component.

Suggested solution:

Split by responsibility:

```text
src/phone/PhoneShell.tsx
src/phone/PhoneDesktop.tsx
src/phone/PhoneSystemTray.tsx
src/phone/PhoneAppRouter.tsx
src/phone/usePhoneDesktopLayout.ts
src/phone/moodStatus.ts
```

Keep `PhonePanel` as a coordinator that passes domain data and callbacks into those pieces.

Rationale:

This will make the phone simulation easier to evolve without accidental cross-effects between desktop widgets, tray controls, and app internals.

### 5. Consolidate repeated phone CSS and reduce late override blocks

References:

- `src/styles.css:8944`
- `src/styles.css:9472`
- `src/styles.css:9985`
- `src/styles.css:13071`

Problem:

The same phone selectors are declared in multiple distant blocks. For example, `.phone-desktop-settings` is defined at least three times, with later blocks overriding z-index and dimensions. This makes visual fixes order-dependent and hard to audit.

Suggested solution:

Group phone simulation styles into a single section or component stylesheet:

```text
src/styles/phone-shell.css
src/styles/phone-desktop.css
src/styles/phone-tray.css
```

Within each section, keep base styles, then portrait/landscape overrides immediately below the base selector.

Rationale:

The phone UI is becoming its own subsystem. Consolidated CSS will reduce alignment regressions and make visual tuning much faster.

### 6. Share the RAM-draft/apply pattern between storybook editor surfaces

References:

- `src/components/StorybookEditorDialog.tsx:723`
- `src/components/AppDialogs.tsx:3365`
- `src/components/AppDialogs.tsx:3406`
- `src/components/AppDialogs.tsx:3456`

Problem:

The “edit in RAM, then apply” behavior now exists in multiple forms. `StorybookEditorDialog` has `applyFields`, while the larger creator/editor flow in `AppDialogs` has separate draft refs, pending field IDs, applied checkmark timing, and field apply props. These implementations will drift as apply semantics evolve.

Suggested solution:

Extract a hook:

```ts
function useApplyDraft<T>(source: T, onApply: (draft: T, status: string) => void) {
  const draftRef = useRef(structuredClone(source));
  const [snapshot, setSnapshot] = useState(draftRef.current);
  const [pendingFields, setPendingFields] = useState(() => new Set<string>());
  const [appliedField, setAppliedField] = useState<string | null>(null);

  return { snapshot, updateField, applyAll, applyField, revertAll, pendingFields, appliedField };
}
```

Use it in both storybook editor surfaces.

Rationale:

The RAM-edit pattern is important for performance and user trust. A shared hook keeps the semantics consistent and makes it easier to add dirty-state warnings later.

### 7. Let `RoleplayPhoneDevice` own phone chrome slots

References:

- `src/components/RoleplayPhoneDevice.tsx:28`
- `src/components/RoleplayPhoneDevice.tsx:30`
- `src/components/PhonePanel.tsx:1084`

Problem:

The phone frame renders static status chrome (`5G`, notch, `100%`), while `PhonePanel` renders dynamic chrome controls over the same top bar. That split is why alignment has required manual absolute positioning against unrelated CSS.

Suggested solution:

Add explicit slots to `RoleplayPhoneDevice`:

```tsx
export function RoleplayPhoneDevice({ children, statusStart, statusEnd, systemControls }: Props) {
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

The phone frame should own the geometry of the phone. App panels should not need to know where the battery text lives.

## Good Practices

### Focused tests were added for new behavior

References:

- `src/chat/turnVariants.test.ts`
- `src/workflow/textHelpers.contextNotes.test.ts`
- `test/e2e/uiOverhaulShell.spec.ts:394`

The new turn variant and context note behavior has targeted coverage, and the e2e suite was extended around the visible Apply button behavior. This is a good direction; keep adding tests around the extracted modules when cleanup starts.

### Autosave uses two rotating files

References:

- `electron/main.cjs:767`
- `electron/main.cjs:811`

The autosave implementation uses a bounded two-file rotation instead of creating unlimited recovery files. That matches the product requirement and avoids unbounded local storage growth.

### Storybook editing avoids committing on every keystroke

References:

- `src/components/AppDialogs.tsx:3345`
- `src/components/AppDialogs.tsx:3365`

The draft/ref/apply flow is the right architecture for fixing slow text input. The next cleanup step should be consolidating it, not reverting to direct persistent updates.

### The phone frame extraction is a useful first step

References:

- `src/components/RoleplayPhoneDevice.tsx:1`

Creating `RoleplayPhoneDevice` is a good direction. It should become the owner of phone geometry and chrome slots so the simulation feels coherent and the CSS stops relying on scattered absolute offsets.
