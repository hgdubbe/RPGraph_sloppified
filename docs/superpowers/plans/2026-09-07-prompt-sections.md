# Structured Router Prompts Implementation Plan

**Goal:** Organize the existing default prompts by execution step and thematic field, with independent copy-once reuse and contextual routing help.

**Architecture:** Add optional versioned prompt sections to router routes. Lossless ordered fragments retain step markers, separators, before/after placement and existing plain-text projections. The current executor receives the same assembled prompts. Copies contain text, never references. Legacy raw edits rebuild sections only when the text changes.

**Tech stack:** TypeScript, React, Vitest, Electron/Playwright, existing Node 24 CLI.

## Approved Direction

- Derive categories from `workflow.default_v25.json` and `workflow.default_planning_v25.json`, not a universal repeated template.
- Group by actual execution steps. Tone and word usage belong in the final response, not the planning pass. Do not introduce extra model calls.
- Categories cover task, objectives, NPC behavior, character knowledge, player control, scene focus, pacing, dialogue, images, app selection, payloads, actions, social identities, planning outcomes and final checks.
- A Copy from dropdown lists corresponding fields from other routes at the same execution role. Copy once; subsequent edits are independent. Preserve draft/Apply/Undo behavior.
- Keep raw editing/action configuration accessible. Validate structured data and its projections on import/save/run.
- Explain selectors, policies, disconnected outputs, unused flags, execution steps and preview behavior with contextual help.
- Refactor both defaults and provide full workflow imports plus extracted prompt files. Preserve original text/order/step semantics and verify every route.

## Implementation

- [x] Add failing model tests: lossless defaults, role-aware copy, invalid structure, round trips and legacy edits.
- [x] Implement pure section model and router validation/assembly integration.
- [x] Implement compact step/section editor, copy dropdowns, add/remove fields and help using existing UI conventions.
- [x] Extend prompt extract/merge to round-trip the new model and generate importable defaults with a repeatable migration script.
- [x] Run unit/build/lint checks and Electron editor tests, inspect desktop/narrow screenshots.
- [x] Record verification, generated file locations and remaining roadmap work.

## User Feedback Incorporated

The initial paragraph-based split was too fragmented. Replaced it with semantic topic grouping: image lookup/creation instructions remain together; output format/app/payload paragraphs remain together; command declarations remain together. Unknown continuation paragraphs inherit their surrounding topic. All 44 defaults have named topics without generic fallback sections. Added editable section names, category selection, merge-with-previous and explicit regrouping of older layouts. None of these operations introduces model calls; regrouping and merging preserve exact prompt text.

The user also asked whether Strict enables the less LLM-dependent action system. It does not: Strict/Legacy only govern invalid selector handling. H4 remains pending. Existing workflows retain Legacy compatibility.

Verification and import instructions: [prompts/README.md](../../../prompts/README.md).

This is an inserted user-requested feature after H3. Task 9/H4 in [the cleanup roadmap](2026-09-06-code-quality-cleanup.md) remains pending.
