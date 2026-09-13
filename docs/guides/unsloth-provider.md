# Local Unsloth Provider

## Setup

1. Start Unsloth Studio with its inference API available.
2. In RPGraph, open the main menu > Providers and create a preset with type **Unsloth**.
3. Default Base URL: `http://127.0.0.1:8888/v1`. RPGraph's own `http://localhost:5173/` development UI is a different server, not the inference URL.
4. If authentication is enabled, enter an Unsloth API key from Unsloth Settings > API.
5. Refresh/check the connection, select a locally available model, then use **Load Selected Model**. Chat also ensures the selected model is loaded before sending a request.

**Unload All Models** releases models reported by this Unsloth instance. It does not force-cancel another active generation. RPGraph's existing image-generation memory handoff and provider shutdown controls also include Unsloth.

Restart RPGraph/Electron after installing this change: Vite hot reload updates the renderer but does not replace the running main-process IPC handlers or preload bridge.

## Responses

Enable the existing **Stream response live** option for incremental ordinary replies. Cancellation uses the existing request abort mechanism. Only assistant message content is displayed, not separate reasoning deltas. Thinking settings map to Unsloth's `enable_thinking` and `reasoning_effort`; actual support depends on the model's template.

Structured-action replies remain buffered until parsing and validation finish. Partial JSON must not execute actions or appear as unfinished narrative.

As of 2026-09-09, final Structured v1 replies request native JSON-schema output when the current Unsloth backend reports a resident GGUF model. The status is rechecked per contracted request. Planning stays unconstrained; non-GGUF backends retain prompt-based output with local validation. See [response contract implementation and verification limits](action-schema-contract.md#2026-09-09-unsloth-contract-bridge).

Test-isolation correction: a disposable provider UI test originally selected the real default endpoint; normal window shutdown could then unload that server. The current provider tests seed isolated connections and disable provider unload handlers during teardown, after testing lifecycle calls against the mock server. Earlier residency checks established residency before teardown, not that teardown was harmless. The corrected nested-schema live check remains pending while the user's model is unloaded; no automatic reload with different model settings was attempted.

## API Contract

- `GET /v1/models`: locally available model catalog and residency, including quantization variants.
- `GET /api/inference/status`: residency identifiers and loaded-model vision capability.
- `POST /api/inference/load`: `model_path`, optional `gguf_variant`; residency is checked afterward.
- `POST /api/inference/unload`: exact native model identifier with `force_cancel_active: false`; residency is checked afterward.
- `POST /v1/chat/completions`: OpenAI-compatible buffered or SSE streaming replies.

The provider does not guess download URLs, silently enable remote code, or fall back to LM Studio management endpoints. Download missing models in Unsloth first. Management requires an Unsloth Studio version exposing the native inference routes; a generic OpenAI proxy exposing only `/v1` is insufficient. Server errors, missing routes and authentication failures are reported rather than treated as successful loads.

Sources checked on 2026-09-08: [Unsloth API documentation](https://unsloth.ai/docs/basics/api), [official inference routes](https://github.com/unslothai/unsloth/blob/main/studio/backend/routes/inference.py), [request models](https://github.com/unslothai/unsloth/blob/main/studio/backend/models/inference.py). Native endpoints may evolve independently of the OpenAI-compatible interface.

## Implementation And Verification

- Backend adapter: [electron/unslothApi.cjs](../../electron/unslothApi.cjs); IPC, auto-loading and shared chat transport: [electron/main.cjs](../../electron/main.cjs).
- Renderer lifecycle dispatch: [src/llm/localModelApi.ts](../../src/llm/localModelApi.ts); provider template and controls: [StudioDialogs.tsx](../../src/dialogs/StudioDialogs.tsx).
- Unit coverage: [unslothApi.test.ts](../../electron/unslothApi.test.ts), [providerKind.test.ts](../../src/llm/providerKind.test.ts).
- Electron integration: [unslothProvider.spec.ts](../../test/e2e/unslothProvider.spec.ts) exercises real HTTP/IPC for model discovery, load/unload, buffered replies, SSE, cancellation, reasoning separation and authentication failures with a mock server.
- Live verification on 2026-09-08: the already resident Gemma model at `127.0.0.1:8888` returned **Connection successful.** via streaming through RPGraph's real Electron backend. No live unload, model switch or persisted roleplay/settings modification was performed. Actual unload/reload was tested against the mock server, not the user's resident model.

Run the optional live check only with a model already loaded:

```powershell
$env:RPGRAPH_TEST_UNSLOTH_URL = 'http://127.0.0.1:8888/v1'
# Set RPGRAPH_TEST_UNSLOTH_KEY only if the server requires authentication.
npx playwright test test/e2e/unslothProvider.spec.ts
```

Without the environment variable, the live check is skipped and the isolated mock-server test still runs.
