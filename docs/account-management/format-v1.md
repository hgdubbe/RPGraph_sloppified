# Account crypto format v1

This specifies the implemented `electron/accounts/accountCrypto.cjs` primitive boundary only. It is not a complete account-store, archive, migration, or streaming-media format, and does not establish application account isolation. Those formats and integration audits remain separate release gates in [the implementation plan](plan.md).

## Binary encoding and validation

Envelopes are JSON objects with exactly the documented own fields; unknown or missing fields are rejected. JSON object property order and indentation do not affect authentication. Strings containing binary data use canonical RFC 4648 standard base64, including required padding, without whitespace. Decoders bound the encoded length before allocating decoded bytes, then check decoded length and canonical re-encoding.

V1 uses AES-256-GCM, a 32-byte key, a fresh random 12-byte nonce and a full 16-byte authentication tag. Encryption produces no padding. No plaintext is returned before tag verification. Application callers own returned plaintext/key buffers and their lifetime; temporary key/decryption buffers are cleared best-effort, not with a forensic-erasure guarantee.

Account/object IDs match lowercase hexadecimal UUID spelling `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`; this primitive validates spelling, not UUID version bits. Account ownership, canonical paths and authorization are validated by the caller. Object type matches `[a-z][a-z0-9-]{0,63}`. Revision is an integer from zero through `9007199254740991`. Callers supply the expected record context from a trusted authenticated catalog, never simply trust context advertised by an untrusted record.

## Password-wrapped account key

Exact fields:

| Field | V1 value |
| --- | --- |
| `format` | `rpgraph-account-key` |
| `version` | integer `1` |
| `kdf` | exactly `{ "name": "scrypt", "N": 131072, "r": 8, "p": 1 }` |
| `salt` | base64 of 16 random bytes |
| `nonce` | base64 of 12 random bytes |
| `tag` | base64 of 16 authentication bytes |
| `ciphertext` | base64 of the encrypted 32-byte account data key |

Passwords use Node UTF-8 string encoding, with no trimming or Unicode normalization; encoded length must be 1–1024 bytes. Derive a 32-byte wrapping key using scrypt with the fixed descriptor above. The implementation sets a 256 MiB maximum-memory allowance and rejects concurrent KDF work rather than retaining an unbounded password queue. No attacker-selected alternative work factors are accepted.

Authenticated additional data (AAD) is the UTF-8 encoding of this JSON array, using compact JSON serialization with no whitespace or final newline:

```text
["rpgraph-account-key",1,accountId,"scrypt",131072,8,1,saltBase64]
```

Here `accountId` and `saltBase64` denote their JSON string values, not unquoted identifiers. Fixed tags/domain and numeric fields are part of AAD. This binds the wrapped key to the expected account and KDF descriptor. AES-256-GCM is fixed by format v1; there is no negotiable cipher field.

`createKeyEnvelope(password, accountId)` creates a new random account key. `wrapKey(key, password, accountId)` creates a fresh salt/nonce wrapper for a supplied key without mutating the caller's buffer. Rewrapping supports authenticated password changes but does not revoke a copied old wrapper/password pair. These APIs are main-process primitives; callers must authorize password changes themselves.

`unlockKey` validates and snapshots all envelope fields before its asynchronous KDF. Later mutation of the caller's envelope cannot affect the operation. An unsupported envelope at invocation is rejected. `wrapKey` likewise snapshots key bytes before asynchronous derivation, clearing that copy when finished.

## Account content record

Exact envelope fields: `format` (`rpgraph-account-record`), `version` (`1`), `nonce`, `tag`, and `ciphertext`. Nonce and tag encoding are identical to the key wrapper. Plaintext and decoded ciphertext may contain zero through 67,108,864 bytes. This is a per-record primitive limit, not a supported account/archive size or a streaming implementation.

AAD uses the same compact JSON/UTF-8 convention:

```text
["rpgraph-account-record",1,accountId,objectId,type,revision]
```

The three identifiers/type are JSON string values; revision is a JSON integer. Account/object/type/revision substitution therefore fails authentication. A record envelope intentionally contains none of that private catalog metadata. This binding does not itself prevent rollback to an older authentic catalog; durable catalog/version policy belongs to the store.

## Fixed synthetic interoperability vectors

These are public test fixtures, never application secrets. Values were generated directly using Node's `scryptSync` and `createCipheriv`, literal AAD strings, and the fixed input bytes below, without importing production `accountCrypto`. The regression test decrypts these hardcoded ciphertexts; it is not a production encrypt/decrypt self-roundtrip. A temporary change to production record AAD was observed to fail that vector test and was then restored.

Shared account ID: `11111111-1111-4111-8111-111111111111`.

Account key (hex): `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`.

Password: `RPgraph synthetic vector 1`.

Key-wrapper AAD is exactly these ASCII/UTF-8 bytes, with no newline:

```text
["rpgraph-account-key",1,"11111111-1111-4111-8111-111111111111","scrypt",131072,8,1,"ICEiIyQlJicoKSorLC0uLw=="]
```

| Wrapper field | Base64 |
| --- | --- |
| salt | `ICEiIyQlJicoKSorLC0uLw==` |
| nonce | `MDEyMzQ1Njc4OTo7` |
| tag | `jY8o1DhN12a6oQ3RH8Chxg==` |
| ciphertext | `MTcLQESDLXA6FSEPdhjC2az84gdQkToHzHZ3qXMaDwg=` |

The content-record plaintext is hex `00ff8041c3a90d0a00`. Its AAD is exactly:

```text
["rpgraph-account-record",1,"11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","media",7]
```

| Record field | Base64 |
| --- | --- |
| nonce | `QEFCQ0RFRkdISUpL` |
| tag | `Nwiim67nkcyid5z77xNjpg==` |
| ciphertext | `4kYuYuWVignN` |

Changing this serialization requires a new version and compatible readers, not regeneration of the fixtures to match changed code. Archive encryption-domain separation and authenticated chunk manifests are specified separately in [archive-v1.md](archive-v1.md).

## Protection-transition journals

The public account profile names a current generation UUID. Optional `pendingRemoval` identifies an unpublished passwordless generation from an interrupted protection removal; optional `pendingCleanup` identifies the obsolete publicly keyed generation after adding a password. They are mutually exclusive UUIDs, distinct from the current generation, allowed only on non-default password-mode profiles.

Either journal disables ordinary unlock and reports `protectionChangePending: true` and `protected: false`. In particular, publishing a password wrapper alone cannot claim confidentiality while the old passwordless generation survives. Recovery authenticates the current wrapper, removes only the validated obsolete generation (or accepts its already-completed removal), and then atomically clears the journal. Upgrade recovery preserves the new protected generation; interrupted downgrade recovery preserves the original protected generation.
