import type { ProfilerOnRenderCallback } from 'react';
import packageMetadata from '../../package.json';

type Detail = Record<string, string | number | boolean | string[]>;
type Sample = { kind: string; name: string; startMs: number; durationMs: number; detail?: Detail };
const capacity = 12000;
const frameGapThresholdMs = 24;
let samples: Sample[] = [];
let overwritten = 0;
let active = false;
let startedAt = 0;
let stoppedAt = 0;
let startedIso = '';
let dispose: (() => void) | undefined;
let supportedEntries: string[] = [];
let context: Detail = {};
let rowBatchStart = -Infinity;
let rowBatch: { count: number; messageIds: string[]; rowPropChanges: string[] } | undefined;
let rowProps = new WeakMap<object, object>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const subscribeUiPerformance = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const isUiPerformanceRecording = () => active;
export function setUiPerformanceContext(next: Detail) {
  context = next;
  markUiEvent('ui.context', next);
}

function record(kind: string, name: string, start: number, duration: number, detail?: Detail) {
  if (!active || start < startedAt) return;
  const sample = { kind, name, startMs: start - startedAt, durationMs: duration, detail };
  if (samples.length < capacity) samples.push(sample);
  else samples[overwritten++ % capacity] = sample;
}

/** Synchronous work only: asynchronous provider latency must not look like a UI stall. */
export function measureUiWork<T>(name: string, work: () => T, detail?: Detail): T {
  if (!active) return work();
  const start = performance.now();
  try { return work(); }
  finally { record('work', name, start, performance.now() - start, detail); }
}

export function markUiEvent(name: string, detail?: Detail) {
  if (active) record('event', name, performance.now(), 0, detail);
}

/** Count component executions in short batches without logging every history row. */
export function countChatRowRender(messageId: number, props?: object, identity?: object) {
  if (!active) return;
  const now = performance.now();
  if (!rowBatch || now - rowBatchStart >= 16) {
    rowBatchStart = now;
    rowBatch = { count: 0, messageIds: [], rowPropChanges: [] };
    record('event', 'chat.rowRenderBatch', now, 0, rowBatch);
  }
  if (props && identity) {
    const previous = rowProps.get(identity);
    if (rowBatch.rowPropChanges.length < 20) {
      const before = previous as Record<string, unknown> | undefined;
      const after = props as Record<string, unknown>;
      const changed = before
        ? [...new Set([...Object.keys(before), ...Object.keys(after)])]
          .filter((key) => !Object.is(before[key], after[key]))
        : [];
      rowBatch.rowPropChanges.push(`${messageId}:${before ? changed.join(',') || '(unchanged)' : '(baseline)'}`);
    }
    rowProps.set(identity, props);
  }
  rowBatch.count++;
  const id = String(messageId);
  if (rowBatch.messageIds.length < 20 && !rowBatch.messageIds.includes(id)) rowBatch.messageIds.push(id);
}

export const profileUiRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
  record('react-render', id, startTime, actualDuration, {
    phase, baseDurationMs: baseDuration, commitTimeMs: commitTime - startedAt,
  });
};

export function startUiPerformance() {
  if (active) return;
  samples = [];
  overwritten = 0;
  rowBatch = undefined;
  rowProps = new WeakMap();
  startedAt = performance.now();
  stoppedAt = 0;
  startedIso = new Date().toISOString();
  active = true;
  supportedEntries = typeof PerformanceObserver === 'undefined' ? [] :
    ['longtask', 'long-animation-frame'].filter((type) => PerformanceObserver.supportedEntryTypes.includes(type));
  const observers: PerformanceObserver[] = [];
  const collect = (entries: PerformanceEntry[]) => {
    for (const entry of entries) {
      if (entry.entryType === 'longtask') {
        record('longtask', 'longtask', entry.startTime, entry.duration);
        continue;
      }
      // Deliberately omit script URLs, DOM targets, text and browser attribution objects.
      const frame = entry as PerformanceEntry & {
        renderStart?: number; styleAndLayoutStart?: number; blockingDuration?: number;
        scripts?: Array<{ duration: number; forcedStyleAndLayoutDuration: number }>;
      };
      record(entry.entryType, entry.entryType, entry.startTime, entry.duration, {
        renderDurationMs: frame.renderStart ? Math.max(0, entry.startTime + entry.duration - frame.renderStart) : 0,
        styleAndLayoutDurationMs: frame.styleAndLayoutStart ? Math.max(0, entry.startTime + entry.duration - frame.styleAndLayoutStart) : 0,
        blockingDurationMs: frame.blockingDuration ?? 0,
        scriptDurationMs: frame.scripts?.reduce((sum, script) => sum + script.duration, 0) ?? 0,
        forcedStyleAndLayoutDurationMs: frame.scripts?.reduce((sum, script) => sum + (script.forcedStyleAndLayoutDuration ?? 0), 0) ?? 0,
      });
    }
  };
  for (const type of supportedEntries) {
    const observer = new PerformanceObserver((list) => collect(list.getEntries()));
    observer.observe({ type });
    observers.push(observer);
  }
  let previous: number | undefined;
  let frameId = 0;
  const tick = (timestamp: number) => {
    if (!document.hidden && previous !== undefined && timestamp - previous >= frameGapThresholdMs) {
      record('frame-gap', 'Visible frame gap', previous, timestamp - previous);
    }
    previous = document.hidden ? undefined : timestamp;
    frameId = requestAnimationFrame(tick);
  };
  const visibility = () => {
    previous = undefined;
    markUiEvent('Visibility changed', { hidden: document.hidden });
  };
  document.addEventListener('visibilitychange', visibility);
  frameId = requestAnimationFrame(tick);
  dispose = () => {
    cancelAnimationFrame(frameId);
    document.removeEventListener('visibilitychange', visibility);
    observers.forEach((observer) => { collect(observer.takeRecords()); observer.disconnect(); });
  };
  markUiEvent('Recording started');
  markUiEvent('ui.context', context);
  notify();
}

export function stopUiPerformance() {
  if (!active) return;
  dispose?.();
  dispose = undefined;
  markUiEvent('Recording stopped');
  stoppedAt = performance.now();
  active = false;
  rowProps = new WeakMap();
  notify();
}

export function uiPerformanceReport() {
  const events = [...samples].sort((a, b) => a.startMs - b.startMs);
  const stalls = events.filter((entry) => entry.kind === 'frame-gap' || entry.kind === 'longtask' || entry.kind === 'long-animation-frame');
  const longestStalls = [...stalls].sort((a, b) => b.durationMs - a.durationMs).slice(0, 30).map((stall) => ({
    ...stall,
    nearbyWork: events.filter((entry) => (entry.kind === 'work' || entry.kind === 'event' || entry.kind === 'react-render') &&
      entry.startMs <= stall.startMs + stall.durationMs + 50 && entry.startMs + entry.durationMs >= stall.startMs - 50),
  }));
  return {
    schemaVersion: 1, appVersion: packageMetadata.version, startedIso, recording: active,
    durationMs: startedIso ? (active ? performance.now() : stoppedAt) - startedAt : 0,
    supportedEntries, reactProfilerObserved: events.some((entry) => entry.kind === 'react-render'),
    overwrittenSamples: overwritten, capacity, frameGapThresholdMs,
    notes: [
      'Times share a monotonic clock relative to recording start. Nested work overlaps; do not sum durations.',
      'Nearby work is correlation, not proof of causation. Frame gaps can also reflect system or GPU scheduling.',
      'React Profiler callbacks may be unavailable in production builds. Explicit work timings remain available.',
      'Style/layout duration includes the remaining rendering phase; it is not a paint-only measurement.',
      'Row render batches count component executions in 16 ms windows, not DOM changes or commits. IDs are capped at 20 per batch.',
      'Row prop changes compare executions within this recording, not commits. Baseline means no earlier execution was observed; details are capped at 20 per batch.',
      'No message content, character names, images, prompts, credentials or script URLs are collected.',
    ],
    longestStalls, events,
  };
}
