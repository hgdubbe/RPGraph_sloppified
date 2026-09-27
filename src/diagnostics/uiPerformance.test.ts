import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  countChatRowRender, isUiPerformanceRecording, markUiEvent, measureUiWork, profileUiRender,
  setUiPerformanceContext, startUiPerformance, stopUiPerformance, uiPerformanceReport,
} from './uiPerformance';

let now = 100;
let frames: Map<number, FrameRequestCallback>;
let frameId = 0;
let observerCallback: (list: { getEntries: () => PerformanceEntry[] }) => void;
let pendingEntries: PerformanceEntry[];
const documentMock = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
const disconnect = vi.fn();
function tick(time: number) {
  now = time;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(time));
}
beforeEach(() => {
  now = 100;
  frames = new Map();
  frameId = 0;
  pendingEntries = [];
  documentMock.hidden = false;
  documentMock.addEventListener.mockClear();
  disconnect.mockClear();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('document', documentMock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['longtask'];
    constructor(callback: typeof observerCallback) { observerCallback = callback; }
    observe() {}
    takeRecords() { return pendingEntries; }
    disconnect() { disconnect(); }
  });
  startUiPerformance();
});
afterEach(() => { stopUiPerformance(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('preserves return values and exceptions while recording synchronous work', () => {
  expect(measureUiWork('work', () => { now += 12; return 42; })).toBe(42);
  const error = new Error('original error');
  expect(() => measureUiWork('failed', () => { now += 4; throw error; })).toThrow(error);
  expect(uiPerformanceReport().events.filter((event) => event.kind === 'work')).toMatchObject([
    { name: 'work', startMs: 0, durationMs: 12 },
    { name: 'failed', startMs: 12, durationMs: 4 },
  ]);
  expect(JSON.stringify(uiPerformanceReport())).not.toContain('original error');
});

it('does no recording or clock reads while disabled', () => {
  stopUiPerformance();
  const count = uiPerformanceReport().events.length;
  vi.mocked(performance.now).mockClear();
  expect(measureUiWork('ignored', () => 8)).toBe(8);
  markUiEvent('ignored');
  expect(performance.now).not.toHaveBeenCalled();
  expect(uiPerformanceReport().events).toHaveLength(count);
  expect(frames.size).toBe(0);
  expect(disconnect).toHaveBeenCalledOnce();
});

it('correlates visible frame gaps with message field updates on the same clock', () => {
  tick(110);
  now = 120;
  measureUiWork('messages.update', () => { now = 175; }, { messageId: 2, fields: ['speakerNames', 'dialogue'] });
  tick(180);
  const report = uiPerformanceReport();
  expect(report.longestStalls[0]).toMatchObject({ kind: 'frame-gap', startMs: 10, durationMs: 70 });
  expect(report.longestStalls[0].nearbyWork).toContainEqual(expect.objectContaining({ name: 'messages.update', durationMs: 55 }));
});

it('does not mistake hidden-window pauses for visible stutters', () => {
  tick(110);
  documentMock.hidden = true;
  tick(5000);
  documentMock.hidden = false;
  tick(6000);
  expect(uiPerformanceReport().longestStalls).toHaveLength(0);
});

it('retains browser timing fields but excludes attribution URLs and arbitrary data', () => {
  const entry = {
    entryType: 'long-animation-frame', name: 'secret URL', startTime: 110, duration: 100,
    renderStart: 170, styleAndLayoutStart: 180, blockingDuration: 50,
    scripts: [{ duration: 60, forcedStyleAndLayoutDuration: 20, sourceURL: 'private.js' }],
  } as unknown as PerformanceEntry;
  observerCallback({ getEntries: () => [entry] });
  expect(uiPerformanceReport().longestStalls[0].detail).toMatchObject({
    renderDurationMs: 40, styleAndLayoutDurationMs: 30, scriptDurationMs: 60, forcedStyleAndLayoutDurationMs: 20,
  });
  expect(JSON.stringify(uiPerformanceReport())).not.toMatch(/private\.js|secret URL/);
  pendingEntries = [{ entryType: 'longtask', startTime: 120, duration: 90 } as PerformanceEntry];
  stopUiPerformance();
  expect(uiPerformanceReport().events.some((event) => event.kind === 'longtask')).toBe(true);
});

it('bounds storage and resets it for a new recording', () => {
  for (let index = 0; index < 12005; index++) { now++; markUiEvent('marker', { index }); }
  const report = uiPerformanceReport();
  expect(report.events).toHaveLength(report.capacity);
  expect(report.overwrittenSamples).toBeGreaterThan(0);
  stopUiPerformance();
  setUiPerformanceContext({ messageCount: 10 });
  startUiPerformance();
  expect(uiPerformanceReport().overwrittenSamples).toBe(0);
  expect(uiPerformanceReport().events).toHaveLength(2);
  expect(uiPerformanceReport().events[1].detail).toEqual({ messageCount: 10 });
});

it('reports profiler availability and prevents duplicate recording loops', () => {
  startUiPerformance();
  expect(frames.size).toBe(1);
  expect(isUiPerformanceRecording()).toBe(true);
  expect(uiPerformanceReport().reactProfilerObserved).toBe(false);
  profileUiRender('Chat', 'update', 25, 40, 110, 140);
  expect(uiPerformanceReport().reactProfilerObserved).toBe(true);
});

it('still records work and frame gaps without browser performance observers', () => {
  stopUiPerformance();
  vi.stubGlobal('PerformanceObserver', undefined);
  startUiPerformance();
  tick(110); tick(180);
  expect(uiPerformanceReport().supportedEntries).toEqual([]);
  expect(uiPerformanceReport().longestStalls).toHaveLength(1);
});

it('batches row executions without filling the report with one event per row', () => {
  for (let id = 1; id <= 1000; id++) countChatRowRender(id);
  let batches = uiPerformanceReport().events.filter((event) => event.name === 'chat.rowRenderBatch');
  expect(batches).toHaveLength(1);
  expect(batches[0].detail?.count).toBe(1000);
  expect(batches[0].detail?.messageIds).toHaveLength(20);
  now += 16;
  countChatRowRender(1001);
  batches = uiPerformanceReport().events.filter((event) => event.name === 'chat.rowRenderBatch');
  expect(batches).toHaveLength(2);
  stopUiPerformance();
  countChatRowRender(1002);
  expect(batches[1].detail?.count).toBe(1);
});

it('records only changed prop names with bounded execution details and fresh baselines', () => {
  const identity = {};
  const props = { message: { text: 'private text' }, language: 'private language' };
  countChatRowRender(1, props, identity);
  countChatRowRender(1, { ...props, language: 'another private language' }, identity);
  const detail = uiPerformanceReport().events.find((event) => event.name === 'chat.rowRenderBatch')?.detail;
  expect(detail?.rowPropChanges).toEqual(['1:(baseline)', '1:language']);
  for (let id = 2; id < 100; id++) countChatRowRender(id, props, {});
  expect(detail?.rowPropChanges).toHaveLength(20);
  expect(JSON.stringify(uiPerformanceReport())).not.toContain('private');
  stopUiPerformance();
  startUiPerformance();
  countChatRowRender(1, props, identity);
  expect(uiPerformanceReport().events.find((event) => event.name === 'chat.rowRenderBatch')?.detail?.rowPropChanges)
    .toEqual(['1:(baseline)']);
});
