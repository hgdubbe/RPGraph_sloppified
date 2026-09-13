# RPGraph Continuation Handoff — S8 Restart Reconciliation, Scoping

## Status: Groundwork slice delivered 2026-09-12 (persistence only). Resume-on-restart UI is still not started.

**Update (2026-09-12, after this doc's own investigation):** the user chose, of the two options in "Recommended approach" step 1, to add a separate stable session id alongside the existing ephemeral scope rather than changing `TurnScope` itself. That slice is now built:

- `VariableStore.serialize()`/`static fromSerialized()` (`variableStore.ts`) — the class turned out to be plain data internally (Maps/Sets of primitives), so this is a straight dump/rehydrate, unit-tested for a full round trip including invalidation/commit state surviving a real `JSON.stringify`/`JSON.parse`.
- `src/staged-workflow/stagedRetryPersistence.ts` — `serializeStagedRetryState`/`deserializeStagedRetryState` (pure) plus `writeStagedRecovery`/`readStagedRecovery`/`clearStagedRecovery` (thin `window.rpgraph.*` wrappers, mirroring `src/actions/effectJournal.ts`'s own shape for H7).
- `electron/ipc/stagedRecovery.cjs` — one durable JSON record per RP save file name (`sessionFileName`), plain-JSON, no encryption, matching `effectJournal.cjs`'s own style exactly; unit-tested (`electron/stagedRecovery.test.ts`).
- `useGraphRun.ts` now writes a durable recovery record for the active session whenever a staged turn reaches the manual-retry banner (`stagedRetryPrompt`), and clears it on dismiss or once the turn resolves either way (compile-failed/incomplete/ok). Guarded by `activeSessionFileName` — an unsaved RP has no stable identity, so nothing is persisted for it, matching this doc's own finding.
- End-to-end proof: `stagedRetryPersistence.test.ts` takes a *real* failed `runLiveStagedTurn` attempt, round-trips its retry state through actual `JSON.stringify`/`JSON.parse` (exactly what disk persistence does), and successfully resumes and commits it with no repeated LLM calls or duplicate effects — proving the serialization boundary is sound, not just that the pieces compile.

**What is deliberately still not built** (this is the reason S8 isn't closed): nothing yet *reads* the persisted record to offer a "resume your interrupted turn" prompt after an app restart. See "Next slice" below — it needs a new entry point into the staged-turn machinery that isn't triggered by a fresh user input, which is a real refactor of `useGraphRun.ts`'s giant staged block, not a small addition.

**Bug found and fixed (2026-09-12, same day):** the first cut of this slice keyed the recovery record on `activeSessionFileName` (App.tsx). That field stays `null` for a live session the user has never explicitly run "Save RP" on — which is the *common* case, since the background rolling turn-autosave (`turn-autosave-a`/`-b.rpgraph.json`) runs and persists real conversation state independent of any explicit save. Guarding on `activeSessionFileName` meant recovery-writing silently never engaged for that common case at all, despite there being a real, durable backup to correlate against. Separately, when a session *was* loaded from a turn-autosave file, `activeSessionFileName` becomes literally `"turn-autosave-a.rpgraph.json"` or `"-b"` — one of only two rotating physical filenames, reused across unrelated conversations over the app's lifetime, not a stable per-conversation identity.

Fixed with a dedicated `stagedRecoveryAnchorRef` (App.tsx), separate from `activeSessionFileName`, updated in three places: (1) synced from `activeSessionFileName` on every explicit save/load, (2) set to the just-written file after every successful background turn-autosave write (closing the "never engages" gap), (3) implicitly cleared on a fresh/reset workflow. `useGraphRun.ts` now takes this as a `Ref<string | null>` option instead of a plain `activeSessionFileName` value, since it can change mid-run as autosave rotates slots. This intentionally keys the recovery record to *the specific physical backup file* the failed turn was built on top of — which is the semantically correct correlation (see the doc's original "blocking discovery" section above for why a fully stable session UUID was considered and not needed here). Verified by a new Electron regression, `stagedRetry.spec.ts`'s "durably records recovery state for a never-explicitly-saved session" test, which runs a real successful turn (autosave-only, no explicit save), then a real failed turn, and asserts a recovery record actually exists — this test would have failed against the original `activeSessionFileName`-keyed version.

## Original status (below, unchanged): Not started. This was a scoped investigation, not a partial implementation, until the groundwork slice above landed.

## Where this fits

S9 (route-level staged configuration) is now fully done — four slices landed 2026-09-12: authored instructions text, per-turn beats/calls/generations limits, a read-only Staged Plan/beat/dependency viewer, and a per-route recipe allow-list (see `docs/review/action-runtime-progress.md` and the published roadmap artifact). With S9 closed, the roadmap's own "remaining real next steps" list (`docs/superpowers/plans/2026-09-09-staged-workflow.md`, "Next implementation") puts **the rest of S8** next: "session-persisted reconciliation across an app restart, action-preserving regeneration of narrative content, branch semantics." This document scopes the first of those — restart reconciliation — after investigating what it would actually take, per this project's own practice of scoping genuinely new architecture before implementing it (see the S9 scoping doc, `docs/handoff/2026-09-12-s9-editor-scoping.md`, for the template this follows).

**No code for this has been written.**

## What S8's first slice already built (2026-09-12)

Retry-without-regenerating: when a staged turn fails partway through, `scheduler.ts`'s `runCompiledTurn` accepts a `resume` option that skips already-succeeded stages (reusing their realized outputs from `RunCompiledTurnResult.outputs`) instead of repeating them. `runLiveStagedTurn.ts` exposes this as `resume: StagedRetryState` (`{ plan: CompiledTurnPlan; store: VariableStore; completedStageIds: string[]; outputs: Record<string, VariableRef> }`), built straight from a failed run's own `stages`/`outputs`. `useGraphRun.ts` retries automatically up to `stagedAutoRetryAttempts` (default 3), then falls back to a manual Retry/Dismiss banner (`stagedRetryPrompt`).

**This is in-memory only.** `StagedRetryState` lives in a local variable inside the async `runGraph` closure for the lifetime of that one call. Closing the app, reloading the page, or the process crashing loses it completely — the retry banner and the `resume` state both disappear, and the user's only recourse is to re-send the message and let the model re-plan from scratch, potentially repeating any already-committed effect the scheduler doesn't already know to skip (it only skips stages *within* the same in-memory `StagedRetryState`).

## The blocking discovery: there is no real save/branch identity anywhere in this path

This is the reason this isn't a quick "persist `StagedRetryState` to a file" slice.

`runLiveStagedTurn`'s `scope: { saveId: string; branchId: string; turnId: string }` — the same `TurnScope` used by `VariableStore` for its own internal cross-turn isolation checks, and by `StagedActionBridge`'s catalog (`liveBridge.ts:55`) — is built in exactly one place, `useGraphRun.ts:1751`:

```ts
const runId = createRunId(); // `run-${Date.now()}-${crypto.randomUUID()}`
scope: { saveId: runId, branchId: runId, turnId },
```

`saveId` and `branchId` here are **both set to a random per-attempt UUID** (`createRunId()`, `src/app/runOrchestration.ts:84`). They are not, and were never intended to be, the actual RP save file's identity (the `.json` file under the profile's `files/` directory, or whatever a "branch" means in the data-management sense — see `src/data-management/types.ts`'s `RpgraphSessionV2` for what real persisted session identity looks like). This is the *only* scope concept staged workflow has.

The existing H7 effect journal (`electron/ipc/effectJournal.cjs`) has the identical limitation — its own top-of-file comment says outright: *"Reconciliation/retry is not implemented here; see H7 in the roadmap."* Its `scope` field is the same ephemeral run-scoped object. `clearEffectJournalForScope` compares `saveId`/`branchId`/`turnId` — all three ephemeral — so nothing durable today can answer "does this journal entry (or persisted retry state) belong to the RP save the user has open right now?"

**Consequence:** persisting `StagedRetryState` to disk and reloading it on next launch is the easy 20% of this feature. The hard 80% is: deciding what "the same conversation" means durably (probably needs threading the actual save file name / a stable per-session id into `TurnScope` construction, which today conflates "this run" with "this save" on purpose — worth checking whether that conflation is load-bearing anywhere else before changing it), and designing when/how to surface "resume your interrupted turn?" on next launch (on app start? only when the same save reopens? what if the user opened a different save?).

## What's actually serializable (the good news)

Investigated so a future implementer doesn't have to re-derive this:

- **`CompiledTurnPlan`** (`compileTurnPlan.ts`) is already plain, JSON-serializable data — no functions, no class instances. Trivial to persist as-is.
- **`VariableStore`** (`variableStore.ts`) turns out to be plain data internally too: a `TurnScope`, three `Map`s (`records`, `latest` — both keyed by string), one `Set` (`invalidated`), one `Set` (`committed`), a `characters` counter, and two numeric budgets. None of its fields are functions or closures. A `serialize()`/`static fromSerialized()` pair (dump the Maps/Sets to arrays, reconstruct via the private constructor plus direct field assignment, or add a dedicated rehydration path) is straightforward and independently unit-testable — this part is *not* the hard part of this feature, despite looking like it might be.
- `StageRunState[]` (`completedStageIds`/`outputs` inputs to `resume`) are already plain data too.

So once the scope-identity question above is answered, the actual serialize/deserialize plumbing is a small, mechanical, well-testable piece — not a blocker.

## Recommended approach (not yet a committed plan — needs a decision first)

1. **Resolve the scope-identity question first**, ideally with the user's input rather than guessing: does `TurnScope.saveId` need to become the real save file identity (a breaking-ish change touching `VariableStore`, `liveBridge.ts`'s catalog scope, and the effect journal's own scope comparisons), or is a *separate*, new "durable session id" the right minimal addition (threaded alongside the existing ephemeral scope, touching less)? This determines almost everything else about the shape of the fix, and it affects H7's effect journal too — the two problems are the same problem, so it may be worth explicitly deciding to fix both at once rather than staged-workflow-only.
2. Once that's settled: add `VariableStore.serialize()`/deserialization, persist `{ plan, store: serializedStore, completedStageIds, outputs, sessionId }` to a durable per-profile file (mirroring `effect-journal.rpgraph.json`'s plain-JSON, no-encryption approach) whenever a staged turn reaches `run-failed` and the user hasn't yet resolved it (dismissed or succeeded).
3. On next launch (or on next attempt to open the same save/session), check for a persisted interrupted turn matching the current session id; if found, offer to resume it via the existing `stagedRetryPrompt` UI (already built, just needs a session-restart-triggered entry point instead of only an in-run one) — reusing `runLiveStagedTurn({ ...stagedTurnBase, resume })` exactly as today's in-memory manual retry does, once `llm`/`actionBridge` are freshly available from the newly-started app.
4. Clear the persisted file once the turn resolves (success, or the user explicitly dismisses/abandons it) — same lifecycle the effect journal already has via `clearEffectJournalForScope`.

## Explicitly out of scope for this investigation

- **Action-preserving regeneration of narrative content** (the other named S8 remainder) — a different problem (letting a user regenerate just the narration text of an already-committed turn without re-sending real effects like messages/images), not addressed here.
- **Branch semantics** — RP save branching interacts with this the moment "the same session" is defined durably; deliberately deferred until the scope-identity question above is resolved, since the answer shapes what "branch" even means for a persisted retry.
- Actually implementing any of the above — this document is scoping only.

## Things to double-check before trusting this doc blindly

- Whether `TurnScope.saveId`/`branchId` being ephemeral is *known and intentional* elsewhere (e.g., does anything rely on every run getting a fresh, unique scope for isolation reasons that a stable session id would break?) — read `contracts.ts`'s `TurnScope` usage and `VariableStore`'s own scope-mismatch checks fully before assuming a stable id is a safe drop-in.
- Whether `src/data-management/types.ts`'s `RpgraphSessionV2` (or whatever currently represents "the open RP save") already has a stable identifier suitable for reuse, or whether one needs to be introduced.
- Whether the effect journal's own `scope` field should be fixed in the same change (recommended above) or genuinely deserves separate sequencing — check with the user, since it doubles the blast radius of the first PR.
- Whether `VariableStore`'s `maxRecords`/`maxCharacters` constructor arguments (currently always the class defaults, per every call site found) need to round-trip through serialization or can just be re-supplied as defaults on rehydration.

## Next slice: actually offering resume after a restart

Not started. The persisted record (`electron/ipc/stagedRecovery.cjs`'s file, one entry per `sessionFileName`) is written and cleared correctly, but nothing reads it to show the user anything. To close this out:

1. On loading an RP save (wherever `activeSessionFileName`/`setActiveSessionFileName` gets set in `App.tsx` — find that exact call site first), check `readStagedRecovery(sessionFileName)`. If it returns non-null, there's an interrupted turn for the conversation just opened.
2. Surface it via the existing `stagedRetryPrompt` UI (`StagedRetryPrompt` type, the `graph-staged-retry-banner` component already rendered in two places in `App.tsx`) — it already has the right shape (`error`, `onRetry`, `onDismiss`), so reuse it rather than building new UI.
3. `onRetry` needs to call `runLiveStagedTurn({ ..., resume: restoredRetryState })` with a *freshly built* `llm`/`actionBridge`/`signal` (the ones from the crashed run are gone) but no new user input — this cannot reuse `runGraph`'s normal call shape, which is built around processing one. The staged block's tail (both retry `while` loops through to the final commit) needs extracting into a function callable from both the normal input-driven path and this new restart-triggered path. Do this extraction carefully — `runGraph` is already large and this session's other work already grew it further (instructions/limits/allowed-recipes/plan-debug/recovery-write all landed in the same block); consider whether this is also a good moment to extract the whole `if (useStagedActions)` block into its own module now that it does this much, rather than deferring that cleanup again.
4. `onDismiss` should call `clearStagedRecovery(sessionFileName)`.
5. Decide UX for *when* this check runs relative to session load — on every app launch (check whatever session auto-restores), or only when the user explicitly opens the specific save file that had the interrupted turn? The doc's investigation didn't resolve this; it's a real product decision, not just an implementation detail.

## Verification note (independent check, this session)

A separate session ran the full verification ledger over everything currently in the working tree (S9's four slices, S8's first two slices, and everything from earlier the same day) before handing off further: **465 vitest tests pass** (`72` files), `tsc -b --pretty false` clean, ESLint clean on every touched non-test file (the only findings were the three already-documented pre-existing issues in `App.tsx`/`useRoleplayPanelRuntime.ts`, confirmed via `git stash` in earlier sessions to predate this branch entirely), `npm run build` clean, and **26/26 action-related Electron regressions pass together, twice in a row** (the full family battery plus `stagedInstructions`, `stagedLimits`, `stagedPlanDebug`, `stagedRecipeAllowList`, `stagedRetry` ×2) with the one `unslothProvider.spec.ts` case requiring a live local Unsloth server correctly skipped, not failed. Nothing in the working tree is currently broken — the next session can build directly on this without re-verifying prior work first.

## Suggested opening request for the new session

> Read `docs/handoff/2026-09-12-s8-restart-reconciliation-scoping.md` in full — the groundwork (durable persistence of an interrupted staged turn's retry state, keyed by RP save file name) is already built and merged. Implement this doc's "Next slice" section: actually offering a resume prompt when the user reopens a save that had an interrupted staged turn. Read the "Things to double-check" list first, and verify per this branch's established ledger (scoped `vitest run src/staged-workflow`, `tsc -b`, ESLint on touched files, `npm run build`, and only the directly-relevant Electron regressions — not the full battery, per the project's testing-economy policy).
