# Local-account post-implementation security review

Date: 2026-09-30. Scope: the local-account implementation in this working tree, not an assessment of all historical repository content or a security certification.

## Outcome

The account boundary is implemented and has targeted regression and real Windows Electron coverage. An independent runtime reviewer identified asynchronous isolation and provider-consent defects; those were repaired and rechecked. The primary engineer additionally repaired an interrupted protection-upgrade confidentiality claim. Platform release gates below remain open. Do not describe source tests as packaged cross-platform approval.

The original [pre-implementation audit](pgraph_chatui_v3-threat-model.md) is a historical baseline; its line references and descriptions of missing controls deliberately describe the pre-account architecture.

## Findings and disposition

| ID | Severity | Finding and repair | Evidence |
| --- | --- | --- | --- |
| AC-01 | High | Global late file-dialog approvals and request identifiers could outlive a login. Capabilities, caches and request maps now belong to a session; all access asserts its lease. Controllers, including requests without IDs, abort on lock. | `electron/main.cjs:311`, `:2247`; account session/IPC tests. |
| AC-02 | High | Closing windows or an unsuccessful transition could leave account authority alive. Last-window closure clears the view and locks; switching destroys prior renderers/popouts and uses fresh nonpersistent sessions. | `electron/main.cjs:6309`, `:6364`, `:6460`; real Electron account-switch test. macOS event flow is source-reviewed only. |
| AC-03 | High | Refusing imported providers still exposed imported preferences/pending Comfy state. Offline settings, preferences and model state are separate; pending imported model cleanup is disabled. | `electron/main.cjs:370`, `:3272`, `:6306`; real Electron offline-refusal test. |
| AC-04 | High | An archive could forge the separate offline fallback records. Every consent-reviewed import strips reserved fallback paths, including case variants and descendants, before publication. | `electron/accounts/accountManager.cjs:224`; migration test observed failing before repair and passing afterward; adversarial Electron fixture. |
| AC-05 | High | Adding a password could report protection after old publicly keyed generation cleanup failed. A durable `pendingCleanup` journal now blocks unlock and the protection claim until authenticated recovery completes deletion. | `electron/accounts/accountManager.cjs:38`, `:80`, `:350`; manager regression observed red before repair, then all 11 manager tests passed. |

## Boundary checks

- Private IPC is default-deny while locked. Main validates sender/frame/origin and holds session context; callbacks recheck both returned results and errors. Account lifecycle exceptions return only public summaries.
- App-managed files, settings, preferences, credentials and libraries route through encrypted object/catalog storage. Protected accounts have a randomly generated key wrapped by the password; open/default accounts make no private-confidentiality promise. No plaintext storage fallback is permitted.
- Login renders public bundled artwork without importing the workspace. Legacy migration reads recognized original data only after explicit consent. Optional source cleanup runs only after verified import, with an inventory and separate checked deletion consent. Host-only receipts bind deletion to original bytes and file identity; links, changed sources, encrypted originals and unrelated files are preserved. Browser preferences are removed only if unchanged. Autosave restoration remains a separate decision after login.
- Archives authenticate bounded manifests/chunks, use no generic filesystem extraction, preserve source files and publish a new account only after verification. Offline decryption is deliberate, separate and refuses overwrite.
- Selected native input files remain input capabilities, not authorization to write private content outside the vault. Native browser downloads are blocked. Provider-side outputs, external originals, operating-system memory/swap and malicious administrator access remain outside the stated boundary.

## Verification

Environment: Windows x64, Node 24.19.0, Electron 44.4.5. Tests use synthetic temporary profiles, not the user's real data directory.

Commands:

```text
node node_modules/vitest/vitest.mjs run --config config/vitest.config.mts electron/accounts electron/accountLibraryStorage.test.ts electron/turnAutosave.test.ts src/accounts src/app/useRpgraphFiles.test.ts src/app/useRoleplayPanelRuntime.test.ts src/app/themeCoverage.test.ts
node node_modules/@playwright/test/cli.js test --config config/playwright.config.ts test/e2e/accounts.spec.ts
npm run build
git diff --check
```

Final rerun: **16 files / 174 tests passed**, and **2 real Electron flows passed** (including the adversarial fallback extension). Production typecheck/build passed, with the existing large-chunk warning. Targeted lint of main/accounts/decryption/Electron tests has no errors or warnings; lint of all touched frontend surfaces has four existing React hook warnings. `git diff --check` and `node --check electron/main.cjs` passed. This is not a full-application test claim.

The independent runtime reviewer rechecked AC-04's import repair and reported no remaining merge-blocking issue identified in that source recheck. This is a scoped source review, not an independent rerun of the primary engineer's tests or approval of the outstanding platform gates.

Windows packaging also passed:

```text
node node_modules/electron-builder/out/cli/cli.js --dir --win --config config/electron-builder.yml
node release/win-unpacked/resources/account-tools/scripts/decrypt-account.mjs --help
```

Both Electron tests were rerun against `release/win-unpacked/RPgraph Studio.exe` using `RPGRAPH_E2E_EXECUTABLE`; **2 passed**. Bundled tool dependencies, format documents, guide and license are present. This checks an unpacked Windows package, not an installer or every bundled-resource feature. The packager reports a default Electron Windows icon, an existing distribution configuration gap unrelated to account isolation.

## Required upstream release checks

### Optional legacy cleanup follow-up

The cleanup addition was reviewed for consent bypass, source replacement, overbroad deletion and disclosure in the preview. It adds no renderer path capability or new IPC channel. Receipts stay host-only and contain file identity/digests rather than contents. Individual deletes recheck root/ancestors, file identity and source bytes; browser deletion compares the imported snapshot against current values. Cancellation, unchecked confirmation and a lost migration owner preserve originals. Existing encrypted envelopes (including unknown future versions) are retained.

Focused follow-up verification: **23 tests** across cleanup, migration and manager passed; **3 real Electron flows** passed against the current development build. The new flow covers native review/checked confirmation, private values absent from the preview, changed browser preferences retained, original folder offered, and imported copies still readable after deleting eligible originals. Build, targeted lint and main syntax checks passed. All data was synthetic. The new cleanup feature has not been rerun in a packaged distribution; the earlier two packaged tests above predate this addition.

This is ordinary permanent deletion, not forensic secure erasure. JavaScript path-based unlink cannot eliminate races against a hostile local process; malware/admin access remains outside the account threat model. External copies, encrypted originals, caches and unrelated files remain deliberately untouched.

The subsequent stale-discovery regression was observed failing twice: first the host counted empty legacy folders as data, then the corrected host status was not refreshed by the login screen. Discovery now uses only filesystem metadata and the migration allowlist, ignores empty nested folders and does not follow directory links. The login refreshes status after successful migration/cleanup. Retained real files still trigger discovery; account vault records do not. **13 focused migration/cleanup tests and 4 Electron flows passed**, including immediate notice removal and renderer reload with empty folders retained. Build, targeted lint, syntax and diff checks passed; no real user data was deleted.

### Release checklist

1. Repeat package/tool/resource checks on all supported platforms and installed distributions. Windows unpacked package entry, isolation and provider-refusal flows passed; custom-resource features and other platforms remain unchecked.
2. Exercise macOS/Linux lock/suspend, auxiliary windows, shutdown failure and restart recovery. Test actual power loss on Windows; directory fsync is unavailable there.
3. Scan Chromium cache/crash files, temporary paths and application logs using synthetic canaries after save/lock/restart/export. The current canary checks cover vault/archive bytes, not a comprehensive forensic disk scan.
4. Measure password derivation and large-file/archive memory use on minimum supported hardware. Current limits are 64 MiB per record, 8 GiB expanded archive/migration, 100,000 entries, 12 GiB ZIP input.
5. Review the upstream diff and all shipped fixtures. This task did not push data, create a PR or prove that historical private content was never committed. Existing fork changes require separate attribution before publication.

Residual risks and user-facing limitations are in [user-guide.md](user-guide.md). Strong passwords and verified backups remain necessary; the public `default/default` account is intentionally not private.
