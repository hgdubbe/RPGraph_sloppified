import { expect, it, vi } from 'vitest';
import { createPanelNavigationInput } from './panelNavigationInput';

it.each([-1, 1] as const)('navigates once for a long press in direction %s', (direction) => {
  let time = 0;
  const move = vi.fn();
  const input = createPanelNavigationInput(move, () => time);
  input.native(direction);
  input.down(direction);
  time = 3000;
  input.native(direction);
  input.down(direction);
  input.up(direction);
  input.native(direction);
  expect(move).toHaveBeenCalledExactlyOnceWith(direction);
});

it('handles DOM-first presses and never navigates on release', () => {
  let time = 0;
  const move = vi.fn();
  const input = createPanelNavigationInput(move, () => time);
  input.down(-1);
  time = 5000;
  input.native(-1);
  input.up(-1);
  input.native(-1);
  expect(move).toHaveBeenCalledExactlyOnceWith(-1);
});

it('keeps rapid separate clicks and both directions working', () => {
  const move = vi.fn();
  const input = createPanelNavigationInput(move, () => 0);
  for (const direction of [-1, -1, 1, 1] as const) {
    input.native(direction);
    input.down(direction);
    input.up(direction);
  }
  expect(move.mock.calls).toEqual([[-1], [-1], [1], [1]]);
});

it('supports native-only commands and clears held buttons after focus loss', () => {
  const move = vi.fn();
  const input = createPanelNavigationInput(move, () => 0);
  input.native(-1);
  input.native(-1);
  input.down(1);
  input.reset();
  input.down(1);
  expect(move.mock.calls).toEqual([[-1], [-1], [1], [1]]);
});
