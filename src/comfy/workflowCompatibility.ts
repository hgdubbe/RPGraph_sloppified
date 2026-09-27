export type ComfyWorkflowInspection = {
  ok: boolean;
  supportsImageReferences?: boolean;
  format: 'api' | 'ui' | 'unknown';
  role: 'image' | 'voice';
  modelSource: 'checkpoint' | 'diffusion_model' | 'both' | 'missing';
  placeholders: string[];
  missing: string[];
  workflowPath?: string;
  fileName?: string;
};

export function comfyWorkflowCompatibilityMessage(inspection: ComfyWorkflowInspection | null) {
  if (!inspection) {
    return 'Workflow compatibility has not been checked yet.';
  }
  if (inspection.ok) {
    return inspection.role === 'image'
      ? `Workflow is compatible. ${inspection.supportsImageReferences ? 'Image editing: up to three references supported.' : 'Text-to-image: no supported reference inputs detected.'}`
      : 'Workflow is compatible.';
  }
  if (inspection.format === 'ui') {
    return 'This is a ComfyUI UI workflow. Export it in API format and add the required RPGraph placeholders.';
  }
  return `Workflow is not compatible yet. Missing: ${inspection.missing.join(', ')}.`;
}
