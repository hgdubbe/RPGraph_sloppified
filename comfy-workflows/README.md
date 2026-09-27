# ComfyUI Workflows

RPGraph keeps ComfyUI workflows in two shapes:

- `api-workflows-with-variables/` contains API JSON files that RPGraph can run. These files include RPGraph placeholders such as `prompt`, `width`, `height`, `speech_text`, or `voice_audio`.
- `normal-comfyui-workflows/` contains regular ComfyUI UI workflows for first-time setup. Open these in ComfyUI to install custom nodes, download models, and confirm the workflow runs before selecting the matching API workflow in RPGraph.

Each shape is split into `image/` and `voice/` folders so image and voice provider presets only show compatible workflows.

For image generation with zero to three references, select
`api-workflows-with-variables/image/Qwen-Image-2.1+Edit.json`. Workflow inspection
enables reference selection when both a `LoadImage` node and the supported Qwen
encoder are present; copied templates can have any filename. RPGraph uploads selected
images and replaces the Qwen encoder's optional image connections for each request.
With no references, all three image connections are removed. A single template
handles all reference counts.
The Edit template replaces the separate text-only Qwen template and uses rgthree's
LoRA stack and seed nodes. Its encoder reference resolution remains 1120, while output width and
height come from the selected generation settings.
