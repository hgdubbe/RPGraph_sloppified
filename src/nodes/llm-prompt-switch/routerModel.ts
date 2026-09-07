import type { SettingsValueDefinition, WorkflowNodeData } from '../../types';
import { resolveWorkflowVariables } from '../../workflow/variables';
import { assembleSections, splitPromptSections, validateSections, type PromptSections } from './promptSections';
import {
  llmPromptSwitchOutputTitles, llmPromptSwitchPromptTitlesByOutput,
  llmPromptSwitchPromptBeforesByOutput, llmPromptSwitchPromptAftersByOutput,
} from '../../workflow/nodeHelpers';

export type RouterRoute = {
  id: string;
  promptId: string;
  selector: number;
  title: string;
  before: string;
  after: string;
  sections?: PromptSections;
};
export type RouterOutput = {
  id: string;
  handle: string;
  selector: number;
  title: string;
  nextPromptSelector: number;
  disconnected: 'allow' | 'error';
  unused: boolean;
  routes: RouterRoute[];
};
export type ResponseRouterConfig = {
  version: 1;
  revision: number;
  policy: 'legacy' | 'strict';
  nextOutputSelector: number;
  outputs: RouterOutput[];
};

function newRoute(output: number | string, selector: number, title: string, before = '', after = ''): RouterRoute {
  return { id: `route-${output}-${selector}`, promptId: `prompt-${output}-${selector}`, selector, title, before, after };
}

export function migrateRouter(data: WorkflowNodeData): ResponseRouterConfig {
  if (data.responseRouter) return structuredClone(data.responseRouter);
  const titles = llmPromptSwitchPromptTitlesByOutput(data);
  const befores = llmPromptSwitchPromptBeforesByOutput(data);
  const afters = llmPromptSwitchPromptAftersByOutput(data);
  const outputs = llmPromptSwitchOutputTitles(data).map((title, selector) => ({
    id: `output-${selector}`, handle: `output-channel-${selector}`, selector, title,
    nextPromptSelector: titles[selector].length, disconnected: 'allow' as const, unused: false,
    routes: titles[selector].map((name, slot) => newRoute(selector, slot, name, befores[selector][slot], afters[selector][slot])),
  }));
  return { version: 1, revision: 0, policy: 'legacy', nextOutputSelector: outputs.length, outputs };
}

export function validateRouter(value: unknown): string[] {
  const errors: string[] = [];
  const record = (entry: unknown): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry);
  const integer = (entry: unknown): entry is number => Number.isSafeInteger(entry) && (entry as number) >= 0;
  if (!record(value) || value.version !== 1 || !integer(value.revision) ||
      !integer(value.nextOutputSelector) || !['legacy', 'strict'].includes(String(value.policy)) ||
      !Array.isArray(value.outputs) || !value.outputs.length || value.outputs.length > 10) {
    return ['Invalid Response Router configuration.'];
  }
  const ids = new Set<string>();
  const handles = new Set<string>();
  const outputs = new Set<number>();
  function unique(set: Set<string>, id: unknown, label: string) {
    if (typeof id !== 'string' || !id.trim()) errors.push(`Missing ${label}.`);
    else if (set.has(id)) errors.push(`Duplicate ${label}: ${id}.`);
    else set.add(id);
  }
  for (const output of value.outputs) {
    if (!record(output) || !integer(output.selector) || !integer(output.nextPromptSelector) ||
        typeof output.title !== 'string' || typeof output.unused !== 'boolean' ||
        !['allow', 'error'].includes(String(output.disconnected)) || !Array.isArray(output.routes) ||
        !output.routes.length || output.routes.length > 10) {
      errors.push('Invalid output group.'); continue;
    }
    unique(ids, output.id, 'output ID'); unique(handles, output.handle, 'output handle');
    if (outputs.has(output.selector)) errors.push(`Duplicate output selector ${output.selector}.`);
    outputs.add(output.selector);
    if (output.selector >= value.nextOutputSelector) errors.push('Output allocator would reuse a selector.');
    const slots = new Set<number>();
    for (const route of output.routes) {
      if (!record(route) || !integer(route.selector) || typeof route.title !== 'string' ||
          typeof route.before !== 'string' || typeof route.after !== 'string') {
        errors.push('Invalid route.'); continue;
      }
      unique(ids, route.id, 'route ID'); unique(ids, route.promptId, 'prompt ID');
      if (route.sections !== undefined) {
        const issues = validateSections(route.sections);
        errors.push(...issues);
        if (!issues.length) {
          const assembled = assembleSections(route.sections as PromptSections);
          if (assembled.before !== route.before || assembled.after !== route.after) errors.push('Prompt sections and assembled text disagree.');
        }
      }
      if (slots.has(route.selector)) errors.push(`Duplicate pair (${output.selector}, ${route.selector}).`);
      slots.add(route.selector);
      if (route.selector >= output.nextPromptSelector) errors.push('Prompt allocator would reuse a selector.');
    }
  }
  return errors;
}

export function isResponseRouterConfig(value: unknown): value is ResponseRouterConfig {
  return validateRouter(value).length === 0;
}

export function assemblePrompt(route: RouterRoute, input: string, definitions: SettingsValueDefinition[], values: Record<string, string>) {
  const text = route.sections ? assembleSections(route.sections) : route;
  const promptBefore = resolveWorkflowVariables(text.before, definitions, values);
  const promptAfter = resolveWorkflowVariables(text.after, definitions, values);
  return { promptBefore, promptAfter, combinedPrompt: [promptBefore.trim(), input, promptAfter.trim()].filter(Boolean).join('\n\n') };
}

export function resolveRoute(config: ResponseRouterConfig, rawOutput: string, rawPrompt: string) {
  const errors = validateRouter(config);
  if (errors.length) throw new Error(errors.join(' '));
  let outputValue = Number(rawOutput.trim());
  let promptValue = Number(rawPrompt.trim());
  if (config.policy === 'strict') {
    if (!rawOutput.trim() || !rawPrompt.trim() || !Number.isSafeInteger(outputValue) ||
        !Number.isSafeInteger(promptValue) || outputValue < 0 || promptValue < 0) {
      throw new Error('Selectors must be nonnegative exact integers.');
    }
  } else {
    outputValue = Number.isFinite(outputValue)
      ? Math.min(Math.max(...config.outputs.map((output) => output.selector)), Math.max(0, Math.trunc(outputValue))) : 0;
    promptValue = Number.isFinite(promptValue) ? Math.trunc(promptValue) : 0;
  }
  const output = config.outputs.find((entry) => entry.selector === outputValue);
  if (!output) throw new Error(`No route matches output ${rawOutput}, prompt ${rawPrompt}.`);
  const exact = output.routes.find((route) => route.selector === promptValue);
  const route = exact ?? (config.policy === 'legacy' ? output.routes.find((entry) => entry.selector === 0) : undefined);
  if (!route) throw new Error(`No route matches (${outputValue}, ${promptValue}).`);
  return { output, route, fallback: !exact || outputValue !== Number(rawOutput) || route.selector !== Number(rawPrompt) };
}

// The existing prompt tools edit matrix-shaped fields. Translate those edits once
// at their boundary; runtime and persistence use stable records exclusively.
export function applyLegacyRouterPatch(data: WorkflowNodeData, patch: Partial<WorkflowNodeData>): ResponseRouterConfig {
  const config = migrateRouter(data);
  const selectedOutput = data.llmPromptSwitchSelectedOutputChannel ?? 0;
  const selectedPrompt = data.llmPromptSwitchSelectedPromptSlot ?? 0;
  const outputTitles = patch.llmPromptSwitchOutputTitles;
  if (outputTitles && outputTitles.length < config.outputs.length) config.outputs.splice(selectedOutput, 1);
  if (outputTitles) {
    while (config.outputs.length < outputTitles.length) {
      const selector = config.nextOutputSelector++;
      config.outputs.push({ id: `output-${selector}`, handle: `output-channel-${selector}`, selector,
        title: '', nextPromptSelector: 1, disconnected: 'allow', unused: false,
        routes: [newRoute(selector, 0, 'Default Prompt')] });
    }
  }
  config.outputs.forEach((output, outputIndex) => {
    output.title = outputTitles?.[outputIndex] ?? output.title;
    const titles = patch.llmPromptSwitchPromptTitlesByOutput?.[outputIndex];
    if (titles && titles.length < output.routes.length) output.routes.splice(selectedPrompt, 1);
    if (titles) {
      while (output.routes.length < titles.length) {
        output.routes.push(newRoute(output.id, output.nextPromptSelector++, ''));
      }
    }
    output.routes.forEach((route, slot) => {
      route.title = titles?.[slot] ?? route.title;
      const before = patch.llmPromptSwitchPromptBeforesByOutput?.[outputIndex]?.[slot] ?? route.before;
      const after = patch.llmPromptSwitchPromptAftersByOutput?.[outputIndex]?.[slot] ?? route.after;
      if (route.sections && (route.before !== before || route.after !== after)) route.sections = splitPromptSections(before, after);
      route.before = before;
      route.after = after;
    });
  });
  config.revision++;
  return config;
}

const matrixFields = ['llmPromptSwitchOutputTitles', 'llmPromptSwitchPromptTitlesByOutput', 'llmPromptSwitchPromptBeforesByOutput', 'llmPromptSwitchPromptAftersByOutput'] as const;

export function routerAwarePatch(data: WorkflowNodeData, patch: Partial<WorkflowNodeData>): Partial<WorkflowNodeData> {
  if (data.nodeType !== 'llm-prompt-switch' || patch.responseRouter || !matrixFields.some((field) => patch[field] !== undefined)) return patch;
  return { ...patch, responseRouter: applyLegacyRouterPatch(data, patch) };
}
