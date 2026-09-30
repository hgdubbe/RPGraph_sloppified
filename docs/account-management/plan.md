# Local accounts and encrypted storage: implementation plan

Status: account runtime integration implemented; scoped post-implementation source review completed. Login, encrypted file/settings/library/preferences storage, IPC guards, ephemeral renderers, consent migration, provider-review gating and account archives are connected. 174 focused tests and two desktop flows against both source and unpacked Windows package have passed. See [user guide](user-guide.md), [adoption notes](adoption.md) and [post-implementation audit](post-implementation-audit.md) for actual verification and remaining platform release checks.

Reviewed 2026-09-27 against commit `1055a6fbf5b09001f328274cdc7c214177125302` plus the existing uncommitted startup-consent, autosave-encryption, theme, and scrolling changes. Evidence line numbers refer to that working tree, not necessarily upstream. This dated source inventory describes the pre-implementation baseline; current implementation evidence is recorded separately in the post-implementation audit.

Related: [security audit and threat model](pgraph_chatui_v3-threat-model.md), [login design](login-design.md).

## 1. Confirmed scope and product contract

These are local profiles on one computer, not online accounts, a remote authentication server, or OS user isolation. The user confirmed RPGraph-specific archive encryption and an RPGraph decryption tool are acceptable; compatibility with ordinary password-protected ZIP readers is not required.

1. Always start at the account screen. Do not mount the workspace, load private libraries, restore a workflow/storybook/RP session, or start provider jobs before an explicit account choice and, where applicable, successful password entry.
2. Creating an account offers an explicit **Protect with password** choice. Passwordless accounts require an explicit Enter action but are not confidential against other local users or disk inspection. Passworded accounts encrypt every app-managed user-content/settings record at rest, not only RP save files.
3. Password entry unlocks an account once per session. Saves, autosaves, settings, libraries, media, and full-account exports subsequently use its protection automatically. No per-file password prompts for normal account operations.
4. Login is not restore consent. After login, show the existing themed recovery choice before opening a prior workspace/autosave. Declining opens a blank workspace with public bundled defaults; private account settings may apply after login, but no prior story, graph, or RP content is selected automatically. Account libraries may be listed only after login.
5. Autosave enable/disable and recovery controls remain visible to every user, outside developer options. Protection is shown as an account status, not a conflicting autosave-encryption switch. Passworded account: “Encrypted with this account”; passwordless account: “Not encrypted — protect this account in Account settings.” Autosave being disabled must not hide these controls.
6. There is always a reserved `default` account with the requested password `default`. It is an ordinary, separate account with **publicly known credentials**, not an administrator, recovery key, or bypass for any other account. Preserve these fixed credentials as requested; clearly label this account “Shared default — not private.” Never import existing private data into it automatically. Other accounts can change/remove their passwords. The default account cannot be deleted or have its fixed credential changed; it can be explicitly cleared with a destructive-action confirmation.
7. Create, select, lock, switch, rename public alias, change/remove password, export, import, and delete an account are supported. Protected destructive/security operations require current-password reauthentication. Account deletion is local only, explicitly confirmed, and explains that exports and external copies remain. Passwordless deletion still requires confirmation. No fake “forgot password” recovery: a forgotten private password means loss of access unless the user has a usable backup.
8. Export produces one portable archive containing the complete account-owned dataset. Passworded accounts always export encrypted; no hidden plaintext fallback. Passwordless exports are explicitly labeled unencrypted. A separate deliberate decryption tool produces a canonical plaintext ZIP at the user's chosen destination.
9. No account runtime state, real user records, credentials, exports, private screenshots, or real-account test fixtures enter Git or an upstream PR. Synthetic fixtures only.

### Honest privacy boundary

An unlocked application necessarily has plaintext in memory and renders private content. Protection does not cover malware, an administrator/debugger, OS swap/hibernation/screenshots, a compromised unlocked renderer, or data already sent to model/image/voice providers. It cannot retroactively encrypt old exports, legacy files, external provider caches, or backups. These limits must be visible in account documentation, not buried in implementation comments.

A minimal public account index is necessary before login: random account ID, user-chosen public alias, whether a password is required, format/KDF identifiers, salts, and wrapped-key metadata. Warn that the alias is visible while locked; suggest a neutral alias. Do not expose story names, user avatars, thumbnails, provider names, custom themes, last-opened content, or private settings there. File count, size, and filesystem modification time are residual metadata leaks; hiding them with padding/ORAM is not part of this project.

## 2. Existing storage inventory and required ownership

The core issue is application-global persistence. A login overlay alone would leave private data available through IPC and startup side effects.

| Surface | Current evidence | Required treatment |
| --- | --- | --- |
| Settings, credentials, endpoints, prompts, paths | `electron/main.cjs:328`, `:370`, `:5827`; `src/settings.ts:1063`, `:1239` | Full account record encryption, including credential values. Existing OS safeStorage protection is not a portable account format and its plaintext fallback cannot apply to protected accounts. |
| Workflows, storybooks, RP saves, two-slot autosaves | `electron/main.cjs:432`, `:5461`, `:5496`, `:5864`, `:5896` | Account-scoped objects and encrypted catalog; apply account protection to every write and rotation. |
| Startup selection, last workflow, recovery metadata | `electron/main.cjs:424`, `:674`, `:5753` | Account-scoped and gated behind login plus recovery consent; no private last-opened labels on login. |
| Character and NPC libraries | `electron/main.cjs:436`, `:5541`, `:6065`, `:6294`; `electron/npcLibrary.cjs:15` | Split shipped public resources from private overrides; no eager private initialization. |
| Studio/phone themes and custom assets | `electron/main.cjs:243`, `:273`; `electron/themeLibrary.cjs:4`; `electron/phoneHomeThemeLibrary.cjs:9` | Bundled neutral login theme only before unlock. Encrypt custom themes and their media; do not let private theme loading run at process startup. |
| Browser preferences and drafts | `src/App.tsx:653`; `src/app/useNodePalette.ts:66`; `src/app/useRoleplayPanelRuntime.ts:220`; `src/chat/useAutoplay.ts:40`; `src/components/ChatConversationPanel.tsx:1807`; `src/components/ModelIdPicker.tsx:17` | Replace private localStorage persistence with account-backed preferences. Merely prefixing plaintext keys with account IDs is insufficient. |
| Chromium storage, cache, IndexedDB, service workers | `electron/main.cjs:6207` | Ephemeral renderer/session lifetime per unlock; prohibit persistent private browser storage and HTTP cache. Audit downloads/crash behavior separately. |
| Images, portraits, audio, attachments, reference media | `electron/main.cjs:5943`; `src/App.tsx:4904`, `:7022`; `src/graph/comfyImageRunner.ts:309` | Encrypt binary objects and embedded content. Account-owned asset references replace arbitrary persistent plaintext paths. |
| Selected-file capabilities, imports, exports | `electron/main.cjs:129`, `:293`, `:5593`, `:5685`, `:5812`, `:6036`, `:6124` | Revoke capabilities at lock/switch; session-bound access. Imported content is copied into account storage with consent; never silently modify/delete external originals. |
| Provider/ComfyUI configuration and generated content | `electron/main.cjs:3248`, `:3483`, `:3535`, `:5152` | Encrypt app-owned configuration/media copies. Provider input/output/temp directories are outside the vault; disclose them and do not promise their cleanup. Do not copy arbitrary provider installation trees into exports. |
| Diagnostics, traces, performance buffers, helper processes | `src/components/TurnTraceDialog.tsx:320`; `src/components/UiPerformanceDiagnostics.tsx:12`; `scripts/character-faces.mjs:12`; `electron/main.cjs:5535` | Sensitive traces in memory only by default, clear on lock; explicit sanitized diagnostic export. Audit subprocess stdin/temp/cache and browser-download bypasses. |
| Nonpersonal installation state | `electron/main.cjs:420` | Only documented allowlist outside accounts: window geometry, app version/migration format, bundled resources, minimal account index. No user content or provider settings. |

Before coding adapters, complete an executable persistence inventory: each read/write channel, localStorage key, file helper, download path, cache, worker, and provider callback must have an owner and a locked-state rule. Unknown stores block the “all account data” claim.

## 3. Architecture and session lifecycle

Extract small main-process modules rather than adding another large conditional layer to `main.cjs`:

- `AccountManager`: public account index, create/unlock/lock, password changes, single active session, deletion.
- `AccountStore`: typed record/binary access, encrypted index, transactions and durability. Supports encrypted and explicitly plaintext accounts through one API, never through a failure fallback.
- `accountCrypto`: versioned key wrapping and authenticated record encryption, extracted from the existing crypto implementation with compatibility tests.
- `accountArchive`: snapshot/export/import/decrypt, strict format validation and resource limits.
- Account-aware IPC adapters and a thin renderer account/session provider. Domain hooks must not implement crypto or select filesystem account roots.

These are boundaries, not a new framework, server, plugin system, or database rewrite. Module names can follow repository conventions at implementation time.

### State machine

`LOCKED -> UNLOCKING -> ACTIVE -> LOCKING -> LOCKED`

Creation/import use a separate unpublished staging transaction and return to account selection. Wrong password, corruption, or cancellation returns to LOCKED without mounting the workspace. Only one active profile per app process in this first version; a second app instance focuses the existing instance. Enforce a process/store lock for mutation and a clear stale-lock recovery policy.

Each ACTIVE session has main-owned `{accountId, epoch, keyMaterial, abortController, writeQueue, capabilities}`. No key or freely selectable account root crosses IPC. All privileged handlers validate sender frame/window, arguments, active session, and permitted operation. Only a small explicit public allowlist is callable while locked: public account summaries, unlock/create/import setup, bundled branding, and window controls. Account removal/export/password change are not public calls.

Every asynchronous operation captures account ID and epoch at start, including settings debounce, autosave, graph execution, streaming, media generation, dialogs, imports, file watchers, helper jobs, and provider callbacks. Recheck before writes and events. An operation started under A must never use “whichever account is current” at completion. IDs supplied by a renderer are validated within its session, never accepted as authorization.

### Lock and switch sequence

1. Immediately cover/unmount private UI and close private auxiliary windows; suppress notifications, previews, and taskbar content. Enter LOCKING, reject new work and revoke external file/media capabilities.
2. Cancel generation, streaming, timers, delayed autosaves, requests, dialogs and background helpers. Increment the session epoch so late callbacks cannot publish or write.
3. Only already-prepared transactions captured against A's immutable root/key may finish through an internal drain capability, without renderer events. All other stale operations are rejected. Do not release keys or activate B until this bounded drain completes or safely aborts. A timeout must not silently report unsaved work as saved. A normal user-requested switch can show a save/discard decision before locking; forced OS lock hides content immediately regardless. Test a stalled write under forced lock followed by an immediate switch.
4. Release keys and plaintext buffers best-effort, revoke blob/media URLs, clear diagnostics and in-memory stores, destroy the private renderer and its ephemeral Chromium session. Do not claim JavaScript can guarantee memory erasure.
5. Return to neutral account selection. B receives a fresh session/renderer and no state carried from A.

Default lock triggers: explicit Lock/Switch, OS session lock, suspend, and app restart. Provide an optional idle lock timer in visible account settings. No persisted “remember password,” keychain auto-unlock, or automatic login in this scope. Backend lock must still work if renderer teardown fails.

## 4. Encryption and storage format

### Reuse, with a separate versioned account envelope

Existing code already uses Node crypto scrypt and AES-256-GCM with random salts/nonces (`electron/main.cjs:1104`, `:1129`; `electron/encryptionFormat.cjs`). Reuse and extract those primitives and tested legacy readers; do not reuse a per-file password UX or the renderer-controlled `workspaceProtection` policy as authorization.

For a new protected account:

1. Generate a random 256-bit account data-encryption key (DEK).
2. Derive a key-encryption key (KEK) from the password and random per-wrapper salt; wrap the DEK with AES-256-GCM. Successful authenticated unwrap verifies the password; do not store a second reusable plaintext password or redundant fast password verifier.
3. Encrypt every content object, private catalog, setting, asset and recovery record with fresh nonces. Keep keys in main-process memory for that session only. Renderer passwords cross the dedicated unlock IPC once and are cleared from component state; never log them or pass them as CLI arguments.
4. Version the format, algorithm and bounded KDF profile. Prefer the currently documented scrypt profile `N=2^17, r=8, p=1`, with sufficient explicit memory ceiling (e.g. 256 MiB); benchmark target systems before locking the profile. A reviewed `N=2^16, r=8, p=2` profile is an alternative, not an automatic downgrade. Existing `N=2^16, r=8, p=1` files retain their exact legacy decoder.
5. KDF settings are an allowlist of supported profiles, not arbitrary attacker-selected work factors. Serialize unlock attempts; rate-limit retry UI/IPC to protect availability, while explaining that offline password guessing cannot be prevented by UI limits.

Use a cryptographically random salt (at least 16 bytes), 12-byte GCM nonce, and full authentication tag per existing primitive conventions. Canonical AAD binds format version, account ID, object ID, object type and record revision. Validate headers before allocating/decrypting; authenticate before parsing content. Keep titles, original filenames, character names, turn counts and private timestamps inside the encrypted catalog. Disk filenames are opaque random IDs, not user titles. Define the byte-level serialization and canonical AAD in a versioned format specification with golden vectors before implementation.

Envelope encryption and authenticated encryption follow [OWASP cryptographic storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html); KDF selection should be verified against [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) during implementation. These sources inform the primitives, not a claim that this application is certified secure.

### Writes, autosaves and recovery

Store under the existing OS application-data root in `accounts/<random-id>/`, never in the repository. Write immutable encrypted objects first; atomically replace the encrypted catalog/root only once all required objects are durable. Maintain a previous valid catalog for crash recovery. The same commit abstraction covers autosave rotation and password/protection transitions; the existing temp-file rename helper is a starting point, not proof of multi-file crash safety.

Temporary/staging files for protected accounts contain ciphertext only. Use exclusive creation and restrictive OS permissions where supported, reject symlink/reparse escapes, verify actual account root containment, and handle disk-full, rename failure and interrupted commits without overwriting the last usable state. Garbage-collect unreferenced ciphertext after successful publication, not before. No “write plaintext now, encrypt later.”

Large media should use bounded-memory authenticated chunks with a versioned manifest binding chunk order, length and IDs; never release unauthenticated bytes to image/audio decoders. Use account/session-bound media handles, not persistent plaintext files or unconstrained file URLs. Select chunk sizing through a realistic large-media test, not speculative micro-optimization.

Changing a password requires current-password authentication and atomically rewraps the DEK. Old exports remain protected by their old password. A copied old wrapper plus its old password can still recover the unchanged DEK: password change is not historical compromise recovery. Document this explicitly; complete DEK rotation is a separate operation if later required.

Adding or removing a password uses a transactional full-store conversion into a new generation, verifies it, then publishes it. Enabling protection must generate a fresh DEK and re-encrypt every record; never reuse key material from a passwordless generation. Test that any old unprotected-generation key cannot decrypt newly protected records. Do not leave plaintext generations behind after reporting successful encryption. If legacy plaintext cleanup fails, report incomplete protection and preserve recoverability; never claim filesystem deletion securely erases SSDs/backups. Password removal is an explicit confirmed downgrade, not an autosave toggle.

## 5. Export, import and decryption tool

### Account archive v1

One file, proposed suffix `.rpgraph-account.zip`: a normal ZIP container holding a tiny public format header and either an encrypted payload or a canonical plaintext payload. A protected archive is **not standard ZIP password encryption**; ordinary unzip only exposes ciphertext and public version/KDF fields. Public header contains no private alias or content manifest. The file picker can suggest a neutral name rather than the account's alias.

The logical payload includes a versioned manifest, settings/portable credentials, workflow/storybook/RP libraries and relationships, characters/NPC overrides, all app-owned images/audio/reference assets, themes/assets, preferences, last-session/recovery records, and autosave slots. Include account-local IDs and checksums under authentication, not host-specific absolute paths or OS safeStorage ciphertext. Explicitly distinguish a referenced external file from an owned asset. Offer copy/relink during migration; fail an “all owned data” export if an owned asset is missing. External installations, model weights, provider caches and external originals are not account-owned data.

Export takes a consistent catalog snapshot (short write-queue barrier, immutable object references) so files cannot change underneath it. Protected export always uses an authenticated archive-specific encryption domain/key derived from the unlocked DEK, with fresh nonces and the password-wrapped DEK needed by the tool. Authenticate header semantics and the complete inner manifest. This avoids requesting the account password again while unlocked. Specify domain separation and its test vectors; do not improvise a bespoke cipher. Never reuse record nonces or assume ZIP CRC provides integrity.

Avoid plaintext archive staging. Stream/chunk encrypted payloads, enforce backpressure, and publish the final destination atomically. Cancel/failure leaves no complete-looking export and cleans only validated task-owned partial output. Encrypted exports necessarily permit offline password attacks; recommend a strong password. Include API keys because the requirement is complete account portability, with a warning that decrypted exports include credentials. A sanitized content export, if retained, must be separately named and never masquerade as a complete account export.

### Import

Available from the login screen without unlocking an existing account. Detect encrypted versus canonical plaintext format and explain the difference. Encrypted input requests the archive password once. Plaintext input lets the user create a passworded destination before data is committed; default is to recommend protection, not silently import into the shared default.

Parse and validate in quarantine. Reject absolute/drive/UNC paths, traversal, NULs, alternate data streams, reserved device names, duplicate normalized or case-colliding entries, links/reparse points, unexpected entries, invalid schemas, unsupported versions, excessive KDF profiles and inconsistent asset references. Account archives are data, not executable scripts. No generic extract-to-directory helper on untrusted paths.

Set named, tested limits for archive bytes, expanded bytes, entry count, per-entry size, compression ratio, JSON depth and parsing time. Choose initial numeric limits from measured supported large-account fixtures in the archive phase and document them; no unbounded default or hidden unlimited override. Nested archives are not recursively extracted. The ZIP library and its support for size limits/streaming must pass dependency review.

Verify authentication and every required entry before publishing the new account. For protected imports, staging is encrypted with the destination key; bounded decrypted chunks live in memory only. Do not make partially verified records available. Use new local account IDs and a new DEK; decrypt/re-encrypt objects because AAD/ownership changes. Keep internal content references consistently mapped. Never overwrite an existing account on an ID/alias collision; default import creates a separate profile. Cancellation rolls back only the unpublished imported profile.

Imported provider paths/endpoints and executable/helper configuration remain inert until the user reviews them; import/login alone must not trigger a provider request, install, command, or model load. A valid account archive is not authority to execute code or read arbitrary paths on the new machine.

### Offline decryption tool

Ship a documented RPGraph decrypt command/tool using the same parser and crypto module, with no dependency on a running unlocked app. Prompt for a password without echo or accept a dedicated stdin channel for automation; never passwords in argv, logs or filenames. Output the canonical plaintext account ZIP to an explicitly chosen path, warn about full content/credentials, do not overwrite silently, and preserve the encrypted source. The plaintext ZIP must round-trip through the ordinary account importer. Tool releases and format docs accompany the application so exports remain usable independently.

## 6. Existing-data migration and compatibility

First startup displays “Existing local data found” without titles/thumbnails. Do not scan/decrypt private content for previews before the user's migration decision. Choices: import into a new account, defer, or continue using the shared default without importing. Destination and protection are explicit; no automatic association with `default`.

Migration inventories all listed legacy stores after consent, including browser preferences, existing safeStorage credentials, private libraries/themes/assets and autosaves. Existing manually encrypted files may require their own legacy passwords once during migration/import. This unavoidable compatibility step must not return as a prompt on each new save.

Read old stores without mutating originals; stage the new account, verify counts/reference integrity and decryptability using synthetic/structural validation, then publish. Write a non-content migration journal for resumability. Show which legacy locations/copies still exist and offer separately confirmed cleanup only after a verified backup or successful migration. Never silently delete originals or claim that migration removed external/cloud/provider copies. An ignored migration remains available from Account settings.

Retain old workflow/storybook/RP/character format readers. Replace normal manual encrypt/decrypt actions with account protection and full-account export. Audit every generic write/download handler: protected account data must not leak via old “save JSON” actions. If compatibility sharing is required, expose a clearly separate, explicit “Export unencrypted copy” confirmation with reauthentication; it must not be the ordinary Save path. Update `FileFormatsGuide`, assistant instructions and help text to match actual supported workflows.

Browser-only mode cannot impersonate desktop encryption/account persistence through the current stub. Keep it a clearly labeled nonpersistent demo unless a separately reviewed browser vault is implemented. No marketing claim of protected local accounts in that mode.

## 7. Implementation order and verification

| Phase | Work and owner role | Focused acceptance gate |
| --- | --- | --- |
| 0 — preflight | Primary engineer + independent security reviewer: agree this threat model, enumerate channels/stores, confirm clean integration baseline and upstream differences | Every persistence surface classified; baseline failures recorded; no private fixtures. Completed source review is input, not an implementation pass. |
| 1 — vault foundation | Crypto/storage engineer: extract tested legacy primitives, account wrapper/objects, transaction store, account lifecycle | Golden/legacy vectors, wrong password/tamper/swapped AAD, KDF bounds, interruption/disk-full tests; default cannot unlock another account. |
| 2 — storage adapters | Persistence engineer: route all settings/libraries/media/preferences/autosave/private themes through AccountStore | Synthetic plaintext canary absent in protected app-managed files/temp/cache; passwordless path deliberately tested; no old direct-write fallback. |
| 3 — authorization and lifecycle | Primary engineer: default-deny IPC, sender checks, epoch/cancellation, ephemeral renderer/media, OS lock | Invoke every private handler while locked; A-to-B stale-write/read/event tests; old windows and URLs fail; forced lock hides content immediately. |
| 4 — migration and archives | Persistence engineer + security reviewer: consent migration, complete snapshot, strict importer/decrypt tool, password transitions | Full roundtrip including credentials/custom assets; malicious archive corpus; collision/cancel/crash/cleanup tests; legacy originals untouched unless expressly removed. |
| 5 — account UX | UI engineer: approved split screen, account management, recovery consent, visible autosave status, remove per-file UX | Keyboard/paste/password-manager flow, themes/contrast, small-screen layout, no private flash, startup decline opens blank, no fake privacy claims. |
| 6 — independent post-implementation audit | Reviewer who did not own the reviewed module, plus primary engineer for fixes | Audit the final diff and packaged Electron flows; map every threat to code/tests; no unresolved high-risk privacy or account-isolation issue. |
| 7 — upstream handoff | Primary engineer: docs, migration/format/tool guide, synthetic fixtures, release notes | PR diff contains no account data, secrets, local paths or generated private artifacts; focused tests and milestone build recorded honestly. |

Agents should own disjoint modules where possible, not independently edit the large main process file. Integrate at the boundary phases, then request independent review. Do not implement a cosmetic login over unsecured storage as a shippable intermediate release; keep incomplete account mode nonpublic until gates 1–6 pass.

### Required security regression matrix

- Locked list/read/write/export/decrypt/settings/provider/media calls fail before private access. Invalid sender frames and forged account IDs fail.
- A unlock → stream/debounce/autosave → lock → B unlock cannot write, emit, restore or display A's content in B, even with a stalled callback/dialog.
- Two synthetic accounts share identical object names without cross-access. Default credentials and a passwordless account do not grant protected-account access.
- Wrong passwords, changed ciphertext/tags/header/AAD, swapped records, truncated chunks, invalid KDF work factors and unknown versions fail closed without plaintext writes.
- Every inventory row appears in encrypted export/decrypt/import roundtrips; consistency survives concurrent autosave and generation.
- Archive traversal, collisions, symlinks, ZIP bombs, oversized manifests, unexpected executables and imported absolute references are rejected safely.
- Crash/disk full at each catalog commit, key rewrap, password addition/removal, migration and import boundary preserves a usable prior state or reports incomplete operation.
- Synthetic distinctive text/media is absent from protected storage, browser persistence, temp paths and app logs after save, lock, restart and export. Test expected memory behavior separately; no claim of forensic RAM erasure.
- Packaged desktop startup/lock/switch/recovery tested on supported operating systems, including OS lock/suspend, auxiliary windows, download handlers, custom themes and external provider paths. Browser stub tests are not proof of Electron isolation.

Run changed-module/direct-dependency tests during each phase. At security milestones run targeted integration suites and a production build/type/lint check; record known unrelated failures separately. Do not label the entire suite green based on focused tests. Include actual commands/results and tested platform versions in the post-audit report.

## 8. Upstream adoption and release gate

Before implementation, compare the current fork with the intended upstream base and separate pre-existing scrolling/startup/theme changes from account commits. Preserve the current dirty worktree; no blanket commit, reset, branch replacement, or publication. A future upstream PR needs an explicitly reviewed integration branch and only account-related changes/dependencies. No PR is created or pushed by this planning task.

Deliver: architecture decision record, data ownership inventory, byte-level account/archive format, user account/backup/recovery guide, legacy migration/cleanup guide, offline decryption tool instructions, pre/post security audits, compatibility matrix and changelog. New artwork must be bundled and redistributable with provenance/license; no remotely loaded login assets.

Release only after the independent reviewer verifies all high-priority threats are closed with evidence and residual risks are documented. The post-implementation source review and focused Windows desktop checks are now recorded in [the post-audit](post-implementation-audit.md); packaged-platform and power-loss release approval remains outstanding. If encryption cannot cover an app-managed persistence surface, block the protected-account claim and fix the surface; do not quietly exclude it.
