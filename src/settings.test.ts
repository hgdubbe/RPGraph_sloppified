import { describe, expect, it } from 'vitest';
import {
  bundledComfyWorkflows,
  comfySetupRequiredMessage,
  defaultComfyDiffusionModelName,
  defaultComfyHeight,
  defaultComfyTextEncoderName,
  defaultComfyVaeName,
  defaultComfyWorkflowPath,
  missingComfySetupFields,
  normalizedConnectionPreset,
} from './settings';

describe('ComfyUI image defaults', () => {
  it('uses the bundled Flux 2 Klein workflow and model setup by default', () => {
    expect(defaultComfyWorkflowPath).toBe(
      'comfy-workflows/api-workflows-with-variables/image/Flux2-Klein-9B.json',
    );
    expect(bundledComfyWorkflows.find((workflow) => workflow.role === 'image')?.label).toBe(
      'Flux2 Klein 9B',
    );
    expect(bundledComfyWorkflows.find((workflow) => workflow.role === 'image')?.setupWorkflowPath).toBe(
      'comfy-workflows/normal-comfyui-workflows/image/Flux2-Klein-9B.json',
    );

    const missing = missingComfySetupFields({
      comfyDiffusionModelName: defaultComfyDiffusionModelName,
      comfyCheckpointName: '',
      comfyVaeName: defaultComfyVaeName,
      comfyTextEncoderName: defaultComfyTextEncoderName,
    });

    expect(comfySetupRequiredMessage(missing)).toBe('');
  });

  it('upgrades incomplete legacy Krea image providers to Flux 2 Klein defaults', () => {
    const preset = normalizedConnectionPreset({
      id: 'legacy-comfy',
      kind: 'comfyui',
      label: 'ComfyUI Image',
      baseUrl: 'http://127.0.0.1:8188',
      apiKey: '',
      model: '',
      reasoningEffort: 'none',
      comfyRole: 'image',
      comfyWorkflowSetupConfirmed: true,
      vision: false,
      comfyWorkflowPath: 'comfy-workflows/api-workflows-with-variables/image/Krea2.json',
      comfyDeleteImageOutputs: false,
      comfyWidth: 832,
      comfyHeight: 1216,
      comfyPrompt: '',
      comfyCheckpointName: '',
      comfyDiffusionModelName: 'snofsSexNudesAndOtherFunStuff_v14Distilled.safetensors',
      comfyVaeName: '',
      comfyTextEncoderName: 'qwen_3_8b_fp8mixed.safetensors',
      comfyLoraSlots: [],
    });

    expect(preset.comfyWorkflowPath).toBe(defaultComfyWorkflowPath);
    expect(preset.comfyHeight).toBe(defaultComfyHeight);
    expect(preset.comfyDiffusionModelName).toBe(defaultComfyDiffusionModelName);
    expect(preset.comfyVaeName).toBe(defaultComfyVaeName);
    expect(preset.comfyTextEncoderName).toBe(defaultComfyTextEncoderName);
  });
});
