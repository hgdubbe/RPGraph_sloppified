# Migrating Legacy Prompts to Action Replies v1

For a complete worked conversion of the actual default workflow, see [Full Default-Workflow Prompt: RP Prompt with Image](#full-default-workflow-prompt-rp-prompt-with-image), including a full highlighted diff and both prompt files.

## Status: Experimental Live Opt-In

For a ready-to-import baseline, open [default-actions-v1.json](../../workflows/default-actions-v1.json) with this updated build. It is converted from the complete default workflow; [baseline instructions](../../workflows/README.md) describe provider setup and compatibility boundaries.

RP Output now has an **Action protocol** selector. Legacy remains the default for existing workflows. Structured v1 connects ordinary RP/narrator replies to the typed image/WhatsUp runtime. Choosing Strict in the Response Router still only changes numeric selector validation; it does not enable this protocol.

**Use a separate workflow copy.** Connect a Response Router or LLM Prompt directly to RP Output, select Structured v1, and use RP/WhatsUp routes limited to narration, image generation and WhatsUp sends. Phone replies use the Phone Message output connection. Social, autoplay and direct-only input modes retain the legacy executor; a failed structured reply never falls back to it. Regeneration and automatic restart of structured turns are blocked pending durable operation recovery. The examples below are compiler-checked decision envelopes, not importable workflows. See the [runtime progress record](../review/action-runtime-progress.md).

## Creative Fields Versus Managed Rules

Users write tone, vocabulary, perspective, character behavior, scene objectives and creative image direction. Put output style in the final-response step; planning concerns intent and facts.

The application automatically supplies **Reply structure**, **Characters and access**, **Image handling**, and **Message delivery** instructions from [the shared preset](../../src/actions/promptPreset.ts). The router displays these as read-only **Action system / Application managed** sections on the final-response step when its selected output connects to an opted-in RP Output. They are not copied into every route, cannot be accidentally edited through the section editor, and are included in preview assembly. Current character/image handles and capabilities are generated from the actual storybook on each run.

**Do not paste a JSON schema, catalog, receipt rules or ID-handling boilerplate into each prompt.** The detailed contract below is a technical reference. A new route can simply say, for example: "Continue the scene in a warm, understated tone. Keep dialogue concise. Alice may text Bob when it follows naturally from the scene."

Existing legacy action declarations and incompatible response wrappers must still be removed from migrated RP/WhatsUp routes. They are rejected instead of silently running a second executor. The supplied baseline has already been converted. Arbitrary user-authored instructions cannot be safely stripped automatically without changing story behavior. Existing bundled legacy workflows remain unchanged.

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

1. Save/export the original workflow and prepare a separate migration copy.
2. Inventory the actual operations used by each route. The initial compiler supports only `image.generate` and WhatsUp `messenger.send`. Routes requiring other operations must remain legacy for now.
3. Remove legacy marker/multiple-object output instructions. Keep creative instructions in their thematic sections. The application-managed section supplies the complete-envelope contract automatically.
4. In its commands/images sections, remove instructions to repeat image IDs, invent operation IDs, wrap actions in prose markers, or re-emit a completed action after a tool result. Express generation and delivery as one message attachment source instead.
5. Remove hardcoded executable names, handles and catalog IDs. The runtime supplies current values and their selection rules automatically. Character names remain ordinary creative prose. Unknown handles are errors, not permission to create a contact.
6. On the migrated path, retire the old marker-to-command formatter and prompt replay stages once their responsibilities are replaced by the structured provider/runtime integration. Do not disable them in your current legacy workflow. Both paths must never execute the same operation.
7. Check text-only, message-only, stored-image, generated-image and gallery-only examples. Then check unavailable recipients, missing images, repeated sends, cancellation and failed delivery before enabling a workflow.
8. Preserve your original prompts. Enable Structured v1 on RP Output only for the supported migration copy. Crash reconciliation and action-preserving regeneration remain unfinished; saved messages/autosaves are not a durable operation journal.

## Main Response Contract

The following explains the runtime contract for advanced inspection. Equivalent rules are already injected by the managed preset; this is not text the user needs to paste into an editable field:

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

Code creates the generation and delivery operation IDs, binds the returned artifact to the send, and retains a receipt. There is no future image ID to predict or copy. Unit tests and the real Electron graph/phone/autosave pipeline verify this with controlled provider responses; external provider reliability still requires separate testing.

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
- RP Output persists explicit protocol selection. Provider-native tool schemas, automatic legacy conversion and persistent recovery are not implemented yet. Re-running a newly prepared execution is a new batch; only repeated calls to the same in-memory execution object share its result.

## Before Enabling Migrated Workflows

Require a tested production adapter and explicit protocol selection; shared model-facing schemas; full-batch validation; current-state checks at execution; validated artifact/delivery receipts; one effect owner; and consistent phone/RP rendering. Verify that prose regeneration does not replay actions. Durable restart and retry behavior belongs to H7 and must be tested rather than assumed from an in-memory run cache.

Reference specifications: [command pipeline](../design/RPGraph-redesign-handoff-2026-09-07/command-pipeline-proposal.md), [Design Atlas sections 6-11](../design/RPGraph-redesign-handoff-2026-09-07/DESIGN_ATLAS.md), [roadmap](../superpowers/plans/2026-09-06-code-quality-cleanup.md).

## Full Default-Workflow Prompt: RP Prompt with Image

This historical before/after demonstration remains complete for inspection. Its technical additions are now supplied by the application-managed preset, not intended as boilerplate to copy into new creative fields. It also documents which original default-workflow features still require Legacy.

This is the **complete route prompt**, not a generic sample. Source: [workflow.default_v26.json](../../default_workflows/workflow.default_v26.json), node `llm-prompt-switch-4f07f33e-3db7-4d8d-b3f9-4e5bee791e20`, **Normal RP -> RP Prompt with Image**, route `route-0-0`, selector pair `(0, 0)`. Its Before field is empty; the complete After field is reproduced below. This is the stored authoring prompt, not the assembled provider request with history, variables, image inputs and expanded legacy action instructions.

- [Original full prompt, extracted verbatim](examples/rp-with-image.legacy.txt)
- [Full rewritten prompt, without diff markers](examples/rp-with-image.actions-v1.txt)

**Readiness warning:** The rewritten file is a full-length authoring draft for the supported image/WhatsUp subset, **not a feature-equivalent replacement** for the original route. Do not install it in a working workflow yet. It cannot make unsupported app operations work by changing their names. The existing workflow and prompt import files are unchanged.

### How to Read the Highlighting

The diff below includes every line, with no omitted sections. **Minus lines** are removed legacy instructions; **plus lines** are their replacements or new requirements. Unprefixed context is retained. The separate rewritten text file contains only the new prompt, without review annotations. Green/red syntax highlighting depends on the Markdown viewer.

| Prompt section | Highlighted change | Why it is necessary |
| --- | --- | --- |
| Step description | Remove the claim that a hidden after-reply action records a caption; distinguish the input image from a sendable artifact. | That caption handler is not wired to the new path. Seeing an input image does not grant gallery access. |
| Character knowledge | Retained verbatim. | Action transport must not alter what characters plausibly know. |
| Images | Replace exact `imageId` recovery, `@action` declarations and action-only prompt replay with catalog handles and typed attachment sources. | Code, not prose, connects the actual generation result to delivery. |
| Output format | Replace plain prose mixed with messenger objects with one versioned envelope and ordered text/action blocks. | Placement is structural; text transformations must not change action identity. |
| Messenger payload | `MessengerAppName`/`whatsUpApp` becomes `messenger.send` with `app: "whatsup"`; `message` becomes `text`; full names become catalog handles; `sendImageId` becomes `attachment`. | These are actual v1 compiler field names, not aliases for the old parser. |
| Conversation rules | Retain one partner, chronological opening message, two-to-four-message exception and physical-separation rule; express each message as an action block. | Preserve story behavior while replacing the transport. Both participants need send/receive capabilities for a back-and-forth. |
| Commands | Remove marker expansion, explicitly mark unsupported operations unavailable, preserve the ChatGPD world-name rule. | There are no corresponding new registered handlers yet. Silently replacing those operations with prose would lose functionality. |
| Final checks | Replace marker/ID checklist with envelope, capability, reference and committed-result checks. | Intent is not proof of successful execution. |

### Feature Parity Still Blocked

The original route can invoke all of the following. These are **required follow-up integrations**, not optional prompt deletions:

- `Get character phone image list`: replace the old lookup/replay with authoritative catalog construction; broader image search/inspection still needs migration.
- `Describe input image (After Reply Action)`: implement image-bound caption enrichment and its failure behavior. Do not preserve the original promise of a hidden caption action until it actually exists on the new path.
- Fotogram/OnlyFriends private messages and WhatsUp voice messages: add app-specific schemas, capability checks, handlers and rendering before migrating those beats.
- `Bank_transfer`, `Fotogram_post_comment`, `OnlyFriends_post_comment`, `Create_Note`, `Simulate_ChatGPD`: implement and test the corresponding registered operations and direct/legacy adapters. No speculative v1 action names are provided here.
- Scene/history inputs, actual input image delivery, `<Response Length>` substitution, current catalog injection, result-aware narrative continuation and exactly one executor per migrated turn: wire and verify these outside the prompt.

There is no per-beat automatic fallback implemented yet. Keep the original route active rather than assuming the runtime will switch an unsupported beat to legacy. Once those capabilities exist, extend this draft with their real generated registry instructions and repeat the parity tests.

### Complete Highlighted Prompt

```diff
--- docs/guides/examples/rp-with-image.legacy.txt
+++ docs/guides/examples/rp-with-image.actions-v1.txt
@@ -1,60 +1,56 @@
-This is the Normal RP prompt for input with an attached image. Write the scene in-character, reacting to both the latest input and the image; use recent chat, scene state, and relationships. Do not contradict what the image shows. Do not write caption metadata JSON; a hidden action records the caption after the reply.
+This is the Normal RP prompt for input with an attached image. Write the scene in-character, reacting to both the latest input and the image; use recent chat, scene state, and relationships. Do not contradict what the image shows. Treat the attached input image as visual context, not automatically as a sendable gallery artifact. Do not emit caption metadata or assume a hidden after-reply action records it.

 Characters only know what they could plausibly know in-world: what they themselves saw, did, or were told. Even though the full history is visible to you, never let a character mention, react to, or plan around conversations, plans, or secrets they were not part of.

 Image check. Do this first, before writing any story text:
-Decide whether this beat sends an image (a character takes or sends a photo, or one was promised). To do that you need an exact imageId from an action result shown below or from recent phone/photo history. Never invent or guess an imageId; a made-up id sends nothing.
-If an image is needed and no exact imageId is available yet, do not write the story in this pass: your entire output must be only the single action JSON object shown below, with no story text, no messenger message, and no command markers. The prompt reruns with the action result, and you write the full story then. Image actions are not commands and never get a command marker.
-If an action result is already shown below, do not call that action again; write the story now and use its imageIds.
-
-@action:Get character phone image list
-
-@action:Create character phone image
-
-@action:Describe input image (After Reply Action)
+Decide whether this beat sends an image (a character takes or sends a photo, or one was promised). Choose only images and characters exposed as available in the supplied current catalog. Never invent or guess a handle, retrieve an executable reference from prose history, or use a filename as an image reference.
+For an existing accessible image, put {"type":"stored_image","ref":"CURRENT_IMAGE_HANDLE"} in the message's attachment field.
+When this beat needs a new image, put {"type":"generate_image","owner":"CURRENT_SENDER_HANDLE","description":"the image to create"} in that message's attachment field. The owner must be the sender. Code creates the image and binds the actual returned artifact to delivery; do not predict or repeat its future image ID.
+To create an image for the character's gallery without sending it, use a separate image.generate action with owner and description. Generation alone does not authorize a send.
+Do not also issue a standalone generation action for an image already requested by a message attachment. If an available image is already supplied in the current catalog, reuse its handle when the same image is intended; do not regenerate it merely because a prompt was replayed.
+No action is mandatory. Reacting to the attached input image does not itself require generating or sending an image. An input image may be sent only if the application also exposes it as an accessible current image handle.

 Output format:
-Write max <Response Length> words of RP story as plain text. No markdown; any JSON must be valid with double quotes.
-
-Replace MessengerAppName in the format below with the key of the messenger this beat uses: whatsUpApp (WhatsUp), fotogramApp (Fotogram private messages), or onlyFriendsApp (OnlyFriends private messages). Never output MessengerAppName itself or any other made-up key.
-
-The messenger JSON itself sends the message. Never add a command marker for it.
-
-Embed the messenger object at the story moment where its first message is sent; story text may continue afterward:
+Write max <Response Length> words of RP story in the text fields of one complete JSON envelope. Use plain prose within text fields, without markdown. Use valid JSON with double quotes and escape quotes or line breaks inside strings.
+The envelope has exactly version, catalogId, and blocks. Set version to 1 and catalogId to the exact current catalog ID supplied by the application. Do not hardcode the illustrative values below.
+Use {"type":"text","text":"RP prose"} for narration.
+Use {"type":"action","intent":{...}} for a requested operation.
+Put each action block at the story moment where it belongs. Story text may continue in later text blocks, but action-dependent prose must not assert success before a committed result is available.
+A text-only reply and an empty blocks array are valid. Never place prose or additional JSON objects outside the envelope. Never embed executable messenger JSON or legacy command markers inside a text field.
+
+A WhatsUp message uses this intent:
 {
-  "MessengerAppName": [
-    {
-      "from": "first person name",
-      "to": "second person name",
-      "message": "opening message",
-      "isVoiceMessage": false,
-      "sendImageId": "stored_image_id"
-    },
-    {
-      "from": "second person name",
-      "to": "first person name",
-      "message": "reply"
-    }
+  "type": "messenger.send",
+  "app": "whatsup",
+  "from": "CURRENT_SENDER_HANDLE",
+  "to": "CURRENT_RECIPIENT_HANDLE",
+  "text": "opening message"
+}
+from and to are exact available character handles, not display names. text is the sent message, replacing the legacy message field. To attach an image, add one attachment source as described above; do not add sendImageId, imageId or isVoiceMessage.
+A complete response has this shape:
+{
+  "version": 1,
+  "catalogId": "CURRENT_CATALOG_ID",
+  "blocks": [
+    { "type": "text", "text": "RP prose before the message." },
+    { "type": "action", "intent": {
+      "type": "messenger.send",
+      "app": "whatsup",
+      "from": "CURRENT_SENDER_HANDLE",
+      "to": "CURRENT_RECIPIENT_HANDLE",
+      "text": "opening message"
+    } }
   ]
 }
-The array should normally contain exactly one message. If the latest input narrates or directs a discussion or back-and-forth instead of only writing the selected character's own reply, it may instead contain one short conversation of two to four messages. Write the complete exchange in chronological order, starting with the newly occurring message that initiates it; do not replace that opening message with RP prose. Alternate between the same two people and use at most one messenger object with one conversation partner per RP response. Choose the shortest number that completes it; do not add filler.
-Use messenger messages only between people who are not physically together; characters in the same place talk in RP prose. Most beats need no messenger object. from, to, and message are required. isVoiceMessage and sendImageId currently work only in whatsUpApp and are ignored in Fotogram and OnlyFriends. For WhatsUp, set isVoiceMessage to true only for a spoken TTS voice message and use sendImageId only with an exact known imageId.
-
-Commands:
-Use only command names explicitly listed in this section; never invent one.
-Commands trigger real phone-app actions; story text alone never performs one. For every situation listed below, write a marker at that point in the story: [command_name: rough plan], one short sentence, e.g. [bank_transfer: Mia sends 40 dollars to Ryan for the tickets]. A follow-up pass expands it; markers are hidden from the player. Never write command JSON yourself.
-
-Money is transferred now:
-@command: Bank_transfer
-
-A comment is written on an existing social post now:
-@command: Fotogram_post_comment
-@command: OnlyFriends_post_comment
+These uppercase values are illustrative slots: use real values from the current catalog, never the slot labels themselves.

-A character writes or saves anything on their phone now (note, reminder, to-do, list, plan, diary entry):
-@command: Create_Note
+There should normally be exactly one messenger action. If the latest input narrates or directs a discussion or back-and-forth instead of only writing the selected character's own reply, it may instead contain one short conversation of two to four message action blocks. Write the complete exchange in chronological order, starting with the newly occurring message that initiates it; do not replace that opening message with RP prose. Alternate between the same two people and use at most one conversation partner per RP response. Choose the shortest number that completes it; do not add filler. Each intended message is a separate action block, even if two messages have identical text.
+Use messenger messages only between people who are not physically together; characters in the same place talk in RP prose. Most beats need no messenger action. from, to, and text are required; text may be empty only when an attachment is supplied. Each sender and recipient must have the corresponding capability in the current catalog.

-A character actually uses the AI assistant now (every AI in the story world is ChatGPD, whatever anyone calls it):
-@command: Simulate_ChatGPD
+Actions:
+Use only the action keys supported by this protocol: messenger.send for WhatsUp delivery, and image.generate for generation without delivery. For image.generate, supply owner as an available character handle and description as the image request. Do not invent other action keys.
+Action blocks request real app operations; story text alone never performs one. Do not emit [command_name: rough plan] markers, @command declarations, @action declarations, or a second command-formatting response.
+This initial protocol does not support bank transfers, Fotogram or OnlyFriends messages/comments, saved notes, ChatGPD sessions, voice messages, image-search operations, caption updates or new contacts. Do not pretend these operations happened, encode them as ordinary text to cause an effect, or replace a requested unsupported app with WhatsUp. Beats that require these capabilities must remain on the legacy workflow until the application supports their migration.
+Every AI in the story world is ChatGPD, whatever anyone calls it. This world rule still applies, but mentioning ChatGPD in prose does not create an app session.

-Final reminder: never wrap any part of your output in ``` code fences (markdown code blocks); output raw text and raw JSON directly; before you finish, check your output. If it contains a money transfer, a saved note, an AI-assistant chat, a social comment, every one of them MUST have its inline [command_name: plan] marker; without it nothing happens in the phone apps. If it sends an image, the imageId must come from an action result or recent phone/photo history; if you have no such id, output only the image action JSON instead of the story.
+Final reminder: never wrap any part of your output in markdown code fences. Return only the complete JSON envelope. Check that all action keys, fields, handles and capabilities are supported, every intended message has its own correctly positioned action block, and any stored image belongs to the current accessible catalog. A new image to be sent must use a generate_image attachment source, not an invented future image ID. Never create operation IDs, block IDs, storage paths or delivery receipts. Do not assert generation, sending, payment, note saving or other app success before the application has committed that operation. Preserve character knowledge, scene continuity and the configured writing style in the actual narration and message text.
```

The documentation test reconstructs both full text files from this diff and compares the original against the actual default workflow. This checks completeness and source fidelity, not the quality of model decisions or live runtime readiness.
