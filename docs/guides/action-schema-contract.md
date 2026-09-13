# Shared Action Schema Contract

## Current Boundary

[src/actions/schema.ts](../../src/actions/schema.ts) owns the draft-07 JSON Schema for the existing version-1 reply envelope, text/action blocks, WhatsUp messages, gallery generation and stored/generated image attachments. The two action definitions also expose descriptions, adapter receipt schemas and retry policy.

Consumers:

- [compileReply.ts](../../src/actions/compileReply.ts) reads allowed fields, text limits, the app discriminator, version and block limit from these definitions. Its typed compiler table must cover every canonical action.
- [parseReply.ts](../../src/actions/parseReply.ts) accepts the narrow named-operation wrapper compatibility form only for registered action keys.
- [executionRegistry.ts](../../src/actions/executionRegistry.ts) reads receipt field sets and retry policy from the same definitions. Identity, acknowledgement and current-access checks remain at the effect boundary.
- [promptPreset.ts](../../src/actions/promptPreset.ts) adds the serialized reply schema to application-owned router instructions. It is not copied into user-authored tone or other creative fields and is not persisted separately in each workflow.

No workflow import or creative prompt rewrite is required. Existing version-1 replies keep their shape. Legacy workflows remain on their existing execution path.

## Validation Is Not Authorization

A schema-valid handle can still be unknown, stale, blocked or inaccessible. The compiler must resolve references against the current authoritative catalog and the executor must recheck access. Do not use JSON Schema validation as permission to execute an operation, and never execute partial streamed action JSON.

Receipt schemas describe shape only. They do not establish that an image was persisted or a message was delivered. The executor still checks returned identities against the requested operation and current artifact catalog.

String limits count Unicode code points, matching JSON Schema rather than UTF-16 units. This avoids rejecting emoji-heavy text at half the advertised character limit. Very oversized strings are rejected before allocating a code-point array.

## Tests

[schema.test.ts](../../src/actions/schema.test.ts) uses Ajv 8 in strict mode to independently validate the emitted schema and compare accepted/rejected fixtures with the compiler. Cases cover gallery and generated attachments, missing/extra fields, limits, unsupported actions/apps, empty text, Unicode, receipt shapes, registry coverage and catalog authorization remaining stricter than shape validation.

Ajv is a development dependency only. The shipped app keeps its existing typed compiler and does not compile JSON schemas with dynamic code generation in the renderer. See [Ajv's validation guide](https://ajv.js.org/guide/getting-started.html) for the independent test validator.

## Remaining Roadmap

### 2026-09-09: Unsloth Contract Bridge

Final action-producing prompt steps now carry `responseContract: 'actions-v1'` through `NodeLlmApi` and the preload IPC bridge. Planning, upstream preparation and ordinary chat do not request it. Electron accepts only registered contract identifiers, not arbitrary renderer-supplied schemas.

[responseContracts.cjs](../../electron/providers/responseContracts.cjs) enables `response_format: json_schema` for a currently resident Unsloth GGUF backend, checked after loading on every contracted request. Non-GGUF and other providers retain prompt-based generation plus compiler validation. Capability-check failures and loading-state races fail explicitly; they are not silently retried without constraints. Provider-reported output-budget truncation produces an explicit error before action execution.

The provider schema is a semantics-preserving projection of the shared schema, with complete alternatives for text-only versus attached messages. This avoids llama.cpp's union converter ignoring sibling object constraints. [Official converter source](https://github.com/ggml-org/llama.cpp/blob/master/examples/json_schema_to_grammar.py). Independent Ajv fixtures check both projections against the compiler. Local validation remains mandatory because server grammar converters support only subsets of JSON Schema.

Electron loads the generated [actionReply.schema.json](../../electron/providers/actionReply.schema.json). Regenerate it with `npm run actions:schema` under Node 24 after changing [schema.ts](../../src/actions/schema.ts). A unit test compares the generated artifact with the current source; stale exports fail tests. It is included by the existing Electron packaging glob.

Live tests accepted a simple constant schema and a full text-block reply. The first nested attachment probe returned incomplete JSON; investigation identified the union-conversion limitation above. The corrected nested projection is covered by deterministic tests but awaits a fresh live check after the user reloads their model. Do not describe all live schema cases as passing.

- H4: finish capability and rendering metadata consolidation; semantic validation is still implemented by the compiler/executor, not generated from JSON Schema.
- H6: finish the corrected live nested-schema check, verify other provider adapters before enabling their native schema parameters, and implement bounded pre-execution correction. The Unsloth contract bridge above is implemented; it does not establish universal provider support.
- H7: durable operation journaling, reconciliation and action-preserving regeneration remain pending. Existing restrictions must stay in place until these guarantees are implemented and tested.

Do not mark H4-H7 complete because a machine-readable schema exists.
