# RPGraph Continuation Handoff — S9 Editor/Migration, First Slice

## Status: Not started. This is a scoped investigation + plan, not a partial implementation.

## Where this fits

The S10 model-authorable family rollout is done (`docs/handoff/2026-09-12-note-write.md`, `docs/handoff/2026-09-12-assistant-chat-staged-done.md`), image generation reached staged mode (`docs/handoff/2026-09-12-staged-image-generation.md`), the roadmap's first full mixed acceptance scene is delivered (`test/e2e/stagedMixedScene.spec.ts`), and S8 has its first slice — retry without regenerating (see `docs/review/action-runtime-progress.md`'s "2026-09-12: S8 First Slice — Retry Without Regenerating (Roadmap M10)" entry). **This session picked S9 (editor/migration) as the next target**, per explicit user choice among the remaining options (S8's remainder, S9, continuation planning, `choice.information`/`ui.control`) — see `docs/superpowers/plans/2026-09-09-staged-workflow.md`'s S9 line: *"Route-level staged configuration UI, an output-mode selector, and ordered-beat/dependency inspectors. Today, a staged route is authored entirely by the live planner LLM — nothing to click yet."*

**No code for S9 itself has been written.** This document is the scoping/investigation the user asked for, to hand to a fresh session.

## What "S9" actually covers, and what already exists

The roadmap's S9 description bundles several genuinely different pieces. Checked against current source, here's what's real:

1. **Output-mode selector: already exists.** `src/nodes/output/Card.tsx`'s "Action protocol" dropdown (Legacy/Structured/Staged — just renamed from "Legacy/Structured v1 (experimental)/Staged v1 (experimental)" this session, a `TODO.md` item picked up opportunistically while investigating this same file) already lets a route opt into `staged-v1`. This part of S9 is done and was never the gap.
2. **Route-level staged configuration UI: does not exist at all.** Every actual per-turn staged parameter is currently hardcoded in [src/staged-workflow/runLiveStagedTurn.ts](../../src/staged-workflow/runLiveStagedTurn.ts):
   - Line ~75: `instructions: { general: 'Continue the roleplay scene naturally, respecting established tone and character voice.' }` — one fixed sentence, the same for every staged route in the entire app, with no way for a user to author anything. This is the single biggest reason staged mode currently reads as "a black box that just wings it."
   - Line ~86: `limits: { beats: 32, calls: 8, generations: 4, continuations: 0 }` — a fixed per-turn budget, not configurable, and `continuations` is hardcoded to `0` (continuation planning is separately unbuilt — see the roadmap's own next-item list — so this isn't a regression, just also not exposed).
   - `stagedRecipeDefinitions()` (in `recipeInventory.ts`) always returns every advertised recipe; there's no per-route allow-list of which families a given staged route may use.
3. **Ordered-beat/dependency/result inspectors: do not exist.** There is no UI surface today that shows a compiled plan, per-stage execution status, or realized outputs for a staged run — not even a read-only debug view. The scheduler already produces exactly this data (`StageRunSnapshot`, `StageRunState`, `RunCompiledTurnResult` in `scheduler.ts`), it just isn't surfaced anywhere.
4. **"Preserve Apply-style editing and originals during migration preview"** — this line is about the *broader* redesign's Apply/Draft pattern (Task 11 in the parent cleanup roadmap, itself still open and unrelated to staged mode specifically); not staged-specific, out of scope for this slice.
5. **"Deliver an importable baseline only after acceptance gates pass"** — a staged-mode equivalent of `workflows/default-actions-v1.json` (see `scripts/build-action-baseline.mjs`). Reasonable, but explicitly gated on the rest of S9 landing first; not this slice.

## Recommended first slice: authored staged instructions, per route

Give a staged route a real, user-authored instruction text field — replacing the single hardcoded sentence — using the **exact same pattern already established for the output node's speaker-analysis prompt**, so this isn't a new UI convention, just the third application of an existing one.

### The existing pattern to copy

[src/nodes/output/speakerPrompt.ts](../../src/nodes/output/speakerPrompt.ts) + [src/nodes/shared/promptPresets.ts](../../src/nodes/shared/promptPresets.ts) + the `SpeakerPromptTextarea`/`speakerPrompt*` state block in [src/nodes/output/Card.tsx](../../src/nodes/output/Card.tsx) (`data.outputSpeakerPrompt`, `outputSpeakerPromptSettings()`, `promptPresetSource()`, `promptPresetDisplayText()`, `promptSettingForSource()`) together implement: a `{ mode: 'default' | 'custom'; customText?: string }` setting stored on the node, a three-way default/custom/workflow-preset source selector, an auto-resizing textarea, and save-time collapse back to `default` when the custom text exactly matches the default (`outputSpeakerPromptSaveSettings()`). This is a complete, working, already-reviewed UI pattern for "let the user author one piece of route-level instruction text with a sane default." Read all three files fully before starting — don't re-derive this from scratch.

### Concrete plan

1. **`src/types.ts`**: add `StagedInstructionsSettings = { mode: 'default' | 'custom'; customText?: string }` (same shape as `OutputSpeakerPromptSettings`) and a `stagedInstructions?: StagedInstructionsSettings` field on the output node's data type (near `actionProtocol`/`outputSpeakerPrompt`).
2. **New file, mirroring `speakerPrompt.ts`'s shape** (or add to an existing staged-workflow-adjacent module — check whether `src/staged-workflow/` already has a natural home, e.g. a new `src/staged-workflow/stagedInstructionsPrompt.ts`, since `speakerPrompt.ts` lives under `nodes/output/` for a reason specific to that feature): `defaultStagedInstructionsText` (replace the current hardcoded sentence in `runLiveStagedTurn.ts` with this exported constant), `defaultStagedInstructionsSettings()`, `stagedInstructionsSettings(value)` (normalize), `stagedInstructionsSaveSettings(value)` (collapse-to-default on save).
3. **`src/nodes/output/Card.tsx`**: a new authored-text UI block for staged instructions, gated to only show when `data.actionProtocol === 'staged-v1'` (matches how e.g. `streamOutputEnabled`/other action-protocol-specific fields are likely already conditionally shown — check the surrounding code for the existing convention on conditionally showing protocol-specific fields before adding a new one). Reuse `SpeakerPromptTextarea` (rename or generalize it if it's speaker-prompt-specific in ways that don't generalize cleanly — check first) or copy its auto-resize behavior.
4. **`src/app/useGraphRun.ts`**: thread the resolved instructions text through to `runLiveStagedTurn`'s call — currently `stagedTurnBase` (see the retry-loop code added this session) doesn't pass `instructions` at all because `runLiveStagedTurn.ts` builds them internally; this needs a new option on `StagedTurnOptions` (e.g. `instructionsText?: string`, defaulting to the existing hardcoded sentence when absent, so existing tests/fixtures that don't pass it keep working unchanged) threaded into `buildLiveContextSource`'s `instructions: { general: ... }` call.
5. **`src/staged-workflow/liveContextSource.ts`** / **`runLiveStagedTurn.ts`**: replace the hardcoded string with the passed-through value (falling back to the same default text when not customized, so behavior for every existing staged Electron regression is unchanged unless a test explicitly opts into custom text).
6. **Tests**: a focused unit test for the new settings module (mirroring `speakerPrompt.ts`'s own test coverage style, if any exists — check), and **one new Electron regression** proving a custom staged-instructions text actually reaches the planner LLM's prompt (assert the prompt string sent to `llm:chat-completion` contains the authored text, similar to how `structuredActions.spec.ts` already asserts `request.prompt.includes('Use a warm, understated tone.')` for the router's authored tone text).

### Why this slice specifically, not the others

- It's the smallest S9 piece that changes staged mode from "the model invents everything" to "the user has *a* real authoring surface" — directly addresses the roadmap's own framing ("nothing to click yet").
- It reuses an existing, already-battle-tested UI/data pattern exactly, so there's no new design surface to get wrong — the main work is wiring, not invention.
- It's independently useful and shippable without also building limits-configuration or a plan inspector; those can be separate follow-on slices once this one's pattern is proven, matching how every other roadmap milestone in this project has been scoped narrowly on purpose.

### Explicitly deferred, and why

- **Configurable limits (beats/calls/generations)**: real, but lower-value than instructions (the current hardcoded budget is generous enough that no live regression has hit it), and needs a design decision on units/UI (sliders? per-limit fields? one combined "complexity" setting?) that instructions text doesn't.
- **Recipe allow-list per route**: would need real UX for picking from ~10 families, and there's no evidence yet that users want to *restrict* staged mode rather than expand what it can author — solving a problem that hasn't been observed yet.
- **Plan/beat/dependency inspector**: the most valuable long-term (huge for debugging "why did the model's plan fail"), but it's a genuinely new, nontrivial UI surface (a plan visualization), not a small wiring slice like the others. Worth its own dedicated session once instructions authoring proves the pattern is worth investing further in.
- **Importable staged baseline workflow**: explicitly sequenced after the rest of S9 in the roadmap text itself.

## Things to double-check before trusting this plan blindly

- Whether `Card.tsx` already has an established convention for showing/hiding fields conditionally on `data.actionProtocol` (search the file for `actionProtocol ===` before adding the first one, so the new field follows existing style rather than inventing a second convention).
- Whether `SpeakerPromptTextarea` is generic enough to reuse directly (its name and any speaker-prompt-specific behavior baked into the auto-resize effect) or whether it should be renamed/extracted into a shared `AutoResizeTextarea` first — check callers before deciding; a small rename now avoids two near-duplicate components later.
- Whether `speakerPrompt.ts` has a dedicated test file to mirror the coverage style for the new settings module — check `src/nodes/output/` for one before writing tests from scratch.
- Whether any existing staged Electron regression's fake LLM handler distinguishes the plan-call prompt from content-call prompts using substring matches that could accidentally also match new instructions text injected into the prompt (unlikely, since `buildLiveContextSource`'s instructions become an `I`-kind context variable consumed by content stages, not literal text spliced into the plan-call prompt itself — but verify by reading `planPrompt.ts`/`liveContextSource.ts` rather than assuming).
- Whether `defaultConnectionId`-style per-node override precedent exists for anything else that would suggest staged instructions should also support a per-character or per-scene override rather than one fixed route-level text — out of scope for this slice regardless, but worth a one-line note in the PR/handoff for whoever does limits/recipes next.

## Verification ledger to run before calling this done

Follow the exact pattern from this branch's other 2026-09-12 sessions (see `docs/handoff/2026-09-12-note-write.md`'s verification ledgers for the exact shape expected): full `vitest run`, `tsc -b --pretty false`, ESLint on every touched file, `npm run build`, and the full action-related Electron regression battery together (`bankTransfer`, `noteWrite`, `assistantChat`, `outputActionsUi`, `socialActions`, `stagedWorkflow`, `stagedBankingNotes`, `stagedAssistantChat`, `stagedImageGeneration`, `stagedMixedScene`, `stagedRetry`, `structuredActions`, `actionBaseline`, `voiceMessage` — 21 cases as of this session) plus the new instructions-authoring spec, run twice in a row to rule out flakes (this branch has a documented, harmless "Execution context was destroyed, most likely because of a navigation" flake — confirm any failure against that signature via an isolated rerun before treating it as a regression).

**A workflow-specific gotcha already hit twice this session, worth restating:** the Electron e2e suite runs against the **built `dist/` bundle**, not live source. Run `npm run build` after every source change before trusting an e2e spec's result — a stale bundle produces confusing "the run just silently does nothing" failures that look like logic bugs but aren't.

## Workspace and safety

- Working directory: `C:\Users\hen\Documents\Claude\RPGraph_sloppified`. Branch: `codex/code-quality-cleanup`. **Nothing has been committed this entire project** — don't reset/stash-drop/discard anything.
- Bundled Node 24 required for all commands (shell default is older):
```bash
node_path="C:\Users\hen\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"$node_path" node_modules/vitest/vitest.mjs run
"$node_path" node_modules/typescript/bin/tsc -b --pretty false
"$node_path" node_modules/eslint/bin/eslint.js <files>
node_dir=$(dirname "$node_path"); PATH="$node_dir:$PATH" npm run build
node_dir=$(dirname "$node_path"); PATH="$node_dir:$PATH" npx playwright test <spec>
```
- Known pre-existing Electron flake: "Execution context was destroyed, most likely because of a navigation" on an essentially random spec in a batched run; re-running the same command (or just that spec alone) passes. Don't chase it.
- A known, pre-existing, unrelated ESLint error exists in `src/app/useRoleplayPanelRuntime.ts` (`react-hooks/refs`) — confirmed via `git stash` multiple times this branch to predate all of this work. Do not fix it as part of this task.
- There is also a live [artifact](https://claude.ai/code/artifact/caebaccf-f75c-47cb-8e9c-a197a2578d3c) — a visual roadmap drawing the user explicitly asked to be kept updated as roadmap work lands (see the "Roadmap artifact upkeep" memory note, if this session has access to it, or just ask the user for the link). Update it (same URL, republish in place) when this slice ships, the same way prior 2026-09-12 sessions did.

## Suggested opening request for the new session

> Read `docs/handoff/2026-09-12-s9-editor-scoping.md` in full. Implement its recommended first S9 slice: let a staged-v1 route author its own instructions text (replacing the single hardcoded sentence in `runLiveStagedTurn.ts`), reusing the exact default/custom/workflow-preset pattern already established for the output node's speaker-analysis prompt (`src/nodes/output/speakerPrompt.ts` + `src/nodes/shared/promptPresets.ts` + the corresponding UI block in `src/nodes/output/Card.tsx`) rather than inventing a new pattern. Follow the concrete plan in that doc's "Recommended first slice" section, check the "Things to double-check" list before assuming anything about existing conventions, and run the full verification ledger described there — including rebuilding `dist/` before every Electron regression run. Preserve all existing dirty work; nothing has been committed this whole project so far. Update the published roadmap artifact when done, the same way the three prior 2026-09-12 sessions did.
