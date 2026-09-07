# Response Router Prompt Imports

## Complete Workflows

Open either file through the app's existing workflow-open command:

- [Default workflow](../workflow.default_v25.json): 22 routes with thematic prompt sections.
- [Planning workflow](../workflow.default_planning_v25.json): 22 routes, with planning and main-response sections separated where those execution steps already exist.

All original prompt text, step markers, actions, selector numbers and connections are retained. The migration adds structured router data; it does not change story behavior or enable a new action runtime. Loading these files replaces the active workflow, so save your own workflow first. They do not contain unsaved edits from an already-open app instance.

## Prompt-Only Files

- [Default prompts](default-response-router.prompts.json)
- [Planning prompts](default-planning-response-router.prompts.json)

These use prompt-document version 2, not the workflow file format. Merge them with the existing command-line tool; do not open them as complete workflows:

```powershell
node scripts/workflow-prompts.mjs merge prompts/default-response-router.prompts.json workflow.default_v25.json workflow.imported.json
node scripts/workflow-prompts.mjs merge prompts/default-planning-response-router.prompts.json workflow.default_planning_v25.json workflow.planning.imported.json
```

Then open the resulting workflow file in the app. Existing version-1 text-only prompt documents remain supported. Stable route identities prevent presentation reordering from applying text to the wrong route. Version-2 section text is authoritative; the merger generates the raw before/after projections.

## Editing

Execution-step tabs contain thematic sections, not one section per blank line. A normal RP response has six sections: step description, character knowledge, images, output format, commands and final checks. More specialized routes retain their own meaningful topics.

Section names and grouping are editable. Add a section, rename it, choose its matching category, or merge it with the preceding section in the same step. Copy from copies only the text once from a corresponding category and execution role. Later edits remain independent. Tone, word usage, perspective and dialogue categories belong to the final response step, not planning.

Regroup by topic rebuilds an older over-fragmented layout without changing prompt text. It replaces custom names/grouping in the draft, asks for confirmation, and requires Apply. Unrecognized paragraphs continue the surrounding topic. Raw prompt and action tools remain available, including action/command configuration and variable tooling. A changed raw prompt is regrouped; structured editing preserves your explicit grouping.

## Routing Is Not Action Selection

The output/prompt selector pair picks which prompt runs. Legacy recovers some invalid values by truncating/clamping/falling back; Strict rejects invalid or unmatched values. Both behave the same for a valid pair. Keep Legacy for existing workflows until their selector sources have been checked.

Neither option changes how the LLM selects actions. The typed action runtime described by H4 in the cleanup roadmap is still pending. These sections continue through the existing prompt/action executor, without additional model calls.

## Verification (2026-09-07)

- 141 unit tests across 38 files pass; TypeScript/Vite build and lint of all touched source/test/tool files pass.
- Four targeted Electron UI tests pass, covering copy independence, Apply, rename, regrouping, default planning/main layouts, 100-route search, raw-editor draft retention and narrow layout.
- Every one of the 44 default routes reassembles to the original text exactly; all existing execution chains are unchanged. Comparing the full workflow objects to the previous commit shows no changes outside the added responseRouter data.
- Desktop (1440px) and narrow (650px) screenshots inspected. No live provider or ComfyUI calls made; no user autosaves or running-instance documents modified.
- Node 24 currently reports a benign module-type detection warning when CLI tools import the shared TypeScript section model; execution and validation succeed.

To mechanically regenerate grouping from the bundled raw texts, use `node scripts/structure-default-prompts.mjs <workflow-path>`, then re-extract with `node scripts/workflow-prompts.mjs extract <workflow-path> <prompt-path>`. The regrouping script intentionally replaces custom grouping in the named file; run it only on the intended defaults or a saved copy.
