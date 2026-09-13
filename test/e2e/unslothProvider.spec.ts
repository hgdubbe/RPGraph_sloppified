import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { launchAppWithWorkflow, cleanup, type LaunchedApp } from './helpers';
import type { ConnectionPreset } from '../../src/types';
import Ajv from 'ajv';
import { actionReplySchema, actionReplyProviderSchema } from '../../src/actions/schema';

async function cleanupProviderTest(app: LaunchedApp | undefined) {
  try {
    if (app) await app.electronApp.evaluate(({ ipcMain }) => {
      // Provider lifecycle calls above are real. Teardown must never unload a
      // user's server, even when a preset-UI assertion fails before isolation.
      for (const channel of ['unsloth:unload', 'lmstudio:unload-models', 'llamacpp:unload-models', 'ollama:unload-models', 'comfy:free-memory']) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => ({ unloadedCount: 0, models: [] }));
      }
    });
  } finally { await cleanup(app); }
}

test('live Unsloth streams from the already resident model without changing residency', async () => {
  test.skip(!process.env.RPGRAPH_TEST_UNSLOTH_URL, 'Opt-in live server check; never switches or unloads models.');
  test.setTimeout(120_000);
  let app: LaunchedApp | undefined;
  const connection: ConnectionPreset = {
    id: 'live-unsloth', kind: 'llm', providerKind: 'unsloth', label: 'Unsloth',
    baseUrl: process.env.RPGRAPH_TEST_UNSLOTH_URL!, apiKey: process.env.RPGRAPH_TEST_UNSLOTH_KEY || '',
    model: '', reasoningEffort: 'none',
  };
  try {
    app = await launchAppWithWorkflow({ format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] }, {
      format: 'rpgraph-settings', version: 1, defaultConnectionId: 'isolated',
      connections: [{ ...connection, id: 'isolated', baseUrl: 'http://127.0.0.1:9/v1', model: '' }],
    });
    const models = await app.page.evaluate((c) => window.rpgraph.listUnslothModels(c), connection);
    const resident = models.find((model) => model.status === 'loaded');
    expect(resident, 'Load a model in Unsloth before running this opt-in check').toBeTruthy();
    connection.model = resident!.id;
    const result = await app.page.evaluate(async (c) => {
      const chunks: string[] = [];
      const reply = await window.rpgraph.streamChatCompletion({ connection: c, prompt: 'Reply with exactly: Connection successful.', maxTokens: 32, temperature: 0 }, (chunk) => chunks.push(chunk));
      return { reply, chunks };
    }, connection);
    expect(result.reply.text.trim()).not.toBe('');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.at(-1)).toBe(result.reply.text);
    expect(await app.page.evaluate((c) => window.rpgraph.isUnslothModelLoaded(c), connection)).toMatchObject({ loaded: true });
    const structured = await app.page.evaluate((c) => window.rpgraph.chatCompletion({
      connection: c, responseContract: 'actions-v1', maxTokens: 512, temperature: 0,
      prompt: 'Return exactly ONE version 1 JSON reply with catalogId probe and exactly ONE action block. Intent: messenger.send, app whatsup, from person_1, to person_2, text Hello, attachment type generate_image, owner person_1, description A sunlit room. No other blocks. This is a format test only.',
    }), connection);
    const validate = new Ajv({ strict: true }).compile(actionReplySchema);
    const decoded = JSON.parse(structured.text);
    expect(validate(decoded), JSON.stringify(validate.errors)).toBe(true);
    expect(decoded.blocks).toContainEqual(expect.objectContaining({ type: 'action', intent: expect.objectContaining({
      type: 'messenger.send', attachment: expect.objectContaining({ type: 'generate_image' }),
    }) }));
    console.log('Live Unsloth streaming reply:', result.reply.text);
  } finally { await cleanupProviderTest(app); }
});

test('Unsloth lifecycle, buffered replies, streaming and cancellation use the real IPC transport', async () => {
  let app: LaunchedApp | undefined;
  let loaded = false;
  let gguf = true;
  let loads = 0;
  const requests: Array<{ path: string; auth: string | undefined; body: Record<string, unknown> }> = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    requests.push({ path: req.url!, auth: req.headers.authorization, body });
    if (req.headers.authorization !== 'Bearer test-unsloth-key') {
      res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let result: unknown;
    switch (req.url) {
      case '/v1/models': result = { data: [{ id: 'local/model', quant: 'Q4_K_M', loaded }] }; break;
      case '/api/inference/status': result = { is_gguf: gguf, loaded: loaded ? ['Display Name'] : [], loading: [], active_model: 'Display Name', model_identifier: 'local/model' }; break;
      case '/api/inference/load': loaded = true; loads++; result = { status: 'loaded' }; break;
      case '/api/inference/unload': loaded = false; result = { status: 'unloaded' }; break;
      case '/v1/chat/completions':
        if (body.stream) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'Do not display this.' } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] })}\n\n`);
          const timer = setTimeout(() => res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'world' } }] })}\n\ndata: [DONE]\n\n`), 200);
          res.on('close', () => clearTimeout(timer));
          return;
        }
        result = { choices: [{ message: { content: 'Hello world', reasoning_content: 'Hidden thinking' } }] };
        break;
      default: res.writeHead(404).end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(`  ${JSON.stringify(result)}  `);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const connection: ConnectionPreset = {
    id: 'test-unsloth', kind: 'llm', providerKind: 'unsloth', label: 'Unsloth',
    baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test-unsloth-key',
    model: 'local/model:Q4_K_M', reasoningEffort: 'none',
  };
  try {
    app = await launchAppWithWorkflow({ format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] }, {
      format: 'rpgraph-settings', version: 1, defaultConnectionId: connection.id, connections: [connection],
    });
    const page = app.page;
    await page.getByRole('button', { name: 'Open main menu' }).click();
    await page.getByRole('menuitem', { name: 'Providers', exact: true }).click();
    await page.getByRole('button', { name: 'Unsloth Local Unsloth Studio server' }).click();
    await expect(page.locator('#base-url')).toHaveValue('http://127.0.0.1:8888/v1');
    // The preset supplies its real default URL. Restore isolation before teardown
    // invokes the app's normal provider-unload handshake.
    await page.locator('#base-url').fill(connection.baseUrl);
    await expect(page.locator('#base-url')).toHaveValue(connection.baseUrl);
    await expect(page.getByRole('button', { name: 'Load Selected Model' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unload All Models' })).toBeVisible();
    await page.screenshot({ path: 'test/results/unsloth-provider.png' });
    expect(await page.evaluate((c) => window.rpgraph.listUnslothModels(c), connection)).toMatchObject([{ id: connection.model, status: 'unloaded' }]);
    const reply = await page.evaluate((c) => window.rpgraph.chatCompletion({ connection: c, prompt: 'Hello', maxTokens: 20 }), connection);
    expect(reply.text).toBe('Hello world');
    expect(loads).toBe(1);
    const stream = await page.evaluate(async (c) => {
      const chunks: string[] = [];
      const reply = await window.rpgraph.streamChatCompletion({ connection: c, prompt: 'Hello' }, (chunk) => chunks.push(chunk));
      return { chunks, reply };
    }, connection);
    expect(stream.chunks).toEqual(['Hello ', 'Hello world']);
    expect(stream.reply.text).toBe('Hello world');
    expect(loads).toBe(1);
    expect(requests.filter((r) => r.path.endsWith('/chat/completions')).every((r) => !r.body.response_format)).toBe(true);
    await page.evaluate((c) => window.rpgraph.chatCompletion({ connection: c, responseContract: 'actions-v1', prompt: 'Structured' }), connection);
    expect(requests.at(-1)?.body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'rpgraph_actions_v1', strict: true, schema: actionReplyProviderSchema } });
    await page.evaluate((c) => window.rpgraph.streamChatCompletion({ connection: c, responseContract: 'actions-v1', prompt: 'Structured stream' }, () => {}), connection);
    expect(requests.at(-1)?.body).toMatchObject({ stream: true, response_format: { type: 'json_schema' } });
    gguf = false;
    await page.evaluate((c) => window.rpgraph.chatCompletion({ connection: c, responseContract: 'actions-v1', prompt: 'Unsupported backend' }), connection);
    expect(requests.at(-1)?.body).not.toHaveProperty('response_format');
    gguf = true;
    const cancelled = await page.evaluate(async (c) => {
      let cancel = () => {};
      try {
        await window.rpgraph.streamChatCompletion({ connection: c, prompt: 'Cancel' }, () => cancel(), (callback) => { cancel = callback; });
        return false;
      } catch { return true; }
    }, connection);
    expect(cancelled).toBe(true);
    expect(await page.evaluate((c) => window.rpgraph.unloadUnslothModels(c), connection)).toMatchObject({ unloadedCount: 1 });
    expect(await page.evaluate((c) => window.rpgraph.isUnslothModelLoaded(c), connection)).toMatchObject({ loaded: false });
    await page.evaluate((c) => window.rpgraph.loadUnslothModel(c), connection);
    expect(loads).toBe(2);
    expect(requests.find((r) => r.path.endsWith('/load'))?.body).toEqual({ model_path: 'local/model', gguf_variant: 'Q4_K_M' });
    expect(requests.find((r) => r.path.endsWith('/unload'))?.body).toEqual({ model_path: 'local/model', force_cancel_active: false });
    expect(requests.find((r) => r.path.endsWith('/chat/completions'))?.body).toMatchObject({ enable_thinking: false, reasoning_effort: 'none' });
    expect(requests.every((r) => r.auth === 'Bearer test-unsloth-key')).toBe(true);
    const error = await page.evaluate(async (c) => {
      try { await window.rpgraph.listUnslothModels({ ...c, apiKey: 'bad' }); return ''; }
      catch (error) { return String(error); }
    }, connection);
    expect(error).toContain('401');
  } finally {
    await cleanupProviderTest(app);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
