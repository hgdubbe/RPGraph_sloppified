import type { WorkflowNode } from '../types';

/** Ignore position-only changes without scheduling a second App render. */
export function createNodeViewSnapshot() {
  let previous: WorkflowNode[] = [];
  return (nodes: WorkflowNode[]) => {
    if (previous.length !== nodes.length || nodes.some((node, index) => {
      const before = previous[index];
      return node.id !== before.id || node.type !== before.type ||
        node.data !== before.data || node.style !== before.style;
    })) previous = nodes;
    return previous;
  };
}
