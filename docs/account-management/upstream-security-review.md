# Experimental account port: scoped security review

> This is experimental, it is strongly advised to create backups of the applications appdata folder before first run.

## Scope and threat boundary

This review covers the account port onto upstream v0.6.3 (`ede74db`), not every upstream feature or a forensic privacy certification. Assets are app-managed private content, settings/credentials, account keys, migration sources and archives. Trust boundaries are renderer-to-main IPC, account/session transitions, imported configuration, native file-picker inputs, vault records and archive extraction. Local profiles protect stored data from other logged-out users; malware/admin access, unlocked renderers, external services, memory/swap and outside copies are out of scope.

## Reviewed controls

- Account startup stays locked, with only public account summaries available before authentication. No automatic legacy import or private workspace restoration.
- The main process owns keys, password derivation, encrypted records and private catalogs. Virtual filesystem capabilities do not create plaintext mirrors. Native settings/credential wrappers remain legacy readers, not active vault protection.
- IPC is sender/frame/session validated and private by default, including new upstream provider channels. Session epochs revoke stale work. Imported settings, preferences and pending model state have separate offline fallbacks; imported fallback records cannot override refusal.
- Account-scoped NPC discovery includes upstream's saved-storybook scan; user-library paths use the vault adapter instead of native filesystem reads. Frontend persistence consumers use account-scoped preferences.
- Native remaining filesystem writes are encrypted-vault publication and public window bounds. Generated image/voice payloads remain in memory until app-managed saves. Downloads and arbitrary new windows are denied; explicit imports use approved paths rather than renderer-selected native output destinations.
- Migration writes are verified before account publication. Optional cleanup binds exact allowlisted imported paths to source identity and digest, requires independent checked confirmation and preserves changed, encrypted, linked and unrelated originals. Browser preference cleanup compares original values before removing them. Source inventory is host-only.
- Archives authenticate manifest/chunks, bound paths/sizes/counts, reject unsafe ZIP entries and do not overwrite destinations. Protection transitions keep durable recovery state and do not claim protection while plaintext-key generations need cleanup.

## Port finding and repair

**UP-01 — High: imported-provider refusal bypass through Comfy workflow repair.** The initial account integration exempted `comfy:repair-workflow` as if it were purely local, but upstream's handler calls an LLM. Independent source review identified the outbound path. The exemption was removed: repair requires imported-provider approval, while local workflow select/inspect/apply and cancellation remain available. A private-channel authorization regression verifies refusal before callback execution. This finding is resolved in the port, not deferred.

## Residual limitations and release checks

- Comfy/server jobs may continue after local account lock or request cancellation. Provider-side output, uploaded inputs and caches are outside the vault; aborting polling is not server-side secure deletion. Aborted voice jobs may leave provider-side artifacts.
- Legacy sources, encrypted originals, browser caches, backups and copies elsewhere are not retroactively secured. Cleanup is ordinary permanent deletion, not secure erasure. Path-based unlink cannot eliminate races with a hostile local process.
- Public account aliases/IDs and file sizes/times remain visible. Shared `default/default` and passwordless accounts are intentionally not confidential. Strong passwords and external backups are necessary; password reset is not available.
- Repeat installed packaging/resource/decryption-tool checks on all supported platforms. Exercise real power loss, suspend/lock, interruption recovery and Chromium cache/crash paths with synthetic canaries. Current tests do not establish full-disk forensic privacy or performance at maximum archive size.

## Verification for this branch

Windows source checkout, Node 24/Electron 44. All profiles and private canaries used in tests were synthetic temporary data, never the user's AppData. Observed failing regressions before repair covered account-isolated NPC reads, provider-consent authorization and frontend account save/recovery behavior. Independent review found no remaining blocking issue after UP-01's repair.

```text
npm run build
node node_modules/vitest/vitest.mjs run --config dev/config/vitest.config.mts electron/accounts electron/accountLibraryStorage.test.ts electron/turnAutosave.test.ts src/accounts src/app/useRpgraphFiles.test.ts --reporter=dot
npm run test:e2e -- dev/test/e2e/accounts.spec.ts
npm run lint
npm run check:unused
node --check electron/main.cjs
git diff --check
```

Results: **15 focused files / 130 tests passed**, and **4 real Electron account flows passed**. Desktop flows cover empty-folder discovery/refresh after cleanup, reviewed deletion and retained changed preferences/encrypted originals, locked startup and cross-account isolation, encrypted export/import, and imported-provider refusal. Build/typecheck and unused-code analysis passed. Lint has zero errors and one existing upstream `NpcLibraryDialog.tsx` hook warning. Main syntax checks passed; archive tests include the standalone stdin-password decryption tool. The unchanged upstream styling and provider layouts were reviewed in the diff; no customized fork resources or user data are included.

This is not a full-application or packaged-distribution test claim. Installed packaging and Linux/macOS/platform power-loss checks above remain release work. Historical fork test counts and packaging runs are not evidence for this branch.
