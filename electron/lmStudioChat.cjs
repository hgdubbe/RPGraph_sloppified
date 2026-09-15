const supportedReasoningEfforts = new Set([
  'auto',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

function lmStudioReasoningSetting(effort, profile) {
  if (!supportedReasoningEfforts.has(effort) || effort === 'auto') {
    return undefined;
  }
  if (profile?.exposesReasoning === false) {
    return undefined;
  }
  const allowedOptions = Array.isArray(profile?.allowedOptions)
    ? profile.allowedOptions.filter((option) => ['off', 'on', 'low', 'medium', 'high'].includes(option))
    : [];
  if (effort === 'none') {
    if (allowedOptions.length > 0 && !allowedOptions.includes('off')) {
      throw new Error('The selected LM Studio model cannot disable reasoning.');
    }
    return 'off';
  }
  const requested = effort === 'minimal'
    ? 'low'
    : effort === 'xhigh' || effort === 'max'
      ? 'high'
      : effort;
  if (allowedOptions.length === 0 || allowedOptions.includes(requested)) {
    return requested;
  }
  if (profile?.defaultOption && profile.defaultOption !== 'off' && allowedOptions.includes(profile.defaultOption)) {
    return profile.defaultOption;
  }
  const fallback = ['on', 'high', 'medium', 'low'].find((option) => allowedOptions.includes(option));
  if (!fallback) {
    throw new Error('The selected LM Studio model cannot enable reasoning.');
  }
  return fallback;
}

function lmStudioReasoningStrength(effort, profile) {
  if (!profile?.supportsReasoningStrength || !supportedReasoningEfforts.has(effort) || effort === 'auto') {
    return undefined;
  }
  if (effort === 'none' || effort === 'minimal' || effort === 'low') {
    return 'low';
  }
  if (effort === 'xhigh' || effort === 'max') {
    return 'xhigh';
  }
  return effort;
}

function lmStudioChatInput(prompt, images) {
  const validImages = Array.isArray(images)
    ? images.filter((image) => image && typeof image.dataUrl === 'string' && image.dataUrl)
    : [];
  if (validImages.length === 0) {
    return prompt;
  }
  return [
    { type: 'text', content: prompt },
    ...validImages.map((image) => ({ type: 'image', data_url: image.dataUrl })),
  ];
}

function lmStudioChatBody(request, stream = false, reasoningProfile) {
  const reasoning = lmStudioReasoningSetting(
    request?.connection?.reasoningEffort,
    reasoningProfile,
  );
  const body = {
    model: request?.connection?.model,
    input: lmStudioChatInput(request?.prompt, request?.images),
    stream,
    store: false,
  };
  if (reasoning !== undefined) {
    body.reasoning = reasoning;
  }
  const reasoningStrength = lmStudioReasoningStrength(
    request?.connection?.reasoningEffort,
    reasoningProfile,
  );
  if (reasoningStrength !== undefined) {
    body.system_prompt = `Reasoning strength: ${reasoningStrength}.`;
  }
  if (typeof request?.temperature === 'number' && Number.isFinite(request.temperature)) {
    body.temperature = Math.min(1, Math.max(0, request.temperature));
  }
  if (typeof request?.topP === 'number' && Number.isFinite(request.topP)) {
    body.top_p = Math.min(1, Math.max(0, request.topP));
  }
  if (Number.isInteger(request?.maxTokens) && request.maxTokens > 0) {
    body.max_output_tokens = request.maxTokens;
  }
  return body;
}

function lmStudioResponseText(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.output)) {
    return '';
  }
  const messageText = result.output
    .filter((item) => item && item.type === 'message' && typeof item.content === 'string')
    .map((item) => item.content)
    .join('');
  return messageText;
}

class LmStudioSseParser {
  constructor() {
    this.decoder = new TextDecoder();
    this.buffer = '';
    this.eventName = '';
    this.dataLines = [];
  }

  consumeEvent() {
    if (this.dataLines.length === 0) {
      this.eventName = '';
      return [];
    }
    const rawData = this.dataLines.join('\n');
    this.dataLines = [];
    let payload;
    try {
      payload = JSON.parse(rawData);
    } catch (error) {
      throw new Error(`LM Studio returned invalid streaming JSON: ${error.message}`, { cause: error });
    }
    const type = payload && typeof payload === 'object' && typeof payload.type === 'string'
      ? payload.type
      : this.eventName;
    this.eventName = '';
    return [{ type, payload }];
  }

  consumeLine(line) {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!normalized) {
      return this.consumeEvent();
    }
    if (normalized.startsWith('event:')) {
      this.eventName = normalized.slice(6).trim();
    } else if (normalized.startsWith('data:')) {
      this.dataLines.push(normalized.slice(5).trimStart());
    }
    return [];
  }

  push(chunk) {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const events = [];
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      events.push(...this.consumeLine(line));
      newlineIndex = this.buffer.indexOf('\n');
    }
    return events;
  }

  finish() {
    this.buffer += this.decoder.decode();
    const events = [];
    if (this.buffer) {
      for (const line of this.buffer.split(/\n/)) {
        events.push(...this.consumeLine(line));
      }
      this.buffer = '';
    }
    events.push(...this.consumeEvent());
    return events;
  }
}

module.exports = {
  LmStudioSseParser,
  lmStudioChatBody,
  lmStudioReasoningSetting,
  lmStudioReasoningStrength,
  lmStudioResponseText,
};
