import { useLayoutEffect, useRef, useState } from 'react';

/** Fixed-key event handlers only: never use these wrappers to read data during render. */
export function useStableEventHandlers<T extends { [K in keyof T]: (...args: never[]) => unknown }>(handlers: T): T {
  const latest = useRef(handlers);
  useLayoutEffect(() => { latest.current = handlers; });
  // Initialization only creates wrappers; handlers read the ref after commit.
  // eslint-disable-next-line react-hooks/refs
  const [stable] = useState(() => Object.fromEntries(
    Object.keys(handlers).map((key) => [key, (...args: unknown[]) =>
      Reflect.apply(latest.current[key as keyof T], undefined, args)]),
  ) as unknown as T);
  return stable;
}
