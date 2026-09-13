import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunProgressCard } from './RunProgressCard';
import type { WorkflowNode } from '../types';

const render = (nodes: WorkflowNode[], isRunning = true) => renderToStaticMarkup(createElement(RunProgressCard, {
  nodes, isRunning, runStartTimeMs: null, onCancel: () => {},
}));

describe('run progress between graph evaluation and action completion', () => {
  it('stays visible and cancellable when no node is active', () => {
    const nodes = [{ id: 'output', data: { nodeType: 'output', label: 'RP Output', runActive: false } }] as WorkflowNode[];
    expect(render(nodes)).toContain('Current workflow step');
    expect(render(nodes)).toContain('Cancel');
    expect(render([])).toContain('Preparing workflow');
  });
  it('still displays an active node and hides after completion', () => {
    const nodes = [{ id: 'output', data: { nodeType: 'output', label: 'RP Output', runActive: true } }] as WorkflowNode[];
    expect(render(nodes)).toContain('RP Output');
    expect(render(nodes, false)).toBe('');
  });
});
