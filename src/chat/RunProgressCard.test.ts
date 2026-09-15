import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkflowNode } from '../types';
import { RunProgressCard } from './RunProgressCard';

function inputNode(runActive: boolean): WorkflowNode {
  return {
    id: 'input',
    position: { x: 0, y: 0 },
    data: {
      nodeType: 'input',
      label: 'Input',
      description: '',
      preview: '',
      runActive,
    },
  };
}

function renderProgress(nodes: WorkflowNode[], isRunning = true) {
  return renderToStaticMarkup(createElement(RunProgressCard, {
    isRunning,
    nodes,
    runStartTimeMs: null,
    onCancel: () => undefined,
  }));
}

describe('RunProgressCard', () => {
  it('shows preparation before any runtime node exists', () => {
    expect(renderProgress([])).toContain('RPGraph: Preparing workflow');
  });

  it('shows preparation between active workflow steps', () => {
    expect(renderProgress([inputNode(false)])).toContain('RPGraph: Preparing workflow');
  });

  it('shows the active workflow step', () => {
    expect(renderProgress([inputNode(true)])).toContain('Input: Translate');
  });

  it('renders nothing when no workflow is running', () => {
    expect(renderProgress([], false)).toBe('');
  });
});
