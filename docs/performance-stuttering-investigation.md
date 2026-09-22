# Chat and workflow stuttering investigation

## Scope and evidence

The supplied dossier describes earlier experiments that the user reverted to
origin/main after seeing no improvement. Their absence from the working tree is
intentional, not evidence that those experiments were never implemented. This
investigation starts from that reverted baseline.

The current package uses React 19 and Electron 41. The graph-run hook is
`src/app/useGraphRun.ts`, not the older path in the dossier. No application,
Electron window, browser, or UI test was launched during this investigation.
These are code findings and targeted fixes, not measured frame-rate results.

## Findings and implemented changes

### Account-link parsing repeats unrelated work for ordinary prose

`src/chat/accountLinks.ts` previously built the account target directory for all
characters before checking whether a text fragment contained any supported link
prefix. `ChatConversationPanel` renders `AccountLinkText` for individual
speech/thought fragments, multiplying that work across the history. The shared
account-link context also changes with parent renders.

The parser now returns before accessing the character directory when no prefix
exists. `src/components/AccountLinkText.tsx` caches parsing by text, characters,
and stored bindings, while keeping click handling and availability current.
This removes an identifiable source of allocation and repeated character scans;
it does not claim to eliminate all text rendering.

### Runtime activity invalidates storybook-derived data

`App`'s `nodeViewNodes` ignores position-only changes but changes when node data
changes, including reasoning-token counters and activity flags. Previously that
invalidated the storybook map, player-character objects/colors, and reference
image selection even when the authored storybook content was unchanged.

`src/storybook/useStorybookContentNodes.ts` now supplies stable content inputs to
those three consumers. Changes to source membership, order, node ID, or storybook
JSON invalidate them. Runtime graph data remains live in its original consumers.
The existing storybook parser already has a cache, so this addresses downstream
objects and recomputation rather than claiming every update previously reparsed
all JSON.

### Timeline preparation and date lookup repeat across updates

`src/components/ChatConversationPanel.tsx` now memoizes phone/social lookups,
visibility and grouping by messages and display language. Workflow-only changes
and composer interaction can reuse this preparation. Its previous-day lookup
previously scanned backwards from every message; a long undated history could
produce quadratic work. One forward pass now carries the previous date.

The whole message JSX list is still rebuilt on panel renders, including streamed
message updates. A simple memo around that list would also depend on numerous
callbacks created in `App`. Full per-message memoization and context separation
remain possible follow-ups if profiling identifies React rendering as dominant.

### Queued auto-follow survives cancellation

`src/app/useRoleplayPanelRuntime.ts` previously canceled the running animation,
but did not retain/cancel the requestAnimationFrame callback that starts a
scroll. That callback could still execute after wheel/touch/pointer/key input.
Multiple image-load or streaming notifications could queue multiple callbacks.

The pending request is now tracked, coalesced, canceled with the animation, and
checks follow state again at execution. Tests cover cancellation after wheel
input with smooth scrolling both enabled and disabled, plus request coalescing.
The composer-focus double-frame scroll is separate and remains unchanged: it is
an explicit focus behavior, not the continuous streaming auto-follow path.

### Phone bubble backdrop filters

Incoming/outgoing phone bubbles now use more opaque gradients without their
per-bubble blur. This is a small rendering-cost reduction also suggested in the
old dossier, not the main explanation for why the prior experiment failed.
Other glass effects remain. Broad containment, forced compositor layers, and
virtualization were not added without checking clipping, overlays, dynamic
message heights, and scroll behavior interactively.

## GPU diagnosis remains open

Low GPU utilization and a busy CPU core do not establish the actual rasterization
status. Electron exposes separate feature statuses for rasterization, compositing,
and WebGL; a WebGL renderer string alone does not answer all three questions.
See the official [app API](https://www.electronjs.org/docs/latest/api/app#appgetgpufeaturestatus)
and [GPU feature statuses](https://www.electronjs.org/docs/latest/api/structures/gpu-feature-status).

The existing Linux startup flags disable video acceleration. They do not by
themselves demonstrate that ordinary UI rasterization is software-only.
No GPU blocklist override, GL backend override, or Wayland override was added.

An opt-in startup diagnostic now prints feature status and basic device details
after Electron's `gpu-info-update` event. From this checkout, after building:

```sh
RPGRAPH_GPU_DIAGNOSTICS=1 npm run desktop
```

Inspect the `[GPU diagnostics]` output, especially `rasterization` and
`gpu_compositing`. The diagnostic does not change GPU settings. This command is
for the user's manual run; it was not executed during this investigation.

## Validation and next manual check

The production build and ESLint pass. Targeted non-UI tests cover content-selector
invalidation, scroll behavior, account links, reference images, timeline selectors,
and social grouping. No frame-time or CPU improvement has been measured.

Use the same long conversation for idle scrolling, streaming, and reasoning/node
updates. Scroll upward while output is arriving and verify that the viewport
stays where intended. Check that phone cards, day dividers, account links, image
context controls, and edited storybook characters still behave correctly.

If stuttering persists, a short renderer performance recording during these
separate cases should distinguish React/JavaScript work from style/layout/paint.
The broad NodeViewContext updates and full message rendering remain plausible
costs; hardware/backend behavior remains another hypothesis. Token batching
failure alone cannot distinguish them, and it does not establish software
rasterization as the root cause.

## Follow-up: stuttering specifically during visible output streaming

The user reports that the first changes helped at most slightly. Scrolling is
smooth again as soon as LLM Prompt Switch / RP Output streaming ends; other node
transitions cause only brief small stalls. This makes the live output update path
a more specific target than global GPU flags or general idle scrolling.

### Separate live display publication from App state

Previously, `useTurnRecordState.updateMessage(..., { streaming: true })` still
called the root message-state setter for each displayed chunk. The existing
100 ms display interval therefore invalidated `App` and its message-dependent
phone, social, image and graph UI work up to ten times per second. Memoizing
storybook inputs alone did not remove that trigger.

`src/chat/messageStream.ts` now holds a stable external display snapshot.
`ChatConversationPanel` subscribes with `useSyncExternalStore`. Streaming updates
publish there without setting App's message state. The authoritative messages ref
and active turn collector continue to receive every displayed update, including
translations and embedded preview fields. Normal mutations, completion, removal,
and session replacement publish to both the display snapshot and App state.
The panel requests auto-follow after its own snapshot changes, respecting the
existing follow lock and smooth-scroll settings.

This isolates streaming from unrelated root consumers. It does not mean that
only one DOM text node renders: the chat panel still renders its message list.
Runtime node patches can also still cause root updates independently.

### Coalesce expensive preview preparation before display

`showLiveWorkflowOutput` previously resolved workflow variables and parsed
embedded messenger previews for every provider chunk, then submitted the result
to the display batcher. Only the resulting state update was coalesced; the
preparatory work had already happened for superseded chunks.

The pending slot now holds deferred preparation of the latest cumulative text.
The existing display flush prepares that snapshot once; completion still forces
a flush, and cancellation still cancels pending timers/frames. Translation
snapshots use the same pending slot. The 100 ms cadence and token transport are
unchanged.

### Follow-up validation

Non-UI tests verify that multiple streaming updates produce subscriber notices
but no root state writes, preserve earlier message identities and collected text,
and publish completed output normally. Additional cases cover translations,
embedded previews, removing cancelled output, session replacement, ignoring a
late update for a removed ID, stable snapshots, and subscription cleanup.
Existing graph-run, LLM API, workflow fixture, and scroll tests also pass.
The build and lint remain part of validation. Actual scrolling frame times still
require the user's manual run; no numerical speedup is claimed.

## Follow-up: stalls at post-output step transitions

The user confirms that separating streaming snapshots resolved the sustained
streaming slowdown. Small stalls remain when the workflow advances into speaker
attribution/highlighting and RP time tracking, including when the active node is
outside the visible graph area. The working streaming path is preserved.

Four further sources of unnecessary work were identified and changed:

1. **Repeated App rendering.** The `nodeViewNodes` mirror used render-phase
   `setState` whenever node data changed. React then restarted App rendering with
   the new mirror, repeating the application body's calculations. A per-instance
   snapshot selector now supplies the current content immediately, retaining the
   existing position-only filtering without scheduling another render.
2. **Shared node-context invalidation.** `NodeViewContext` contained the entire
   runtime node array. Each status, metric, preview or step-label update therefore
   notified all consuming cards and port displays, despite their own node data
   being unchanged. The shared context now exposes `contentNodes`: only authored
   storybook JSON and fixed-number/settings-value inputs required by cross-node
   consumers. The selector keeps this content stable across runtime transitions.
   Cards still receive their own live status and outputs through normal node
   props, and edge coloring continues to use the live node view. Storybook edits,
   compression-limit changes, membership and ordering still invalidate content.
3. **Forced prompt textarea layout.** The Prompt Switch's layout effect depended
   on fresh `promptBefores`/`promptAfters` arrays. Consequently, unrelated status
   renders reset textarea heights and synchronously read layout/scroll sizes
   before restoring the heights. Dependencies now use the visible prompt strings
   and selected slot. Actual text changes and the existing ResizeObserver still
   update sizing.
4. **Time-tracking metadata writes.** Updating timestamps previously recreated all
   turn objects and their input/output arrays, then reconciled NPC contacts across
   the history. It now preserves unchanged messages/turns, skips repeated or
   unknown-ID patches, and publishes changed timestamps directly to state and the
   chat snapshot. Contacts are unaffected by this metadata-only operation, while
   the active collector and saved turn data still receive the new timestamps.

Non-UI tests cover status-only content stability, source edits, compression input
configuration, graph snapshot updates, and time updates in live and saved records.
Runtime patching and workflow fixture tests also pass. Build and lint are checked;
no application or UI test is launched. These remove concrete render/layout
triggers, but the remaining perceptual improvement is still for the user to
verify while auto-scrolling through the named post-output steps.

## Follow-up: stalls coincide with delivered phone-message sound

The user reports that the transition changes did not remove the remaining stall,
and that it coincides with the incoming phone-message sound. `App` conditionally
mounts `PhonePanel` only in the phone tab, so hidden phone DOM rendering is not
established as the cause. Phone/social derivations and message persistence do run
while Chat is selected. The sound is played immediately after `appendMessage`,
making synchronous contact work on that path a relevant target. Audio elements
are already cached and primed; the timing correlation alone does not establish
an audio backend problem.

Three concrete changes address that message-delivery work:

- `acquireMessageContacts` now checks the already parsed authored registry entries
  before parsing image-bearing raw storybook JSON. Established relationships no
  longer cause a full JSON parse for every delivered message. Actual new grants
  still use the original raw JSON for writes, preserving unrelated fields.
- `portraitDataUrl` now caches the most recent crop per source image object in a
  WeakMap. Repeated character/phone projections avoid rescanning JPEG Base64,
  recovering dimensions and encoding the same image-bearing SVG. Source bytes,
  dimensions and crop coordinates invalidate the cached result. This is not an
  unbounded global collection of historical images; discarded source objects can
  be garbage-collected.
- Appending a message still captures its participant/contact additions, but no
  longer immediately reconciles every older message for contact retractions.
  Removal, replacement and ordinary edits retain reconciliation.

Tests verify repeated established-contact delivery without reparsing the source
storybook, acquisition of a new contact, one avatar encoding across 100 repeated
requests, crop/image invalidation, and append versus removal contact behavior.
Related phone-image, account-link, character-runtime and roleplay-runtime tests
also pass. These are avoided-work assertions, not a measured frame-rate result.
The user's next manual check remains the same sound/message arrival while the
chat is auto-scrolling; no application or UI test was launched here.

## Follow-up: the six nodeViewNodes-keyed graph selectors, fully addressed

A separate report of lag while dragging graph nodes and typing into a node's
text fields traced back to six `useMemo`s/hooks in `App.tsx` all keyed on
`nodeViewNodes`. `nodeViewNodes` (`src/app/nodeViewSnapshot.ts`'s
`createNodeViewSnapshot`) is already designed to ignore position-only changes
during a drag, but it gets a brand-new array reference whenever *any* single
node's `data` changes for any other reason — including a keystroke in an
unrelated node's textarea. Each of the six therefore re-scanned every node
(and, for the worst one, every edge) on every such edit, regardless of graph
size or which node was actually being edited:

- `renderedEdges` (`src/App.tsx`, via `removeEdgesConnectedToIncompatibleNodes`
  in `src/workflow/persistence.ts` and `withSourceNodeStatusConnectionColors`
  in `src/graph/edges.ts`) — filtered all edges, then mapped every edge to a
  new object, feeding it straight into `<ReactFlow edges={renderedEdges} ...>`
  and forcing React Flow to re-diff every edge in the graph. The worst of the
  six, since it's the only one feeding directly into React Flow's own diffing.
- `findChatEndpoints` and `storybookOpeningSituation` (`src/storybook/runtime.ts`)
  — parsed `storybookJson` across all nodes.
- `useWorkflowCapabilities` (`src/app/useWorkflowCapabilities.ts`) — looped
  every node and reparsed prompt actions for every LLM node.
- `useStorybookContentNodes` and `useNodeViewContent` — re-filtered all nodes
  on the way in, though (see below) their *output* was already stable.

All six are now addressed.

### `renderedEdges`

Checked what the two functions inside it actually read per node:
`removeEdgesConnectedToIncompatibleNodes` only reads `id`/`data.kind`;
`withSourceNodeStatusConnectionColors` only reads
`data.runPrepared`/`data.runCompleted`. Nothing else about a node — text
content, portrait images, runtime previews, reasoning-token counters —
affects edge rendering at all. `createEdgeRelevantNodesSelector`/
`useEdgeRelevantNodes` (`src/graph/edges.ts`) project `nodeViewNodes` down to
just those four fields per node and keep a stable array reference unless one
of them, or node membership/order, actually changes. `renderedEdges` now keys
on that projection instead of raw `nodeViewNodes`.

### `findChatEndpoints` and `storybookOpeningSituation`

Both, internally, only read storybook-source nodes' `storybookJson` — exactly
the same narrow set `useStorybookContentNodes` already computes and exposes
as `storybookContentNodes` in `App.tsx`. Both call sites now pass
`storybookContentNodes` instead of raw `nodeViewNodes` (reordering
`useStorybookContentNodes`'s call above `findChatEndpoints`'s, which didn't
previously need it). Filtering an already-storybook-filtered list is a no-op,
so behavior is unchanged; `findChatEndpoints`'s `inputNode`/`outputNode`
fields are unused at its only call site, so passing it a storybook-only list
(where those come back `undefined`) is harmless.

### `useWorkflowCapabilities`

Reads a wider set of per-node fields to reparse prompt actions and detect
active/vision-active nodes: `kind`, `connectionId`, `nodeType`,
`llmPromptActions`, `llmPromptBefore`, `llmPromptAfter`, the three
`llmPromptSwitchPrompt*ByOutput` fields, `runActive`, `runVisionActive`.
`createCapabilityRelevantNodesSelector`/`useCapabilityRelevantNodes` project
down to just those fields and keep a stable array reference otherwise; the
hook's internal `useMemo` now keys on that projection instead of raw `nodes`.

### `useStorybookContentNodes` and `useNodeViewContent`

These two already had their own internal stabilization, via the same
`createXSelector`-with-a-`previous`-comparison idiom used above — they
already returned a stable output when nothing relevant changed. Their listing
above was about the unavoidable, cheap O(n) filter scan on the way in, not
about their output cascading further invalidation, so no change was needed.

### Node `Card` components were never the problem

`WorkflowNodeRenderer`'s custom `memo` comparator, `useStableNodeActions`'s
trampoline for `NodeActionsContext`, and the narrowed `NodeViewContext` value
(see the earlier item above) already correctly isolate unrelated cards from
re-rendering. The lag was the selector re-computation described here, not a
card re-render storm — so it scaled with total node/edge count rather than
with how many cards happen to observe context.

### Verification

Covered by a new `createEdgeRelevantNodesSelector` test in
`src/graph/edges.test.ts` and a new `createCapabilityRelevantNodesSelector`
test in `src/app/useWorkflowCapabilities.test.ts`; existing
`withSourceNodeStatusConnectionColors`/`removeEdgesConnectedToIncompatibleNodes`
and storybook/App-level tests pass unchanged, since none of their own
behavior was touched — only what feeds them was narrowed. `tsc --noEmit` and
`eslint` (`react-hooks/exhaustive-deps` clean) pass, `knip` is clean, and the
full `vitest` suite passes. No application/Electron/browser UI test was
launched, matching this document's stated limitation throughout.
