# Account archive v1 foundation

Status: codec and standalone decryption tool implemented; this document does not claim complete application integration, migration, account isolation or a completed post-implementation audit. AccountManager must supply an authenticated, consistent snapshot and enforce import/export permissions. Only synthetic fixtures were used.

## Container and protection

The artifact is an ordinary ZIP with these exact entry names:

- `header.json`: public format identifiers and random IDs; no private account alias.
- `manifest.json`: private record metadata and ordered chunk descriptors; encrypted for protected archives.
- `chunks/00000000.bin`, `chunks/00000001.bin`, …: contiguous globally numbered chunks, encrypted for protected archives.

Protected archives do **not** use standard ZIP password encryption. A normal unzip program sees the public header and authenticated ciphertext envelopes. Use the RPGraph decryption tool to produce the canonical plaintext ZIP. Plain archives use the same layout, with raw chunk bytes and a plaintext manifest; ordinary file extraction exposes account metadata/content.

The exact header fields are `format: "rpgraph-account-archive"`, `version: 1`, `accountId`, `archiveId`, and `protection: "plain" | "encrypted"`. Encrypted headers additionally require `keyEnvelope`, the existing password-wrapped account DEK from [crypto format v1](format-v1.md). Both IDs use lowercase UUID spelling. Archive IDs are freshly random per export. Header metadata, file counts and ciphertext sizes remain public.

An archive key is derived from the account DEK using HKDF-SHA256, 32-byte output, salt equal to the UTF-8 archive UUID and info equal to UTF-8 `rpgraph-account-archive:v1`. The export API accepts the DEK and its matching password wrapper only from trusted main-process code; it cannot verify that pairing without the password. It copies/derives needed state synchronously, never emits a raw key, and never mutates the caller's DEK. Import unwraps the DEK once and discards that temporary key after deriving the archive key.

Every protected chunk uses the account record AEAD format with context `{ accountId, objectId: archiveId, type: "archive-chunk", revision: globalChunkIndex }`. The manifest uses `{ accountId, objectId: archiveId, type: "archive-manifest", revision: 0 }`. Each envelope gets a fresh nonce. The crypto format specifies exact AAD serialization. This binds chunk position, archive identity and account identity, while the encrypted manifest binds membership, record order, byte counts and content hashes.

The manifest has exactly `format`, `version`, `entries`. Its format/version match the header. Each record has exactly `id`, `type`, `revision`, `metadata`, `chunks`. IDs, types and revisions follow crypto context validation. Metadata is a bounded JSON value, not executable configuration. Each chunk descriptor has exactly `index`, `bytes`, `sha256`; the latter is lowercase hex SHA-256 of plaintext. Indices must be contiguous starting at zero across manifest order. Empty records have no chunks. Unknown ZIP entries, missing chunks, duplicate IDs and unreferenced chunks are rejected.

Domain-specific payload schemas and references are validated by the importing application. The codec does not execute scripts, follow original filesystem paths, start providers, or install anything. An authenticated archive does not authorize imported configuration to execute.

## Bounds and ZIP dependency review

| Bound | Current v1 limit |
| --- | --- |
| Physical ZIP entries | 100,000, including header and manifest |
| Logical records | 99,998 |
| Total plaintext chunk bytes | 8 GiB |
| Plaintext chunk | 4 MiB |
| Decoded manifest | 16 MiB |
| Public header | 16 KiB |
| Per-record serialized metadata | 64 KiB |
| Metadata nesting / value count | 16 levels / 10,000 values |
| Physical ZIP / summed expanded ZIP entries | 12 GiB |
| Compression ratio per entry | at most 100:1 (one-byte denominator minimum) |

Encoded encrypted entry limits account for base64 expansion plus a 1 KiB envelope allowance before allocating entry buffers. Writes stream one chunk at a time with backpressure; they do not concatenate the whole account. The manifest and directory index remain bounded in memory. Input producers should provide bounded byte chunks and a stable main-owned snapshot. A caller that allocates an entire image/account before passing it has already incurred that allocation outside the codec.

The writer uses ZIP STORE (no compression). Readers accept STORE or DEFLATE only, require ordinary regular-file entries, reject traditional ZIP encryption, and use an exact filename whitelist. Absolute paths, traversal, backslashes, device names, alternate data streams, case variations, directories and symlinks cannot match that whitelist. No extract-to-directory API is used.

Direct runtime dependencies are pinned to `yauzl 3.4.0` and `yazl 3.3.1`; the lockfile records their transitive dependencies. Their primary documentation specifies [yauzl lazy entries, strict filenames and actual size validation](https://github.com/thejoshwolfe/yauzl) and [yazl stream backpressure](https://github.com/thejoshwolfe/yazl). The implementation uses `lazyEntries: true`, `strictFileNames: true`, `validateEntrySizes: true`, and serial processing. This focused API review is not a full supply-chain security certification. Installation used `--ignore-scripts` without unrelated upgrades.

## API ownership and failure semantics

`writeAccountArchive({ destination, accountId, entries, key?, keyEnvelope?, signal? })` accepts an iterable of records with iterable binary data. Supplying only a key or only a wrapper is an error; protected exports never fall back to plaintext. Entry metadata is copied before awaiting its data. Main-process authorization and a stable store snapshot remain mandatory.

Export stages a unique `.partial` sibling, mode 0600 where supported. Protected output staging contains ciphertext only. Final publication uses an atomic hard link and fails if the destination exists; filesystems that do not support this operation fail safely instead of overwriting. The source and existing destination are never deleted. Successful publication removes the temporary link. Failure/cancellation removes only the task-owned partial file. This is atomic publication, not a claim of power-loss durability on every filesystem.

`openAccountArchive({ source, password?, signal? })` returns `{ accountId, protection, entries, read(id), close() }` only after complete structural, manifest and all-chunk verification. It keeps the original ZIP handle open. Each later record read verifies the bytes again, including authentication in protected mode, so in-place source changes cannot bypass verification. Metadata exposed to callers is copied. No callbacks receive partially verified records. Consumers must call `close()` in `finally`, process data with bounded backpressure, and avoid retaining all yielded chunks. Signal cancellation closes the source and prevents further reads. Application import stages destination-encrypted records and publishes the destination account only after its own complete validation.

`decryptAccountArchive({ source, destination, password?, signal? })` deliberately writes a canonical plaintext archive after successful validation. This operation is separate from a protected account's ordinary export policy. It retains the encrypted source and refuses to overwrite the destination.

Export cancellation stops accepting/writing data promptly even if an input iterator stalls. It requests iterator cleanup without waiting forever for an uncooperative producer; application providers must still honor their own cancellation signal. Existing OS writes may finish against the unpublished ciphertext partial before cleanup. Cancellation is not a claim to cancel external providers.

## Standalone decryption

Run with the repository's supported Node runtime and installed runtime dependencies:

```text
node scripts/decrypt-account.mjs SOURCE.zip DESTINATION.zip
```

The terminal password prompt suppresses character echo. For automation use `--password-stdin` and feed the password through a dedicated stdin channel; it accepts one trailing LF/CRLF and bounded input. Do not put passwords in argv, shell history or filenames. The tool warns that decrypted output contains all account content and any stored credentials. It does not require a running app or unlocked profile. Forgotten-password recovery is not provided.

The plaintext result imports through the same codec. Application import must explicitly choose destination protection, generate a new account ID/DEK, validate all owned record references, and re-encrypt as appropriate. Record sizes supported by the current store may be lower than the codec's streaming total; integration must reject unsupported imports before account publication, not silently truncate them.

## Verification and remaining release gates

Focused tests cover plaintext/protected roundtrips, data crossing the 4 MiB boundary, wrong passwords, absence of synthetic private strings in protected output, hostile ZIP paths/duplicates/symlinks/ratio/size declarations, metadata depth, stalled-source cancellation, early output failure, metadata snapshots, source mutation after verification, destination no-overwrite, and the standalone stdin-password tool. The symlink control was deliberately disabled to observe its regression test fail, then restored.

The default numerical maxima are policy limits, not proof of performance at an 8 GiB account or 100,000 entries. Large-account benchmarks, manager integration, final packaged application tests, cryptographic archive vectors, additional fault injection and independent archive review remain required before the complete account-export feature is released. No standard ZIP password interoperability, browser vault support, or full application privacy guarantee is claimed by this codec alone.
