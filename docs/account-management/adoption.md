# Upstream adoption notes

## Architectural decision

Use local main-process-owned accounts, not online identities. One login unlocks a random account data key; existing authenticated-encryption conventions are reused rather than asking users to encrypt each file. Store records and private metadata inside the vault. Preserve legacy readers for compatibility, but do not silently migrate or load global data.

The reserved starter account is `default/default`. Optional-password accounts use the same storage codec, but only personal password-protected accounts provide confidentiality. Public account names and filesystem sizes remain visible.

## Integration map

| Surface | Owner/change |
| --- | --- |
| Session authority, sender validation, native dialogs, provider cancellation | `electron/main.cjs`, `electron/accounts/accountIPC.cjs`, `accountSession.cjs` |
| Key envelopes, object/catalog storage, lifecycle and recovery | `accountCrypto.cjs`, `accountStore.cjs`, `accountManager.cjs`, `accountRecovery.cjs` |
| Existing file APIs and account-scoped paths | `accountFiles.cjs`, `accountRuntime.cjs` |
| Portable ZIPs and explicit old-data import | `accountArchive.cjs`, `accountMigration.cjs`, `scripts/decrypt-account.mjs` |
| Consent-first entry, account management and synchronous preference facade | `src/accounts`, `src/main.tsx`, `electron/preload.cjs` |
| Libraries, per-file saves, autosaves and persistent UI preferences | Existing NPC/theme/phone libraries, `useRpgraphFiles`, settings and preference consumers |
| Distribution | `config/electron-builder.yml`; pinned `yauzl`/`yazl` dependencies |

No plaintext mirror directory is created. Virtual account paths are internal capabilities, not user-accessible native files. Existing workflows needing paths outside the application must explicitly import inputs; account saves cannot fall back to external destinations. Comfy workflows use account-relative portable references. Provider settings from imported data require a fresh review; offline fallback files in imports are discarded, never trusted.

## Compatibility and rollout

- Existing global data stays untouched until the user chooses import. Recognized data is copied; original manually encrypted files may still need their original password.
- Protected exports require the RPGraph reader/decryption tool, not ordinary password-ZIP tools. Canonical decrypted exports can be reimported into either account mode.
- Browser-only mode remains explicitly nonpersistent; it is not an encrypted-account implementation.
- Legacy exports, backups and OS-protected credentials are not retroactively secured. Post-migration cleanup is optional, host-only and separately consented: preview exact imported paths/preference names, warn about account/password dependency, require checked confirmation, preserve changed/linked/encrypted/unrelated sources, and offer opening the source folder afterward. Never delete originals automatically or recursively.
- Protection upgrade/downgrade journals must remain readable. Do not drop recovery support or report pending transitions as protected.

Before opening a PR, separate pre-existing scrolling/startup/theming changes from account changes, review shipped fixtures against upstream, and run the release gates in [the post-audit](post-implementation-audit.md). Do not blanket-stage this dirty worktree or include real account files/test profiles. No automatic commit, push or PR publication is part of these changes.

Documentation: [plan](plan.md), [pre-audit](pgraph_chatui_v3-threat-model.md), [post-audit](post-implementation-audit.md), [crypto format](format-v1.md), [ZIP format](archive-v1.md), [login design/research](login-design.md), [user guide](user-guide.md).
