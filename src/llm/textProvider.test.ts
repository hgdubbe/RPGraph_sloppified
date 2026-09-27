import { expect, it } from 'vitest';
import { defaultConnection } from '../settings';
import { isTextGenerationConnection } from './textProvider';

it('gives image output priority over text and vision capabilities', () => {
  expect(isTextGenerationConnection(defaultConnection, { status: 'online', capabilities: {
    text: true, image: true, vision: true, reasoning: true,
  } })).toBe(false);
  expect(isTextGenerationConnection(defaultConnection, { status: 'online', capabilities: {
    text: true, vision: true,
  } })).toBe(true);
});

it('excludes audio-only and ComfyUI providers while allowing unknown text APIs', () => {
  expect(isTextGenerationConnection(defaultConnection, { status: 'online', capabilities: { voice: true } })).toBe(false);
  expect(isTextGenerationConnection({ ...defaultConnection, kind: 'comfyui' })).toBe(false);
  expect(isTextGenerationConnection(defaultConnection)).toBe(true);
  expect(isTextGenerationConnection(defaultConnection, { status: 'online', capabilities: { text: false } })).toBe(false);
});
