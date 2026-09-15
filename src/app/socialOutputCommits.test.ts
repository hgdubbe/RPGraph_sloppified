import { describe, expect, it } from 'vitest';
import type { MessageRecord, SocialPostRecord } from '../types';
import type { StorybookCharacter } from '../storybook/runtime';
import { defaultRpStorybookCharacterBanking, defaultRpStorybookCharacterPhoneSettings, defaultRpStorybookCharacterSocial } from '../nodes/rp-storybook/model';
import { buildSocialCommentCommit, buildSocialDirectMessageCommit } from './socialOutputCommits';

describe('legacy social output commits', () => {
  const characters: StorybookCharacter[] = [{
    id: 'mia', name: 'Mia', storybookNodeId: 'story', kind: 'character', sourceId: 'mia', label: 'Mia',
    profile: { name: 'Mia', description: '', personality: '', speechStyle: '', role: '' },
    banking: defaultRpStorybookCharacterBanking(),
    phoneSettings: defaultRpStorybookCharacterPhoneSettings(),
    social: defaultRpStorybookCharacterSocial(),
  }];
  it('rejects missing posts and known characters without an app account', () => {
    const incoming = { app: 'fotogram' as const, postId: 'post-1', from: 'Mia', text: 'Hi' };
    expect(buildSocialCommentCommit({ incoming, characters, messages: [] }).warnings[0]).toContain('does not exist');
    const messages = [{ socialPost: { app: 'fotogram', postId: 'post-1', author: 'Bob', authorHandle: 'bob' } }] as MessageRecord[];
    expect(buildSocialCommentCommit({ incoming, characters, messages }).warnings[0]).toContain('no Fotogram account');
  });
  it('builds a comment without mutating the post or invoking effects', () => {
    const messages = [{ socialPost: { app: 'fotogram', postId: 'post-1', author: 'Bob', authorHandle: 'bob' } }] as MessageRecord[];
    const before = structuredClone(messages);
    const result = buildSocialCommentCommit({ incoming: { app: 'fotogram', postId: 'post-1', from: 'Outside Person', text: 'Nice' }, characters: [], messages });
    expect(result.commit?.reactions).toMatchObject({ postId: 'post-1', append: true, likes: 0, comments: [{ from: 'Outside Person', text: 'Nice' }] });
    expect(messages).toEqual(before);
  });
  it('rejects missing recipients and self messages', () => {
    const base = { characters: [], messages: [], messageId: 'dm-1', sentAt: '2026-09-07T00:00:00Z' };
    expect(buildSocialDirectMessageCommit({ ...base, incoming: { app: 'fotogram', from: 'Alice', text: 'Hi' } }).commit).toBeUndefined();
    expect(buildSocialDirectMessageCommit({ ...base, incoming: { app: 'fotogram', from: 'Alice', to: 'Alice', text: 'Hi' } }).warnings[0]).toContain('themselves');
  });
  it('retains explicit IDs, default recipient, tips, post origin and legacy missing-post warning', () => {
    const base = { characters: [], messages: [], messageId: 'dm-2', sentAt: '2026-09-07T00:00:00Z', defaultRecipient: { name: 'Bob', handle: 'bob' } };
    const incoming = { app: 'onlyfriends' as const, from: 'Alice', text: 'Hi', postId: 'post-1', tip: 5 };
    const post = { app: 'onlyfriends', postId: 'post-1', author: 'Bob', authorHandle: 'bob', caption: 'Caption' } as SocialPostRecord;
    const result = buildSocialDirectMessageCommit({ ...base, incoming, runPost: post });
    expect(result.commit?.record).toMatchObject({ messageId: 'dm-2', to: 'Bob', tip: 5, sentAt: base.sentAt, origin: { postId: 'post-1' } });
    const missing = buildSocialDirectMessageCommit({ ...base, incoming });
    expect(missing.commit?.record.origin).toBeUndefined();
    expect(missing.warnings[0]).toContain('without the post context');
  });
});
