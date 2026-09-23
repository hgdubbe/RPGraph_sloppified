import { useState } from 'react';
import type { WorkflowNode } from '../types';
import { isStorybookSourceNode } from '../storybook/runtime';

/** Cross-node card dependencies only. Runtime state is read from each card's props. */
export function createNodeViewContentSelector() {
  let previous: WorkflowNode[] = [];
  return (nodes: WorkflowNode[]) => {
    const sources = nodes.filter((node) => isStorybookSourceNode(node) ||
      (node.data.kind === undefined &&
        (node.data.nodeType === 'fixed-number' || node.data.nodeType === 'settings-value')));
    if (sources.length === previous.length && sources.every((node, index) => {
      const before = previous[index];
      return node.id === before.id && node.data.nodeType === before.data.nodeType &&
        node.data.kind === before.data.kind &&
        node.data.storybookJson === before.data.storybookJson &&
        Object.is(node.data.fixedNumberValue, before.data.fixedNumberValue) &&
        node.data.settingsValueEntries === before.data.settingsValueEntries;
    })) return previous;
    // Deliberately omit status, metrics, previews and positions: consumers must
    // not accidentally read stale runtime state from this shared content view.
    previous = sources.map((node) => ({
      id: node.id, type: node.type, position: { x: 0, y: 0 },
      data: {
        nodeType: node.data.nodeType, kind: node.data.kind, label: node.data.nodeType,
        storybookJson: node.data.storybookJson,
        fixedNumberValue: node.data.fixedNumberValue,
        settingsValueEntries: node.data.settingsValueEntries,
      },
    } as WorkflowNode));
    return previous;
  };
}

export function useNodeViewContent(nodes: WorkflowNode[]) {
  const [select] = useState(createNodeViewContentSelector);
  return select(nodes);
}
