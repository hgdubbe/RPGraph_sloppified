# Staged Workflow Implementation Handoff

## User Request And Authority

This handoff comes from the side conversation with the owner of RPGraph. The user developed the design below, requested an exact implementation plan, then explicitly requested: "back up the current branch, then hand this over to the main chat".

No staged-workflow implementation was performed in the side conversation. Only read-only source inspection, the requested backup and this handoff were performed. The next implementation should follow this design rather than investing primarily in repairing giant model-authored action envelopes.

## Verified Backup

- Working directory: `C:\Users\hen\Documents\ChatGPT\rpgraph\.worktrees\code-quality-cleanup`
- Working branch remains `codex/code-quality-cleanup`.
- Original HEAD remains `7ec463329279566c9ec5313466c258e110ca02ff`.
- Backup branch: `codex/backup-before-staged-workflow-20260909-172845`
- Backup commit: `a81a5194187a269f80edeb97df6c5000cbb13002`
- Independent bundle: `C:\Users\hen\Documents\ChatGPT\rpgraph-backups\20260909-172845\rpgraph-before-staged-workflow.bundle`
- `git bundle verify` passed and reported complete history.

The backup captures tracked files and non-ignored untracked files, including accumulated uncommitted source changes, through a temporary alternate index. The working branch, real staging index and working files were not switched/reset/committed. Ignored dependencies, build output, external service state and external RPGraph profiles/sessions are not included. This is a source backup, not a machine/profile backup.

To inspect or recover, create a separate worktree from the backup ref, or clone the bundle into a new directory and select its named backup branch. Do not reset the active worktree. The current dirty work is intentional and must be preserved.

## Exact User Intent

The user wants a flexible workflow that stores usable data in variables, generates each content component in its own LLM run using selected variables, and composes the user-facing reply in the backend. There must be no final giant JSON-writing LLM call.

Initial variables are GH (history), LM (latest messages/input), OC (overall authoritative context), I (stage-specific instructions), and plan. Save generated drafts, visual briefs, prompts, images/audio references and actual action receipts as further typed variables.

The user explicitly rejected fixed narration/action/subaction layouts. A valid presentation is message -> narration -> message with image -> narration -> message. Other actions must fit equally well: bank transfers, social posts/comments, notes, assistant interactions, voice, display/control operations, etc.

Separate three structures:

1. Scene plan: intended events, purposes, participants and knowledge.
2. Presentation sequence: ordered beats seen by the user, allowing repeated/arbitrary beat types.
3. Dependency graph: content/artifact/state/observation/user-input prerequisites for drafting or execution.

An action can produce data without a separate visible beat. An image can appear only as an attachment; image storage is not automatically narration. A receipt can project into phone and RP views without executing the operation twice.

## Architecture And Files

Add an opt-in `Staged Workflow v1` beside existing Legacy and Structured v1. Do not silently change existing imports.

Proposed new directory: `src/staged-workflow/`. Recheck names and boundaries against current code before creating files; these are design targets, not existing modules.

### Step 1: Contracts

Create `contracts.ts`:

- TurnContext: immutable GH/LM/OC, instruction references and authoritative catalog revision.
- VariableRecord: identity, typed value/reference, producer, revision, scope, visibility and retention.
- StageDefinition: registered kind, selected variable inputs, declared outputs, dependencies, instructions and optional provider.
- BeatDefinition: ordered presentation slot, speaker, content/result references and visibility.
- TurnPlan: stages, beats, locked arguments, limits and context revision.

Stage kinds: retrieve, plan, generate-content, execute-action, compose, await-user. The backend assigns persistent identities. Planner-local aliases cannot refer to arbitrary executable code or invented capabilities.

Acceptance: round-trip contracts, unknown-stage rejection and typed reference checks. No effects.

### Step 2: Variables

Create `variableStore.ts`. Support text, facts, entity references, artifact references and receipts. Binary media stays in existing asset storage. Do not duplicate base64 into every stage variable.

Use immutable revisions, e.g. message.b3.text@1 and image.b3.artifact@1. Record exact input revisions. Draft edits invalidate dependent uncommitted outputs only. Never automatically replay committed effects.

Keep typed turn variables separate from existing string-valued workflow variables. Persist completed turn data and deliberately promoted memories. Intermediate drafts need retention limits; "all usable data" does not mean unlimited permanent duplication. Generated statements cannot silently become authoritative state.

Acceptance: revision invalidation, scope isolation, no dangling references and no cross-character disclosure.

### Step 3: Context Builder

Create `contextBuilder.ts`. Reuse history/storybook/phone/context facilities; capture one turn snapshot and expose GH/LM/OC views. Apply character knowledge/access filtering before prompt construction.

Visual prompts receive appearance, clothing, setting, framing, intended event and the actual associated draft. Banking uses authoritative accounts/amounts. Distinguish observed facts, summaries and speculative generated content. Refresh permissions at effect boundaries.

Acceptance: context selection/provenance tests and private-message visibility cases.

### Step 4: Planner And Compiler

Create `planPrompt.ts` and `compileTurnPlan.ts`. The planner outputs a compact plan, not final prose or final executable JSON. Direct user actions bypass speculative planning and retain the user's explicit arguments.

Resolve identities, enforce permissions, expand registered recipes, type-check variable references and reject dependency cycles. Bound beats, calls, continuation passes and expensive generations. Lock sender/recipient/amount/owner/destination before writers run.

Acceptance: invalid plans perform no effects; content stages cannot override locked arguments. An ordered list of instances replaces booleans such as message_planned, allowing multiple messages/images/recipients.

### Step 5: Action Recipes

Each recipe declares permitted initiators, authoritative inputs, creative fields/stages, validators, executor, result schema, presentation options and retry policy.

| Family | Creative stages | Backend work |
| --- | --- | --- |
| Narration / character speech | One call per requested component | Speaker and beat placement |
| Messenger send | Message text; annotation if requested | Participants, app, conversation and commit |
| Messenger exchange | One call per message, informed by relevant prior outputs | Order and individual identities |
| Voice message | Spoken text; optional voice direction | Voice support, audio generation, storage and delivery |
| Image lookup / display | Optional query interpretation | Accessible catalog search, selection validation and display |
| Image generation | Visual brief when useful; image prompt | Generation, storage, owner and actual artifact binding |
| Image description / caption | Vision-grounded description or caption revision | Read/update authorization and exact target |
| Social post | Body/caption and optional media stages | Account, audience, post and artifact commit |
| Social comment/reply | Text based on actual target content | Post/thread identity and commit |
| Notes | Title/body components when required | Authorized creation, update or deletion |
| Simulated assistant | Question if needed; separate answer run | Owner-specific context and chat storage |
| Simulated bank transfer | Optional note text | Accounts, amount validation, balances and ledger |
| Choices / information | Labels/explanations | Valid destinations and state-derived numeric data |
| UI / workflow controls | Normally none | Explicitly authorized state/navigation changes |

Preserve app differences: WhatsUp capabilities do not establish Fotogram/OnlyFriends attachment or voice support. Preserve direct-user-only restrictions in current note/assistant commit paths. Events, reactions and future actions require registered tested adapters before advertisement; their presence in a UI does not imply a model-executable operation.

### Step 6: Scheduler And Content Runner

Create `scheduler.ts` and `contentRunner.ts`. Use existing NodeLlmApi so cancellation, usage, provider and call diagnostics remain shared. Each creative component has its own request, selected variable inputs and instructions.

States: pending, ready, running, succeeded, failed, cancelled, blocked. Distinguish dependencies for content, artifact, state, observation, presentation and user input.

Start sequentially for correctness. Later permit bounded parallel drafting where genuinely independent; GPU-heavy operations default to one concurrent call. Parallel drafts do not authorize parallel side effects. A character can react only to information they have observed.

Bounded continuation checkpoints may extend/revise only uncommitted future beats using actual outcomes. Choices pause for user input; do not generate an assumed choice.

Acceptance: deterministic ordering, cancellation, cycle rejection, no ahead-of-sequence effects, independent draft retry and budgets.

### Step 7: Single Executor And Composer

Extract a typed prepared-plan entry point from existing src/actions/runtime.ts. Both existing JSON compilation and staged compilation must feed the same execution machinery. Extend adapters, not a competing effect engine.

Create `composeReply.ts` to walk beats and resolve variable/receipt references. No final creative LLM assembly call. Use structural references instead of literal placeholder replacement in arbitrary prose.

For example: message A; narration A; message B with generated artifact X; narration B; message C. Generation of X can occur earlier but does not create an extra visible beat. Success-dependent narration waits for receipts. If a later message reacts to the actual image, insert an inspection stage.

Acceptance: mixed action order, same-receipt phone/RP rendering, no duplicate send, and no successful narration for failed operations.

### Step 8: Durable Recovery

Persist the approved plan, variable revisions, stage attempts and operation records through the existing session persistence boundary. Record intent before invoking effects and receipt afterward.

Restore drafts after restart. Reconcile interrupted effects; do not blindly repeat operations with uncertain outcomes. Reuse a completed image when only delivery fails. Do not claim whole-turn atomicity across external generators.

Regeneration creates a draft branch referencing existing receipts. Changing committed world state requires explicit branch policy, not automatic replay. Retain current regeneration restrictions until proven safe.

### Step 9: Editor And Migration

Add versioned staged configuration to applicable router routes and an output execution-mode selector. Reuse ResponseRouterCard/PromptSectionEditor patterns. Expose creative instructions, input-variable selection, output labels, model and limits; technical identity/schema plumbing stays read-only.

Provide ordered-beat and dependency inspectors with stage results, provenance and retry controls. Keep Apply-style draft semantics. Offer migration preview; preserve originals. Deliver an importable staged baseline only after full tests pass.

### Step 10: Rollout Gates

Implement in order: contracts/store -> context/compiler -> fake-adapter scheduler -> narration/messages/images -> social/voice -> notes/assistant/banking -> displays/controls -> durable recovery/editor migration.

Each recipe requires success, missing input, denied access, cancellation, failure, duplicate prevention and receipt consistency tests. Test mixed scenes, not only single actions.

First mixed acceptance scene: message -> narration -> bank receipt -> message with generated image -> social comment -> narration. Ensure every creative component was generated separately and every useful output is inspectable as a variable. Failure/retry must not repeat effects.

## Existing Integration Points Inspected

Paths below are relative to the active worktree:

- src/llm/NodeLlmApi.ts and src/llm/types.ts: shared content request pipeline.
- src/nodes/shared/promptRun.ts: current combined planning/final response path to refactor behind the new opt-in.
- src/nodes/runScratch.ts: history/character memoization and existing image runner. Reuse rather than duplicating providers.
- src/actions/contracts.ts, schema.ts, compileReply.ts, runtime.ts, executionRegistry.ts and liveBridge.ts: preserve validation/execution ownership and image/message adapters.
- src/app/useGraphRun.ts: current actionBridge creation and executeGraph/parseActionReply handoff; delegate new orchestration to modules rather than expanding the hook substantially.
- src/chat/directAppActions.ts, outputActions.ts and phoneAppsSessions.ts: direct operations and authorization boundaries.
- src/app/socialOutputCommits.ts and useDirectAppActions.ts: social and direct-app integration.
- src/nodes/shared/promptActions.ts and promptCommands.ts: legacy operation inventory and compatibility.
- src/nodes/llm-prompt-switch/ResponseRouterCard.tsx and PromptSectionEditor.tsx: editor integration.
- src/types.ts: existing workflowVariables are string-valued; do not silently repurpose them as the typed store.

## Parent Roadmap Context And Cautions

Read docs/superpowers/plans/2026-09-06-code-quality-cleanup.md, docs/review/action-runtime-progress.md and docs/guides/action-schema-contract.md before implementation. Incorporate this plan with explicit remaining boundaries, not by marking H4-H7 complete.

Keep schema-constrained output for compact plans where supported; the design removes large combined content/action envelopes, not all small structured contracts. Bounded correction belongs primarily at planning/individual-content validation, before effects.

Parent history reported 269 unit tests, five Electron tests, build and lint passing at its checkpoint. These are historical results, not fresh verification by the side conversation. The corrected nested Unsloth schema still required live validation at that checkpoint; recheck current state rather than assuming the model is loaded.

A prior provider UI fixture could unload the user's real model during teardown. Never restart/unload services or run destructive live-provider tests casually. Isolate test settings/endpoints and teardown. Use bundled Node 24.19.0 when the default PATH supplies Node 22.22.0. Do not reset or overwrite dirty work.
