/** Compare acyclic chat projections (plain objects, arrays, Maps and Sets).
 * Immutable source records take the identity fast path, so unchanged message
 * text and image data are not walked or serialized on each streamed chunk.
 */
function equalDerivedValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Map && b instanceof Map) {
    return a.size === b.size && [...a].every(([key, value]) =>
      b.has(key) && equalDerivedValue(value, b.get(key)));
  }
  if (a instanceof Set && b instanceof Set) {
    return a.size === b.size && [...a].every((value) => b.has(value));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => equalDerivedValue(value, b[index]));
  }
  if (Object.getPrototypeOf(a) !== Object.prototype) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && equalDerivedValue(left[key], right[key]));
}

/** Retain one immutable projection while its contents stay equal. Instantiate
 * once per consumer, never at module scope, to avoid sharing session caches.
 */
export function createStableDerivedValueSelector<T>() {
  let previous: T;
  let initialized = false;
  return (value: T): T => {
    if (!initialized || !equalDerivedValue(previous, value)) {
      previous = value;
      initialized = true;
    }
    return previous;
  };
}
