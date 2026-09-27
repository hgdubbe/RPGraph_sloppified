import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { openRouterImageBody, openRouterResponseImages } from './openRouterImages.cjs';

const main = readFileSync(new URL('./main.cjs', import.meta.url), 'utf8');
const handlerSource = main.slice(main.indexOf("ipcMain.handle('openrouter:generate-images'"),
  main.indexOf("ipcMain.handle('venice:generate-images'"));
const preload = readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8');

function bridge(response: { ok: boolean; json?: () => Promise<unknown> }) {
  let handler!: (event: object, request: unknown) => Promise<unknown>;
  const dispose = vi.fn();
  const transport = vi.fn().mockResolvedValue(response);
  runInNewContext(handlerSource, {
    ipcMain: { handle: (_channel: string, fn: typeof handler) => { handler = fn; } },
    createLlmAbortController: () => ({ signal: { aborted: false }, dispose }),
    requestLlmResponse: transport,
    endpoint: (base: string, route: string) => `${base}/${route}`,
    requestHeaders: () => ({ Authorization: 'Bearer test-key' }),
    openRouterImageBody, openRouterResponseImages,
    readError: async () => 'Insufficient credits',
    failedLlmIpcResult: (error: Error) => ({ __rpgraphLlmError: true, message: error.message }),
  });
  let api!: { generateOpenRouterImages: (request: unknown) => Promise<unknown> };
  runInNewContext(preload, { require: () => ({
    contextBridge: { exposeInMainWorld: (_name: string, value: typeof api) => { api = value; } },
    ipcRenderer: { invoke: (_channel: string, request: unknown) => handler({}, request) }, webFrame: {},
  }) });
  return { api, transport, dispose };
}
const request = { connection: { baseUrl: 'https://openrouter.ai/api/v1', model: 'image-model' },
  prompt: 'Portrait', width: 1024, height: 1024 };

it('round-trips generated images through the IPC bridge and cleans up the request', async () => {
  const { api, transport, dispose } = bridge({ ok: true, json: async () => ({ data: [{ b64_json: 'cG5n' }] }) });
  await expect(api.generateOpenRouterImages(request)).resolves.toEqual({ images: ['data:image/png;base64,cG5n'] });
  expect(transport).toHaveBeenCalledWith('https://openrouter.ai/api/v1/images', expect.objectContaining({
    method: 'POST', headers: { Authorization: 'Bearer test-key' }, body: JSON.stringify(openRouterImageBody(request)),
  }), expect.anything());
  expect(dispose).toHaveBeenCalledOnce();
});

it('rejects failed generations in the renderer without retrying a paid request', async () => {
  const { api, transport, dispose } = bridge({ ok: false });
  await expect(api.generateOpenRouterImages(request)).rejects.toThrow('Insufficient credits');
  expect(transport).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it('passes reference images through the real preload and main-process handler in order', async () => {
  const { api, transport } = bridge({ ok: true, json: async () => ({ data: [{ b64_json: 'cG5n' }] }) });
  const referenceImages = ['data:image/png;base64,b25l', 'data:image/jpeg;base64,dHdv'];
  await api.generateOpenRouterImages({ ...request, referenceImages });
  const body = JSON.parse(transport.mock.calls[0][1].body);
  expect(body.input_references).toEqual(referenceImages.map((url) => ({ type: 'image_url', image_url: { url } })));
});
