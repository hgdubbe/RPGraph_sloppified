import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import type { WorkflowNode, WorkflowNodeData } from '../../types';
import { NodeActionsContext, useNodeActions } from '../NodeActionsContext';
import { useNodeView } from '../NodeViewContext';
import { getRegisteredNode } from '../registry';
import { LlmCallMetrics, runStateClassName, useNodeLayoutSync } from '../shared/CardView';
import { PromptPreviewTools } from '../shared/PromptTools';
import { buildPromptStepChain, stepOutputTokenNames } from '../shared/promptSteps';
import { LlmPromptSwitchNodeCard } from './Card';
import { applyLegacyRouterPatch, assemblePrompt, migrateRouter, resolveRoute, validateRouter, type ResponseRouterConfig } from './routerModel';
import './responseRouter.css';
import { PromptSectionEditor } from './PromptSectionEditor';
import { RouterHelp } from './RouterHelp';
import { assembleSections } from './promptSections';

const inputPorts = [
  ['text', 'Text'], ['image', 'Images'], ['output-channel', 'Output selection'], ['prompt-slot', 'Prompt selection'],
] as const;

export function ResponseRouterCard({ id, data }: NodeProps<WorkflowNode>) {
  const actions = useNodeActions();
  const view = useNodeView();
  const flow = useReactFlow<WorkflowNode>();
  const bodyRef = useNodeLayoutSync(id);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WorkflowNodeData | null>(null);
  const [patch, setPatch] = useState<Partial<WorkflowNodeData>>({});
  const [baseRevision, setBaseRevision] = useState(0);
  const [editingRouteId, setEditingRouteId] = useState<string>();
  const [previewRouteId, setPreviewRouteId] = useState<string>();
  const [query, setQuery] = useState('');
  const [outputValue, setOutputValue] = useState('0');
  const [promptValue, setPromptValue] = useState('0');
  const [checkResult, setCheckResult] = useState('');
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<{ patch: Partial<WorkflowNodeData>; edges: typeof view.edges; revision: number }>();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const outputs = migrateRouter(data).outputs;
    return new Set(outputs.reduce((count, output) => count + output.routes.length, 0) > 20 ? outputs.map((output) => output.id) : []);
  });
  const config = data.responseRouter ?? migrateRouter(data);
  const editorData = draft ?? data;
  const editorConfig = editorData.responseRouter ?? migrateRouter(editorData);
  const dirty = Object.keys(patch).length > 0;
  const selectedOutputIndex = editorData.llmPromptSwitchSelectedOutputChannel ?? 0;
  const selectedPromptIndex = editorData.llmPromptSwitchSelectedPromptSlot ?? 0;
  const selectedOutput = editorConfig.outputs[selectedOutputIndex] ?? editorConfig.outputs[0];
  const selectedRoute = selectedOutput.routes[selectedPromptIndex] ?? selectedOutput.routes[0];
  const steps = buildPromptStepChain(selectedRoute.before, selectedRoute.after);
  const stepIssues = steps.flatMap((step, index) => stepOutputTokenNames(`${step.before}\n${step.after}`)
    .filter((name) => !steps.slice(0, index).some((previous) => previous.name === name))
    .map((name) => `Missing earlier step: ${name}`));

  const retainNodeEditor = view.retainNodeEditor;
  useEffect(() => {
    retainNodeEditor?.(id, open || dirty);
    return () => retainNodeEditor?.(id, false);
  }, [retainNodeEditor, id, open, dirty]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => returnFocusRef.current?.focus();
  }, [open]);

  function highlight(handle: string | undefined) {
    // Visual emphasis is transient DOM state, never saved as workflow edge data.
    const root = bodyRef.current?.closest('.react-flow');
    const edgeIds = new Set(view.edges.filter((edge) => edge.source === id && edge.sourceHandle === handle).map((edge) => edge.id));
    root?.querySelectorAll<HTMLElement>('.react-flow__edge').forEach((element) => {
      element.classList.toggle('response-router-path', edgeIds.has(element.dataset.id ?? ''));
    });
  }

  function editRoute(routeId: string) {
    const next = draft ?? { ...data, responseRouter: config };
    const nextConfig = migrateRouter(next);
    const outputIndex = nextConfig.outputs.findIndex((output) => output.routes.some((route) => route.id === routeId));
    if (outputIndex < 0) return;
    const promptIndex = nextConfig.outputs[outputIndex].routes.findIndex((route) => route.id === routeId);
    if (!draft) setBaseRevision(config.revision);
    setDraft({ ...next, llmPromptSwitchSelectedOutputChannel: outputIndex, llmPromptSwitchSelectedPromptSlot: promptIndex });
    setEditingRouteId(routeId);
    highlight(nextConfig.outputs[outputIndex].handle);
    if (!open) returnFocusRef.current = document.activeElement as HTMLElement;
    setOpen(true);
  }

  function updateDraft(_nodeId: string, changes: Record<string, unknown>) {
    const typed = changes as Partial<WorkflowNodeData>;
    setDraft((current) => {
      const source = current ?? data;
      const hasMatrixChange = Object.keys(changes).some((key) => /Titles|Befores|Afters/.test(key));
      const responseRouter = hasMatrixChange ? applyLegacyRouterPatch(source, typed) : migrateRouter(source);
      return { ...source, ...typed, responseRouter } as WorkflowNodeData;
    });
    const authored = Object.fromEntries(Object.entries(changes).filter(([key]) => !key.startsWith('llmPromptSwitchSelected')));
    if (Object.keys(authored).length) {
      setPatch((current) => ({ ...current, ...authored }));
      setNotice('');
    }
  }

  function changeConfig(next: ResponseRouterConfig) {
    setDraft({ ...editorData, responseRouter: { ...next, revision: next.revision + 1 } });
    setPatch((current) => ({ ...current, responseRouter: next }));
    setNotice('');
  }

  function apply() {
    if (config.revision !== baseRevision) {
      setNotice('The saved configuration changed. Keep this draft or discard it before editing the newer version.');
      return;
    }
    const errors = validateRouter(editorConfig);
    if (errors.length) { setNotice(errors.join(' ')); return; }
    const next = { ...editorConfig, revision: config.revision + 1 };
    const deletedHandles = new Set(config.outputs.filter((output) => !next.outputs.some((entry) => entry.handle === output.handle)).map((output) => output.handle));
    const previousPatch = Object.fromEntries(Object.keys(patch).map((key) => [key, data[key as keyof WorkflowNodeData]]));
    setUndo({ patch: { ...previousPatch, responseRouter: config }, edges: view.edges.filter((edge) => edge.source === id && deletedHandles.has(edge.sourceHandle ?? '')), revision: next.revision });
    actions.updateData(id, { ...patch, responseRouter: next });
    if (deletedHandles.size) flow.setEdges((edges) => edges.filter((edge) => edge.source !== id || !deletedHandles.has(edge.sourceHandle ?? '')));
    setDraft({ ...editorData, responseRouter: next });
    setBaseRevision(next.revision);
    setPatch({});
    setNotice('Applied');
  }

  function reorder(direction: number, group: boolean) {
    const next = migrateRouter(editorData);
    const list = group ? next.outputs : next.outputs[selectedOutputIndex].routes;
    const index = group ? selectedOutputIndex : selectedPromptIndex;
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    changeConfig(next);
    setDraft((current) => current && ({ ...current,
      llmPromptSwitchSelectedOutputChannel: group ? target : selectedOutputIndex,
      llmPromptSwitchSelectedPromptSlot: group ? selectedPromptIndex : target,
    }));
  }

  const destinationLabel = (nodeId: string, port?: string | null, direction: 'input' | 'output' = 'input') => {
    const node = view.nodes.find((entry) => entry.id === nodeId);
    const definition = node && getRegisteredNode(node.data.nodeType);
    const portName = node && definition?.ports(node.data).find((entry) => entry.direction === direction && entry.id === (port || 'default'))?.label;
    return `${node?.data.label ?? nodeId} / ${portName ?? port ?? 'default'}`;
  };
  const destinationList = (handle: string) => view.edges.filter((edge) => edge.source === id && edge.sourceHandle === handle);
  function destinations(handle: string) {
    const edges = destinationList(handle);
    if (!edges.length) return <span className="router-muted">Not connected</span>;
    return edges.map((edge) => <button type="button" key={edge.id} className="router-destination nodrag" onClick={() => {
      highlight(handle);
      void flow.fitView({ nodes: [{ id: edge.target }], maxZoom: 1, duration: 200 });
    }}>{destinationLabel(edge.target, edge.targetHandle)}</button>);
  }

  function check() {
    try {
      const result = resolveRoute(config, outputValue, promptValue);
      setPreviewRouteId(result.route.id);
      highlight(result.output.handle);
      const targets = destinationList(result.output.handle).map((edge) => destinationLabel(edge.target, edge.targetHandle));
      setCheckResult(`Preview: ${result.route.title} / ${result.output.title}. ${targets.join(', ') || 'Not connected'}. ${result.fallback ? 'Legacy fallback' : 'Exact match'}.`);
    } catch (error) {
      setPreviewRouteId(undefined); highlight(undefined);
      setCheckResult(error instanceof Error ? error.message : String(error));
    }
  }

  return <>
    <div ref={bodyRef} className={`workflow-node response-router-node${runStateClassName(data)}`}>
      <div className="node-title-row"><span className="node-dot" /><strong>{data.label === 'LLM Prompt Switch' ? 'Response Router' : data.label}</strong></div>
      <div className="router-summary"><span>Response Router</span><span>{config.policy === 'legacy' ? 'Legacy compatibility' : 'Strict routing'}</span></div>
      <span className="router-muted">{view.connections.find((connection) => connection.id === data.connectionId)?.label ?? 'Default connection'}</span>
      <button type="button" className="inspect-button nodrag" onClick={() => editRoute(selectedRoute.id)}>Edit routes</button>
      <LlmCallMetrics data={data} />
      <div className="router-inputs">
        {inputPorts.map(([handle, label]) => {
          const incoming = view.edges.filter((edge) => edge.target === id && edge.targetHandle === handle);
          const observed = handle === 'output-channel' ? data.responseRouterLastRun?.outputValue
            : handle === 'prompt-slot' ? data.responseRouterLastRun?.promptValue
            : handle === 'text' ? data.llmPromptSwitchDebug?.inputValue : undefined;
          const resolved = handle === 'output-channel' ? data.responseRouterLastRun?.selectedOutput : handle === 'prompt-slot' ? data.responseRouterLastRun?.selectedPrompt : undefined;
          const imageCount = data.responseRouterLastRun?.connectedImageCount;
          return <div className="router-input" key={handle}>
            <Handle id={handle} type="target" position={Position.Left} />
            <strong>{label}</strong><span>{incoming.length ? incoming.map((edge) => destinationLabel(edge.source, edge.sourceHandle, 'output')).join(', ') : 'Not connected'}</span>
            <small>{incoming.length > 1 && handle !== 'image' ? 'Multiple sources' : handle === 'image' && imageCount !== undefined ? `${imageCount} connected images; ${data.responseRouterLastRun?.referenceImageCount ?? 0} reference images` : observed !== undefined ? `${observed.slice(0, 100) || '(empty)'}${resolved !== undefined ? ` / resolved: ${resolved}` : ''}` : 'Not run yet'}</small>
          </div>;
        })}
      </div>
      {config.outputs.map((output) => <section className="router-output" key={output.id}>
        <header><button type="button" className="nodrag" aria-label={`${collapsed.has(output.id) ? 'Expand' : 'Collapse'} ${output.title}`} onClick={() => setCollapsed((current) => {
          const next = new Set(current); if (next.has(output.id)) next.delete(output.id); else next.add(output.id); return next;
        })}>{collapsed.has(output.id) ? '+' : '-'}</button><strong>{output.title}</strong><small>{output.routes.length} routes / {destinationList(output.handle).length} connections</small>
          <Handle id={output.handle} type="source" position={Position.Right} />
        </header>
        <div className="router-destinations">{destinations(output.handle)}{output.unused && <span>Intentionally unused</span>}</div>
        {!collapsed.has(output.id) && output.routes.map((route) => <button type="button" className="router-route nodrag" key={route.id}
          aria-pressed={editingRouteId === route.id} onClick={() => editRoute(route.id)}>
          <span>{route.title}</span><code>({output.selector}, {route.selector})</code>
          <small>{data.responseRouterLastRun?.routeId === route.id ? `Last run: ${data.responseRouterLastRun.state}` : previewRouteId === route.id ? 'Preview' : editingRouteId === route.id ? 'Editing' : ''}</small>
        </button>)}
      </section>)}
      <div className="router-check nodrag nowheel">
        <label>Output value<input aria-label="Output value" value={outputValue} onChange={(event) => setOutputValue(event.target.value)} /></label>
        <label>Prompt value<input aria-label="Prompt value" value={promptValue} onChange={(event) => setPromptValue(event.target.value)} /></label>
        <button type="button" onClick={check}>Check routing</button>
        {data.responseRouterLastRun && <button type="button" onClick={() => {
          setOutputValue(data.responseRouterLastRun!.outputValue); setPromptValue(data.responseRouterLastRun!.promptValue);
        }}>Use last run</button>}
      </div>
      <p role="status" className="router-check-result">{checkResult || data.responseRouterLastRun?.error || (data.responseRouterLastRun ? `Run revision ${data.responseRouterLastRun.revision}` : 'Not run yet')}</p>
      <RouterHelp topic="preview" />
      <PromptPreviewTools id={id} debug={data.llmPromptSwitchDebug} generatedText={data.generatedText} runLabel="Response Router" />
    </div>
    {open && createPortal(<div className="router-editor-backdrop nodrag nowheel" onPointerDown={(event) => event.stopPropagation()}>
      <div className="router-editor" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Response Router editor" onKeyDown={(event) => {
        if (!dialogRef.current?.contains(event.target as Node)) return;
        if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
        if (event.key === 'Tab') {
          const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length);
          const first = items[0]; const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <header className="router-editor-header"><strong>Response Router / {data.label}</strong>
          <div>{dirty && <button className="router-apply" type="button" onClick={apply}>Apply</button>}
            <button type="button" aria-label="Close editor" title="Close editor" onClick={() => setOpen(false)}>&times;</button></div>
        </header>
        <div className="router-editor-body">
          <nav aria-label="Router routes"><input aria-label="Search routes" placeholder="Search routes" value={query} onChange={(event) => setQuery(event.target.value)} />
            {editorConfig.outputs.map((output) => <section key={output.id}><h3>{output.title}</h3>{output.routes.filter((route) => `${output.title} ${route.title}`.toLowerCase().includes(query.toLowerCase())).map((route) =>
              <button type="button" key={route.id} aria-current={selectedRoute.id === route.id} onClick={() => editRoute(route.id)}>{route.title} <small>({output.selector}, {route.selector})</small></button>)}</section>)}
          </nav>
          <main className="router-editor-content">
            <div className="router-editor-context"><strong>{selectedOutput.title} / {selectedRoute.title}</strong><span>Selected by ({selectedOutput.selector}, {selectedRoute.selector})</span>{destinations(selectedOutput.handle)}</div>
            <RouterHelp topic="sections" />
            <NodeActionsContext.Provider value={{ ...actions, updateData: updateDraft,
              removeLlmPromptSwitchOutputChannel: () => {},
              changeConnection: (_id, value) => updateDraft(id, { connectionId: value }),
            }}>
              <LlmPromptSwitchNodeCard id={id} data={editorData} editorOnly structuredEditor={<PromptSectionEditor
                key={selectedRoute.id} route={selectedRoute} config={editorConfig} onChange={(sections) => changeConfig({ ...editorConfig,
                  outputs: editorConfig.outputs.map((output) => ({ ...output, routes: output.routes.map((route) => route.id === selectedRoute.id
                    ? { ...route, sections, ...assembleSections(sections) } : route) })),
                })} />} confirmRemoval={(kind) => window.confirm(kind === 'output'
                ? `Remove ${selectedOutput.title}, its ${selectedOutput.routes.length} routes and ${destinationList(selectedOutput.handle).length} outgoing connections on Apply? Other selector mappings will remain unchanged.`
                : `Remove ${selectedRoute.title}, mapping (${selectedOutput.selector}, ${selectedRoute.selector}), on Apply? Other mappings and shared actions will remain unchanged.`)} />
            </NodeActionsContext.Provider>
            <details><summary>Steps and captured input</summary>
              <ol>{steps.map((step, index) => <li key={index}>{step.name || 'Response'}</li>)}</ol>
              {stepIssues.map((issue, index) => <p key={index} className="router-error">{issue}</p>)}
              <pre>{data.llmPromptSwitchDebug?.inputValue ?? 'Not run yet'}</pre>
            </details>
            <details><summary>Preview assembly</summary><pre>{assemblePrompt(selectedRoute, data.llmPromptSwitchDebug?.inputValue ?? '', view.settingsValueDefinitions, view.settingsValues).combinedPrompt}</pre></details>
            <details><summary>Routing and compatibility</summary>
              <RouterHelp topic="selectors" />
              <label>Output selector<input type="number" min="0" step="1" value={selectedOutput.selector} onChange={(event) => {
                const selector = event.target.valueAsNumber;
                if (!Number.isSafeInteger(selector) || selector < 0) return;
                changeConfig({ ...editorConfig, nextOutputSelector: Math.max(editorConfig.nextOutputSelector, selector + 1), outputs: editorConfig.outputs.map((output) => output.id === selectedOutput.id ? { ...output, selector } : output) });
              }} /></label>
              <label>Prompt selector<input type="number" min="0" step="1" value={selectedRoute.selector} onChange={(event) => {
                const selector = event.target.valueAsNumber;
                if (!Number.isSafeInteger(selector) || selector < 0) return;
                changeConfig({ ...editorConfig, outputs: editorConfig.outputs.map((output) => output.id === selectedOutput.id ? { ...output, nextPromptSelector: Math.max(output.nextPromptSelector, selector + 1), routes: output.routes.map((route) => route.id === selectedRoute.id ? { ...route, selector } : route) } : output) });
              }} /></label>
              {validateRouter(editorConfig).map((error) => <p className="router-error" key={error}>{error}</p>)}
              <label>Selector policy<select value={editorConfig.policy} onChange={(event) => changeConfig({ ...editorConfig, policy: event.target.value as ResponseRouterConfig['policy'] })}>
                <option value="legacy">Legacy compatibility</option><option value="strict">Strict routing</option>
              </select></label>
              <RouterHelp topic="policy" />
              <label>Disconnected output<select value={selectedOutput.disconnected} onChange={(event) => changeConfig({ ...editorConfig, outputs: editorConfig.outputs.map((output) => output.id === selectedOutput.id ? { ...output, disconnected: event.target.value as 'allow' | 'error' } : output) })}>
                <option value="allow">Allow execution</option><option value="error">Stop before model call</option>
              </select></label>
              <RouterHelp topic="disconnected" />
              <label><input type="checkbox" checked={selectedOutput.unused} onChange={(event) => changeConfig({ ...editorConfig, outputs: editorConfig.outputs.map((output) => output.id === selectedOutput.id ? { ...output, unused: event.target.checked } : output) })} />Intentionally unused</label>
              <RouterHelp topic="unused" />
              <div className="router-order"><span>Output order</span><button type="button" aria-label="Move output up" disabled={selectedOutputIndex === 0} onClick={() => reorder(-1, true)}>&uarr;</button><button type="button" aria-label="Move output down" disabled={selectedOutputIndex === editorConfig.outputs.length - 1} onClick={() => reorder(1, true)}>&darr;</button></div>
              <div className="router-order"><span>Route order</span><button type="button" aria-label="Move route up" disabled={selectedPromptIndex === 0} onClick={() => reorder(-1, false)}>&uarr;</button><button type="button" aria-label="Move route down" disabled={selectedPromptIndex === selectedOutput.routes.length - 1} onClick={() => reorder(1, false)}>&darr;</button></div>
            </details>
          </main>
        </div>
        <footer><span role="status" className={notice === 'Applied' ? 'router-applied' : ''}>{notice || (dirty ? 'Unapplied changes' : `Revision ${config.revision}`)}</span>
          {undo && !dirty && <button type="button" disabled={config.revision !== undo.revision} onClick={() => {
            const restored = { ...undo.patch.responseRouter!, revision: config.revision + 1 };
            actions.updateData(id, { ...undo.patch, responseRouter: restored });
            flow.setEdges((edges) => [...edges, ...undo.edges.filter((edge) => !edges.some((existing) => existing.id === edge.id) && flow.getNode(edge.target))]);
            setDraft(null); setBaseRevision(restored.revision); setUndo(undefined); setNotice('Changes undone');
          }}>Undo Apply</button>}
          {dirty && <button type="button" onClick={() => { setDraft(null); setPatch({}); setBaseRevision(config.revision); setNotice('Draft discarded'); }}>Discard changes</button>}
        </footer>
      </div>
    </div>, document.body)}
  </>;
}
