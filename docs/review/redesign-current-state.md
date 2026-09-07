# Redesign Catch-up Audit

Date: 2026-09-07. Branch: `codex/code-quality-cleanup`. Starting commit: `6004b2b`.
Roadmap: [cleanup plan](../superpowers/plans/2026-09-06-code-quality-cleanup.md).
Specification: [handoff](../design/RPGraph-redesign-handoff-2026-09-07/HANDOFF.md), [atlas](../design/RPGraph-redesign-handoff-2026-09-07/DESIGN_ATLAS.md), [router](../design/RPGraph-redesign-handoff-2026-09-07/prompt-switch-redesign.md), [actions](../design/RPGraph-redesign-handoff-2026-09-07/command-pipeline-proposal.md).

## Original Roadmap Status

| Task | Evidence | Actual status |
|---|---|---|
| 1 Baseline/worktree | `f4160f8`, `cleanup-baseline.md` | Complete. |
| 2 Diagnostics | `4db9ecb`, `electron/ipc/crashDiagnostics.cjs` | Logging implemented and tested. Concurrent writes and rejected asynchronous writes still warrant hardening; startup recovery notification is not implemented. |
| 3 Validators | `b6ad721`, `electron/ipc/validation.cjs` | Initial reusable guards complete; not comprehensive validation of all IPC fields. |
| 4 Handler wiring | `efbd8c6`, `electron/main.cjs` | Chat, streaming and settings entry guards wired. |
| 5 Providers | `1093d89`, `electron/providers/` | Partial: adapter-kind selection and LM Studio chat wrapper. Other provider extraction and shared list-model interface remain open. |
| 6 Preload grouping | `f6f50ca`, `electron/preload.cjs`, `src/electron.d.ts` | Grouped aliases implemented alongside legacy methods. The proposed API-shape test/factory was not added; retain as a test-coverage follow-up. |
| 7 Request object | `015bb3e`, `src/app/runGraphRequest.ts`, `useGraphRun.ts` | Adapter implemented; core runner remains positional. |
| 8 Call sites | `6004b2b`, `src/App.tsx`, `src/app/useDirectAppActions.ts` | Selected phone/event/autoturn/direct-action sites migrated. Other legacy callers remain. |
| 9-18 | No implementation commits after Task 8 | Pending. |

Fresh baseline: `npm test`: 33 files, 112 tests passed. This is broader than the original 29-file/104-test baseline. No AGENTS.md was found in this worktree. Package scripts use TypeScript/Vite, Vitest and Electron Playwright; no extra runtime dependency is needed for routing.

## Current Evidence Versus Handoff

The reviewed commit `afa75164a83f12b72f25f3469f5a28b22f9cecfc` is unavailable in local Git history (`git cat-file -t` fails). Snapshot indexes remain historical evidence, not a current-source diff. No history was fetched or current work overwritten.

| Area | Current evidence | Consequence |
|---|---|---|
| Selector behavior | `src/nodes/llm-prompt-switch/execute.ts`: `selectedIndex`, `selectedExistingIndex` | Channel clamping and slot fallback still exist; preserve them visibly for imports. |
| Editor/runtime coupling | Same file writes `llmPromptSwitchSelectedOutputChannel/PromptSlot` | Runtime currently changes editor selection. Separate run metadata. |
| Matrix identity | `src/workflow/nodeHelpers.ts`, `src/types.ts` | Positional titles/before/after rows remain. Add stable records and a legacy editor projection. |
| Output deletion | `src/app/useNodeActionsController.ts`: `removeLlmPromptSwitchOutputChannel` | Renumbers handles. Stable router edits must remove only deleted handles. |
| Persistence | `src/nodes/corePersistence.ts`: `llm-prompt-switch`; `nodeVersion.ts` | Explicit save/hydration fields and node version required; validate new records at import. |
| Card layout | `src/nodes/llm-prompt-switch/Card.tsx`; `coreDefinitions.ts` | Tall 548x1140 card embeds full editors. Reuse its action/command tools in an independent inspector. |
| Run caching | `src/nodes/runScratch.ts`: `llmPromptSwitchMemo` | Preserve one promise per node per run, including concurrent output reads. |
| Action ownership | `promptRun.ts`, `promptActions.ts`, `promptCommands.ts`, `executeGraph.ts`, `useGraphRun.ts` | Existing parsing/validation/effects remain. H4 must consolidate them with direct actions; H1-H3 preserve these execution paths. |
| Providers | `src/llm/types.ts`, `electron/main.cjs`, grouped preload | Initial adapters do not imply universal tool/schema support. H6 must declare capabilities. |

## Catch-up Boundary

Implement H1-H3 before resuming original Task 9 with H4. H4-H7 and remaining Tasks 9-18 are outside this catch-up boundary. Preserve the original whole-app scope, including storybook, settings, persistence and phone work.

Implementation contracts: versioned router configuration with stable output/route/prompt identities, preserved external output handles and explicit numeric selectors; legacy matrices remain a compatibility projection for existing prompt tools. New routers use strict selection; existing nodes retain legacy fallback until the user changes policy. Store editor drafts separately from runtime metadata. Use existing local persistence and provider runtime.

## Delivered Catch-up

H1-H3 and original Task 9 are implemented. Resume at H4's shared action registry and strict reference contracts. Task 9 extracted compatibility commit builders, not the new typed action runtime. The broader provider work in Task 5 remains partial. See [Task 9 implementation and remaining H4 work](action-runtime-progress.md).

Checkpoint commits: `254b55f` records the source handoff, roadmap and audit; `ff99677` implements the Response Router catch-up and regression checks.

- `src/nodes/llm-prompt-switch/ResponseRouterCard.tsx` and `responseRouter.css`: compact output groups, actual node/port destination labels, fan-out, disconnected state, path emphasis, last-run metadata, manual/captured selector check, and a searchable side editor. Large configurations start collapsed. Existing theme tokens are used.
- `Card.tsx`: existing prompt/action/command tools reused inside the editor. Node-authored edits stay in RAM until Apply; switching routes/closing retains the draft. Apply has a green confirmation and one-step Undo Apply. Shared preset/provider settings retain their existing global semantics.
- `routerModel.ts`: versioned canonical records, stable output/route/prompt IDs, independent selectors, monotonically increasing allocation counters, strict/legacy policies, shape/identity validation, pure resolution and assembly, and a matrix adapter for older callers.
- `execute.ts`: node configuration snapshot before input resolution, independent runtime state, validated strict input cardinality, explicit disconnected-output policy, existing action-aware prompt execution and memoized output dispatch. Blank-text skips and inactive-output empty strings remain. Errors preserve the attempted selection and revision.
- `corePersistence.ts`, `validation.ts`, `nodeHelpers.ts`, `coreDefinitions.ts`, `nodeVersion.ts`: save/load, validation, stable ports and new strict defaults. Existing 1.3.1 nodes load compatibly as 1.3.2; router schema version is 1. Imported matrices use the prior effective normalization/defaults and legacy selector policy.
- `useRuntimeNodePatching.ts` and `useNodeActionsController.ts`: older matrix updates translate to canonical records; deleting a stable output does not renumber the other handles.
- `scripts/workflow-prompts.mjs`: extraction/merge uses stable IDs for new router configurations. Old matrix workflows keep their old path. An old prompt document without IDs must be re-extracted before merging into a canonical router; ambiguous positional edits are rejected.
- `src/llm/callDisplay.ts`: displays the actual last-run route rather than the editor selection.

Execution boundaries map to `resolveRoute`, `assemblePrompt`, the existing `runActionAwarePrompt` service (response execution), and `executeLlmPromptSwitchNode` (memoized dispatch). H4 will replace action/text integration behind these boundaries without changing route identity.

## Verification

- Fresh `npm test`: 37 files, 130 tests passed (starting baseline: 33 files, 112 tests).
- `npm run build`: passed.
- ESLint on all touched source/test/script files: zero errors. Two warnings remain in pre-existing `App.tsx` hook code (`currentSession`/`turnsRef` dependencies and `prepareLoadedWorkflow` callback identity); the relevant hook bodies were not changed here.
- Electron Playwright `responseRouter.spec.ts`: 2 passed. Covers real graph labels/edge emphasis, RAM drafts, selection, close/reopen, Apply/Undo Apply, pure routing preview, 650px viewport, 100 routes, keyboard entry, and stable output-handle count.
- Electron Playwright `upgradeNode.spec.ts` and `llmPromptOverrides.spec.ts`: 10 passed. Existing node upgrade, drag regions, prompt overrides and expanded prompt editing remain covered.
- Screenshots inspected: `test/results/response-router-before-editor.png`, `response-router-editor.png`, `response-router-desktop.png`, `response-router-narrow.png`, and `response-router-large.png`. These are generated test artifacts, not durable source assets.
- No live provider or ComfyUI generation was requested. Execution tests use a controlled model implementation; the whole-app final gates in Task 17 remain pending.

## Findings Resolved During Verification

1. The Electron fixture could interact with a DOM before the hidden native window received its first paint. Evidence: `isVisible() === false` and zero requestAnimationFrame callbacks despite working timers. The test helper now explicitly shows its isolated test window, enabling Playwright's normal actionability checks.
2. React Flow culling unmounted the node-owned editor during resize, discarding its local draft. `retainNodeEditor` in `NodeViewValues` and `App.tsx` keeps graph nodes mounted while any editor is open or dirty. Culling resumes when all retained editors are closed and clean. This is a deliberate temporary cost during editing; Task 15 can move inspectors outside culled nodes for independent lifetimes.

## Remaining Improvement Notes

- Keep the diagnostics write-concurrency/rejection handling and preload API-shape test gaps from the audit on the cleanup backlog.
- In Task 15, make draft lifetime independent of graph-mode unmounting and workflow replacement, with explicit discard handling. Current retention protects close/reopen, canvas culling and resize within the mounted graph.
- New canonical saves are intended for this implementation. Opening them in an older build that ignores the new records is not a supported downgrade path; keep the original workflow as a recovery source.
- H4-H7 still own the action registry, provider capability contracts, structural artifact binding and durable action recovery. Existing shared preset dialogs are not a typed action registry.
