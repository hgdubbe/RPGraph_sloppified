# RPGraph command pipeline evaluation and proposed refactor

Reviewed 2026-09-07. Source: https://github.com/unrefined803/RPGraph, cloned commit `afa75164a83f12b72f25f3469f5a28b22f9cecfc`. This is a static code review and design proposal, not an implementation or runtime benchmark. The checkout is in `../source`.

Expanded architecture and worked examples are in [DESIGN_ATLAS.md](DESIGN_ATLAS.md), with a [standalone architecture graphic](action-runtime-architecture.svg). The atlas includes sequence/state diagrams, model/runtime responsibility boundaries, ordered response blocks and concrete recovery cases.

## Recommendation

Introduce a typed action runtime with structured LLM decisions, backend-owned references, explicit dependencies, and deterministic rendering of committed results. Preserve the visual graph, configurable prompts, model selection, and the LLM's authority to choose whether to act, what to do, and where results belong.

The essential change is that action outputs become application data. They must no longer need to survive a round trip through generated prose to reach their destination.

## Evidence and current flow

RPGraph is an Electron/React/TypeScript local application, with a graph executor and renderer-side turn orchestration. Provider and filesystem integration live in Electron. Relevant entrypoints are `src/graph/executeGraph.ts`, `src/nodes/shared/promptRun.ts`, `src/app/useGraphRun.ts`, and `electron/main.cjs`. Package scripts declare TypeScript/Vite builds, ESLint, Vitest and Playwright. No dependency installation, build, test, application, or repository script was executed for this review.

The two main action protocols overlap:

1. Image actions: the model requests an action with a prose plan; a follow-up model call converts the plan into arguments; the image action executes; its result is formatted as instructions; the original prompt is replayed to produce a reply.
2. Commands: the model writes inline markers inside a reply; code extracts them; another model call receives the finished reply and plans and emits standalone JSON objects; output parsers turn those objects into app records.

Evidence:

| Observation | Source in reviewed checkout | Consequence |
|---|---|---|
| Image request hints demand a single JSON object with an action name and prose plan. | `src/nodes/shared/promptActions.ts:96` | Selection and argument production require separate interpretation. |
| Command-like image requests are recovered into action requests; follow-up arguments are parsed and the prompt is replayed. | `src/nodes/shared/promptRun.ts:869` | Existing recovery helps, but multiple textual representations of the same intent remain. |
| Generated image results are formatted into a text template; the structured image ID is not returned as a dedicated result field from this wrapper. | `src/nodes/shared/promptActions.ts:2050` | Later stages must recover the reference from text. This also matters when image forwarding to the model is disabled. |
| The current image result template asks for a second JSON caption object if the reply attaches the generated image. | `src/nodes/shared/promptActions.ts:642` | Attachment and caption completion depend on additional model compliance. |
| Known inline markers are stripped and requests grouped by name. | `src/nodes/shared/promptCommands.ts:433` | Repeated commands lose separate occurrence identity and insertion positions. Unknown misspelled inline names remain ordinary text. |
| Requests are grouped again by command ID, then executed only when a visible reply exists. | `src/nodes/shared/promptRun.ts:1047` | Action-only turns and independently ordered instances are awkward. |
| The command prompt describes the reply as final and already delivered. | `src/nodes/shared/promptCommands.ts:491` | Narrative success can precede a valid payload or successful delivery. |
| Command output is accepted at this boundary based on its opening `{` or `[`. | `src/nodes/shared/promptRun.ts:1190` | Full validation is deferred; JSON-looking text is not a typed contract. |
| Messenger instructions require different object keys, full names, exact image IDs, and app-specific optional fields. | `src/nodes/shared/promptCommands.ts:137` | Protocol knowledge competes with roleplay context. |
| RP image IDs are resolved against libraries at final integration and missing images generate warnings. | `src/app/useGraphRun.ts:1562` | Broken references are detected late, after prose generation. |
| Direct app operations already carry structured commits and resolve characters by ID. | `src/chat/directAppActions.ts:1`, `src/app/useGraphRun.ts:1926` | A useful foundation for a shared execution path already exists. |
| Image generation rejects ambiguous owners, generates attachment IDs, and updates storybook image state before final reply integration. | `src/graph/executeGraph.ts:426`, `src/graph/executeGraph.ts:522` | Validation exists, but artifact creation and turn completion have different lifetimes. |
| The model request type exposes prompt/images, without a typed tools/schema contract. | `src/llm/types.ts:9` | Structured generation requires an explicit provider bridge extension. |

The user's diagnosis is directionally correct, but this is not a total absence of structure. The code already parses JSON, validates social accounts, corrects some output, and resolves image owners. The missing boundary is a single validated command/result representation carried through the whole turn.

For generated attachments, the observed problem is mainly image-ID handoff; storage filenames are already assigned by code. Social comments, DMs, feed post records and post reactions also have distinct existing paths. A unified `social.post` operation would need an adapter to the actual post record flow, not an assumption that a matching prompt command already exists.

## Alternatives

1. **Harden current markers and add retries.** Lowest initial cost, useful as a compatibility adapter. It leaves prose as the control channel, loses placement information, and continues to require interpretation of earlier plans.
2. **Replace markers with tool calls alone.** Improves action naming and argument syntax. It does not by itself solve missing attachments, duplicate delivery after retries, speculative success narration, or fragmented persistence.
3. **Typed decisions plus a shared action runtime and result renderer. Recommended.** More interface work, but fixes the end-to-end handoff. Native tool calls and constrained JSON are interchangeable input adapters to this runtime.

## Decision and execution boundaries

Use a versioned discriminated union for actions: image search/generation/captioning, messenger send/conversation, social post/comment, note creation, simulated assistant chat and bank transfer. Each registry entry supplies:

- A stable machine key, argument schema, result schema, description and capability requirements.
- Semantic validation and reference resolution.
- An execution handler, retry policy and result rendering adapter.
- Optional focused content generation, for text, captions, conversations or image prompts.

Generate the model-facing capability descriptions and schemas from this registry. Display labels and user-editable prose templates must not be machine identifiers. Custom workflows can enable subsets, select models, change creative instructions and combine operations. New executable capabilities require registered handlers rather than arbitrary model-invented action names.

The LLM chooses action type, story content, actor, recipient, destination, order and branching. The runtime supplies execution IDs, storage paths, stable entity resolution, authorization/capability checks, dependency wiring, lifecycle state and persistence.

An available action is not mandatory. An empty action list is valid. Schema validation cannot establish that an action is narratively appropriate; the model remains responsible for that decision.

## Model-facing protocol and context

Give the decision call a compact current-turn packet: latest input, selected scene context, relevant characters/accounts, current application state, capability schemas, and any immediate results. Retrieve older context when needed. Keep authoritative app state and pending operations outside narrative compression.

Known entities should be selected through short, turn-scoped handles from a supplied catalog. Resolve those handles into stable IDs before execution; never silently guess between ambiguous names. Handle strings can still be mistyped on unconstrained providers, so validate membership and repair locally. A new fictional outside contact remains possible through an explicit `newContact` variant; it must not be the automatic fallback for a misspelled existing person.

Extend `NodeLlmRequest` and the Electron/preload request bridge with an optional structured-response contract. Use native tools or constrained JSON where the particular provider/model supports them; probe or configure that capability rather than inferring it solely from model metadata. For other providers, parse one JSON envelope and apply the same runtime validation, with a small bounded correction budget. JSON mode alone does not prove schema validity.

Never execute incomplete streamed JSON. Validate the complete envelope and references before scheduling effects. Repair only the invalid selection or argument fields, retaining already validated decisions; do not replay the whole roleplay turn for a spelling error. Reject an invalid action explicitly if correction is exhausted, rather than silently discarding it.

## Common path and flexible composition

For a common generate-and-send operation, let the selected message contain a typed attachment source. Illustrative model output:

```json
{
  "type": "messenger.send",
  "app": "whatsup",
  "from": "character_1",
  "to": "character_2",
  "text": "Look what I found!",
  "attachment": {
    "type": "generate_image",
    "owner": "character_1",
    "description": "A photo of the object just discovered on the beach."
  }
}
```

The keys above are proposed schema fields; the character handles are selected from the current catalog. The compiler expands this into image generation followed by delivery, creates internal operation IDs, and passes the resulting artifact directly to delivery. The model never supplies a filename or a future image ID. Message text can be supplied immediately or produced by a focused content stage whose output cannot change actor/destination.

Support stored-image sources and explicit gallery-only, RP-inline, DM and social-feed destinations as well. Validate each app's actual capabilities; for example, the existing messenger prompt says attachment/voice fields are supported only by WhatsUp. Do not claim that a unified schema automatically adds attachment rendering to other apps.

For advanced behavior, expose separate generate/search and deliver operations. The model may inspect a returned image, pick among search results, decide not to post, or reuse one artifact in multiple destinations. Use validated local result references, compiled into runtime dependencies. A later decision receives only real available artifact handles; a reference to an uncreated or wrong-type result is an error.

Do not force one giant plan for the whole turn. Allow bounded incremental decisions, including zero actions, multiple instances of the same action, and a continuation after a result. Keep common compositions declarative so the model is not burdened with constructing a graph for every message.

## Integration into the final reply

Represent a reply as ordered text and action blocks, rather than prose with hidden executable metadata. A draft block can contain its action intent directly, so placement is inherent and no separately invented anchor name is required. The compiler assigns the action/block relationship.

An illustrative order is: narration, a WhatsUp action block, then follow-up narration. After execution, code fills that action block with the actual message and attachment record. The phone screen and RP timeline derive their views from the same committed operation. Placement in the RP timeline is separate from the chosen delivery destination; displaying a DM card does not send an additional message.

For action-dependent prose, either execute before generating that prose or keep the draft provisional until success is known. A failed generation must not produce final narration asserting that the image was sent. On failure, insert an explicit failed-action state and, if needed, regenerate only the affected narrative segment from the actual result. Schema constraints cannot mechanically prevent all contradictions in free prose.

Translation, speaker marking and style passes operate on text fields only. They must not rewrite action types, entity references, ordering or result bindings. Historical prose is never reparsed as executable commands.

Caption enrichment is a dependent content operation attached to the known artifact. Its failure should normally leave a valid attachment usable, with optional fallback text. The LLM can describe the image; it should not have to restate which storage object receives the caption.

## Runtime, state and recovery

Put execution in a domain service independent of React. Electron main or a worker can own the service; no web server is required. Extract the present Comfy and app-state operations behind adapters. `useGraphRun` should coordinate UI state, not own command semantics and persistence across many parsers.

Persist operation records with backend-generated ID, save/branch/turn scope, validated arguments, dependencies, status, artifact references and delivery receipts. Suggested states: validated, running, artifact-ready, committed, failed, cancelled, and outcome-unknown where external completion is uncertain.

Use a journal and atomic local commit mechanism for the operation receipt and app-state projection. The precise store can follow the existing file-based design; a journal plus checkpoint needs recovery logic, while a transactional store is another implementation choice. Merely adding an in-memory map does not provide restart durability.

Retry delivery without regenerating its image. Make local commits idempotent by operation ID, not by command type or content hash: two intentional identical messages are still two operations. After a crash or timeout, reconcile provider job IDs before reissuing work where supported; do not promise exactly-once external image generation when the provider cannot guarantee it.

Define regeneration and editing explicitly. Regenerating prose preserves committed effects. Replacing an action creates a new action revision and supersedes or compensates the old local projection according to branch policy. Changing a historical turn must not silently resend all its messages. Cancellation prevents downstream commits, while already-produced artifacts can remain as unposted assets under an explicit retention policy.

## Migration

1. Add the canonical intent/result/block contracts, registry and runtime behind an opt-in workflow version. Adapt existing direct app commits and legacy parser outputs into these contracts; make the runtime the sole owner of effects for migrated runs.
2. Migrate image generation plus WhatsUp delivery/display first. Pass artifact references structurally and insert results deterministically. This removes the highest-risk handoff without requiring every action to migrate at once.
3. Add provider structured-response support and the compact decision stage. Keep the old marker protocol at an explicit compatibility boundary for saved workflows. Do not run both old and new executors for the same operation.
4. Migrate conversations, notes, banking, social comments and post flows. Share validators and records with direct UI actions. Preserve capability differences until the corresponding renderers support them.
5. Extend save formats for the operation journal and reply blocks, including import/export, branching and regeneration. Retire string-based metadata emission for migrated workflows; maintain read compatibility for historical saves.

## Verification required before implementation is considered complete

- A generated image is attached to the selected recipient even when narrative output omits all image references.
- Unknown action names and entity handles cannot execute; bounded correction receives useful errors.
- Two identical action types retain distinct identities and positions; intentional identical sends are not deduplicated.
- Image generation success followed by delivery failure retries delivery only.
- Restart after a local commit does not duplicate the message or transfer; uncertain provider completion is reconciled or exposed.
- An unavailable app capability is rejected before generating an expensive asset.
- Model-selected gallery-only generation remains unposted; inspecting a result does not force delivery.
- Wrong-type, stale, cross-save and unresolved artifact references fail validation.
- Cancellation, prose regeneration and action replacement follow their declared lifecycle policies.
- Translation and speaker passes cannot change attachments or execute commands embedded in text.
- Phone and RP views reference the same committed delivery; action-only replies are supported.
- Legacy workflow fixtures retain expected behavior without double execution.

Add a small evaluation corpus with long and distractor-heavy histories, tracking action selection separately from protocol validity, correct destination, missing attachments, duplicate effects, latency and model-call count. A shorter contract should reduce procedural load, but only measurement can establish improved model decision quality.

## Scope and supporting artifacts

This review focuses on command architecture, not a general security or supply-chain audit. The relevant trust boundary is model-produced control data: it must be validated before effects and kept distinct from arbitrary story text. Provider API behavior and runtime performance were not tested.

Static inventory artifacts: [inventory](repo_inventory.json), [map](repo_map.json), [corpus](repo_corpus.jsonl), [manifest](case_manifest.json). Automated mapping is supplemental; the findings above come from targeted manual source inspection. No application source was changed.
