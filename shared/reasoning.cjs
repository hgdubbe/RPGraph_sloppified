const efforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function normalizeReasoningCapabilities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = {};
  if (typeof value.mandatory === 'boolean') result.mandatory = value.mandatory;
  if (typeof value.default_enabled === 'boolean') result.defaultEnabled = value.default_enabled;
  if (efforts.includes(value.default_effort)) result.defaultEffort = value.default_effort;
  if (value.supported_efforts === null) result.supportedEfforts = null;
  else if (Array.isArray(value.supported_efforts)) {
    result.supportedEfforts = value.supported_efforts.filter((effort) => efforts.includes(effort));
  }
  return result;
}

function supportsReasoningEffort(effort, capabilities) {
  if (effort === 'auto' || !capabilities) return true;
  if (effort === 'on') return capabilities.supportedEfforts?.includes('on') === true;
  if (effort === 'none') return capabilities.mandatory !== true;
  if (capabilities.supportedEfforts === null) return true;
  return capabilities.supportedEfforts?.includes(effort) === true;
}

function normalizeReasoningEffort(effort, capabilities) {
  const selected = effort ?? 'none';
  return supportsReasoningEffort(selected, capabilities) ? selected : 'auto';
}

function fastTaskReasoningEffort(capabilities) {
  // Unknown remote capabilities must not force reasoning off.
  if (!capabilities) return 'auto';
  return [...efforts, 'on'].find((effort) => supportsReasoningEffort(effort, capabilities)) ?? 'auto';
}

function normalizeLmStudioReasoning(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.allowed_options)) return undefined;
  const options = value.allowed_options.filter((option) => ['off', 'on', 'low', 'medium', 'high'].includes(option));
  const supportedEfforts = options.map((option) => option === 'off' ? 'none' : option);
  const defaultEffort = value.default === 'off' ? 'none' : value.default;
  return {
    mandatory: !options.includes('off'),
    supportedEfforts,
    ...(supportedEfforts.includes(defaultEffort)
      ? { defaultEffort, defaultEnabled: defaultEffort !== 'none' } : {}),
  };
}

function normalizeOllamaReasoning(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.values)) return undefined;
  const hasNamedLevels = value.values.some((option) => typeof option === 'string');
  const mapOption = (option) => option === false ? 'none'
    : option === true ? (hasNamedLevels ? undefined : 'on')
    : efforts.includes(option) && option !== 'none' ? option : undefined;
  const supportedEfforts = [...new Set(value.values.map(mapOption).filter(Boolean))];
  const defaultEffort = mapOption(value.default);
  return {
    mandatory: !value.values.includes(false),
    supportedEfforts,
    ...(defaultEffort && supportedEfforts.includes(defaultEffort) ? { defaultEffort } : {}),
    ...(value.values.includes(value.default) ? { defaultEnabled: value.default !== false } : {}),
  };
}

function ollamaReasoningOptions(effort, capabilities) {
  const selected = normalizeReasoningEffort(effort, capabilities);
  if (selected === 'auto') return {};
  // Ollama's OpenAI API maps a valid effort to true for boolean-only models.
  return { reasoning: { effort: selected === 'on' ? 'low' : selected } };
}

function reasoningActivation(effort, capabilities) {
  if (!capabilities) return undefined;
  const selected = normalizeReasoningEffort(effort, capabilities);
  if (selected === 'auto') return capabilities.defaultEnabled;
  return selected !== 'none';
}

module.exports = { normalizeOllamaReasoning, ollamaReasoningOptions, normalizeLmStudioReasoning, reasoningActivation, normalizeReasoningCapabilities, supportsReasoningEffort, normalizeReasoningEffort, fastTaskReasoningEffort };
