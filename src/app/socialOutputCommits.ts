import type { MessageRecord, SocialDirectMessageRecord, SocialPostRecord, SocialReactionsRecord } from '../types';
import type { StorybookCharacter } from '../storybook/runtime';
import type { EmbeddedPhoneMessagesResult, ParsedIncomingSocialDirectMessage } from '../chat/phoneMessages';
import { resolveSocialMessageIdentity } from '../chat/socialMessageValidation';
import { establishedSocialHandle } from '../chat/socialDirectory';
import { isBundledSocialHandle, socialHandleFromCatalogIdentity } from '../chat/socialCatalogs';
import { socialAppNames, socialHandleForCharacter, socialHandleForName, socialIdentityMatches } from '../chat/socialMedia';

type SocialCommitContext = { characters: StorybookCharacter[]; messages: MessageRecord[] };
export type SocialCommentCommit = { type: 'append-social-reactions'; historyText: string; reactions: SocialReactionsRecord };
export type SocialDirectMessageCommit = { type: 'append-social-message'; record: SocialDirectMessageRecord; sourceOrder?: number };
type BuildResult<T> = { commit?: T; warnings: string[] };

// These builders preserve the existing parser's compatibility rules. They do
// not generate identities, call providers or apply state changes.
export function buildSocialCommentCommit({ incoming, characters, messages }: SocialCommitContext & {
  incoming: EmbeddedPhoneMessagesResult['socialPostComments'][number];
}): BuildResult<SocialCommentCommit> {
  const post = messages.find((message) => message.socialPost?.app === incoming.app && message.socialPost.postId === incoming.postId)?.socialPost;
  if (!post) return { warnings: [`${socialAppNames[incoming.app]} post comment was ignored because post "${incoming.postId}" does not exist.`] };
  const commenter = resolveSocialMessageIdentity({ characters, messages, app: incoming.app, identity: incoming.from });
  if (!commenter.available) return { warnings: [`${socialAppNames[incoming.app]} post comment was ignored. ${commenter.reason}`] };
  const from = commenter.name;
  const handle = commenter.handle ?? (commenter.character ? socialHandleForCharacter(commenter.character, incoming.app)
    : establishedSocialHandle(messages, incoming.app, from) ?? socialHandleForName(from));
  return { warnings: [], commit: {
    type: 'append-social-reactions',
    historyText: `[${socialAppNames[incoming.app]}] ${from} (@${handle}) commented on ${incoming.postId}: "${incoming.text}"`,
    reactions: { app: incoming.app, postId: incoming.postId, likes: 0, comments: [{ from, handle, text: incoming.text }], append: true },
  } };
}

export function buildSocialDirectMessageCommit({ incoming, characters, messages, defaultRecipient, runPost, messageId, sentAt }: SocialCommitContext & {
  incoming: ParsedIncomingSocialDirectMessage;
  defaultRecipient?: { name: string; handle: string };
  runPost?: SocialPostRecord;
  messageId: string;
  sentAt: string;
}): BuildResult<SocialDirectMessageCommit> {
  const warnings: string[] = [];
  const recipientName = incoming.to ?? defaultRecipient?.name;
  if (!recipientName) return { warnings: [`A ${socialAppNames[incoming.app]} direct message from "${incoming.from}" was ignored because it has no recipient.`] };
  const recipient = resolveSocialMessageIdentity({ characters, messages, app: incoming.app, identity: recipientName, allowNewNpc: true });
  if (!recipient.available) return { warnings: [`A ${socialAppNames[incoming.app]} direct message was ignored. ${recipient.reason}`] };
  const to = recipient.name;
  const toHandle = !incoming.to && defaultRecipient ? defaultRecipient.handle
    : recipient.handle ?? (recipient.character ? socialHandleForCharacter(recipient.character, incoming.app)
      : establishedSocialHandle(messages, incoming.app, to) ?? socialHandleForName(to));
  const sender = resolveSocialMessageIdentity({ characters, messages, app: incoming.app, identity: incoming.from, allowNewNpc: true });
  if (!sender.available) return { warnings: [`A ${socialAppNames[incoming.app]} direct message was ignored. ${sender.reason}`] };
  const from = sender.name;
  const explicitOrCatalogHandle = socialHandleFromCatalogIdentity(incoming.app, incoming.from, incoming.handle);
  const knownFromHandle = sender.handle ?? (sender.character ? socialHandleForCharacter(sender.character, incoming.app)
    : establishedSocialHandle(messages, incoming.app, from));
  const fromHandle = sender.character ? knownFromHandle ?? socialHandleForName(from)
    : explicitOrCatalogHandle && (!knownFromHandle || isBundledSocialHandle(incoming.app, explicitOrCatalogHandle))
      ? explicitOrCatalogHandle : knownFromHandle ?? socialHandleForName(from);
  if (socialIdentityMatches(fromHandle, toHandle)) return { warnings: [`A ${socialAppNames[incoming.app]} direct message from "${from}" to themselves was ignored.`] };
  let originPost = runPost && runPost.postId === incoming.postId ? runPost : undefined;
  if (!originPost && incoming.postId) {
    originPost = messages.find((message) => message.socialPost?.app === incoming.app && message.socialPost.postId === incoming.postId)?.socialPost;
    if (!originPost) warnings.push(`${socialAppNames[incoming.app]} direct message references unknown post "${incoming.postId}"; it was delivered without the post context.`);
  }
  const record: SocialDirectMessageRecord = {
    app: incoming.app, messageId, from, fromHandle, to, toHandle, text: incoming.text, sentAt,
    ...(sender.accountId ? { fromAccountId: sender.accountId } : {}),
    ...(recipient.accountId ? { toAccountId: recipient.accountId } : {}),
    ...(incoming.tip !== undefined ? { tip: incoming.tip } : {}),
    ...(originPost ? { origin: { postId: originPost.postId, postAuthor: originPost.author, postAuthorHandle: originPost.authorHandle,
      postCaption: originPost.caption, postImageId: originPost.imageId, postImageDescription: originPost.imageDescription } } : {}),
  };
  return { warnings, commit: { type: 'append-social-message', record, sourceOrder: incoming.sourceOrder } };
}
