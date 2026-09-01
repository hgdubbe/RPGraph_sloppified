import { describe, expect, it } from 'vitest';
import {
  LmStudioSseParser,
  lmStudioChatBody,
  lmStudioReasoningSetting,
  lmStudioReasoningStrength,
  lmStudioResponseText,
} from './lmStudioChat.cjs';

describe('LM Studio native chat adapter', () => {
  it('maps RPGraph reasoning levels to native LM Studio values', () => {
    expect(lmStudioReasoningSetting('auto')).toBeUndefined();
    expect(lmStudioReasoningSetting('none')).toBe('off');
    expect(lmStudioReasoningSetting('minimal')).toBe('low');
    expect(lmStudioReasoningSetting('medium')).toBe('medium');
    expect(lmStudioReasoningSetting('xhigh')).toBe('high');
    expect(lmStudioReasoningSetting('max')).toBe('high');
  });

  it('uses model capabilities for on/off-only reasoning models', () => {
    const profile = { allowedOptions: ['off', 'on'], defaultOption: 'on' };
    expect(lmStudioReasoningSetting('none', profile)).toBe('off');
    expect(lmStudioReasoningSetting('minimal', profile)).toBe('on');
    expect(lmStudioReasoningSetting('low', profile)).toBe('on');
    expect(lmStudioReasoningSetting('medium', profile)).toBe('on');
    expect(lmStudioReasoningSetting('high', profile)).toBe('on');
    expect(lmStudioReasoningSetting('xhigh', profile)).toBe('on');
    expect(lmStudioReasoningSetting('max', profile)).toBe('on');
  });

  it('rejects Off when the selected model requires reasoning', () => {
    expect(() => lmStudioReasoningSetting('none', {
      allowedOptions: ['low', 'medium', 'high'],
      defaultOption: 'medium',
    })).toThrow('cannot disable reasoning');
  });

  it('uses Muse Glimmer reasoning strength without native LM Studio reasoning', () => {
    const profile = {
      allowedOptions: [],
      exposesReasoning: false,
      supportsReasoningStrength: true,
    };
    expect(lmStudioReasoningSetting('low', profile)).toBeUndefined();
    expect(lmStudioReasoningStrength('none', profile)).toBe('low');
    expect(lmStudioReasoningStrength('minimal', profile)).toBe('low');
    expect(lmStudioReasoningStrength('low', profile)).toBe('low');
    expect(lmStudioReasoningStrength('medium', profile)).toBe('medium');
    expect(lmStudioReasoningStrength('high', profile)).toBe('high');
    expect(lmStudioReasoningStrength('xhigh', profile)).toBe('xhigh');
    expect(lmStudioReasoningStrength('max', profile)).toBe('xhigh');
    expect(lmStudioReasoningStrength('auto', profile)).toBeUndefined();
    expect(lmStudioChatBody({
      connection: { model: 'muse-glimmer-30b', reasoningEffort: 'low' },
      prompt: 'Hello',
    }, false, profile)).toEqual({
      model: 'muse-glimmer-30b',
      input: 'Hello',
      stream: false,
      store: false,
      system_prompt: 'Reasoning strength: low.',
    });
  });

  it('builds native text and image requests with Thinking disabled', () => {
    expect(lmStudioChatBody({
      connection: { model: 'test-model', reasoningEffort: 'none' },
      prompt: 'Describe this image.',
      images: [{ dataUrl: 'data:image/png;base64,AAAA' }],
      temperature: 1.5,
      topP: 0.9,
      maxTokens: 2048,
    }, true)).toEqual({
      model: 'test-model',
      input: [
        { type: 'text', content: 'Describe this image.' },
        { type: 'image', data_url: 'data:image/png;base64,AAAA' },
      ],
      stream: true,
      store: false,
      reasoning: 'off',
      temperature: 1,
      top_p: 0.9,
      max_output_tokens: 2048,
    });
  });

  it('extracts only final message output', () => {
    expect(lmStudioResponseText({
      output: [
        { type: 'reasoning', content: 'internal plan' },
        { type: 'message', content: 'Final ' },
        { type: 'message', content: 'answer' },
      ],
    })).toBe('Final answer');
  });

  it('can recover reasoning-only output when LM Studio mislabels an answer with reasoning disabled', () => {
    const result = {
      output: [
        { type: 'reasoning', content: 'Visible answer' },
      ],
    };

    expect(lmStudioResponseText(result)).toBe('');
    expect(lmStudioResponseText(result, { allowReasoningFallback: true })).toBe('Visible answer');
  });

  it('parses fragmented native streaming events', () => {
    const parser = new LmStudioSseParser();
    const first = parser.push(Buffer.from(
      'event: reasoning.delta\ndata: {"type":"reasoning.delta","content":"plan"}\n\n' +
      'event: message.delta\ndata: {"type":"message.delta","content":"Hel',
    ));
    const second = parser.push(Buffer.from(
      'lo"}\n\nevent: chat.end\ndata: {"type":"chat.end","result":{"stats":{' +
      '"input_tokens":4,"total_output_tokens":3,"reasoning_output_tokens":1}}}\n\n',
    ));

    expect([...first, ...second, ...parser.finish()]).toEqual([
      { type: 'reasoning.delta', payload: { type: 'reasoning.delta', content: 'plan' } },
      { type: 'message.delta', payload: { type: 'message.delta', content: 'Hello' } },
      {
        type: 'chat.end',
        payload: {
          type: 'chat.end',
          result: {
            stats: {
              input_tokens: 4,
              total_output_tokens: 3,
              reasoning_output_tokens: 1,
            },
          },
        },
      },
    ]);
  });
});
