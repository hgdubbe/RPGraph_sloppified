import type { EmbeddedPhoneMessageLink, EmbeddedSocialMessageLink, MessageRecord, SocialDirectMessageRecord } from '../types';
import { createStableDerivedValueSelector } from './stableDerivedValue';

type PhoneGroup = { messageIds: number[]; entries: Array<{ phoneMessage: EmbeddedPhoneMessageLink }> };
export type RowTimelineSource<G extends PhoneGroup> = {
  phoneMessagesById: Map<number, MessageRecord>;
  socialMessagesById: Map<number, SocialDirectMessageRecord>;
  socialMessageRpDateTimeById: Map<number, string>;
  socialTimeline: { groups: Map<number, EmbeddedSocialMessageLink[]>; skippedIds: Set<number> };
  phoneTimelineGroupsByFirstMessageId: Map<number, G>;
  skippedPhoneTimelineMessageIds: Set<number>;
};

function pick<T>(source: Map<number, T>, ids: Iterable<number>) {
  const result = new Map<number, T>();
  for (const id of ids) {
    if (source.has(id)) result.set(id, source.get(id)!);
  }
  return result;
}

/** Each row receives only records it reads, including quoted phone replies.
 * Removed rows release their selectors; no historical session data accumulates.
 */
export function createRowTimelineSelector<G extends PhoneGroup>() {
  const selectors = new Map<number, ReturnType<typeof createStableDerivedValueSelector<RowTimelineSource<G>>>>();
  return (messages: MessageRecord[], source: RowTimelineSource<G>) => {
    const result = new Map<number, RowTimelineSource<G>>();
    for (const message of messages) {
      const group = source.phoneTimelineGroupsByFirstMessageId.get(message.id);
      const phoneIds = new Set([
        ...(message.embeddedPhoneMessages ?? []).map((link) => link.phoneMessageId),
        ...(group?.entries ?? []).map((entry) => entry.phoneMessage.phoneMessageId),
      ]);
      // The row reads one reply level, not a recursive conversation history.
      for (const id of [...phoneIds]) {
        const replyId = source.phoneMessagesById.get(id)?.replyToMessageId;
        if (replyId !== undefined) phoneIds.add(replyId);
      }
      const socialIds = new Set([
        ...(message.embeddedSocialMessages ?? []),
        ...(source.socialTimeline.groups.get(message.id) ?? []),
      ].map((link) => link.socialMessageId));
      let select = selectors.get(message.id);
      if (!select) {
        select = createStableDerivedValueSelector<RowTimelineSource<G>>();
        selectors.set(message.id, select);
      }
      result.set(message.id, select({
        phoneMessagesById: pick(source.phoneMessagesById, phoneIds),
        socialMessagesById: pick(source.socialMessagesById, socialIds),
        socialMessageRpDateTimeById: pick(source.socialMessageRpDateTimeById, socialIds),
        socialTimeline: {
          groups: pick(source.socialTimeline.groups, [message.id]),
          skippedIds: new Set(source.socialTimeline.skippedIds.has(message.id) ? [message.id] : []),
        },
        phoneTimelineGroupsByFirstMessageId: pick(source.phoneTimelineGroupsByFirstMessageId, [message.id]),
        skippedPhoneTimelineMessageIds: new Set(source.skippedPhoneTimelineMessageIds.has(message.id) ? [message.id] : []),
      }));
    }
    for (const id of selectors.keys()) if (!result.has(id)) selectors.delete(id);
    return result;
  };
}
