# RPGraph UI Overhaul Design

Date: 2026-08-30
Branch: `codex/ui-overhaul-worktree`
Reference mockup: `docs/design/rpgraph-ui-overhaul-reference.html`

## Purpose

RPGraph Studio should feel first like a local-first roleplay studio and second like a workflow editor. The current app already has deep story-world functionality: character chat, phone conversations, gallery, camera, banking, social apps, notes, events, voice, image generation, provider management, graph execution, prompt routing, trace/debug tooling, and file/session management.

The overhaul must reorganize that functionality without removing it. The UI should make normal use feel like playing and directing a living story, while keeping the full node graph available as a serious editable power surface.

## Non-Negotiable Constraints

- No existing user-facing functionality may be removed or hidden without an equivalent path.
- Graph Mode must remain a full-screen, spatial, directly editable node canvas. It must not be compressed into a narrow drawer or ordinary dashboard panel.
- The graph should be treated as ComfyUI-class editing: large nodes, large workflows, panning, zooming, direct manipulation, quick-add, palette, selection, node editing, edge editing, runtime colors, and debugging remain central in that mode.
- Orange and amber accents are rejected. The new status and accent system should use cyan, lime/green, pink/magenta, violet, blue, red, and neutral dark surfaces.
- The phone surface is for immersion. It should vaguely resemble using a phone, not an admin dashboard.
- The in-world apps should visually echo their real-life counterparts while remaining renamed RPGraph-native apps:
  - WhatsUp should resemble WhatsApp.
  - Fotogram should resemble Instagram.
  - OnlyFriends should resemble OnlyFans.
  - Gallery should resemble a native phone image gallery.
  - ChatGPD should resemble a ChatGPT-like app.
- The visual style should avoid default AI-design markers: generic SaaS blue/purple gradients, clinical dashboard sameness, decorative filler cards, oversized fake metrics, and explaining the UI inside the UI.
- Existing dirty changes in the original checkout must not be reverted or overwritten.

## Product Model

The app should have two primary modes.

### Play Mode

Play Mode is the default day-to-day workspace. It presents RPGraph as a story control room.

Primary regions:

- Global top chrome with product identity, active save/storybook status, Files, Providers, Assistant, Log, Settings, and a clear Graph Mode entry.
- Left activity rail for story-world surfaces: Chat, Phone, Gallery, Social, Events, Bank, Notes. These entries show unread/new indicators and jump to the relevant story surface.
- Top character strip with Narrator and playable characters. It shows selected character, recent activity, unread state, and role/profile hints.
- Main roleplay timeline. It keeps mixed story output, player input, embedded phone messages, social actions, image cards, bank transfers, notes, info boxes, choice buttons, event records, and generated media in one readable flow.
- Bottom composer that is mode-aware but preserves existing behavior: text, commands, attachments, reference image controls, voice controls, AutoTurn, Run Chat, cancellation, and disabled reasons.
- Right contextual panel for current story state, selected activity, run progress, selected event, image details, voice status, or trace summary. It must be useful but not required for basic play.

Behavioral requirements:

- Existing `ChatConversationPanel` behavior remains available: editing/regeneration, dialogue highlighting, phone display modes, voice playback, reference image controls, command pills, autoplay, output action choices, image preview, and embedded app links.
- Existing `PhonePanel` behavior remains available: character-owned phone view, WhatsUp conversations, Gallery, Camera, Banking, Fotogram, OnlyFriends, Notes, ChatGPD, image assistant, wallpapers, icon layout, unread counts, replies, emojis, phone attachments, and input locking.
- Existing `EventsPanel` behavior remains available: event list, selected event details, cancel, run, conditional/scheduled labels, source context, and Event Manager disabled state.
- Play Mode may reuse current panels internally at first, but its shell should stop feeling like a hover drawer attached to the graph.

### Graph Mode

Graph Mode is the workflow builder/debugger. It should own the viewport.

Primary regions:

- Full-screen React Flow canvas with existing pan, zoom, selection, deletion, reconnection, ports, node sizes, runtime colors, resource monitor, and minimap/controls as appropriate.
- Floating graph toolbar for workflow-level actions: back to Play Mode, save workflow, save RP, reset workflow, runtime report, provider/capability indicators, restore deleted nodes, and run/test actions.
- Floating searchable node palette. It replaces the always-peeking side drawer as the main add-node affordance, while retaining drag-to-canvas and favorite quick-add behavior.
- Floating selected-node inspector. This supplements large editable node cards; it must never become the only editing surface for complex nodes.
- Context menus remain available for pane quick-add, selected node actions, multi-delete, wire links, and graph editing.

Behavioral requirements:

- Existing React Flow graph editing must keep working.
- Node cards should remain directly editable on canvas. Large prompt/storybook/context nodes should not be shrunk to fit a side panel.
- Runtime status must remain visible: active, complete, prepared, and error states, with the new non-orange palette.
- Graph Mode should make run traces easier to inspect, but trace explanation is an overlay/bridge, not a replacement for the graph.

### Run Trace Bridge

The bridge connects Play Mode and Graph Mode. It answers “why did this happen?” without forcing the user to inspect the whole graph.

Entry points:

- From a story output, embedded phone/social card, event, error card, or run progress summary.
- From Graph Mode’s runtime report or selected node inspector.

Content:

- Player action or triggering event.
- Message format and prompt slot route.
- Nodes traversed in order.
- LLM calls with labels, provider, duration, token counts, reasoning tokens when present, and stage labels.
- Parsed output types: story text, phone messages, social messages, banking, notes, event creation, choices, context bars, image actions, voice actions.
- Plain-language error summary first, raw technical details behind expand controls.

Actions:

- Open exact graph path in Graph Mode.
- Select relevant node.
- Copy prompt/debug context.
- Retry/regenerate where current behavior already allows it.
- Open the generated app item in its story-world surface.

## Visual Direction

The updated direction is cinematic dark story tooling, not clinical dashboard. It should feel technical enough for a graph studio but immersive enough for roleplay.

Palette:

- Background: near-black ink surfaces.
- Main text: cool off-white.
- Muted text: blue-gray.
- Lines: restrained blue-gray borders.
- Active/running: cyan.
- Complete/success: lime or green.
- Social/high-energy: pink or magenta.
- Player/selection: violet.
- Utility/app: blue.
- Errors/destructive: red.
- No orange or amber accent role.

Typography:

- Use a distinctive but readable UI type direction, avoiding generic default-AI typography.
- Keep graph/node/editor text compact and legible.
- Keep story text comfortable for long reading.
- Avoid hero-scale typography inside dense app chrome.

Shape and surfaces:

- Keep card radius at or below 12px unless mimicking phone app UI where larger mobile-native radii are appropriate.
- Avoid nested cards.
- Use panels, rails, canvases, sheets, and native app surfaces instead of endless dashboard cards.
- Use icons for tool actions where recognizable, with tooltips or accessible labels.

Phone/app visual references:

- WhatsUp: green conversation language, chat bubbles, contact list behavior, familiar messenger rhythm.
- Fotogram: image-first feed, gradient identity, profile/post/comment/DM patterns inspired by Instagram.
- OnlyFriends: creator/subscriber, wallet/tip/unlock mechanics, blue-accent identity inspired by OnlyFans.
- Gallery: native phone image grid, albums, preview, selection, share/send behavior.
- ChatGPD: clean assistant thread, model/provider hinting where needed, conversation list/sidebar patterns inspired by ChatGPT.

## Information Architecture

The main app shell should move from “graph with right drawer” to “mode-based studio.”

- App mode: Play or Graph.
- Play surface: Chat, Phone, Gallery, Social, Events, Bank, Notes.
- Active actor: Narrator or a Storybook character.
- Context: selected app/thread/event/image/trace.
- Global tools: Files, Providers, Assistant, Log, Settings.

The model should preserve existing state hooks where possible. `useRoleplayPanelRuntime` already contains much of the Play Mode state and should remain the main coordinator unless implementation reveals a cleaner extraction.

## Implementation Phases

### Phase 1: Shell And Mode Split

Goal: introduce Play Mode and Graph Mode without changing core runtime behavior.

Scope:

- Add app mode state.
- Make Play Mode the default visible workspace.
- Move current roleplay panel out of hover drawer into a persistent shell.
- Keep current Chat, Phone, and Events panels mounted through the new shell.
- Make Graph Mode full viewport with existing React Flow behavior.
- Preserve popout roleplay behavior or replace it with an equivalent detached Play surface.
- Add Graph Mode and Play Mode navigation actions.
- Keep Files, Providers, Assistant, Log, Options, window controls, file status, and capability strip reachable.

Acceptance:

- User can perform every current chat, phone, and event action reachable before Phase 1.
- User can edit the graph with at least the same capabilities as before.
- No drawer-style graph compression.
- Existing tests pass or failures are documented as pre-existing.

### Phase 2: Immersive Phone And Activity Rail

Goal: make phone and app navigation feel like a character device.

Scope:

- Refine Phone surface visual language.
- Give WhatsUp, Fotogram, OnlyFriends, Gallery, and ChatGPD stronger app-specific visual identities.
- Add or refine activity shortcuts for latest chat, latest phone message, latest post/DM, latest image, bank activity, note activity, and events.
- Preserve existing unread/seen behavior.

Acceptance:

- Phone interactions remain story-world actions recorded in timeline/session state.
- Real-world app resemblance is visible but names remain RPGraph names.
- Existing phone/social/gallery/banking/notes/ChatGPD behavior remains reachable.

### Phase 3: Run Trace Bridge

Goal: make graph execution understandable from story output.

Scope:

- Add a trace entry surface from outputs/errors/run progress.
- Show route, nodes, LLM stages, parsed outputs, and repair hints.
- Add action to open Graph Mode focused on the relevant node/path.
- Reuse existing `turnTrace`, runtime report, system log, assistant debug snapshot, and node runtime data where possible.

Acceptance:

- User can explain a recent output without manually opening every debug dialog.
- Technical details are available without overwhelming normal play.
- Existing runtime report remains reachable.

### Phase 4: Visual System And Responsive Polish

Goal: make the overhaul cohesive and robust.

Scope:

- Replace orange/amber accent usages in the new shell/status system.
- Audit text contrast, focus states, touch targets, overflow, and responsive behavior.
- Add small-screen layout where Play Mode becomes story/phone first and Graph Mode remains a separate full-canvas mode.
- Remove visible default-AI design markers from the new surfaces.

Acceptance:

- Desktop and small viewport screenshots show no clipped primary controls.
- Keyboard/focus paths remain usable.
- Visual system matches the reference direction.

## Test Strategy

- Run existing unit tests with `npm test`.
- Run build with `npm run build`.
- Run focused Playwright checks for the main shell, graph editing basics, roleplay panel switching, phone app opening, event opening, and responsive layouts.
- Use screenshot review for desktop and small-screen layouts.
- Verify representative actions manually or through tests:
  - send chat message path remains wired;
  - switch active character;
  - open phone conversation from embedded message;
  - open Gallery and select image;
  - open Fotogram/OnlyFriends post or DM;
  - send bank transfer;
  - create/edit/delete note;
  - run/cancel event;
  - open Graph Mode and add/connect/delete/restore node;
  - open run trace from a story output or runtime report.

## Risks

- `src/App.tsx` is large and tightly coordinates both graph and roleplay state. Phase 1 should minimize behavioral rewrites and extract shell components only where it reduces risk.
- The phone app component has many responsibilities. Visual improvements should be layered carefully so app logic does not drift.
- A unified activity model can accidentally double-count notifications. Reuse current selectors and unread logic before adding new derived state.
- Existing uncommitted work in the original checkout may represent active features. Work only in the linked overhaul worktree and avoid reverting unrelated changes.

## Open Decisions

- Exact typography choice for the final production UI.
- Whether Graph Mode uses a minimap by default or only when enabled.
- Whether the current roleplay popout becomes a detached Play Mode window or remains a panel-specific popout.
- How much visual resemblance to real apps is acceptable before it feels too derivative.

## Spec Review Notes

This spec intentionally scopes implementation to progressive phases. Phase 1 is a shell/navigation migration, not a full phone-app redesign or graph-runtime rewrite. Later phases depend on Phase 1 preserving behavior.
