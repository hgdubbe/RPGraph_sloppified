import { describe, expect, it } from 'vitest';
import { repairFormattedText } from './formatRepair';

describe('repairFormattedText', () => {
  it('extracts fenced JSON and removes trailing commas', () => {
    const repaired = repairFormattedText([
      'Sure, here is the JSON:',
      '```json',
      '{ "answer": true, "items": ["a",], }',
      '```',
    ].join('\n'), 'json');

    expect(repaired.text).toBe('{"answer":true,"items":["a"]}');
    expect(repaired.validJson).toBe(true);
    expect(repaired.repairs).toContain('stripped_code_fence');
    expect(repaired.repairs).toContain('removed_trailing_commas');
  });

  it('quotes simple unquoted object keys', () => {
    const repaired = repairFormattedText('{ decision: "yes", score: 2 }', 'json');

    expect(repaired.text).toBe('{"decision":"yes","score":2}');
    expect(repaired.validJson).toBe(true);
    expect(repaired.repairs).toContain('quoted_unquoted_keys');
  });

  it('normalizes plain text wrappers without forcing JSON', () => {
    const repaired = repairFormattedText('```text\n“hello”\n```', 'text');

    expect(repaired.text).toBe('"hello"');
    expect(repaired.validJson).toBe(false);
  });
});
