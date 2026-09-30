# Local accounts, saves and backups

> This is experimental, it is strongly advised to create backups of the applications appdata folder before first run.

Close RPGraph before copying its entire application data directory, including old saves, settings and Chromium storage. Use your existing installation's actual directory (usually `%APPDATA%/RPgraph Studio` on Windows, `~/Library/Application Support/RPgraph Studio` on macOS or `$XDG_CONFIG_HOME/RPgraph Studio` on Linux; names/casing or custom `--user-data-dir` may differ). Keep the backup outside that directory. An account export is not a substitute for this pre-migration backup.

RPgraph Studio starts at account selection. Choose an account and enter its password if it has one. Creating an account offers password protection. A password protects its app-managed settings, credentials, workflows, storybooks, roleplay saves, images, libraries and preferences together. Ordinary saves and autosaves inherit the account protection; they do not ask for another encryption password.

The reserved `default` account has password `default`. These credentials are public: this is a shared starter account, not a private account or administrator. A passwordless account also offers no confidentiality. Choose your own protected account for private data. Account names are visible before login; use a neutral public name if desired.

## Startup and switching

Login grants access to account settings and libraries. Restoring a previous workspace or autosave remains a separate choice. Declining recovery opens the bundled defaults without selecting your prior storybook or RP content.

The header's final **Account** button opens account settings. Its sidebar contains Overview (lock/switch), Profile (rename), Security (password/encryption), Backup (export) and Delete account. Security changes end the current session. Other accounts require their own login. The shared default cannot be deleted, renamed or have its published password changed.

If a protection change is interrupted, account selection offers recovery instead of normal login. Complete it with the new password when adding protection, or the original password when removing protection. RPgraph does not claim protection until cleanup finishes. This cannot erase copies previously made outside the application.

Closing the workspace locks the account. Supported desktop lock/suspend events also lock it. Each login uses a separate, nonpersistent browser session. Browser-only mode is explicitly a demo; it does not persist accounts or promise encrypted storage.

Autosave controls are always available in **Options → Autosave & Recovery**. Enable or disable autosaves independently of account protection. The displayed protection comes from the account. A forgotten private password cannot be reset; keep usable backups and a strong passphrase.

## Existing local data

When prior local data exists, account selection offers **Import existing data**. Choose a new account name and protection, then confirm reading the legacy data. RPgraph copies recognized settings, browser preferences, files, characters, NPC libraries and themes into a new account, not silently into `default`. A failed migration does not publish a partial account or offer source deletion. Imported file writes are read back before publishing the account.

Legacy manually encrypted files retain their existing format and may need their original passwords when opened. Credentials protected by the old operating-system key store must be decryptable on the migration computer. Linked folders and unsupported files are rejected instead of followed. Large files are bounded as described below.

After a successful import, **Keep originals** is the default. **Review deletion list** shows eligible file paths and browser preference names, never their contents. Deletion requires a separate confirmation and checked consent box. The warning explains that the imported copy depends on the account (and its password, if protected), except for other copies/backups you kept. Verify the account and keep a backup before deleting originals; keep originals if you have not done so.

Cleanup deletes only unchanged, individually validated imported unprotected files and unchanged imported browser preferences. Encrypted originals, unrelated files and all folders remain. Changed or unsafe paths are skipped. The completion notice reports skipped items, asks you to check for remaining data and offers **Open original folder**. This is permanent deletion, not secure erasure: caches, prior exports, backups and copies elsewhere may remain and retain their previous protection.

Imported accounts ask whether to enable imported provider configuration on first login. **Use offline defaults** keeps imported settings, browser preferences and pending model state separate from the active defaults. The imported configuration remains available for review on a later login. Enabling it may contact its configured endpoints or load local models; approve only configurations you recognize.

Reserved offline fallback files inside an import are discarded so they cannot override this refusal. Source account archives remain unchanged; legacy originals are deleted only through the separate consent flow above.

## Account export and import

**Account → Export account** creates one ZIP at the chosen destination. A protected account export is always encrypted with the account's current protection. Passwordless exports are unprotected. The ZIP contains all current account records, including saved provider credentials and custom assets. It does not package external model installations, provider-side generated files or copies outside RPgraph's storage.

**Import account** at account selection accepts RPGraph encrypted exports and canonical decrypted exports. Choose a new account name and destination protection. Enter an encrypted archive's password once. Import verifies the archive, creates a new account identity and re-encrypts protected destination records. Existing accounts and the input archive are preserved. Imported provider configuration requires the review described above.

This is an RPGraph account ZIP format, not ordinary ZIP password encryption. Extracting its members with a normal ZIP program does not decrypt protected content. See [archive-v1.md](archive-v1.md) and [format-v1.md](format-v1.md) for the interoperable format specification.

## Deliberate offline decryption

The standalone decryption tool needs Node.js 24 or newer and does not require an unlocked or running RPgraph application. From a source checkout after installing its dependencies:

```text
node scripts/decrypt-account.mjs SOURCE.zip DESTINATION.zip
```

Packaged builds include the same tool under `resources/account-tools` with its dependencies; run the command from that directory. The tool prompts for the archive password without echo. For automation, `--password-stdin` reads it from standard input; never put passwords in command-line arguments. It refuses to overwrite an existing destination, preserves the encrypted source, and removes its task-owned incomplete output on cancellation/failure.

The result is an unencrypted canonical account ZIP containing all exported content and credentials. Its protection and handling are the user's responsibility. It can be imported into a new protected or passwordless account.

## Limits and privacy boundary

Local protection covers app-managed data at rest and other logged-out profiles. An unlocked application displays plaintext and may send it to providers when requested. It does not protect against malware, administrator/debugger access, operating-system swap/hibernation, screenshots, clipboard copies, external provider caches, old exports or backups. Password guessing against copied encrypted files remains possible; strong passphrases matter.

Account aliases, random IDs, protection headers and filesystem sizes/times remain public metadata. Each stored file/record is currently limited to 64 MiB; archives and migrations are limited to 8 GiB of expanded data and 100,000 entries. Oversized saves/imports fail without silently writing plaintext. ZIP input is additionally bounded at 12 GiB; archive chunks are 4 MiB. These limits and format versions are documented for upstream adaptation.

Atomic publication and recovery generations protect process-interruption ordering. Windows power-loss behavior and packaged Linux/macOS lock/suspend flows still need platform release validation; passing source tests is not a forensic privacy certificate.
