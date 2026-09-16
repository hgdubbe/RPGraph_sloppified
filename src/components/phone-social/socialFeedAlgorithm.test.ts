import { describe, expect, it } from 'vitest';
import type { StorybookCharacter } from '../../storybook/runtime';
import type { SocialPost } from './socialPostPresentation';
import {
  buildAlgorithmicFeed,
  getPostAuthorKey,
  interleavePostsAvoidingAdjacentAuthors,
  isPostFollowedOrOwned,
} from './socialFeedAlgorithm';

function makePost(id: string, authorName: string, authorHandle: string, authorCharacterId?: string): SocialPost {
  return {
    id,
    authorName,
    authorHandle,
    authorCharacterId,
    caption: `Caption for ${id}`,
    likeCount: 0,
    commentCount: 0,
    locked: false,
    dummy: false,
  };
}

describe('socialFeedAlgorithm', () => {
  const viewer: StorybookCharacter = {
    id: 'char-viewer',
    name: 'Viewer Alex',
    images: [],
    apps: {
      fotogram: {
        enabled: true,
        accountId: 'viewer-acc',
        profileName: 'Alex',
        bio: '',
        legacyHandles: ['alex'],
      },
    },
  } as unknown as StorybookCharacter;

  const followedChar: StorybookCharacter = {
    id: 'char-followed',
    name: 'Followed Sam',
    images: [],
    apps: {
      fotogram: {
        enabled: true,
        accountId: 'followed-acc',
        profileName: 'Sam',
        bio: '',
        legacyHandles: ['sam'],
      },
    },
  } as unknown as StorybookCharacter;

  const followedAccounts = [
    {
      name: followedChar.name,
      handle: 'sam',
      character: followedChar,
      socialUserId: 'user-sam',
    },
  ];

  const storyCharacters = [viewer, followedChar];

  describe('isPostFollowedOrOwned', () => {
    it('identifies viewer posts by character ID, account ID, name, or handle', () => {
      expect(
        isPostFollowedOrOwned(
          makePost('p1', 'Viewer Alex', 'alex', 'char-viewer'),
          viewer,
          'alex',
          followedAccounts,
          storyCharacters,
        ),
      ).toBe(true);

      expect(
        isPostFollowedOrOwned(
          { ...makePost('p2', 'Alex', 'alex'), authorAccountId: 'viewer-acc' },
          viewer,
          'alex',
          followedAccounts,
          storyCharacters,
        ),
      ).toBe(true);
    });

    it('identifies followed posts', () => {
      expect(
        isPostFollowedOrOwned(
          makePost('p3', 'Followed Sam', 'sam', 'char-followed'),
          viewer,
          'alex',
          followedAccounts,
          storyCharacters,
        ),
      ).toBe(true);
    });

    it('identifies unfollowed posts as false', () => {
      expect(
        isPostFollowedOrOwned(
          makePost('p4', 'Stranger Bob', 'bob', 'char-bob'),
          viewer,
          'alex',
          followedAccounts,
          storyCharacters,
        ),
      ).toBe(false);
    });
  });

  describe('interleavePostsAvoidingAdjacentAuthors', () => {
    it('prevents adjacent posts from the same author when possible', () => {
      const posts: SocialPost[] = [
        makePost('a1', 'Alice', 'alice'),
        makePost('a2', 'Alice', 'alice'),
        makePost('a3', 'Alice', 'alice'),
        makePost('b1', 'Bob', 'bob'),
        makePost('c1', 'Charlie', 'charlie'),
      ];

      const interleaved = interleavePostsAvoidingAdjacentAuthors(posts, 'test-seed');
      expect(interleaved).toHaveLength(5);

      for (let i = 0; i < interleaved.length - 1; i += 1) {
        const author1 = getPostAuthorKey(interleaved[i]);
        const author2 = getPostAuthorKey(interleaved[i + 1]);
        expect(author1).not.toBe(author2);
      }
    });

    it('handles edge cases gracefully', () => {
      expect(interleavePostsAvoidingAdjacentAuthors([], 'seed')).toEqual([]);

      const single = [makePost('a1', 'Alice', 'alice')];
      expect(interleavePostsAvoidingAdjacentAuthors(single, 'seed')).toEqual(single);

      const allSame = [
        makePost('a1', 'Alice', 'alice'),
        makePost('a2', 'Alice', 'alice'),
      ];
      const result = interleavePostsAvoidingAdjacentAuthors(allSame, 'seed');
      expect(result).toHaveLength(2);
    });
  });

  describe('buildAlgorithmicFeed', () => {
    it('shows 100% of posts from followed accounts and viewer, but only 1 post per unfollowed author and 50% of unfollowed authors', () => {
      // 2 posts from followed user
      const followedPosts = [
        makePost('sam-1', 'Followed Sam', 'sam', 'char-followed'),
        makePost('sam-2', 'Followed Sam', 'sam', 'char-followed'),
      ];

      // 1 post from viewer
      const viewerPosts = [
        makePost('viewer-1', 'Viewer Alex', 'alex', 'char-viewer'),
      ];

      // 4 unfollowed authors, each with 3 posts (total 12 unfollowed posts)
      const unfollowedPosts = [
        makePost('u1-a', 'Unfollowed 1', 'u1', 'char-u1'),
        makePost('u1-b', 'Unfollowed 1', 'u1', 'char-u1'),
        makePost('u1-c', 'Unfollowed 1', 'u1', 'char-u1'),

        makePost('u2-a', 'Unfollowed 2', 'u2', 'char-u2'),
        makePost('u2-b', 'Unfollowed 2', 'u2', 'char-u2'),
        makePost('u2-c', 'Unfollowed 2', 'u2', 'char-u2'),

        makePost('u3-a', 'Unfollowed 3', 'u3', 'char-u3'),
        makePost('u3-b', 'Unfollowed 3', 'u3', 'char-u3'),
        makePost('u3-c', 'Unfollowed 3', 'u3', 'char-u3'),

        makePost('u4-a', 'Unfollowed 4', 'u4', 'char-u4'),
        makePost('u4-b', 'Unfollowed 4', 'u4', 'char-u4'),
        makePost('u4-c', 'Unfollowed 4', 'u4', 'char-u4'),
      ];

      const allAvailablePosts = [...followedPosts, ...viewerPosts, ...unfollowedPosts];

      const feed = buildAlgorithmicFeed(allAvailablePosts, {
        viewer,
        viewerHandle: 'alex',
        followedAccounts,
        storyCharacters,
        viewerSeed: 'viewer-alex-seed',
      });

      // 1. Followed posts: both must be present (100%)
      expect(feed.some((p) => p.id === 'sam-1')).toBe(true);
      expect(feed.some((p) => p.id === 'sam-2')).toBe(true);

      // 2. Viewer posts: must be present (100%)
      expect(feed.some((p) => p.id === 'viewer-1')).toBe(true);

      // 3. Unfollowed posts:
      // Out of 4 unfollowed creators, exactly Math.ceil(4 * 0.5) = 2 creators must be in the feed
      // And each creator must have AT MOST 1 post in the feed
      const unfollowedInFeed = feed.filter((p) =>
        ['char-u1', 'char-u2', 'char-u3', 'char-u4'].includes(p.authorCharacterId ?? ''),
      );

      const unfollowedAuthorsInFeed = new Set(unfollowedInFeed.map((p) => p.authorCharacterId));
      expect(unfollowedAuthorsInFeed.size).toBe(2);
      expect(unfollowedInFeed).toHaveLength(2);

      // Total posts in feed = 2 followed + 1 viewer + 2 unfollowed = 5
      expect(feed).toHaveLength(5);

      // 4. Followed posts and viewer posts appear at the very top in natural order ("nicht durcheinander geschrieben, sondern ganz oben angezeigt")
      expect(feed.slice(0, 3).map((p) => p.id)).toEqual(['sam-1', 'sam-2', 'viewer-1']);

      // 5. Explore posts follow after followed posts
      const explorePosts = feed.slice(3);
      expect(explorePosts).toHaveLength(2);
      for (let i = 0; i < explorePosts.length - 1; i += 1) {
        const author1 = getPostAuthorKey(explorePosts[i], storyCharacters);
        const author2 = getPostAuthorKey(explorePosts[i + 1], storyCharacters);
        expect(author1).not.toBe(author2);
      }
    });

    it('gives different feed selections to different viewers', () => {
      const unfollowedPosts = [
        makePost('u1-a', 'Unfollowed 1', 'u1', 'char-u1'),
        makePost('u2-a', 'Unfollowed 2', 'u2', 'char-u2'),
        makePost('u3-a', 'Unfollowed 3', 'u3', 'char-u3'),
        makePost('u4-a', 'Unfollowed 4', 'u4', 'char-u4'),
        makePost('u5-a', 'Unfollowed 5', 'u5', 'char-u5'),
        makePost('u6-a', 'Unfollowed 6', 'u6', 'char-u6'),
      ];

      const feed1 = buildAlgorithmicFeed(unfollowedPosts, {
        viewer,
        viewerHandle: 'alex',
        followedAccounts: [],
        storyCharacters,
        viewerSeed: 'character-alice',
      });

      const feed2 = buildAlgorithmicFeed(unfollowedPosts, {
        viewer,
        viewerHandle: 'alex',
        followedAccounts: [],
        storyCharacters,
        viewerSeed: 'character-bob',
      });

      // Both feeds have Math.ceil(6 * 0.5) = 3 posts
      expect(feed1).toHaveLength(3);
      expect(feed2).toHaveLength(3);

      // Feed 1 and Feed 2 should differ in items or order
      const feed1Ids = feed1.map((p) => p.id).join(',');
      const feed2Ids = feed2.map((p) => p.id).join(',');
      expect(feed1Ids).not.toEqual(feed2Ids);
    });

    it('is deterministic for the same viewer', () => {
      const posts = [
        makePost('u1', 'User 1', 'u1', 'char-u1'),
        makePost('u2', 'User 2', 'u2', 'char-u2'),
        makePost('u3', 'User 3', 'u3', 'char-u3'),
        makePost('u4', 'User 4', 'u4', 'char-u4'),
      ];

      const run1 = buildAlgorithmicFeed(posts, {
        viewer,
        viewerHandle: 'alex',
        followedAccounts: [],
        storyCharacters,
        viewerSeed: 'fixed-seed-123',
      });

      const run2 = buildAlgorithmicFeed(posts, {
        viewer,
        viewerHandle: 'alex',
        followedAccounts: [],
        storyCharacters,
        viewerSeed: 'fixed-seed-123',
      });

      expect(run1.map((p) => p.id)).toEqual(run2.map((p) => p.id));
    });

    it('preserves openPostId even if not in the initial 50% slice', () => {
      const posts = [
        makePost('u1', 'User 1', 'u1', 'char-u1'),
        makePost('u2', 'User 2', 'u2', 'char-u2'),
        makePost('u3', 'User 3', 'u3', 'char-u3'),
        makePost('u4', 'User 4', 'u4', 'char-u4'),
      ];

      const feed = buildAlgorithmicFeed(posts, {
        viewer,
        viewerHandle: 'alex',
        followedAccounts: [],
        storyCharacters,
        openPostId: 'u4',
        viewerSeed: 'fixed-seed-123',
      });

      expect(feed.some((p) => p.id === 'u4')).toBe(true);
    });

    it('keeps optimistic posts at the top of the feed', () => {
      const optPost = makePost('opt-1', 'Viewer Alex', 'alex', 'char-viewer');
      const regularPosts = [
        makePost('u1', 'User 1', 'u1', 'char-u1'),
        makePost('u2', 'User 2', 'u2', 'char-u2'),
      ];

      const feed = buildAlgorithmicFeed([optPost, ...regularPosts], {
        viewer,
        viewerHandle: 'alex',
        followedAccounts: [],
        storyCharacters,
        optimisticPostIds: new Set(['opt-1']),
      });

      expect(feed[0].id).toBe('opt-1');
    });
  });
});
