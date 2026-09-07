import { describe, expect, it } from 'vitest';
import { normalizeRunGraphRequest } from './runGraphRequest';

describe('RunGraphRequest', () => {
  it('defaults optional message metadata without changing required input', () => {
    expect(normalizeRunGraphRequest({ inputText: 'hello' })).toMatchObject({
      inputText: 'hello',
      images: [],
      directActionOnly: false,
      isPhoneMessage: false,
    });
  });
});
