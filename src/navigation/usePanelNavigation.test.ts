import { beforeEach, expect, it, vi } from 'vitest';
import type { EffectCallback } from 'react';
import { PanelHistory } from './panelHistory';
import { usePanelNavigationOverlay } from './usePanelNavigation';

// Exercise hook registration and rerenders without mounting an interface.
const hooks = vi.hoisted(() => ({
  index: 0,
  slots: [] as Array<{ current?: unknown; deps?: unknown[]; cleanup?: () => void }>,
  history: null as unknown,
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useContext: () => hooks.history,
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    return hooks.slots[index] ??= { current: initial };
  },
  useLayoutEffect: (effect: EffectCallback, deps?: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index];
    if (deps && previous?.deps && deps.every((value, i) => Object.is(value, previous.deps?.[i]))) return;
    previous?.cleanup?.();
    hooks.slots[index] = { deps, cleanup: effect() || undefined };
  },
}));

beforeEach(() => {
  hooks.index = 0;
  hooks.slots = [];
  hooks.history = new PanelHistory();
});

function render(close: () => void, enabled: boolean) {
  hooks.index = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePanelNavigationOverlay(close, enabled);
}

it('registers only visible previews and removes them when closed', () => {
  const history = hooks.history as PanelHistory;
  const close = vi.fn();
  render(close, false);
  expect(history.move(-1)).toBe(false);
  render(close, true);
  expect(history.move(-1)).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  render(close, false);
  expect(history.move(-1)).toBe(false);
});

it('updates the close action without moving a parent above its nested dialog', () => {
  const history = hooks.history as PanelHistory;
  const original = vi.fn();
  const latest = vi.fn();
  const nested = vi.fn();
  render(original, true);
  const removeNested = history.registerOverlay(nested);
  render(latest, true);
  history.move(-1);
  expect(nested).toHaveBeenCalledOnce();
  expect(latest).not.toHaveBeenCalled();
  removeNested();
  history.move(-1);
  expect(latest).toHaveBeenCalledOnce();
  expect(original).not.toHaveBeenCalled();
});
