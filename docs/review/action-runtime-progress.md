# Action Runtime Progress

## 2026-09-07: H4a Compiler Foundation Complete

H4 remains unfinished and is not enabled for live workflows. The new modules are deliberately not imported by the production execution path yet. Existing prompts, direct actions, saved workflows, and Legacy/Strict routing behavior are unchanged.

### Implemented and Tested

- `src/actions/contracts.ts`: version-1 plan contracts for scope, authoritative catalogs, stable entity/artifact bindings, generation/delivery operations and ordered reply blocks.
- `src/actions/compileReply.ts`: synchronous preflight for a complete decoded reply envelope. Validates the whole batch before allocating block/operation IDs; returns structured field errors with no partial executable plan on failure.
- The compiler accepts `image.generate` and WhatsUp `messenger.send`, including stored images and an inline `generate_image` source. Inline generation expands into separate generation and delivery operations with an explicit dependency and result binding. No provider, filesystem or app-state effects are invoked.
- Exact catalog handles only: unknown, ambiguous, wrong-type, stale, unavailable, cross-save and cross-branch references are rejected. Catalog turn identity, sender image access, generation capability and destination capability are checked. There is no fallback from a misspelled character to a new contact.
- Empty action lists, action-only replies and repeated identical messages are supported. Every occurrence receives its own runtime-assigned ID; text is left provisional and is never interpreted as executable commands.
- Initial red test run failed because the compiler did not exist. Now 24 focused tests pass; full suite: 172 tests in 41 files. Production build and actions-directory lint pass. Existing prompt-extraction module-type warnings remain unrelated.

### Explicit Limits and Next Checkpoint

1. The compiler dispatch table is not the complete action registry. Add shared argument/result schemas, execution handlers, retry policies and rendering adapters before declaring the registry implemented.
2. Build catalogs from authoritative storybook/session state, including actual image access and provider availability. The current compiler accepts a trusted application-supplied catalog; no production catalog builder is wired yet.
3. Recheck availability/access at the effect boundary, especially after asynchronous generation. Successful preflight is not a durable authorization or proof that state cannot change.
4. Connect a single execution owner and adapt direct/legacy operations behind an explicit opt-in workflow boundary. Never execute both the compatibility path and the new runtime for one operation. Existing legacy helper behavior must stay isolated.
5. Implement result/receipt contracts, artifact storage and same-result phone/RP rendering. Compilation of dependencies alone does not prove that a generated image reaches a recipient; H5's deterministic provider/store tests and live integration are still required.
6. Only WhatsUp and existing character references are supported in this initial compiler. New contacts, other apps, advanced result selection, voice payloads and broader action types need explicit contracts rather than inferred support. Generated inline attachment ownership is restricted to the sender until cross-owner access semantics are defined.
7. The application must supply globally scoped operation IDs; the compiler checks uniqueness within one plan only. No execution, retries, persistence, crash recovery or exactly-once guarantee is implemented here. H7 remains open.

No UI or live-provider tests were run for this dormant compiler-only step. Prior Electron results remain historical, not evidence of an enabled action runtime.

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

### Original Next Steps After Task 9

1. Define the shared action registry and canonical intent/result/artifact/operation/reply-block contracts against the proposal, extending existing domain types rather than adding parallel competing models.
2. Implement strict entity and artifact reference validation, explicitly separate from the compatibility projections above.
3. Move direct and generated actions behind a single effect owner with integration tests proving one commit per operation, ordered output and failure behavior.
4. Continue H5 structural artifact binding, H6 provider capability adapters and H7 durable operation recovery. Do not mark these complete merely because message builders are typed.

Keep remaining provider work (Task 5), preload coverage (Task 6), settings/storybook work (Tasks 10 onward), and whole-app verification in scope.
