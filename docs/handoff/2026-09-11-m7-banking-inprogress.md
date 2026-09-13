# RPGraph Continuation Handoff — 2026-09-11 (M7 banking) — RESOLVED 2026-09-12

## Status: Done

Both bank.transfer paths (model-authored and direct-UI) are now implemented, tested, and green. Full verification ledger passed:
- `vitest run`: 398/398 tests passing.
- `tsc -b --pretty false`: clean.
- ESLint on touched files: clean.
- `npm run build`: clean.
- Electron regressions: all 12 pass — `bankTransfer.spec.ts` (2), `socialActions.spec.ts` (2), `voiceMessage.spec.ts` (2), `stagedWorkflow.spec.ts` (2, including the H7 "not cleared on failure" test), `structuredActions.spec.ts` (2), `actionBaseline.spec.ts` (2).

Nothing has been committed to git yet, per the existing project convention — all changes are in the working tree.

## Root causes found and fixed

Two independent bugs, both in the direct-UI fast path added this session (`src/app/useGraphRun.ts`), on top of the already-working model-authored path:

1. **`structuredActionContext` computed unconditionally** (fixed earlier this session, confirmed still in place): `executeGraph` defaults `legacyActionsDisabled = !!structuredActionContext`, so a non-empty context silently disabled the direct-actions/legacy handling a direct-user action depends on. Fix: `const structuredActionContext = directActionOnly ? undefined : actionBridge?.promptContext();` (~[useGraphRun.ts:1677](../../src/app/useGraphRun.ts:1677)).

2. **Test graph missing the `direct-actions` edge** (found and fixed this session): the direct-UI Banking submission reads `executedOutput` via `outputSourceHandle: 'direct-actions'`, which requires an edge from the input node's `direct-actions` source handle into the output node's `direct-actions` target handle (see `workflows/default-actions-v1.json` for the production wiring). The second test in `test/e2e/bankTransfer.spec.ts` had `edges: []`, so `executedOutput` was always empty and `appliedActions.bankTransfers` was always `[]` — nothing to do with `actionBridge.execute()` itself, which was never even being reached. Confirmed via temporary debug logging (`useDirectStructuredAction: true, hasActionBridge: true, count: 0`), then fixed by adding the missing edge to the test.

3. **Effect journal not cleared on the direct-UI commit path** (found while re-verifying after fix #2, not previously identified): once the transfer started actually executing and committing, `readEffectJournal()` after a successful direct-UI transfer returned the recorded entry instead of `[]`. The other two commit paths (`useStagedActions` and the model-authored `actionBridge && !directActionOnly` block) each call `clearEffectJournalForScope(actionScope)` after a successful commit; the general/fallback commit path at the end of `runGraph` (used by `useDirectStructuredAction`, since it doesn't early-return) was missing the equivalent call. Fixed by adding `if (actionBridge) void clearEffectJournalForScope(actionScope).catch(() => {});` right after the final `commitCollectedTurn` succeeds (~[useGraphRun.ts:2935](../../src/app/useGraphRun.ts:2935)). Verified this doesn't regress the "journal is NOT cleared on failure" guarantee — `stagedWorkflow.spec.ts`'s dedicated test for that still passes.

All temporary debug `console.log`/`page.on('console', ...)` instrumentation added during this session's debugging was removed before finishing; no scratch spec files were left behind.

## Architecture direction (confirmed correct, no changes needed)

`bank.transfer` remains a normal, model-authorable canonical action alongside `messenger.send`/`social.post`/`social.comment`, exactly like the corrected direction from the prior session states. No `ActionInitiator`/model-vs-direct-user gating exists anywhere in the code — both the model-authored and direct-UI paths go through the same compiler/executor (`compileActionReply` → `prepareActionExecution` → `executionRegistry`), differing only in how the intent envelope gets built (parsed from a model reply vs. assembled directly from the UI's `{from, to, amount, note}` submission).

## Workspace

Working directory: `C:\Users\hen\Documents\Claude\RPGraph_sloppified`. Branch: `codex/code-quality-cleanup`. Nothing committed. Bundled Node 24 required for all commands (shell default is older) — see prior handoff sections for exact invocation strings if needed again.
