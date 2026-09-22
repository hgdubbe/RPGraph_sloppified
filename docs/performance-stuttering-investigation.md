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

## Follow-up: node dragging and textarea typing, independent of streaming

A separate report describes lag while dragging graph nodes and while typing into
a node's own text fields (e.g. LLM Prompt's before/after textareas), unrelated to
LLM output streaming. `portraitDataUrl`'s WeakMap cache above was replaced with a
content-keyed LRU (`src/characters/portrait.ts`) as part of that report; this
section covers the remaining, unimplemented findings. No code was changed for the
items below — this is analysis only, to be validated before deciding on a fix.

### Dragging is already position-filtered; the residual cost is App itself

`createNodeViewSnapshot` (`src/app/nodeViewSnapshot.ts`) bails out and reuses the
previous `nodeViewNodes` array whenever every node's `id`/`type`/`data`/`style`
reference is unchanged, which is true for a pure position drag. The storybook,
content-node, edge-coloring and workflow-capability selectors keyed on
`nodeViewNodes` (see below) are therefore correctly skipped during a drag; the
existing fast path works as intended.

The residual drag cost is more diffuse: `nodes`, not `nodeViewNodes`, is passed
directly to `<ReactFlow nodes={nodes} ...>` (`src/App.tsx`), so React Flow's own
per-frame diffing plus re-executing the roughly 6,600-line `App` function body on
every drag frame (including several un-memoized `.find()`/`.filter()` calls over
`nodeViewNodes` scattered through the render body, e.g. locating the header,
storybook creator/editor, and node-assistant nodes) is the likely remaining
source. This has not been profiled; it is a secondary suspect relative to typing.

### Typing still invalidates whole-graph selectors keyed on `nodeViewNodes`

Item 2 above narrowed `NodeViewContext` itself to `contentNodes` so status/metric/
step-label updates stop broadcasting to every card. That narrowing does not cover
several *other* memos that are still keyed on the raw `nodeViewNodes` reference,
which still changes on every keystroke (any edit to a node's `data` fails the
`createNodeViewSnapshot` identity check for that node, so the selector returns a
new top-level array). Each of the following therefore re-scans every node (and,
for the first one, every edge) on every keystroke in any text field, regardless
of which node is being edited:

- `findChatEndpoints(nodeViewNodes)` (`src/App.tsx`, `src/storybook/runtime.ts`) —
  parses `storybookJson` and scans for input/output nodes across all nodes.
- `useStorybookContentNodes(nodeViewNodes)` (`src/storybook/useStorybookContentNodes.ts`)
  — re-filters all nodes before its own memo can decide the output is unchanged.
- `storybookOpeningSituation(nodeViewNodes)` (`src/storybook/runtime.ts`) —
  `flatMap`s over all nodes.
- `useNodeViewContent(nodeViewNodes)` (`src/nodes/nodeViewContent.ts`) — filters
  all nodes before comparing against its cached selection.
- `useWorkflowCapabilities({ nodes: nodeViewNodes, ... })`
  (`src/app/useWorkflowCapabilities.ts`) — loops every node and reparses prompt
  actions for every LLM node.
- `renderedEdges` (`src/App.tsx`, via `removeEdgesConnectedToIncompatibleNodes`
  and `withSourceNodeStatusConnectionColors` in `src/graph/edges.ts`) — filters
  all edges, then maps every edge to a new object (new `style`/`markerEnd`
  included). That new array is what `<ReactFlow edges={renderedEdges} ...>`
  receives, so React Flow re-diffs every edge in the graph, not just edges
  touching the node being typed into. This was the most expensive of the group
  and scaled directly with edge count — see the fix below.

Node `Card` components remain correctly isolated (`WorkflowNodeRenderer`'s custom
`memo` comparator, `useStableNodeActions`'s trampoline for `NodeActionsContext`,
and the narrowed `NodeViewContext` value itself do not force unrelated cards to
re-render). The lag is the selector re-computation above, not a card re-render
storm — so it scales with total node/edge count rather than with how many cards
happen to observe context.

### Fix implemented: narrow `renderedEdges`'s input to what it actually reads

Applied the same idiom as item 2's `contentNodes` narrowing, specifically to
`renderedEdges` (the worst offender above): `removeEdgesConnectedToIncompatibleNodes`
only reads a node's `id` and `data.kind`; `withSourceNodeStatusConnectionColors`
only reads `data.runPrepared`/`data.runCompleted`. Nothing else about a node —
text content, portrait images, runtime previews, reasoning-token counters —
affects edge rendering at all.

`createEdgeRelevantNodesSelector`/`useEdgeRelevantNodes` (`src/graph/edges.ts`)
project `nodeViewNodes` down to just those four fields per node and keep a
stable array reference unless one of them, or node membership/order, actually
changes. `App.tsx`'s `renderedEdges` `useMemo` now keys on this projection
instead of raw `nodeViewNodes`, so a keystroke (or any other node-data edit
that doesn't touch `kind`/`runPrepared`/`runCompleted`) no longer rebuilds
every edge in the graph. Covered by a new test in `src/graph/edges.test.ts`
(`createEdgeRelevantNodesSelector`) plus the existing `withSourceNodeStatusConnectionColors`/
`removeEdgesConnectedToIncompatibleNodes` tests, which pass unchanged since
their behavior wasn't touched — only what feeds them.

The other five selectors listed above (`findChatEndpoints`,
`useStorybookContentNodes`, `storybookOpeningSituation`, `useNodeViewContent`,
`useWorkflowCapabilities`) are each still keyed on raw `nodeViewNodes` and would
benefit from the same narrowing treatment, but were not touched in this pass —
`renderedEdges` was identified as the most expensive and highest-impact of the
group (the only one whose output feeds directly into React Flow's own
per-edge diffing), so it was fixed first. `tsc --noEmit`, `eslint`
(`react-hooks/exhaustive-deps` clean), and the full `vitest` suite (857/857
passing) were run; no application/Electron/browser UI test was launched.

### Fix implemented: the remaining four selectors

Two of the five were already correctly narrowed internally and didn't need a
new selector, just correct wiring: `useStorybookContentNodes` and
`useNodeViewContent` each already keep their own stable output (via the same
`createXSelector`-with-a-`previous`-comparison idiom used throughout this
file) — their listing above was about the unavoidable, cheap O(n) filter scan
on the way in, not about their output cascading further invalidation.

`findChatEndpoints` and `storybookOpeningSituation` both, internally, only
read storybook-source nodes' `storybookJson` — exactly the same narrow set
`useStorybookContentNodes` already computes and calls `storybookContentNodes`
in `App.tsx`. Both call sites now pass `storybookContentNodes` instead of raw
`nodeViewNodes` (reordering `useStorybookContentNodes`'s call above
`findChatEndpoints`'s, since the latter didn't previously need it). Filtering
an already-storybook-filtered list is a no-op, so behavior is unchanged;
`findChatEndpoints`'s `inputNode`/`outputNode` fields go unused at its only
call site, so passing it a storybook-only list (where those will always be
`undefined`) is harmless.

`useWorkflowCapabilities` reads a wider set of per-node fields (`kind`,
`connectionId`, `nodeType`, `llmPromptActions`, `llmPromptBefore`,
`llmPromptAfter`, the three `llmPromptSwitchPrompt*ByOutput` fields,
`runActive`, `runVisionActive`) to reparse prompt actions and detect
active/vision-active nodes. `createCapabilityRelevantNodesSelector`/
`useCapabilityRelevantNodes` (`src/app/useWorkflowCapabilities.ts`) project
down to just those fields and keep a stable array reference otherwise; the
hook's internal `useMemo` now keys on that projection instead of raw `nodes`.
Text content changes unrelated to those fields (portrait images,
storybookJson, non-prompt fields, runtime previews) no longer trigger a
reparse of every LLM node's prompt actions.

Covered by a new `createCapabilityRelevantNodesSelector` test in
`src/app/useWorkflowCapabilities.test.ts`; existing `findChatEndpoints`/
`storybookOpeningSituation` consumers are exercised indirectly via existing
storybook/App-level tests, which pass unchanged. `tsc --noEmit` and `eslint`
(`react-hooks/exhaustive-deps` clean) pass, and the full `vitest` suite
(858/858) passes. No application/Electron/browser UI test was launched.

All six items in the `nodeViewNodes`-invalidation chain identified above are
now addressed: two already had internal stabilization (unchanged), and four
(`renderedEdges`, `findChatEndpoints`, `storybookOpeningSituation`,
`useWorkflowCapabilities`) now narrow their input instead of keying directly
on raw `nodeViewNodes`.

## Follow-up: the per-keystroke cost inside the edited field itself

The chain above explains lag that scales with *graph size*: it fires regardless
of which node is edited, and is worse on bigger graphs. It does not explain why
typing is slow even in a small graph, or in a single long prompt field. That cost
lives entirely inside `src/nodes/shared/JsonSyntaxTextarea.tsx`, independent of
any graph-wide invalidation, and two distinct causes were found and fixed there.

### Auto-reformat re-parsed and re-serialized the whole field on every keystroke

`llm-prompt/Card.tsx` and `llm-prompt-switch/Card.tsx` both had `updatePromptBefore`/
`updatePromptAfter` call `maybeFormatJson` on every `onChange`, which (when
`autoFormatJson` is true, the default) ran `formatJsonTextSegments` — a full scan
of the current field value for `{`/`[`, brace-matching each span, then
`JSON.parse` + `JSON.stringify(..., null, 2)` on every candidate — synchronously
in the change handler, before React even schedules a render. This cost scales
with that one field's own length/JSON complexity and fires on every character,
regardless of graph size; it would still be slow on a graph of one node with a
long prompt.

Both cards already call the same formatting (`formatCurrentPrompts`) `onFocus`
and `onBlur`, so the per-keystroke reformat was redundant with an existing
settle-time safety net; its only added value was live pretty-printing while
typing. `updatePromptBefore`/`updatePromptAfter` in both files now commit the raw
typed value instead, and formatting still happens on blur/focus as before.

### Syntax-highlight re-tokenization on every keystroke

Independent of auto-reformat, and affecting every textarea built on
`JsonSyntaxTextarea` (not just prompt nodes), the highlight overlay's `tokens`
`useMemo` re-ran `findSegments` → `jsonTokens` → six chained `.flatMap` regex
passes, plus four separate "is highlighting active" regex scans, over the full
field value on every keystroke, all keyed on `value` so the memoization bought
nothing during typing. This is purely cosmetic (the value/selection/undo state
that must be exact is handled via refs elsewhere in the same file). The
highlighting inputs now derive from `useDeferredValue(value)` instead of `value`
directly, so React can deprioritize the highlight recompute during rapid typing
without delaying the actual committed value.

### What remains open

The graph-wide `nodeViewNodes`/`renderedEdges` chain documented above is still
unfixed. On a large graph it is likely comparable to or bigger than the two
textarea-local fixes above; on a small graph or a single long prompt field, the
two fixes above were likely the dominant cost. Both categories are real and
additive, not alternatives to each other.

## Follow-up: the stall specifically during LLM Prompt Switch / RP Output streaming

The user confirms the textarea fixes helped only slightly, and pins the stall
specifically to LLM Prompt Switch / RP Output streaming: scrolling is smooth
again the instant streaming ends, and other node transitions cause only brief
small stalls by comparison. That distinction points at the live-output update
path itself, not at App/graph-wide invalidation or GPU/idle-scroll causes.

Traced the full chain: `executeGraph`'s `streamOutput` (`src/app/useGraphRun.ts:1635-1643`)
is `showLiveRpOutput`/`showLiveAutoplayOutput` → `showLiveWorkflowOutput` →
`pendingLiveOutput`/`flushLiveOutput` → `applyLiveOutput` → `updateMessage(...,
{ streaming: true })` (`src/chat/useTurnRecordState.ts:279`) → `messageStream.
publish(...)` only. The earlier "separate live display publication from App
state" fix genuinely holds: App does not re-render per chunk.

`ChatConversationPanel` does, by necessity — it subscribes to that same stream
via `useSyncExternalStore` (`ChatConversationPanel.tsx:380`) so streamed text is
visible at all. Its render body performs dialogue-color parsing, speaker-label
resolution, composite phone-text merging, day-label lookup and account-link text
prep inline, unmemoized, for every message in the visible history, in the single
`visibleMessages.map(...)` spanning roughly `ChatConversationPanel.tsx:774-1910`.
At the ~100ms streaming cadence that is up to ~10 full-history reprocesses per
second, for the entire duration of the LLM's response — not just the one
streaming message. This is exactly the gap this document already named as an
open follow-up ("Full per-message memoization and context separation remain
possible follow-ups if profiling identifies React rendering as dominant") and
the user's report is that prediction now confirmed by real use: streaming stalls
because the one component that must react to it reprocesses the whole
conversation on every tick, while other node transitions commit once and so only
cause a brief stall by comparison.

No fix was implemented for this in this pass. The indicated fix — extracting each
message's render body into its own `React.memo`-wrapped row component keyed on
message identity, so unchanged messages are skipped on each streaming tick — is a
large structural extraction of a ~1,100-line, closure-heavy render body in a core
UI component, and was not attempted blind without a way to drive the actual
Electron chat view through available tooling. This is the confirmed next target,
not a fix already made.

### Follow-up fix: memoize the dialogue-text parsing specifically

A full per-row extraction (~40 closure-captured props/handlers across ~1,100
lines) was judged too large and too risky to make blind, without a way to drive
the actual Electron chat view. A narrower, lower-risk fix was made instead,
targeting specifically the per-message text-parsing work this document's
earlier "Timeline preparation" section did not cover: `coloredDialogueParts`/
`quotedSpeechParts`/`thoughtParts` ran fresh, inline, unmemoized, for every
visible message's main text and any composite phone-text before/after, on every
render — including every streaming tick, for every message in the history, not
just the one being generated.

`DialogueText` (`src/components/ChatConversationPanel.tsx`, defined at module
scope, wrapped in `React.memo`) now owns that parsing: it takes `text`,
`dialogue`, `llmDialogueHighlightActive` and the handful of display-setting
props the original inline code touched, and computes `textParts` via its own
internal `useMemo` keyed on exactly those inputs. Because `dialogue` is read
directly off the (unchanged, for other messages) `message` object and `text` is
the same string when a message hasn't changed, `React.memo`'s default shallow
prop comparison skips re-invoking this component — and therefore skips
re-running the parsing — for every message in the history except the one or two
actually changing on a given streaming tick. The three call sites (main text,
composite-before, composite-after) were rewired to render `<DialogueText ...>`
instead of building spans inline; behavior is unchanged (verified by keeping the
exact same span/key/className/style/click-handler logic, just moved).

This does not eliminate the panel-wide re-render itself (the outer ~1,100-line
row body still runs on every streaming tick, per the analysis above), only the
specific text-parsing cost inside it. It is a real, bounded reduction, not the
full fix. Verified with `tsc --noEmit`, `eslint` (including
`react-hooks/exhaustive-deps`, which would flag a missing `useMemo` dependency),
and the full `vitest` suite (855/856 passing; the one failure is a pre-existing,
unrelated ImageMagick-binary timeout). No application/Electron/browser UI test
was launched — the same limitation noted throughout this document.

### Follow-up fix implemented: full per-message row memoization

The full extraction deferred above has now been made. The entire per-message
render body that used to live inline inside `visibleMessages.map((message,
index) => { ... })` in `ChatConversationPanel` (previously
`ChatConversationPanel.tsx:868-1951`, ~1,100 lines: dialogue-text assembly,
speaker-label resolution, composite phone-text merging, day-label/timeline
grouping, phone- and social-bubble rendering, output-action UI, and the final
message `<article>` markup) has been moved into a new top-level,
`React.memo`-wrapped `MessageRow` component defined at module scope in the
same file, following the exact pattern `DialogueText` already established one
section up. `ChatConversationPanel`'s `visibleMessages.map(...)` now does
nothing but render `<MessageRow key={message.id} ... />` per visible message,
passing everything the row body used to read from the panel's closure as
explicit props.

This was a mechanical move, not a rewrite: the JSX structure, keys,
`className`/`style` values, and event-handler wiring are unchanged from
before the extraction. The two adaptations made were both prop-surface
simplifications, not behavior changes:
- `previousDays[index]` (an array + the map index) became a single
  `previousDay` prop, computed by the caller as `previousDays[index]` and
  passed directly, since `index` had no other use inside the row body.
- `isImageInContext`/`isImageManuallySelected` and the pure `badgeClassName`
  helper, previously closures/locals defined inside `ChatConversationPanel`,
  were either re-derived inside `MessageRow` from the two id-`Set` props they
  actually depend on (`contextualReferenceImageIds`, `selectedReferenceImageIds`)
  or, for `badgeClassName` (no closure at all), hoisted to a plain module-scope
  function — removing them from `ChatConversationPanel` since nothing else in
  the panel used them.

`MessageRow`'s prop list (`MessageRowProps` in `ChatConversationPanel.tsx`)
covers every value the row body reads that isn't a module-scope import or a
pure function of the `message` itself: `message`, `previousDay`,
`englishProcessingEnabled`, `appCharacters`, `showProfileNames`,
`storyCharacters`, `characterColors`, `dialogueHighlightEnabled`,
`dialogueVoiceSpeakerNames`, `activeDialogueVoiceKey`, `onSpeakDialogue`,
`onGenerateVoiceMessageClip`, `chatColorIntensity`, `thoughtTextStyle`,
`chatTextSize`, `phoneAuthorBadgesEnabled`, `rpTimeTrackingEnabled`,
`rpDateTimeFormat`, `rpWeekdayLanguage`, `editingMessageId`,
`editableUserMessageId`, `editingDraft`, `isRunning`,
`contextualReferenceImageIds`, `selectedReferenceImageIds`,
`referenceImageContextEnabled`, `referenceImageContextDisabledReason`,
`onBeginEditMessage`, `onCancelEditMessage`, `onRegenerateEditedMessage`,
`onEditingDraftChange`, `onPreviewImage`, `onToggleReferenceImage`,
`onPreviewImageCaptionChange`, `onOpenEmbeddedPhoneMessage`,
`onOpenEmbeddedSocialMessage`, `onOpenSocialPost`, `socialImageById`,
`onOutputActionChoice`, `onMessageContentLoaded`, `phoneMessagesById`,
`socialMessagesById`, `socialTimeline`,
`phoneTimelineGroupsByFirstMessageId`, `skippedPhoneTimelineMessageIds`,
`effectiveRpDateTime`, `outsidePhoneDisplayMode`, `expandedPhoneGroups`,
`setExpandedPhoneGroups`, `phoneBubbleHeadersEnabled`,
`socialEngagementByApp`. The `OutsidePhoneDisplayMode`/`PhoneTimelineEntry`/
`PhoneTimelineGroup` types were also hoisted from inside
`ChatConversationPanel` to module scope so `MessageRowProps` could reference
them; `ChatConversationPanel` itself still uses them unchanged.

With `MessageRow` now wrapped in `React.memo`, a streaming tick that only
changes one message's `messageStream` snapshot causes `ChatConversationPanel`
to re-render (as it must — it subscribes to the stream via
`useSyncExternalStore`), but React's shallow prop comparison on `MessageRow`
now skips re-invoking (and therefore skips re-running all of the parsing and
bubble/timeline assembly work for) every other message's row whose props are
referentially unchanged. This is additive to, not a replacement for, the
narrower `DialogueText` memoization landed in the previous fix — that one
still helps on the rare case where a `MessageRow` prop legitimately changes
(e.g. `characterColors` identity churn) but the message's own text didn't.

Verified with `tsc -b` (clean, no errors), `eslint .` (clean, including
`react-hooks/exhaustive-deps`), and the full `vitest` suite (858/858 passing,
102/102 test files — no pre-existing failures were observed in this run).
As with every other fix in this document, no application/Electron/browser UI
test was run — there is no way to interactively drive the real chat view in
this environment. Only `MessageRow`'s render output, event-handler wiring,
and prop threading were verified by (a) diffing the moved body 1:1 against
the pre-extraction source and (b) the passing type-check/lint/test suite
above; the actual on-screen behavior during a live LLM streaming turn has not
been visually confirmed.
