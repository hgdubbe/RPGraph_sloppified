import { isTextGenerationConnection } from '../../llm/textProvider';
import { useNodeActions } from '../NodeActionsContext';
import { useNodeView } from '../NodeViewContext';
import { NodeCustomSelect } from './NodeCustomSelect';
import { providerOption } from './providerHealthLabels';

export function ConnectionSelect({
  id,
  label,
  connectionId,
}: {
  id: string;
  label: string;
  connectionId?: string;
}) {
  const { changeConnection } = useNodeActions();
  const { connections, providerHealthById } = useNodeView();

  const options = connections
    .filter((connection) => isTextGenerationConnection(connection, providerHealthById[connection.id]))
    .map((connection) => providerOption(connection, providerHealthById[connection.id]));

  return (
    <>
      <label className="node-field-label" htmlFor={`${id}-connection`}>
        {label}
      </label>
      <NodeCustomSelect
        id={`${id}-connection`}
        value={connectionId}
        onChange={(val) => changeConnection(id, val)}
        options={options}
      />
    </>
  );
}
