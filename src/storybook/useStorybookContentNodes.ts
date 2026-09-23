import { useState } from 'react';
import type { WorkflowNode } from '../types';
import { isStorybookSourceNode } from './runtime';

/** Select only storybook content inputs, independently of graph activity and positions.
 * Returned nodes are for id/storybookJson reads only, not live runtime state.
 */
export function createStorybookContentSelector() {
  let previous: WorkflowNode[] = [];
  return (nodes: WorkflowNode[]) => {
    const books = nodes.filter(isStorybookSourceNode);
    if (books.length !== previous.length || books.some((node, index) =>
      node.id !== previous[index].id || node.data.storybookJson !== previous[index].data.storybookJson)) {
      previous = books;
    }
    return previous;
  };
}

export function useStorybookContentNodes(nodes: WorkflowNode[]) {
  const [select] = useState(createStorybookContentSelector);
  return select(nodes);
}
