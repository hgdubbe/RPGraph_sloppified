export type ReasoningEffort = 'auto' | 'on' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ReasoningCapabilities = {
  mandatory?: boolean;
  defaultEnabled?: boolean;
  defaultEffort?: Exclude<ReasoningEffort, 'auto'>;
  supportedEfforts?: Exclude<ReasoningEffort, 'auto'>[] | null;
};
export function normalizeReasoningCapabilities(value: unknown): ReasoningCapabilities | undefined;
export function supportsReasoningEffort(effort: ReasoningEffort, capabilities?: ReasoningCapabilities): boolean;
export function normalizeReasoningEffort(effort: ReasoningEffort | undefined, capabilities?: ReasoningCapabilities): ReasoningEffort;
export function fastTaskReasoningEffort(capabilities?: ReasoningCapabilities): ReasoningEffort;

export function normalizeLmStudioReasoning(value: unknown): ReasoningCapabilities | undefined;
export function reasoningActivation(effort: ReasoningEffort | undefined, capabilities?: ReasoningCapabilities): boolean | undefined;

export function normalizeOllamaReasoning(value: unknown): ReasoningCapabilities | undefined;
export function ollamaReasoningOptions(effort: ReasoningEffort | undefined, capabilities?: ReasoningCapabilities): { reasoning?: { effort: string } };
