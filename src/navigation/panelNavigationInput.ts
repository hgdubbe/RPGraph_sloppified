type Direction = -1 | 1;

// Desktop drivers can emit both a native command and DOM mouse events.
// Track the entire press so holding a button cannot create a second step.
export function createPanelNavigationInput(move: (direction: Direction) => void, now = () => performance.now()) {
  const pressed = new Set<Direction>();
  let lastSignal: { direction: Direction; source: 'native' | 'mouse'; time: number } | undefined;

  function dispatch(direction: Direction, source: 'native' | 'mouse') {
    const time = now();
    const duplicate = lastSignal?.direction === direction && lastSignal.source !== source && time - lastSignal.time < 150;
    if (!duplicate) {
      lastSignal = { direction, source, time };
      move(direction);
    }
  }

  return {
    native(direction: Direction) {
      if (!pressed.has(direction)) dispatch(direction, 'native');
    },
    down(direction: Direction) {
      if (pressed.has(direction)) return;
      pressed.add(direction);
      dispatch(direction, 'mouse');
    },
    up(direction: Direction) {
      if (!pressed.delete(direction)) return;
      // Pair a native release command too, regardless of how long the press lasted.
      lastSignal = { direction, source: 'mouse', time: now() };
    },
    reset() {
      pressed.clear();
      lastSignal = undefined;
    },
  };
}
