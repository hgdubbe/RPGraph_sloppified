import { isComfyImageConnection } from '../comfy/connectionRole';
import { isOpenRouterConnection } from '../llm/providerKind';
import type { ConnectionPreset, ProviderConnectionHealth } from '../types';

export function isImageGenerationConnection(
  connection: ConnectionPreset,
  health?: ProviderConnectionHealth,
): boolean {
  return isComfyImageConnection(connection) || (
    isOpenRouterConnection(connection) && !!connection.model.trim() && health?.capabilities?.image === true
  );
}

// ComfyUI support comes from inspecting the current workflow, never its filename.
export function supportsImageGenerationReferences(
  connection?: ConnectionPreset,
  health?: ProviderConnectionHealth,
): boolean {
  return !!connection && (isOpenRouterConnection(connection) || (
    isComfyImageConnection(connection) && health?.comfyImageReferences?.supported === true &&
    health.comfyImageReferences.workflowPath === (connection.comfyWorkflowPath ?? '')
  ));
}

export async function generateApiImages(request: {
  connection: ConnectionPreset;
  prompt: string;
  width: number;
  height: number;
  referenceImages?: string[];
  aspectRatio?: string;
}) {
  if (isOpenRouterConnection(request.connection)) {
    return window.rpgraph.generateOpenRouterImages(request);
  }
  throw new Error('The selected provider does not support image generation.');
}
