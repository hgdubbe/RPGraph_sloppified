import type { MessageRecord } from '../types';

/** Live display snapshots are separate from App's committed message state. */
export function createMessageStream() {
  let snapshot: MessageRecord[] = [];
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish: (messages: MessageRecord[]) => {
      if (snapshot === messages) return;
      snapshot = messages;
      for (const listener of listeners) listener();
    },
  };
}

export type MessageStream = ReturnType<typeof createMessageStream>;
