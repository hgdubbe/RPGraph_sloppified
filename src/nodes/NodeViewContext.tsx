import { createContext, useContext } from 'react';
import type { NodeViewValues } from './types';

export const NodeViewContext = createContext<NodeViewValues | null>(null);

export function useNodeView() {
  const values = useContext(NodeViewContext);
  if (!values) {
    throw new Error('NodeViewContext is not available.');
  }
  return values;
}

export function useOptionalNodeView() {
  return useContext(NodeViewContext);
}
