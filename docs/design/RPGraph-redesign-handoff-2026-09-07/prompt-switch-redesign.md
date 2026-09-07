# Prompt Switch redesign: Response Router

Proposal based on RPGraph commit `afa75164a83f12b72f25f3469f5a28b22f9cecfc`. Static source review; no implementation or runtime testing. Companion to `command-pipeline-proposal.md`.

Expanded layouts and behavior are in [DESIGN_ATLAS.md](DESIGN_ATLAS.md), with a [standalone canvas wireframe](response-router-wireframe.svg). The atlas describes the editor, route previews, graph highlighting, selection states, deletion and compatibility in greater detail.

**User-specified theme constraint:** colors in the wireframe are illustrative. The target system has another theme; retain its existing palette and design tokens for nodes, edges and statuses. Do not treat mockup coloration as an implementation target. Preserve the proposed layout and behavior, using labels/icons alongside theme-appropriate styling.

## Design objective

Keep the existing text, image, output-channel and prompt-slot inputs; existing before/after prompts; connection settings; action and command configuration; and existing output connections. Make routing visible and deterministic, with prompt editing and execution details separated from the canvas overview.

Use one compact **Response Router** node by default. Internally separate route resolution, prompt assembly, execution and output dispatch. Splitting those concerns into four mandatory canvas nodes would add wiring work for users without inherently improving validation.

## Current problems grounded in source

- `src/nodes/llm-prompt-switch/execute.ts:24`: output-channel selection converts strings to numbers, truncates fractions and clamps out-of-range values. Invalid nonnumeric values select zero. These substitutions can choose an unintended output without an explicit error.
- `src/nodes/llm-prompt-switch/execute.ts:32`: missing numeric prompt slots fall back to zero with a warning; nonnumeric values select zero without that fallback flag. Selection policies differ between the two inputs.
- `src/nodes/llm-prompt-switch/Card.tsx:255`: editor selection is stored as output/prompt indexes. Runtime execution can update these fields when automatic prompt display is enabled. Browsing a prompt and observing execution are entangled, although execution itself uses incoming selector values.
- `src/nodes/llm-prompt-switch/Card.tsx:347`: deleting a prompt removes array entries and shifts later prompt indexes. Existing numeric upstream selectors are not adjusted by this operation.
- `src/app/useNodeActionsController.ts:891`: deleting an output removes its edges and renumbers later output handles. This repairs those outgoing edges, but it does not establish that upstream numeric routing values have been updated.
- `src/types.ts:326`: names and before/after prompts are stored in parallel matrices rather than objects with stable identities.
- `src/nodes/llm-prompt-switch/Card.tsx:540`: the card places channel and slot dropdowns, prompt editors, settings, action dialogs and output ports into a tall node. Routes not selected in the dropdowns are difficult to inspect together.
- `src/nodes/shared/promptRun.ts:257`: prompts may contain multi-pass step/output references. The redesign must preserve these, not reduce every prompt to a single call.

## Canvas display

The card prioritizes a route overview, not editable prompt text. Its header shows the node label, configured LLM and validation status. Four aligned input handles preserve the current input contract:

- Text
- Images
- Output selection (existing `output-channel` handle)
- Prompt selection (existing `prompt-slot` handle)

Next to each input show the connected source node/port and the most recent observed value. Distinguish “not run yet” from an empty value. Input labels must not imply that editing a selected prompt changes the incoming selector.

Below the header show output groups, each with a handle on its right edge. Expand a group to see every route that can select it. A route means one existing pair of output-channel and prompt-slot values; this preserves the full existing matrix, including different meanings of the same prompt-slot number in different channels.

Illustrative display; names and numbers are examples, not extracted workflow defaults:

```text
Response Router                         LLM: Selected connection
Text          <- Context builder.Text
Images        <- User input.Images
Output select <- User input.Format          Last value: 1
Prompt select <- User input.Mode            Last value: 0

OUTPUT / ROUTES                         CONNECTED TO
v Story                                o -> RP Output.Story
    Normal reply       [0,0]  Ready
    Narrator           [0,1]  Ready
v Messenger                            o -> RP Output.Phone
  > Phone reply        [1,0]  Last run
    Conversation       [1,1]  Ready
v Social                               o    Not connected
    Post response      [2,0]  Warning

[Edit prompts]  [Check routing]  [Inspect last run]
```

Only output groups own graph handles: several prompt routes can feed the same output. Do not create an output wire per prompt slot, since that changes the current connection model. Show exact node and port names from actual edges, not inferred destination semantics. For fan-out, show the first destination plus a count and an expandable full list.

Every output group remains visible at normal zoom. For large configurations, initially show route counts and expandable rows; provide an “All routes” inspector with a searchable table. Fit the card height to its content instead of enforcing the current tall prompt-editor layout.

## Connection visibility and interaction

- Hover or select a route to emphasize its output wire and connected target ports. Distinguish selection sources from the chosen output path.
- Show route preview with a label/icon such as “Preview”; show real run activity separately as “Running” or “Last run”. Color is supplemental, not the sole indicator.
- Clicking a destination label focuses the connected node and port. A missing destination exposes a connect action; it does not fabricate a target or silently reroute.
- Output groups display disconnected and multi-destination states explicitly. Warn for configured routes that lead to a disconnected output; allow intentionally unused groups to be marked unused. A selected undeliverable route follows its explicit policy.
- Keep port order stable when filtering or highlighting. Search dims unmatched rows or uses the inspector; it must not make wires jump to different ports.
- Show incoming-edge cardinality errors directly on the relevant selector. The current executor uses the first matching edge; the new validator should reject ambiguous multiple sources for a single-source input.

## Route inspector and prompt editor

Selecting “Edit prompts” opens a side panel with a route list on the left and the selected route on the right. Keep these fields together:

1. Route name.
2. “Selected when” with exact output and prompt input values.
3. Output group and actual connected destination(s).
4. Before-input prompt, a read-only input placeholder/preview, and after-input prompt.
5. Available actions and command settings, collapsed unless needed.
6. Check and preview results.

Use a breadcrumb such as “Messenger / Phone reply” and display usage counts for shared configuration. Default edits affect this route. Editing a shared action template is explicitly labeled with affected routes; duplicating it for this route is a separate operation.

Retain raw prompt editing without rewriting prompt contents during migration. Formatting becomes an explicit command rather than mutating text on focus/blur. The assembled preview shows variables, image inputs, action insertions, multi-pass steps and final output selection. Existing step syntax remains supported; a future structured step editor must round-trip it or leave an unsupported custom fragment in raw mode.

Maintain separate `editingRouteId`, `previewRouteId` and `lastRunRouteId`. Runs never move the user's editor selection. Provide an optional “Follow running route” toggle, off by default and suspended while a draft is being edited. Runs capture a configuration revision so edits during generation do not alter that run halfway through.

## Data model and routing

Replace parallel matrices with route records referencing prompt records and output groups by stable ID. Preserve the existing numeric input values through an explicit mapping:

```text
Route:
  id, label
  match: outputValue + promptValue
  promptId
  outputId

Prompt:
  id, beforeText, afterText, actionBindings, commandBindings

Output:
  id, label, externalHandle
```

Labels and display order are independent of matching values. Migration assigns stable IDs while preserving existing numeric pairs and external handles. Reordering routes never renumbers matches or reconnects wires. Deleting a route leaves its numeric pair unmapped; the UI shows affected mappings rather than shifting other routes into its place. Adding a route does not automatically reuse deleted numeric values.

Resolve exact integer pairs without consulting prompt prose or an LLM. Reject duplicate pairs at configuration time. Reject malformed or unmatched runtime values by default on new configurations. Offer one explicit default prompt per output group for unmatched prompt values; a fallback never silently changes the output group. Invalid output selections require a separately configured explicit policy or an error.

Imported workflows initially retain legacy numeric coercion/fallback behavior in a visible compatibility mode. The migration report identifies these policies and offers strict validation after the user reviews the change. Valid existing pairs produce the same prompt selection and output without requiring upstream changes.

This deliberately separates compatibility of data and valid routes from compatibility of erroneous input behavior. Both need documented treatment.

## Internal execution

The implementation can use four independently testable units behind the single node:

1. `resolveRoute`: validates selectors against a frozen configuration and returns the selected route or a structured error.
2. `assemblePrompt`: resolves variables and existing prompt/action/step content, retaining its source mapping.
3. `executeResponse`: invokes the shared action-aware runtime, or the typed action runtime from the previous proposal when available.
4. `dispatchResult`: returns the result only on the selected output handle.

Preserve the existing once-per-node-per-run memoization: reading several outputs must not trigger multiple LLM calls or action executions. Preserve blank-text skipping, optional connected images, recent reference images, model settings, post-output timing, token metrics and inactive-output empty strings during initial migration. Internal errors and skipped states must remain distinguishable even if legacy graph outputs are strings.

Keep current output payload formats unchanged in this UI/routing refactor. If the action-runtime project introduces structured reply blocks later, use an explicit graph-boundary adapter until downstream consumers migrate.

## Checks users can understand

“Check routing” runs no LLM and performs no actions. It validates route configuration and simulates routing against manually supplied selectors or a captured input snapshot; it must not execute upstream nodes to obtain fresh data.

Show a plain-language result:

> Output input 1 + prompt input 0 selects “Phone reply”. It uses “Messenger reply” and sends its result to “RP Output → Phone”.

The overview reports duplicate mappings, missing prompts, disconnected destinations, invalid source cardinality, unresolved variable/step references and unavailable action dependencies. Do not treat an intentionally empty before/after field as an error. Distinguish a missing prompt record from an empty prompt and an optional unavailable action from a mandatory dependency.

An unmatched route should say which input values were received and where they originated. Avoid silently selecting “Default Prompt” as recovery unless the route policy explicitly says to do so.

## Alternatives and recommendation

- A cosmetic reorganization of the current dropdown card improves space but leaves index instability and hidden routing.
- Separate selector, prompt and dispatcher canvas nodes make internals explicit but increase user wiring and opportunities to connect inconsistent selections.
- **Recommended: one Response Router with visible route/output groups, a side-panel prompt editor, and internally separated execution.** This preserves graph simplicity while making the complete routing configuration inspectable.

## Delivery stages and acceptance criteria

First ship the route overview, connection highlighting and separate editor selection on top of existing execution. Next introduce stable route records, explicit validation and a versioned compatibility adapter. Finally connect it to the typed action runtime without making that larger project a prerequisite for the UI improvements.

Required checks:

- Every imported valid pair selects the same before/after content and output handle as before.
- A route's displayed destination exactly matches its actual edges, including fan-out.
- Renaming/reordering does not change route selection; deleting a route does not shift another into its selector pair.
- Invalid selectors produce an explicit policy outcome; duplicate pairs cannot be saved.
- Running or failing a route does not change the user's editor selection or overwrite an unsaved draft.
- Multiple output reads execute the node once; inactive outputs retain their current behavior.
- Preview causes no model call, upstream execution, generation or message posting.
- Raw prompts, multi-pass steps, variables and custom action/command settings survive migration.
- Image input, reference images, blank-text skipping, streaming, post-output timing and diagnostics retain their behavior.
- At normal canvas zoom, a user can identify available output groups, route counts, the last route used and disconnected destinations; keyboard selection provides the same information as hover.

No application source was changed by this proposal. The existing analysis inventory, map, corpus and manifest remain available alongside this document.
