# Staged Plan Compiler Boundary

S4 adds pure preflight in [compileTurnPlan.ts](../../src/staged-workflow/compileTurnPlan.ts) and managed planner instructions in [planPrompt.ts](../../src/staged-workflow/planPrompt.ts). It is not connected to the editor, providers or action executor. Existing `TurnPlan` remains the initial realized-reference sketch; `CompactTurnPlan` and `CompiledTurnPlan` explicitly represent unresolved future outputs without pretending they are stored revisions.

## Inputs and trust

`compileTurnPlan(input, options)` accepts complete JSON text or a decoded JSON object and returns `{ok, plan}` or `{ok:false, issues}`. Partial streaming JSON, fenced prose, unknown fields and guessed identity repairs are not accepted. Correction/provider schema integration belongs to later work.

Application options supply captured context, the store, catalog scope/revision/character IDs, limits, initiator, pure registered recipe definitions and an identity allocator. These are trusted backend APIs, not arbitrary renderer/model configuration. Recipe validators must check their family's real account/recipient/owner/destination identities, capabilities and permissions using trusted captured application data. The minimal common catalog is not an account-permission database. No production recipes are registered yet.

Recipes declare scalar authority argument types, exact named input kinds and a bounded list of stage templates. Each template selects external inputs or earlier recipe outputs. Content writers require a text instruction input and can only produce text. Only execute-action stages can declare receipts. Validators receive detached arguments and exact stored input records, including provenance; future inputs are explicit unresolved bindings with no invented observed state. A validator that requires an actual outcome must reject an unresolved input or use a later continuation. Validators must remain synchronous and effect-free.

The managed prompt lists only supplied model-eligible registrations. Direct user actions bypass this prompt: the application constructs their instances and supplies the trusted `directActions` manifest. The compiler requires matching instance count, aliases, recipes, actors and every explicit argument. No action can be added, omitted or retargeted. This boundary is ready for later direct-UI wiring; that wiring is not implemented.

## Plan and bindings

The model describes ordered recipe instances with a short `purpose`, actor, visibility, scalar `args`, named inputs and optional dependency entries. Repeated recipe types remain separate instances. Presentation beats independently select content/results and receipt requirements; an image output need not have its own visible beat. Empty instance/beat arrays are valid.

- Existing input: `{source:"variable", ref:{id,revision,kind,scope}}`. The compiler reads exactly that revision, checks type/scope/invalidation and verifies actor/audience access. It never substitutes a newer revision.
- Future input: `{source:"output", instanceId, output, kind}`. The compiler checks a declared producer/output, exact kind and visibility, then emits `{source:"output",stageId,outputId,kind}` using backend identities. It adds the typed producer dependency automatically. Explicit instance dependencies wait for all that instance's stages, including hidden actions.
- Compiled output: `{id,kind}` declares a future variable slot. It has no revision yet. `scene`, `beats` and `executionOrder` remain separate structures.

S6 must keep an output-ID-to-realized-reference map. After successful output validation, write the actual value using the declared ID/kind, stage producer, scope, visibility and exact consumed input revisions; then bind the returned revision. Before use, verify that mapping against the declared producer/output and recheck store validity/access. Never fabricate a revision, resolve by latest ID alone, or insert an unexecuted receipt. A failed/missing output blocks its dependents. Recheck current effect permissions in the shared executor later. Compiled argument snapshots must stay outside creative writer output handling.

## Bounds and remaining work

The parser limits serialized input to 262144 UTF-16 code units, 64 instances, 128 beats, 32 input/content references per slot collection and 128 explicit dependencies per instance. Recipes have at most 16 steps and compiled plans at most 256 stages. Application limits can lower hard ceilings of 128 beats, 128 model calls, 16 expensive generations and eight continuations. Calls count plan/content stages; expensive-generation costs are declared by trusted recipe templates. All expansions and cycles are checked before identity allocation. Continuation/retry cumulative budgets must also be enforced by S6; the compiler does not run continuation passes.

No variable is written and no app/provider effect occurs during compilation. Allocation failures return no partial plan, though the allocator may have consumed IDs. Recipe code and callers remain responsible for honoring the pure-validation contract. The compiler checks privacy conservatively and implements no declassification policy or system-actor recipe. Application-specific safe knowledge projections are needed before broader family rollout.

Focused verification covers valid expansion, arbitrary beat order, stored/future bindings, cross-instance ordering/cycles, shape and identity failures, exact direct arguments, scoped/private/invalidated inputs, recipe semantic checks, budgets and runtime-ID collisions. Durable receipts, output materialization, sequential execution, real family adapters, compositor and editor remain S5-S10 work.
