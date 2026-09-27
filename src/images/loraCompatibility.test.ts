import { expect, it } from 'vitest';
import { characterLoraStatus, imageModelContext } from './loraCompatibility';
import { characterComfyLoraSlots, defaultConnection, comfyCharacterLoraName } from '../settings';

const connection = { ...defaultConnection, comfyDiffusionModelName: 'qwen_image_2.1_bf16.safetensors', comfyWorkflowPath: '/work/Qwen-Image-2.1+Edit.json', comfyLoraSlots: [{ name: comfyCharacterLoraName, strength: 1 }] };
it('activates matching names and requires an override for mismatches or unknown names', () => {
  expect(characterLoraStatus(connection, 'Alice_Qwen-Image.safetensors').active).toBe(true);
  expect(characterLoraStatus(connection, 'Alice_Krea-2.safetensors').active).toBe(false);
  expect(characterLoraStatus(connection, 'Alice.safetensors').active).toBe(false);
  expect(characterLoraStatus(connection, 'Alice_Krea-2.safetensors', true).active).toBe(true);
  expect(characterLoraStatus({ ...connection, comfyDiffusionModelName: 'krea_2.safetensors' }, 'Alice_Qwen.safetensors').active).toBe(false);
});
it('blocks manual activation without a slot and preserves both reasons', () => {
  const noSlot = { ...connection, comfyLoraSlots: [{ name: 'None', strength: 1 }] };
  const result = characterLoraStatus(noSlot, 'Alice_Krea2.safetensors', true);
  expect(result.active).toBe(false);
  expect(result.reason).toContain('no Character LoRA slot');
  expect(result.reason).toContain('matching generation model');
  expect(characterComfyLoraSlots(noSlot.comfyLoraSlots, 'Alice_Krea2.safetensors').some((slot) => slot.name === 'Alice_Krea2.safetensors')).toBe(false);
});
it('fills only assigned character slots and keeps other LoRAs intact', () => {
  const slots = [{ name: 'style.safetensors', strength: 0.5 }, { name: comfyCharacterLoraName, strength: 0.8 }];
  expect(characterComfyLoraSlots(slots, 'Alice_Qwen.safetensors').slice(0, 2)).toEqual([
    slots[0], { name: 'Alice_Qwen.safetensors', strength: 0.8 },
  ]);
  expect(imageModelContext(connection)).toContain(connection.comfyDiffusionModelName);
  expect(imageModelContext(connection)).toContain(connection.comfyWorkflowPath);
});
