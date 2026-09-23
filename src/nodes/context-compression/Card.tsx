import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../types';
import {
  contextCompressionMaxTokensHandle,
  settingsValueEntries,
  settingsValueHandle,
  resolveWorkflowNumber,
  validCompressionLengthWords,
  validCompressionRatio,
  validCompressionTokenLimit,
} from '../../workflow';
import { useNodeActions } from '../NodeActionsContext';
import { useNodeView } from '../NodeViewContext';
import { ConnectionSelect } from '../shared/ConnectionSelect';
import { LlmCallMetrics, runStateClassName, useNodeLayoutSync } from '../shared/CardView';
import { PortLabel } from '../shared/PortValue';
import { PostOutputToggle } from '../shared/PostOutputToggle';
import { contextCompressionCapacitySegments } from './capacity';

function useConnectedTokenLimit(nodeId: string) {
  const view = useNodeView();
  const edge = view.edges.find(
    (candidate) =>
      candidate.target === nodeId &&
      candidate.targetHandle === contextCompressionMaxTokensHandle,
  );
  const source = edge ? view.contentNodes.find((candidate) => candidate.id === edge.source) : undefined;
  const value =
    source?.data.nodeType === 'fixed-number'
      ? source.data.fixedNumberValue
      : source?.data.nodeType === 'settings-value'
        ? (() => {
            const entry = settingsValueEntries(source.data).find(
              (candidate) => settingsValueHandle(candidate.id) === edge?.sourceHandle,
            );
            return entry ? view.settingsValues[entry.optionKey] : undefined;
          })()
        : undefined;

  return { hasConnection: !!edge, value };
}

export function ContextCompressionNodeCard({ id, data }: NodeProps<WorkflowNode>) {
  const actions = useNodeActions();
  const view = useNodeView();
  const nodeBodyRef = useNodeLayoutSync(id);
  const connectedLimit = useConnectedTokenLimit(id);
  const resolvedMaxTokens = resolveWorkflowNumber(
    connectedLimit.hasConnection ? connectedLimit.value : data.contextCompressionMaxTokens,
    view.settingsValueDefinitions,
    view.settingsValues,
  );
  const maxTokens = validCompressionTokenLimit(
    resolvedMaxTokens,
  );
  const maxTokensInvalid = resolvedMaxTokens === undefined;
  const ratio = validCompressionRatio(data.contextCompressionRatio);
  const lengthWords = validCompressionLengthWords(data.contextCompressionLengthWords);
  const {
    replacedTokens,
    summaryTokens,
    activeTokens,
    replacedPercent,
    summaryPercent,
    activePercent,
    freePercent,
  } = contextCompressionCapacitySegments(
    { id, data, position: { x: 0, y: 0 } } as WorkflowNode,
    view.estimatedTokenBytesPerToken,
    maxTokens,
  );
  const changeSetting = (
    field: 'contextCompressionMaxTokens' | 'contextCompressionRatio' | 'contextCompressionLengthWords',
    value: number | string,
  ) => {
    const normalizedValue =
      field === 'contextCompressionMaxTokens'
        ? value
        : field === 'contextCompressionRatio'
          ? validCompressionRatio(Number(value))
          : value;
    actions.updateData(id, {
      [field]: normalizedValue,
      compressedText: undefined,
      compressionSourceText: undefined,
      compressionRemainingText: undefined,
      preview: 'Settings changed / compression resets next turn',
    });
  };

  return (
    <div className={`workflow-node compression-node${runStateClassName(data)}`} ref={nodeBodyRef}>
      <div className="node-title-row">
        <span className="node-dot" />
        <strong>{data.label}</strong>
      </div>
      <LlmCallMetrics data={data} />
      <span className="node-description">{data.description}</span>
      <div className="workflow-ports">
        <div className="workflow-port workflow-port-input">
          <Handle type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" label="Text Input" valueType="text" />
        </div>
        <div className="workflow-port workflow-port-output">
          <PortLabel data={data} direction="output" label="Text" valueType="text" />
          <Handle type="source" position={Position.Right} />
        </div>
      </div>
      <label className="node-field-label" htmlFor={`${id}-compression-limit`}>
        MAX TOKENS
      </label>
      <div className={`workflow-port workflow-port-input compression-limit-port${connectedLimit.hasConnection ? ' connected' : ''}`}>
        <Handle id={contextCompressionMaxTokensHandle} type="target" position={Position.Left} />
        <input
          className={`node-number-input nodrag nowheel${maxTokensInvalid ? ' invalid' : ''}`}
          id={`${id}-compression-limit`}
          min={0}
          step={1}
          type="text"
          value={
            connectedLimit.hasConnection
              ? (maxTokensInvalid ? String(connectedLimit.value ?? '') : maxTokens)
              : data.contextCompressionMaxTokens ?? ''
          }
          disabled={connectedLimit.hasConnection}
          onChange={(event) => changeSetting('contextCompressionMaxTokens', event.target.value)}
        />
      </div>
      {maxTokensInvalid && (
        <span className="run-note field-warning">Max Tokens must be one number.</span>
      )}
      <label className="node-field-label" htmlFor={`${id}-compression-ratio`}>
        AMOUNT COMPRESSED: {ratio}%
      </label>
      <input
        className="compression-range nodrag nowheel"
        id={`${id}-compression-ratio`}
        min={30}
        max={70}
        step={1}
        type="range"
        value={ratio}
        onChange={(event) => changeSetting('contextCompressionRatio', Number(event.target.value))}
      />
      <label className="node-field-label" htmlFor={`${id}-compression-words`}>
        COMPRESSION LENGTH IN WORDS
      </label>
      <input
        className="node-number-input nodrag nowheel"
        id={`${id}-compression-words`}
        min={1}
        step={1}
        type="number"
        value={lengthWords}
        onChange={(event) => changeSetting('contextCompressionLengthWords', Number(event.target.value))}
      />
      <PostOutputToggle id={id} enabled={data.runAfterRpOutput} className="compression-toggle" />
      <ConnectionSelect
        id={id}
        label="COMPRESSION LLM"
        connectionId={data.connectionId}
      />
      <div className="node-actions compression-actions">
        <span className="run-note">{data.preview}</span>
        <button className="inspect-button nodrag" type="button" onClick={() => actions.textPreview(id)}>
          Text Preview
        </button>
      </div>
      <label className="node-field-label compression-budget-label">CONTEXT CAPACITY</label>
      <div
        className="compression-capacity"
        title={`Trimmed context ~${replacedTokens} / summary ~${summaryTokens} / active ~${activeTokens} / max ~${maxTokens} tokens`}
      >
        {replacedPercent > 0 && <span className="compression-capacity-replaced" style={{ width: `${replacedPercent}%` }} />}
        {summaryPercent > 0 && <span className="compression-capacity-summary" style={{ width: `${summaryPercent}%` }} />}
        {activePercent > 0 && <span className="compression-capacity-active" style={{ width: `${activePercent}%` }} />}
        {freePercent > 0 && <span className="compression-capacity-free" style={{ width: `${freePercent}%` }} />}
      </div>
      <div className="compression-capacity-legend">
        <span className="replaced">trimmed context</span>
        <span className="summary">summary</span>
        <span className="active">active</span>
        <span className="free">free</span>
      </div>
    </div>
  );
}
