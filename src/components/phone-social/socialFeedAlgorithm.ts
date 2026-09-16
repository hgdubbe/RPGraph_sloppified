import type { StorybookCharacter } from '../../storybook/runtime';
import {
  socialCharacterForPost,
  socialIdentityMatches,
} from '../../chat/socialMedia';
import type { SocialPost } from './socialPostPresentation';

export type SocialFeedAccount = {
  socialUserId?: string;
  name: string;
  handle: string;
  character?: StorybookCharacter;
};

export type BuildAlgorithmicFeedOptions = {
  viewer?: StorybookCharacter;
  viewerHandle?: string;
  followedAccounts: SocialFeedAccount[];
  storyCharacters?: StorybookCharacter[];
  openPostId?: string;
  viewerSeed?: string;
  optimisticPostIds?: Set<string>;
};

/**
 * Stable 32-bit FNV-1a hash function.
 */
function hashString(str: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < str.length; index += 1) {
    hash ^= str.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Returns a stable canonical identifier for a post's author.
 */
export function getPostAuthorKey(
  post: Pick<SocialPost, 'authorAccountId' | 'authorCharacterId' | 'authorHandle' | 'authorName'>,
  storyCharacters: StorybookCharacter[] = [],
): string {
  if (storyCharacters.length > 0) {
    const character = socialCharacterForPost(
      {
        app: 'fotogram',
        postId: '',
        author: post.authorName,
        authorHandle: post.authorHandle,
        authorAccountId: post.authorAccountId,
        authorCharacterId: post.authorCharacterId,
        caption: '',
      },
      storyCharacters,
    );
    if (character) {
      return `char:${character.id}`;
    }
  }
  if (post.authorAccountId) {
    return `acc:${post.authorAccountId}`;
  }
  if (post.authorCharacterId) {
    return `char:${post.authorCharacterId}`;
  }
  if (post.authorHandle) {
    return `handle:${post.authorHandle.trim().replace(/^@/, '').toLowerCase()}`;
  }
  return `name:${post.authorName.trim().toLowerCase()}`;
}

/**
 * Determines whether a post belongs to the viewer or to an account the viewer follows.
 */
export function isPostFollowedOrOwned(
  post: SocialPost,
  viewer: StorybookCharacter | undefined,
  viewerHandle: string | undefined,
  followedAccounts: SocialFeedAccount[],
  storyCharacters: StorybookCharacter[] = [],
): boolean {
  // 1. Viewer check
  if (viewer) {
    if (post.authorCharacterId && (post.authorCharacterId === viewer.id || post.authorCharacterId === viewer.sourceId)) {
      return true;
    }
    const viewerAccount = viewer.apps?.fotogram;
    if (post.authorAccountId && viewerAccount?.accountId && post.authorAccountId === viewerAccount.accountId) {
      return true;
    }
    if (socialIdentityMatches(post.authorName, viewer.name)) {
      return true;
    }
  }
  if (viewerHandle && socialIdentityMatches(post.authorHandle, viewerHandle)) {
    return true;
  }

  // 2. Followed accounts check
  const postAuthorChar = socialCharacterForPost(
    {
      app: 'fotogram',
      postId: post.id,
      author: post.authorName,
      authorHandle: post.authorHandle,
      authorAccountId: post.authorAccountId,
      authorCharacterId: post.authorCharacterId,
      caption: post.caption,
    },
    storyCharacters,
  );

  for (const account of followedAccounts) {
    if (account.character && postAuthorChar && account.character.id === postAuthorChar.id) {
      return true;
    }
    if (
      account.character &&
      post.authorCharacterId &&
      (post.authorCharacterId === account.character.id || post.authorCharacterId === account.character.sourceId)
    ) {
      return true;
    }
    if (socialIdentityMatches(post.authorHandle, account.handle)) {
      return true;
    }
    if (socialIdentityMatches(post.authorName, account.name)) {
      return true;
    }
    if (account.socialUserId) {
      if (post.authorAccountId && post.authorAccountId === account.socialUserId) {
        return true;
      }
      if (post.authorCharacterId && post.authorCharacterId === account.socialUserId) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Reorders posts to avoid having two consecutive posts from the same author,
 * while shuffling posts according to seeded priorities.
 */
export function interleavePostsAvoidingAdjacentAuthors(
  posts: SocialPost[],
  viewerSeed: string,
  storyCharacters: StorybookCharacter[] = [],
): SocialPost[] {
  if (posts.length <= 1) {
    return posts;
  }

  // Pre-calculate author key and seeded priority for each post.
  type PrioritizedPost = {
    post: SocialPost;
    authorKey: string;
    priority: number;
  };

  const prioritized: PrioritizedPost[] = posts.map((post) => ({
    post,
    authorKey: getPostAuthorKey(post, storyCharacters),
    priority: hashString(`${viewerSeed}:priority:${post.id}`),
  }));

  // Remaining posts grouped by authorKey
  const postsByAuthor = new Map<string, PrioritizedPost[]>();
  prioritized.forEach((item) => {
    const list = postsByAuthor.get(item.authorKey);
    if (list) {
      list.push(item);
    } else {
      postsByAuthor.set(item.authorKey, [item]);
    }
  });

  // Sort each author's internal posts by priority
  postsByAuthor.forEach((list) => {
    list.sort((left, right) => right.priority - left.priority);
  });

  const result: SocialPost[] = [];
  let prevAuthorKey: string | undefined = undefined;
  let remainingCount = prioritized.length;

  while (remainingCount > 0) {
    // Find the author with the maximum remaining posts
    let maxAuthorKey: string | undefined;
    let maxCount = 0;
    postsByAuthor.forEach((list, key) => {
      if (list.length > maxCount) {
        maxCount = list.length;
        maxAuthorKey = key;
      }
    });

    const threshold = Math.ceil(remainingCount / 2);
    let chosenAuthorKey: string | undefined;

    // If an author has at least the threshold amount, we MUST pick them if they're not the previous author
    if (maxCount >= threshold && maxAuthorKey && maxAuthorKey !== prevAuthorKey) {
      chosenAuthorKey = maxAuthorKey;
    } else {
      // Find candidate authors different from prevAuthorKey
      let candidates = Array.from(postsByAuthor.entries()).filter(
        ([key, list]) => list.length > 0 && key !== prevAuthorKey,
      );

      // If no other author is available, we have no choice but to use prevAuthorKey
      if (candidates.length === 0) {
        candidates = Array.from(postsByAuthor.entries()).filter(([, list]) => list.length > 0);
      }

      if (candidates.length === 0) {
        break;
      }

      // Pick the author whose top post has the highest priority
      candidates.sort(([, listA], [, listB]) => listB[0].priority - listA[0].priority);
      chosenAuthorKey = candidates[0][0];
    }

    if (!chosenAuthorKey) {
      break;
    }

    const authorPosts = postsByAuthor.get(chosenAuthorKey)!;
    const chosenItem = authorPosts.shift()!;
    if (authorPosts.length === 0) {
      postsByAuthor.delete(chosenAuthorKey);
    }

    result.push(chosenItem.post);
    prevAuthorKey = chosenAuthorKey;
    remainingCount -= 1;
  }

  return result;
}

/**
 * Builds the algorithmic Photogram feed for a viewer:
 * 1. 100% of posts from the viewer and followed accounts are kept.
 * 2. Unfollowed accounts:
 *    - Take at most 1 post per unfollowed author ("von jeder Person ein Bild").
 *    - Keep ~50% of the unfollowed authors ("und dann nochmal 50% streichen").
 *    - Variation per character: chosen based on viewer seed.
 * 3. All selected posts are shuffled and interleaved so that no two posts
 *    from the same author appear consecutively ("nie zweimal von derselben Person hintereinander").
 * 4. Fresh / optimistic posts are kept at the top.
 */
export function buildAlgorithmicFeed(
  posts: SocialPost[],
  options: BuildAlgorithmicFeedOptions,
): SocialPost[] {
  if (posts.length === 0) {
    return [];
  }

  const {
    viewer,
    viewerHandle,
    followedAccounts,
    storyCharacters = [],
    openPostId,
    viewerSeed = viewer?.id ?? viewer?.name ?? viewerHandle ?? 'default-viewer',
    optimisticPostIds = new Set(),
  } = options;

  // Separate optimistic posts (which should remain at the very top of the feed)
  const optimisticPosts: SocialPost[] = [];
  const candidatePosts: SocialPost[] = [];

  posts.forEach((post) => {
    if (optimisticPostIds.has(post.id)) {
      optimisticPosts.push(post);
    } else {
      candidatePosts.push(post);
    }
  });

  const followedOrViewerPosts: SocialPost[] = [];
  const unfollowedPostsByAuthor = new Map<string, SocialPost[]>();

  candidatePosts.forEach((post) => {
    const isFollowedOrOwner = isPostFollowedOrOwned(
      post,
      viewer,
      viewerHandle,
      followedAccounts,
      storyCharacters,
    );

    if (isFollowedOrOwner) {
      followedOrViewerPosts.push(post);
    } else {
      const authorKey = getPostAuthorKey(post, storyCharacters);
      const existing = unfollowedPostsByAuthor.get(authorKey);
      if (existing) {
        existing.push(post);
      } else {
        unfollowedPostsByAuthor.set(authorKey, [post]);
      }
    }
  });

  // Step 1: For each unfollowed author, select 1 post deterministically based on viewerSeed
  type SelectedUnfollowed = {
    authorKey: string;
    post: SocialPost;
    authorRank: number;
  };

  const selectedUnfollowedCandidates: SelectedUnfollowed[] = [];

  unfollowedPostsByAuthor.forEach((authorPosts, authorKey) => {
    // If openPostId is in this author's posts, prefer that post so the opened post is not lost
    const openPostIndex = openPostId ? authorPosts.findIndex((p) => p.id === openPostId) : -1;
    let chosenPost: SocialPost;

    if (openPostIndex >= 0) {
      chosenPost = authorPosts[openPostIndex];
    } else {
      const pickIndex = hashString(`${viewerSeed}:post_pick:${authorKey}`) % authorPosts.length;
      chosenPost = authorPosts[pickIndex];
    }

    const authorRank = hashString(`${viewerSeed}:author_rank:${authorKey}`);
    selectedUnfollowedCandidates.push({
      authorKey,
      post: chosenPost,
      authorRank,
    });
  });

  // Step 2: Keep 50% of the unfollowed authors
  // Sort candidates by authorRank deterministically for this viewer
  selectedUnfollowedCandidates.sort((left, right) => right.authorRank - left.authorRank);

  const targetUnfollowedCount = Math.ceil(selectedUnfollowedCandidates.length * 0.5);
  const keptUnfollowed = selectedUnfollowedCandidates.slice(0, targetUnfollowedCount);

  // If openPostId is in unfollowed candidates but wasn't in the top 50%, ensure it's included
  if (openPostId && !keptUnfollowed.some((item) => item.post.id === openPostId)) {
    const openCandidate = selectedUnfollowedCandidates.find((item) => item.post.id === openPostId);
    if (openCandidate) {
      if (keptUnfollowed.length >= targetUnfollowedCount && keptUnfollowed.length > 0) {
        keptUnfollowed[keptUnfollowed.length - 1] = openCandidate;
      } else {
        keptUnfollowed.push(openCandidate);
      }
    }
  }

  const selectedUnfollowedPosts = keptUnfollowed.map((item) => item.post);

  // Step 3: Interleave unfollowed explore posts avoiding adjacent author duplicates
  const interleavedUnfollowed = interleavePostsAvoidingAdjacentAuthors(
    selectedUnfollowedPosts,
    viewerSeed,
    storyCharacters,
  );

  // Step 4: Followed and viewer posts are kept at the very top in their natural
  // timeline order ("ganz oben angezeigt, nicht durcheinander geschrieben"),
  // followed by the shuffled unfollowed explore recommendations.
  return [...optimisticPosts, ...followedOrViewerPosts, ...interleavedUnfollowed];
}
