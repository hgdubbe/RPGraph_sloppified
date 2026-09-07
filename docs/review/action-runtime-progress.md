# Action Runtime Progress

## 2026-09-07: Task 9 Complete, H4 Preparation

Authoritative requirements remain in the [cleanup roadmap](../superpowers/plans/2026-09-06-code-quality-cleanup.md), [command pipeline proposal](../design/RPGraph-redesign-handoff-2026-09-07/command-pipeline-proposal.md) and [Design Atlas](../design/RPGraph-redesign-handoff-2026-09-07/DESIGN_ATLAS.md), especially sections 6-11. Consult the [architecture diagram](../design/RPGraph-redesign-handoff-2026-09-07/action-runtime-architecture.svg) before moving execution ownership.

### Implemented

- `src/app/phoneOutputCommits.ts`: pure typed payload builders and callback application, shared by the direct phone reply, embedded RP message and output-action paths.
- `src/app/socialOutputCommits.ts`: pure comment and incoming DM builders returning commits and warnings; IDs and timestamps are supplied by the caller.
- `src/app/useGraphRun.ts`: keeps translation, warnings, message callbacks, image generation/caption changes and turn collection in their existing execution order. Each iteration reads fresh history; these are not prebuilt batches over stale state.
- `canonicalPhoneName` accepts readonly collections; matching behavior is unchanged.
- Repeated equal messages remain separate messages. Callback failure stops subsequent commits; this is not an atomic transaction or durable exactly-once guarantee.

### Compatibility Boundary

These helpers are legacy projections, not the canonical H4 intent registry. Existing name recovery, unknown-contact fallback and unresolved gallery IDs remain supported. A social DM referencing a missing post still warns and delivers without post context. The current run-post lookup still matches by post ID before historical app-scoped lookup. Strict validation must not inherit these fallback rules accidentally.

Legacy/Strict selector policy continues to affect numeric route selection only. It does not select an action runtime.

### Verification

- Tests were written before the helper modules and initially failed because the modules did not exist.
- Full unit suite: 148 tests in 40 files passed, including seven new commit-builder tests.
- Coverage includes name canonicalization, duplicate-message preservation, attachment resolution, translation metadata, first-message commands/sound, callback failure, account availability, self-DM rejection, post context and missing-post warnings.
- Production TypeScript/Vite build passed; lint on all six touched source/test files passed without warnings.
- Existing Electron Playwright router and prompt-section suites: four tests passed in isolated test profiles. These are regression smoke checks, not phone/social execution coverage.
- Existing Node module-type warnings from prompt extraction remain unrelated.
- No live-provider or full phone/social turn UI test was performed in this step. Pure builder tests do not replace the whole-app final gates in Task 17.

### Next: H4

1. Define the shared action registry and canonical intent/result/artifact/operation/reply-block contracts against the proposal, extending existing domain types rather than adding parallel competing models.
2. Implement strict entity and artifact reference validation, explicitly separate from the compatibility projections above.
3. Move direct and generated actions behind a single effect owner with integration tests proving one commit per operation, ordered output and failure behavior.
4. Continue H5 structural artifact binding, H6 provider capability adapters and H7 durable operation recovery. Do not mark these complete merely because message builders are typed.

Keep remaining provider work (Task 5), preload coverage (Task 6), settings/storybook work (Tasks 10 onward), and whole-app verification in scope.
