import { beforeEach, expect, it, vi } from 'vitest';
import { useStableEventHandlers } from './useStableEventHandlers';

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useState: <T,>(initial: () => T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial();
    return [hooks.slots[index]];
  },
  useRef: <T,>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useLayoutEffect: (effect: () => void) => { hooks.effects.push(effect); },
}));
beforeEach(() => { hooks.slots = []; hooks.index = 0; hooks.effects = []; });

it('keeps context and callback identities while dispatching to the latest committed handler', async () => {
  const old = vi.fn(async () => false);
  const latest = vi.fn(async () => true);
  const render = (handler: (key: string) => Promise<boolean>) => {
    hooks.index = 0;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useStableEventHandlers({ generateVoice: handler });
  };
  const first = render(old);
  hooks.effects.splice(0).forEach((effect) => effect());
  const second = render(latest);
  expect(second).toBe(first);
  expect(second.generateVoice).toBe(first.generateVoice);
  await expect(first.generateVoice('book')).resolves.toBe(false);
  hooks.effects.splice(0).forEach((effect) => effect());
  await expect(first.generateVoice('book')).resolves.toBe(true);
  expect(latest).toHaveBeenCalledWith('book');
  expect(old).toHaveBeenCalledTimes(1);
  expect(latest).toHaveBeenCalledTimes(1);
});
