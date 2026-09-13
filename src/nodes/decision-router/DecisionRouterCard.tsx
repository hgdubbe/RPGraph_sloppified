import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../types';
import { useNodeActions } from '../NodeActionsContext';
import { LlmCallMetrics, runStateClassName, useNodeLayoutSync } from '../shared/CardView';
import { NodeCustomSelect } from '../shared/NodeCustomSelect';
import { PortLabel } from '../shared/PortValue';
import { decisionRouterInputHandles } from './execute';
import { decisionBlockTypeLabels, decisionBlockTypes, decisionTierOptions } from './decisionRouterModel';

// Labels and valueTypes mirror coreDefinitions.ts's `decision-router` ports() exactly — each
// name matches its intended source port ("node: output label") so it's obvious what to wire
// in, and `storybook-json` must stay valueType 'json' to accept RP Storybook's `json` output
// (port compatibility requires an exact valueType match — see graph/portCompatibility.ts).
const inputPortLabels: Array<{ handle: string; label: string; valueType: string }> = [
  { handle: decisionRouterInputHandles.storybookJson, label: 'Storybook: JSON', valueType: 'json' },
  { handle: decisionRouterInputHandles.storybookText, label: 'Storybook: Formatted Text', valueType: 'text' },
  { handle: decisionRouterInputHandles.storybookCharacters, label: 'Storybook: Character Info', valueType: 'text' },
  { handle: decisionRouterInputHandles.history, label: 'History: Last X Turns', valueType: 'text' },
  { handle: decisionRouterInputHandles.contextCompression, label: 'Context Compression: Text', valueType: 'text' },
  { handle: decisionRouterInputHandles.lastInput, label: 'Last User Input: Text', valueType: 'text' },
  { handle: decisionRouterInputHandles.eventManager, label: 'Event Manager: Events', valueType: 'text' },
];

export function DecisionRouterCard({ id, data }: NodeProps<WorkflowNode>) {
  const nodeBodyRef = useNodeLayoutSync(id);
  const { updateData } = useNodeActions();
  const overrides = data.decisionBlockPromptOverrides ?? {};
  const updateOverride = (blockType: string, field: 'before' | 'after', value: string) => {
    const next = { ...overrides, [blockType]: { ...overrides[blockType], [field]: value } };
    updateData(id, { decisionBlockPromptOverrides: next });
  };

  return (
    <div className={`workflow-node decision-router-node${runStateClassName(data)}`} ref={nodeBodyRef}>
      <div className="node-title-row">
        <span className="node-dot" />
        <strong>{data.label}</strong>
      </div>
      <LlmCallMetrics data={data} />
      <span className="node-description">{data.description}</span>

      <div className="resolver-ports decision-router-ports">
        {inputPortLabels.map(({ handle, label, valueType }) => (
          <div className="resolver-port resolver-port-input" key={handle}>
            <Handle id={handle} type="target" position={Position.Left} />
            <PortLabel data={data} direction="input" handle={handle} label={label} valueType={valueType} />
          </div>
        ))}
        <div className="resolver-port resolver-port-output">
          <PortLabel data={data} direction="output" label="Decision Context" valueType="json" />
          <Handle type="source" position={Position.Right} />
        </div>
      </div>

      <label className="node-field-label" htmlFor={`${id}-decision-narrativeness`}>
        Narrativeness / Default Activeness
      </label>
      <div className="node-inline-fields">
        <NodeCustomSelect
          id={`${id}-decision-narrativeness`}
          value={data.decisionNarrativeness ?? 2}
          onChange={(value) => updateData(id, { decisionNarrativeness: value })}
          options={decisionTierOptions}
        />
        <NodeCustomSelect
          id={`${id}-decision-default-activeness`}
          value={data.decisionDefaultActiveness ?? 2}
          onChange={(value) => updateData(id, { decisionDefaultActiveness: value })}
          options={decisionTierOptions}
        />
      </div>

      <label className="node-field-label" htmlFor={`${id}-decision-max-actions`}>
        Max actions per turn (0-5)
      </label>
      <input
        className="node-number-input nodrag nowheel"
        id={`${id}-decision-max-actions`}
        min={0}
        max={5}
        step={1}
        type="number"
        value={data.decisionMaxActionsPerTurn ?? 3}
        onChange={(event) => updateData(id, { decisionMaxActionsPerTurn: Number(event.target.value) })}
      />

      <label className="node-toggle nodrag">
        <input
          type="checkbox"
          checked={data.decisionRespectUserAgency ?? true}
          onChange={(event) => updateData(id, { decisionRespectUserAgency: event.target.checked })}
        />
        Never speak for the user
      </label>

      <label className="node-field-label" htmlFor={`${id}-decision-style-tone`}>
        Style / Tone (optional)
      </label>
      <textarea
        className="node-textarea nodrag nowheel"
        id={`${id}-decision-style-tone`}
        rows={2}
        placeholder="e.g. Keep dialogue terse and dry; avoid purple prose."
        value={data.decisionStyleTone ?? ''}
        onChange={(event) => updateData(id, { decisionStyleTone: event.target.value })}
      />

      <label className="node-field-label" htmlFor={`${id}-decision-sequence-guidance`}>
        Additional sequence guidance (optional)
      </label>
      <textarea
        className="node-textarea nodrag nowheel"
        id={`${id}-decision-sequence-guidance`}
        rows={2}
        placeholder="Extra instructions appended to the 'what happens this turn' call."
        value={data.decisionSequenceGuidance ?? ''}
        onChange={(event) => updateData(id, { decisionSequenceGuidance: event.target.value })}
      />

      <details className="decision-router-block-prompts">
        <summary>Per-action prompt overrides</summary>
        {decisionBlockTypes.map((blockType) => (
          <div className="decision-router-block-override" key={blockType}>
            <label className="node-field-label">{decisionBlockTypeLabels[blockType]}</label>
            <textarea
              className="node-textarea nodrag nowheel"
              rows={1}
              placeholder="Prepend before the built-in instruction"
              value={overrides[blockType]?.before ?? ''}
              onChange={(event) => updateOverride(blockType, 'before', event.target.value)}
            />
            <textarea
              className="node-textarea nodrag nowheel"
              rows={1}
              placeholder="Append after the built-in instruction"
              value={overrides[blockType]?.after ?? ''}
              onChange={(event) => updateOverride(blockType, 'after', event.target.value)}
            />
          </div>
        ))}
      </details>

      <span className="run-note">{data.preview}</span>
    </div>
  );
}
