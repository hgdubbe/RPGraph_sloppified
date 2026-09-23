import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkflowNode } from '../types';
import { runProgress } from './runProgress';
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
    ...runProgress(nodes),
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

  it('ignores node payload and position changes in its display projection', () => {
    const node = inputNode(true);
    expect(runProgress([{ ...node, position: { x: 20, y: 10 },
      data: { ...node.data, preview: 'New runtime output' },
    }])).toEqual(runProgress([node]));
  });

  it('prioritizes the newest LLM call over visual activity and shows reasoning tokens', () => {
    const older = inputNode(true);
    older.data.llmActiveCallLabel = 'Translate';
    older.data.llmActiveCallStartedAtMs = 10;
    const latest = inputNode(true);
    latest.id = 'latest';
    latest.data.label = 'Latest input';
    latest.data.llmActiveCallLabel = 'Translate';
    latest.data.llmActiveCallStartedAtMs = 20;
    latest.data.llmActiveReasoningTokens = 42;
    const visual = inputNode(true);
    visual.data.runActiveStartedAtMs = 30;
    const nodes = [older, latest, visual];
    expect(runProgress(nodes)).toEqual({ activity: 'Latest input: Translate', reasoningTokens: 42 });
    expect(renderProgress(nodes)).toContain('RSN: 42');
    expect(nodes).toEqual([older, latest, visual]);
  });

  it('falls back to the most recently started visual step', () => {
    const older = inputNode(true);
    older.data.runActiveStartedAtMs = 10;
    const latest = inputNode(true);
    latest.data.label = 'Latest input';
    latest.data.runActiveStartedAtMs = 20;
    expect(runProgress([older, latest]).activity).toBe('Latest input: Translate');
  });
});
