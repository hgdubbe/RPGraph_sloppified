import { isComfyImageConnection } from '../comfy/connectionRole';
import type { ConnectionPreset } from '../types';
import { comfyCharacterLoraName, defaultComfyLoraSlots, validComfyLoraSlots } from '../settings';

function modelFamilies(value: string): string[] {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['qwen', 'krea2', 'flux2', 'flux1', 'sdxl', 'sd15'].filter((family) => normalized.includes(family));
}

export function characterLoraStatus(connection: ConnectionPreset | undefined, name: string, override = false) {
  const modelNames = modelFamilies(connection?.comfyDiffusionModelName || connection?.comfyCheckpointName || '');
  const workflowNames = modelFamilies((connection?.comfyWorkflowPath ?? '').split(/[\\/]/).pop() ?? '');
  const targetNames = modelNames.length ? modelNames : workflowNames;
  const loraNames = modelFamilies(name.split(/[\\/]/).pop() ?? '');
  const matches = loraNames.length > 0 && loraNames.every((family) => targetNames.includes(family));
  const hasSlot = validComfyLoraSlots(connection?.comfyLoraSlots ?? defaultComfyLoraSlots)
    .some((slot) => slot.name.trim() === comfyCharacterLoraName);
  const reasons = [
    ...(!hasSlot ? ['The provider has no Character LoRA slot assigned.'] : []),
    ...(!matches ? ['The LoRA filename does not identify a matching generation model.'] : []),
  ];
  return { active: !!name && hasSlot && (matches || override), hasSlot, matches, reason: reasons.join(' ') };
}

export function imageModelContext(connection?: ConnectionPreset, selectedLora = '', override = false) {
  if (!connection) return 'Image provider: (none)';
  if (!isComfyImageConnection(connection)) {
    return `Image provider: ${connection.providerKind || connection.kind}\nImage model: ${connection.model || '(none)'}`;
  }
  const status = characterLoraStatus(connection, selectedLora, override);
  return [
    'Image provider: ComfyUI',
    `Current selected Character LoRA: ${selectedLora || '(none)'}`,
    `Current selected Character LoRA active: ${status.active ? 'yes' : 'no'}`,
    ...(selectedLora && !status.active ? [`Inactive reason: ${status.reason}`] : []),
    'This activation status applies only to the current selection. Reassess compatibility when choosing a different filename.',
    `Image workflow: ${connection?.comfyWorkflowPath || '(none)'}`,
    `Diffusion model: ${connection?.comfyDiffusionModelName || '(none)'}`,
    `Checkpoint: ${connection?.comfyCheckpointName || '(none)'}`,
    `Character LoRA slot assigned: ${characterLoraStatus(connection, '').hasSlot ? 'yes' : 'no'}`,
  ].join('\n');
}
