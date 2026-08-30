# RPGraph UI Overhaul Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Play Mode and Graph Mode shell/navigation while preserving current graph, chat, phone, events, files, providers, assistant, logs, dialogs, runtime behavior, and node editing.

**Architecture:** Add a small typed studio-mode model, then refactor only the outer app shell. `src/App.tsx` keeps owning runtime state and existing hook orchestration; new presentational shell components receive existing JSX/handlers as props so Phase 1 changes layout without rewriting roleplay, phone, event, graph, or provider logic.

**Tech Stack:** React 19, TypeScript, Vite, Electron, React Flow, Vitest, Playwright Electron e2e.

**Spec:** `docs/superpowers/specs/2026-08-30-rpgraph-ui-overhaul-design.md`

## Global Constraints

- No existing user-facing functionality may be removed or hidden without an equivalent path.
- Graph Mode must remain a full-screen, spatial, directly editable node canvas. It must not be compressed into a narrow drawer or ordinary dashboard panel.
- The graph should be treated as ComfyUI-class editing: large nodes, large workflows, panning, zooming, direct manipulation, quick-add, palette, selection, node editing, edge editing, runtime colors, and debugging remain central in that mode.
- Orange and amber accents are rejected. Phase 1 must add no new orange or amber shell accents.
- The phone surface is for immersion. It should vaguely resemble using a phone, not an admin dashboard.
- In-world app resemblance is required in later visual phases: WhatsUp resembles WhatsApp, Fotogram resembles Instagram, OnlyFriends resembles OnlyFans, Gallery resembles a native phone gallery, and ChatGPD resembles a ChatGPT-like app.
- The visual style should avoid default AI-design markers: generic SaaS blue/purple gradients, clinical dashboard sameness, decorative filler cards, oversized fake metrics, and explaining the UI inside the UI.
- Existing dirty changes in the original checkout must not be reverted or overwritten.
- Work in the linked worktree at `C:\Users\hen\Documents\ChatGPT\rpgraph\.worktrees\ui-overhaul` on branch `codex/ui-overhaul-worktree`.
- Keep the intended design reference available at `docs/design/rpgraph-ui-overhaul-reference.html`.

---

## File Structure

- Create `src/app/studioMode.ts`: pure app-mode model, labels, storage key, parser, and toggle helper.
- Create `src/app/studioMode.test.ts`: Vitest coverage for the pure mode model.
- Create `test/e2e/uiOverhaulShell.spec.ts`: Electron smoke coverage for default Play Mode, Graph Mode access, roleplay surface access, and return navigation.
- Modify `src/App.tsx`: add `studioMode` state, preserve/load mode preference, render Play Mode and Graph Mode shells, remove hover dependency from the default roleplay workspace, and keep existing action handlers/props.
- Create `src/components/RoleplayStudioShell.tsx`: presentational Play Mode frame for the left activity rail, character strip, roleplay panel header, roleplay content slot, and global mode switch.
- Create `src/components/GraphStudioShell.tsx`: presentational Graph Mode frame for the full React Flow canvas slot, graph toolbar slot, node palette slot, context menu slot, and return-to-play control.
- Modify `src/styles.css`: add shell layout classes, non-orange tokens, responsive rules, and Graph Mode full-viewport layout without shrinking existing node cards.

---

### Task 1: Studio Mode Model

**Files:**
- Create: `src/app/studioMode.ts`
- Create: `src/app/studioMode.test.ts`

**Interfaces:**
- Produces: `export type StudioMode = 'play' | 'graph'`
- Produces: `export const studioModeStorageKey: 'rpgraph.studioMode'`
- Produces: `export function isStudioMode(value: unknown): value is StudioMode`
- Produces: `export function studioModeLabel(mode: StudioMode): 'Play Mode' | 'Graph Mode'`
- Produces: `export function oppositeStudioMode(mode: StudioMode): StudioMode`
- Consumes: no app runtime state

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  isStudioMode,
  oppositeStudioMode,
  studioModeLabel,
  studioModeStorageKey,
} from './studioMode';

describe('studioMode', () => {
  it('accepts only supported studio modes', () => {
    expect(isStudioMode('play')).toBe(true);
    expect(isStudioMode('graph')).toBe(true);
    expect(isStudioMode('phone')).toBe(false);
    expect(isStudioMode(null)).toBe(false);
  });

  it('provides stable labels for shell controls', () => {
    expect(studioModeLabel('play')).toBe('Play Mode');
    expect(studioModeLabel('graph')).toBe('Graph Mode');
  });

  it('toggles between Play Mode and Graph Mode', () => {
    expect(oppositeStudioMode('play')).toBe('graph');
    expect(oppositeStudioMode('graph')).toBe('play');
  });

  it('uses the persisted key reserved for RPGraph studio mode', () => {
    expect(studioModeStorageKey).toBe('rpgraph.studioMode');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/studioMode.test.ts`

Expected: FAIL because `src/app/studioMode.ts` does not exist.

- [ ] **Step 3: Add the pure mode model**

```ts
export type StudioMode = 'play' | 'graph';

export const studioModeStorageKey = 'rpgraph.studioMode' as const;

export function isStudioMode(value: unknown): value is StudioMode {
  return value === 'play' || value === 'graph';
}

export function studioModeLabel(mode: StudioMode): 'Play Mode' | 'Graph Mode' {
  return mode === 'play' ? 'Play Mode' : 'Graph Mode';
}

export function oppositeStudioMode(mode: StudioMode): StudioMode {
  return mode === 'play' ? 'graph' : 'play';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/app/studioMode.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the mode model**

```bash
git add src/app/studioMode.ts src/app/studioMode.test.ts
git commit -m "feat: add studio mode model"
```

---

### Task 2: E2E Shell Contract

**Files:**
- Create: `test/e2e/uiOverhaulShell.spec.ts`
- Read: `test/e2e/helpers.ts`

**Interfaces:**
- Consumes: `launchAppWithWorkflow(workflow: WorkflowFixture): Promise<LaunchedApp>`
- Consumes: `cleanup(app: LaunchedApp | undefined): Promise<void>`
- Consumes: `outdatedLlmWorkflow(): WorkflowFixture`
- Produces: a failing e2e contract that later tasks satisfy

- [ ] **Step 1: Write the failing Electron shell test**

```ts
import { expect, test, type Page } from '@playwright/test';
import { cleanup, launchAppWithWorkflow, outdatedLlmWorkflow, type LaunchedApp } from './helpers';

let app: LaunchedApp | undefined;

test.afterEach(async () => {
  await cleanup(app);
  app = undefined;
});

async function graphCanvasVisible(page: Page) {
  await expect(page.locator('.react-flow').first()).toBeVisible();
}

test('starts in Play Mode and preserves access to the full graph editor', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await expect(page.getByRole('button', { name: /Graph Mode/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /Story surfaces/i })).toBeVisible();
  await expect(page.getByRole('tablist', { name: /Chat views/i })).toBeVisible();

  await page.getByRole('button', { name: /Graph Mode/i }).click();

  await expect(page.getByRole('button', { name: /Play Mode/i })).toBeVisible();
  await expect(page.getByRole('region', { name: /Workflow Graph/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Available nodes/i })).toBeVisible();
  await graphCanvasVisible(page);

  await page.getByRole('button', { name: /Play Mode/i }).click();

  await expect(page.getByRole('navigation', { name: /Story surfaces/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Chat/i })).toBeVisible();
});

test('keeps Phone and Events reachable from Play Mode', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await page.getByRole('tab', { name: /Phone/i }).click();
  await expect(page.getByRole('tab', { name: /Phone/i })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: /Events/i }).click();
  await expect(page.getByRole('tab', { name: /Events/i })).toHaveAttribute('aria-selected', 'true');
});
```

- [ ] **Step 2: Build before running Electron e2e**

Run: `npm run build`

Expected: PASS, producing `dist/index.html`.

- [ ] **Step 3: Run the new e2e test to verify it fails**

Run: `npx playwright test test/e2e/uiOverhaulShell.spec.ts`

Expected: FAIL because the app has no `Graph Mode` button, `Play Mode` button, or `Story surfaces` navigation yet.

- [ ] **Step 4: Commit the failing e2e contract**

```bash
git add test/e2e/uiOverhaulShell.spec.ts
git commit -m "test: cover ui overhaul shell contract"
```

---

### Task 3: Roleplay Shell Component

**Files:**
- Create: `src/components/RoleplayStudioShell.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `StudioMode` from `src/app/studioMode.ts`
- Consumes: current `chatPanelView` string union from `useRoleplayPanelRuntime`
- Produces: `RoleplayStudioShell(props: RoleplayStudioShellProps): JSX.Element`
- Produces: slot props `headerControls`, `viewTabs`, `characterPicker`, `composerActions`, `children`

- [ ] **Step 1: Add the presentational component**

```tsx
import type { ReactNode } from 'react';

export type StorySurfaceId = 'chat' | 'phone' | 'gallery' | 'social' | 'events' | 'bank' | 'notes';

export type StorySurfaceItem = {
  id: StorySurfaceId;
  label: string;
  badge?: number;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type RoleplayStudioShellProps = {
  activeSurfaceLabel: string;
  headerControls: ReactNode;
  viewTabs: ReactNode;
  characterPicker: ReactNode;
  composerActions: ReactNode;
  surfaces: StorySurfaceItem[];
  onOpenGraphMode: () => void;
  children: ReactNode;
};

export function RoleplayStudioShell({
  activeSurfaceLabel,
  headerControls,
  viewTabs,
  characterPicker,
  composerActions,
  surfaces,
  onOpenGraphMode,
  children,
}: RoleplayStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-play" aria-label="Play Mode">
      <nav className="studio-activity-rail" aria-label="Story surfaces">
        {surfaces.map((surface) => (
          <button
            key={surface.id}
            className={`studio-rail-button${surface.active ? ' active' : ''}`}
            type="button"
            disabled={surface.disabled}
            aria-current={surface.active ? 'page' : undefined}
            onClick={surface.onSelect}
          >
            <span>{surface.label}</span>
            {!!surface.badge && <span className="studio-rail-badge">{surface.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="studio-play-main">
        <header className="studio-play-header">
          <div className="studio-play-title">
            <strong>{activeSurfaceLabel}</strong>
            <button type="button" className="studio-mode-button" onClick={onOpenGraphMode}>
              Graph Mode
            </button>
          </div>
          <div className="studio-play-actions">{headerControls}</div>
        </header>

        <div className="studio-character-strip">{characterPicker}</div>
        <div className="studio-view-tabs">{viewTabs}</div>
        <div className="studio-play-content">{children}</div>
        <footer className="studio-play-footer">{composerActions}</footer>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Move existing roleplay header JSX into reusable variables in `App.tsx`**

Add variables immediately before the main `return (` in `src/App.tsx`:

```tsx
  const roleplayViewTabs = (
    <div className="chat-panel-tabs" role="tablist" aria-label="Chat views">
      {/* move the existing Chat, PhoneTab, and Events tab JSX here unchanged */}
    </div>
  );

  const roleplayCharacterPicker = (
    <div className="speaker-picker-menu" ref={characterDropdownRef}>
      {/* move the existing Play as picker JSX here unchanged */}
    </div>
  );

  const roleplayComposerActions = (
    <div className="chat-actions">
      {/* move the existing AutoTurn/Run Event and turn counter JSX here unchanged */}
    </div>
  );
```

- [ ] **Step 3: Replace the old hover drawer wrapper in `App.tsx` with `RoleplayStudioShell` for Play Mode**

```tsx
<RoleplayStudioShell
  activeSurfaceLabel={
    chatPanelView === 'phone' ? 'Phone' : chatPanelView === 'events' ? 'Events' : 'Chat'
  }
  headerControls={null}
  viewTabs={roleplayViewTabs}
  characterPicker={roleplayCharacterPicker}
  composerActions={roleplayComposerActions}
  surfaces={[
    {
      id: 'chat',
      label: 'Chat',
      badge: unreadChatCount,
      active: chatPanelView === 'chat',
      onSelect: () => selectChatPanelView('chat'),
    },
    {
      id: 'phone',
      label: 'Phone',
      badge: unreadPhoneNotificationCount,
      active: chatPanelView === 'phone',
      onSelect: selectPhonePanelView,
    },
    {
      id: 'events',
      label: 'Events',
      badge: unreadEventCount,
      active: chatPanelView === 'events',
      onSelect: () => selectChatPanelView('events'),
    },
    {
      id: 'gallery',
      label: 'Gallery',
      active: false,
      onSelect: () => {
        selectPhonePanelView();
        setPhoneHomeRequestId(uniqueId());
      },
    },
    {
      id: 'social',
      label: 'Social',
      badge: unreadSocialDirectMessages.size,
      active: false,
      onSelect: selectPhonePanelView,
    },
    {
      id: 'bank',
      label: 'Bank',
      badge: unreadBankingCount,
      active: false,
      onSelect: selectPhonePanelView,
    },
    {
      id: 'notes',
      label: 'Notes',
      active: false,
      onSelect: selectPhonePanelView,
    },
  ]}
  onOpenGraphMode={() => setStudioMode('graph')}
>
  <div className="chat-lockable">
    {/* move the existing ChatConversationPanel / PhonePanel / EventsPanel conditional here unchanged */}
  </div>
</RoleplayStudioShell>
```

- [ ] **Step 4: Run TypeScript build and fix only shell extraction errors**

Run: `npm run build`

Expected: PASS after imports and moved JSX references are corrected.

- [ ] **Step 5: Commit the Play Mode shell extraction**

```bash
git add src/App.tsx src/components/RoleplayStudioShell.tsx
git commit -m "feat: add play mode shell"
```

---

### Task 4: Graph Shell Component

**Files:**
- Create: `src/components/GraphStudioShell.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `GraphStudioShell(props: GraphStudioShellProps): JSX.Element`
- Consumes: graph toolbar JSX slot from current `App.tsx`
- Consumes: React Flow canvas JSX slot from current `App.tsx`
- Consumes: node palette JSX slot from current `App.tsx`
- Consumes: graph context menu JSX slots from current `App.tsx`

- [ ] **Step 1: Add the presentational Graph Mode frame**

```tsx
import type { ReactNode } from 'react';

export type GraphStudioShellProps = {
  toolbar: ReactNode;
  canvas: ReactNode;
  nodePalette: ReactNode;
  overlays: ReactNode;
  onOpenPlayMode: () => void;
};

export function GraphStudioShell({
  toolbar,
  canvas,
  nodePalette,
  overlays,
  onOpenPlayMode,
}: GraphStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-graph" aria-label="Graph Mode">
      <header className="studio-graph-commandbar">
        <button type="button" className="studio-mode-button" onClick={onOpenPlayMode}>
          Play Mode
        </button>
        <div className="studio-graph-toolbar-slot">{toolbar}</div>
      </header>
      <section className="studio-graph-canvas" aria-label="Workflow Graph">
        {canvas}
      </section>
      <div className="studio-graph-palette-slot">{nodePalette}</div>
      {overlays}
    </section>
  );
}
```

- [ ] **Step 2: Move current graph toolbar JSX into `graphToolbar` in `App.tsx`**

```tsx
  const graphToolbar = (
    <div className="graph-toolbar">
      {/* move current reset, save workflow, save RP, runtime report, capability strip, toast JSX unchanged */}
    </div>
  );
```

- [ ] **Step 3: Move current React Flow JSX into `graphCanvas` in `App.tsx`**

```tsx
  const graphCanvas = (
    <NodeActionsContext.Provider value={nodeActions}>
      <NodeViewContext.Provider value={nodeViewValues}>
        {/* move current ReactFlow JSX unchanged */}
      </NodeViewContext.Provider>
    </NodeActionsContext.Provider>
  );
```

- [ ] **Step 4: Move current node palette JSX into `graphNodePalette` in `App.tsx`**

```tsx
  const graphNodePalette = (
    <aside className="node-palette" aria-label="Available nodes">
      {/* move current node palette JSX unchanged */}
    </aside>
  );
```

- [ ] **Step 5: Render `GraphStudioShell` only when `studioMode === 'graph'`**

```tsx
{studioMode === 'graph' && (
  <GraphStudioShell
    toolbar={graphToolbar}
    canvas={graphCanvas}
    nodePalette={graphNodePalette}
    overlays={graphOverlays}
    onOpenPlayMode={() => setStudioMode('play')}
  />
)}
```

- [ ] **Step 6: Run build and the graph-focused e2e tests**

Run: `npm run build`

Expected: PASS.

Run: `npx playwright test test/e2e/upgradeNode.spec.ts test/e2e/llmPromptOverrides.spec.ts`

Expected: PASS, proving node rendering, dragging, upgrade, and prompt override badge behavior still work.

- [ ] **Step 7: Commit the Graph Mode shell**

```bash
git add src/App.tsx src/components/GraphStudioShell.tsx
git commit -m "feat: add full graph mode shell"
```

---

### Task 5: App Mode State And Persistence

**Files:**
- Modify: `src/App.tsx`
- Read: `src/app/studioMode.ts`

**Interfaces:**
- Consumes: `StudioMode`, `isStudioMode`, `studioModeStorageKey`
- Produces: `studioMode` React state in `App`
- Produces: `setStudioMode` handler used by both shell components

- [ ] **Step 1: Import the mode helpers**

```tsx
import { isStudioMode, studioModeStorageKey, type StudioMode } from './app/studioMode';
```

- [ ] **Step 2: Add default Play Mode state**

Add near other top-level `useState` declarations in `App`:

```tsx
  const [studioMode, setStudioModeState] = useState<StudioMode>(() => {
    if (typeof window === 'undefined') {
      return 'play';
    }
    const storedMode = window.localStorage.getItem(studioModeStorageKey);
    return isStudioMode(storedMode) ? storedMode : 'play';
  });
```

- [ ] **Step 3: Add a persisted setter**

Add after the state declaration:

```tsx
  const setStudioMode = useCallback((mode: StudioMode) => {
    setStudioModeState(mode);
    try {
      window.localStorage.setItem(studioModeStorageKey, mode);
    } catch {
      // localStorage can be unavailable in hardened environments; the UI still works for this session.
    }
  }, []);
```

- [ ] **Step 4: Keep pane clicks from closing Play Mode**

Change the current React Flow `onPaneClick` and `onNodeClick` handlers so they close the old drawer state only when the graph is the active surface:

```tsx
if (studioMode === 'graph') {
  setIsChatPanelOpen(false);
}
```

- [ ] **Step 5: Keep detached roleplay behavior reachable**

Preserve the existing `roleplayPanelDetached` code path. If the current detached behavior depends on `.chat-drawer`, add a `Detach` or `Pop out` control in `RoleplayStudioShell` that calls the existing detach handler, using the exact current handler names from `App.tsx`.

- [ ] **Step 6: Run mode model tests and build**

Run: `npm test -- src/app/studioMode.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit mode state and persistence**

```bash
git add src/App.tsx
git commit -m "feat: persist studio mode"
```

---

### Task 6: Shell Styling Without Orange Accents

**Files:**
- Modify: `src/styles.css`
- Read: `docs/design/rpgraph-ui-overhaul-reference.html`

**Interfaces:**
- Consumes: classes from `RoleplayStudioShell` and `GraphStudioShell`
- Produces: full viewport `studio-shell-play` and `studio-shell-graph` layouts
- Produces: non-orange shell tokens using cyan, lime/green, pink/magenta, violet, blue, red, and neutral dark surfaces

- [ ] **Step 1: Add shell tokens near existing root/theme variables**

```css
:root {
  --studio-bg: #080b12;
  --studio-panel: #101621;
  --studio-panel-strong: #151d2a;
  --studio-line: rgba(116, 139, 172, 0.24);
  --studio-text: #edf5ff;
  --studio-muted: #93a4ba;
  --studio-cyan: #42d9f5;
  --studio-green: #68e08e;
  --studio-pink: #f15bb5;
  --studio-violet: #a78bfa;
  --studio-blue: #60a5fa;
  --studio-red: #fb7185;
}
```

- [ ] **Step 2: Add Play Mode layout classes**

```css
.studio-shell {
  min-height: 0;
  color: var(--studio-text);
}

.studio-shell-play {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  background: var(--studio-bg);
}

.studio-activity-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 8px;
  border-right: 1px solid var(--studio-line);
  background: #0b1018;
}

.studio-rail-button {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 52px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--studio-muted);
  background: transparent;
}

.studio-rail-button.active {
  color: var(--studio-text);
  border-color: rgba(66, 217, 245, 0.38);
  background: rgba(66, 217, 245, 0.1);
}

.studio-rail-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #061018;
  background: var(--studio-pink);
  font-size: 11px;
  font-weight: 700;
}

.studio-play-main {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
}

.studio-play-header,
.studio-character-strip,
.studio-view-tabs,
.studio-play-footer {
  border-bottom: 1px solid var(--studio-line);
  background: rgba(16, 22, 33, 0.94);
}

.studio-play-content {
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 3: Add Graph Mode full-canvas layout classes**

```css
.studio-shell-graph {
  position: relative;
  height: 100%;
  min-height: 0;
  background: #070a10;
  overflow: hidden;
}

.studio-graph-commandbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 20;
  display: flex;
  gap: 10px;
  align-items: center;
  pointer-events: none;
}

.studio-graph-commandbar > * {
  pointer-events: auto;
}

.studio-graph-canvas {
  height: 100%;
  min-height: 0;
}

.studio-graph-canvas .react-flow {
  height: 100%;
}

.studio-graph-palette-slot {
  position: absolute;
  top: 76px;
  right: 12px;
  bottom: 12px;
  z-index: 18;
}

.studio-mode-button {
  border: 1px solid rgba(66, 217, 245, 0.42);
  border-radius: 10px;
  color: var(--studio-text);
  background: rgba(66, 217, 245, 0.12);
}
```

- [ ] **Step 4: Add responsive shell rules**

```css
@media (max-width: 860px) {
  .studio-shell-play {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .studio-activity-rail {
    order: 2;
    flex-direction: row;
    overflow-x: auto;
    border-right: 0;
    border-top: 1px solid var(--studio-line);
  }

  .studio-rail-button {
    min-width: 70px;
  }

  .studio-graph-commandbar {
    flex-wrap: wrap;
  }
}
```

- [ ] **Step 5: Scan CSS for new orange or amber shell accents**

Run: `rg -n "#f59|#fb9|orange|amber|--studio-.*orange|--studio-.*amber" src/styles.css`

Expected: no matches in newly added `studio-*` classes or `--studio-*` tokens.

- [ ] **Step 6: Build after styling**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit shell styling**

```bash
git add src/styles.css
git commit -m "style: add ui overhaul shell layout"
```

---

### Task 7: Verification And Functionality Preservation

**Files:**
- Read: `README.md`
- Read: `docs/architecture/overview.md`
- Read: `docs/superpowers/specs/2026-08-30-rpgraph-ui-overhaul-design.md`
- Read: `docs/design/rpgraph-ui-overhaul-reference.html`

**Interfaces:**
- Consumes: all Phase 1 files and existing app flows
- Produces: verified Phase 1 branch ready for review

- [ ] **Step 1: Run unit tests**

Run: `npm test`

Expected: PASS, or document any failing test by exact test name and failure if it is pre-existing.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Run focused Electron e2e tests**

Run: `npx playwright test test/e2e/uiOverhaulShell.spec.ts test/e2e/upgradeNode.spec.ts test/e2e/llmPromptOverrides.spec.ts`

Expected: PASS.

- [ ] **Step 4: Manually verify Play Mode reachability in the running app**

Run: `npm run desktop`

Manual checks:
- Files, Providers, Assistant, System Log, Options, file status, and window controls are visible or reachable from the global chrome.
- Chat tab opens and shows `ChatConversationPanel`.
- Phone tab opens and shows `PhonePanel`.
- Events tab opens and shows `EventsPanel`.
- Left rail Chat, Phone, and Events entries switch to the matching existing panel.
- Gallery, Social, Bank, and Notes rail entries route to the Phone surface without losing the current character or draft.
- Character picker still switches Narrator and playable characters.
- Run Chat, AutoTurn, Run Event, cancellation, voice controls, attachments, reference images, output actions, edit/regenerate, and embedded phone/social links remain reachable from the same panels.

- [ ] **Step 5: Manually verify Graph Mode reachability and editing**

Run: `npm run desktop`

Manual checks:
- Graph Mode opens a full-viewport graph canvas.
- Existing node cards remain directly editable on the canvas.
- Pan, zoom, selection, drag, delete, reconnect, restore deleted node, pane context menu, selected node context menu, selection context menu, favorite quick-add, and drag-from-palette still work.
- Save Workflow, Save RP, Reset Workflow, Runtime report, capability strip, resource monitor, provider indicators, and system toast remain reachable.
- Switching back to Play Mode does not clear graph state, chat draft, phone draft, selected character, or selected event.

- [ ] **Step 6: Compare implementation against the reference mockup**

Open: `docs/design/rpgraph-ui-overhaul-reference.html`

Check:
- The implemented shell uses a story/control-room structure with a persistent Play workspace.
- The graph is not compressed into a drawer.
- No new orange or amber accents are used in the new shell.
- The result does not look like a generic default-AI dashboard.

- [ ] **Step 7: Commit verification notes if docs changed**

If verification notes are added to a project doc, commit them:

```bash
git add docs
git commit -m "docs: record ui overhaul verification"
```

If no docs changed, skip this commit step.

---

## Self-Review

**Spec coverage:** Phase 1 scope from the spec is covered by Tasks 1-7: app mode state, default Play Mode, persistent roleplay shell, full Graph Mode canvas, current Chat/Phone/Events preservation, detached behavior preservation, global tool reachability, and no new orange/amber shell accents. Phone app visual resemblance, immersive phone redesign, run trace bridge, and broader visual-system polish remain intentionally outside Phase 1 and are documented as later phases in the spec.

**Placeholder scan:** The plan contains no banned placeholder terms from the planning skill and no vague unbounded implementation instructions. Each code step contains concrete snippets or exact movement instructions tied to existing JSX.

**Type consistency:** `StudioMode`, `studioModeStorageKey`, `isStudioMode`, `studioModeLabel`, `oppositeStudioMode`, `RoleplayStudioShellProps`, `StorySurfaceItem`, `StorySurfaceId`, and `GraphStudioShellProps` are defined before later tasks consume them.
