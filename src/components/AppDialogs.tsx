import { parseStorybookContinuation } from '../storybook/assistantConversation';
import { CharacterAgencyField } from './CharacterAgencyField';
import type { Character } from '../characters/character';
import { characterReferenceCandidates } from '../characters/relationships';
import { CharacterRelationships } from './CharacterRelationships';
import { CharacterMentionInput } from './CharacterMentionInput';
import { HiddenAgencyField } from './HiddenAgencyField';
import { withCharacterPortrait } from '../characters/portrait';
import { CharacterAppProfiles } from './CharacterAppProfiles';
import { formatBankingAmount } from '../chat/bankTransfers';
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { DarkAudioPlayer } from './DarkAudioPlayer';
import { LiveRunClock } from './LiveRunClock';
import { outputFormatHelp, type OutputFormatHelpKind } from '../nodes/output/formatHelp';
import { CustomNodeBody } from '../nodes/custom-node/Card';
import {
  customNodeDefinition,
  type CustomNodeDefinition,
  type CustomNodeElement,
} from '../nodes/custom-node/model';
import {
  outputRuntimePortValues,
  runCustomNodeDefinition,
} from '../nodes/custom-node/runtime';
import {
  defaultRpStorybookCharacterBanking,
  defaultRpStorybookCharacterVoiceConfig,
  defaultRpStorybookImageDescriptionPrompt,
  defaultRpStorybookImageDescriptionPromptSettings,
  emptyRpStorybook,
  nextStorybookCharacterImageId,
  parseRpStorybookJson,
  rpStorybookFormattedText,
  rpStorybookFormattedTextSettings,
  rpStorybookImageDescriptionPromptSettings,
  rpStorybookImageDescriptionPromptText,
  rpStorybookLogicCheckInstruction,
  rpStorybookPhoneContactCharacters,
  rpStorybookPhoneContactAllowed,
  withRpStorybookPhoneContactPairBlocked,
  estimatedRpStorybookPromptTokens,
  storybookCharacterImageOwnerIdBase,
  type RpStorybookCharacterBanking,
  type RpStorybookCharacterComfyConfig,
  type RpStorybookCharacterVoiceConfig,
  type RpStorybookCharacter,
  type RpStorybookCharacterImage,
  type RpStorybookCharacterProfileImage,
  type RpStorybookFormattedTextSettings,
  type RpStorybook,
} from '../nodes/rp-storybook/model';
import { NodeCustomSelect } from '../nodes/shared/NodeCustomSelect';
import { runStateClassName } from '../nodes/shared/CardView';
import { providerOption } from '../nodes/shared/providerHealthLabels';
import {
  configForPromptActionToken,
  parsePromptActionTokens,
  promptActionConfigs,
  withPromptActionRuntimeSettingsList,
  type PromptActionRuntimeSettings,
  type PromptActionConfig,
} from '../nodes/shared/promptActions';
import { JsonSyntaxTextarea } from '../nodes/shared/JsonSyntaxTextarea';
import {
  promptPresetDisplayText,
  promptPresetSource,
  promptSettingForSource,
  type PromptPresetSource,
} from '../nodes/shared/promptPresets';
import { ModelIdPicker } from './ModelIdPicker';
import { comfyCharacterLoraName } from '../settings';
import { isComfyImageConnection, isComfyVoiceConnection } from '../comfy/connectionRole';
import type {
  ChatImageAttachment,
  ConnectionPreset,
  ImageCaptionChange,
  MessageRecord,
  ProviderConnectionHealth,
  SystemLogEntry,
  SystemLogLevel,
  WorkflowNode,
} from '../types';
import { storybookImageById } from '../storybook/imageLibrary';
import {
  StorybookConversionAssistantReport,
  StorybookConversionPanel,
} from '../storybook/StorybookConversionPanel';
import type { StorybookConversionResult } from '../storybook/conversion';
import { formatContextValue } from '../data-management/formatters';
import { TextMetricsApi } from '../llm/tokenMetrics';
import { sanitizeDataUrls } from '../utils/sanitize';
import { normalizeImageAttachment } from '../utils/imageNormalization';
import { copyTextToClipboard } from '../utils/clipboard';
import { formatLogTimestamp } from '../utils/format';
import { CharacterAvatar } from './CharacterAvatar';
import { TurnTraceDialog } from './TurnTraceDialog';
import { useBackdropDismiss } from './useBackdropDismiss';
import type { TurnTrace } from '../app/turnTrace';
import { createDebugSnapshotCopy, type DebugSnapshot, type DebugSnapshotSectionKey } from '../app/debugSnapshot';
import {
  llmPromptSwitchPromptAftersByOutput,
  llmPromptSwitchPromptBeforesByOutput,
} from '../workflow';

export type StorybookCreatorMessage = {
  role: 'user' | 'assistant' | 'storybook' | 'error';
  text: string;
  failedResponse?: string;
  retryRequest?: { message: string; visibleMessage: string; referenceIds: string[] };
};

export type CustomNodeAssistantMessage = {
  role: 'user' | 'assistant' | 'error';
  text: string;
};

export type CustomNodeAssistantDiagnostic = {
  id: string;
  source: string;
  message: string;
  createdAt: number;
  expanded: boolean;
};

const characterLoraFavoritesStorageKey = 'rpgraph.favoriteCharacterLoraModels';
const characterComfyPreviewScenarios = [
  {
    id: 'mirror-selfie',
    label: 'Mirror Selfie',
    prompt: 'stylish mirror selfie, indoor apartment lighting, natural pose, detailed face and outfit',
  },
  {
    id: 'beach-bikini',
    label: 'Beach Bikini',
    prompt: 'standing on a sunny beach in a bikini, soft daylight, ocean background, full body',
  },
  {
    id: 'neon-alley',
    label: 'Neon Alley Portrait',
    prompt: 'cinematic neon alley portrait at night, rain reflections, fashionable streetwear, dramatic rim light',
  },
] as const;

export type RunLlmCallReport = {
  id: string;
  order: number;
  nodeId: string;
  nodeLabel: string;
  label: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  durationMs: number;
  startedAtMs?: number;
};

export type RunLlmReport = {
  runId: string;
  startedAt: string;
  calls: RunLlmCallReport[];
};

export type LlmRunHistoryEntry = {
  report: RunLlmReport;
  durationMs: number;
};

function formatRuntimeSeconds(durationMs: number) {
  return (durationMs / 1000).toFixed(2);
}

function tokenCell(value: number | undefined) {
  return value === undefined ? '-' : value.toLocaleString();
}

function callTotalTokens(call: RunLlmCallReport) {
  return call.totalTokens ?? (call.inputTokens ?? 0) + (call.outputTokens ?? 0);
}

function runLlmReportTotals(report: RunLlmReport) {
  return report.calls.reduce(
    (totals, call) => ({
      inputTokens: totals.inputTokens + (call.inputTokens ?? 0),
      outputTokens: totals.outputTokens + (call.outputTokens ?? 0),
      reasoningTokens: totals.reasoningTokens + (call.reasoningTokens ?? 0),
      hasReasoningTokens: totals.hasReasoningTokens || call.reasoningTokens !== undefined,
      totalTokens: totals.totalTokens + callTotalTokens(call),
      durationMs: totals.durationMs + call.durationMs,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      hasReasoningTokens: false,
      totalTokens: 0,
      durationMs: 0,
    },
  );
}

export function RunLlmReportDialog({
  currentReport,
  currentDurationMs,
  history,
  isRunning,
  runStartTimeMs,
  onClose,
}: {
  currentReport: RunLlmReport;
  currentDurationMs: number;
  history: LlmRunHistoryEntry[];
  isRunning: boolean;
  runStartTimeMs: number | null;
  onClose: () => void;
}) {
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);
  const currentTotals = runLlmReportTotals(currentReport);

  const renderRunCard = (title: string, report: RunLlmReport | undefined, durationMs: number | undefined, isCurrent = false) => {
    const totals = report ? runLlmReportTotals(report) : null;
    
    return (
      <div className={`run-llm-card ${isCurrent ? 'current' : ''}`}>
        <div className="run-llm-card-header">
          <h4>{title}</h4>
          {isCurrent && isRunning && <span className="run-llm-card-badge">Running</span>}
        </div>
        <div className="run-llm-card-body">
          <div className="run-llm-card-row">
            <span className="run-llm-card-label">Duration</span>
            <span className="run-llm-card-value font-mono">
              {isCurrent && isRunning
                ? <><LiveRunClock isRunning={isRunning} startTimeMs={runStartTimeMs} finalMs={durationMs ?? 0} /> s</>
                : durationMs !== undefined ? `${formatRuntimeSeconds(durationMs)} s` : '-'}
            </span>
          </div>
          <div className="run-llm-card-row">
            <span className="run-llm-card-label">LLM Calls</span>
            <span className="run-llm-card-value">
              {report ? report.calls.length : '-'}
            </span>
          </div>
          <div className="run-llm-card-row">
            <span className="run-llm-card-label">Input Tokens</span>
            <span className="run-llm-card-value font-mono">
              {totals ? tokenCell(totals.inputTokens) : '-'}
            </span>
          </div>
          <div className="run-llm-card-row">
            <span className="run-llm-card-label">Output Tokens</span>
            <span className="run-llm-card-value font-mono">
              {totals ? tokenCell(totals.outputTokens) : '-'}
            </span>
          </div>
          <div className="run-llm-card-row">
            <span className="run-llm-card-label">RSN Tokens</span>
            <span className="run-llm-card-value font-mono">
              {totals ? tokenCell(totals.hasReasoningTokens ? totals.reasoningTokens : undefined) : '-'}
            </span>
          </div>
          <div className="run-llm-card-row">
            <span className="run-llm-card-label">Total Tokens</span>
            <span className="run-llm-card-value font-mono font-bold">
              {totals ? tokenCell(totals.totalTokens) : '-'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dialog-backdrop" role="presentation" {...backdropDismiss}>
      <section
        className="run-llm-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-llm-report-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <h2 id="run-llm-report-title">LLM Runtime</h2>
            <p>
              Overview and call history comparison.
            </p>
          </div>
          <button className="close-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="run-llm-report-body">
          <div className="run-llm-report-comparison-section">
            <h3 className="run-llm-report-section-title">Overview Comparison</h3>
            <div className="run-llm-cards-grid">
              {renderRunCard("Current Run", currentReport, currentDurationMs, true)}
              {renderRunCard("Last Run", history[0]?.report, history[0]?.durationMs)}
              {renderRunCard("2 Runs Ago", history[1]?.report, history[1]?.durationMs)}
              {renderRunCard("3 Runs Ago", history[2]?.report, history[2]?.durationMs)}
            </div>
          </div>

          <div className="run-llm-report-details-section">
            <h3 className="run-llm-report-section-title">
              {isRunning ? 'Current Run Details' : 'Last Completed Run Details'}
            </h3>
            {currentReport.calls.length === 0 ? (
              <p className="run-llm-report-empty">No LLM calls recorded for this run yet.</p>
            ) : (
              <table className="run-llm-report-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Node</th>
                    <th>Call</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>RSN</th>
                    <th>Total</th>
                    <th>Seconds</th>
                  </tr>
                </thead>
                <tbody>
                  {currentReport.calls.map((call) => (
                    <tr key={call.id}>
                      <td>{call.order}</td>
                      <td title={call.nodeId}>{call.nodeLabel}</td>
                      <td>{call.label}</td>
                      <td>{tokenCell(call.inputTokens)}</td>
                      <td>{tokenCell(call.outputTokens)}</td>
                      <td>{tokenCell(call.reasoningTokens)}</td>
                      <td>{tokenCell(callTotalTokens(call))}</td>
                      <td>{formatRuntimeSeconds(call.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td></td>
                    <td>Total</td>
                    <td></td>
                    <td>{currentTotals.inputTokens.toLocaleString()}</td>
                    <td>{currentTotals.outputTokens.toLocaleString()}</td>
                    <td>{tokenCell(currentTotals.hasReasoningTokens ? currentTotals.reasoningTokens : undefined)}</td>
                    <td>{currentTotals.totalTokens.toLocaleString()}</td>
                    <td>{formatRuntimeSeconds(currentTotals.durationMs)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function updatePreviewControlValue(
  definition: CustomNodeDefinition,
  controlId: string,
  value: unknown,
): CustomNodeDefinition {
  return {
    ...definition,
    controls: definition.controls.map((control) =>
      control.id === controlId ? { ...control, value } : control,
    ),
  };
}

const customNodePromptSuggestions = [
  {
    title: 'Scene Mood Extractor',
    prompt: [
      'Build a Custom Node that reads a roleplay scene and extracts its mood.',
      'Use one text input named scene_text and call llmJson to return {"mood":"string","tension":0} where tension is from 0 to 10.',
      'Clamp tension between 0 and 10 in code.',
      'Create a text output mood and a number output tension. No displays.',
    ].join('\n'),
  },
  {
    title: 'Tone Rewriter',
    prompt: [
      'Build a Custom Node that rewrites incoming roleplay text in a selected tone.',
      'Use one text input named source_text and a select control named tone with options darker, softer, romantic, threatening, and comedic.',
      'Use llm to rewrite the text in the selected tone while keeping character facts and scene continuity intact.',
      'Create one text output rewritten_text. No displays, no buttons.',
    ].join('\n'),
  },
  {
    title: 'Text Shortener',
    prompt: [
      'Build a Custom Node that shortens long roleplay text.',
      'Use one text input named long_text and a slider control named max_sentences from 1 to 8.',
      'Use llm to compress the text to at most the selected number of sentences while keeping names and key facts.',
      'Create one text output short_text. No displays.',
    ].join('\n'),
  },
  {
    title: 'Dialogue Extractor',
    prompt: [
      'Build a Custom Node that pulls only the spoken dialogue out of mixed roleplay text.',
      'Use one text input named scene_text and call llm to return only the spoken lines, one per line, without narration or actions.',
      'Create one text output dialogue_text. No displays.',
    ].join('\n'),
  },
  {
    title: 'Continuity Checker',
    prompt: [
      'Build a Custom Node that checks new scene text against existing roleplay memory.',
      'Use two text inputs: memory_context and new_scene_text. Call llmJson to return {"has_conflict":false,"summary":"string"}.',
      'Create a boolean output has_conflict and a text output summary. No displays.',
    ].join('\n'),
  },
  {
    title: 'NPC Reaction Generator',
    prompt: [
      'Build a Custom Node that writes a short npc reaction to a character action.',
      'Use two text inputs: character_action and npc_profile.',
      'Use llm to write a two to three sentence reaction that fits the npc profile.',
      'Create one text output reaction. No displays.',
    ].join('\n'),
  },
  {
    title: 'Relationship Score Tracker',
    prompt: [
      'Build a Custom Node that tracks a running relationship score across turns.',
      'Use one text input named scene_exchange. Call llmJson to return {"delta":0,"reason":"string"} where delta is from -5 to 5.',
      'Keep the running score in state, add the clamped delta on every workflow run, and clamp the total between -100 and 100.',
      'Create a number output score and a text output reason.',
      'Add one button that only resets the stored score state back to 0. Do not add a Run button.',
    ].join('\n'),
  },
  {
    title: 'Memory Compressor',
    prompt: [
      'Build a Custom Node that compresses long roleplay history into short memory bullets.',
      'Use one text input named long_history and a slider control named max_bullets from 3 to 10.',
      'Use llmJson to return {"memory_bullets":["string"]} with at most the selected number of bullets.',
      'Join the bullets into one plain text list in code and create one text output memory_text. No displays.',
    ].join('\n'),
  },
  {
    title: 'Word Counter',
    prompt: [
      'Build a Custom Node that counts words without any LLM call.',
      'Use one text input named input_text.',
      'In code, count the words and characters.',
      'Create a number output word_count and a number output char_count. No displays, no buttons.',
    ].join('\n'),
  },
  {
    title: 'Style Instruction Picker',
    prompt: [
      'Build a Custom Node that outputs a writing style instruction without any LLM call.',
      'Use no inputs. Add a select control named style with options cinematic, slow burn, action heavy, dark, and lighthearted.',
      'In code, map the selected style to a short instruction sentence for the story LLM.',
      'Create one text output style_instruction. No displays.',
    ].join('\n'),
  },
];

type CustomNodeAssistantDialogProps = {
  node: WorkflowNode;
  connections: ConnectionPreset[];
  defaultConnectionId: string;
  messages: CustomNodeAssistantMessage[];
  diagnostics: CustomNodeAssistantDiagnostic[];
  onSubmit: (message: string, connectionId: string) => Promise<void>;
  onStructureCheck: () => void;
  onSecurityCheck: (connectionId: string) => Promise<void>;
  onApplyDefinitionText: (text: string) => void;
  onToggleDiagnostic: (diagnosticId: string) => void;
  onDismissDiagnostic: (diagnosticId: string) => void;
  onClearChat: () => void;
  onReset: () => void;
  onClose: () => void;
};

export function CustomNodeAssistantDialog({
  node,
  connections,
  defaultConnectionId,
  messages,
  diagnostics,
  onSubmit,
  onStructureCheck,
  onSecurityCheck,
  onApplyDefinitionText,
  onToggleDiagnostic,
  onDismissDiagnostic,
  onClearChat,
  onReset,
  onClose,
}: CustomNodeAssistantDialogProps) {
  const [draft, setDraft] = useState('');
  const [viewMode, setViewMode] = useState<'ui' | 'code' | 'edit'>('ui');
  const llmConnections = connections.filter((connection) => connection.kind !== 'comfyui');
  const fallbackConnectionId = defaultConnectionId || llmConnections[0]?.id || '';
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    [node.data.connectionId, fallbackConnectionId].find((connectionId) =>
      connectionId && llmConnections.some((connection) => connection.id === connectionId),
    ) ?? fallbackConnectionId,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSecurity, setIsCheckingSecurity] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [editCodeDraft, setEditCodeDraft] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [previewZoom, setPreviewZoom] = useState(0.82);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const previewDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const definition = useMemo(
    () => customNodeDefinition(node.data.customNodeDefinition),
    [node.data.customNodeDefinition],
  );
  const customNodeIsEmpty =
    !definition.code.trim() &&
    definition.inputs.length === 0 &&
    definition.outputs.length === 0 &&
    definition.controls.length === 0;
  const [previewDefinition, setPreviewDefinition] = useState<CustomNodeDefinition>(definition);
  const [previewDisplays, setPreviewDisplays] = useState<Record<string, string>>({});
  const [previewRuntimePortValues, setPreviewRuntimePortValues] = useState<Record<string, string>>({});
  const [previewStatus, setPreviewStatus] = useState(node.data.preview);
  const connectionOptions = llmConnections.map((connection) => ({
    value: connection.id,
    label: connection.label,
  }));
  const definitionJson = JSON.stringify(definition, null, 2);
  const definitionMetadataJson = JSON.stringify({
    ...definition,
    code: undefined,
  }, null, 2);
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) {
        return;
      }
      setPreviewDefinition(definition);
      setPreviewDisplays({});
      setPreviewRuntimePortValues({});
      setPreviewStatus(node.data.preview);
      setEditDraft(definitionMetadataJson);
      setEditCodeDraft(definition.code);
      setEditStatus('');
    });
    return () => {
      active = false;
    };
  }, [definition, definitionMetadataJson, node.data.preview]);

  function submit(event: FormEvent) {
    event.preventDefault();
    submitDraft();
  }

  function submitDraft() {
    const message = draft.trim();
    if (!message || isSubmitting) {
      return;
    }
    setDraft('');
    setIsSubmitting(true);
    void onSubmit(message, selectedConnectionId).finally(() => setIsSubmitting(false));
  }

  function zoomPreview(change: number) {
    setPreviewZoom((current) => Math.min(1.4, Math.max(0.35, Number((current + change).toFixed(2)))));
  }

  function resetPreviewTransform() {
    setPreviewZoom(0.82);
    setPreviewPan({ x: 0, y: 0 });
  }

  function checkCodeSecurity() {
    if (isCheckingSecurity) {
      return;
    }
    setIsCheckingSecurity(true);
    void onSecurityCheck(selectedConnectionId).finally(() => setIsCheckingSecurity(false));
  }

  async function copyDefinition() {
    setMoreOpen(false);
    await copyTextToClipboard(definitionJson);
  }

  async function pasteDefinition() {
    setMoreOpen(false);
    try {
      const text = await navigator.clipboard.readText();
      onApplyDefinitionText(text);
    } catch (error) {
      setEditStatus(`Paste failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function applyEditedDefinition() {
    let parsedDefinition: unknown;
    try {
      parsedDefinition = JSON.parse(editDraft);
    } catch (error) {
      setEditStatus(`JSON failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if (!parsedDefinition || typeof parsedDefinition !== 'object' || Array.isArray(parsedDefinition)) {
      setEditStatus('JSON failed: Definition must be an object.');
      return;
    }

    const parsedRecord = parsedDefinition as Record<string, unknown>;
    // A full definition pasted into the JSON pane keeps its own code; the
    // Runtime Code pane only fills in when the JSON has no code field.
    const mergedCode = typeof parsedRecord.code === 'string' ? parsedRecord.code : editCodeDraft;
    onApplyDefinitionText(JSON.stringify({
      ...parsedRecord,
      code: mergedCode,
    }, null, 2));
    setEditStatus('Applied.');
  }

  function resetDefinition() {
    setMoreOpen(false);
    onReset();
  }

  function changePreviewControl(controlId: string, value: unknown) {
    setPreviewDefinition((current) => updatePreviewControlValue(current, controlId, value));
    setPreviewStatus('Preview value changed');
  }

  function clickPreviewStateButton(control: CustomNodeElement) {
    setPreviewDefinition((current) => {
      if (!control.action || control.action === 'run-code' || !control.stateKey) {
        return current;
      }
      const state = { ...current.state };
      if (control.action === 'toggle-state') {
        state[control.stateKey] = !state[control.stateKey];
      } else {
        state[control.stateKey] = control.stateValue ?? true;
      }
      return { ...current, state };
    });
    setPreviewStatus(control.stateKey ? `${control.label} changed preview state` : `${control.label} clicked`);
  }

  async function runPreviewCode(label: string) {
    setPreviewStatus(`${label} preview running ...`);
    try {
      const result = await runCustomNodeDefinition(previewDefinition, {}, {
        llm: async (request) => {
          const prompt = typeof request === 'string' ? request : request.prompt;
          return JSON.stringify({
            preview: true,
            prompt,
            sorted: [1, 2, 3, 4],
          });
        },
      });
      setPreviewDefinition((current) => ({ ...current, state: result.state }));
      setPreviewDisplays(result.displays);
      setPreviewRuntimePortValues((current) => outputRuntimePortValues(result.outputs, current));
      setPreviewStatus(`${label} preview ran`);
    } catch (error) {
      setPreviewStatus(`Preview failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function shouldStartPreviewPan(target: EventTarget | null) {
    return target instanceof HTMLElement && !target.closest('input, textarea, select, button, label, .nodrag');
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      {...backdropDismiss}
    >
      <section className="storybook-creator-dialog custom-node-assistant-dialog" role="dialog" aria-modal="true" aria-label="Custom Node Assistant">
        <div className="dialog-header storybook-creator-header">
          <div className="storybook-title-row">
            <h2>Custom Node Assistant</h2>
            <p>Custom Node · build controls, ports, displays, and code</p>
          </div>
          <div className="storybook-header-actions custom-node-assistant-header-actions">
            <button className="inspect-button nodrag" type="button" onClick={onStructureCheck}>
              Structure Check
            </button>
            <button className="inspect-button nodrag" type="button" onClick={checkCodeSecurity} disabled={isCheckingSecurity}>
              {isCheckingSecurity ? 'Reviewing...' : 'Security Review'}
            </button>
            <button
              className="inspect-button nodrag"
              type="button"
              onClick={onClearChat}
              disabled={messages.length === 0 && diagnostics.length === 0}
            >
              Delete Chat
            </button>
            <div className="storybook-more-menu custom-node-more-menu">
              <button
                className="inspect-button storybook-more-button nodrag"
                type="button"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((current) => !current)}
              >
                More
              </button>
              {moreOpen && (
                <div className="storybook-more-popover" role="menu">
                  <button type="button" role="menuitem" onClick={resetDefinition}>
                    Reset
                  </button>
                  <button type="button" role="menuitem" onClick={() => void copyDefinition()}>
                    Copy Code
                  </button>
                  <button type="button" role="menuitem" onClick={() => void pasteDefinition()}>
                    Paste Code
                  </button>
                </div>
              )}
            </div>
            <div className="custom-node-assistant-provider">
              <label htmlFor="custom-node-assistant-provider">Provider</label>
              <NodeCustomSelect
                id="custom-node-assistant-provider"
                value={selectedConnectionId}
                onChange={setSelectedConnectionId}
                options={connectionOptions}
              />
            </div>
            <button type="button" className="close-button danger" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="storybook-creator-body">
          <div className="storybook-main-workspace">
            <div className="storybook-document-panel custom-node-preview-panel">
              <div className="storybook-panel-header">
                <span className="panel-title">Custom Node Preview</span>
                <div className="custom-node-preview-tools">
                  {viewMode === 'ui' && (
                    <div className="custom-node-zoom-controls" aria-label="Preview zoom controls">
                      <button type="button" className="tab-button" onClick={() => zoomPreview(-0.1)}>−</button>
                      <span>{Math.round(previewZoom * 100)}%</span>
                      <button type="button" className="tab-button" onClick={() => zoomPreview(0.1)}>+</button>
                      <button type="button" className="tab-button" onClick={resetPreviewTransform}>Reset</button>
                    </div>
                  )}
                  <div className="storybook-tabs">
                    <button
                      type="button"
                      className={`tab-button ${viewMode === 'ui' ? 'active' : ''}`}
                      onClick={() => setViewMode('ui')}
                    >
                      UI Preview
                    </button>
                    <button
                      type="button"
                      className={`tab-button ${viewMode === 'code' ? 'active' : ''}`}
                      onClick={() => setViewMode('code')}
                    >
                      Code Preview
                    </button>
                    <button
                      type="button"
                      className={`tab-button ${viewMode === 'edit' ? 'active' : ''}`}
                      onClick={() => setViewMode('edit')}
                    >
                      JSON Edit
                    </button>
                  </div>
                </div>
              </div>

              <div className="storybook-panel-content">
                {viewMode === 'code' && (
                  <div className="custom-node-readable-code-panel">
                    <section className="custom-node-readable-section">
                      <div className="custom-node-readable-heading">Definition</div>
                      <JsonSyntaxTextarea readOnly value={definitionMetadataJson} wrap="soft" />
                    </section>
                    <section className="custom-node-readable-section custom-node-readable-code-section">
                      <div className="custom-node-readable-heading">Runtime Code</div>
                      <textarea
                        className="custom-node-runtime-code-editor"
                        value={definition.code.trim() || '// No runtime code yet.'}
                        readOnly
                        spellCheck={false}
                        wrap="soft"
                      />
                    </section>
                  </div>
                )}

                {viewMode === 'edit' && (
                  <div className="storybook-json-panel custom-node-code-panel custom-node-edit-panel">
                    <div className="custom-node-readable-code-panel custom-node-edit-split-panel">
                      <section className="custom-node-readable-section">
                        <div className="custom-node-readable-heading">Definition JSON</div>
                        <JsonSyntaxTextarea
                          value={editDraft}
                          onChange={(val) => setEditDraft(val)}
                          wrap="soft"
                        />
                      </section>
                      <section className="custom-node-readable-section custom-node-readable-code-section">
                        <div className="custom-node-readable-heading">Runtime Code</div>
                        <textarea
                          className="custom-node-runtime-code-editor"
                          value={editCodeDraft}
                          onChange={(event) => setEditCodeDraft(event.target.value)}
                          spellCheck={false}
                          wrap="soft"
                        />
                      </section>
                    </div>
                    <div className="custom-node-edit-actions">
                      <span className="run-note">{editStatus || 'Edit the definition or runtime code, then apply it.'}</span>
                      <button className="inspect-button nodrag" type="button" onClick={applyEditedDefinition}>
                        Apply JSON
                      </button>
                    </div>
                  </div>
                )}

                {viewMode === 'ui' && (
                  <div
                    className="storybook-ui-view custom-node-ui-preview"
                    onWheel={(event) => {
                      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, .nodrag')) {
                        return;
                      }
                      if (!event.ctrlKey && !event.metaKey) {
                        return;
                      }
                      event.preventDefault();
                      zoomPreview(event.deltaY > 0 ? -0.06 : 0.06);
                    }}
                    onMouseDown={(event) => {
                      if (event.button !== 0 || !shouldStartPreviewPan(event.target)) {
                        return;
                      }
                      previewDragRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        originX: previewPan.x,
                        originY: previewPan.y,
                      };
                    }}
                    onMouseMove={(event) => {
                      const drag = previewDragRef.current;
                      if (!drag) {
                        return;
                      }
                      setPreviewPan({
                        x: drag.originX + event.clientX - drag.startX,
                        y: drag.originY + event.clientY - drag.startY,
                      });
                    }}
                    onMouseUp={() => {
                      previewDragRef.current = null;
                    }}
                    onMouseLeave={() => {
                      previewDragRef.current = null;
                    }}
                  >
                    <div
                      className={`workflow-node custom-node custom-node-preview-card${runStateClassName(node.data)}`}
                      style={{
                        transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`,
                      }}
                    >
                      <CustomNodeBody
                        data={{
                          ...node.data,
                          connectionId: selectedConnectionId,
                          preview: previewStatus,
                          runtimePortValues: previewRuntimePortValues,
                          customNodeRuntimeDisplays: previewDisplays,
                        }}
                        definition={previewDefinition}
                        connectionElement={(
                          <>
                            <label className="node-field-label">LLM PROVIDER</label>
                            <NodeCustomSelect
                              id={`${node.id}-assistant-preview-provider`}
                              value={selectedConnectionId}
                              onChange={setSelectedConnectionId}
                              options={connectionOptions}
                            />
                          </>
                        )}
                        postConnectionElement={(
                          <div className="post-output-toggle-row">
                            <label className="node-toggle post-output-toggle nodrag">
                              <input
                                className="nodrag nowheel"
                                type="checkbox"
                                checked={node.data.runAfterRpOutput ?? false}
                                readOnly
                              />
                              Prepare next turn when reached
                            </label>
                          </div>
                        )}
                        renderHandles={false}
                        onControlChange={changePreviewControl}
                        onGeneratedButtonClick={(label) => void runPreviewCode(label)}
                        onStateButtonClick={clickPreviewStateButton}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="storybook-chat-panel">
              <div className="storybook-chat-header">
                <span className="panel-title">Node Assistant</span>
                <span className="panel-subtitle">
                  {customNodeIsEmpty
                    ? 'Describe the node you want. The assistant will later generate a checked definition.'
                    : 'Ask questions, describe changes, or paste an error you want fixed.'}
                </span>
              </div>

              {diagnostics.length > 0 && (
                <div className="custom-node-diagnostics" aria-label="Custom Node diagnostics">
                  {diagnostics.map((diagnostic) => (
                    <div className="custom-node-diagnostic" key={diagnostic.id}>
                      <div className="custom-node-diagnostic-row">
                        <button
                          className="custom-node-diagnostic-toggle"
                          type="button"
                          onClick={() => onToggleDiagnostic(diagnostic.id)}
                          aria-expanded={diagnostic.expanded}
                        >
                          <span aria-hidden="true">{diagnostic.expanded ? 'v' : '>'}</span>
                          <strong>{diagnostic.source}</strong>
                        </button>
                        <button
                          className="custom-node-diagnostic-dismiss"
                          type="button"
                          onClick={() => onDismissDiagnostic(diagnostic.id)}
                          aria-label={`Dismiss ${diagnostic.source}`}
                        >
                          x
                        </button>
                      </div>
                      {diagnostic.expanded && (
                        <pre>{diagnostic.message}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="storybook-chat-log">
                {messages.length === 0 ? (
                  customNodeIsEmpty ? (
                    <div className="chat-empty-state">
                      <div className="assistant-avatar-large">AI</div>
                      <p className="empty-title">Build a Custom Node</p>
                      <p className="empty-description">
                        Ask for simple text, number, UI, routing, or LLM helper behavior.
                      </p>
                      <ul className="prompt-suggestions custom-node-prompt-suggestions">
                        {customNodePromptSuggestions.map((suggestion) => (
                          <li key={suggestion.title} onClick={() => setDraft(suggestion.prompt)}>
                            <span className="prompt-suggestion-copy">
                              <strong>{suggestion.title}</strong>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="chat-message-row assistant custom-node-ready-message">
                      <div className="message-sender-avatar">AI</div>
                      <div className="chat-message-bubble">
                        <p>
                          This Custom Node already has a definition. Ask me how it works, tell me what to change, or use the diagnostics above if a workflow run failed.
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  messages.map((message, index) => (
                    <div className={`chat-message-row ${message.role}`} key={`${message.role}-${index}`}>
                      <div className="message-sender-avatar">
                        {message.role === 'user' ? 'U' : message.role === 'assistant' ? 'AI' : '!'}
                      </div>
                      <div className="chat-message-bubble">
                        <p>{message.text}</p>
                      </div>
                    </div>
                  ))
                )}
                {isSubmitting && (
                  <div className="chat-message-row assistant thinking">
                    <div className="message-sender-avatar">AI</div>
                    <div className="chat-message-bubble typing-bubble">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form className="storybook-chat-form" onSubmit={submit}>
                <textarea
                  className="nodrag nowheel"
                  rows={4}
                  value={draft}
                  placeholder={customNodeIsEmpty ? 'Describe the Custom Node you want...' : 'Ask a question or describe the change you want...'}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      submitDraft();
                    }
                  }}
                />
                <button type="submit" className="send-message-button" disabled={isSubmitting || !draft.trim()}>
                  {isSubmitting ? 'Sending...' : 'Send'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

type StorybookCreatorDialogProps = {
  referenceCharacters?: Character[];
  identityLocked?: boolean;
  node: WorkflowNode;
  workflowNodes: WorkflowNode[];
  promptActionSettings: PromptActionRuntimeSettings;
  messages: StorybookCreatorMessage[];
  onRetry: (index: number) => Promise<void>;
  onClearChat: () => void;
  isSubmitting: boolean;
  connections: ConnectionPreset[];
  providerHealthById: Record<string, ProviderConnectionHealth>;
  onSubmit: (message: string, referenceIds?: string[]) => Promise<void>;
  onLoad: () => Promise<boolean>;
  onSaveStorybook: () => void;
  promptTextCustomPresets: Record<string, string>;
  setPromptTextCustomPresets: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  usedImageIds: ReadonlySet<string>;
  imageCaptionChangesById: ReadonlyMap<string, ImageCaptionChange[]>;
  onUpdateStorybook: (storybook: RpStorybook, status?: string) => boolean;
  onChangeImageCaptionUpdate: (change: ImageCaptionChange, caption: string) => void;
  onUpdateFormattedTextSettings: (settings: RpStorybookFormattedTextSettings) => void;
  onDescribeCharacterImage: (
    characterContext: string,
    image: RpStorybookCharacterImage,
    prompt: string,
  ) => Promise<string>;
  onLoadCharacterComfyLoras: (providerId: string) => Promise<string[]>;
  onGenerateCharacterComfyPreview: (request: {
    providerId: string;
    characterName: string;
    characterContext: string;
    loraName: string;
    appearance: string;
    scenarioPrompt: string;
  }) => Promise<Array<{ dataUrl: string; filename: string }>>;
  onGenerateCharacterVoicePreview: (request: {
    providerId: string;
    speechText: string;
    sampleDataUrl: string;
  }) => Promise<Array<{ dataUrl: string; filename: string }>>;
  onUnloadCharacterComfyModels: (providerId: string) => Promise<void>;
  onImportOpeningHistory: () => void;
  onClearOpeningHistory: () => void;
  onResetStorybook: () => void;
  onImportSillyTavernCharacter: () => Promise<void>;
  onImportCharacterCard: () => Promise<void>;
  onExportCharacter: (characterId: string) => Promise<void>;
  onDeleteCharacter: (characterId: string) => void;
  pendingConversion: {
    fileName?: string;
    sourceValue: unknown;
    result: StorybookConversionResult;
    phase: 'convert' | 'review';
  } | null;
  onBeginConversionReview: () => void;
  onImproveConversion: () => Promise<void>;
  onApplyConversion: () => string | null;
  onCancelConversion: () => void;
  onClose: () => void;
};

const storybookFormattedTextSettingControls: Array<{
  key: keyof RpStorybookFormattedTextSettings;
  label: string;
}> = [
  { key: 'title', label: 'Title' },
  { key: 'introduction', label: 'Intro' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'characters', label: 'Charakter' },
  { key: 'openingHistory', label: 'Opening History' },
  { key: 'characterImages', label: 'Character Images' },
  { key: 'relationships', label: 'Contacts & Relationships' },
  { key: 'hiddenAgency', label: 'Hidden Agency' },
];

type StorybookImageOwner = { kind: 'character'; characterId: string };
type CharacterImagesDialogMode = 'images' | 'profile';
type ProfileCrop = NonNullable<RpStorybookCharacterProfileImage['crop']>;

function storybookImageOwnerKey(owner: StorybookImageOwner) {
  return `character:${owner.characterId}`;
}

function storybookImageOwnerName(storybook: RpStorybook, owner: StorybookImageOwner) {
  const character = storybook.characters.find((entry) => entry.id === owner.characterId);
  return character?.name || character?.id || 'Character';
}

function storybookImageOwnerContext(storybook: RpStorybook, owner: StorybookImageOwner) {
  const character = storybook.characters.find((entry) => entry.id === owner.characterId);
  if (!character) {
    return `Name: ${storybookImageOwnerName(storybook, owner)}`;
  }
  return [
    character.name ? `Name: ${character.name}` : '',
    character.description ? `Description: ${character.description}` : '',
    character.personality ? `Personality: ${character.personality}` : '',
    character.speechStyle ? `Speech Style: ${character.speechStyle}` : '',
    character.role ? `Role: ${character.role}` : '',
  ].filter(Boolean).join('\n') || `Name: ${storybookImageOwnerName(storybook, owner)}`;
}

function storybookImageOwnerImages(storybook: RpStorybook, owner: StorybookImageOwner) {
  return storybook.characters.find((character) => character.id === owner.characterId)?.images ?? [];
}

function withStorybookImageOwnerImages(
  storybook: RpStorybook,
  owner: StorybookImageOwner,
  images: RpStorybookCharacterImage[],
): RpStorybook {
  return {
    ...storybook,
    characters: storybook.characters.map((character) =>
      character.id === owner.characterId
        ? {
            ...character,
            ...(character.profileImage && !images.some((image) => image.id === character.profileImage?.imageId)
              ? { profileImage: undefined }
              : {}),
            images,
          }
        : character
    ),
  };
}

function withStorybookCharacterProfileImage(
  storybook: RpStorybook,
  owner: StorybookImageOwner,
  profileImage: RpStorybookCharacterProfileImage | undefined,
): RpStorybook {
  return {
    ...storybook,
    characters: storybook.characters.map((character) =>
      character.id === owner.characterId ? withCharacterPortrait(character, profileImage) : character
    ),
  };
}

function storybookImageOwnerProfileImage(storybook: RpStorybook, owner: StorybookImageOwner) {
  return storybook.characters.find((character) => character.id === owner.characterId)?.profileImage;
}

function storybookCharacterComfyConfig(storybook: RpStorybook, characterId: string) {
  return storybook.characters.find((character) => character.id === characterId)?.comfyConfig ?? {
    loraName: '',
    loraUrl: '',
    appearance: '',
  };
}

function storybookCharacterComfyConfigured(character: { comfyConfig?: RpStorybookCharacterComfyConfig }) {
  return Boolean(
    character.comfyConfig?.appearance.trim() ||
    character.comfyConfig?.loraName.trim(),
  );
}

function usedCreateImagePromptActions(
  nodes: WorkflowNode[],
  promptActionSettings: PromptActionRuntimeSettings,
) {
  return nodes.flatMap((node): PromptActionConfig[] => {
    if (
      node.data.kind !== undefined ||
      (node.data.nodeType !== 'llm-prompt' && node.data.nodeType !== 'llm-prompt-switch')
    ) {
      return [];
    }
    // Merge the runtime prompt-action settings (where the provider dropdown writes
    // comfyProviderId), like the run path does. Reading only the stored
    // llmPromptActions produced a false "no ComfyUI provider" warning even though
    // the run resolves the provider and image generation works.
    const actionConfigs = withPromptActionRuntimeSettingsList(
      promptActionConfigs(node.data.llmPromptActions),
      promptActionSettings,
    );
    const promptTexts = node.data.nodeType === 'llm-prompt'
      ? [node.data.llmPromptBefore ?? '', node.data.llmPromptAfter ?? '']
      : [
          ...llmPromptSwitchPromptBeforesByOutput(node.data).flat(),
          ...llmPromptSwitchPromptAftersByOutput(node.data).flat(),
        ];
    return promptTexts
      .flatMap((text) => parsePromptActionTokens(text))
      .map((token) => configForPromptActionToken(actionConfigs, token.title))
      .filter((action) => action.actionId === 'createImage');
  });
}

function storybookCharacterComfyStatus({
  character,
  createImageActions,
  connections,
  providerHealthById,
}: {
  character: { name?: string; comfyConfig?: RpStorybookCharacterComfyConfig };
  createImageActions: PromptActionConfig[];
  connections: ConnectionPreset[];
  providerHealthById: Record<string, ProviderConnectionHealth>;
}) {
  const characterConfigured = storybookCharacterComfyConfigured(character);
  if (!characterConfigured) {
    return {
      active: false,
      text: 'ComfyUI character generation is not configured for this character.',
    };
  }
  if (createImageActions.length === 0) {
    return {
      active: false,
      text: 'This function is not used because the workflow does not call a Create character phone image action.',
    };
  }
  const selectedProviderIds = Array.from(new Set(
    createImageActions
      .map((action) => action.comfyProviderId?.trim() ?? '')
      .filter(Boolean),
  ));
  if (selectedProviderIds.length === 0) {
    return {
      active: false,
      text: 'This function is not used because no ComfyUI provider is selected in the Create character phone image action.',
    };
  }
  const comfyProviderIds = new Set(connections.filter(isComfyImageConnection).map((connection) => connection.id));
  const missingProvider = selectedProviderIds.find((providerId) => !comfyProviderIds.has(providerId));
  if (missingProvider) {
    return {
      active: false,
      text: 'This function is not used because the selected ComfyUI provider is no longer available.',
    };
  }
  const healthValues = selectedProviderIds.map((providerId) => providerHealthById[providerId]);
  if (healthValues.some((health) => health?.status === 'online')) {
    return {
      active: true,
      text: 'This character setup is used by the workflow Create character phone image action.',
    };
  }
  if (healthValues.some((health) => health?.status === 'checking' || health?.status === 'unknown')) {
    return {
      active: false,
      text: 'This function is not used yet because the selected ComfyUI provider has not been checked.',
    };
  }
  if (healthValues.some((health) => health?.status === 'warning')) {
    return {
      active: false,
      text: 'This function is not used yet because the selected ComfyUI provider setup is incomplete.',
    };
  }
  return {
    active: false,
    text: 'This function is not used because ComfyUI is offline.',
  };
}

function withStorybookCharacterComfyConfig(
  storybook: RpStorybook,
  characterId: string,
  comfyConfig: RpStorybookCharacterComfyConfig,
): RpStorybook {
  return {
    ...storybook,
    characters: storybook.characters.map((character) =>
      character.id === characterId
        ? { ...character, comfyConfig }
        : character
    ),
  };
}

function storybookCharacterVoiceConfig(
  storybook: RpStorybook,
  characterId: string,
): RpStorybookCharacterVoiceConfig {
  return storybook.characters.find((character) => character.id === characterId)?.voiceConfig ??
    defaultRpStorybookCharacterVoiceConfig();
}

function withStorybookCharacterVoiceConfig(
  storybook: RpStorybook,
  characterId: string,
  voiceConfig: RpStorybookCharacterVoiceConfig,
): RpStorybook {
  return {
    ...storybook,
    characters: storybook.characters.map((character) =>
      character.id === characterId
        ? { ...character, voiceConfig }
        : character
    ),
  };
}

function storybookCharacterBanking(
  storybook: RpStorybook,
  characterId: string,
): RpStorybookCharacterBanking {
  return storybook.characters.find((character) => character.id === characterId)?.banking ??
    defaultRpStorybookCharacterBanking();
}

function characterPhoneSummary(character: RpStorybookCharacter) {
  const banking = character.banking ?? defaultRpStorybookCharacterBanking();
  const accountStatus = (created: boolean) => (
    <span
      className={`character-phone-account-status${created ? ' created' : ''}`}
      aria-label={created ? 'Account created' : 'Account not created'}
    >
      {created ? '✓' : '×'}
    </span>
  );
  const onlyFriendsCreated = Boolean(character.apps?.onlyfriends?.enabled);
  const matchMeCreated = Boolean(character.apps?.matchme?.enabled);
  return <span className="character-phone-summary">
    <span>Bank: {formatBankingAmount(banking.startBalance)}</span>
    <span className="character-phone-summary-separator" aria-hidden="true">·</span>
    <span>Fotogram {accountStatus(true)}</span>
    <span className="character-phone-summary-separator" aria-hidden="true">·</span>
    <span>OnlyFriends {accountStatus(onlyFriendsCreated)}</span>
    <span className="character-phone-summary-separator" aria-hidden="true">·</span>
    <span>MatchMe {accountStatus(matchMeCreated)}</span>
  </span>;
}

function storybookCharacterImageFromAttachment(
  image: ChatImageAttachment,
): RpStorybookCharacterImage {
  return {
    id: image.id,
    name: image.id,
    mimeType: 'image/jpeg',
    size: image.size,
    dataUrl: image.dataUrl,
    width: image.width,
    height: image.height,
    description: '',
  };
}

function imageStatusText(images: RpStorybookCharacterImage[]) {
  if (images.length === 0) {
    return 'No images';
  }
  const described = images.filter((image) => image.description.trim()).length;
  return `${images.length} image${images.length === 1 ? '' : 's'} · ${described} described`;
}

function imageProvenanceLabel(image: RpStorybookCharacterImage) {
  const receivedFrom = image.receivedFrom?.trim();
  if (receivedFrom) {
    return `Received from ${receivedFrom}`;
  }
  return image.imageAccess ? 'Image Access' : '';
}

const storybookImagePageSize = 100;
const profilePickOutputSize = 512;
const profilePickMinSize = 18;

function lastItem<T>(items: T[]) {
  return items.length ? items[items.length - 1] : undefined;
}

function storybookImages(storybook: RpStorybook) {
  return storybook.characters.flatMap((character) => character.images);
}

function storybookImageOwnerBase(storybook: RpStorybook, owner: StorybookImageOwner) {
  const character = storybook.characters.find((entry) => entry.id === owner.characterId);
  return storybookCharacterImageOwnerIdBase(character?.name ?? '', character?.id ?? owner.characterId);
}

function profileCropHeightPercent(crop: ProfileCrop, imageRatio: number) {
  return crop.size * imageRatio;
}

function clampProfileCrop(crop: ProfileCrop, imageRatio: number): ProfileCrop {
  const maxSize = Math.max(profilePickMinSize, Math.min(100, 100 / imageRatio));
  const size = Math.min(maxSize, Math.max(profilePickMinSize, crop.size));
  const maxX = Math.max(0, 100 - size);
  const maxY = Math.max(0, 100 - size * imageRatio);
  return {
    x: Math.min(maxX, Math.max(0, crop.x)),
    y: Math.min(maxY, Math.max(0, crop.y)),
    size,
  };
}

function centeredProfileCrop(imageRatio: number): ProfileCrop {
  const size = Math.min(56, 100, 100 / imageRatio);
  const crop = {
    x: (100 - size) / 2,
    y: (100 - size * imageRatio) / 2,
    size,
  };
  return clampProfileCrop(crop, imageRatio);
}

function imageElementFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image for profile pic.'));
    image.src = dataUrl;
  });
}

async function croppedProfileImageDataUrl(image: RpStorybookCharacterImage, crop: ProfileCrop) {
  const source = await imageElementFromDataUrl(image.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = profilePickOutputSize;
  canvas.height = profilePickOutputSize;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable.');
  }
  const sourceSize = (crop.size / 100) * source.naturalWidth;
  context.drawImage(
    source,
    (crop.x / 100) * source.naturalWidth,
    (crop.y / 100) * source.naturalHeight,
    sourceSize,
    sourceSize,
    0,
    0,
    profilePickOutputSize,
    profilePickOutputSize,
  );
  return canvas.toDataURL('image/jpeg', 0.9);
}

function ProfilePickDialog({
  characterName,
  image,
  currentProfileImage,
  onApply,
  onClose,
}: {
  characterName: string;
  image: RpStorybookCharacterImage;
  currentProfileImage?: RpStorybookCharacterProfileImage;
  onApply: (profileImage: RpStorybookCharacterProfileImage) => void;
  onClose: () => void;
}) {
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startCrop: ProfileCrop;
    frameWidth: number;
    frameHeight: number;
  } | null>(null);
  const [imageRatio, setImageRatio] = useState(() =>
    image.width && image.height ? image.width / image.height : 1
  );
  const [crop, setCrop] = useState<ProfileCrop>(() =>
    currentProfileImage?.imageId === image.id && currentProfileImage.crop
      ? currentProfileImage.crop
      : centeredProfileCrop(image.width && image.height ? image.width / image.height : 1)
  );
  const [status, setStatus] = useState('');
  const clampedCrop = clampProfileCrop(crop, imageRatio);
  const cropHeight = profileCropHeightPercent(clampedCrop, imageRatio);

  function beginDrag(mode: 'move' | 'resize', event: ReactPointerEvent<HTMLElement>) {
    const frame = imageFrameRef.current;
    if (!frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCrop: clampedCrop,
      frameWidth: rect.width,
      frameHeight: rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragCrop(event: ReactPointerEvent<HTMLElement>) {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - active.startClientX;
    const deltaY = event.clientY - active.startClientY;
    if (active.mode === 'move') {
      setCrop(clampProfileCrop({
        ...active.startCrop,
        x: active.startCrop.x + (deltaX / active.frameWidth) * 100,
        y: active.startCrop.y + (deltaY / active.frameHeight) * 100,
      }, imageRatio));
      return;
    }
    const deltaSize = Math.max(deltaX, deltaY) / active.frameWidth * 100;
    setCrop(clampProfileCrop({
      ...active.startCrop,
      size: active.startCrop.size + deltaSize,
    }, imageRatio));
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  async function applyProfileImage() {
    try {
      setStatus('Applying profile pic ...');
      const nextCrop = clampedCrop;
      const dataUrl = await croppedProfileImageDataUrl(image, nextCrop);
      onApply({
        imageId: image.id,
        dataUrl,
        crop: nextCrop,
      });
    } catch (error) {
      setStatus(`Profile pic failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);

  return (
    <div
      className="profile-pick-backdrop"
      role="presentation"
      {...backdropDismiss}
    >
      <section className="profile-pick-dialog" role="dialog" aria-modal="true" aria-label={`${characterName} profile pic`}>
        <div className="profile-pick-header">
          <div>
            <h4>Change Profile Pic</h4>
            <p>{image.name}</p>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            Close
          </button>
        </div>
        {status && <span className="run-note storybook-image-status">{status}</span>}
        <div className="profile-pick-stage">
          <div className="profile-pick-image-frame" ref={imageFrameRef}>
            <img
              src={image.dataUrl}
              alt={image.name}
              onLoad={(event) => {
                const loadedImage = event.currentTarget;
                const nextRatio = loadedImage.naturalWidth / loadedImage.naturalHeight || 1;
                setImageRatio(nextRatio);
                if (currentProfileImage?.imageId !== image.id) {
                  setCrop(centeredProfileCrop(nextRatio));
                }
              }}
            />
            <div className="profile-pick-scrim" aria-hidden="true" />
            <button
              type="button"
              className="profile-pick-crop"
              style={{
                left: `${clampedCrop.x}%`,
                top: `${clampedCrop.y}%`,
                width: `${clampedCrop.size}%`,
                height: `${cropHeight}%`,
              }}
              onPointerDown={(event) => beginDrag('move', event)}
              onPointerMove={dragCrop}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-label="Move profile crop"
            >
              <span className="profile-pick-crop-handle" aria-hidden="true" />
              <span
                className="profile-pick-crop-resize"
                role="presentation"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginDrag('resize', event);
                }}
                onPointerMove={dragCrop}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            </button>
          </div>
        </div>
        <div className="profile-pick-actions">
          <button className="inspect-button nodrag" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="inspect-button nodrag" type="button" onClick={() => onApply({ imageId: image.id, dataUrl: image.dataUrl })}>
            Use Full Image
          </button>
          <button className="contextual-action-button nodrag" type="button" onClick={() => void applyProfileImage()}>
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}

function CharacterImagesDialog({
  storybook,
  owner,
  initialMode,
  usedImageIds,
  imageCaptionChangesById,
  promptTextCustomPresets,
  setPromptTextCustomPresets,
  onUpdateStorybook,
  onChangeImageCaptionUpdate,
  onDescribeCharacterImage,
  onClose,
}: {
  storybook: RpStorybook;
  owner: StorybookImageOwner;
  initialMode: CharacterImagesDialogMode;
  usedImageIds: ReadonlySet<string>;
  imageCaptionChangesById: ReadonlyMap<string, ImageCaptionChange[]>;
  onUpdateStorybook: (storybook: RpStorybook, status?: string) => void;
  onChangeImageCaptionUpdate: (change: ImageCaptionChange, caption: string) => void;
  onDescribeCharacterImage: StorybookCreatorDialogProps['onDescribeCharacterImage'];
  promptTextCustomPresets: Record<string, string>;
  setPromptTextCustomPresets: StorybookCreatorDialogProps['setPromptTextCustomPresets'];
  onClose: () => void;
}) {
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<CharacterImagesDialogMode>(initialMode);
  const [describingIds, setDescribingIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(0);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [profilePickImageId, setProfilePickImageId] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [workflowPromptText, setWorkflowPromptText] = useState<string | undefined>();
  const characterName = storybookImageOwnerName(storybook, owner);
  const characterContext = storybookImageOwnerContext(storybook, owner);
  const images = storybookImageOwnerImages(storybook, owner);
  const profileImage = storybookImageOwnerProfileImage(storybook, owner);
  const imageDescriptionPrompt = rpStorybookImageDescriptionPromptSettings(storybook.imageDescriptionPrompt);
  const imageDescriptionPromptPresetKey = 'storybook.image-description-prompt';
  const localImageDescriptionPromptText = promptTextCustomPresets[imageDescriptionPromptPresetKey];
  const imageDescriptionPromptSource = promptPresetSource(
    imageDescriptionPrompt,
    defaultRpStorybookImageDescriptionPrompt,
    localImageDescriptionPromptText,
  );
  const imageDescriptionPromptText = promptPresetDisplayText(
    imageDescriptionPromptSource,
    imageDescriptionPrompt,
    defaultRpStorybookImageDescriptionPrompt,
    localImageDescriptionPromptText,
  );
  const effectiveWorkflowPromptText = workflowPromptText ?? (
    imageDescriptionPromptSource === 'workflow' ? imageDescriptionPrompt.customText : undefined
  );
  const [promptDraft, setPromptDraft] = useState(imageDescriptionPromptText);
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(images.map((image) => [image.id, image.description])),
  );
  const selectedImage = selectedImageId
    ? images.find((image) => image.id === selectedImageId) ?? null
    : null;
  const selectedImageCaptionHistory = selectedImage
    ? imageCaptionChangesById.get(selectedImage.id) ?? []
    : [];
  const selectedImageLatestCaptionChange = lastItem(selectedImageCaptionHistory);
  const profilePickImage = profilePickImageId
    ? images.find((image) => image.id === profilePickImageId) ?? null
    : null;
  const totalPages = Math.max(1, Math.ceil(images.length / storybookImagePageSize));
  const visiblePage = Math.min(page, totalPages - 1);
  const visibleImages = images.slice(
    visiblePage * storybookImagePageSize,
    (visiblePage + 1) * storybookImagePageSize,
  );
  const undescribedImages = images.filter((image) => !(descriptionDrafts[image.id] ?? image.description).trim());

  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (textarea && promptOpen) {
      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 17;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight + lineHeight * 4, 560)}px`;
    }
  }, [promptDraft, promptOpen]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) {
        return;
      }
      setPromptDraft(imageDescriptionPromptText);
    });
    return () => {
      active = false;
    };
  }, [imageDescriptionPromptText]);

  function commitPromptDraft() {
    const nextPrompt = imageDescriptionPromptSource === 'default' || promptDraft === defaultRpStorybookImageDescriptionPrompt
      ? defaultRpStorybookImageDescriptionPromptSettings()
      : { mode: 'custom' as const, customText: promptDraft };
    if (
      nextPrompt.mode === imageDescriptionPrompt.mode &&
      nextPrompt.customText === imageDescriptionPrompt.customText
    ) {
      return storybook;
    }
    const nextStorybook = {
      ...storybook,
      imageDescriptionPrompt: nextPrompt,
    };
    onUpdateStorybook(nextStorybook, 'Updated image description prompt.');
    return nextStorybook;
  }

  function saveLocalImageDescriptionPrompt(value: string) {
    setPromptTextCustomPresets((current) => ({
      ...current,
      [imageDescriptionPromptPresetKey]: value,
    }));
  }

  function updateImageDescriptionPromptForSource(source: PromptPresetSource) {
    if (imageDescriptionPromptSource === 'workflow' && imageDescriptionPrompt.customText) {
      setWorkflowPromptText(imageDescriptionPrompt.customText);
    }
    const nextPrompt = promptSettingForSource(
      source,
      promptDraft,
      defaultRpStorybookImageDescriptionPrompt,
      localImageDescriptionPromptText,
      effectiveWorkflowPromptText,
    );
    if (source === 'custom') {
      saveLocalImageDescriptionPrompt(nextPrompt.customText ?? defaultRpStorybookImageDescriptionPrompt);
    }
    const nextStorybook = {
      ...storybook,
      imageDescriptionPrompt: nextPrompt.customText === defaultRpStorybookImageDescriptionPrompt
        ? defaultRpStorybookImageDescriptionPromptSettings()
        : nextPrompt,
    };
    setPromptDraft(
      source === 'default'
        ? defaultRpStorybookImageDescriptionPrompt
        : nextPrompt.customText ?? defaultRpStorybookImageDescriptionPrompt,
    );
    onUpdateStorybook(
      nextStorybook,
      source === 'default'
        ? 'Using default image description prompt.'
        : source === 'custom'
          ? 'Using custom image description prompt.'
          : 'Using workflow image description prompt.',
    );
  }

  async function openImages() {
    try {
      setStatus('Opening images ...');
      const result = await window.rpgraph.selectImages();
      if (result.canceled || result.images.length === 0) {
        setStatus('');
        return;
      }
      const ownerBase = storybookImageOwnerBase(storybook, owner);
      const reservedImageIds = new Set(storybookImages(storybook).map((image) => image.id));
      const pendingImages: Array<Pick<RpStorybookCharacterImage, 'id'>> = [...images];
      const attachments = await Promise.all(
        result.images.map((image) => normalizeImageAttachment(image, () => {
          const id = nextStorybookCharacterImageId(ownerBase, pendingImages, reservedImageIds);
          reservedImageIds.add(id);
          pendingImages.push({ id });
          return id;
        })),
      );
      const nextImages = [
        ...images,
        ...attachments.map(storybookCharacterImageFromAttachment),
      ];
      onUpdateStorybook(
        withStorybookImageOwnerImages(storybook, owner, nextImages),
        `Added ${attachments.length} image${attachments.length === 1 ? '' : 's'} for ${characterName}.`,
      );
      setStatus(`Added ${attachments.length} image${attachments.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(`Image load failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function removeImage(imageId: string) {
    if (usedImageIds.has(imageId)) {
      setStatus('Cannot delete: image is used in chat history.');
      return;
    }
    const nextImages = images.filter((image) => image.id !== imageId);
    if (selectedImageId === imageId) {
      setSelectedImageId(null);
    }
    onUpdateStorybook(
      withStorybookImageOwnerImages(storybook, owner, nextImages),
      `Removed image from ${characterName}.`,
    );
  }

  function draftDescription(imageId: string, description: string) {
    setDescriptionDrafts((current) => ({ ...current, [imageId]: description }));
  }

  function commitDescription(imageId: string) {
    const currentImage = images.find((image) => image.id === imageId);
    const nextDescription = (descriptionDrafts[imageId] ?? currentImage?.description ?? '').trim();
    const captionChange = lastItem(imageCaptionChangesById.get(imageId) ?? []);
    if (
      !currentImage ||
      (currentImage.description === nextDescription &&
        (!captionChange || captionChange.afterCaption === nextDescription))
    ) {
      return;
    }
    if (captionChange) {
      onChangeImageCaptionUpdate(captionChange, nextDescription);
      return;
    }
    const nextImages = images.map((image) =>
      image.id === imageId ? { ...image, description: nextDescription } : image
    );
    onUpdateStorybook(
      withStorybookImageOwnerImages(storybook, owner, nextImages),
      `Updated image description for ${characterName}.`,
    );
  }

  function commitAllDescriptionDrafts(baseStorybook = storybook) {
    const nextImages = images.map((image) => ({
      ...image,
      description: descriptionDrafts[image.id] ?? image.description,
    }));
    const changed = nextImages.some((image, index) => image.description !== images[index]?.description);
    if (!changed) {
      return baseStorybook;
    }
    const nextStorybook = withStorybookImageOwnerImages(baseStorybook, owner, nextImages);
    onUpdateStorybook(nextStorybook, `Updated image descriptions for ${characterName}.`);
    return nextStorybook;
  }

  function closeDialog() {
    const activeStorybook = commitPromptDraft();
    commitAllDescriptionDrafts(activeStorybook);
    onClose();
  }

  function closeImageDetail() {
    if (selectedImageId) {
      commitDescription(selectedImageId);
    }
    setSelectedImageId(null);
  }

  function applyProfileImage(profileImageValue: RpStorybookCharacterProfileImage) {
    onUpdateStorybook(
      withStorybookCharacterProfileImage(storybook, owner, profileImageValue),
      `Updated profile pic for ${characterName}.`,
    );
    setProfilePickImageId(null);
    setStatus('Profile pic applied.');
  }

  async function describeImage(image: RpStorybookCharacterImage) {
    setDescribingIds((current) => new Set(current).add(image.id));
    try {
      setStatus(`Describing ${image.name} ...`);
      const activeStorybook = commitPromptDraft();
      const activePrompt = rpStorybookImageDescriptionPromptText(activeStorybook.imageDescriptionPrompt);
      const description = await onDescribeCharacterImage(characterContext, image, activePrompt);
      setDescriptionDrafts((current) => ({ ...current, [image.id]: description }));
      const nextImages = images.map((entry) =>
        entry.id === image.id ? { ...entry, description } : entry
      );
      const nextStorybook = withStorybookImageOwnerImages(activeStorybook, owner, nextImages);
      onUpdateStorybook(nextStorybook, `Described image for ${characterName}.`);
      setStatus(`Described ${image.name}.`);
      return nextStorybook;
    } catch (error) {
      setStatus(`Describe failed: ${error instanceof Error ? error.message : String(error)}`);
      return storybook;
    } finally {
      setDescribingIds((current) => {
        const next = new Set(current);
        next.delete(image.id);
        return next;
      });
    }
  }

  async function describeImages(targetImages = images) {
    if (targetImages.length === 0) {
      setStatus('No images to describe.');
      return;
    }
    const activeStorybook = commitPromptDraft();
    const activePrompt = rpStorybookImageDescriptionPromptText(activeStorybook.imageDescriptionPrompt);
    let nextImages = images.map((image) => ({
      ...image,
      description: descriptionDrafts[image.id] ?? image.description,
    }));
    let describedCount = 0;
    for (const image of targetImages) {
      setDescribingIds((current) => new Set(current).add(image.id));
      try {
        setStatus(`Describing ${image.name} ...`);
        const description = await onDescribeCharacterImage(characterContext, image, activePrompt);
        nextImages = nextImages.map((entry) =>
          entry.id === image.id ? { ...entry, description } : entry
        );
        describedCount += 1;
        setDescriptionDrafts((current) => ({ ...current, [image.id]: description }));
      } catch (error) {
        setStatus(`Describe failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setDescribingIds((current) => {
          const next = new Set(current);
          next.delete(image.id);
          return next;
        });
      }
    }
    if (describedCount === 0) {
      return;
    }
    onUpdateStorybook(
      withStorybookImageOwnerImages(activeStorybook, owner, nextImages),
      `Described ${describedCount} image${describedCount === 1 ? '' : 's'} for ${characterName}.`,
    );
    setStatus(`Described ${describedCount} image${describedCount === 1 ? '' : 's'}.`);
  }
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(closeDialog);
  const promptBackdropDismiss = useBackdropDismiss<HTMLDivElement>(() => setPromptOpen(false));
  const detailBackdropDismiss = useBackdropDismiss<HTMLDivElement>(closeImageDetail);

  return (
    <div
      className="storybook-image-dialog-backdrop"
      role="presentation"
      {...backdropDismiss}
    >
      <section className="storybook-image-dialog" role="dialog" aria-modal="true" aria-label={`${characterName} images`}>
        <div className="storybook-image-dialog-header">
          <div>
            <h3>{characterName}</h3>
            <p>{imageStatusText(images)}</p>
          </div>
          <div className="storybook-image-dialog-actions">
            <button
              type="button"
              className="node-info-button storybook-image-context-help nodrag"
              aria-label="Image List context help"
              data-tooltip="Add and describe character images here so prompts and phone actions can reference stored image IDs."
            >
              ?
            </button>
            <button className="inspect-button nodrag" type="button" onClick={() => void openImages()}>
              Open Images
            </button>
            <button
              className={`inspect-button nodrag${mode === 'profile' ? ' active' : ''}`}
              type="button"
              disabled={images.length === 0}
              onClick={() => setMode((current) => current === 'profile' ? 'images' : 'profile')}
            >
              Change Profile Pic
            </button>
            {profileImage && <button className="inspect-button nodrag" type="button" onClick={() => {
              onUpdateStorybook(withStorybookCharacterProfileImage(storybook, owner, undefined), `Cleared profile pic for ${characterName}.`);
              setStatus('Character profile pic cleared.');
            }}>
              Clear Profile Pic
            </button>}
            <button
              className="inspect-button nodrag"
              type="button"
              onClick={() => setPromptOpen((current) => !current)}
            >
              Prompt
            </button>
            <button
              className="inspect-button nodrag"
              type="button"
              disabled={undescribedImages.length === 0 || describingIds.size > 0}
              onClick={() => void describeImages(undescribedImages)}
            >
              Describe New Images
            </button>
            <button
              className="inspect-button nodrag"
              type="button"
              disabled={images.length === 0 || describingIds.size > 0}
              onClick={() => void describeImages(images)}
            >
              Describe All Images
            </button>
            <button type="button" className="close-button" onClick={closeDialog}>
              Close
            </button>
          </div>
        </div>
        {status && <span className="run-note storybook-image-status">{status}</span>}
        {promptOpen && (
          <div
            className="storybook-image-prompt-backdrop"
            role="presentation"
            {...promptBackdropDismiss}
          >
            <section
              className="storybook-image-prompt-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Image Description Prompt"
            >
              <div className="storybook-image-prompt-header">
                <h4>Image Description Prompt</h4>
                <button
                  type="button"
                  className="inspect-button nodrag"
                  onClick={() => setPromptOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="storybook-image-prompt-body">
                <div className="event-manager-prompt-toolbar">
                  <div className="autoturn-instruction-mode" role="group" aria-label="Image Description Prompt mode">
                    <button
                      type="button"
                      className={imageDescriptionPromptSource === 'default' ? 'active' : ''}
                      onClick={() => updateImageDescriptionPromptForSource('default')}
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      className={imageDescriptionPromptSource === 'custom' ? 'active' : ''}
                      onClick={() => updateImageDescriptionPromptForSource('custom')}
                    >
                      Custom
                    </button>
                    <button
                      type="button"
                      className={imageDescriptionPromptSource === 'workflow' ? 'active' : ''}
                      disabled={!effectiveWorkflowPromptText}
                      onClick={() => updateImageDescriptionPromptForSource('workflow')}
                    >
                      In Workflow
                    </button>
                  </div>
                </div>
                <label className="storybook-image-prompt-label">
                  PROMPT TEXT
                  <textarea
                    ref={promptTextareaRef}
                    value={promptDraft}
                    rows={14}
                    disabled={imageDescriptionPromptSource === 'default'}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPromptDraft(value);
                      if (imageDescriptionPromptSource === 'custom') {
                        saveLocalImageDescriptionPrompt(value);
                      }
                    }}
                    onBlur={() => commitPromptDraft()}
                  />
                </label>
              </div>
              <div className="storybook-image-prompt-actions">
                <button
                  className="inspect-button nodrag"
                  type="button"
                  onClick={() => updateImageDescriptionPromptForSource('default')}
                >
                  Reset Prompt
                </button>
                <button
                  className="inspect-button nodrag"
                  type="button"
                  onClick={() => {
                    commitPromptDraft();
                    setPromptOpen(false);
                  }}
                >
                  Save Prompt
                </button>
              </div>
            </section>
          </div>
        )}
        {images.length > storybookImagePageSize && (
          <div className="storybook-image-pagination image-gallery-pagination">
            <button
              type="button"
              disabled={visiblePage === 0}
              onClick={() => setPage(Math.max(0, visiblePage - 1))}
            >
              Previous
            </button>
            <span>
              Page {visiblePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={visiblePage >= totalPages - 1}
              onClick={() => setPage(Math.min(totalPages - 1, visiblePage + 1))}
            >
              Next
            </button>
          </div>
        )}
        <div className="storybook-image-grid">
          {images.length ? (
            visibleImages.map((image) => {
              const description = descriptionDrafts[image.id] ?? image.description;
              const receivedLabel = imageProvenanceLabel(image);
              const usedInHistory = usedImageIds.has(image.id);
              const aspectRatio = image.width && image.height
                ? `${image.width} / ${image.height}`
                : undefined;
              return (
                <article className="storybook-image-item" key={image.id}>
                  <button
                    className={`storybook-image-remove${usedInHistory ? ' disabled' : ''}`}
                    type="button"
                    aria-disabled={usedInHistory}
                    title={usedInHistory ? 'Cannot delete: used in chat history' : `Remove ${image.name}`}
                    onClick={() => removeImage(image.id)}
                  >
                    x
                  </button>
                  <button
                    className={`storybook-image-tile${description.trim() ? ' has-description' : ''}${
                      profileImage?.imageId === image.id ? ' profile-selected' : ''
                    }`}
                    type="button"
                    title={[receivedLabel, description.trim() || image.name].filter(Boolean).join('\n')}
                    onClick={() => {
                      if (mode === 'profile') {
                        setProfilePickImageId(image.id);
                        return;
                      }
                      setSelectedImageId(image.id);
                    }}
                  >
                    <div className="storybook-image-preview" style={aspectRatio ? { aspectRatio } : undefined}>
                      <img src={image.dataUrl} alt={image.name} loading="lazy" decoding="async" />
                      {receivedLabel && (
                        <span className="storybook-image-received-badge" title={receivedLabel}>
                          {receivedLabel}
                        </span>
                      )}
                    </div>
                    {description.trim() && (
                      <span className="storybook-image-caption">{description}</span>
                    )}
                  </button>
                </article>
              );
            })
          ) : (
            <div className="storybook-image-empty">
              <p>No character images yet.</p>
            </div>
          )}
        </div>
        {selectedImage && (
          <div
            className="storybook-image-detail-backdrop"
            role="presentation"
            {...detailBackdropDismiss}
          >
            <section
              className="storybook-image-detail"
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedImage.name} description`}
            >
              <div className="storybook-image-detail-header">
                <div>
                  <h4>{selectedImage.name}</h4>
                  <p>
                    {[selectedImage.width && selectedImage.height ? `${selectedImage.width} x ${selectedImage.height}` : '', `${(selectedImage.size / 1024).toFixed(1)} KB`]
                      .filter(Boolean)
                      .join(' / ')}
                  </p>
                  {imageProvenanceLabel(selectedImage) && (
                    <p className="storybook-image-received-detail">{imageProvenanceLabel(selectedImage)}</p>
                  )}
                </div>
                <button type="button" className="close-button" onClick={closeImageDetail}>
                  Close
                </button>
              </div>
              <div className="storybook-image-detail-body">
                <div className="storybook-image-detail-preview">
                  <img src={selectedImage.dataUrl} alt={selectedImage.name} />
                  {(descriptionDrafts[selectedImage.id] ?? selectedImage.description).trim() && (
                    <div className="image-preview-caption">
                      {descriptionDrafts[selectedImage.id] ?? selectedImage.description}
                    </div>
                  )}
                </div>
                <aside className="storybook-image-detail-side-panel">
                  <label className="storybook-image-description storybook-image-detail-description">
                    DESCRIPTION
                    <textarea
                      value={descriptionDrafts[selectedImage.id] ?? selectedImage.description}
                      rows={8}
                      onChange={(event) => draftDescription(selectedImage.id, event.target.value)}
                      placeholder="No description yet."
                    />
                  </label>
                  <div className="storybook-image-detail-actions">
                    <button
                      className="contextual-action-button nodrag"
                      type="button"
                      disabled={describingIds.has(selectedImage.id)}
                      onClick={() => void describeImage(selectedImage)}
                    >
                      {describingIds.has(selectedImage.id) ? 'Describing ...' : 'Describe'}
                    </button>
                    <button
                      className="inspect-button nodrag"
                      type="button"
                      onClick={() => commitDescription(selectedImage.id)}
                    >
                      {selectedImageLatestCaptionChange ? 'Change Update' : 'Save Caption'}
                    </button>
                    <button
                      className="inspect-button nodrag danger"
                      type="button"
                      onClick={() => removeImage(selectedImage.id)}
                    >
                      Remove Image
                    </button>
                  </div>
                  <CaptionHistoryList items={captionHistoryTimeline(selectedImageCaptionHistory)} />
                </aside>
              </div>
            </section>
          </div>
        )}
        {profilePickImage && (
          <ProfilePickDialog
            characterName={characterName}
            image={profilePickImage}
            currentProfileImage={profileImage}
            onApply={applyProfileImage}
            onClose={() => setProfilePickImageId(null)}
          />
        )}
      </section>
    </div>
  );
}

/**
 * Character Detail page — "Appearance &amp; Image Generation" subsection.
 *
 * Dissolved from the old CharacterSetupDialog modal's "Image Setup" tab (per
 * the redundancy-removal instruction: a submenu that fits thematically into a
 * left-menu site gets folded into that site instead of staying a separate
 * dialog). Writes straight to the character's comfyConfig via onUpdateStorybook
 * on every change instead of buffering into a local draft committed on modal
 * close — there is no modal/close step anymore. The Appearance textarea itself
 * stays on the Character Detail identity fields (not duplicated here) since
 * that field already lived on the character card even before this change.
 */
function CharacterImageSetupSection({
  storybook,
  character,
  workflowNodes,
  connections,
  providerHealthById,
  promptActionSettings,
  onUpdateStorybook,
  onLoadCharacterComfyLoras,
  onGenerateCharacterComfyPreview,
  onUnloadCharacterComfyModels,
}: {
  storybook: RpStorybook;
  character: RpStorybookCharacter;
  workflowNodes: WorkflowNode[];
  connections: ConnectionPreset[];
  providerHealthById: Record<string, ProviderConnectionHealth>;
  promptActionSettings: PromptActionRuntimeSettings;
  onUpdateStorybook: (storybook: RpStorybook, status?: string) => boolean;
  onLoadCharacterComfyLoras: StorybookCreatorDialogProps['onLoadCharacterComfyLoras'];
  onGenerateCharacterComfyPreview: StorybookCreatorDialogProps['onGenerateCharacterComfyPreview'];
  onUnloadCharacterComfyModels: StorybookCreatorDialogProps['onUnloadCharacterComfyModels'];
}) {
  const characterId = character.id;
  const characterName = character.name || character.id || 'Character';
  const characterContext = [
    character.name ? `Name: ${character.name}` : '',
    character.description ? `Description: ${character.description}` : '',
    character.role ? `Role: ${character.role}` : '',
  ].filter(Boolean).join('\n') || `Name: ${characterName}`;
  const comfyConnections = connections.filter(isComfyImageConnection);
  const [providerId, setProviderId] = useState(comfyConnections[0]?.id ?? '');
  const [loraOptions, setLoraOptions] = useState<string[]>([]);
  const [previewScenarioId, setPreviewScenarioId] = useState<(typeof characterComfyPreviewScenarios)[number]['id']>('mirror-selfie');
  const [status, setStatus] = useState('');
  const [generating, setGenerating] = useState(false);
  const [unloading, setUnloading] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ dataUrl: string; filename: string } | null>(null);
  const loraOptionsCacheRef = useRef<Record<string, string[]>>({});
  const draft = storybookCharacterComfyConfig(storybook, characterId);
  const createImageActions = useMemo(() => usedCreateImagePromptActions(workflowNodes, promptActionSettings), [workflowNodes, promptActionSettings]);
  const comfyUsageStatus = storybookCharacterComfyStatus({
    character: { name: characterName, comfyConfig: draft },
    createImageActions,
    connections,
    providerHealthById,
  });

  function patchComfyConfig(patch: Partial<{ loraName: string; loraUrl: string; appearance: string }>) {
    onUpdateStorybook(
      withStorybookCharacterComfyConfig(storybook, characterId, { ...draft, ...patch }),
      `Image setup updated for ${characterName}.`,
    );
  }

  useEffect(() => {
    let active = true;
    if (!providerId) {
      queueMicrotask(() => {
        if (active) {
          setLoraOptions([]);
        }
      });
      return () => {
        active = false;
      };
    }
    const cachedLoras = loraOptionsCacheRef.current[providerId];
    if (cachedLoras) {
      queueMicrotask(() => {
        if (!active) {
          return;
        }
        setLoraOptions(cachedLoras);
        setStatus(cachedLoras.length ? `Loaded ${cachedLoras.length} cached LoRA${cachedLoras.length === 1 ? '' : 's'}.` : 'No LoRAs found.');
      });
      return () => {
        active = false;
      };
    }
    queueMicrotask(() => {
      if (active) {
        setStatus('Loading LoRAs ...');
      }
    });
    onLoadCharacterComfyLoras(providerId)
      .then((loras) => {
        if (!active) {
          return;
        }
        loraOptionsCacheRef.current = {
          ...loraOptionsCacheRef.current,
          [providerId]: loras,
        };
        setLoraOptions(loras);
        setStatus(loras.length ? `Loaded ${loras.length} LoRA${loras.length === 1 ? '' : 's'}.` : 'No LoRAs found.');
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setLoraOptions([]);
        setStatus(`Could not load LoRAs: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => {
      active = false;
    };
  }, [onLoadCharacterComfyLoras, providerId]);

  async function copyLoraUrl() {
    const loraUrl = draft.loraUrl?.trim() ?? '';
    if (!loraUrl) {
      setStatus('Add a LoRA source URL first.');
      return;
    }
    await copyTextToClipboard(loraUrl);
    setStatus('LoRA source URL copied.');
  }

  async function generatePreview() {
    if (!providerId) {
      setStatus('Choose a ComfyUI provider first.');
      return;
    }
    const scenario =
      characterComfyPreviewScenarios.find((entry) => entry.id === previewScenarioId) ??
      characterComfyPreviewScenarios[0];
    setGenerating(true);
    setPreviewImage(null);
    setStatus('Unloading local LLM models and generating test image ...');
    try {
      const images = await onGenerateCharacterComfyPreview({
        providerId,
        characterName,
        characterContext,
        loraName: draft.loraName,
        appearance: draft.appearance,
        scenarioPrompt: scenario.prompt,
      });
      setPreviewImage(images[0] ?? null);
      setStatus(images.length ? `Generated ${images.length} image${images.length === 1 ? '' : 's'}.` : 'No image returned.');
    } catch (error) {
      setStatus(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function unloadModels() {
    if (!providerId) {
      setStatus('Choose a ComfyUI provider first.');
      return;
    }
    setUnloading(true);
    setStatus('Unloading ComfyUI models ...');
    try {
      await onUnloadCharacterComfyModels(providerId);
      setStatus('ComfyUI models unloaded.');
    } catch (error) {
      setStatus(`Unload failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUnloading(false);
    }
  }

  const loraPickerOptions = Array.from(
    new Set(
      [draft.loraName, ...loraOptions]
        .map((name) => name.trim())
        .filter((name) => name.length > 0 && name !== comfyCharacterLoraName),
    ),
  );

  return (
    <div className="character-voice-card-group storybook-workbench-field wide">
      {status && <span className="run-note storybook-image-status">{status}</span>}
      <div className="character-comfy-body">
        <div className="character-comfy-form">
          <label className="character-comfy-field">
            <span>COMFYUI PROVIDER</span>
            <NodeCustomSelect
              value={providerId}
              onChange={(value) => setProviderId(String(value))}
              options={comfyConnections.length
                ? comfyConnections.map((connection) => providerOption(connection, providerHealthById[connection.id]))
                : [{ value: '', label: 'No ComfyUI provider', disabled: true }]}
            />
          </label>
          <label className="character-comfy-field">
            <span>CHARACTER LORA</span>
            <ModelIdPicker
              id={`character-comfy-lora-${characterId}`}
              value={draft.loraName}
              onChange={(value) => patchComfyConfig({ loraName: value })}
              options={loraPickerOptions}
              onOpenOptions={() => undefined}
              placeholder="Type or select a character LoRA"
              favoritesStorageKey={characterLoraFavoritesStorageKey}
            />
          </label>
          <label className="character-comfy-field">
            <span>LORA SOURCE URL</span>
            <div className="character-comfy-url-row">
              <input
                className="node-text-input nodrag"
                type="url"
                value={draft.loraUrl ?? ''}
                placeholder="https://..."
                onChange={(event) => patchComfyConfig({ loraUrl: event.currentTarget.value })}
              />
              <button type="button" className="contextual-action-button nodrag" onClick={() => void copyLoraUrl()}>
                Copy Link
              </button>
            </div>
          </label>
          <label className="character-comfy-field">
            <span>GENERATION IMAGE</span>
            <NodeCustomSelect
              value={previewScenarioId}
              onChange={(value) => setPreviewScenarioId(value)}
              options={characterComfyPreviewScenarios.map((scenario) => ({
                value: scenario.id,
                label: scenario.label,
              }))}
            />
          </label>
          <div className="character-comfy-actions">
            <button type="button" className="contextual-action-button nodrag" disabled={generating} onClick={() => void generatePreview()}>
              {generating ? 'Generating ...' : 'Generate Image'}
            </button>
            <button type="button" className="contextual-action-button nodrag" disabled={unloading} onClick={() => void unloadModels()}>
              {unloading ? 'Unloading ...' : 'Unload Models'}
            </button>
          </div>
        </div>
        <div className="character-comfy-preview">
          {generating ? (
            <div className="character-image-generating-box">
              <div className="character-voice-spinner" />
              <span>Generating test image ...</span>
            </div>
          ) : previewImage ? (
            <>
              <img src={previewImage.dataUrl} alt={previewImage.filename || `${characterName} generated preview`} />
              <span>{previewImage.filename || 'Generated preview'}</span>
            </>
          ) : (
            <p>Generate a test image to preview this character LoRA and appearance.</p>
          )}
        </div>
      </div>
      <p className={`character-comfy-usage-status${comfyUsageStatus.active ? ' active' : ''}`}>
        {comfyUsageStatus.text}
      </p>
    </div>
  );
}

/**
 * Character Detail page — "Voice" subsection. Dissolved from the old
 * CharacterSetupDialog modal's "Voice Setup" tab, same immediate-autosave
 * treatment as CharacterImageSetupSection above (writes straight to the
 * character's voiceConfig via onUpdateStorybook, no buffered draft).
 */
function CharacterVoiceSetupSection({
  storybook,
  character,
  connections,
  providerHealthById,
  onUpdateStorybook,
  onGenerateCharacterVoicePreview,
  onUnloadCharacterComfyModels,
}: {
  storybook: RpStorybook;
  character: RpStorybookCharacter;
  connections: ConnectionPreset[];
  providerHealthById: Record<string, ProviderConnectionHealth>;
  onUpdateStorybook: (storybook: RpStorybook, status?: string) => boolean;
  onGenerateCharacterVoicePreview: StorybookCreatorDialogProps['onGenerateCharacterVoicePreview'];
  onUnloadCharacterComfyModels: StorybookCreatorDialogProps['onUnloadCharacterComfyModels'];
}) {
  const characterId = character.id;
  const characterName = character.name || character.id || 'Character';
  const voiceConnections = connections.filter(isComfyVoiceConnection);
  const [voiceProviderId, setVoiceProviderId] = useState(voiceConnections[0]?.id ?? '');
  const [voiceTestText, setVoiceTestText] = useState('');
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [voiceClip, setVoiceClip] = useState<{ dataUrl: string; filename: string } | null>(null);
  const [status, setStatus] = useState('');
  const [unloading, setUnloading] = useState(false);
  const voiceConfig = storybookCharacterVoiceConfig(storybook, characterId);

  async function chooseVoiceSample() {
    try {
      const result = await window.rpgraph.selectAudio();
      if (result.canceled || !result.audio) {
        return;
      }
      onUpdateStorybook(
        withStorybookCharacterVoiceConfig(storybook, characterId, {
          sampleName: result.audio.name,
          sampleMimeType: result.audio.mimeType,
          sampleDataUrl: result.audio.dataUrl,
        }),
        `Voice sample updated for ${characterName}.`,
      );
      setVoiceClip(null);
      setStatus(`Voice sample selected: ${result.audio.name}.`);
    } catch (error) {
      setStatus(`Voice sample selection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function removeVoiceSample() {
    onUpdateStorybook(
      withStorybookCharacterVoiceConfig(storybook, characterId, defaultRpStorybookCharacterVoiceConfig()),
      `Voice sample removed for ${characterName}.`,
    );
    setVoiceClip(null);
  }

  async function generateVoicePreview() {
    if (!voiceProviderId) {
      setStatus('Choose a ComfyUI voice provider first.');
      return;
    }
    if (!voiceConfig.sampleDataUrl) {
      setStatus('Upload a voice sample for this character first.');
      return;
    }
    if (!voiceTestText.trim()) {
      setStatus('Enter a text the character should say.');
      return;
    }
    setVoiceGenerating(true);
    setVoiceClip(null);
    setStatus('Unloading local LLM models and generating voice clip ...');
    try {
      const clips = await onGenerateCharacterVoicePreview({
        providerId: voiceProviderId,
        speechText: voiceTestText,
        sampleDataUrl: voiceConfig.sampleDataUrl,
      });
      setVoiceClip(clips[0] ?? null);
      setStatus(clips.length ? `Generated ${clips.length} voice clip${clips.length === 1 ? '' : 's'}.` : 'No voice clip returned.');
    } catch (error) {
      setStatus(`Voice generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setVoiceGenerating(false);
    }
  }

  async function unloadVoiceModels() {
    if (!voiceProviderId) {
      setStatus('Choose a ComfyUI voice provider first.');
      return;
    }
    setUnloading(true);
    setStatus('Unloading ComfyUI models ...');
    try {
      await onUnloadCharacterComfyModels(voiceProviderId);
      setStatus('ComfyUI models unloaded.');
    } catch (error) {
      setStatus(`Unload failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUnloading(false);
    }
  }

  return (
    <div className="character-voice-body storybook-workbench-field wide">
      {status && <span className="run-note storybook-image-status">{status}</span>}
      <div className="character-voice-card">
        <label className="character-comfy-field">
          <span>VOICE PROVIDER</span>
          <NodeCustomSelect
            value={voiceProviderId}
            onChange={(value) => setVoiceProviderId(String(value))}
            options={voiceConnections.length
              ? voiceConnections.map((connection) => providerOption(connection, providerHealthById[connection.id]))
              : [{ value: '', label: 'No ComfyUI voice provider', disabled: true }]}
          />
        </label>
      </div>

      <div className="character-voice-card">
        <div className="character-voice-card-header">
          <span className="character-voice-card-title">VOICE SAMPLE (MP3)</span>
          <button type="button" className="contextual-action-button nodrag" onClick={() => void chooseVoiceSample()}>
            {voiceConfig.sampleDataUrl ? 'Replace MP3 Sample' : 'Choose MP3 Sample'}
          </button>
        </div>
        <p className="character-voice-hint">
          Upload a short MP3 voice sample of this character — ideally 10 to 20 seconds of
          clear speech without music or background noise. It is stored in the storybook and
          used as the reference voice for cloning.
        </p>
        {voiceConfig.sampleDataUrl ? (
          <DarkAudioPlayer
            src={voiceConfig.sampleDataUrl}
            title={voiceConfig.sampleName || 'Voice sample'}
            onRemove={removeVoiceSample}
            className="voice-sample-player"
          />
        ) : (
          <div className="character-voice-empty-sample">
            <span>No voice sample uploaded yet</span>
          </div>
        )}
      </div>

      <div className="character-voice-card">
        <span className="character-voice-card-title">VOICE GENERATION &amp; TESTING</span>
        <label className="character-comfy-field">
          <span>TEST TEXT</span>
          <textarea
            className="node-textarea nodrag nowheel"
            rows={3}
            value={voiceTestText}
            placeholder="Write a sentence the character should say ..."
            onChange={(event) => setVoiceTestText(event.currentTarget.value)}
          />
        </label>
        <div className="character-comfy-actions">
          <button
            type="button"
            className="contextual-action-button nodrag"
            disabled={voiceGenerating}
            onClick={() => void generateVoicePreview()}
          >
            {voiceGenerating ? 'Generating ...' : 'Generate Voice'}
          </button>
          <button type="button" className="contextual-action-button nodrag" disabled={unloading} onClick={() => void unloadVoiceModels()}>
            {unloading ? 'Unloading ...' : 'Unload Models'}
          </button>
        </div>

        {voiceGenerating ? (
          <div className="character-voice-generating-box">
            <div className="character-voice-spinner" />
            <span>Generating voice clip ...</span>
          </div>
        ) : voiceClip ? (
          <div className="character-voice-result-box">
            <span className="character-voice-result-label">GENERATED VOICE CLIP</span>
            <DarkAudioPlayer
              src={voiceClip.dataUrl}
              title={voiceClip.filename || 'Generated voice clip'}
              className="voice-generated-player"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A single immediate-autosave field on the workbench rail's editor pages
 * (`.storybook-workbench-field`, ported from V2's `InlineStorybookTextField`
 * pattern) — every keystroke writes straight through `onChange` to
 * `onUpdateStorybook`, there is no separate Apply/Save step.
 */
function WorkbenchTextField({
  label,
  hint,
  value,
  placeholder,
  multiline = true,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="storybook-workbench-field">
      <span>
        <span className="field-label">{label}</span>
        {hint ? <span className="storybook-workbench-field-hint">{hint}</span> : null}
      </span>
      {multiline ? (
        <textarea
          className="storybook-inline-edit-control nodrag nowheel"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : (
        <input
          className="storybook-inline-edit-control nodrag"
          type="text"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </label>
  );
}

function CopyFailedStorybookResponse({ message }: { message: StorybookCreatorMessage }) {
  const [status, setStatus] = useState('');
  return <>
    <button type="button" className="storybook-copy-error-link" onClick={async () => {
      try {
        await copyTextToClipboard(`App error:\n${message.text}\n\nRaw assistant response:\n${message.failedResponse}`);
        setStatus('Copied.');
      } catch {
        setStatus('Could not copy. Please try again.');
      }
    }}>Copy failed response</button>
    <span role="status" className="storybook-copy-error-status">{status}</span>
  </>;
}

export function StorybookCreatorDialog({
  referenceCharacters = [],
  node,
  workflowNodes,
  promptActionSettings,
  messages,
  isSubmitting,
  connections,
  providerHealthById,
  onSubmit,
  onClearChat,
  onRetry,
  onLoad,
  onSaveStorybook,
  promptTextCustomPresets,
  setPromptTextCustomPresets,
  usedImageIds,
  imageCaptionChangesById,
  onUpdateStorybook,
  onChangeImageCaptionUpdate,
  onUpdateFormattedTextSettings,
  onDescribeCharacterImage,
  onLoadCharacterComfyLoras,
  onGenerateCharacterComfyPreview,
  onGenerateCharacterVoicePreview,
  onUnloadCharacterComfyModels,
  onImportOpeningHistory,
  onClearOpeningHistory,
  onResetStorybook,
  onImportSillyTavernCharacter,
  onImportCharacterCard,
  onExportCharacter,
  onDeleteCharacter,
  pendingConversion,
  onBeginConversionReview,
  onImproveConversion,
  onApplyConversion,
  onCancelConversion,
  onClose,
  identityLocked = false,
}: StorybookCreatorDialogProps) {
  const [draft, setDraft] = useState('');
  const [viewMode, setViewMode] = useState<'ui' | 'json' | 'text'>('ui');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [fileActionStatus, setFileActionStatus] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [outputSettingsOpen, setOutputSettingsOpen] = useState(false);
  const outputSettingsMenuRef = useRef<HTMLDivElement | null>(null);
  const [imageOwner, setImageOwner] = useState<StorybookImageOwner | null>(null);
  const [imageDialogMode, setImageDialogMode] = useState<CharacterImagesDialogMode>('images');
  type WorkbenchSection = 'overview' | 'scenario' | 'intro' | 'history' | 'character' | 'phone' | 'gallery' | 'social' | 'bank';
  const [activeSection, setActiveSection] = useState<WorkbenchSection>('scenario');
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    | {
        title: string;
        message: string;
        confirmLabel: string;
        danger?: boolean;
        action: () => void;
      }
    | null
  >(null);
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);
  const parsedStorybook = useMemo(() => {
    try {
      return node.data.storybookJson ? parseRpStorybookJson(node.data.storybookJson) : emptyRpStorybook;
    } catch {
      return null;
    }
  }, [node.data.storybookJson]);
  const storybook = parsedStorybook ?? emptyRpStorybook;
  const editingDisabled = isSubmitting || !parsedStorybook;
  const estimatedPromptTokens = useMemo(
    () => estimatedRpStorybookPromptTokens(pendingConversion?.result.storybook ?? storybook),
    [pendingConversion, storybook],
  );
  const formattedTextSettings = rpStorybookFormattedTextSettings(node.data.storybookFormattedTextSettings);
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const relationshipCharacters = characterReferenceCandidates(storybook.characters, referenceCharacters);
  const openingHistoryMessages = useMemo(
    () => {
      // Stored messages reference gallery images by id only; resolve the
      // pixels from this storybook's image library for the preview.
      const rehydrated = (message: MessageRecord): MessageRecord => {
        if (!message.imageAttachments?.some((image) => !image.dataUrl)) {
          return message;
        }
        return {
          ...message,
          imageAttachments: message.imageAttachments.flatMap((image) => {
            if (image.dataUrl) {
              return [image];
            }
            const stored = storybookImageById([storybook], image.id);
            return stored ? [{ ...image, dataUrl: stored.dataUrl }] : [];
          }),
        };
      };
      return storybook.openingHistory.turns.flatMap((turn) => [
        ...turn.input.messages.map((message) => ({ message: rehydrated(message), turnNumber: turn.number })),
        ...turn.output.messages.map((message) => ({ message: rehydrated(message), turnNumber: turn.number })),
      ]);
    },
    [storybook],
  );
  const activeCharacter = storybook.characters.find((entry) => entry.id === activeCharacterId)
    ?? (activeSection === 'character' ? storybook.characters[0] : undefined)
    ?? null;
  const phoneContactCharacters = useMemo(() => rpStorybookPhoneContactCharacters(storybook), [storybook]);
  const identityWriteLocked = identityLocked || storybook.openingHistory.turns.length > 0 || storybook.openingHistory.events.length > 0;

  function selectWorkbenchSection(section: WorkbenchSection, characterId?: string) {
    setActiveSection(section);
    setViewMode('ui');
    if (characterId) {
      setActiveCharacterId(characterId);
    } else if (section === 'character' && !activeCharacterId && storybook.characters[0]) {
      setActiveCharacterId(storybook.characters[0].id);
    }
  }

  function updateStorybookTextField(field: 'title' | 'introduction' | 'scenario.summary' | 'scenario.openingSituation' | 'scenario.currentSituation', value: string) {
    if (field === 'title') {
      onUpdateStorybook({ ...storybook, title: value }, 'Title updated.');
    } else if (field === 'introduction') {
      onUpdateStorybook({ ...storybook, introduction: value }, 'Introduction updated.');
    } else {
      const key = field.split('.')[1] as 'summary' | 'openingSituation' | 'currentSituation';
      onUpdateStorybook({ ...storybook, scenario: { ...storybook.scenario, [key]: value } }, 'Scenario updated.');
    }
  }

  function updateCharacterTextField(
    characterId: string,
    field: 'name' | 'role' | 'description' | 'personality' | 'speechStyle' | 'appearance',
    value: string,
  ) {
    if (field === 'appearance') {
      onUpdateStorybook(
        withStorybookCharacterComfyConfig(storybook, characterId, {
          ...storybookCharacterComfyConfig(storybook, characterId),
          appearance: value,
        }),
        'Appearance updated.',
      );
      return;
    }
    onUpdateStorybook({
      ...storybook,
      characters: storybook.characters.map((entry) => entry.id === characterId ? { ...entry, [field]: value } : entry),
    }, 'Character updated.');
  }

  function updateCharacterBanking(characterId: string, patch: (banking: RpStorybookCharacterBanking) => RpStorybookCharacterBanking) {
    const current = storybookCharacterBanking(storybook, characterId);
    onUpdateStorybook({
      ...storybook,
      characters: storybook.characters.map((entry) => entry.id === characterId
        ? { ...entry, banking: patch(current) } : entry),
    }, 'Banking updated.');
  }

  useEffect(() => {
    if (!outputSettingsOpen) {
      return;
    }
    const closeOutputSettingsOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !outputSettingsMenuRef.current?.contains(event.target)) {
        setOutputSettingsOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutputSettingsOutside);
    return () => document.removeEventListener('pointerdown', closeOutputSettingsOutside);
  }, [outputSettingsOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSubmitting) {
      return;
    }
    setDraft('');
    void onSubmit(message, referenceIds);
  }

  function submitDraft() {
    const message = draft.trim();
    if (!message || isSubmitting) {
      return;
    }
    setDraft('');
    void onSubmit(message, referenceIds);
  }

  async function loadStorybook() {
    try {
      setFileActionStatus('Loading storybook ...');
      const loaded = await onLoad();
      if (loaded) {
        setFileActionStatus('Loaded.');
      } else {
        setFileActionStatus('');
      }
    } catch (error) {
      setFileActionStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function runMoreAction(action: () => void | Promise<void>) {
    setMoreOpen(false);
    void action();
  }

  function changeFormattedTextSetting(key: keyof RpStorybookFormattedTextSettings, enabled: boolean) {
    onUpdateFormattedTextSettings({
      ...formattedTextSettings,
      [key]: enabled,
    });
  }

  function askConfirm(action: NonNullable<typeof confirmAction>) {
    setMoreOpen(false);
    setConfirmAction(action);
  }

  function confirmPendingAction() {
    const pending = confirmAction;
    if (!pending) {
      return;
    }
    setConfirmAction(null);
    pending.action();
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      {...backdropDismiss}
    >
      <section className="storybook-creator-dialog" role="dialog" aria-modal="true" aria-label="RP Storybook Creator">
        <div className="dialog-header storybook-creator-header">
          <div className="storybook-title-row">
            <h2>{node.data.label}</h2>
            <p>{node.data.storybookStatus ?? 'Ready'}</p>
          </div>
          <div className="storybook-header-actions">
            <div className="storybook-more-menu" ref={outputSettingsMenuRef}>
              <button
                className="inspect-button storybook-output-button nodrag"
                type="button"
                aria-expanded={outputSettingsOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setOutputSettingsOpen((current) => !current);
                  setMoreOpen(false);
                }}
              >
                Output
              </button>
              {outputSettingsOpen && (
                <div className="storybook-output-popover" role="menu">
                  <span className="node-field-label">FORMATTED TEXT OUTPUT</span>
                  <div className="storybook-output-setting-grid">
                    {storybookFormattedTextSettingControls.map((control) => (
                      <label className="option-toggle compact-toggle nodrag" key={control.key}>
                        <input
                          type="checkbox"
                          checked={formattedTextSettings[control.key]}
                          onChange={(event) =>
                            changeFormattedTextSetting(control.key, event.currentTarget.checked)
                          }
                        />
                        <span>{control.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button className="inspect-button nodrag" type="button" onClick={onSaveStorybook}>
              Save
            </button>
            <button className="inspect-button nodrag" type="button" onClick={() => void loadStorybook()}>
              Load
            </button>
            <div className="storybook-more-menu">
              <button
                className="inspect-button storybook-more-button nodrag"
                type="button"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setMoreOpen((current) => !current);
                  setOutputSettingsOpen(false);
                }}
              >
                More
              </button>
              {moreOpen && (
                <div className="storybook-more-popover" role="menu">
                  <button type="button" role="menuitem" onClick={() => runMoreAction(onImportOpeningHistory)}>
                    Import Current Session as Opening History
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => askConfirm({
                      title: 'Reset Opening History',
                      message: 'This clears only the imported Opening History turns from this Storybook.',
                      confirmLabel: 'Reset',
                      danger: true,
                      action: onClearOpeningHistory,
                    })}
                  >
                    Reset Opening History
                  </button>
                  <button
                    className="danger"
                    type="button"
                    role="menuitem"
                    onClick={() => askConfirm({
                      title: 'Reset Storybook',
                      message: 'This resets the whole story: scenario, characters, Opening History, events, and the current chat session. Only the workflow stays.',
                      confirmLabel: 'Reset Storybook',
                      danger: true,
                      action: onResetStorybook,
                    })}
                  >
                    Reset Storybook
                  </button>
                  <button type="button" role="menuitem" onClick={() => runMoreAction(onImportSillyTavernCharacter)}>
                    Import SillyTavern Character
                  </button>
                  <button type="button" role="menuitem" onClick={() => runMoreAction(onImportCharacterCard)}>
                    Import Character Container
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMoreAction(() => onSubmit(rpStorybookLogicCheckInstruction))}
                  >
                    Check Story Logic
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="close-button danger" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="storybook-creator-body">
          {fileActionStatus && <span className="run-note storybook-file-status">{fileActionStatus}</span>}

          <div className="storybook-main-workspace storybook-workbench-layout">
            {/* Left rail: Story / Characters / Surfaces navigation, ported
                from the real V2 source's storybook-workbench rail
                (C:\Users\hen\Desktop\rpgraph\src\components\AppDialogs.tsx). */}
            <aside className="storybook-workbench-rail">
              <div className="storybook-workbench-rail-head">
                <button
                  type="button"
                  className="storybook-workbench-primary-button nodrag"
                  onClick={() => {
                    void onImportCharacterCard();
                    selectWorkbenchSection('character');
                  }}
                >
                  Add Character
                </button>
              </div>
              <nav className="storybook-workbench-nav" aria-label="Storybook sections">
                <section className="storybook-workbench-nav-group">
                  <h3>Overview</h3>
                  <button
                    type="button"
                    className={`storybook-workbench-nav-item${activeSection === 'overview' && viewMode === 'ui' ? ' active' : ''}`}
                    onClick={() => selectWorkbenchSection('overview')}
                  >
                    <span className="storybook-workbench-nav-icon">O</span>
                    <span className="storybook-workbench-nav-copy">
                      <strong>Cast Overview</strong>
                      <small>every character at a glance</small>
                    </span>
                    <span className="storybook-workbench-badge">{storybook.characters.length}</span>
                  </button>
                </section>
                <section className="storybook-workbench-nav-group">
                  <h3>Story</h3>
                  {([
                    ['scenario', 'Scenario', 'summary, opening, current', undefined],
                    ['intro', 'Intro', 'title and premise', undefined],
                    ['history', 'Opening History', 'imported session memory', storybook.openingHistory.turns.length],
                  ] as const).map(([id, label, detail, count]) => (
                    <button
                      type="button"
                      className={`storybook-workbench-nav-item${activeSection === id && viewMode === 'ui' ? ' active' : ''}`}
                      key={id}
                      onClick={() => selectWorkbenchSection(id)}
                    >
                      <span className="storybook-workbench-nav-icon">{label.slice(0, 1)}</span>
                      <span className="storybook-workbench-nav-copy">
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                      {count !== undefined ? <span className="storybook-workbench-badge">{count}</span> : null}
                    </button>
                  ))}
                </section>
                <section className="storybook-workbench-nav-group">
                  <h3>Characters</h3>
                  {storybook.characters.length ? storybook.characters.map((character) => (
                    <button
                      type="button"
                      className={`storybook-workbench-nav-item${activeCharacter?.id === character.id ? ' selected-character' : ''}${activeSection === 'character' && activeCharacter?.id === character.id && viewMode === 'ui' ? ' active' : ''}`}
                      key={character.id}
                      onClick={() => selectWorkbenchSection('character', character.id)}
                    >
                      <span className="storybook-workbench-nav-icon">
                        {(character.name || character.id || '?').slice(0, 1)}
                      </span>
                      <span className="storybook-workbench-nav-copy">
                        <strong>{character.name || character.id || 'Unnamed'}</strong>
                        <small>{character.role || 'identity, setup, images'}</small>
                      </span>
                      <span className="storybook-workbench-badge">{character.images.length}</span>
                    </button>
                  )) : (
                    <span className="storybook-workbench-empty-note">No characters yet.</span>
                  )}
                </section>
                <section className="storybook-workbench-nav-group">
                  <h3>Surfaces</h3>
                  {([
                    ['phone', 'Phone', 'contacts and visibility', 'P'],
                    ['gallery', 'Gallery', 'image libraries', 'G'],
                    ['social', 'Social', 'Photogram / OnlyFriends / MatchMe', 'S'],
                    ['bank', 'Bank', 'balances and expenses', 'B'],
                  ] as const).map(([id, label, detail, icon]) => (
                    <button
                      type="button"
                      className={`storybook-workbench-nav-item${activeSection === id && viewMode === 'ui' ? ' active' : ''}`}
                      key={id}
                      onClick={() => selectWorkbenchSection(id)}
                    >
                      <span className="storybook-workbench-nav-icon">{icon}</span>
                      <span className="storybook-workbench-nav-copy">
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                    </button>
                  ))}
                </section>
              </nav>
            </aside>

            <section className="storybook-document-panel storybook-workbench-editor" aria-label="Focused storybook editor">
              <div className="storybook-panel-header storybook-workbench-editor-head">
                <div>
                  <span className="panel-title">
                    {viewMode === 'json'
                      ? 'Raw JSON'
                      : viewMode === 'text'
                        ? 'Formatted Text'
                        : activeSection === 'intro'
                          ? 'Intro'
                          : activeSection === 'character'
                            ? activeCharacter?.name || 'Character'
                            : activeSection === 'gallery'
                              ? `Gallery Libraries${activeCharacter ? ` - ${activeCharacter.name || activeCharacter.id}` : ''}`
                              : activeSection === 'social'
                                ? `Social Accounts${activeCharacter ? ` - ${activeCharacter.name || activeCharacter.id}` : ''}`
                                : activeSection === 'bank'
                                  ? `Banking${activeCharacter ? ` - ${activeCharacter.name || activeCharacter.id}` : ''}`
                                  : activeSection === 'phone'
                                    ? `Phone Contacts${activeCharacter ? ` - ${activeCharacter.name || activeCharacter.id}` : ''}`
                                    : activeSection === 'history'
                                      ? 'Opening History'
                                      : 'Scenario'}
                  </span>
                  <div className="storybook-workbench-editor-meta">
                    {viewMode === 'ui' && activeCharacter && activeSection !== 'scenario' && activeSection !== 'intro' && activeSection !== 'history' ? (
                      <span className="storybook-workbench-editing-chip">
                        Editing {activeCharacter.name || activeCharacter.id}
                      </span>
                    ) : null}
                    <span className="storybook-panel-token-estimate">
                      ~{estimatedPromptTokens.toLocaleString('en-US')} tokens (images excluded)
                    </span>
                  </div>
                </div>
                <div className="storybook-tabs storybook-workbench-mode-switch">
                  <button
                    type="button"
                    className={`tab-button ${viewMode === 'ui' ? 'active' : ''}`}
                    onClick={() => setViewMode('ui')}
                  >
                    UI Preview
                  </button>
                  <button
                    type="button"
                    className={`tab-button ${viewMode === 'text' ? 'active' : ''}`}
                    onClick={() => setViewMode('text')}
                  >
                    Formatted Text
                  </button>
                  <button
                    type="button"
                    className={`tab-button ${viewMode === 'json' ? 'active' : ''}`}
                    onClick={() => setViewMode('json')}
                  >
                    Raw JSON
                  </button>
                </div>
              </div>

              <div className="storybook-panel-content">
                {viewMode === 'json' && (
                  <div className="storybook-json-panel">
                    <JsonSyntaxTextarea
                      id="storybook-json-view"
                      readOnly
                      value={JSON.stringify(
                        sanitizeDataUrls(
                          pendingConversion
                            ? pendingConversion.phase === 'review'
                              ? pendingConversion.result.storybook
                              : pendingConversion.sourceValue
                            : storybook,
                        ),
                        null,
                        2,
                      )}
                    />
                  </div>
                )}

                {viewMode === 'text' && (
                  <div className="storybook-text-panel">
                    <textarea
                      id="storybook-formatted-text-view"
                      readOnly
                      spellCheck={false}
                      value={pendingConversion
                        ? pendingConversion.phase === 'review'
                          ? rpStorybookFormattedText(
                              pendingConversion.result.storybook,
                              node.data.storybookFormattedTextSettings,
                            )
                          : `Storybook Format ${pendingConversion.result.sourceVersion} is not compatible with this build. Convert it in the UI Preview tab first.`
                        : rpStorybookFormattedText(storybook, node.data.storybookFormattedTextSettings)}
                    />
                  </div>
                )}

                {viewMode === 'ui' && pendingConversion && (
                  <StorybookConversionPanel
                    fileName={pendingConversion.fileName}
                    result={pendingConversion.result}
                    phase={pendingConversion.phase}
                    isSubmitting={isSubmitting}
                    onBeginReview={onBeginConversionReview}
                    onImprove={onImproveConversion}
                    onApply={onApplyConversion}
                    onCancel={onCancelConversion}
                  />
                )}

                {viewMode === 'ui' && !pendingConversion && (
                  <div className="storybook-ui-view">
                    {!parsedStorybook && <p role="alert">Stored Storybook JSON is invalid. Text editing is disabled.</p>}

                    {/* Section: Intro */}
                    {activeSection === 'intro' && <section className="storybook-workbench-story-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Intro</h4>
                          <p>The opening label and player-facing premise for this storybook.</p>
                        </div>
                      </div>
                      <div className="storybook-workbench-field-grid">
                        <WorkbenchTextField
                          label="Title"
                          hint="Shown in the node, files, and storybook headers."
                          value={storybook.title}
                          placeholder="Untitled RP Storybook"
                          multiline={false}
                          disabled={editingDisabled}
                          onChange={(value) => updateStorybookTextField('title', value)}
                        />
                        <WorkbenchTextField
                          label="Introduction"
                          hint="Short player-facing premise: what this storybook is about."
                          value={storybook.introduction}
                          placeholder="No introduction defined."
                          disabled={editingDisabled}
                          onChange={(value) => updateStorybookTextField('introduction', value)}
                        />
                        <article className="storybook-workbench-passive-card storybook-workbench-readonly-field">
                          <strong>Image Description Prompt</strong>
                          <textarea
                            className="storybook-inline-edit-control nodrag"
                            value={rpStorybookImageDescriptionPromptText(storybook.imageDescriptionPrompt)}
                            readOnly
                            spellCheck={false}
                          />
                        </article>
                      </div>
                    </section>}

                    {/* Section: Scenario */}
                    {activeSection === 'scenario' && <section className="storybook-workbench-story-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Primary Story Fields</h4>
                          <p>These fields define the default play setup.</p>
                        </div>
                      </div>
                      <div className="storybook-workbench-field-grid">
                        <WorkbenchTextField
                          label="Title"
                          hint="Shown in the node, files, and storybook headers."
                          value={storybook.title}
                          placeholder="Untitled RP Storybook"
                          multiline={false}
                          disabled={editingDisabled}
                          onChange={(value) => updateStorybookTextField('title', value)}
                        />
                        <WorkbenchTextField
                          label="Introduction"
                          hint="Short player-facing premise: what this storybook is about."
                          value={storybook.introduction}
                          placeholder="No introduction defined."
                          disabled={editingDisabled}
                          onChange={(value) => updateStorybookTextField('introduction', value)}
                        />
                        <WorkbenchTextField
                          label="Scenario Summary"
                          hint="Stable backdrop: genre, place, premise, relationships, and ongoing stakes."
                          value={storybook.scenario.summary}
                          placeholder="No scenario summary defined."
                          disabled={editingDisabled}
                          onChange={(value) => updateStorybookTextField('scenario.summary', value)}
                        />
                        <WorkbenchTextField
                          label="Opening Situation"
                          hint="Starting moment for a fresh run: where everyone is and what just begins."
                          value={storybook.scenario.openingSituation}
                          placeholder="No opening situation defined."
                          disabled={editingDisabled}
                          onChange={(value) => updateStorybookTextField('scenario.openingSituation', value)}
                        />
                        <WorkbenchTextField
                          label="Current Situation"
                          hint="Latest story state after play has moved on; update when the scene changes."
                          value={storybook.scenario.currentSituation}
                          placeholder="No current situation defined."
                          disabled={editingDisabled}
                          onChange={(value) => updateStorybookTextField('scenario.currentSituation', value)}
                        />
                      </div>
                    </section>}

                    {/* Section: Overview — cast-at-a-glance, moved off Scenario so that
                        page stays pure story fields. Card layout redesigned per approved
                        draft: rectangular row (not square), photo clipped to a fixed
                        frame (the old .storybook-workbench-avatar had no object-fit and
                        blew out the whole layout when a real profile photo was set),
                        bank balance as a minor inline note, real description text,
                        social-account handles, and real relationship text. */}
                    {activeSection === 'overview' && <section className="storybook-workbench-story-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Cast Overview</h4>
                          <p>Open a card for full character editing.</p>
                        </div>
                        <button type="button" className="contextual-action-button nodrag" onClick={onImportCharacterCard}>
                          Add Character
                        </button>
                      </div>
                      {storybook.characters.length ? (
                        <div className="storybook-overview-list">
                          {storybook.characters.map((character) => {
                            const banking = character.banking ?? defaultRpStorybookCharacterBanking();
                            const accounts: Array<[label: string, app: 'fotogram' | 'onlyfriends' | 'matchme']> = [
                              ['Fotogram', 'fotogram'],
                              ['OnlyFriends', 'onlyfriends'],
                              ['MatchMe', 'matchme'],
                            ];
                            const photoUrl = character.profileImage?.dataUrl;
                            return (
                              <button
                                type="button"
                                className={`storybook-overview-card nodrag${activeCharacter?.id === character.id ? ' active' : ''}`}
                                key={character.id}
                                onClick={() => selectWorkbenchSection('character', character.id)}
                              >
                                <CharacterAvatar
                                  className="storybook-overview-photo"
                                  name={character.name || character.id}
                                  fallback={(character.name || character.id || '?').slice(0, 2).toUpperCase()}
                                  profileImageDataUrl={photoUrl}
                                />
                                <span className="storybook-overview-body">
                                  <span className="storybook-overview-head">
                                    <span className="storybook-overview-head-left">
                                      <strong>{character.name || character.id || 'Unnamed'}</strong>
                                      <span className="storybook-overview-role">{character.role || 'No role set'}</span>
                                    </span>
                                    <span className="storybook-overview-balance">Bank <b>${banking.startBalance}</b></span>
                                  </span>
                                  <span className="storybook-overview-desc">{character.description || 'No description written yet.'}</span>
                                  <span className="storybook-overview-chip-row">
                                    {accounts.map(([label, app]) => {
                                      const account = character.apps?.[app];
                                      return (
                                        <span key={app} className={`storybook-overview-chip${account?.enabled ? ' on' : ''}`}>
                                          {label}{account?.enabled && account.username ? ` @${account.username}` : ''}
                                        </span>
                                      );
                                    })}
                                    {character.relationships?.map((relationship) => {
                                      const other = storybook.characters.find((entry) => entry.id === relationship.characterId);
                                      return (
                                        <span key={relationship.characterId} className="storybook-overview-rel">
                                          <span aria-hidden="true">·</span>
                                          {' '}<b>{other?.name || other?.id || relationship.characterId}</b>
                                          {relationship.description ? ` — ${relationship.description}` : ' — no relationship written yet'}
                                        </span>
                                      );
                                    })}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="no-data-msg">No characters defined yet. Add a character or ask the assistant to create the cast.</p>
                      )}

                      <div className="storybook-workbench-media-grid">
                        <article className="storybook-workbench-passive-card">
                          <strong>Gallery Libraries</strong>
                          <p>
                            {storybook.characters.reduce((sum, character) => sum + character.images.length, 0)} stored character images across {storybook.characters.length} characters.
                          </p>
                          <div className="storybook-workbench-mini-gallery">
                            {storybook.characters.flatMap((character) => character.images.slice(0, 2)).slice(0, 6).map((image) => (
                              <img key={image.id} src={image.dataUrl} alt={image.name || image.id} />
                            ))}
                          </div>
                        </article>
                        <article className="storybook-workbench-passive-card">
                          <strong>Phone Impact</strong>
                          <p>{phoneContactCharacters.length} phone identities, {storybook.phoneContacts.blocked.length} hidden contact pairs.</p>
                          <button
                            type="button"
                            className="contextual-action-button nodrag"
                            onClick={() => selectWorkbenchSection('phone')}
                          >
                            Open Phone Surface
                          </button>
                        </article>
                      </div>
                    </section>}

                    {/* Section: Character */}
                    {activeSection === 'character' && <section className="storybook-workbench-story-section actors-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Character Detail</h4>
                          <p>Edit the selected character without losing access to phone and app setup.</p>
                        </div>
                        <div className="storybook-section-header-actions">
                          <button
                            type="button"
                            className="contextual-action-button nodrag"
                            onClick={onImportSillyTavernCharacter}
                            title="Import SillyTavern Character Card"
                          >
                            <span className="button-icon">+</span> SillyTavern Import
                          </button>
                          <button
                            type="button"
                            className="contextual-action-button nodrag"
                            onClick={onImportCharacterCard}
                            title="Import an RPGraph Character Container V2 file"
                          >
                            <span className="button-icon">+</span> Import Character
                          </button>
                          {activeCharacter && (
                            <button
                              type="button"
                              className="contextual-action-button nodrag"
                              title={`Export ${activeCharacter.name || activeCharacter.id} as an RPGraph Character Container V2 file`}
                              onClick={() => void onExportCharacter(activeCharacter.id)}
                            >
                              Export Character
                            </button>
                          )}
                        </div>
                      </div>
                      {activeCharacter ? (
                        <div className="storybook-actor-grid">
                          <article className="storybook-actor-card" key={activeCharacter.id}>
                            <div className="character-card-header">
                              <button
                                type="button"
                                className="character-avatar-button nodrag"
                                title={`Change profile pic for ${activeCharacter.name || activeCharacter.id}`}
                                onClick={() => {
                                  setImageDialogMode('profile');
                                  setImageOwner({ kind: 'character', characterId: activeCharacter.id });
                                }}
                              >
                                <CharacterAvatar
                                  className="avatar-circle actor-avatar"
                                  name={activeCharacter.name || activeCharacter.id}
                                  fallback={
                                    activeCharacter.name
                                      ? activeCharacter.name.substring(0, 2).toUpperCase()
                                      : activeCharacter.id.substring(0, 2).toUpperCase()
                                  }
                                  profileImageDataUrl={activeCharacter.profileImage?.dataUrl}
                                />
                              </button>
                              <div className="character-card-title-side">
                                <WorkbenchTextField
                                  label="Name"
                                  hint="Display name used in chat, phone apps, and prompt references."
                                  value={activeCharacter.name}
                                  placeholder={activeCharacter.id || 'Character name'}
                                  multiline={false}
                                  disabled={editingDisabled}
                                  onChange={(value) => updateCharacterTextField(activeCharacter.id, 'name', value)}
                                />
                                <WorkbenchTextField
                                  label="Role"
                                  hint="Quick story function: player, companion, rival, contact, narrator."
                                  value={activeCharacter.role}
                                  placeholder="Character role"
                                  multiline={false}
                                  disabled={editingDisabled}
                                  onChange={(value) => updateCharacterTextField(activeCharacter.id, 'role', value)}
                                />
                              </div>
                            </div>

                            <div className="character-fields">
                              <WorkbenchTextField
                                label="Description"
                                hint="External facts and readable profile: who they are in the story."
                                value={activeCharacter.description}
                                placeholder="Character description"
                                disabled={editingDisabled}
                                onChange={(value) => updateCharacterTextField(activeCharacter.id, 'description', value)}
                              />
                              <WorkbenchTextField
                                label="Personality"
                                hint="Inner behavior: motives, temperament, boundaries, habits."
                                value={activeCharacter.personality}
                                placeholder="Character personality"
                                disabled={editingDisabled}
                                onChange={(value) => updateCharacterTextField(activeCharacter.id, 'personality', value)}
                              />
                              <WorkbenchTextField
                                label="Speech Style"
                                hint="How their messages sound: wording, rhythm, formality, quirks."
                                value={activeCharacter.speechStyle}
                                placeholder="How this character speaks"
                                disabled={editingDisabled}
                                onChange={(value) => updateCharacterTextField(activeCharacter.id, 'speechStyle', value)}
                              />
                              <WorkbenchTextField
                                label="Appearance"
                                hint="Visual prompt material for character image generation."
                                value={activeCharacter.comfyConfig?.appearance ?? ''}
                                placeholder="Visual appearance for image generation"
                                disabled={editingDisabled}
                                onChange={(value) => updateCharacterTextField(activeCharacter.id, 'appearance', value)}
                              />
                              <CharacterRelationships character={activeCharacter} characters={relationshipCharacters} disabled={editingDisabled}
                                onChange={(relationships) => onUpdateStorybook({ ...storybook, characters: storybook.characters.map((entry) => entry.id === activeCharacter.id ? { ...entry, relationships } : entry) }, 'Relationships updated.')} />
                              <CharacterAgencyField character={activeCharacter} disabled={editingDisabled}
                                onSave={(next) => onUpdateStorybook({ ...storybook,
                                  characters: storybook.characters.map((entry) => entry.id === activeCharacter.id ? next : entry),
                                }, 'Agency tags updated.')} />
                              <HiddenAgencyField value={activeCharacter.hiddenAgency} disabled={editingDisabled}
                                onSave={(hiddenAgency) => onUpdateStorybook({
                                  ...storybook,
                                  characters: storybook.characters.map((entry) => entry.id === activeCharacter.id
                                    ? { ...entry, hiddenAgency } : entry),
                                }, 'Hidden agency updated.')} />
                              <div className="character-field">
                                <span className="field-label">Phone Apps</span>
                                <p>{characterPhoneSummary(activeCharacter)}</p>
                              </div>
                            </div>

                            <div className="storybook-workbench-section-toolbar">
                              <div>
                                <h4>Appearance &amp; Image Generation</h4>
                                <p>LoRA and ComfyUI setup for this character's generated images. Dissolved here from the old Character Setup dialog.</p>
                              </div>
                            </div>
                            <CharacterImageSetupSection
                              key={`image-${activeCharacter.id}`}
                              storybook={storybook}
                              character={activeCharacter}
                              workflowNodes={workflowNodes}
                              connections={connections}
                              providerHealthById={providerHealthById}
                              promptActionSettings={promptActionSettings}
                              onUpdateStorybook={onUpdateStorybook}
                              onLoadCharacterComfyLoras={onLoadCharacterComfyLoras}
                              onGenerateCharacterComfyPreview={onGenerateCharacterComfyPreview}
                              onUnloadCharacterComfyModels={onUnloadCharacterComfyModels}
                            />

                            <div className="storybook-workbench-section-toolbar">
                              <div>
                                <h4>Voice</h4>
                                <p>Reference voice sample and ComfyUI voice cloning setup. Dissolved here from the old Character Setup dialog.</p>
                              </div>
                            </div>
                            <CharacterVoiceSetupSection
                              key={`voice-${activeCharacter.id}`}
                              storybook={storybook}
                              character={activeCharacter}
                              connections={connections}
                              providerHealthById={providerHealthById}
                              onUpdateStorybook={onUpdateStorybook}
                              onGenerateCharacterVoicePreview={onGenerateCharacterVoicePreview}
                              onUnloadCharacterComfyModels={onUnloadCharacterComfyModels}
                            />

                            <div className="character-card-footer">
                              <div className="character-card-footer-actions">
                                <button
                                  type="button"
                                  className="character-images-button nodrag"
                                  onClick={() => {
                                    setImageDialogMode('images');
                                    setImageOwner({ kind: 'character', characterId: activeCharacter.id });
                                  }}
                                >
                                  Character Images
                                </button>
                              </div>
                              <button
                                type="button"
                                className="character-delete-button nodrag"
                                aria-label={`Delete ${activeCharacter.name || activeCharacter.id}`}
                                title={`Delete ${activeCharacter.name || activeCharacter.id}`}
                                onClick={() => askConfirm({
                                  title: 'Delete Character',
                                  message: `Delete ${activeCharacter.name || activeCharacter.id} from this Storybook? This cannot be undone.`,
                                  confirmLabel: 'Delete Character',
                                  danger: true,
                                  action: () => onDeleteCharacter(activeCharacter.id),
                                })}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" />
                                </svg>
                              </button>
                            </div>
                          </article>
                        </div>
                      ) : (
                        <p className="no-data-msg">No characters defined yet. Click SillyTavern Import above or ask the assistant to add characters.</p>
                      )}
                    </section>}

                    {/* Section: Gallery */}
                    {activeSection === 'gallery' && <section className="storybook-workbench-story-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Gallery Libraries</h4>
                          <p>Character-owned image libraries used by prompts, phone shares, and gallery surfaces.</p>
                        </div>
                        {activeCharacter && (
                          <button
                            type="button"
                            className="contextual-action-button nodrag"
                            onClick={() => {
                              setImageDialogMode('images');
                              setImageOwner({ kind: 'character', characterId: activeCharacter.id });
                            }}
                          >
                            Character Images
                          </button>
                        )}
                      </div>
                      {activeCharacter ? (
                        <div className="storybook-workbench-gallery-list">
                          <article className="storybook-workbench-image-editor">
                            <button
                              type="button"
                              className="storybook-workbench-image-preview nodrag"
                              onClick={() => {
                                setImageDialogMode('images');
                                setImageOwner({ kind: 'character', characterId: activeCharacter.id });
                              }}
                            >
                              {activeCharacter.images[0] ? (
                                <img src={activeCharacter.images[0].dataUrl} alt={activeCharacter.images[0].name || activeCharacter.images[0].id} />
                              ) : (
                                <span>No image</span>
                              )}
                            </button>
                            <div>
                              <strong>{activeCharacter.name || activeCharacter.id || 'Unnamed'}</strong>
                              <p>{imageStatusText(activeCharacter.images)}</p>
                              <p>{activeCharacter.images[0]?.description || 'Add image references for this character.'}</p>
                            </div>
                          </article>
                          <div className="storybook-workbench-mini-gallery storybook-workbench-focused-gallery">
                            {activeCharacter.images.map((image) => (
                              <button
                                type="button"
                                className="nodrag"
                                key={image.id}
                                onClick={() => {
                                  setImageDialogMode('images');
                                  setImageOwner({ kind: 'character', characterId: activeCharacter.id });
                                }}
                              >
                                <img src={image.dataUrl} alt={image.name || image.id} />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="no-data-msg">No character selected.</p>
                      )}
                    </section>}

                    {/* Section: Social — mounts the real v3 CharacterAppProfiles account
                        manager (Photogram/OnlyFriends/MatchMe), moved here from the old
                        Character Setup dialog's "Phone Apps" tab per the redundancy-removal
                        instruction: this is its correct standalone home now. */}
                    {activeSection === 'social' && <section className="storybook-workbench-story-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Social Accounts</h4>
                          <p>Photogram, OnlyFriends, and MatchMe account setup for this character.</p>
                        </div>
                      </div>
                      {activeCharacter ? (
                        <CharacterAppProfiles
                          character={activeCharacter}
                          characters={storybook.characters}
                          locked={identityWriteLocked}
                          onChange={(next) => onUpdateStorybook({
                            ...storybook,
                            characters: storybook.characters.map((entry) => entry.id === next.id ? { ...entry, ...next } : entry),
                          }, 'Social profile updated.')}
                        />
                      ) : (
                        <p className="no-data-msg">No character selected.</p>
                      )}
                    </section>}

                    {/* Section: Bank — Banking tab dissolved here from the old Character
                        Setup dialog, since this is where V2 itself places a Bank surface
                        page. */}
                    {activeSection === 'bank' && <section className="storybook-workbench-story-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Banking</h4>
                          <p>Starting balance and fixed costs for the character-owned banking app.</p>
                        </div>
                      </div>
                      {activeCharacter ? (
                        <div className="storybook-workbench-field-grid">
                          <label className="storybook-workbench-field">
                            <span>
                              <span className="field-label">Starting Balance</span>
                              <span className="storybook-workbench-field-hint">Initial money available when the banking app starts a new RP session.</span>
                            </span>
                            <input
                              className="storybook-inline-edit-control nodrag"
                              type="number"
                              min="0"
                              step="0.01"
                              value={(activeCharacter.banking ?? defaultRpStorybookCharacterBanking()).startBalance}
                              onChange={(event) => updateCharacterBanking(activeCharacter.id, (banking) => ({
                                ...banking,
                                startBalance: event.currentTarget.value.trim() ? Number(event.currentTarget.value) : 0,
                              }))}
                            />
                          </label>
                          <article className="storybook-workbench-passive-card storybook-workbench-field wide">
                            <strong>Fixed Expenses</strong>
                            <p>Recurring payments shown in the Banking app history (for example a mobile plan). The app fills the rest of the history with generated everyday spending.</p>
                            {(activeCharacter.banking ?? defaultRpStorybookCharacterBanking()).fixedExpenses.map((expense, index) => (
                              <div className="character-comfy-url-row" key={index}>
                                <input
                                  className="node-text-input nodrag"
                                  type="text"
                                  value={expense.label}
                                  placeholder="Mobile plan"
                                  onChange={(event) => updateCharacterBanking(activeCharacter.id, (banking) => ({
                                    ...banking,
                                    fixedExpenses: banking.fixedExpenses.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.currentTarget.value } : entry),
                                  }))}
                                />
                                <input
                                  className="node-text-input nodrag"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={expense.amount}
                                  placeholder="24.99"
                                  onChange={(event) => updateCharacterBanking(activeCharacter.id, (banking) => ({
                                    ...banking,
                                    fixedExpenses: banking.fixedExpenses.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, amount: Number(event.currentTarget.value) } : entry),
                                  }))}
                                />
                                <button
                                  type="button"
                                  className="contextual-action-button nodrag"
                                  onClick={() => updateCharacterBanking(activeCharacter.id, (banking) => ({
                                    ...banking,
                                    fixedExpenses: banking.fixedExpenses.filter((_, entryIndex) => entryIndex !== index),
                                  }))}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <div className="character-comfy-actions">
                              <button
                                type="button"
                                className="contextual-action-button nodrag"
                                onClick={() => updateCharacterBanking(activeCharacter.id, (banking) => ({
                                  ...banking,
                                  fixedExpenses: [...banking.fixedExpenses, { label: '', amount: 0 }],
                                }))}
                              >
                                Add Fixed Expense
                              </button>
                            </div>
                          </article>
                        </div>
                      ) : (
                        <p className="no-data-msg">No character selected.</p>
                      )}
                    </section>}

                    {/* Section: Phone — the contact-visibility matrix. This UI is new;
                        it wires the already-existing backend helpers in
                        src/nodes/rp-storybook/model.ts
                        (rpStorybookPhoneContactCharacters/rpStorybookPhoneContactAllowed/
                        withRpStorybookPhoneContactPairBlocked) that previously had no UI. */}
                    {activeSection === 'phone' && <section className="storybook-workbench-story-section phone-contacts-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Phone Contacts</h4>
                          <p>Controls the default contact display in Phone and social apps. Everyone is connected by default. A real message can still make a hidden conversation appear; this does not block messages.</p>
                        </div>
                      </div>
                      {phoneContactCharacters.length >= 2 ? (
                        <div className="phone-contact-matrix-wrap">
                          <table className="phone-contact-matrix">
                            <thead>
                              <tr>
                                <th scope="col">Owner</th>
                                {phoneContactCharacters.map((contact) => (
                                  <th scope="col" key={contact.ref}>
                                    <span title={contact.name}>{contact.name}</span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {phoneContactCharacters.map((owner) => (
                                <tr key={owner.ref}>
                                  <th scope="row">
                                    <span title={owner.name}>{owner.name}</span>
                                  </th>
                                  {phoneContactCharacters.map((contact) => {
                                    const sameCharacter = owner.ref === contact.ref;
                                    const allowed = rpStorybookPhoneContactAllowed(storybook, owner.ref, contact.ref);
                                    return (
                                      <td key={contact.ref}>
                                        {sameCharacter ? (
                                          <span className="phone-contact-self">-</span>
                                        ) : (
                                          <button
                                            type="button"
                                            className={`phone-contact-cell${allowed ? ' allowed' : ' blocked'}`}
                                            aria-pressed={allowed}
                                            title={`${owner.name} ${allowed ? 'can see' : 'cannot see'} ${contact.name}`}
                                            onClick={() => {
                                              onUpdateStorybook(
                                                withRpStorybookPhoneContactPairBlocked(storybook, owner.ref, contact.ref, allowed),
                                                allowed
                                                  ? `Hid Phone contact ${owner.name} <-> ${contact.name}.`
                                                  : `Added Phone contact ${owner.name} <-> ${contact.name}.`,
                                              );
                                            }}
                                          >
                                            {allowed ? '✓' : '×'}
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="no-data-msg">Add at least two characters to configure Phone contacts.</p>
                      )}
                    </section>}

                    {/* Section: Opening History */}
                    {activeSection === 'history' && <section className="storybook-workbench-story-section history-section">
                      <div className="storybook-workbench-section-toolbar">
                        <div>
                          <h4>Opening History</h4>
                          <p>Imported chat, phone, event, and app state used to start future runs.</p>
                        </div>
                        <div className="header-actions">
                          <button
                            type="button"
                            className="contextual-action-button nodrag"
                            onClick={onImportOpeningHistory}
                            title="Import the current session (chat, phone, social media, notes, ChatGPD chats) as Opening History"
                          >
                            Import Current Session
                          </button>
                          {storybook.openingHistory.turns.length > 0 && (
                            <button
                              type="button"
                              className="contextual-action-button danger nodrag"
                              onClick={() => askConfirm({
                                title: 'Reset Opening History',
                                message: 'This clears only the imported Opening History turns from this Storybook.',
                                confirmLabel: 'Reset',
                                danger: true,
                                action: onClearOpeningHistory,
                              })}
                              title="Clear all Opening History turns"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="history-summary-box">
                        <p className="history-summary-text">
                          {storybook.openingHistory.summary || 'No opening history summary defined.'}
                        </p>
                        <div className="history-status-row">
                          <span className="message-count-badge">
                            {storybook.openingHistory.turns.length} turns / {openingHistoryMessages.length} messages imported
                          </span>
                          {storybook.openingHistory.turns.length > 0 && (
                            <button
                              type="button"
                              className="toggle-messages-button nodrag"
                              onClick={() => setHistoryExpanded(!historyExpanded)}
                            >
                              {historyExpanded ? 'Hide Messages ▲' : 'Show Messages ▼'}
                            </button>
                          )}
                        </div>
                      </div>

                      {historyExpanded && openingHistoryMessages.length > 0 && (
                        <div className="history-timeline">
                          {openingHistoryMessages.map(({ message: msg, turnNumber }, idx) => {
                            const isUser = msg.role === 'user';
                            return (
                              <div key={`${turnNumber}-${msg.id}-${idx}`} className={`timeline-entry ${msg.channel ?? 'rp'} ${msg.role}`}>
                                <div className="entry-header">
                                  <span className="entry-channel-badge">{(msg.channel ?? 'rp').toUpperCase()}</span>
                                  <span className="entry-speaker">
                                    {msg.speakerName || (isUser ? 'User' : 'RP Output')}
                                  </span>
                                  {msg.rpDateTime && <span className="entry-time">{msg.rpDateTime}</span>}
                                  <span className="entry-turn">Turn {turnNumber}</span>
                                </div>
                                <div className="entry-body">
                                  {!!msg.imageAttachments?.length && (
                                    <div className="opening-history-images">
                                      {msg.imageAttachments.map((image) => (
                                        <img key={image.id} src={image.dataUrl} alt={image.name} />
                                      ))}
                                    </div>
                                  )}
                                  <p className="entry-text">{msg.originalText}</p>
                                  {(msg.phoneImageDescription || msg.rpImageDescription) && (
                                    <div className="entry-image-desc">
                                      <strong>Image Attachment Description:</strong>{' '}
                                      {msg.phoneImageDescription ?? msg.rpImageDescription}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>}
                  </div>
                )}
              </div>
            </section>

            {/* Right Column: Chat Panel */}
            <div className="storybook-chat-panel">
              <div className="storybook-chat-header">
                <span className="panel-title">AI Storybook Assistant</span>
                <span className="panel-subtitle">Ask the assistant to draft, expand, or refine any part of your storybook.</span>
              </div>
              <div className="storybook-chat-log">
                {pendingConversion?.phase === 'review' ? (
                  <StorybookConversionAssistantReport
                    result={pendingConversion.result}
                    isSubmitting={isSubmitting}
                    onImprove={onImproveConversion}
                  />
                ) : null}
                {messages.length === 0 && pendingConversion?.phase !== 'review' ? (
                  <div className="chat-empty-state">
                    <div className="assistant-avatar-large">AI</div>
                    <p className="empty-title">Welcome to Storybook Creator</p>
                    <p className="empty-description">
                      You can instruct the AI to build your roleplay settings. Try prompts like:
                    </p>
                    <ul className="prompt-suggestions">
                      <li onClick={() => setDraft("Create a dark fantasy storybook set in a cursed tower")}>
                        "Create a dark fantasy storybook set in a cursed tower"
                      </li>
                      <li onClick={() => setDraft("Add a character named Julian, a rogue prince")}>
                        "Add a character named Julian, a rogue prince"
                      </li>
                      <li onClick={() => setDraft("Add an npc named Lilith who is a mysterious merchant")}>
                        "Add an npc named Lilith who is a mysterious merchant"
                      </li>
                    </ul>
                  </div>
                ) : (
                  messages.map((message, index) => {
                    const continuation = message.role === 'assistant' ? parseStorybookContinuation(message.text) : { text: message.text, nextPhase: undefined };
                    return (
                    <div className={`chat-message-row ${message.role}`} key={`${message.role}-${index}`}>
                      <div className="message-sender-avatar">
                        {message.role === 'user'
                          ? 'U'
                          : message.role === 'assistant'
                            ? 'AI'
                            : message.role === 'storybook' ? 'SB' : '!'}
                      </div>
                      <div className="chat-message-bubble">
                        <p>{continuation.text}</p>
                        {message.role === 'error' && message.failedResponse !== undefined && <CopyFailedStorybookResponse message={message} />}
                        {message.role === 'error' && message.retryRequest && <button type="button"
                          className="storybook-copy-error-link storybook-retry-link"
                          disabled={isSubmitting || index !== messages.length - 1}
                          onClick={() => void onRetry(index)}>Retry</button>}
                        {continuation.nextPhase && <button type="button" className="storybook-continue-button"
                          disabled={isSubmitting || index !== messages.length - 1}
                          onClick={() => void onSubmit(`Continue with the next phase: ${continuation.nextPhase}`)}>
                          <span>{continuation.nextPhase}</span><strong>Continue →</strong>
                        </button>}
                      </div>
                    </div>
                  ); })
                )}
                {isSubmitting && (
                  <div className="chat-message-row assistant thinking">
                    <div className="message-sender-avatar">AI</div>
                    <div className="chat-message-bubble typing-bubble">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form className="storybook-chat-form" onSubmit={submit}>
                <CharacterMentionInput value={draft} onChange={setDraft} characters={relationshipCharacters}
                  selectedIds={referenceIds} onSelectedIdsChange={setReferenceIds} onSubmit={submitDraft} disabled={isSubmitting} />
                <div className="storybook-chat-actions">
                  <button type="button" className="send-message-button" disabled={isSubmitting || messages.length === 0}
                    title="Clear assistant conversation" onClick={onClearChat}>Clear</button>
                <button type="submit" className="send-message-button" disabled={isSubmitting || !draft.trim()}>
                  {isSubmitting ? 'Sending...' : 'Send'}
                </button>
                </div>
              </form>
            </div>
          </div>
        </div>
        {imageOwner && (
          <CharacterImagesDialog
            key={storybookImageOwnerKey(imageOwner)}
            storybook={storybook}
            owner={imageOwner}
            initialMode={imageDialogMode}
            usedImageIds={usedImageIds}
            imageCaptionChangesById={imageCaptionChangesById}
            promptTextCustomPresets={promptTextCustomPresets}
            setPromptTextCustomPresets={setPromptTextCustomPresets}
            onUpdateStorybook={onUpdateStorybook}
            onChangeImageCaptionUpdate={onChangeImageCaptionUpdate}
            onDescribeCharacterImage={onDescribeCharacterImage}
            onClose={() => setImageOwner(null)}
          />
        )}
        {confirmAction && (
          <div className="storybook-confirm-backdrop" role="presentation" onClick={() => setConfirmAction(null)}>
            <section
              className="storybook-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="storybook-confirm-title"
              aria-describedby="storybook-confirm-message"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="storybook-confirm-title">{confirmAction.title}</h3>
              <p id="storybook-confirm-message">{confirmAction.message}</p>
              <div className="storybook-confirm-actions">
                <button className="inspect-button nodrag" type="button" onClick={() => setConfirmAction(null)}>
                  Cancel
                </button>
                <button
                  className={`inspect-button nodrag${confirmAction.danger ? ' danger' : ''}`}
                  type="button"
                  onClick={confirmPendingAction}
                >
                  {confirmAction.confirmLabel}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

type OutputFormatHelpDialogProps = {
  kind: OutputFormatHelpKind;
  onClose: () => void;
};

export function OutputFormatHelpDialog({
  kind,
  onClose,
}: OutputFormatHelpDialogProps) {
  const help = outputFormatHelp[kind];
  const isPromptHelp = kind === 'output-actions';
  const isFullGuide = kind === 'user-input' || kind === 'rp-output';
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      {...backdropDismiss}
    >
      <section
        className="output-format-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={help.title}
      >
        <div className="dialog-header">
          <div>
            <h2>{help.title}</h2>
            <p>{help.description}</p>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="output-format-dialog-body">
          <label className="node-field-label" htmlFor="output-format-prompt">
            {isPromptHelp ? 'SIMPLE PROMPT' : 'OVERVIEW'}
          </label>
          <JsonSyntaxTextarea
            id="output-format-prompt"
            rows={isFullGuide ? 30 : kind === 'phone' ? 19 : 17}
            readOnly
            value={help.prompt}
          />
        </div>
      </section>
    </div>
  );
}

type SystemLogDialogProps = {
  entries: SystemLogEntry[];
  counts: Record<SystemLogLevel, number>;
  turnTraces: TurnTrace[];
  estimatedTokenBytesPerToken: number;
  onClear: () => void;
  onClose: () => void;
  onCreateDebugSnapshot?: () => DebugSnapshot;
};

type DebugSnapshotSectionDef = {
  id: string;
  label: string;
  snapshotKey: DebugSnapshotSectionKey;
  defaultSelected: boolean;
};

type DebugSnapshotSection = DebugSnapshotSectionDef & {
  copyValue: unknown;
  tokenEstimate: number;
};

const debugSnapshotSectionDefs: DebugSnapshotSectionDef[] = [
  { id: 'app-state', label: 'App State', snapshotKey: 'appState', defaultSelected: true },
  { id: 'workflow-nodes', label: 'Workflow Nodes (Compact Runtime, includes RP Time prompt/response)', snapshotKey: 'nodes', defaultSelected: false },
  { id: 'workflow-edges', label: 'Workflow Connections', snapshotKey: 'edges', defaultSelected: false },
  { id: 'last-run-debug', label: 'Last Run Debug', snapshotKey: 'lastRun', defaultSelected: true },
  { id: 'recent-turns', label: 'Recent Turns (last two turns)', snapshotKey: 'recentTurns', defaultSelected: true },
  { id: 'prompt-switch-debug', label: 'Prompt Debug (Switch + Multistep)', snapshotKey: 'promptSwitch', defaultSelected: true },
  { id: 'event-manager-debug', label: 'Event Manager Debug', snapshotKey: 'eventManager', defaultSelected: true },
  { id: 'system-log', label: 'System Log', snapshotKey: 'systemLog', defaultSelected: true },
];

export function SystemLogDialog({
  entries,
  counts,
  turnTraces,
  estimatedTokenBytesPerToken,
  onClear,
  onClose,
  onCreateDebugSnapshot,
}: SystemLogDialogProps) {
  const [debugSnapshot, setDebugSnapshot] = useState<DebugSnapshot | null>(null);
  const [selectedDebugSections, setSelectedDebugSections] = useState<Record<string, boolean>>({});
  const [debugSnapshotToonEnabled, setDebugSnapshotToonEnabled] = useState(false);
  const [debugSnapshotCompressed, setDebugSnapshotCompressed] = useState(true);
  const [debugSnapshotPreviewOpen, setDebugSnapshotPreviewOpen] = useState(false);
  const [turnTraceOpen, setTurnTraceOpen] = useState(false);
  const [snapshotCopied, setSnapshotCopied] = useState(false);
  const [snapshotCopyError, setSnapshotCopyError] = useState('');
  const textMetrics = useMemo(
    () => new TextMetricsApi(estimatedTokenBytesPerToken),
    [estimatedTokenBytesPerToken],
  );
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);
  const selectedPayload = useMemo(() => debugSnapshot
    ? createDebugSnapshotCopy(
        debugSnapshot,
        debugSnapshotSectionDefs.filter((section) => selectedDebugSections[section.id]),
        textMetrics,
        debugSnapshotCompressed,
      )
    : null,
  [debugSnapshot, selectedDebugSections, textMetrics, debugSnapshotCompressed]);
  const encodedPayload = useMemo(() => selectedPayload
    ? debugSnapshotToonEnabled
      ? formatContextValue(selectedPayload, 'toon')
      : JSON.stringify(selectedPayload, null, 2)
    : '',
  [selectedPayload, debugSnapshotToonEnabled]);
  const debugSections = useMemo<DebugSnapshotSection[]>(() => {
    if (!debugSnapshot || !selectedPayload) return [];
    return debugSnapshotSectionDefs.map((def) => {
      const copyValue = selectedDebugSections[def.id]
        ? selectedPayload[def.snapshotKey]
        : createDebugSnapshotCopy(debugSnapshot, [def], textMetrics, debugSnapshotCompressed)[def.snapshotKey];
      return {
        ...def,
        copyValue,
        tokenEstimate: estimateSnapshotTokens(copyValue, debugSnapshotToonEnabled, textMetrics),
      };
    });
  }, [debugSnapshot, selectedPayload, selectedDebugSections, debugSnapshotCompressed, debugSnapshotToonEnabled, textMetrics]);
  const selectedTokenTotal = textMetrics.measure(encodedPayload).tokens;
  const selectedSnapshotSections = () =>
    debugSections.filter((section) => selectedDebugSections[section.id]);
  const snapshotPreviewSections = useMemo(() => {
    if (!debugSnapshotPreviewOpen) {
      return [];
    }
    return debugSections
      .filter((section) => selectedDebugSections[section.id])
      .map((section) => ({
        id: section.id,
        label: section.label,
        tokenEstimate: section.tokenEstimate,
        text: debugSnapshotToonEnabled
          ? formatContextValue(section.copyValue, 'toon')
          : JSON.stringify(section.copyValue ?? null, null, 2),
      }));
  }, [debugSections, debugSnapshotPreviewOpen, debugSnapshotToonEnabled, selectedDebugSections]);

  const openDebugSnapshot = () => {
    if (!onCreateDebugSnapshot) {
      return;
    }
    const snapshot = onCreateDebugSnapshot();
    setDebugSnapshot(snapshot);
    setSelectedDebugSections(
      Object.fromEntries(debugSnapshotSectionDefs.map((def) => [def.id, def.defaultSelected])),
    );
    setDebugSnapshotPreviewOpen(false);
    setSnapshotCopied(false);
    setSnapshotCopyError('');
  };

  const closeDebugSnapshot = () => {
    setDebugSnapshot(null);
    setDebugSnapshotPreviewOpen(false);
    setSnapshotCopied(false);
    setSnapshotCopyError('');
  };
  const debugSnapshotBackdropDismiss = useBackdropDismiss<HTMLDivElement>(closeDebugSnapshot);

  const copySelectedSnapshot = () => {
    if (!debugSnapshot) {
      return;
    }
    void copyTextToClipboard(encodedPayload)
      .then(() => {
        setSnapshotCopied(true);
        setSnapshotCopyError('');
      })
      .catch((error) => {
        setSnapshotCopied(false);
        setSnapshotCopyError(error instanceof Error ? error.message : String(error));
      });
  };

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (turnTraceOpen) {
          setTurnTraceOpen(false);
          return;
        }
        if (debugSnapshotPreviewOpen) {
          setDebugSnapshotPreviewOpen(false);
          return;
        }
        if (debugSnapshot) {
          closeDebugSnapshot();
          return;
        }
        onClose();
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, turnTraceOpen, debugSnapshotPreviewOpen, debugSnapshot]);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      {...backdropDismiss}
    >
      <section className="system-log-dialog" role="dialog" aria-modal="true" aria-label="System Log">
        <div className="dialog-header">
          <div>
            <h2>System Log</h2>
            <p>
              {entries.length} entries / {counts.error} errors / {counts.warning} warnings /{' '}
              {counts.info} notes
            </p>
          </div>
        </div>
        <div className="system-log-list">
          {entries.length === 0 ? (
            <p className="empty-log">No warnings, errors, or notes yet.</p>
          ) : (
            [...entries].reverse().map((entry) => (
              <article className={`system-log-entry ${entry.level}`} key={entry.id}>
                <div>
                  <strong>{entry.level}</strong>
                  <time>{formatLogTimestamp(entry.createdAt)}</time>
                </div>
                <p>{entry.text}</p>
              </article>
            ))
          )}
        </div>
        <footer className="system-log-actions">
          <button className="close-button" type="button" onClick={() => setTurnTraceOpen(true)}>
            Turn Trace
          </button>
          {onCreateDebugSnapshot && (
            <button className="close-button" type="button" onClick={openDebugSnapshot}>
              Debug Snapshot
            </button>
          )}
          <button className="close-button" type="button" onClick={onClose}>
            Close
          </button>
          {entries.length > 0 && (
            <button
              className="close-button primary"
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Clear Log
            </button>
          )}
        </footer>
        {debugSnapshot && (
          <div
            className="debug-snapshot-popover-backdrop"
            role="presentation"
            {...debugSnapshotBackdropDismiss}
          >
            <section className="debug-snapshot-popover" role="dialog" aria-modal="true" aria-label="Debug Snapshot">
              <div className="debug-snapshot-header">
                <div>
                  <h3>Debug Snapshot</h3>
                  <p>Selected export ~{selectedTokenTotal.toLocaleString()} tokens. Repeated text is included once. Long text and lists are shortened.</p>
                </div>
                <div className="debug-snapshot-options">
                  <div className="debug-format-tabs" role="tablist" aria-label="Debug Snapshot encoding">
                    <button
                      className={!debugSnapshotToonEnabled ? 'active' : ''}
                      type="button"
                      role="tab"
                      aria-selected={!debugSnapshotToonEnabled}
                      onClick={() => {
                        setSnapshotCopied(false);
                        setDebugSnapshotToonEnabled(false);
                      }}
                    >
                      JSON
                    </button>
                    <button
                      className={debugSnapshotToonEnabled ? 'active' : ''}
                      type="button"
                      role="tab"
                      aria-selected={debugSnapshotToonEnabled}
                      onClick={() => {
                        setSnapshotCopied(false);
                        setDebugSnapshotToonEnabled(true);
                      }}
                    >
                      TOON
                    </button>
                  </div>
                  <label className="debug-compression-toggle">
                    <input
                      type="checkbox"
                      checked={debugSnapshotCompressed}
                      onChange={(event) => {
                        setSnapshotCopied(false);
                        setDebugSnapshotCompressed(event.target.checked);
                      }}
                    />
                    <span>Compressed</span>
                  </label>
                </div>
              </div>
              <div className="debug-snapshot-sections">
                {debugSections.map((section) => (
                  <label className="debug-snapshot-section" key={section.id}>
                    <input
                      type="checkbox"
                      checked={!!selectedDebugSections[section.id]}
                      onChange={(event) => {
                        setSnapshotCopied(false);
                        setSelectedDebugSections((current) => ({
                          ...current,
                          [section.id]: event.target.checked,
                        }));
                      }}
                    />
                    <span>{section.label}</span>
                    <em>~{section.tokenEstimate.toLocaleString()} tokens</em>
                  </label>
                ))}
              </div>
              {snapshotCopyError && <p className="debug-snapshot-error">{snapshotCopyError}</p>}
              <div className="debug-snapshot-actions">
                <button className="close-button" type="button" onClick={closeDebugSnapshot}>
                  Cancel
                </button>
                <button
                  className="close-button debug-snapshot-view-button"
                  type="button"
                  onClick={() => setDebugSnapshotPreviewOpen(true)}
                  disabled={selectedSnapshotSections().length === 0}
                >
                  View Selected
                </button>
                <button className="close-button primary" type="button" onClick={copySelectedSnapshot} disabled={selectedSnapshotSections().length === 0}>
                  {snapshotCopied ? 'Copied' : 'Copy Selected'}
                </button>
              </div>
            </section>
            {debugSnapshotPreviewOpen && (
              <section className="debug-snapshot-viewer" role="dialog" aria-modal="true" aria-label="Selected Debug Snapshot View">
                <div className="debug-snapshot-viewer-header">
                  <div>
                    <h3>Selected Debug Snapshot</h3>
                    <p>
                      {selectedSnapshotSections().length} sections / ~{selectedTokenTotal.toLocaleString()} tokens /{' '}
                      {debugSnapshotToonEnabled ? 'TOON' : 'JSON'}
                      {debugSnapshotCompressed ? ' / Compressed' : ''}
                    </p>
                  </div>
                  <button
                    className="close-button"
                    type="button"
                    onClick={() => setDebugSnapshotPreviewOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="debug-snapshot-viewer-body">
                  {snapshotPreviewSections.length === 0 ? (
                    <p className="debug-snapshot-viewer-empty">No debug sections selected.</p>
                  ) : (
                    snapshotPreviewSections.map((section) => (
                      <article className="debug-snapshot-view-section" key={section.id}>
                        <header>
                          <strong>{section.label}</strong>
                          <span>~{section.tokenEstimate.toLocaleString()} tokens</span>
                        </header>
                        <pre>{section.text}</pre>
                      </article>
                    ))
                  )}
                </div>
              </section>
            )}
          </div>
        )}
        {turnTraceOpen && (
          <TurnTraceDialog
            traces={turnTraces}
            estimatedTokenBytesPerToken={estimatedTokenBytesPerToken}
            onClose={() => setTurnTraceOpen(false)}
          />
        )}
      </section>
    </div>
  );
}

function estimateSnapshotTokens(value: unknown, useToon: boolean, textMetrics: TextMetricsApi) {
  const text = useToon ? formatContextValue(value, 'toon') : JSON.stringify(value ?? null, null, 2);
  return textMetrics.measure(text).tokens;
}

type ImagePreviewDialogProps = {
  image: ChatImageAttachment;
  caption?: string;
  captionHistory?: ImageCaptionChange[];
  onClose: () => void;
};

type CaptionHistoryTimelineItem =
  | {
      kind: 'original';
      label: string;
      caption: string;
    }
  | {
      kind: 'update';
      label: string;
      beforeCaption?: string;
      afterCaption: string;
    };

function captionHistoryTimeline(captionHistory: ImageCaptionChange[]): CaptionHistoryTimelineItem[] {
  const visibleChanges = captionHistory.filter(
    (change) => change.beforeCaption?.trim() || change.afterCaption.trim(),
  );
  const firstOriginalCaption = visibleChanges[0]?.beforeCaption?.trim();
  const timeline: CaptionHistoryTimelineItem[] = firstOriginalCaption
    ? [{ kind: 'original', label: 'Original Caption', caption: firstOriginalCaption }]
    : [];
  visibleChanges.forEach((change, index) => {
    if (!change.afterCaption.trim()) {
      return;
    }
    timeline.push({
      kind: 'update',
      label: `Update ${index + 1}`,
      beforeCaption: change.beforeCaption?.trim(),
      afterCaption: change.afterCaption.trim(),
    });
  });
  return timeline;
}

function CaptionHistoryList({ items }: { items: CaptionHistoryTimelineItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="caption-change-list">
      <strong>Caption History</strong>
      {items.map((item, index) => (
        <div className={`caption-change-list-item ${item.kind}`} key={`${item.kind}-${index}`}>
          <span>{item.label}</span>
          {item.kind === 'original' ? (
            <p>{item.caption}</p>
          ) : (
            <div className="caption-change-history-update">
              {item.beforeCaption && (
                <small>Before: {item.beforeCaption}</small>
              )}
              <p>{item.afterCaption}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ImagePreviewDialog({
  image,
  caption,
  captionHistory = [],
  onClose,
}: ImagePreviewDialogProps) {
  const visibleCaption = caption?.trim();
  const historyTimeline = captionHistoryTimeline(captionHistory);
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);
  return (
    <div
      className="image-preview-backdrop"
      role="presentation"
      {...backdropDismiss}
    >
      <section className="image-preview-dialog" role="dialog" aria-modal="true" aria-label={image.name}>
        <div className="image-preview-header">
          <span>{image.name}</span>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className={`image-preview-body${historyTimeline.length > 0 ? ' has-side-panel' : ''}`}>
          <div className="image-preview-stage">
            <img src={image.dataUrl} alt={image.name} />
            {visibleCaption && (
              <div className="image-preview-caption">
                {visibleCaption}
              </div>
            )}
          </div>
          {historyTimeline.length > 0 && (
            <aside className="image-preview-side-panel">
              <CaptionHistoryList items={historyTimeline} />
            </aside>
          )}
        </div>
      </section>
    </div>
  );
}
