import type { ChatImageAttachment } from '../types';
import { encodedDataUrlBytes } from '../utils/imageNormalization';

export type ImageGenerationReference = {
  id: string;
  name: string;
  dataUrl: string;
  description: string;
};

export const maxImageGenerationReferences = 3;

export function addImageGenerationReference(
  references: ImageGenerationReference[],
  image: ImageGenerationReference,
): ImageGenerationReference[] {
  if (references.some((entry) => entry.dataUrl === image.dataUrl)) {
    throw new Error('This image is already selected as a reference.');
  }
  if (references.length >= maxImageGenerationReferences) {
    throw new Error('Use up to three reference images. Remove one before adding another.');
  }
  return [...references, { ...image, name: image.name.trim() || image.id }];
}

export function imageReferenceAttachments(references: ImageGenerationReference[]): ChatImageAttachment[] {
  return references.map((image, index) => ({
    id: `image-reference-${index + 1}`,
    name: `Image ${index + 1}: ${image.name}`,
    mimeType: /^data:([^;,]+)/.exec(image.dataUrl)?.[1] ?? 'image/png',
    size: encodedDataUrlBytes(image.dataUrl),
    dataUrl: image.dataUrl,
    description: image.description,
  }));
}

export function imageReferencePrompt(references: ImageGenerationReference[]) {
  if (!references.length) return 'No reference images are selected. Do not refer to Image 1, Image 2, or Image 3 in the generation prompt.';
  return [
    'Active reference images (this list replaces any earlier reference selections):',
    ...references.map((image, index) => `Image ${index + 1}: ${image.name}${image.description ? ` — ${image.description}` : ''}`),
    'These images are attached in exactly this order and will be sent to the image generator in the same order.',
    'Use the exact labels Image 1, Image 2, and Image 3 when referring to selected images. Do not refer to missing image numbers.',
    'For an edit, describe the requested changes and what should stay unchanged, using the reference labels instead of inventing a new subject. For example: Change the pose of the character in Image 1 while preserving their identity and clothing.',
    'Reference images are the source for visible identity and appearance. Use the user request to decide which reference supplies each subject, pose, background, or style.',
    'The generated preview, if separately attached for description, is not a generation reference unless it is listed above.',
  ].join('\n');
}
