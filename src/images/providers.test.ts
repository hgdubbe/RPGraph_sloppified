import { afterEach, expect, it, vi } from 'vitest';
import { defaultConnection } from '../settings';
import { generateApiImages, isImageGenerationConnection } from './providers';
import { openRouterCapabilitiesForConnection } from '../app/providerCapabilities';

const connection = { ...defaultConnection, providerKind: 'openrouter' as const, model: 'image-model' };
afterEach(() => vi.unstubAllGlobals());

it('requires image output rather than vision input for OpenRouter selection', () => {
  expect(isImageGenerationConnection(connection, { status: 'online', capabilities: { vision: true, text: true } })).toBe(false);
  expect(isImageGenerationConnection(connection)).toBe(false);
  expect(isImageGenerationConnection(connection, { status: 'online', capabilities: { image: true } })).toBe(true);
  expect(isImageGenerationConnection({ ...connection, model: '' }, { status: 'online', capabilities: { image: true } })).toBe(false);
  expect(isImageGenerationConnection({ ...connection, kind: 'comfyui', comfyRole: 'voice' })).toBe(false);
  expect(isImageGenerationConnection({ ...connection, kind: 'comfyui', comfyRole: 'image' })).toBe(true);
});

it('removes image capability when a different model is selected', () => {
  const models = [{ id: 'image-model', name: 'Image', image: true, vision: false, inputModalities: ['text'],
    outputModalities: ['image'], supportedVoices: [], supportedParameters: [] }];
  expect(openRouterCapabilitiesForConnection(connection, models).image).toBe(true);
  expect(openRouterCapabilitiesForConnection({ ...connection, model: 'text-model' }, models).image).toBe(false);
});

it('routes API generation without invoking local model management', async () => {
  const generate = vi.fn().mockResolvedValue({ images: ['data:image/png;base64,cG5n'] });
  vi.stubGlobal('window', { rpgraph: { generateOpenRouterImages: generate } });
  const request = { connection, prompt: 'Portrait', width: 1024, height: 1024 };
  await expect(generateApiImages(request)).resolves.toEqual({ images: ['data:image/png;base64,cG5n'] });
  expect(generate).toHaveBeenCalledWith(request);
});
