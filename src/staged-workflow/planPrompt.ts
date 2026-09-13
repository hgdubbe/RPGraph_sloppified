import { maxPlanCharacters, validatePlanEnvironment, type CompileOptions } from './compileTurnPlan';

export type PlanPromptIssue = { path: string; message: string };

/** A later round's context (round 2+ of one turn — see runLiveStagedTurn.ts's round loop):
 * `summary` describes what already happened in earlier rounds this turn, and `roundsRemaining`
 * is how many further continuations are still available after this one. */
export type PlanPromptContinuation = { summary: string; roundsRemaining: number };

/** Managed compact-plan instructions only. Selected context values are supplied by the later runner.
 * `feedback`, when supplied, are the compiler issues from a prior rejected attempt this turn (see
 * the compile-failed retry loop in runLiveStagedTurn) — surfaced so the model can see exactly what
 * was wrong instead of repeating the same mistake. `continuation`, when supplied, means this plan
 * is round 2+ of the same turn (see `PlanPromptContinuation`). Both sections are kept before the
 * trailing JSON payload line, since every caller of this prompt (live and test) locates that
 * payload as the prompt's last line. */
export function buildPlanPrompt(options: CompileOptions, feedback?: PlanPromptIssue[], continuation?: PlanPromptContinuation): string {
  if (options.initiator === 'direct-user') throw new Error('Direct user actions bypass speculative planning.');
  validatePlanEnvironment(options);
  const recipes = options.recipes.filter((r) => r.initiators.includes('model')).map((r) => ({
    id: r.id, description: r.description, arguments: r.arguments, inputs: r.inputs,
    outputs: r.steps.map((s) => ({ key: s.key, kind: s.output })),
  }));
  return [
    'Return one complete JSON compact plan, version "staged-v1". No prose, executable code, final drafts or future artifact IDs.',
    'Shape: {version, catalogRevision, continuations, instances:[], beats:[]}. All fields are required; no extra fields.',
    '"continuations" is how many additional plan+run rounds you want after this one, if the whole scene does not fit in this one round — set it to 0 if this plan finishes the scene. The JSON payload\'s own "limits.continuations" is the most rounds you may still request beyond this one; requesting more than that is rejected.',
    'Each instance: {id, recipe, purpose, actorId, visibility, args, inputs, dependencies:[]}. Purpose describes scene intent (512 characters max), not final prose. Local IDs use letters, digits, underscores or hyphens and start with a letter (64 characters max).',
    'Use only registered recipes, exact character IDs, declared scalar arguments and named inputs. Arguments are locked before writers run.',
    'Each input/content reference is {source:"variable",ref:{id,revision,kind,scope:{saveId,branchId,turnId}}} for an existing exact revision, or {source:"output",instanceId,output,kind} for a declared future recipe output.',
    'Each explicit dependency is {instanceId,kind}, with kind content, artifact, state, observation, presentation or user-input. Output references also create dependencies. No cycles.',
    'Each beat: {id,visibility,content:[],requiresReceipts:[],speakerId?}. Receipt requirements must reference receipts. Order beats freely; execution order follows dependencies. Outputs need not have a visible beat.',
    'Visibility is {kind:"system"}, {kind:"shared"}, or {kind:"characters",characterIds:[]}. Do not broaden private inputs or assume that contact permission grants knowledge.',
    'One creative component per generated output. Success-dependent content must consume the actual receipt. Choices wait for real user input.',
    `Maximum serialized plan characters: ${maxPlanCharacters}. Calls and generations count the full recipe expansion.`,
    ...(feedback?.length ? [
      'Your previous plan was rejected by the compiler for these exact problems. Return a corrected complete plan that fixes every one of them:',
      feedback.map((issue) => `  - [${issue.path}] ${issue.message}`).join('\n'),
    ] : []),
    ...(continuation ? [
      'This is a continuation of the same turn — earlier rounds already ran for real. Do not repeat or contradict what already happened; plan only what comes next.',
      `Already happened this turn: ${continuation.summary}`,
      continuation.roundsRemaining > 0
        ? `You may request up to ${continuation.roundsRemaining} more continuation round(s) after this one if the scene still is not finished.`
        : 'This is the last round available — set continuations to 0 and finish the scene now.',
    ] : []),
    JSON.stringify({ catalogRevision: options.catalog.revision, characterIds: options.catalog.characterIds,
      context: options.context, limits: options.limits, recipes }),
  ].join('\n');
}
