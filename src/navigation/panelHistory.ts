export class PanelHistory {
  values = new Map<string, unknown>();
  private entries = [new Map<string, unknown>()];
  private index = 0;
  private pending = false;
  private changed = false;
  private listeners = new Map<string, (value: unknown) => void>();
  private overlays: Array<() => void> = [];

  registerOverlay(close: () => void) {
    this.overlays.push(close);
    return () => {
      const index = this.overlays.lastIndexOf(close);
      if (index !== -1) this.overlays.splice(index, 1);
    };
  }

  register(key: string, listener: (value: unknown) => void) {
    this.listeners.set(key, listener);
    return () => { this.listeners.delete(key); };
  }

  write(key: string, value: unknown, track = true) {
    if (this.values.has(key) && Object.is(this.values.get(key), value)) return;
    if (this.values.has(key) && track) this.changed = true;
    this.values.set(key, value);
    if (!this.pending) {
      this.pending = true;
      queueMicrotask(() => this.flush());
    }
  }

  flush() {
    if (!this.pending) return;
    this.pending = false;
    if (this.changed) {
      this.entries.splice(this.index + 1);
      this.entries.push(new Map(this.values));
      if (this.entries.length > 200) this.entries.shift();
      this.index = this.entries.length - 1;
    } else {
      this.entries[this.index] = new Map(this.values);
    }
    this.changed = false;
  }

  move(direction: -1 | 1) {
    const closeOverlay = this.overlays[this.overlays.length - 1];
    if (closeOverlay) {
      if (direction === -1) closeOverlay();
      return true;
    }
    this.flush();
    const next = this.index + direction;
    if (next < 0 || next >= this.entries.length) return false;
    this.index = next;
    this.values = new Map(this.entries[next]);
    for (const [key, listener] of this.listeners) {
      // Earlier visits may predate an app's first mount or a session reset.
      // Absence is not an explicit undefined value: keep valid mounted state.
      if (this.values.has(key)) listener(this.values.get(key));
    }
    return true;
  }

  reset(clearPhone = false) {
    this.pending = false;
    this.changed = false;
    this.values = new Map([...this.values].filter(([key]) => this.listeners.has(key) && (!clearPhone || key.startsWith('panel.'))));
    this.entries = [new Map(this.values)];
    this.index = 0;
  }
}
