import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { StatLine } from '../../components/StatLine';
import { useBackdropDismiss } from '../../components/useBackdropDismiss';
import type { WorkflowNode } from '../../types';
import {
  defaultOutputSpeakerPromptText,
  outputSpeakerPromptSettings,
  outputSpeakerPromptVariables,
  outputSpeakerResponseFormat,
} from './speakerPrompt';
import {
  defaultStagedInstructionsText,
  stagedInstructionsSettings,
} from '../../staged-workflow/stagedInstructionsPrompt';
import {
  defaultStagedBeatsLimit,
  defaultStagedCallsLimit,
  defaultStagedContinuationsLimit,
  defaultStagedGenerationsLimit,
} from '../../staged-workflow/stagedLimits';
import { advertisedStagedRecipes } from '../../staged-workflow/recipeInventory';
import { useNodeActions } from '../NodeActionsContext';
import { useNodeView } from '../NodeViewContext';
import { ConnectionSelect } from '../shared/ConnectionSelect';
import { LlmCallMetrics, runStateClassName, useNodeLayoutSync } from '../shared/CardView';
import { NodeCustomSelect } from '../shared/NodeCustomSelect';
import { PortLabel } from '../shared/PortValue';
import {
  promptPresetDisplayText,
  promptPresetSource,
  promptSettingForSource,
  type PromptPresetSource,
} from '../shared/promptPresets';

const stagedRecipeChoices = advertisedStagedRecipes();

function AutoResizePromptTextarea({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + lineHeight}px`;
  }, [value, disabled]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      disabled={disabled}
      spellCheck={false}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function OutputNodeCard({ id, data }: NodeProps<WorkflowNode>) {
  const nodeBodyRef = useNodeLayoutSync(id);
  const {
    changeOutputOption,
    showOutputFormatHelp,
    showOutputHighlighting,
    textPreview,
    updateData,
  } = useNodeActions();
  const view = useNodeView();
  const { estimatedTokenBytesPerToken } = view;
  const [showSpeakerPrompt, setShowSpeakerPrompt] = useState(false);
  const speakerPromptBackdropDismiss = useBackdropDismiss<HTMLDivElement>(() => setShowSpeakerPrompt(false));
  const [workflowPromptText, setWorkflowPromptText] = useState<string | undefined>();
  const speakerPrompt = outputSpeakerPromptSettings(data.outputSpeakerPrompt);
  const speakerPromptPresetKey = 'output.speaker-prompt';
  const localSpeakerPromptText = view.promptTextCustomPresets[speakerPromptPresetKey];
  const speakerPromptSource = promptPresetSource(
    speakerPrompt,
    defaultOutputSpeakerPromptText,
    localSpeakerPromptText,
  );
  const speakerPromptText = promptPresetDisplayText(
    speakerPromptSource,
    speakerPrompt,
    defaultOutputSpeakerPromptText,
    localSpeakerPromptText,
  );
  const effectiveWorkflowPromptText = workflowPromptText ?? (
    speakerPromptSource === 'workflow' ? speakerPrompt.customText : undefined
  );
  const speakerFormat = outputSpeakerResponseFormat(data.outputSpeakerResponseFormat);
  const updateSpeakerPrompt = (patch: Partial<typeof speakerPrompt>) => {
    updateData(id, {
      outputSpeakerPrompt: {
        ...speakerPrompt,
        ...patch,
      },
    });
  };
  const saveLocalSpeakerPrompt = (value: string) => {
    view.setPromptTextCustomPresets((current) => ({
      ...current,
      [speakerPromptPresetKey]: value,
    }));
  };
  const switchSpeakerPromptSource = (source: PromptPresetSource) => {
    if (speakerPromptSource === 'workflow' && speakerPrompt.customText) {
      setWorkflowPromptText(speakerPrompt.customText);
    }
    const next = promptSettingForSource(
      source,
      speakerPromptText,
      defaultOutputSpeakerPromptText,
      localSpeakerPromptText,
      effectiveWorkflowPromptText,
    );
    if (source === 'custom') {
      saveLocalSpeakerPrompt(next.customText ?? defaultOutputSpeakerPromptText);
    }
    updateSpeakerPrompt(next);
  };
  // decision-v1 reuses the Staged Instructions text and Staged Recipes allow-list as-is
  // (see runDecisionStagedTurn.ts/decisionSequence.ts), and its result feeds the same
  // Staged Plan debug viewer (stagedPlanDebugSnapshot doesn't branch on protocol) — so these
  // three panels stay enabled for both protocols; the beats/calls/generations limit inputs
  // below remain staged-v1-only until decision-v1 wires its own budget enforcement.
  const isStagedLikeProtocol = data.actionProtocol === 'staged-v1' || data.actionProtocol === 'decision-v1';
  const [showStagedInstructions, setShowStagedInstructions] = useState(false);
  const stagedInstructionsBackdropDismiss = useBackdropDismiss<HTMLDivElement>(() => setShowStagedInstructions(false));
  const [workflowInstructionsText, setWorkflowInstructionsText] = useState<string | undefined>();
  const stagedInstructions = stagedInstructionsSettings(data.stagedInstructions);
  const stagedInstructionsPresetKey = 'output.staged-instructions';
  const localStagedInstructionsText = view.promptTextCustomPresets[stagedInstructionsPresetKey];
  const stagedInstructionsSource = promptPresetSource(
    stagedInstructions,
    defaultStagedInstructionsText,
    localStagedInstructionsText,
  );
  const stagedInstructionsText = promptPresetDisplayText(
    stagedInstructionsSource,
    stagedInstructions,
    defaultStagedInstructionsText,
    localStagedInstructionsText,
  );
  const effectiveWorkflowInstructionsText = workflowInstructionsText ?? (
    stagedInstructionsSource === 'workflow' ? stagedInstructions.customText : undefined
  );
  const updateStagedInstructions = (patch: Partial<typeof stagedInstructions>) => {
    updateData(id, {
      stagedInstructions: {
        ...stagedInstructions,
        ...patch,
      },
    });
  };
  const saveLocalStagedInstructions = (value: string) => {
    view.setPromptTextCustomPresets((current) => ({
      ...current,
      [stagedInstructionsPresetKey]: value,
    }));
  };
  const switchStagedInstructionsSource = (source: PromptPresetSource) => {
    if (stagedInstructionsSource === 'workflow' && stagedInstructions.customText) {
      setWorkflowInstructionsText(stagedInstructions.customText);
    }
    const next = promptSettingForSource(
      source,
      stagedInstructionsText,
      defaultStagedInstructionsText,
      localStagedInstructionsText,
      effectiveWorkflowInstructionsText,
    );
    if (source === 'custom') {
      saveLocalStagedInstructions(next.customText ?? defaultStagedInstructionsText);
    }
    updateStagedInstructions(next);
  };
  const [showStagedPlan, setShowStagedPlan] = useState(false);
  const stagedPlanBackdropDismiss = useBackdropDismiss<HTMLDivElement>(() => setShowStagedPlan(false));
  const [showStagedRecipes, setShowStagedRecipes] = useState(false);
  const stagedRecipesBackdropDismiss = useBackdropDismiss<HTMLDivElement>(() => setShowStagedRecipes(false));
  const isStagedRecipeAllowed = (recipeId: string) =>
    !data.stagedAllowedRecipes || data.stagedAllowedRecipes.includes(recipeId);
  const toggleStagedRecipe = (recipeId: string, checked: boolean) => {
    const current = data.stagedAllowedRecipes ?? stagedRecipeChoices.map((recipe) => recipe.id);
    const next = checked ? [...current, recipeId] : current.filter((id) => id !== recipeId);
    updateData(id, {
      stagedAllowedRecipes: next.length === stagedRecipeChoices.length ? undefined : next,
    });
  };
  return (
    <div className={`workflow-node translator-node output-node${runStateClassName(data)}`} ref={nodeBodyRef}>
      <div className="node-title-row">
        <span className="node-dot" />
        <strong>{data.label}</strong>
      </div>
      <LlmCallMetrics data={data} />
      <span className="node-description">{data.description}</span>
      <ConnectionSelect id={id} label="OUTPUT TRANSLATOR / ANALYSIS LLM" connectionId={data.connectionId} />
      <div className="output-options">
        <label className="node-field-label" htmlFor={`${id}-action-protocol`}>Action protocol</label>
        <NodeCustomSelect
          id={`${id}-action-protocol`}
          value={data.actionProtocol ?? 'legacy'}
          onChange={(value) => updateData(id, { actionProtocol: value })}
          options={[
            { value: 'legacy', label: 'Original' },
            { value: 'actions-v1', label: 'Structured' },
            { value: 'staged-v1', label: 'Staged' },
          ]}
        />
        {/* Decision workflow (decision-v1) activates via a Decision Router node's presence in
            the graph now, not this dropdown — see useGraphRun.ts's useDecisionActions and
            src/nodes/decision-router/. Its settings (Narrativeness/Activeness/max actions/
            respect-user-agency) moved to that node's own card. */}
        <label className="node-field-label" htmlFor={`${id}-staged-beats-limit`}>
          Staged beats / calls / generations / continuations per turn
        </label>
        <div className="node-inline-fields">
          <input
            className="node-number-input nodrag nowheel"
            id={`${id}-staged-beats-limit`}
            aria-label="Staged beats limit"
            min={0}
            step={1}
            type="number"
            disabled={data.actionProtocol !== 'staged-v1'}
            value={data.stagedBeatsLimit ?? defaultStagedBeatsLimit}
            onChange={(event) => updateData(id, { stagedBeatsLimit: Number(event.target.value) })}
          />
          <input
            className="node-number-input nodrag nowheel"
            aria-label="Staged calls limit"
            min={0}
            step={1}
            type="number"
            disabled={data.actionProtocol !== 'staged-v1'}
            value={data.stagedCallsLimit ?? defaultStagedCallsLimit}
            onChange={(event) => updateData(id, { stagedCallsLimit: Number(event.target.value) })}
          />
          <input
            className="node-number-input nodrag nowheel"
            aria-label="Staged generations limit"
            min={0}
            step={1}
            type="number"
            disabled={data.actionProtocol !== 'staged-v1'}
            value={data.stagedGenerationsLimit ?? defaultStagedGenerationsLimit}
            onChange={(event) => updateData(id, { stagedGenerationsLimit: Number(event.target.value) })}
          />
          <input
            className="node-number-input nodrag nowheel"
            aria-label="Staged continuations limit"
            min={0}
            step={1}
            type="number"
            disabled={data.actionProtocol !== 'staged-v1'}
            value={data.stagedContinuationsLimit ?? defaultStagedContinuationsLimit}
            onChange={(event) => updateData(id, { stagedContinuationsLimit: Number(event.target.value) })}
          />
        </div>
        <label className="node-toggle nodrag">
          <input
            type="checkbox"
            checked={data.streamOutputEnabled ?? false}
            onChange={(event) => changeOutputOption(id, 'streamOutputEnabled', event.target.checked)}
          />
          Stream response live
        </label>
        <label className="node-toggle nodrag">
          <input
            type="checkbox"
            checked={data.speakerAnalysisEnabled ?? false}
            onChange={(event) => changeOutputOption(id, 'speakerAnalysisEnabled', event.target.checked)}
          />
          Detect speakers with LLM
        </label>
        <label className="node-toggle nodrag">
          <input
            type="checkbox"
            disabled={!(data.speakerAnalysisEnabled ?? false)}
            checked={data.dialogueHighlightEnabled ?? false}
            onChange={(event) => changeOutputOption(id, 'dialogueHighlightEnabled', event.target.checked)}
          />
          Highlight spoken text with LLM
        </label>
        <label className="node-field-label" htmlFor={`${id}-speaker-format`}>
          Speaker Format
        </label>
        <NodeCustomSelect
          id={`${id}-speaker-format`}
          value={speakerFormat}
          disabled={!(data.speakerAnalysisEnabled ?? false)}
          onChange={(value) => updateData(id, { outputSpeakerResponseFormat: value })}
          options={[
            { value: 'toon', label: 'TOON (faster)' },
            { value: 'json', label: 'JSON' },
          ]}
        />
      </div>
      <span className="node-field-label metric-label">TOKEN STATS</span>
      <div className="node-metrics">
        <StatLine text={data.preview} bytesPerEstimatedToken={estimatedTokenBytesPerToken} />
      </div>
      <div className="node-actions">
        <button className="inspect-button nodrag" type="button" onClick={() => textPreview(id)}>
          Text Preview
        </button>
        <button
          className="inspect-button nodrag"
          type="button"
          disabled={!data.outputHighlightingResponseToon && !data.outputHighlightingResultToon}
          onClick={() => showOutputHighlighting(id)}
        >
          Highlighting
        </button>
        <button
          className="inspect-button nodrag"
          type="button"
          disabled={!(data.speakerAnalysisEnabled ?? false)}
          onClick={() => setShowSpeakerPrompt(true)}
        >
          Speaker Prompt
        </button>
        <button
          className="inspect-button nodrag"
          type="button"
          disabled={!isStagedLikeProtocol}
          onClick={() => setShowStagedInstructions(true)}
        >
          Staged Instructions
        </button>
        <button
          className="inspect-button nodrag"
          type="button"
          disabled={!isStagedLikeProtocol}
          onClick={() => setShowStagedPlan(true)}
        >
          Staged Plan
        </button>
        <button
          className="inspect-button nodrag"
          type="button"
          disabled={!isStagedLikeProtocol}
          onClick={() => setShowStagedRecipes(true)}
        >
          Staged Recipes
        </button>
      </div>
      <div className="workflow-ports">
        <div className="workflow-port workflow-port-input output-format-port">
          <Handle type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" label="Normal RP" valueType="text" />
          <button
            className="node-info-button output-phone-info output-format-help-button nodrag"
            type="button"
            aria-label="Show RP text input format"
            onClick={() => showOutputFormatHelp('rp-output')}
          >
            ?
          </button>
        </div>
        <div className="workflow-port workflow-port-input output-format-port">
          <Handle id="phone-message" type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" handle="phone-message" label="Messenger Apps" valueType="text" />
          <button
            className="node-info-button output-phone-info output-format-help-button nodrag"
            type="button"
            aria-label="Show phone message format"
            onClick={() => showOutputFormatHelp('rp-output')}
          >
            ?
          </button>
        </div>
        <div className="workflow-port workflow-port-input output-format-port">
          <Handle id="social-media" type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" handle="social-media" label="Social Media" valueType="mixed" />
          <button
            className="node-info-button output-phone-info output-format-help-button nodrag"
            type="button"
            aria-label="Show social media format"
            onClick={() => showOutputFormatHelp('rp-output')}
          >
            ?
          </button>
        </div>
        <div className="workflow-port workflow-port-input output-format-port">
          <Handle id="autoplay" type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" handle="autoplay" label="Autoplay" valueType="text" />
          <button
            className="node-info-button output-phone-info output-format-help-button nodrag"
            type="button"
            aria-label="Show Autoplay input format"
            onClick={() => showOutputFormatHelp('rp-output')}
          >
            ?
          </button>
        </div>
        <div className="workflow-port workflow-port-input output-format-port">
          <Handle id="output-actions" type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" handle="output-actions" label="Output Actions" valueType="mixed" />
          <button
            className="node-info-button output-phone-info output-format-help-button nodrag"
            type="button"
            aria-label="Show output actions format"
            onClick={() => showOutputFormatHelp('rp-output')}
          >
            ?
          </button>
        </div>
        <div className="workflow-port workflow-port-input">
          <Handle id="highlighting-context" type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" handle="highlighting-context" label="Highlighting Context" valueType="text" />
          <button
            className="node-info-button output-phone-info output-format-help-button nodrag"
            type="button"
            aria-label="Show RP Output guide"
            onClick={() => showOutputFormatHelp('rp-output')}
          >
            ?
          </button>
        </div>
        <div className="workflow-port workflow-port-input output-format-port">
          <Handle id="direct-actions" type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" handle="direct-actions" label="Direct Actions" valueType="mixed" />
          <button
            className="node-info-button output-phone-info output-format-help-button nodrag"
            type="button"
            aria-label="Show direct actions format"
            onClick={() => showOutputFormatHelp('rp-output')}
          >
            ?
          </button>
        </div>
        <div className="workflow-port workflow-port-input">
          <Handle id="decision-context" type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" handle="decision-context" label="Decision Context (debug)" valueType="json" />
        </div>
      </div>
      {showSpeakerPrompt && typeof document !== 'undefined' && createPortal(
        <div className="dialog-backdrop" {...speakerPromptBackdropDismiss}>
          <section
            className="autoturn-instructions-dialog nodrag"
            role="dialog"
            aria-modal="true"
            aria-label="Speaker Prompt"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-title-row">
              <div>
                <span className="eyebrow">RP OUTPUT</span>
                <h2>Speaker Prompt</h2>
              </div>
              <button type="button" onClick={() => setShowSpeakerPrompt(false)}>
                Close
              </button>
            </div>
            <div className="event-manager-prompt-body">
              <section className="event-manager-prompt-editor">
                <div className="event-manager-prompt-toolbar">
                  <div className="autoturn-instruction-mode" role="group" aria-label="Speaker Prompt mode">
                    <button
                      type="button"
                      className={speakerPromptSource === 'default' ? 'active' : ''}
                      onClick={() => switchSpeakerPromptSource('default')}
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      className={speakerPromptSource === 'custom' ? 'active' : ''}
                      onClick={() => switchSpeakerPromptSource('custom')}
                    >
                      Custom
                    </button>
                    <button
                      type="button"
                      className={speakerPromptSource === 'workflow' ? 'active' : ''}
                      disabled={!effectiveWorkflowPromptText}
                      onClick={() => switchSpeakerPromptSource('workflow')}
                    >
                      In Workflow
                    </button>
                  </div>
                  <div className="event-manager-prompt-heading">
                    <h3>Speaker Prompt</h3>
                  </div>
                </div>
                <div className="event-manager-prompt-variables" aria-label="Speaker Prompt variables">
                  {outputSpeakerPromptVariables.map((variable) => (
                    <span key={variable}>{variable}</span>
                  ))}
                </div>
                <AutoResizePromptTextarea
                  value={speakerPromptText}
                  disabled={speakerPromptSource === 'default'}
                  onChange={(value) => {
                    if (speakerPromptSource === 'custom') {
                      saveLocalSpeakerPrompt(value);
                    }
                    updateSpeakerPrompt({
                      mode: 'custom',
                      customText: value,
                    });
                  }}
                />
              </section>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {showStagedInstructions && typeof document !== 'undefined' && createPortal(
        <div className="dialog-backdrop" {...stagedInstructionsBackdropDismiss}>
          <section
            className="autoturn-instructions-dialog nodrag"
            role="dialog"
            aria-modal="true"
            aria-label="Staged Instructions"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-title-row">
              <div>
                <span className="eyebrow">RP OUTPUT</span>
                <h2>Staged Instructions</h2>
              </div>
              <button type="button" onClick={() => setShowStagedInstructions(false)}>
                Close
              </button>
            </div>
            <div className="event-manager-prompt-body">
              <section className="event-manager-prompt-editor">
                <div className="event-manager-prompt-toolbar">
                  <div className="autoturn-instruction-mode" role="group" aria-label="Staged Instructions mode">
                    <button
                      type="button"
                      className={stagedInstructionsSource === 'default' ? 'active' : ''}
                      onClick={() => switchStagedInstructionsSource('default')}
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      className={stagedInstructionsSource === 'custom' ? 'active' : ''}
                      onClick={() => switchStagedInstructionsSource('custom')}
                    >
                      Custom
                    </button>
                    <button
                      type="button"
                      className={stagedInstructionsSource === 'workflow' ? 'active' : ''}
                      disabled={!effectiveWorkflowInstructionsText}
                      onClick={() => switchStagedInstructionsSource('workflow')}
                    >
                      In Workflow
                    </button>
                  </div>
                  <div className="event-manager-prompt-heading">
                    <h3>Staged Instructions</h3>
                  </div>
                </div>
                <AutoResizePromptTextarea
                  value={stagedInstructionsText}
                  disabled={stagedInstructionsSource === 'default'}
                  onChange={(value) => {
                    if (stagedInstructionsSource === 'custom') {
                      saveLocalStagedInstructions(value);
                    }
                    updateStagedInstructions({
                      mode: 'custom',
                      customText: value,
                    });
                  }}
                />
              </section>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {showStagedPlan && typeof document !== 'undefined' && createPortal(
        <div className="dialog-backdrop" {...stagedPlanBackdropDismiss}>
          <section
            className="autoturn-instructions-dialog nodrag"
            role="dialog"
            aria-modal="true"
            aria-label="Staged Plan"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-title-row">
              <div>
                <span className="eyebrow">RP OUTPUT</span>
                <h2>Staged Plan</h2>
              </div>
              <button type="button" onClick={() => setShowStagedPlan(false)}>
                Close
              </button>
            </div>
            <div className="event-manager-prompt-body">
              <section className="event-manager-prompt-editor">
                <AutoResizePromptTextarea
                  value={data.stagedLastPlanDebug || 'Run a staged turn to see its compiled plan, stages and beats here.'}
                  disabled
                  onChange={() => {}}
                />
              </section>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {showStagedRecipes && typeof document !== 'undefined' && createPortal(
        <div className="dialog-backdrop" {...stagedRecipesBackdropDismiss}>
          <section
            className="autoturn-instructions-dialog nodrag"
            role="dialog"
            aria-modal="true"
            aria-label="Staged Recipes"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-title-row">
              <div>
                <span className="eyebrow">RP OUTPUT</span>
                <h2>Staged Recipes</h2>
              </div>
              <button type="button" onClick={() => setShowStagedRecipes(false)}>
                Close
              </button>
            </div>
            <div className="event-manager-prompt-body">
              <section className="event-manager-prompt-editor">
                {stagedRecipeChoices.map((recipe) => (
                  <label key={recipe.id} className="node-toggle nodrag">
                    <input
                      type="checkbox"
                      checked={isStagedRecipeAllowed(recipe.id)}
                      onChange={(event) => toggleStagedRecipe(recipe.id, event.target.checked)}
                    />
                    {recipe.description}
                  </label>
                ))}
              </section>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
