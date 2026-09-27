# Image Generation

`src/images/providers.ts` defines image-provider eligibility for the image assistant,
character preview, workflow image action, and workflow capability display. ComfyUI image
connections are eligible by role. OpenRouter connections require a selected model whose
health metadata reports image output; vision input alone does not qualify. Model changes
refresh capabilities through `useProviderConnections`.

OpenRouter generation uses `POST /api/v1/images` with the selected model, prompt, one
requested image, PNG output, and an aspect-ratio request from the image assistant (portrait 3:4 by default).
Other generation entry points can still request explicit pixel sizes. Actual dimensions depend
on the model. `electron/openRouterImages.cjs` validates requests and converts base64
responses to raster data URLs. The preload bridge propagates structured errors and
cancellation. Generation errors do not automatically retry paid requests or mark an
otherwise reachable API provider offline.

The image assistant and character preview share the provider routing in
`useProviderConnections`. `createComfyImageRunner` also accepts OpenRouter connections;
it retains the existing captioning, JPEG normalization, phone-gallery storage, and
per-run Storybook update handling. Persisted `comfyProviderId` fields retain their names
for compatibility but can reference any supported image provider.

LoRAs, workflow settings, and model unload/reload operations apply only to ComfyUI.
API-image prompts omit the local settings and LoRA instruction block, and keep settings
null. Their separate reference capability block requires explicit Image 1–3 references
in the returned generation prompt. The assistant offers a format selector and disables
the local Image Settings tab for API connections.
Venice has a backend image handler but is not yet exposed by the shared eligibility
helper; integrating and validating that provider is a separate step.

API reference: [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation).

## Reference Images

The image assistant supports up to three ordered references for OpenRouter image
connections. `supportsImageGenerationReferences` is the capability boundary; ComfyUI
workflow reference detection is not enabled yet. The gallery picker defaults to the
current phone character. Saved gallery images and generated previews both enter the
same selection. Duplicates are rejected; removing an image renumbers the remaining
references, and switching to an unsupported provider clears the selection.

`src/images/references.ts` keeps reference labels, assistant attachment order, and prompt
instructions aligned. The chat shows centered 30×30-pixel square thumbnails inline with reference notices.
Hover, focus, or click reveals a preview up to 256 CSS pixels per side; removing a
reference updates its active Image 1–3 label. Preview sizing does not resize the source
images. A vision-capable assistant receives the references before any separately
attached generated preview; the preview is never implicitly used for generation.

Generation sends the selected data URLs as OpenRouter `input_references` in the same
order. The backend validates the maximum count and raster data URL formats before the
request. The image model determines the actual reference-image support; provider errors
remain visible without automatic retries. References live only in the current assistant
dialog and are not saved into chat/session history.
