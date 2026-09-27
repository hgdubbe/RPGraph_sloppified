import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { supportsComfyImageReferences, prepareComfyImageReferences, uploadComfyImageReference } from './comfyImageReferences.cjs';

const template = JSON.parse(readFileSync(new URL('../comfy-workflows/api-workflows-with-variables/image/Qwen-Image-2.1+Edit.json', import.meta.url), 'utf8'));
const reference = 'data:image/png;base64,cG5n';

it.each([0, 1, 2, 3])('connects exactly %i ordered references without changing the template', async (count) => {
  const workflow = structuredClone(template);
  const upload = vi.fn().mockImplementation(async () => `uploaded-${upload.mock.calls.length}.png [temp]`);
  await prepareComfyImageReferences(workflow, Array(count).fill(reference), upload);
  expect(upload).toHaveBeenCalledTimes(count);
  for (let index = 0; index < 3; index++) {
    const link = workflow['486'].inputs[`images.image_${index + 1}`];
    if (index < count) {
      expect(workflow[link[0]]).toEqual({ class_type: 'LoadImage', inputs: { image: `uploaded-${index + 1}.png [temp]` } });
    } else expect(link).toBeUndefined();
  }
  expect(workflow['486'].inputs.vae).toEqual(template['486'].inputs.vae);
  expect(template['486'].inputs['images.image_3']).toEqual(['487', 0]);
});

it.each([0, 1])('also handles a template with %i existing image connections', async (count) => {
  const workflow = structuredClone(template);
  for (let index = count + 1; index <= 3; index++) delete workflow['486'].inputs[`images.image_${index}`];
  await prepareComfyImageReferences(workflow, [reference, reference, reference], async () => 'reference.png');
  expect(Object.keys(workflow['486'].inputs).filter((key) => key.startsWith('images.image_'))).toHaveLength(3);
});

it('rejects invalid references and unsupported workflows before uploading', async () => {
  const upload = vi.fn();
  for (const images of [[reference, reference, reference, reference], ['file:///secret']]) {
    await expect(prepareComfyImageReferences(structuredClone(template), images, upload)).rejects.toThrow('up to three');
  }
  await expect(prepareComfyImageReferences({}, [reference], upload)).rejects.toThrow('does not support');
  expect(upload).not.toHaveBeenCalled();
});

it('leaves unrelated workflows intact without references', async () => {
  const workflow = { '1': { class_type: 'LoadImage', inputs: { image: 'existing.png' } } };
  expect(await prepareComfyImageReferences(workflow, undefined, vi.fn())).toEqual(workflow);
});

it('uploads raster bytes as multipart and uses the returned storage path', async () => {
  const send = vi.fn().mockResolvedValue({ name: 'renamed.png', subfolder: 'refs', type: 'temp' });
  expect(await uploadComfyImageReference(reference, send)).toBe('refs/renamed.png [temp]');
  const request = send.mock.calls[0][0];
  expect(request.headers['Content-Type']).toContain('multipart/form-data; boundary=');
  expect(request.body.toString()).toContain('Content-Type: image/png\r\n\r\npng');
  expect(request.body.toString()).toContain('name="type"\r\n\r\ntemp');
  send.mockResolvedValue({ name: 'input.png', type: 'input' });
  expect(await uploadComfyImageReference(reference, send)).toBe('input.png');
});

it('propagates upload failures without continuing with missing images', async () => {
  const upload = vi.fn().mockRejectedValue(new Error('Upload failed'));
  await expect(prepareComfyImageReferences(structuredClone(template), [reference, reference], upload)).rejects.toThrow('Upload failed');
  expect(upload).toHaveBeenCalledOnce();
  await expect(uploadComfyImageReference(reference, async () => ({}))).rejects.toThrow('uploaded reference image name');
});

it('detects edit support from nodes without relying on filenames or active connections', () => {
  expect(supportsComfyImageReferences(template)).toBe(true);
  const textOnly = { '1': { class_type: 'TextEncodeQwenImage21', inputs: { prompt: 'A landscape' } } };
  expect(supportsComfyImageReferences(textOnly)).toBe(false);
  expect(supportsComfyImageReferences({ '1': { class_type: 'LoadImage' } })).toBe(false);
  expect(supportsComfyImageReferences({})).toBe(false);
  const disconnected = structuredClone(template);
  for (let i = 1; i <= 3; i++) delete disconnected['486'].inputs[`images.image_${i}`];
  expect(supportsComfyImageReferences(disconnected)).toBe(true);
});
