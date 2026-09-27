import { describe, expect, it } from 'vitest';
import { addImageGenerationReference, imageReferenceAttachments, imageReferencePrompt } from './references';
import { supportsImageGenerationReferences } from './providers';
import { defaultConnection } from '../settings';
import { imageGenerationAssistantPrompt } from '../chat/imageGenerationAssistant';

const images = ['Portrait', 'Pose', 'Background'].map((name, index) => ({
  id: String(index), name, description: `${name} description`, dataUrl: `data:image/png;base64,${['b25l', 'dHdv', 'dGhyZWU='][index]}`,
}));

describe('Image generation references', () => {
  it('adds up to three references in selection order without changing existing selections', () => {
    const first = addImageGenerationReference([], images[0]);
    const second = addImageGenerationReference(first, images[1]);
    expect(first).toEqual([images[0]]);
    expect(addImageGenerationReference(second, images[2])).toEqual(images);
    expect(() => addImageGenerationReference(images, { ...images[0], dataUrl: 'data:image/png;base64,bmV3' }))
      .toThrow('up to three');
    expect(() => addImageGenerationReference(first, { ...images[0], id: 'different-id' })).toThrow('already selected');
  });

  it('keeps attachment labels and prompt labels aligned after removing an image', () => {
    const remaining = images.filter((_, index) => index !== 1);
    const attachments = imageReferenceAttachments(remaining);
    expect(attachments.map((image) => image.name)).toEqual(['Image 1: Portrait', 'Image 2: Background']);
    expect(attachments.map((image) => image.dataUrl)).toEqual(remaining.map((image) => image.dataUrl));
    expect(imageReferencePrompt(remaining)).toContain('Image 2: Background');
    expect(imageReferencePrompt(remaining)).not.toContain('Image 3: Background');
  });

  it('adds active references to the assistant prompt without embedding image bytes or stale notices', () => {
    const prompt = imageGenerationAssistantPrompt('', { width: 1024, height: 1024, characterLora: '' }, '', [], '', '',
      [{ role: 'reference', text: 'Old portrait is now Image 1.' }], 'Use Image 1 with the pose in Image 2.', false, false, false, images);
    expect(prompt).toContain('Image 1: Portrait');
    expect(prompt).toContain('Image 2: Pose');
    expect(prompt).toContain('Image 3: Background');
    expect(prompt).not.toContain('Old portrait');
    expect(prompt).not.toContain('base64');
    expect(imageReferencePrompt([])).toContain('No reference images are selected');
  });

  it('enables reference controls only for the currently supported API provider', () => {
    expect(supportsImageGenerationReferences({ ...defaultConnection, providerKind: 'openrouter' })).toBe(true);
    expect(supportsImageGenerationReferences({ ...defaultConnection, kind: 'comfyui', comfyRole: 'image' })).toBe(false);
    expect(supportsImageGenerationReferences(undefined)).toBe(false);
  });
});
