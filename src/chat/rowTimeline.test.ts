import { expect, it } from 'vitest';
import type { MessageRecord } from '../types';
import { createRowTimelineSelector, type RowTimelineSource } from './rowTimeline';

type Group = { messageIds: number[]; entries: Array<{ phoneMessage: { phoneMessageId: number; from: string; to: string; message: string } }> };
const message = (id: number, extra: Partial<MessageRecord> = {}) => ({ id, role: 'output', originalText: 'Text', ...extra }) as MessageRecord;
const link = (id: number) => ({ phoneMessageId: id, from: 'A', to: 'B', message: 'Text' });
function source(): RowTimelineSource<Group> {
  return {
    phoneMessagesById: new Map(), socialMessagesById: new Map(), socialMessageRpDateTimeById: new Map(),
    socialTimeline: { groups: new Map(), skippedIds: new Set() },
    phoneTimelineGroupsByFirstMessageId: new Map(), skippedPhoneTimelineMessageIds: new Set(),
  };
}

it('isolates old rows from unrelated phone and social updates', () => {
  const select = createRowTimelineSelector<Group>();
  const data = source();
  const rows = [message(1), message(2, { embeddedPhoneMessages: [link(10)] })];
  data.phoneMessagesById.set(10, message(10));
  const first = select(rows, data);
  data.phoneMessagesById.set(10, message(10, { rpDateTime: '2026-09-27T12:00' }));
  data.socialMessageRpDateTimeById.set(99, '2026-09-27T13:00');
  const next = select(rows, data);
  expect(next.get(1)).toBe(first.get(1));
  expect(next.get(2)).not.toBe(first.get(2));
  expect(next.get(2)?.phoneMessagesById.get(10)?.rpDateTime).toBe('2026-09-27T12:00');
});

it('keeps phone group members and quoted replies current across edits and removal', () => {
  const select = createRowTimelineSelector<Group>();
  const data = source();
  const rows = [message(1), message(2)];
  data.phoneTimelineGroupsByFirstMessageId.set(1, { messageIds: [1, 2], entries: [{ phoneMessage: link(10) }] });
  data.skippedPhoneTimelineMessageIds.add(2);
  data.phoneMessagesById.set(10, message(10, { replyToMessageId: 9 }));
  data.phoneMessagesById.set(9, message(9));
  const first = select(rows, data);
  expect(first.get(1)?.phoneMessagesById.size).toBe(2);
  expect(first.get(2)?.skippedPhoneTimelineMessageIds.has(2)).toBe(true);
  data.phoneMessagesById.set(9, message(9, { originalText: 'Edited reply' }));
  const edited = select(rows, data);
  expect(edited.get(1)).not.toBe(first.get(1));
  expect(edited.get(1)?.phoneMessagesById.get(9)?.originalText).toBe('Edited reply');
  data.phoneMessagesById.delete(9);
  data.skippedPhoneTimelineMessageIds.clear();
  expect(select(rows, data).get(1)?.phoneMessagesById.has(9)).toBe(false);
  expect(select(rows, data).get(2)?.skippedPhoneTimelineMessageIds.size).toBe(0);
  select([], data);
  expect(select(rows, data).get(1)).not.toBe(edited.get(1));
});

it('updates linked social text, timestamps and regrouping without touching other rows', () => {
  const select = createRowTimelineSelector<Group>();
  const data = source();
  const socialLink = { socialMessageId: 10, app: 'fotogram', from: 'A', to: 'B' } as NonNullable<MessageRecord['embeddedSocialMessages']>[number];
  const rows = [message(1), message(2, { embeddedSocialMessages: [socialLink] }), message(3)];
  const dm = { app: 'fotogram', messageId: 'dm', from: 'A', to: 'B', text: 'Hi', sentAt: 'today' } as NonNullable<MessageRecord['socialDirectMessage']>;
  data.socialMessagesById.set(10, dm);
  data.socialTimeline.groups.set(3, [socialLink]);
  const first = select(rows, data);
  data.socialMessagesById.set(10, { ...dm, text: 'Edited' });
  data.socialMessageRpDateTimeById.set(10, '2026-09-27T12:00');
  const next = select(rows, data);
  expect(next.get(1)).toBe(first.get(1));
  for (const id of [2, 3]) {
    expect(next.get(id)).not.toBe(first.get(id));
    expect(next.get(id)?.socialMessagesById.get(10)?.text).toBe('Edited');
    expect(next.get(id)?.socialMessageRpDateTimeById.get(10)).toBe('2026-09-27T12:00');
  }
  data.socialTimeline.groups.clear();
  data.socialTimeline.skippedIds.add(3);
  const regrouped = select(rows, data);
  expect(regrouped.get(3)?.socialTimeline.skippedIds.has(3)).toBe(true);
  expect(regrouped.get(3)?.socialMessagesById.size).toBe(0);
});
