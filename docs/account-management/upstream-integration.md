# Experimental upstream account integration

> This is experimental, it is strongly advised to create backups of the applications appdata folder before first run.

This branch starts from upstream `unrefined803/RPGraph` commit `ede74db` (v0.6.3). It ports local accounts and encrypted storage without merging the customized fork. Upstream roleplay, initiative, phone, provider and graph features stay in place; unrelated fork themes, provider-layout redesigns and scrolling changes are excluded.

## Account behavior

- Startup presents account selection before loading private settings, content or provider configuration. `default` exists with the published password `default`; it is not private.
- Accounts may be password-protected or deliberately open. One login unlocks all app-managed account settings, workflows, storybooks, saves, images, preferences and NPC library content.
- Protected accounts wrap a random data key using scrypt and AES-256-GCM. Records and private metadata use authenticated encryption. Keys stay in the Electron main process; there is no plaintext mirror of the vault.
- Locking/switching destroys the old renderer, cancels active work and revokes storage capabilities. Unknown/inappropriate IPC requests are denied. Imported providers require a fresh decision; refusal uses separate offline defaults.
- Existing data is never silently imported. Explicit migration verifies stored file writes before publication. Workspace/autosave recovery remains a separate choice after login.
- Original-data cleanup defaults to keeping originals, offers a path/preference-name preview, warns about account/password dependency, and requires checked confirmation. Changed, encrypted, linked and unrelated sources remain. Completion reports skipped items and offers opening the source folder. This is not secure erasure.
- Export creates one RPGraph ZIP archive. Protected exports use the account password. The bundled decryption tool writes a separate canonical plaintext ZIP only on explicit request. Both protected and canonical plaintext exports can be imported into a new account; ordinary password-ZIP tools cannot decrypt the RPGraph format.

## Integration boundaries

The Electron storage adapter replaces app-managed filesystem calls with account storage while retaining explicit native file-picker inputs/exports. Preload exposes account operations without keys. The entrypoint loads the workspace only after login. Persistent frontend preferences use the account facade instead of global browser storage.

Only account-facing UI and minimal Account menu integration are added. Bundled demo resources remain upstream resources; no personal storybooks, workflows, saved accounts or credentials are part of this contribution. ZIP dependencies are pinned to `yauzl` 3.4.0 and `yazl` 3.3.1; existing upstream dependencies and packaging paths otherwise remain unchanged.

## Documentation and release checks

- [User guide](user-guide.md): login, migration, backup, recovery, deletion and limitations.
- [Vault format](format-v1.md): key derivation/envelopes, records, atomic publication and protection recovery.
- [Archive format](archive-v1.md): ZIP layout, encryption, bounds and plaintext interoperability.
- [Port security review](upstream-security-review.md): controls, verification and outstanding release checks.

Local encryption protects stored data and other logged-out profiles, not malware/admin access, an unlocked screen, OS memory/swap, external providers or outside copies. Aliases/IDs and filesystem sizes/times are public metadata. Open accounts and shared default are not confidential. There is no password reset; keep strong passphrases and backups.

Maintainers should test installed distributions on all supported platforms, interruption recovery and cache behavior with synthetic data before release. Verification results for this port are recorded in its security review, not inherited from the customized fork.
