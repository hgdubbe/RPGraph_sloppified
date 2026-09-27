import { describe, expect, it } from 'vitest';
import { openRouterImageBody, openRouterResponseImages } from './openRouterImages.cjs';

const request = { connection: { model: 'image-model' }, prompt: ' A landscape ', width: 832, height: 1216 };

describe('OpenRouter Image API', () => {
  it('sends a single image request with explicit dimensions', () => {
    expect(openRouterImageBody(request)).toEqual({
      model: 'image-model', prompt: 'A landscape', size: '832x1216', n: 1, output_format: 'png',
    });
  });
  it.each([{ width: 0 }, { height: 1.5 }, { width: 8192 }, { prompt: ' ' }, { connection: { model: '' } }])(
    'rejects invalid generation requests before sending them', (patch) => {
      expect(() => openRouterImageBody({ ...request, ...patch })).toThrow();
    },
  );
  it('preserves image MIME types and all returned images', () => {
    expect(openRouterResponseImages({ data: [
      { b64_json: 'aW1hZ2U=', media_type: 'image/webp' }, { b64_json: 'cG5n' },
    ] })).toEqual({ images: ['data:image/webp;base64,aW1hZ2U=', 'data:image/png;base64,cG5n'] });
  });
  it.each([{}, { data: [] }, { data: [{ url: 'https://example.com/image' }] },
    { data: [{ b64_json: 'not base64!' }] }, { data: [{ b64_json: 'cG5n', media_type: 'text/html' }] }])(
    'rejects empty or unsupported responses', (response) => {
      expect(() => openRouterResponseImages(response)).toThrow();
    },
  );
  it('surfaces API errors even in a successful HTTP response', () => {
    expect(() => openRouterResponseImages({ error: { message: 'Insufficient credits' } }))
      .toThrow('Insufficient credits');
  });
});

it('sends up to three ordered reference images using the OpenRouter Image API schema', () => {
  const referenceImages = ['data:image/png;base64,b25l', 'data:image/jpeg;base64,dHdv', 'data:image/webp;base64,dGhyZWU='];
  expect(openRouterImageBody({ ...request, referenceImages }).input_references).toEqual(
    referenceImages.map((url) => ({ type: 'image_url', image_url: { url } })),
  );
  expect(openRouterImageBody({ ...request, referenceImages: [] })).not.toHaveProperty('input_references');
});

it.each([
  ['data:image/png;base64,b25l', 'data:image/png;base64,b25l', 'data:image/png;base64,b25l', 'data:image/png;base64,b25l'],
  ['https://example.com/image.png'], ['data:image/svg+xml;base64,c3Zn'], ['not an image'],
])('rejects unsupported reference inputs before a paid request', (...referenceImages) => {
  expect(() => openRouterImageBody({ ...request, referenceImages })).toThrow('up to three');
});

it('sends API aspect ratio without conflicting pixel dimensions', () => {
  const body = openRouterImageBody({ ...request, aspectRatio: '3:4' });
  expect(body).toHaveProperty('aspect_ratio', '3:4');
  expect(body.prompt).toContain('Output aspect ratio: 3:4.');
  expect(body).not.toHaveProperty('size');
  expect(() => openRouterImageBody({ ...request, aspectRatio: 'invalid' })).toThrow('aspect ratio');
});
