import { afterEach, expect, it, vi } from 'vitest';
import { createComfyImageRunner } from './comfyImageRunner';
import { defaultConnection } from '../settings';
import { normalizeRpStorybook, parseRpStorybookJson, rpStorybookJsonText } from '../nodes/rp-storybook/model';
import { storybookCreateImageCharactersFromNodes } from '../storybook/runtime';
import type { WorkflowNode } from '../types';

// Image decoding uses a browser canvas; test the generation/storage pipeline without a UI.
vi.mock('../utils/imageNormalization', () => ({
  encodedDataUrlBytes: () => 3,
  normalizeImageAttachment: async (image: { dataUrl: string }, id: () => string) => ({
    ...image, id: id(), mimeType: 'image/jpeg', dataUrl: image.dataUrl.replace('image/png', 'image/jpeg'),
  }),
}));
afterEach(() => vi.unstubAllGlobals());

it('stores successive OpenRouter images in the phone gallery without local model management', async () => {
  const book = normalizeRpStorybook({ characters: [{ id: 'alice', name: 'Alice',
    comfyConfig: { appearance: 'Short red hair', loraName: 'alice.safetensors' } }] });
  const node = { id: 'book', type: 'workflow', position: { x: 0, y: 0 },
    data: { nodeType: 'rp-storybook', label: 'Storybook', storybookJson: rpStorybookJsonText(book) } } as WorkflowNode;
  const owner = storybookCreateImageCharactersFromNodes([node])[0];
  expect(owner.name).toBe('Alice');
  const connection = { ...defaultConnection, id: 'images', providerKind: 'openrouter' as const,
    baseUrl: 'https://openrouter.ai/api/v1', model: 'image-model' };
  const generate = vi.fn()
    .mockResolvedValueOnce({ images: ['data:image/png;base64,b25l'] })
    .mockResolvedValueOnce({ images: ['data:image/png;base64,dHdv'] });
  // No ComfyUI or local lifecycle methods: using them would fail this test.
  vi.stubGlobal('window', { rpgraph: { generateOpenRouterImages: generate } });
  const update = vi.fn();
  const resolveConnection = vi.fn();
  const runner = createComfyImageRunner({ getNodes: () => [node], connections: [defaultConnection, connection],
    providerHealthById: { images: { status: 'online', capabilities: { image: true } } },
    llm: { supportsVision: vi.fn().mockResolvedValue(false), complete: vi.fn(), resolveConnection },
    updateRuntimeNode: update,
  });
  const first = await runner({ phoneOwnerName: 'Alice', prompt: 'Portrait', comfyProviderId: 'images' }, vi.fn());
  const second = await runner({ phoneOwnerName: 'Alice', prompt: 'Landscape', comfyProviderId: 'images' }, vi.fn());
  expect(first.images[0].dataUrl).toBe('data:image/jpeg;base64,b25l');
  expect(second.images[0].dataUrl).toBe('data:image/jpeg;base64,dHdv');
  const saved = parseRpStorybookJson(update.mock.calls[update.mock.calls.length - 1][1].storybookJson);
  expect(saved.characters[0].images.map((image) => image.dataUrl)).toEqual([
    'data:image/jpeg;base64,b25l', 'data:image/jpeg;base64,dHdv',
  ]);
  expect(resolveConnection).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({ connection, prompt: 'Portrait' }));
});
