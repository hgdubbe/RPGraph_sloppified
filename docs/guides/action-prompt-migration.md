# Migrating Legacy Prompts to Action Replies v1

## Status: Preparation Only

The new compiler and isolated execution boundary exist, but **live workflows still use the legacy executor**. There is no action-runtime switch in the UI yet. Choosing Strict in the Response Router only changes numeric selector validation; it does not enable this protocol.

**Do not replace your working workflow prompts with the examples below yet.** Prepare a separate copy. The examples are compiler-checked decision envelopes, not importable workflows or prompt-document files. The production catalog builder, provider contract, legacy/direct-action adapters, result rendering and persistence integration are still pending. See the [runtime progress record](../review/action-runtime-progress.md).

Legacy prompts need no changes to continue running on the current executor. Compatibility with the new executor will require explicit adapters and regression tests; it is not achieved merely by writing JSON. Never send the same action through both executors.

## What Changes

| Existing instruction or behavior | New action-reply instruction |
| --- | --- |
| Write prose containing an action marker, then interpret that marker later. | Put the action directly in an ordered `action` block. |
| Spell out a full character name in executable message data. | Use the exact current catalog handle in `from`, `to` or `owner`. Names remain normal prose inside text. |
| Create an image, copy its generated image ID into another model response, then attach it. | Put `generate_image` inside the message's `attachment`. Code connects generation to delivery. |
| Copy a stored filename or an old image ID from history. | Select an available current image handle using `stored_image.ref`. |
| Say an image was sent before the send operation finishes. | Keep action-dependent narration provisional or generate it from the committed result later. |
| Emit several standalone JSON objects or mix JSON with surrounding prose. | Return one complete versioned envelope containing an ordered `blocks` array. |
| Group repeated commands by command name. | Emit a separate action block for every intended occurrence. Identical messages can be intentional. |
| Rewrite the whole response when an action argument is invalid. | Use field-specific validation feedback; bounded correction integration is still pending. Never replay successful effects as part of prose editing. |

## What Stays

Keep character knowledge, perspective, language, tone, vocabulary, relationship rules and scene continuity. Apply writing-style instructions to the actual output: narration in `text` blocks and message content in `intent.text`. They belong in the main response step, not only in planning.

Keep planning focused on facts, intent, destination and order. Do not scatter one coherent paragraph into many prompt sections. Shared tone instructions can still be copied once into corresponding main-response fields using the existing editor.

Routing, graph connections, model selection and prompt section editing are separate concerns. This migration does not require renumbering route selectors or changing output handles. Existing variable interpolation is not replaced by action JSON.

## Migration Steps

1. Save/export the original workflow and prepare a separate migration copy. Retain the original as the working version until a runtime-enabled import path is available.
2. Inventory the actual operations used by each route. The initial compiler supports only `image.generate` and WhatsUp `messenger.send`. Routes requiring other operations must remain legacy for now.
3. In the main response's output-format section, replace legacy marker/multiple-object instructions with the complete-envelope contract below. Keep creative instructions in their existing thematic sections.
4. In its commands/images sections, remove instructions to repeat image IDs, invent operation IDs, wrap actions in prose markers, or re-emit a completed action after a tool result. Express generation and delivery as one message attachment source instead.
5. Replace executable character-name references with supplied catalog handles. Do not hardcode the sample handles or catalog ID in a reusable prompt: the future runtime context supplies current values for each decision. Unknown handles are errors, not permission to create a contact.
6. On the migrated path, retire the old marker-to-command formatter and prompt replay stages once their responsibilities are replaced by the structured provider/runtime integration. Do not disable them in your current legacy workflow. Both paths must never execute the same operation.
7. Check text-only, message-only, stored-image, generated-image and gallery-only examples. Then check unavailable recipients, missing images, repeated sends, cancellation and failed delivery before enabling a workflow.
8. Preserve your original prompts until save/load, phone/RP rendering and recovery tests pass for the migrated workflow. No automatic converter or runtime enablement command is supplied yet.

## Main Response Contract

The following is authoring text for a future structured main-response field, not a current workflow import:

```text
Return one complete JSON object with version: 1, catalogId equal to the supplied
current catalog ID, and a blocks array. Do not add markdown fences or prose
outside the object.

Use text blocks for narration: {"type":"text","text":"..."}.
Use action blocks for operations: {"type":"action","intent":{...}}.
Put blocks in the intended reading order. No action is mandatory; blocks may be
empty or contain only text. Each intended send gets its own action block.

Use only supported action keys and exact available handles from the current
catalog. Never invent character, image, block, operation or storage IDs. Never
recover an executable reference from historical prose.

For WhatsUp messages use messenger.send with app: "whatsup", from, to and text.
For an existing image use attachment: {"type":"stored_image","ref":"..."}.
For a new image use attachment: {"type":"generate_image","owner":"...",
"description":"..."}. In this version the generated image owner must be the
sender. Do not separately generate that same image in another action block.

To generate an image without sending it, use image.generate with owner and
description. Generation alone does not authorize posting or delivery.

Apply the configured tone, language and character voice to narration and sent
message text. Do not claim an action has succeeded before receiving its actual
committed result. Do not emit legacy action markers alongside action blocks.
```

## Compiler-Checked Examples

These examples assume catalog ID `example-catalog`: `person_1` is Alice, `person_2` is Bob, and `image_1` is an existing image Alice can access. Alice can generate images and send WhatsUp messages; Bob can receive them. These are illustrative handles, not permanent IDs.

### Narration Only

```json
{
  "version": 1,
  "catalogId": "example-catalog",
  "blocks": [{ "type": "text", "text": "Alice pauses at the doorway." }]
}
```

### Text Message

```json
{
  "version": 1,
  "catalogId": "example-catalog",
  "blocks": [{ "type": "action", "intent": {
    "type": "messenger.send", "app": "whatsup",
    "from": "person_1", "to": "person_2", "text": "Are you still awake?"
  } }]
}
```

### Send an Existing Image

```json
{
  "version": 1,
  "catalogId": "example-catalog",
  "blocks": [{ "type": "action", "intent": {
    "type": "messenger.send", "app": "whatsup",
    "from": "person_1", "to": "person_2", "text": "This is the one I meant.",
    "attachment": { "type": "stored_image", "ref": "image_1" }
  } }]
}
```

### Generate and Send Without Copying an Image ID

```json
{
  "version": 1,
  "catalogId": "example-catalog",
  "blocks": [
    { "type": "text", "text": "Alice frames the sunset through the window." },
    { "type": "action", "intent": {
      "type": "messenger.send", "app": "whatsup",
      "from": "person_1", "to": "person_2", "text": "Look at the view.",
      "attachment": {
        "type": "generate_image", "owner": "person_1",
        "description": "A casual phone photograph of a pink sunset seen through an open apartment window."
      }
    } }
  ]
}
```

Code creates the generation and delivery operation IDs, binds the returned artifact to the send, and retains a receipt. There is no future image ID to predict or copy. The current isolated tests verify this with deterministic adapters; live provider and phone/RP integration are not complete.

### Generate Without Sending

```json
{
  "version": 1,
  "catalogId": "example-catalog",
  "blocks": [{ "type": "action", "intent": {
    "type": "image.generate", "owner": "person_1",
    "description": "A close-up photo of a blue ceramic cup on Alice's kitchen table."
  } }]
}
```

## Exact Limits of This Version

- Keys are case-sensitive. `image.generate` is the standalone action; `generate_image` is an attachment source. They are not interchangeable.
- `text` is required for messages. It may be empty only when an attachment is supplied. Empty text blocks and an empty blocks array are allowed.
- At most 128 blocks per envelope; text fields are limited to 65,536 characters, image descriptions to 16,384, and input handles to 128.
- Unknown extra fields are rejected, including model-supplied `operationId`, filenames, arbitrary metadata, annotations and voice flags. Do not silently remove meaningful context to fit: keep affected routes legacy until those fields are supported.
- No new-contact variant, bank transfers, notes, social posts/comments/DMs, voice messages, image search, caption updates or advanced result-selection protocol is implemented in this initial compiler. Do not invent new action keys for them.
- No workflow flag, provider tool schema, runtime toggle, automatic legacy conversion or persistent recovery is currently available for this path. Re-running a newly prepared execution is a new batch; only repeated calls to the same in-memory execution object share its result.

## Before Enabling Migrated Workflows

Require a tested production adapter and explicit protocol selection; shared model-facing schemas; full-batch validation; current-state checks at execution; validated artifact/delivery receipts; one effect owner; and consistent phone/RP rendering. Verify that prose regeneration does not replay actions. Durable restart and retry behavior belongs to H7 and must be tested rather than assumed from an in-memory run cache.

Reference specifications: [command pipeline](../design/RPGraph-redesign-handoff-2026-09-07/command-pipeline-proposal.md), [Design Atlas sections 6-11](../design/RPGraph-redesign-handoff-2026-09-07/DESIGN_ATLAS.md), [roadmap](../superpowers/plans/2026-09-06-code-quality-cleanup.md).
