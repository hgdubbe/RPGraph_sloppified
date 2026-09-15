import { describe, expect, it } from 'vitest';
import { isPhoneMoodStatusId, phoneMoodContext, phoneMoodStatuses } from './moodStatus';

describe('phone mood status', () => {
  it('has a prompt context for every non-online mood', () => {
    for (const status of phoneMoodStatuses) {
      if (status.id !== 'online') {
        expect(phoneMoodContext(status.id)).toContain('Phone status context');
      }
    }
  });

  it('rejects unknown mood ids', () => {
    expect(isPhoneMoodStatusId('online')).toBe(true);
    expect(isPhoneMoodStatusId('not-real')).toBe(false);
  });
});
