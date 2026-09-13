import { describe, expect, it } from 'vitest';
import { parseDecisionRoutedContext } from './execute';

describe('parseDecisionRoutedContext', () => {
  it('parses a well-formed bundle', () => {
    const bundle = { history: 'Bob left.', lastInput: 'Hi!' };
    expect(parseDecisionRoutedContext(JSON.stringify(bundle))).toEqual(bundle);
  });

  it('returns undefined for malformed JSON rather than throwing', () => {
    expect(parseDecisionRoutedContext('not json')).toBeUndefined();
  });

  it('returns undefined for a non-object JSON value', () => {
    expect(parseDecisionRoutedContext('42')).toBeUndefined();
    expect(parseDecisionRoutedContext('null')).toBeUndefined();
    expect(parseDecisionRoutedContext('"text"')).toBeUndefined();
  });
});
