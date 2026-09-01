# ComfyUI Workflows

RPGraph keeps ComfyUI workflows in two shapes:

- `api-workflows-with-variables/` contains API JSON files that RPGraph can run. These files include RPGraph placeholders such as `prompt`, `width`, `height`, `speech_text`, or `voice_audio`.
- `normal-comfyui-workflows/` contains regular ComfyUI UI workflows for first-time setup. Open these in ComfyUI to install custom nodes, download models, and confirm the workflow runs before selecting the matching API workflow in RPGraph.

Each shape is split into `image/` and `voice/` folders so image and voice provider presets only show compatible workflows.

## Flux2 Klein 9B Image Setup

The bundled default image preset is `Flux2-Klein-9B`.

- RPGraph API workflow: `api-workflows-with-variables/image/Flux2-Klein-9B.json`
- ComfyUI setup workflow: `normal-comfyui-workflows/image/Flux2-Klein-9B.json`
- Diffusion model: `darkBeastKLEINNvfp4_v10.safetensors`
- Text encoder: `qwen_3_8b_fp8mixed.safetensors`
- VAE: `flux2-vae.safetensors`
- Recommended size: `832 x 832`
- LoRA slots may be left as `None` unless a character LoRA is installed.

In RPGraph, configure a ComfyUI provider with base URL `http://127.0.0.1:8188`, select the `Flux2 Klein 9B` image workflow, enter the model names above, then mark the setup as confirmed after the matching setup workflow runs in ComfyUI.
