import { describe, expect, it } from 'vitest';
import type { MessageRecord } from '../types';
import { phoneMessagesById } from '../data-management/selectors';
import { socialTimelineGroups } from './socialTimeline';
import { socialPostEngagementByPostId } from './socialMedia';
import { collectRecentReferenceImages } from './referenceImages';
import { createStableDerivedValueSelector } from './stableDerivedValue';

const message = (id: number, fields: Partial<MessageRecord> = {}): MessageRecord => ({
  id, role: 'output', originalText: 'Hello', ...fields,
} as MessageRecord);

function project(messages: MessageRecord[], likes: Record<string, string[]> = {}) {
  return {
    phones: phoneMessagesById(messages),
    social: socialTimelineGroups(messages),
    timestamps: new Map(messages.filter((entry) => entry.socialDirectMessage)
      .map((entry) => [entry.id, entry.rpDateTime])),
    engagement: socialPostEngagementByPostId('fotogram', messages, likes),
  };
}

describe('stable chat projections', () => {
  const direct = message(1, {
    socialDirectMessage: {
      app: 'fotogram', messageId: 'dm-1', from: 'Alice', to: 'Bob', text: 'Hi',
      fromHandle: 'alice', toHandle: 'bob', sentAt: '2026-09-23T10:00:00Z',
    },
    rpDateTime: '2026-09-23T10:00',
  });
  const reply = message(2, {
    socialDirectMessage: {
      app: 'fotogram', messageId: 'dm-2', from: 'Bob', to: 'Alice', text: 'Hey',
      fromHandle: 'bob', toHandle: 'alice', sentAt: '2026-09-23T10:01:00Z',
    },
    rpDateTime: '2026-09-23T10:01',
  });

  it('retains row props across unrelated streamed text updates', () => {
    const select = createStableDerivedValueSelector<ReturnType<typeof project>>();
    const initial = select(project([direct, reply, message(3)]));
    const streamed = select(project([direct, reply, message(3, { originalText: 'Hello again' })]));
    expect(streamed).toBe(initial);
    expect(streamed.social.groups).toBe(initial.social.groups);
    expect(streamed.social.skippedIds).toEqual(new Set([2]));
  });

  it('updates social text, dates, grouping and likes instead of hiding changes', () => {
    const initial = project([direct, reply]);
    const variants = [
      project([{ ...direct, socialDirectMessage: { ...direct.socialDirectMessage!, text: 'Changed' } }, reply]),
      project([{ ...direct, rpDateTime: '2026-09-23T11:00' }, reply]),
      project([direct, message(4), reply]),
      project([direct, reply], { 'alice/fotogram': ['post-1'] }),
      project([reply]),
    ];
    for (const changed of variants) {
      const select = createStableDerivedValueSelector<ReturnType<typeof project>>();
      select(initial);
      expect(select(changed)).toBe(changed);
    }
  });

  it('invalidates linked phone records and preserves the latest event data', () => {
    const select = createStableDerivedValueSelector<ReturnType<typeof project>>();
    const phone = message(5, { channel: 'phone', rpDateTime: '2026-09-23T10:00' });
    const initial = select(project([phone]));
    const edited = { ...phone, originalText: 'Edited', rpDateTime: '2026-09-23T11:00' };
    const next = select(project([edited]));
    expect(next).not.toBe(initial);
    expect(next.phones.get(5)).toBe(edited);
    expect(select(project([])).phones.size).toBe(0);
  });
});


it('retains image ID sets across metadata changes but updates membership and undo', () => {
  const select = createStableDerivedValueSelector<Set<string>>();
  const attachment = { id: 'image-1', name: 'Image', dataUrl: 'data:image/png;base64,AA', mimeType: 'image/png', size: 1 };
  const original = message(1, { imageAttachments: [attachment], turnNumber: 1 });
  const options = { enabled: true, maxImages: 1, turnLookback: 1 };
  const projectIds = (messages: MessageRecord[], enabled = true) => select(new Set(
    collectRecentReferenceImages({ messages, nodes: [], options: { ...options, enabled } })
      .map((reference) => reference.imageId).filter(Boolean),
  ));
  const first = projectIds([original]);
  expect(first).toEqual(new Set(['image-1']));
  expect(projectIds([{ ...original, originalText: 'Edited', speakerNames: ['Speaker'], rpDateTime: '2026-09-27T12:00' }])).toBe(first);
  const nextTurn = message(2, { turnNumber: 2, imageAttachments: [{ ...attachment, id: 'image-2' }] });
  const next = projectIds([original, nextTurn]);
  expect(next).not.toBe(first);
  expect(next).toEqual(new Set(['image-2']));
  expect(projectIds([original])).toEqual(first);
  expect(projectIds([original], false)).toEqual(new Set());
  const empty = projectIds([]);
  expect(projectIds([message(3)])).toBe(empty);
});

it('preserves selection set identity for repeated clears and detects equal-size replacements', () => {
  const select = createStableDerivedValueSelector<Set<string>>();
  const empty = select(new Set());
  expect(select(new Set())).toBe(empty);
  const selected = select(new Set(['a', 'b']));
  expect(select(new Set(['b', 'a']))).toBe(selected);
  const replaced = select(new Set(['a', 'c']));
  expect(replaced).not.toBe(selected);
  expect(replaced).toEqual(new Set(['a', 'c']));
  expect(select(new Set())).toEqual(empty);
});
