# RPGraph redesign handoff

## Start here

This package transfers a completed static evaluation and two concrete design proposals to a future implementation session. No application code has been modified, no dependencies installed, and no builds or application tests run. The proposals are recommendations, not an implemented or empirically validated solution.

Read in order:

1. This file.
2. [Illustrated design atlas](DESIGN_ATLAS.md), including standalone graphics, annotated UI layouts, sequence/state diagrams and worked examples.
3. [Prompt Switch redesign](prompt-switch-redesign.md).
4. [Command pipeline proposal](command-pipeline-proposal.md).

The design atlas expands the proposals with the intended canvas display, side-panel editor, route highlighting, operation lifecycle, artifact binding and recovery behavior. Carry these details into the implementation plan; do not reduce the work to renaming the old node or replacing markers with tool calls alone.

**User clarification: the graphics' colors are illustrative, not implementation requirements. The target system uses a different color theme. Preserve its existing theme and use its design tokens and established node/edge/status styling. Do not copy the SVG palette, introduce a new theme, or recolor the node to match these mockups. The intended requirements are layout, information hierarchy, route visibility, connections and interaction behavior. Express status through labels/icons as well as theme-appropriate styling.**

The user's latest request is to package the work for another session. Do not assume a PR, publication, deployment, new Codex task, or changes to the remote repository have been authorized. The next session's opening instruction determines whether implementation should start.

## User intent and requirements

The user wants a robust action pipeline and an understandable Prompt Switch, with backend changes allowed.

Action pipeline requirements:

- The LLM still decides whether to act, which action to take, and where to send/display/post the result.
- Preserve flexibility, including image generation/search, messenger operations and social flows.
- Execution and final integration must depend less on long-context instruction following, exact action spelling and copied artifact identifiers.
- Preserve creative model control while moving procedural work into code.

Prompt Switch requirements:

- Redesign the giant, unintuitive hub to be easier to use and less error-prone.
- Take the same existing input data, prompts and outputs.
- Make the UI clearly show which routes exist and how they are connected.

The user also explicitly encourages checking their assumptions and proposing better alternatives where warranted. Do not simply agree with every premise.

## Repository and workspace facts

- Repository: https://github.com/unrefined803/RPGraph
- Reviewed commit: `afa75164a83f12b72f25f3469f5a28b22f9cecfc`.
- Local checkout: `C:/Users/htrouet/Documents/ChatGPT/rpgraph-backend/source`.
- Analysis directory: `C:/Users/htrouet/Documents/ChatGPT/rpgraph-backend/analysis`.
- The parent directory `rpgraph-backend` is a separate initialized Git repository. Its status shows `analysis/` and `source/` as untracked. **Work on RPGraph inside `source`, not accidentally in the parent repository.**
- The `source` checkout is a shallow clone and was clean when packaging. Its remote is the repository above.
- Stack observed: Electron, React, TypeScript, Vite; Vitest and Playwright tests. `package.json` declares Node >=24. Read current repository instructions and package scripts before executing anything.
- The analysis used local source. GitHub's web rendering was not identical to the cloned tree in every displayed filename/version; the pinned commit is the source of truth.
- No user screenshots or rendered UI observations were supplied. UI findings derive from component source, not a live usability study.

When starting elsewhere, clone the repository and inspect the reviewed commit. If implementing on a newer revision, compare the relevant files first and update the design where needed. Do not overwrite newer upstream work to match this snapshot. A shallow clone may need additional fetches for comparison or a different base.

## Recommended design: Response Router

Keep one graph node, renamed or presented as **Response Router**, with a route overview on the canvas and a separate side-panel prompt editor.

- Preserve Text, Images, `output-channel` and `prompt-slot` inputs.
- Each route corresponds to an existing numeric selector pair. Group routes under the output they feed.
- Show actual connected destination node/port names and fan-out, disconnected outputs, and last-run route.
- Select a route to highlight its outgoing edges; distinguish preview from execution.
- Keep one output handle per output group, not one per prompt route.
- Separate editor selection from runtime selection; execution must not move an in-progress edit to another prompt.
- Replace parallel prompt matrices as the internal identity model with stable route, prompt and output IDs plus an explicit mapping from existing numeric inputs.
- Reorder/rename without changing mapping values or wires. Deleting a route must not renumber another route into its place.
- New configurations validate exact integer pairs and use explicit fallback policies. Imported workflows retain visible legacy fallback compatibility until deliberately migrated.
- Add a no-side-effect route check using supplied or captured inputs. Do not run upstream nodes to perform a preview.
- Internally separate route resolution, prompt assembly, execution and dispatch. Keep once-per-node-per-run memoization.

Preserve before/after prompt strings, custom commands/actions, workflow variables, `@step`/`@output` behavior, connected and reference images, blank-text skipping, model settings, timing, streaming, metrics and inactive-output empty strings during initial migration. Do not silently reinterpret existing before/after text as new provider message roles.

## Recommended design: typed action runtime

The LLM emits validated intent; a shared domain runtime owns references, dependencies, execution, delivery and result insertion.

- Use a registry with stable action keys, schemas, validators, handlers and rendering adapters.
- Support native tools/constrained responses where available, and validated bounded JSON correction otherwise. JSON syntax alone is insufficient.
- Supply compact current-state entity catalogs; resolve selected handles to stable IDs. Never silently turn an unresolved existing contact into a new contact.
- Common generation-and-delivery can be one declarative intent with a generated attachment source. The backend passes the real artifact to delivery without an LLM copying an ID.
- Advanced flows allow separate search/generation, inspection, later destination choice, no posting, multiple deliveries and multiple instances of the same action.
- Store ordered reply text/action blocks. Code inserts committed results. Text transformation passes cannot rewrite action references or routing.
- Generate action-dependent narration after results, or hold it provisional; do not finalize successful-send prose before success is known.
- Share the domain execution path with direct UI operations. Electron main or a worker is sufficient; a new server is not required.
- Persist operation identity and delivery receipts, with explicit retry, cancellation, regeneration and recovery semantics. Do not claim exactly-once remote image generation where providers cannot guarantee it.

Important factual qualifications:

- The current code already validates some data and corrects some social account output. This is not a greenfield replacement of an entirely unstructured system.
- Generated filenames are already assigned by code. The critical observed fragility is image-ID handoff and textual result integration.
- `social.post` is a proposed unified capability, not an existing prompt command to assume is ready to call. Posts, comments, reactions and DMs have different current integration paths.
- Existing instructions say messenger attachment/voice fields work only for WhatsUp. A unified schema must not silently promise support in other apps without implementing it.

## Evidence map

Read current source around these symbols/areas; line numbers in the proposals refer to the reviewed commit.

| Area | Files |
|---|---|
| Switch UI, selector parsing and memoized execution | `src/nodes/llm-prompt-switch/Card.tsx`, `execute.ts` |
| Switch matrix defaults and indexed output handles | `src/workflow/nodeHelpers.ts` |
| Switch ports, default dimensions and construction | `src/nodes/coreDefinitions.ts` |
| Saving/versioning, route-related data fields | `src/nodes/corePersistence.ts`, `src/types.ts`, `src/workflow/validation.ts` |
| Output deletion and edge renumbering | `src/app/useNodeActionsController.ts` |
| Multi-pass prompts, action planning/replay and command post-pass | `src/nodes/shared/promptRun.ts`, `promptSteps.ts` |
| Action hints, parsing and text-formatted image results | `src/nodes/shared/promptActions.ts` |
| Inline command extraction, grouping and instructions | `src/nodes/shared/promptCommands.ts` |
| Image generation, owner validation and gallery updates | `src/graph/executeGraph.ts`, `src/nodes/runScratch.ts` |
| Final reply integration and app mutations | `src/app/useGraphRun.ts` |
| Existing direct operation and parsing foundations | `src/chat/directAppActions.ts`, `outputActions.ts`, `phoneMessages.ts`, `rpOutput.ts` |
| Provider request contract and bridge | `src/llm/types.ts`, `electron/main.cjs`, `electron/preload.cjs` |
| Diagnostics and related test starting points | `src/nodes/llm-prompt/execute.test.ts`, `src/workflow/validation.fixtures.test.ts`, `src/app/turnTrace.test.ts` |

## Suggested implementation sequence

Treat these as reviewable milestones, not one giant untestable rewrite.

1. Verify current code/instructions and establish a development branch/worktree when implementation is authorized. Inspect persistence versions, graph-port compatibility and test fixtures before choosing exact contracts.
2. Build the route overview, actual connection labels/highlighting, side-panel editor and independent editor/run selection. Keep current execution underneath. Verify with a rendered UI, keyboard use and representative route counts.
3. Introduce stable route records, explicit numeric mapping, pure route validation, configuration snapshots and migration compatibility. Preserve exact valid-pair behavior and outgoing edges.
4. Add canonical action/result contracts and the domain service. Adapt legacy inputs and direct actions so there is only one owner of effects for a migrated run.
5. Migrate image generation plus WhatsUp delivery/display first, with structural artifact binding and deterministic result placement.
6. Extend provider structured-output contracts, then migrate other app operations and durable recovery. Keep existing workflows readable and prevent double execution across adapters.

A later implementer should write a concrete implementation plan after checking the current tree. Avoid making all routing/UI improvements wait for complete action-runtime migration.

## Required acceptance checks

Routing and UI:

- Every existing valid selector pair selects the same prompt and output after migration.
- The overview's destination labels match real graph edges, including fan-out.
- Reorder/rename preserve mappings; delete does not shift mappings.
- Malformed/unmatched selectors and duplicate pairs receive explicit validation outcomes.
- Runtime activity does not change editor selection or unsaved drafts.
- Multiple output reads execute once. Inactive outputs and blank text retain their documented behavior.
- Route preview executes no LLM, upstream node or app effect.
- Prompt strings, variables, multi-pass steps and custom action configuration survive migration.
- Visible route groups, connection states and run state are understandable without opening the prompt editor.

Actions:

- A generated attachment arrives at the LLM-selected destination even if narrative output contains no image reference.
- Invalid action/entity/artifact references cannot execute.
- Repeated command types remain separate ordered operations.
- Delivery retry reuses an already-generated image.
- Restart/replay does not duplicate local deliveries or transfers.
- Unsupported destination capabilities are caught before expensive dependent work.
- Inspection or gallery-only generation does not force posting.
- Translation and speaker passes cannot change bindings or execute text as commands.
- Failure, cancellation, prose regeneration and action replacement follow explicit lifecycle policies.
- Phone and story views derive from the same committed result.

Use appropriate existing tests plus targeted tests for these invariants. The proposals include further details. No test is currently claimed to pass from this work.

## Decisions still requiring implementation design

The user specified goals, not every internal choice. Proposed names/layouts and type sketches are recommendations. Resolve routine choices from current code without repeated permission requests, subject to current session instructions.

Concrete open engineering choices include the persistent journal/store, IPC contract, supported provider schema modes, save-format versioning, result-block boundary adapters and action revision/branch semantics. Do not invent universal provider support or silently change old workflow behavior. A future session should surface material tradeoffs in its implementation plan.

## Package contents

- `HANDOFF.md`: this file.
- `NEXT_SESSION_PROMPT.txt`: paste into the next session to request implementation.
- `DESIGN_ATLAS.md`: expanded illustrated design, UI behavior, data flow, examples and review checkpoints.
- `response-router-wireframe.svg`: standalone proposed canvas layout with visible routes and graph connections.
- `action-runtime-architecture.svg`: standalone architecture graphic separating workflow routing from model-selected action destinations.
- `prompt-switch-redesign.md`: detailed router UI, contracts, migration and tests.
- `command-pipeline-proposal.md`: evaluation and action architecture.
- `repo_inventory.json`, `repo_map.json`, `repo_corpus.jsonl`: supplemental static index of the pinned checkout. Use targeted source reads first; the map/corpus are large.
- `case_manifest.json`: generated index manifest. Its `network_contacted: false` describes the local analysis tooling; repository acquisition did use GitHub/network access. Absolute paths inside analysis artifacts refer to the original workstation.

The portable archive does not embed the source checkout or Git history. Obtain source from the repository and revision above, or use the existing local checkout. The relative document links work after extraction.

Mermaid diagrams are embedded as editable source in `DESIGN_ATLAS.md`; compatible Markdown viewers render them. The standalone SVG graphics need no internet connection, and text wireframes remain readable without diagram support.
