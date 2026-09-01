import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../types';
import { useNodeActions } from '../NodeActionsContext';
import { PortLabel } from '../shared/PortValue';
import { runStateClassName, useNodeLayoutSync } from '../shared/CardView';

export function FormatRepairNodeCard({ id, data }: NodeProps<WorkflowNode>) {
  const nodeBodyRef = useNodeLayoutSync(id);
  const actions = useNodeActions();
  const mode = data.formatRepairMode === 'json' ? 'json' : 'text';

  return (
    <div className={`workflow-node text-replace-node${runStateClassName(data)}`} ref={nodeBodyRef}>
      <div className="node-title-row">
        <span className="node-dot" />
        <strong>{data.label}</strong>
      </div>
      <span className="node-description">{data.description}</span>
      <div className="workflow-ports">
        <div className="workflow-port workflow-port-input">
          <Handle type="target" position={Position.Left} />
          <PortLabel data={data} direction="input" label="Text / JSON Input" valueType="text" />
        </div>
      </div>
      <div className="prompt-action-field">
        <label className="node-field-label">REPAIR MODE</label>
        <div className="text-router-mode" role="group" aria-label="Repair mode">
          <label>
            <input
              className="nodrag"
              type="radio"
              checked={mode === 'text'}
              onChange={() => actions.updateData(id, { formatRepairMode: 'text' })}
            />
            Plain text
          </label>
          <label>
            <input
              className="nodrag"
              type="radio"
              checked={mode === 'json'}
              onChange={() => actions.updateData(id, { formatRepairMode: 'json' })}
            />
            JSON
          </label>
        </div>
      </div>
      <div className="node-actions">
        <span className="run-note">{data.preview}</span>
        <button
          className="inspect-button nodrag"
          type="button"
          onClick={() => actions.textPreview(id, data.fullText ?? '')}
        >
          Text Preview
        </button>
      </div>
      <div className="workflow-ports">
        <div className="workflow-port workflow-port-output">
          <PortLabel data={data} direction="output" handle="text" label="Text" valueType="text" />
          <Handle id="text" type="source" position={Position.Right} />
        </div>
        <div className="workflow-port workflow-port-output">
          <PortLabel data={data} direction="output" handle="json" label="JSON" valueType="json" />
          <Handle id="json" type="source" position={Position.Right} />
        </div>
      </div>
    </div>
  );
}
