# Action-System Baseline

**Planning version:** import [default-planning-actions-v1.json](default-planning-actions-v1.json). Its 12 RP/WhatsUp routes keep separate Planning and Main steps, the original planning objectives/NPC behavior/knowledge/focus, and automatic chance outcomes. Main receives the resolved plan; tone stays in Main. Old image-action replay and messenger JSON instructions are removed from these migrated routes. Planning describes intended actions; only the final structured response requests execution. Social/autoplay compatibility and the limitations below apply to both versions.

Rebuild the planning variant with `node scripts/build-action-baseline.mjs --planning`. Its matching prompt-only export is [default-planning-actions-v1.prompts.json](../prompts/default-planning-actions-v1.prompts.json).

Open [default-actions-v1.json](default-actions-v1.json) using the app's workflow-open command in the updated code-quality-cleanup build. Restart an already-running app to load the new implementation. This is a complete workflow, not a prompt-only document. Save your current work first: opening a workflow replaces the current graph and its embedded storybook.

This baseline is converted from `default_workflows/workflow.default_v26.json` and includes its (blank) storybook, all 16 nodes, all 22 routes and all graph connections.

- **RP and WhatsUp (12 routes):** use Structured v1, including ordinary/image input, autoturn, event and narrator prompt selections. Technical action instructions are injected automatically. Edit tone, player agency, character knowledge, pacing, dialogue and creative image direction in the router.
- **Social and autoplay (10 routes):** retain their original prompts and legacy executor. Direct app actions also retain compatibility execution. Selection is deterministic by input mode, not an LLM fallback.
- Image generation requires a configured ComfyUI image provider. Text replies and existing gallery images do not require ComfyUI. Choose your saved model connection if the imported provider ID falls back to a different local default.
- On structured RP/WhatsUp turns, the implemented effects are WhatsUp sends and image generation. Bank transfers, notes and other effects embedded in ordinary RP are not yet migrated. No prompt can add an unimplemented operation.
- Structured regeneration/restart remains blocked until durable action recovery exists. Social/autoplay compatibility does not silently retry a failed structured reply.

The original default workflows are untouched. Rebuild this derived file with `node scripts/build-action-baseline.mjs`; the script always reads the checked-in default, never user saves. A matching prompt-only export is [default-actions-v1.prompts.json](../prompts/default-actions-v1.prompts.json).

See the [migration guide](../docs/guides/action-prompt-migration.md) and [runtime roadmap status](../docs/review/action-runtime-progress.md).

Verified with import validation and the complete Electron RP/WhatsUp/autosave pipeline in an isolated profile. Provider responses were controlled test responses, not a claim of reliability with every external model.
