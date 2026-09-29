import { measureUiWork, markUiEvent } from '../diagnostics/uiPerformance';
import { usePanelNavigationState, usePanelNavigationReset } from '../navigation/usePanelNavigation';
import { interactedNpcIds } from '../characters/messageExchanges';
import { useStorybookContentNodes } from '../storybook/useStorybookContentNodes';
import { nextAutoScrollSpeed } from '../chat/autoScrollSpeed';
import { bankingRecipientByName } from '../chat/bankingRecipients';
import { hasAuthoredConnection } from '../characters/relationships';
import { automaticAccountLinkGrants, resolveAccountLink, type AccountLinkTarget } from '../chat/accountLinks';
import type { AccountLinkOpenRequest } from '../chat/accountLinkContext';
import { appCharacterImage } from '../characters/appRuntime';
import type { NpcParticipantReference } from '../characters/npcParticipants';
import { matchMeState, unreadMatchMeMatches } from '../chat/matchMe';
import { datingAccountId, datingAccountMatches } from '../chat/datingAccounts';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import {
  validSmoothChatAutoScrollMinSpeed,
} from '../settings';
import type { PhoneMoodStatusId } from '../phone/moodStatus';
import type { CommandInputCommand } from '../chat/structuredCommands';
import {
  phoneRuntimeCharactersFromMessages,
  type PhoneRuntimeCharacter,
} from '../chat/phoneCharacters';
import { usePhoneReply } from '../chat/usePhoneReply';
import {
  bankTransferMessages,
  latestBankTransferMessageIdForCharacter,
  unreadBankTransferCountForCharacter,
  unreadBankTransfersForCharacter,
} from '../chat/bankTransfers';
import type { OnlyFriendsPurchasesByCharacter } from '../chat/onlyFriendsWallet';
import type {
  ChatGpdChatsByCharacter,
  PhoneNotesByCharacter,
} from '../chat/phoneAppsSessions';
import { normalizePhoneName } from '../chat/phoneMessages';
import {
  buildSocialDirectory,
  withSocialDirectoryConnectionAdded,
  withAuthoredSocialConnections,
  withSocialConnectionAdded,
  socialConnectionIds,
  type DynamicSocialUsers,
  type SocialConnectionsByCharacter,
} from '../chat/socialDirectory';
import {
  socialCharacterForPost,
  socialIdentityMatches,
  socialLikeAccountKey,
  socialMessageHiddenFromChat,
} from '../chat/socialMedia';
import { useCharacterColors } from './useCharacterColors';
import {
  chatAttachmentFromStorybookImage,
  storyCharactersFromNodes,
  type StorybookCharacter,
} from '../storybook/runtime';
import {
  embeddedPhoneMessageCharacters,
  phoneContactsForViewer,
  phoneConversationInfoFromMessages,
  phoneConversationKey,
  selectedPhoneConversationMessages,
  phoneSwitchCharacters,
  unreadPhoneConversationsForCharacters,
} from '../data-management/selectors';
import {
  appointmentEntitiesFromAppointments,
  appointmentsFromEventEntities,
  eventEntitiesFromNodes,
  normalizeEventAppointments,
  updateEventEntityStatus,
  upcomingAppointments,
} from '../data-management/eventStore';
import { openingHistoryMessageIds } from '../chat/turns';
import {
  parseRpStorybookJson,
  rpStorybookPhoneContactAllowed,
  type RpStorybook,
} from '../nodes/rp-storybook/model';
import {
  narratorCharacterId,
  narratorSpeakerName,
} from './runOrchestration';
import type {
  ChatImageAttachment,
  EmbeddedPhoneMessageLink,
  EmbeddedSocialMessageLink,
  MessageRecord,
  SocialAppKind,
  SocialMessengerAppKind,
  SocialDirectMessageOpenRequest,
  SocialDmUnreadByHandle,
  SocialPostRecord,
  TurnRecord,
  WorkflowNode,
  WorkflowNodeData,
} from '../types';
import type { PhoneAppOpenRequest } from '../components/PhonePanel';
import type { RoleplayActivityShortcutId } from './roleplayActivityShortcuts';

export type ChatPanelView = 'chat' | 'phone' | 'events';
export type RoleplayActivityShortcut = {
  id: RoleplayActivityShortcutId;
  label: string;
  badge?: number;
  title: string;
  onOpen: () => void;
};

const phoneAuthorBadgesStorageKey = 'rpgraph-phone-author-badges-enabled';
const chatReadsPhoneAppsStorageKey = 'rpgraph-chat-reads-phone-apps-enabled';
const contextDrawerWidthStorageKey = 'rpgraph-context-drawer-width';

// Mirrors the dual-pane drawer's own 900px container-query breakpoint
// (src/styles/roleplay-dual-pane.css) so layout-dependent JS (inert/aria-hidden,
// drawer overlay-vs-inline mode) never drifts out of sync with the CSS.
const narrowLayoutContainerWidthThreshold = 900;

export type ContextDrawerContent = 'phone' | 'timeline' | 'events' | null;

type UseRoleplayPanelRuntimeOptions = {
  appCharacters: StorybookCharacter[];
  captureNpcParticipants: (references: NpcParticipantReference[]) => void;
  nodeViewNodes: WorkflowNode[];
  nodesRef: { current: WorkflowNode[] };
  messages: MessageRecord[];
  turns: TurnRecord[];
  storybooksByNodeId: Map<string, RpStorybook>;
  characterStorybookNodeCount: number;
  englishProcessingEnabled: boolean;
  smoothChatAutoScrollEnabled: boolean;
  smoothChatAutoScrollMinSpeed: number;
  isRunning: boolean;
  commitNodes: (nodes: WorkflowNode[]) => void;
  notifySystem: (level: 'info' | 'warning' | 'error', message: string) => void;
};

export function useRoleplayPanelRuntime({
  appCharacters,
  captureNpcParticipants,
  nodeViewNodes,
  nodesRef,
  messages,
  turns,
  storybooksByNodeId,
  characterStorybookNodeCount,
  englishProcessingEnabled,
  smoothChatAutoScrollEnabled,
  smoothChatAutoScrollMinSpeed,
  isRunning,
  commitNodes,
  notifySystem,
}: UseRoleplayPanelRuntimeOptions) {
  const [panelSessionRevision, setPanelSessionRevision] = useState(0);
  const [smoothChatAutoScrollActive, setSmoothChatAutoScrollActive] = useState(false);
  const resetPanelNavigation = usePanelNavigationReset(panelSessionRevision);
  const [selectedCharacterId, setSelectedCharacterId] = usePanelNavigationState('panel.selectedCharacterId', '');
  const [viewedPhoneCharacterId, setViewedPhoneCharacterId] = usePanelNavigationState('panel.viewedPhoneCharacterId', '');
  const [selectedPhoneCharacterId, setSelectedPhoneCharacterId] = usePanelNavigationState('panel.selectedPhoneCharacterId', '');
  const [selectedEventId, setSelectedEventId] = usePanelNavigationState('panel.selectedEventId', '');
  const [phoneSeenByConversation, setPhoneSeenByConversation] = useState<Record<string, number>>({});
  const [bankingSeenByCharacter, setBankingSeenByCharacter] = useState<Record<string, number>>({});
  const [phoneAppSeenByCharacter, setPhoneAppSeenByCharacter] = useState<Record<string, number>>({});
  const [bankingContactsByCharacter, setBankingContactsByCharacter] = useState<Record<string, string[]>>({});
  // Liked post ids per "characterId/app" account key; part of the RP save.
  const [socialLikesByAccount, setSocialLikesByAccount] = useState<Record<string, string[]>>({});
  const [savedDynamicSocialUsers, setDynamicSocialUsers] = useState<DynamicSocialUsers>({});
  const [savedSocialConnectionsByCharacter, setSocialConnectionsByCharacter] =
    useState<SocialConnectionsByCharacter>({});
  // Notes and ChatGPD chats per character id; part of the RP save. Mirrored into refs
  // (like turnsRef in useTurnRecordState.ts) because a session snapshot taken from
  // within a useEffect right after a commit otherwise risks reading a stale closure of
  // this state if that effect's own re-render happens to run before this update lands -
  // observed as a real, intermittent, silent turn-autosave gap for actions-v1 model-
  // authored note.write/assistant.chat commits.
  const [phoneNotesByCharacter, setPhoneNotesByCharacterState] = useState<PhoneNotesByCharacter>({});
  const phoneNotesByCharacterRef = useRef(phoneNotesByCharacter);
  const setPhoneNotesByCharacter = (update: SetStateAction<PhoneNotesByCharacter>) => {
    const next = typeof update === 'function'
      ? (update as (current: PhoneNotesByCharacter) => PhoneNotesByCharacter)(phoneNotesByCharacterRef.current)
      : update;
    phoneNotesByCharacterRef.current = next;
    setPhoneNotesByCharacterState(next);
  };
  const [chatGpdChatsByCharacter, setChatGpdChatsByCharacterState] = useState<ChatGpdChatsByCharacter>({});
  const chatGpdChatsByCharacterRef = useRef(chatGpdChatsByCharacter);
  const setChatGpdChatsByCharacter = (update: SetStateAction<ChatGpdChatsByCharacter>) => {
    const next = typeof update === 'function'
      ? (update as (current: ChatGpdChatsByCharacter) => ChatGpdChatsByCharacter)(chatGpdChatsByCharacterRef.current)
      : update;
    chatGpdChatsByCharacterRef.current = next;
    setChatGpdChatsByCharacterState(next);
  };
  const [onlyFriendsPurchasesByCharacter, setOnlyFriendsPurchasesByCharacter] =
    useState<OnlyFriendsPurchasesByCharacter>({});
  const [phoneHomeRequestId, setPhoneHomeRequestId] = usePanelNavigationState('panel.phoneHomeRequestId', 0, false);
  const [phoneAppOpenRequest, setPhoneAppOpenRequest] = useState<PhoneAppOpenRequest>();
  const accountLinkRequestId = useRef(0);
  const [accountLinkOpenRequest, setAccountLinkOpenRequest] = usePanelNavigationState<AccountLinkOpenRequest>('panel.accountLinkOpenRequest');
  const [socialPostOpenRequest, setSocialPostOpenRequest] = usePanelNavigationState<{
    requestId: number;
    app: SocialPostRecord['app'];
    postId: string;
  }>('panel.socialPostOpenRequest');
  const [socialDirectMessageOpenRequest, setSocialDirectMessageOpenRequest] =
    usePanelNavigationState<SocialDirectMessageOpenRequest>('panel.socialDirectMessageOpenRequest');
  const [phoneGalleryOpenRequestId, setPhoneGalleryOpenRequestId] = useState(0);
  const [phoneDividerAfterByConversation, setPhoneDividerAfterByConversation] = useState<Record<string, number>>({});
  const [recentlyUsedEmojis, setRecentlyUsedEmojis] = useState<string[]>([]);
  const [recentChatCharacterIds, setRecentChatCharacterIds] = useState<string[]>([]);
  const [openedPhoneConversationKey, setOpenedPhoneConversationKey] = usePanelNavigationState('panel.openedPhoneConversationKey', '');
  const [phoneAuthorBadgesEnabled, setPhoneAuthorBadgesEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(phoneAuthorBadgesStorageKey) === 'true';
    } catch {
      return false;
    }
  });
  const [chatReadsPhoneAppsEnabled, setChatReadsPhoneAppsEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(chatReadsPhoneAppsStorageKey) !== 'false';
    } catch {
      return true;
    }
  });
  const [highlightedPhoneMessage, setHighlightedPhoneMessage] = useState<{
    id: number;
    pulseKey: number;
  }>();
  const [lastSeenMessageRecordId, setLastSeenMessageRecordId] = useState(0);
  const [seenEventIds, setSeenEventIds] = useState<Set<string>>(() => new Set());
  const [highlightedEventIds, setHighlightedEventIds] = useState<Set<string>>(() => new Set());
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneDraftContextComment, setPhoneDraftContextComment] = useState('');
  const [phoneMoodStatus, setPhoneMoodStatus] = useState<PhoneMoodStatusId>('online');
  const [phoneDraftCommands, setPhoneDraftCommands] = useState<CommandInputCommand[]>([]);
  const [phoneImages, setPhoneImages] = useState<ChatImageAttachment[]>([]);
  const [showPhoneEmojiPicker, setShowPhoneEmojiPicker] = useState(false);

  // `drawerContent` is the single source of truth for which panel is showing;
  // `chatPanelView` below is derived from it for the many reads elsewhere
  // that predate the Context Drawer / toggle rail.
  const [drawerContent, setDrawerContent] = usePanelNavigationState<ContextDrawerContent>(
    'panel.drawerContent', null,
  );
  // 'events' (the ChatPanelView value governing the composer's "Run Event"
  // label/send-disable) now tracks the standalone Events Manager panel, not
  // Timeline -- Timeline is a read-only structural nav rail with no actions
  // of its own, so viewing it behaves like plain chat.
  const chatPanelView: ChatPanelView =
    drawerContent === 'phone' ? 'phone' : drawerContent === 'events' ? 'events' : 'chat';
  const [isNarrowLayout, setIsNarrowLayout] = useState(true);
  // Chat is always mounted; it is only actually hidden/inert when the drawer
  // takes over the screen in narrow layout (mirrors the aria-hidden/inert
  // condition on the chat pane in App.tsx).
  const chatVisible = !(isNarrowLayout && drawerContent !== null);
  // A state-backed callback ref (not a plain useRef) so the ResizeObserver
  // effect below re-runs once the `.studio-play-content` node actually mounts,
  // per React's rule against reading ref.current during render/deps.
  const [playContentElement, setPlayContentElement] = useState<HTMLDivElement | null>(null);
  const setPlayContentRef = useCallback((element: HTMLDivElement | null) => {
    setPlayContentElement(element);
  }, []);
  useEffect(() => {
    if (!playContentElement || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? playContentElement.clientWidth;
      setIsNarrowLayout(width < narrowLayoutContainerWidthThreshold);
    });
    observer.observe(playContentElement);
    return () => observer.disconnect();
  }, [playContentElement]);
  const [contextDrawerWidth, setContextDrawerWidthState] = useState<number | undefined>(() => {
    try {
      const stored = Number(window.localStorage.getItem(contextDrawerWidthStorageKey));
      return Number.isFinite(stored) && stored > 0 ? stored : undefined;
    } catch {
      return undefined;
    }
  });
  const setContextDrawerWidth = useCallback((width: number | undefined) => {
    setContextDrawerWidthState(width);
    try {
      if (width) {
        window.localStorage.setItem(contextDrawerWidthStorageKey, String(width));
      } else {
        window.localStorage.removeItem(contextDrawerWidthStorageKey);
      }
    } catch {
      // Non-critical UI preference.
    }
  }, []);
  const pastTurns = useMemo(() => {
    const latestTurnId = turns.length > 0 ? turns[turns.length - 1].id : undefined;
    return turns
      .filter((turn) => !turn.openingHistory && turn.id !== latestTurnId)
      .slice()
      .reverse();
  }, [turns]);

  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  // Explicit engaged/disengaged flag: never inferred from scroll position.
  // The ref is the source of truth read by imperative scroll code (rAF loops,
  // event listeners); the state mirror exists purely so the "jump to bottom"
  // button can react to changes.
  const chatAutoFollowEngagedRef = useRef(true);
  const [chatAutoFollowEngaged, setChatAutoFollowEngagedState] = useState(true);
  const [chatUnreadMessageCount, setChatUnreadMessageCount] = useState(0);
  const chatPreviousMessageCountRef = useRef(0);
  const chatAutoFollowAnimationFrameRef = useRef(0);
  const chatScrollRequestFrameRef = useRef(0);
  const chatScrollRequestBehaviorRef = useRef<ScrollBehavior | null>(null);
  const chatAutoFollowAnimationTimeRef = useRef<number | null>(null);
  const chatAutoFollowAnimatingRef = useRef(false);
  const chatAutoFollowProgrammaticScrollRef = useRef(false);
  const chatAutoFollowProgrammaticClearFrameRef = useRef(0);

  const setChatAutoFollowEngaged = useCallback((engaged: boolean) => {
    chatAutoFollowEngagedRef.current = engaged;
    setChatAutoFollowEngagedState(engaged);
    if (engaged) {
      setChatUnreadMessageCount(0);
    }
  }, []);
  const phoneImageInputRef = useRef<HTMLInputElement | null>(null);
  const phoneEmojiPickerRef = useRef<HTMLDivElement | null>(null);
  const phoneThreadRef = useRef<HTMLDivElement | null>(null);

  const {
    replyToMessage: phoneReplyToMessage,
    selectReply: selectPhoneReply,
    clearReply: clearPhoneReply,
  } = usePhoneReply(openedPhoneConversationKey);

  function resetPanelSession() {
    resetPanelNavigation();
    // A new session can reuse every character and message ID. Explicitly
    // invalidate component-local profiles, drafts, and navigation in that case.
    setCharacterColorSlots({});
    setPanelSessionRevision((revision) => revision + 1);
    setSelectedCharacterId('');
    setViewedPhoneCharacterId('');
    setSelectedPhoneCharacterId('');
    setSelectedEventId('');
    setAccountLinkOpenRequest(undefined);
    setSocialPostOpenRequest(undefined);
    setSocialDirectMessageOpenRequest(undefined);
    setHighlightedPhoneMessage(undefined);
    setLastSeenMessageRecordId(0);
    setSeenEventIds(new Set());
    setHighlightedEventIds(new Set());
    setPhoneDraft('');
    setPhoneDraftCommands([]);
    setPhoneImages([]);
    setShowPhoneEmojiPicker(false);
    clearPhoneReply();
  }

  const storybookContentNodes = useStorybookContentNodes(nodeViewNodes);
  const storyCharacters: StorybookCharacter[] = useMemo(
    () => storyCharactersFromNodes(storybookContentNodes),
    [storybookContentNodes],
  );
  const playerCharacters = useMemo(
    () => storyCharacters.filter((character) => character.playerSelectable !== false),
    [storyCharacters],
  );
  const socialDirectory = useMemo(
    () => measureUiWork('phone.socialDirectory', () => buildSocialDirectory({
      storyCharacters: appCharacters,
      messages,
      savedDynamicUsers: savedDynamicSocialUsers,
    })),
    [messages, savedDynamicSocialUsers, appCharacters],
  );
  const persistedSocialConnectionsByCharacter = useMemo(() => measureUiWork('phone.accountLinkGrants', () => {
    let connections = savedSocialConnectionsByCharacter;
    for (const { owner, link } of automaticAccountLinkGrants(messages, appCharacters)) {
      if (link.app === 'matchme' || link.app === 'banking') continue;
      const user = socialDirectory.users.find((entry) => entry.characterId === link.character.id);
      const targetId = link.app === 'whatsup' ? link.accountId : user?.id;
      if (targetId) connections = withSocialConnectionAdded(connections, owner.sourceId, link.app, targetId);
    }
    return connections;
  }), [savedSocialConnectionsByCharacter, messages, appCharacters, socialDirectory]);
  const socialConnectionsByCharacter = useMemo(() => measureUiWork('phone.authoredConnections', () => withAuthoredSocialConnections(
    persistedSocialConnectionsByCharacter, appCharacters, socialDirectory.users,
  )), [persistedSocialConnectionsByCharacter, appCharacters, socialDirectory.users]);
  const phoneCharacters = useMemo(
    () => measureUiWork('phone.runtimeCharacters', () => phoneRuntimeCharactersFromMessages(appCharacters, messages,
      new Set(Object.values(socialConnectionsByCharacter).flatMap((apps) => apps.whatsup ?? [])))),
    [messages, appCharacters, socialConnectionsByCharacter],
  );
  const characterActivity = useMemo(() => [
    [...storybooksByNodeId.values()].map((book) => book.openingHistory),
    turns, messages, socialLikesByAccount, persistedSocialConnectionsByCharacter,
    phoneNotesByCharacter, chatGpdChatsByCharacter,
  ], [storybooksByNodeId, turns, messages, socialLikesByAccount, persistedSocialConnectionsByCharacter,
    phoneNotesByCharacter, chatGpdChatsByCharacter]);
  const interactedCharacterIds = useMemo(() => measureUiWork('characters.interactedIds', () =>
    interactedNpcIds(messages, appCharacters)), [appCharacters, messages]);
  const { characterColors, characterColorSlots, setCharacterColorSlots, characterColorStyle } =
    useCharacterColors(appCharacters, playerCharacters, interactedCharacterIds);
  const fotogramContactsByCharacter = useMemo(
    () => Object.fromEntries(storyCharacters.map((viewer) => [
      viewer.id,
      storyCharacters.flatMap((contact) => {
        if (viewer.relationships !== undefined || viewer.id === contact.id) {
          return [];
        }
        if (viewer.storybookNodeId !== contact.storybookNodeId) {
          return [contact.id];
        }
        const storybook = storybooksByNodeId.get(viewer.storybookNodeId);
        return storybook && rpStorybookPhoneContactAllowed(
          storybook,
          viewer.sourceId,
          contact.sourceId,
        )
          ? [contact.id]
          : [];
      }),
    ])),
    [storyCharacters, storybooksByNodeId],
  );
  function addSocialConnection(characterId: string, app: SocialAppKind, socialUserId: string) {
    setSocialConnectionsByCharacter((current) =>
      withSocialDirectoryConnectionAdded(
        current,
        socialDirectory.users,
        characterId,
        app,
        socialUserId,
      )
    );
  }
  if (selectedCharacterId && selectedCharacterId !== narratorCharacterId &&
      !playerCharacters.some((character) => character.id === selectedCharacterId)) {
    setSelectedCharacterId(playerCharacters[0]?.id ?? narratorCharacterId);
  }
  const selectedCharacter =
    selectedCharacterId === narratorCharacterId
      ? undefined
      : playerCharacters.find((character) => character.id === selectedCharacterId) ?? playerCharacters[0];
  const narratorSelected = selectedCharacterId === narratorCharacterId;
  const viewedPhoneCharacter =
    narratorSelected
      ? phoneCharacters.find((character) => character.id === viewedPhoneCharacterId) ?? playerCharacters[0]
      : selectedCharacter;
  const viewedBankingCharacter = viewedPhoneCharacter && storyCharacters.some(
    (character) => character.id === viewedPhoneCharacter.id,
  )
    ? viewedPhoneCharacter
    : undefined;
  const bankingMessages = useMemo(() => bankTransferMessages(messages), [messages]);
  const unreadBankingCount = viewedBankingCharacter
    ? unreadBankTransferCountForCharacter(
        viewedBankingCharacter,
        bankingMessages,
        bankingSeenByCharacter[viewedBankingCharacter.id] ?? 0,
      )
    : 0;

  const phoneAppNotifications = useMemo(() => measureUiWork('phone.notifications', () => {
    const byCharacter = new Map<string, {
      counts: Record<'notes' | 'ai' | 'fotogram' | 'onlyfriends' | 'matchme', number>;
      unreadDirectMessages: Record<SocialMessengerAppKind, SocialDmUnreadByHandle>;
    }>();
    // DMs rendered as embedded app blocks inside a chat bubble were already
    // read there, so they produce no app notification while the option is on.
    const chatEmbeddedSocialIds = new Set(
      chatReadsPhoneAppsEnabled
        ? messages.flatMap((message) =>
            message.embeddedSocialMessages?.map((link) => link.socialMessageId) ?? [])
        : [],
    );
    const datingState = matchMeState(storyCharacters, messages);
    storyCharacters.forEach((character) => {
      const seen = (app: string) => phoneAppSeenByCharacter[`${character.id}:${app}`] ?? 0;
      const count = (app: string, matches: (message: MessageRecord) => boolean) =>
        messages.filter((message) => !message.isOpening && message.id > seen(app) && matches(message)).length;
      const ownedPostIds = new Set(messages.flatMap((message) =>
        message.socialPost?.author === character.name ? [message.socialPost.postId] : []
      ));
      // One badge per unread DM conversation and per post with unread
      // reactions, instead of one badge per message. DM conversations keep
      // their own seen id (marked when the thread is opened, like phone
      // conversations); reactions clear with the app-level seen id.
      const socialApp = (app: SocialMessengerAppKind) => {
        const unreadDms: SocialDmUnreadByHandle = {};
        messages.forEach((message) => {
          const directMessage = message.socialDirectMessage;
          if (
            message.isOpening ||
            directMessage?.app !== app ||
            (app === 'matchme' ? !datingAccountMatches(character, directMessage.toAccountId) : directMessage.to !== character.name) ||
            chatEmbeddedSocialIds.has(message.id)
          ) {
            return;
          }
          const handleKey = app === 'matchme' ? directMessage.fromHandle : directMessage.fromHandle.toLowerCase();
          const dmSeen = phoneAppSeenByCharacter[`${character.id}:${app}:dm:${handleKey}`] ?? 0;
          if (message.id <= dmSeen) {
            return;
          }
          const existing = unreadDms[handleKey] ?? { count: 0, tipTotal: 0 };
          unreadDms[handleKey] = {
            count: existing.count + 1,
            tipTotal: existing.tipTotal + (directMessage.tip ?? 0),
          };
        });
        const reactionPostIds = new Set(messages.flatMap((message) =>
          !message.isOpening &&
          message.id > seen(app) &&
          message.socialReactions?.app === app &&
          ownedPostIds.has(message.socialReactions.postId)
            ? [message.socialReactions.postId]
            : []
        ));
        return {
          count: Object.keys(unreadDms).length + reactionPostIds.size,
          unreadDms,
        };
      };
      const fotogram = socialApp('fotogram');
      const onlyfriends = socialApp('onlyfriends');
      const matchme = socialApp('matchme');
      const newMatches = unreadMatchMeMatches(datingAccountId(character), datingState, messages,
        (partnerId) => phoneAppSeenByCharacter[`${character.id}:matchme:dm:${partnerId}`] ?? 0);
      for (const [partnerId, newMatchId] of Object.entries(newMatches)) {
        if (!matchme.unreadDms[partnerId]) matchme.count += 1;
        matchme.unreadDms[partnerId] = { ...(matchme.unreadDms[partnerId] ?? { count: 0, tipTotal: 0 }), newMatchId };
      }
      byCharacter.set(character.id, {
        counts: {
          notes: count('notes', (message) => message.createdPhoneNote?.characterId === character.id),
          ai: count('ai', (message) => message.simulatedAiChat?.characterId === character.id),
          fotogram: fotogram.count,
          onlyfriends: onlyfriends.count,
          matchme: matchme.count,
        },
        unreadDirectMessages: {
          fotogram: fotogram.unreadDms,
          onlyfriends: onlyfriends.unreadDms,
          matchme: matchme.unreadDms,
        },
      });
    });
    return byCharacter;
  }), [chatReadsPhoneAppsEnabled, messages, phoneAppSeenByCharacter, storyCharacters]);
  const phoneAppNotificationCounts = phoneAppNotifications.get(viewedPhoneCharacter?.id ?? '')?.counts ?? {
    notes: 0,
    ai: 0,
    fotogram: 0,
    onlyfriends: 0,
    matchme: 0,
  };
  const unreadSocialDirectMessages = phoneAppNotifications.get(viewedPhoneCharacter?.id ?? '')
    ?.unreadDirectMessages ?? { fotogram: {}, onlyfriends: {}, matchme: {} };

  const markViewedPhoneAppSeen = useCallback((app: 'notes' | 'ai' | 'fotogram' | 'onlyfriends') => {
    if (!viewedPhoneCharacter) {
      return;
    }
    const latestId = messages.reduce((highest, message) => Math.max(highest, message.id), 0);
    const key = `${viewedPhoneCharacter.id}:${app}`;
    setPhoneAppSeenByCharacter((current) =>
      latestId > (current[key] ?? 0) ? { ...current, [key]: latestId } : current
    );
  }, [messages, viewedPhoneCharacter]);

  const markViewedSocialDmSeen = useCallback((app: SocialMessengerAppKind, partnerHandle: string) => {
    if (!viewedPhoneCharacter) {
      return;
    }
    const latestId = messages.reduce((highest, message) => Math.max(highest, message.id), 0);
    const key = `${viewedPhoneCharacter.id}:${app}:dm:${app === 'matchme' ? partnerHandle : partnerHandle.toLowerCase()}`;
    setPhoneAppSeenByCharacter((current) =>
      latestId > (current[key] ?? 0) ? { ...current, [key]: latestId } : current
    );
  }, [messages, viewedPhoneCharacter]);

  const markViewedBankingSeen = useCallback(() => {
    if (!viewedBankingCharacter) {
      return;
    }
    const latestId = latestBankTransferMessageIdForCharacter(
      viewedBankingCharacter,
      bankingMessages,
    );
    setBankingSeenByCharacter((current) =>
      latestId > (current[viewedBankingCharacter.id] ?? 0)
        ? { ...current, [viewedBankingCharacter.id]: latestId }
        : current
    );
  }, [bankingMessages, viewedBankingCharacter]);

  // Drafted attachments and a pending reply belong to the character who
  // composed them; drop both when the viewed phone owner changes.
  const [phoneDraftOwnerId, setPhoneDraftOwnerId] = useState<string | undefined>(undefined);
  if (phoneDraftOwnerId !== viewedPhoneCharacter?.id) {
    setPhoneDraftOwnerId(viewedPhoneCharacter?.id);
    setPhoneImages([]);
    clearPhoneReply();
  }
  const phoneGalleryImages = useMemo(() => {
    const storybook = viewedPhoneCharacter
      ? storybooksByNodeId.get(viewedPhoneCharacter.storybookNodeId)
      : undefined;
    const imageOwner = storybook?.characters.find(
      (entry) => entry.id === viewedPhoneCharacter?.sourceId,
    );
    return imageOwner?.images.map(chatAttachmentFromStorybookImage) ?? [];
  }, [storybooksByNodeId, viewedPhoneCharacter]);

  function rememberChatCharacter(characterId: string) {
    setRecentChatCharacterIds((current) => [
      characterId,
      ...current.filter((id) => id !== characterId),
    ].slice(0, 2));
  }

  function selectChatCharacter(characterId: string) {
    if (characterId !== narratorCharacterId && !playerCharacters.some((character) => character.id === characterId)) {
      return;
    }
    if (characterId === narratorCharacterId && viewedPhoneCharacter) {
      // Keep showing the current character's phone while the narrator plays.
      setViewedPhoneCharacterId(viewedPhoneCharacter.id);
    }
    setAccountLinkOpenRequest(undefined);
    setSelectedCharacterId(characterId);
    if (characterId !== narratorCharacterId) {
      setViewedPhoneCharacterId(characterId);
      rememberChatCharacter(characterId);
    }
  }

  const phoneConversationInfo = useMemo(() => {
    return measureUiWork('phone.conversations', () => phoneConversationInfoFromMessages(messages, phoneSeenByConversation));
  }, [messages, phoneSeenByConversation]);

  const phoneContactVisibleForViewer = useCallback((
    viewer: PhoneRuntimeCharacter | undefined,
    contact: PhoneRuntimeCharacter,
  ) => {
    if (!viewer || viewer.id === contact.id) {
      return false;
    }
    const sharedPhoneIds = socialConnectionIds(socialConnectionsByCharacter, viewer.id, 'whatsup', appCharacters);
    if (sharedPhoneIds.some((id) => resolveAccountLink('whatsup', id, appCharacters)?.characterId === contact.sourceId)) return true;
    if (phoneConversationInfo.has(phoneConversationKey(viewer.name, contact.name))) {
      return true;
    }
    if (viewer.relationships !== undefined) return hasAuthoredConnection(viewer, contact, 'whatsup');
    if (viewer.storybookNodeId && viewer.storybookNodeId === contact.storybookNodeId) {
      const storybook = storybooksByNodeId.get(viewer.storybookNodeId);
      if (storybook) {
        return rpStorybookPhoneContactAllowed(storybook, viewer.sourceId, contact.sourceId);
      }
    }
    return viewer.relationships === undefined && !viewer.temporaryPhone && !contact.temporaryPhone && !viewer.libraryNpc && !contact.libraryNpc;
  }, [phoneConversationInfo, storybooksByNodeId, socialConnectionsByCharacter, appCharacters]);

  const markPhoneConversationsSeen = useCallback((updates: Array<{ key: string; latestId: number }>) => {
    if (updates.length === 0) {
      return;
    }
    setPhoneSeenByConversation((current) => {
      let changed = false;
      const next = { ...current };
      updates.forEach(({ key, latestId }) => {
        if (latestId > (next[key] ?? 0)) {
          next[key] = latestId;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, []);

  const openPhoneConversation = useCallback((
    conversationKey: string,
    latestId: number,
    select?: { speakerId: string; contactId: string; activatePlayer?: boolean },
  ) => {
    const seenBefore = phoneSeenByConversation[conversationKey] ?? 0;
    if (select) {
      let { speakerId, contactId } = select;
      if (select.activatePlayer ?? true) {
        if (!playerCharacters.some((character) => character.id === speakerId) &&
            playerCharacters.some((character) => character.id === contactId)) {
          [speakerId, contactId] = [contactId, speakerId];
        }
        setSelectedCharacterId(playerCharacters.some((character) => character.id === speakerId)
          ? speakerId : narratorCharacterId);
      }
      setViewedPhoneCharacterId(speakerId);
      setSelectedPhoneCharacterId(contactId);
    }
    setOpenedPhoneConversationKey(conversationKey);
    setPhoneDividerAfterByConversation((current) => ({
      ...current,
      [conversationKey]: seenBefore,
    }));
    markPhoneConversationsSeen([{ key: conversationKey, latestId }]);
  }, [markPhoneConversationsSeen, phoneSeenByConversation, playerCharacters, setOpenedPhoneConversationKey, setSelectedPhoneCharacterId, setViewedPhoneCharacterId, setSelectedCharacterId]);

  const phoneContacts = useMemo(
    () => phoneContactsForViewer(
      viewedPhoneCharacter
        ? phoneCharacters.filter((character) =>
            character.id === viewedPhoneCharacter.id ||
            phoneContactVisibleForViewer(viewedPhoneCharacter, character),
          )
        : phoneCharacters,
      {
        viewedCharacter: viewedPhoneCharacter,
        messages,
        conversations: phoneConversationInfo,
        characterColors,
        fallbackColor: '#e8edf3',
        englishProcessingEnabled,
      },
    ),
    [
      characterColors,
      englishProcessingEnabled,
      messages,
      phoneConversationInfo,
      phoneCharacters,
      phoneContactVisibleForViewer,
      viewedPhoneCharacter,
    ],
  );
  const selectedPhoneContact =
    phoneContacts.find((contact) => contact.character.id === selectedPhoneCharacterId);

  function openPhoneContact(contact: typeof phoneContacts[number]) {
    if (!viewedPhoneCharacter) {
      return;
    }
    openPhoneConversation(contact.conversationKey, contact.latestPhoneId, {
      speakerId: viewedPhoneCharacter.id,
      contactId: contact.character.id,
      activatePlayer: !narratorSelected,
    });
  }

  const recentChatCharacters = recentChatCharacterIds
    .map((id) => playerCharacters.find((character) => character.id === id))
    .filter((character): character is StorybookCharacter => !!character);
  const chatSwitchTarget =
    recentChatCharacters.find((character) => character.id !== selectedCharacter?.id) ??
    recentChatCharacters[0];
  const phoneSwitchTargetPlayable = !!selectedPhoneContact && playerCharacters.some(
    (character) => character.id === selectedPhoneContact.character.id,
  );

  function switchChatPlayer() {
    if (!chatSwitchTarget) {
      return;
    }
    selectChatCharacter(chatSwitchTarget.id);
  }

  function switchPhoneConversationSide() {
    if (!viewedPhoneCharacter || !selectedPhoneContact || !phoneSwitchTargetPlayable) {
      return;
    }
    const latestId =
      phoneConversationInfo.get(selectedPhoneContact.conversationKey)?.latestId ??
      selectedPhoneContact.latestPhoneId;
    openPhoneConversation(selectedPhoneContact.conversationKey, latestId, {
      speakerId: selectedPhoneContact.character.id,
      contactId: viewedPhoneCharacter.id,
      activatePlayer: true,
    });
  }

  function switchActivePlayer() {
    if (chatPanelView === 'phone') {
      switchPhoneConversationSide();
      return;
    }
    if (chatPanelView === 'chat') {
      switchChatPlayer();
    }
  }

  const selectedPhoneConversation = useMemo(() => {
    return selectedPhoneConversationMessages(messages, viewedPhoneCharacter, selectedPhoneContact);
  }, [messages, selectedPhoneContact, viewedPhoneCharacter]);
  const selectedPhoneDividerAfterId = selectedPhoneContact
    ? phoneDividerAfterByConversation[selectedPhoneContact.conversationKey]
    : undefined;
  const selectedPhoneConversationKey = selectedPhoneContact?.conversationKey;
  const selectedPhoneConversationLatestId = selectedPhoneConversationKey
    ? phoneConversationInfo.get(selectedPhoneConversationKey)?.latestId ?? 0
    : 0;
  const markSelectedPhoneConversationSeen = useCallback(() => {
    if (!selectedPhoneConversationKey || selectedPhoneConversationLatestId <= 0) {
      return;
    }
    markPhoneConversationsSeen([{
      key: selectedPhoneConversationKey,
      latestId: selectedPhoneConversationLatestId,
    }]);
  }, [
    markPhoneConversationsSeen,
    selectedPhoneConversationKey,
    selectedPhoneConversationLatestId,
  ]);

  const eventManagerNode = useMemo(
    () => nodeViewNodes.find((node) => node.data.kind === undefined && node.data.nodeType === 'event-manager'),
    [nodeViewNodes],
  );
  const eventManagerAvailable = !!eventManagerNode;
  const eventEntities = useMemo(
    () => eventEntitiesFromNodes(nodeViewNodes),
    [nodeViewNodes],
  );
  const upcomingEvents = useMemo(
    () => upcomingAppointments(appointmentsFromEventEntities(eventEntities)),
    [eventEntities],
  );
  const selectedEvent =
    upcomingEvents.find((event) => event.id === selectedEventId) ?? upcomingEvents[0];

  function closeEvent(eventId: string, status: 'completed' | 'cancelled') {
    // Runs as a deferred callback after an event turn; nodeViewNodes would be
    // a stale render snapshot that wipes out the turn's runtime updates.
    const nextNodes = nodesRef.current.map((node) => {
      if (node.data.nodeType !== 'event-manager' || !node.data.eventAppointments) {
        return node;
      }
      const nextEvents = updateEventEntityStatus(
        appointmentEntitiesFromAppointments(node.data.eventAppointments),
        eventId,
        status,
      );
      return {
        ...node,
        data: {
          ...node.data,
          eventAppointments: normalizeEventAppointments(appointmentsFromEventEntities(nextEvents)),
          eventStatus:
            status === 'cancelled' ? 'Event cancelled' : 'Event completed',
        } as WorkflowNodeData,
      };
    });
    commitNodes(nextNodes);
    setHighlightedEventIds((current) => {
      const next = new Set(current);
      next.delete(eventId);
      return next;
    });
    setSeenEventIds((current) => {
      const next = new Set(current);
      next.delete(eventId);
      return next;
    });
    if (selectedEventId === eventId) {
      setSelectedEventId('');
    }
  }

  function cancelEvent(eventId: string) {
    closeEvent(eventId, 'cancelled');
  }

  const unreadPhoneConversations = useMemo(
    () => unreadPhoneConversationsForCharacters(phoneCharacters, {
      narratorSelected,
      selectedContact: selectedPhoneContact,
      conversations: phoneConversationInfo,
    }),
    [narratorSelected, phoneCharacters, phoneConversationInfo, selectedPhoneContact],
  );
  const unreadPhoneCount = unreadPhoneConversations.reduce(
    (count, conversation) => count + conversation.unreadCount,
    0,
  );
  const unreadBankingByCharacter = useMemo(
    () => storyCharacters.flatMap((character) => {
      const transfers = unreadBankTransfersForCharacter(
        character,
        bankingMessages,
        bankingSeenByCharacter[character.id] ?? 0,
      );
      return transfers.length > 0 ? [{ character, transfers }] : [];
    }),
    [bankingMessages, bankingSeenByCharacter, storyCharacters],
  );
  const unreadBankingTotalCount = unreadBankingByCharacter.reduce(
    (count, entry) => count + entry.transfers.length,
    0,
  );
  const unreadPhoneAppCount = Array.from(phoneAppNotifications.values()).reduce(
    (total, entry) => total + Object.values(entry.counts).reduce((sum, count) => sum + count, 0),
    0,
  );
  const unreadPhoneNotificationCount = unreadPhoneCount + unreadBankingTotalCount + unreadPhoneAppCount;
  const phoneNotificationOwners = useMemo(
    () => storyCharacters.flatMap((character) => {
      const phoneEntry = unreadPhoneConversations.find(
        (conversation) =>
          conversation.unread &&
          normalizePhoneName(conversation.viewerName) === normalizePhoneName(character.name),
      );
      const bankingEntry = unreadBankingByCharacter.find(
        (entry) => entry.character.id === character.id,
      );
      const bankingLatestId = bankingEntry?.transfers.reduce(
        (latestId, transaction) => Math.max(latestId, transaction.message.id),
        0,
      ) ?? 0;
      const appUnreadCount = Object.values(phoneAppNotifications.get(character.id)?.counts ?? {}).reduce(
        (count, appCount) => count + appCount,
        0,
      );
      const unreadCount =
        (phoneEntry?.unreadCount ?? 0) +
        (bankingEntry?.transfers.length ?? 0) +
        appUnreadCount;
      return unreadCount > 0
        ? [{
            character,
            unreadCount,
            latestId: Math.max(phoneEntry?.latestId ?? 0, bankingLatestId),
          }]
        : [];
    }).sort((left, right) =>
      right.unreadCount - left.unreadCount ||
      right.latestId - left.latestId
    ),
    [phoneAppNotifications, storyCharacters, unreadBankingByCharacter, unreadPhoneConversations],
  );
  const viewedPhoneHasNotifications = phoneNotificationOwners.some(
    (entry) => entry.character.id === viewedPhoneCharacter?.id,
  );
  const unreadPhoneSwitchName = (conversation: typeof unreadPhoneConversations[number]) =>
    conversation.viewerName;

  function openUnreadPhoneConversation(conversation: typeof unreadPhoneConversations[number]) {
    const { viewer, contact } = phoneSwitchCharacters(
      phoneCharacters,
      conversation,
      phoneConversationInfo,
    );
    if (!viewer || !contact) {
      return;
    }
    openPhoneConversation(conversation.conversationKey, conversation.latestId, {
      speakerId: viewer.id,
      contactId: contact.id,
      activatePlayer: !narratorSelected,
    });
    selectChatPanelView('phone');
  }

  function openEmbeddedPhoneMessage(message: EmbeddedPhoneMessageLink) {
    const { viewer, contact } = embeddedPhoneMessageCharacters(phoneCharacters, message);
    if (!viewer || !contact) {
      notifySystem('warning', 'Could not find both phone characters.');
      return;
    }
    const conversationKey = phoneConversationKey(message.from, message.to);
    const latestId = phoneConversationInfo.get(conversationKey)?.latestId ?? message.phoneMessageId;
    openPhoneConversation(conversationKey, latestId, {
      speakerId: viewer.id,
      contactId: contact.id,
      activatePlayer: !narratorSelected,
    });
    setHighlightedPhoneMessage({
      id: message.phoneMessageId,
      pulseKey: ++accountLinkRequestId.current,
    });
    selectChatPanelView('phone');
  }

  function openAccountLink(link: AccountLinkTarget) {
    const owner = (chatPanelView === 'phone' ? viewedPhoneCharacter : selectedCharacter) ?? viewedPhoneCharacter;
    if (!owner || isRunning) return;
    const target = resolveAccountLink(link.app, link.app === 'banking' ? link.characterId : link.accountId, appCharacters);
    if (!target || target.characterId !== link.characterId) {
      notifySystem('warning', 'This shared account is unavailable.');
      return;
    }
    if (owner.sourceId === target.characterId) return;
    if (target.app === 'banking') {
      addBankingContact(owner.id, target.name);
    } else {
      if (target.app === 'whatsup') {
        setSocialConnectionsByCharacter((current) => withSocialConnectionAdded(current, owner.sourceId, 'whatsup', target.accountId));
        openPhoneConversation(phoneConversationKey(owner.name, target.character.name), 0,
          { speakerId: owner.id, contactId: target.character.id, activatePlayer: false });
      } else if (target.app !== 'matchme') {
        const user = socialDirectory.users.find((entry) => entry.characterId === target.character.id);
        if (!user) { notifySystem('warning', 'This shared social account is unavailable.'); return; }
        addSocialConnection(owner.id, target.app, user.id);
      }
    }
    setViewedPhoneCharacterId(owner.id);
    setHighlightedPhoneMessage(undefined);
    setSocialPostOpenRequest(undefined);
    setSocialDirectMessageOpenRequest(undefined);
    setAccountLinkOpenRequest({ requestId: -(++accountLinkRequestId.current),
      app: target.app, accountId: target.accountId, name: target.name, username: target.username });
    setDrawerContent('phone');
  }

  function openEmbeddedSocialMessage(message: EmbeddedSocialMessageLink) {
    const directMessage = messages.find((entry) => entry.id === message.socialMessageId)
      ?.socialDirectMessage;
    if (!directMessage) {
      notifySystem('warning', 'Could not find the linked social message.');
      return;
    }
    const characterForIdentity = (name: string, handle: string) =>
      storyCharacters.find((character) => {
        if (directMessage.app === 'matchme') return !!character.social.plotTwist && datingAccountMatches(character, handle);
        const accountHandle = directMessage.app === 'fotogram'
          ? character.social.fotogramUsername
          : character.social.onlyfriendsUsername;
        return !!accountHandle.trim() && (
          socialIdentityMatches(character.name, name) ||
          socialIdentityMatches(accountHandle, handle)
        );
      });
    const senderCharacter = characterForIdentity(directMessage.from, directMessage.fromHandle);
    const recipientCharacter = characterForIdentity(directMessage.to, directMessage.toHandle);
    const owner = [senderCharacter, recipientCharacter].find((character) => character && character.playerSelectable !== false)
      ?? senderCharacter ?? recipientCharacter;
    if (!owner) {
      notifySystem('warning', 'Could not find a Storybook participant for this social conversation.');
      return;
    }
    setAccountLinkOpenRequest(undefined);
    const ownerIsSender = owner.id === senderCharacter?.id;
    setSelectedCharacterId(owner.playerSelectable !== false ? owner.id : narratorCharacterId);
    setViewedPhoneCharacterId(owner.id);
    if (owner.playerSelectable !== false) rememberChatCharacter(owner.id);
    setHighlightedPhoneMessage(undefined);
    setSocialPostOpenRequest(undefined);
    setSocialDirectMessageOpenRequest({
      requestId: ++accountLinkRequestId.current,
      app: directMessage.app,
      messageId: directMessage.messageId,
      participantName: ownerIsSender ? directMessage.to : directMessage.from,
      participantHandle: ownerIsSender ? directMessage.toHandle : directMessage.fromHandle,
    });
    setDrawerContent('phone');
  }

  // Posted photos are stored as Storybook/Gallery image ids; resolve the
  // pixels from the image library wherever a post is rendered.
  const socialImageById = useCallback(
    (imageId: string, ownerId?: string) => {
      const image = appCharacterImage(appCharacters, imageId, ownerId);
      return image ? chatAttachmentFromStorybookImage(image) : undefined;
    },
    [appCharacters],
  );

  function toggleSocialLike(characterId: string, app: SocialAppKind, postId: string) {
    const accountKey = socialLikeAccountKey(characterId, app);
    setSocialLikesByAccount((current) => {
      const liked = current[accountKey] ?? [];
      return {
        ...current,
        [accountKey]: liked.includes(postId)
          ? liked.filter((id) => id !== postId)
          : [...liked, postId],
      };
    });
  }

  function unlockOnlyFriendsPost(characterId: string, postId: string, price: number) {
    setOnlyFriendsPurchasesByCharacter((current) => {
      const purchases = current[characterId] ?? {};
      if (purchases[postId] !== undefined) {
        return current;
      }
      return {
        ...current,
        [characterId]: {
          ...purchases,
          [postId]: Math.round(price * 100) / 100,
        },
      };
    });
  }

  function openSocialPost(post: SocialPostRecord) {
    if (post.app === 'onlyfriends') {
      const author = socialCharacterForPost(post, storyCharacters);
      if (!author) {
        notifySystem('warning', `Could not find the OnlyFriends post author "${post.author}".`);
        return;
      }
      setSelectedCharacterId(author.playerSelectable !== false ? author.id : narratorCharacterId);
      setViewedPhoneCharacterId(author.id);
      if (author.playerSelectable !== false) rememberChatCharacter(author.id);
    }
    setHighlightedPhoneMessage(undefined);
    setSocialDirectMessageOpenRequest(undefined);
    setAccountLinkOpenRequest(undefined);
    setSocialPostOpenRequest({
      requestId: ++accountLinkRequestId.current,
      app: post.app,
      postId: post.postId,
    });
    setDrawerContent('phone');
  }

  function openPhoneGalleryForCharacter(characterId: string) {
    const character = storyCharacters.find((entry) => entry.id === characterId);
    if (!character) {
      notifySystem('warning', 'Could not find the gallery owner.');
      return;
    }
    setSelectedCharacterId(character.id);
    setViewedPhoneCharacterId(character.id);
    rememberChatCharacter(character.id);
    setSelectedPhoneCharacterId('');
    setHighlightedPhoneMessage(undefined);
    setSocialPostOpenRequest(undefined);
    setSocialDirectMessageOpenRequest(undefined);
    setPhoneGalleryOpenRequestId((current) => current + 1);
    setDrawerContent('phone');
  }

  const newEventIds = useMemo(
    () => upcomingEvents.flatMap((event) => (seenEventIds.has(event.id) ? [] : [event.id])),
    [seenEventIds, upcomingEvents],
  );
  const unreadEventCount = newEventIds.length;
  const openingMessageIds = useMemo(() => openingHistoryMessageIds(turns), [turns]);
  const latestMessageRecordId = useMemo(
    () =>
      messages.reduce(
        (latestId, message) =>
          message.role === 'output' &&
          message.channel !== 'phone' &&
          !message.isOpening &&
          !openingMessageIds.has(message.id) &&
          !socialMessageHiddenFromChat(message) &&
          message.includeInHistory !== false
            ? Math.max(latestId, message.id)
            : latestId,
        0,
      ),
    [messages, openingMessageIds],
  );
  const unreadChatCount = useMemo(
    () =>
      chatPanelView === 'chat'
        ? 0
        : messages.filter(
            (message) =>
              message.id > lastSeenMessageRecordId &&
              message.role === 'output' &&
              message.channel !== 'phone' &&
              !message.isOpening &&
              !openingMessageIds.has(message.id) &&
              !socialMessageHiddenFromChat(message) &&
              message.includeInHistory !== false,
          ).length,
    [chatPanelView, lastSeenMessageRecordId, messages, openingMessageIds],
  );

  useEffect(() => {
    if (chatPanelView === 'chat') {
      queueMicrotask(() => setLastSeenMessageRecordId(latestMessageRecordId));
    }
  }, [chatPanelView, latestMessageRecordId]);

  function changePhoneAuthorBadgesEnabled(enabled: boolean) {
    setPhoneAuthorBadgesEnabled(enabled);
    try {
      window.localStorage.setItem(phoneAuthorBadgesStorageKey, String(enabled));
    } catch {
      // Non-critical UI preference.
    }
  }

  function changeChatReadsPhoneAppsEnabled(enabled: boolean) {
    setChatReadsPhoneAppsEnabled(enabled);
    try {
      window.localStorage.setItem(chatReadsPhoneAppsStorageKey, String(enabled));
    } catch {
      // Non-critical UI preference.
    }
  }

  function addBankingContact(characterId: string, contactName: string) {
    const normalizedName = contactName.trim().replace(/\s+/g, ' ');
    if (!normalizedName) {
      return;
    }
    const owner = appCharacters.find((character) => character.id === characterId);
    const target = bankingRecipientByName(normalizedName, appCharacters, owner);
    if (!target) {
      return;
    }
    captureNpcParticipants([{ kind: 'character', id: target.sourceId || target.id }]);
    setBankingContactsByCharacter((current) => {
      const contacts = current[characterId] ?? [];
      if (contacts.some((name) => normalizePhoneName(name) === normalizePhoneName(target.name))) {
        return current;
      }
      return { ...current, [characterId]: [...contacts, target.name] };
    });
  }

  function selectChatPanelView(view: ChatPanelView) {
    setAccountLinkOpenRequest(undefined);
    if (view === 'chat') {
      setLastSeenMessageRecordId(latestMessageRecordId);
    }
    if (view === 'events') {
      setHighlightedEventIds(new Set(newEventIds));
      setSeenEventIds(new Set(upcomingEvents.map((event) => event.id)));
    }
    if (view === 'phone') {
      setSocialPostOpenRequest(undefined);
      setSocialDirectMessageOpenRequest(undefined);
    }
    setDrawerContent(view === 'phone' ? 'phone' : view === 'events' ? 'events' : null);
  }

  function selectPhonePanelView() {
    setHighlightedPhoneMessage(undefined);
    setSocialPostOpenRequest(undefined);
    setSocialDirectMessageOpenRequest(undefined);
    setAccountLinkOpenRequest(undefined);
    if (chatPanelView !== 'phone') {
      setDrawerContent('phone');
    }

    setPhoneHomeRequestId((current) => current + 1);
  }

  function openPhoneDesktop() {
    setHighlightedPhoneMessage(undefined);
    setSocialPostOpenRequest(undefined);
    setDrawerContent('phone');
    setPhoneHomeRequestId((current) => current + 1);
  }

  function openPhoneApp(app: PhoneAppOpenRequest['app']) {
    setHighlightedPhoneMessage(undefined);
    setSocialPostOpenRequest(undefined);
    setDrawerContent('phone');
    setPhoneAppOpenRequest((current) => ({
      app,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }

  function cyclePhoneNotificationOwner() {
    if (chatPanelView !== 'phone') {
      return false;
    }
    let switchedOwner = false;
    const availableOwners = narratorSelected
      ? phoneNotificationOwners
      : phoneNotificationOwners.filter((entry) => entry.character.playerSelectable !== false);
    if (availableOwners.length > 0) {
      const currentOwnerIndex = availableOwners.findIndex(
        (entry) => entry.character.id === viewedPhoneCharacter?.id,
      );
      const nextOwner = currentOwnerIndex >= 0
        ? availableOwners[(currentOwnerIndex + 1) % availableOwners.length]
        : availableOwners[0];
      if (nextOwner) {
        switchedOwner = nextOwner.character.id !== viewedPhoneCharacter?.id;
        if (narratorSelected) {
          setViewedPhoneCharacterId(nextOwner.character.id);
        } else {
          setSelectedCharacterId(nextOwner.character.id);
          rememberChatCharacter(nextOwner.character.id);
        }
        setSelectedPhoneCharacterId('');
      }
    }

    setSocialPostOpenRequest(undefined);
    setSocialDirectMessageOpenRequest(undefined);
    setAccountLinkOpenRequest(undefined);
    setPhoneHomeRequestId((current) => current + 1);
    return switchedOwner;
  }

  const autoTurnTargetName = selectedCharacter?.name;
  const autoTurnDisabled =
    isRunning ||
    characterStorybookNodeCount === 0 ||
    (chatPanelView === 'chat' && !selectedCharacter && !narratorSelected) ||
    (chatPanelView === 'phone' && !narratorSelected && !selectedCharacter) ||
    (chatPanelView === 'phone' && !selectedPhoneContact) ||
    (chatPanelView === 'events' && (!eventManagerAvailable || !selectedEvent));
  const autoTurnTitle =
    chatPanelView === 'phone'
      ? !selectedPhoneContact
        ? 'Open a phone conversation first'
        : narratorSelected
        ? 'Continue the phone story with the most fitting sender and recipient'
        : autoTurnTargetName
        ? `Trigger ${autoTurnTargetName} to write a phone message`
        : 'Select a phone contact first'
      : chatPanelView === 'events'
        ? !eventManagerAvailable
          ? 'Connect Event Manager to the workflow'
          : selectedEvent
          ? `Run ${selectedEvent.title}`
          : 'Select an event first'
      : narratorSelected
        ? 'Continue the story with the most fitting character or characters'
        : autoTurnTargetName
          ? `Trigger ${autoTurnTargetName} to move the story forward`
          : 'Select a character first';
  const switchPlayerDisabled =
    isRunning ||
    (chatPanelView === 'chat' && !chatSwitchTarget) ||
    (chatPanelView === 'phone' && (!viewedPhoneCharacter || !selectedPhoneContact || !phoneSwitchTargetPlayable)) ||
    chatPanelView === 'events';
  const switchPlayerTitle =
    chatPanelView === 'phone'
      ? !selectedPhoneContact
        ? 'Select a phone contact first'
        : !phoneSwitchTargetPlayable
          ? `${selectedPhoneContact.character.name} is not a playable Storybook character`
          : `Switch to ${selectedPhoneContact.character.name}'s phone`
      : chatPanelView === 'chat'
        ? chatSwitchTarget
          ? `Switch to ${chatSwitchTarget.name}`
          : 'Use at least two chat characters first'
        : 'Switch is available in Chat and Phone';

  const scrollPhoneThreadToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (chatPanelView === 'phone' && highlightedPhoneMessage) {
      return;
    }
    requestAnimationFrame(() => {
      const thread = phoneThreadRef.current;
      if (thread) {
        thread.scrollTo({ top: thread.scrollHeight, behavior });
      }
    });
  }, [chatPanelView, highlightedPhoneMessage]);

  useEffect(() => {
    if (chatPanelView === 'phone' && highlightedPhoneMessage) {
      return;
    }
    scrollPhoneThreadToBottom();
  }, [
    chatPanelView,
    highlightedPhoneMessage,
    selectedPhoneContact?.character.id,
    selectedPhoneConversation.length,
    scrollPhoneThreadToBottom,
  ]);

  useEffect(() => {
    if (chatPanelView !== 'phone' || !highlightedPhoneMessage) {
      return;
    }
    let frame = 0;
    let timeout = 0;
    const scrollToHighlightedPhoneMessage = (attempt = 0) => {
      const thread = phoneThreadRef.current;
      const target = thread?.querySelector<HTMLElement>(
        `[data-phone-message-id="${highlightedPhoneMessage.id}"]`,
      );
      if (!thread || !target) {
        if (attempt < 10) {
          timeout = window.setTimeout(() => scrollToHighlightedPhoneMessage(attempt + 1), 40);
        }
        return;
      }
      const threadRect = thread.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop =
        thread.scrollTop +
        targetRect.top -
        threadRect.top -
        Math.max(0, (thread.clientHeight - targetRect.height) / 2);
      thread.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    };
    frame = requestAnimationFrame(() => scrollToHighlightedPhoneMessage());
    const clearHighlight = window.setTimeout(() => {
      setHighlightedPhoneMessage((current) =>
        current?.pulseKey === highlightedPhoneMessage.pulseKey ? undefined : current,
      );
    }, 3000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.clearTimeout(clearHighlight);
    };
  }, [
    chatPanelView,
    highlightedPhoneMessage,
    selectedPhoneContact?.character.id,
    selectedPhoneConversation.length,
  ]);

  const cancelChatAutoFollowAnimation = useCallback(() => {
    chatScrollRequestBehaviorRef.current = null;
    if (chatScrollRequestFrameRef.current) {
      cancelAnimationFrame(chatScrollRequestFrameRef.current);
      chatScrollRequestFrameRef.current = 0;
    }
    if (chatAutoFollowAnimationFrameRef.current) {
      cancelAnimationFrame(chatAutoFollowAnimationFrameRef.current);
      chatAutoFollowAnimationFrameRef.current = 0;
    }
    if (chatAutoFollowProgrammaticClearFrameRef.current) {
      cancelAnimationFrame(chatAutoFollowProgrammaticClearFrameRef.current);
      chatAutoFollowProgrammaticClearFrameRef.current = 0;
    }
    chatAutoFollowProgrammaticScrollRef.current = false;
    chatAutoFollowAnimatingRef.current = false;
    setSmoothChatAutoScrollActive(false);
    chatAutoFollowAnimationTimeRef.current = null;
  }, []);

  const markChatProgrammaticScroll = useCallback(() => {
    chatAutoFollowProgrammaticScrollRef.current = true;
    if (chatAutoFollowProgrammaticClearFrameRef.current) {
      cancelAnimationFrame(chatAutoFollowProgrammaticClearFrameRef.current);
    }
    chatAutoFollowProgrammaticClearFrameRef.current = requestAnimationFrame(() => {
      chatAutoFollowProgrammaticScrollRef.current = false;
      chatAutoFollowProgrammaticClearFrameRef.current = 0;
    });
  }, []);

  const animateChatThreadToBottom = useCallback(() => {
    const thread = chatThreadRef.current;
    if (!thread || !chatAutoFollowEngagedRef.current) {
      cancelChatAutoFollowAnimation();
      return;
    }

    // Keep fractional progress even when the browser rounds scrollTop writes.
    let scrollPosition = thread.scrollTop;
    const baseSpeed = validSmoothChatAutoScrollMinSpeed(smoothChatAutoScrollMinSpeed);
    let pixelsPerSecond = baseSpeed;
    const step = (timestamp: number) => {
      const currentThread = chatThreadRef.current;
      if (!currentThread || !chatAutoFollowEngagedRef.current) {
        cancelChatAutoFollowAnimation();
        return;
      }

      const targetTop = measureUiWork('scroll.readLayout', () => Math.max(0, currentThread.scrollHeight - currentThread.clientHeight));
      const distance = targetTop - currentThread.scrollTop;
      if (distance <= 1) {
        markUiEvent('scroll.bottomReached');
        cancelChatAutoFollowAnimation();
        markChatProgrammaticScroll();
        currentThread.scrollTop = targetTop;
        return;
      }

      const previousTimestamp = chatAutoFollowAnimationTimeRef.current ?? timestamp;
      // Do not catch up after a blocked frame or a background-tab pause.
      const elapsedSeconds = Math.min(1 / 30, Math.max(0, (timestamp - previousTimestamp) / 1000));
      chatAutoFollowAnimationTimeRef.current = timestamp;
      pixelsPerSecond = nextAutoScrollSpeed(
        pixelsPerSecond, baseSpeed, distance, currentThread.clientHeight, elapsedSeconds,
      );
      const delta = pixelsPerSecond * elapsedSeconds;

      markChatProgrammaticScroll();
      scrollPosition = Math.min(targetTop, scrollPosition + delta);
      measureUiWork('scroll.writePosition', () => { currentThread.scrollTop = scrollPosition; });
      chatAutoFollowAnimationFrameRef.current = requestAnimationFrame(step);
    };

    if (!chatAutoFollowAnimationFrameRef.current) {
      markUiEvent('scroll.animationStarted');
      chatAutoFollowAnimatingRef.current = true;
      setSmoothChatAutoScrollActive(true);
      chatAutoFollowAnimationFrameRef.current = requestAnimationFrame(step);
    }
  }, [cancelChatAutoFollowAnimation, markChatProgrammaticScroll, smoothChatAutoScrollMinSpeed]);

  const scrollChatThreadToBottom = useCallback((behavior: ScrollBehavior = 'auto', onlyIfFollowing = false) => {
    // Multiple image loads and streamed updates can arrive before the next frame.
    // Keep one pending request, but never replace initial positioning with a
    // smooth follow request: that would animate the entire restored history.
    chatScrollRequestBehaviorRef.current =
      chatScrollRequestBehaviorRef.current === 'auto' ? 'auto' : behavior;
    if (chatScrollRequestFrameRef.current) {
      cancelAnimationFrame(chatScrollRequestFrameRef.current);
    }
    chatScrollRequestFrameRef.current = requestAnimationFrame(() => {
      chatScrollRequestFrameRef.current = 0;
      const requestedBehavior = chatScrollRequestBehaviorRef.current;
      chatScrollRequestBehaviorRef.current = null;
      const thread = chatThreadRef.current;
      if (!thread || (onlyIfFollowing && !chatAutoFollowEngagedRef.current)) {
        return;
      }
      if (requestedBehavior === 'smooth') {
        if (!smoothChatAutoScrollEnabled) {
          cancelChatAutoFollowAnimation();
          markChatProgrammaticScroll();
          thread.scrollTo({ top: thread.scrollHeight, behavior: 'auto' });
          return;
        }
        animateChatThreadToBottom();
        return;
      }
      cancelChatAutoFollowAnimation();
      markChatProgrammaticScroll();
      thread.scrollTo({ top: thread.scrollHeight, behavior: 'auto' });
    });
  }, [
    animateChatThreadToBottom,
    cancelChatAutoFollowAnimation,
    markChatProgrammaticScroll,
    smoothChatAutoScrollEnabled,
  ]);

  const scrollChatThreadToBottomIfFollowing = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (chatAutoFollowEngagedRef.current) {
      scrollChatThreadToBottom(behavior, true);
    }
  }, [scrollChatThreadToBottom]);

  // Explicit user action re-engages auto-follow and jumps to the bottom. Used
  // by the "jump to bottom" button; reuses the same smooth/instant machinery
  // as every other auto-follow scroll.
  const engageChatAutoFollowAndScrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    setChatAutoFollowEngaged(true);
    scrollChatThreadToBottom(behavior);
  }, [scrollChatThreadToBottom, setChatAutoFollowEngaged]);

  // Keys that drive scrolling at all, split into the "toward the top" subset
  // that counts as a disengage signal (below) vs. the "toward the bottom"
  // subset that does not (ArrowDown/PageDown/End/plain Space keep following).
  const chatScrollUpKeys = useMemo(() => new Set(['ArrowUp', 'PageUp', 'Home']), []);
  const chatScrollKeys = useMemo(
    () => new Set([...chatScrollUpKeys, 'ArrowDown', 'PageDown', 'End', ' ']),
    [chatScrollUpKeys],
  );

  useEffect(() => {
    if (!chatVisible) {
      return undefined;
    }
    const thread = chatThreadRef.current;
    if (!thread) {
      return undefined;
    }
    // Any user-initiated scroll interaction disengages auto-follow. This is
    // driven entirely by the interaction event itself (its target, its
    // direction) — never by where the thread's scrollTop ends up, and never
    // by waiting on the native 'scroll' event to confirm anything.
    const disengage = () => {
      cancelChatAutoFollowAnimation();
      setChatAutoFollowEngaged(false);
    };
    // A nested scrollable (e.g. a wide code block or an embedded gallery)
    // between the event target and the thread can absorb the interaction
    // itself, in which case it isn't aimed at the chat thread at all.
    // Duck-typed element checks (rather than `instanceof HTMLElement`/`Node`)
    // so this keeps working under any host that exposes DOM-shaped nodes.
    const asElement = (node: unknown): HTMLElement | null =>
      node != null && typeof (node as HTMLElement).nodeType === 'number'
          && (node as HTMLElement).nodeType === 1
        ? (node as HTMLElement)
        : null;
    const isInsideNestedScrollable = (target: EventTarget | null, axis: 'x' | 'y') => {
      let node = asElement(target);
      while (node && (node as unknown) !== thread) {
        if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
          const style = window.getComputedStyle(node);
          const overflow = axis === 'x' ? style.overflowX : style.overflowY;
          const scrollable = overflow === 'auto' || overflow === 'scroll';
          const canScroll = axis === 'x'
            ? node.scrollWidth > node.clientWidth
            : node.scrollHeight > node.clientHeight;
          if (scrollable && canScroll) {
            return true;
          }
        }
        node = asElement(node.parentNode);
      }
      return false;
    };
    const isScrollbarPointerEvent = (event: PointerEvent) => {
      if (event.target !== thread || typeof thread.getBoundingClientRect !== 'function') {
        return false;
      }
      const rect = thread.getBoundingClientRect();
      return event.clientX >= rect.left + thread.clientWidth
        || event.clientY >= rect.top + thread.clientHeight;
    };
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        // Pure horizontal wheel can't move the (vertically scrolling) thread.
        return;
      }
      if (isInsideNestedScrollable(event.target, 'y')) {
        return;
      }
      if (event.deltaY < 0) {
        disengage();
      }
      // Scrolling down (deltaY > 0) never re-engages by itself; only the
      // button, sending a message, or starting a new turn does that.
    };
    let lastTouchY: number | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (isInsideNestedScrollable(event.target, 'y') || isInsideNestedScrollable(event.target, 'x')) {
        return;
      }
      const previousY = lastTouchY;
      const currentY = event.touches[0]?.clientY;
      lastTouchY = currentY ?? null;
      // Finger moving down the screen pans content up, away from the bottom;
      // an unreadable/unknown direction disengages too (the gesture wins).
      if (currentY === undefined || previousY === null || currentY > previousY) {
        disengage();
      }
    };
    // A pointerdown by itself is not a scroll (it may just be a tap on an
    // in-page button or expandable block) — it only aborts any in-flight
    // follow animation so it never fights the tap. Pressing down on the
    // native scrollbar gutter specifically, though, is a scroll gesture.
    const handlePointerDown = (event: PointerEvent) => {
      cancelChatAutoFollowAnimation();
      if (isScrollbarPointerEvent(event)) {
        setChatAutoFollowEngaged(false);
      }
    };
    const isEditableTarget = (target: EventTarget | null) => {
      const element = asElement(target);
      if (!element) {
        return false;
      }
      const tag = element.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
    };
    const isActivatableTarget = (target: EventTarget | null) => {
      const element = asElement(target);
      if (!element) {
        return false;
      }
      const tag = element.tagName.toLowerCase();
      return tag === 'button' || tag === 'summary'
        || (tag === 'a' && element.hasAttribute('href')) || element.getAttribute('role') === 'button';
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!chatScrollKeys.has(event.key) || isEditableTarget(event.target)) {
        return;
      }
      if (isInsideNestedScrollable(event.target, 'y')) {
        return;
      }
      if (event.key === ' ') {
        // Space activates a focused button/link rather than scrolling.
        if (isActivatableTarget(event.target)) {
          return;
        }
        if (event.shiftKey) {
          disengage();
        }
        return;
      }
      if (chatScrollUpKeys.has(event.key)) {
        disengage();
      }
    };
    thread.addEventListener('wheel', handleWheel, { passive: true });
    thread.addEventListener('touchstart', handleTouchStart, { passive: true });
    thread.addEventListener('touchmove', handleTouchMove, { passive: true });
    thread.addEventListener('pointerdown', handlePointerDown, { passive: true });
    thread.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelChatAutoFollowAnimation();
      thread.removeEventListener('wheel', handleWheel);
      thread.removeEventListener('touchstart', handleTouchStart);
      thread.removeEventListener('touchmove', handleTouchMove);
      thread.removeEventListener('pointerdown', handlePointerDown);
      thread.removeEventListener('keydown', handleKeyDown);
    };
  }, [cancelChatAutoFollowAnimation, chatPanelView, chatScrollKeys, chatScrollUpKeys, panelSessionRevision, setChatAutoFollowEngaged]);

  useEffect(() => {
    if (chatPanelView === 'chat') {
      // Synchronizing with the view/session change, not deriving render state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatAutoFollowEngaged(true);
      scrollChatThreadToBottom();
    }
  }, [chatPanelView, panelSessionRevision, scrollChatThreadToBottom, setChatAutoFollowEngaged]);

  // Starting a new turn (the player sent a message, or generation begins) is
  // an explicit continue-the-conversation action distinct from mere content
  // growth mid-stream: it re-engages immediately, even if the user had
  // scrolled away to read history.
  const chatWasRunningRef = useRef(isRunning);
  useEffect(() => {
    const wasRunning = chatWasRunningRef.current;
    chatWasRunningRef.current = isRunning;
    if (chatPanelView === 'chat' && isRunning && !wasRunning) {
      setChatAutoFollowEngaged(true);
      scrollChatThreadToBottom();
    }
  }, [chatPanelView, isRunning, scrollChatThreadToBottom, setChatAutoFollowEngaged]);

  useEffect(() => {
    const previousMessageCount = chatPreviousMessageCountRef.current;
    chatPreviousMessageCountRef.current = messages.length;
    if (chatPanelView !== 'chat') {
      return;
    }
    const newMessageCount = messages.length - previousMessageCount;
    if (newMessageCount <= 0) {
      return;
    }
    // New content while engaged keeps following, exactly as before. New
    // content while disengaged (the user deliberately scrolled away) must not
    // force a resume or a scroll: surface it as an unread count on the "jump
    // to bottom" button instead.
    if (chatAutoFollowEngagedRef.current) {
      scrollChatThreadToBottomIfFollowing();
    } else {
      setChatUnreadMessageCount((count) => count + newMessageCount);
    }
  }, [chatPanelView, messages, scrollChatThreadToBottomIfFollowing]);

  const roleplayShortcuts = useMemo<RoleplayActivityShortcut[]>(() => {
    let latestChatMessage: MessageRecord | undefined;
    let latestPhoneMessage: MessageRecord | undefined;
    let latestPost: SocialPostRecord | undefined;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        !latestChatMessage &&
        message.role === 'output' &&
        message.channel !== 'phone' &&
        !message.isOpening &&
        !openingMessageIds.has(message.id) &&
        !socialMessageHiddenFromChat(message) &&
        message.includeInHistory !== false
      ) {
        latestChatMessage = message;
      }
      if (
        !latestPhoneMessage &&
        (message.channel === 'phone' || message.phoneMessage) &&
        !!message.phoneFrom?.trim() &&
        !!message.phoneTo?.trim()
      ) {
        latestPhoneMessage = message;
      }
      if (!latestPost && message.socialPost) {
        latestPost = message.socialPost;
      }
      if (latestChatMessage && latestPhoneMessage && latestPost) {
        break;
      }
    }
    let latestPicture: { character: StorybookCharacter } | undefined;
    storyCharacters.forEach((character) => {
      const storybook = storybooksByNodeId.get(character.storybookNodeId);
      const owner = storybook?.characters.find((entry) => entry.id === character.sourceId);
      if (owner?.images.length) {
        latestPicture = { character };
      }
    });

    const shortcuts: RoleplayActivityShortcut[] = [];
    if (latestChatMessage) {
      // onOpen only runs from a click handler, never during render.
      // eslint-disable-next-line react-hooks/refs
      shortcuts.push({
            id: 'last-chat' as const,
            label: 'Last Chat',
            badge: unreadChatCount || undefined,
            title: 'Jump to the latest chat output',
            onOpen: () => {
              setDrawerContent(null);
              setLastSeenMessageRecordId(latestMessageRecordId);
              scrollChatThreadToBottom('smooth');
            },
      });
    }
    if (latestPhoneMessage && latestPhoneMessage.phoneFrom && latestPhoneMessage.phoneTo) {
      // onOpen only runs from a click handler, never during render.
      // eslint-disable-next-line react-hooks/refs
      shortcuts.push({
            id: 'last-message' as const,
            label: 'Last Message',
            badge: unreadPhoneCount || undefined,
            title: `Open the latest phone message from ${latestPhoneMessage.phoneFrom}`,
            onOpen: () => openEmbeddedPhoneMessage({
              phoneMessageId: latestPhoneMessage.id,
              from: latestPhoneMessage.phoneFrom ?? '',
              to: latestPhoneMessage.phoneTo ?? '',
              message: latestPhoneMessage.originalText ?? '',
              translatedMessage: latestPhoneMessage.translatedText,
              previewImageAttachments: latestPhoneMessage.imageAttachments,
            }),
      });
    }
    if (latestPost) {
      // onOpen only runs from a click handler, never during render.
      // eslint-disable-next-line react-hooks/refs
      shortcuts.push({
            id: 'last-post' as const,
            label: 'Last Post',
            badge: unreadPhoneAppCount || undefined,
            title: `Open the latest ${latestPost.app} post`,
            onOpen: () => openSocialPost(latestPost),
      });
    }
    if (latestPicture) {
      const picture = latestPicture;
      shortcuts.push({
            id: 'last-picture' as const,
            label: 'Last Picture',
            title: `Open ${picture.character.name}'s latest gallery picture`,
            onOpen: () => openPhoneGalleryForCharacter(picture.character.id),
      });
    }
    return shortcuts;
  }, [
    latestMessageRecordId,
    messages,
    openingMessageIds,
    scrollChatThreadToBottom,
    storyCharacters,
    storybooksByNodeId,
    unreadChatCount,
    unreadPhoneAppCount,
    unreadPhoneCount,
  ]);

  function selectPhoneReplyFromComposer(message: MessageRecord) {
    selectPhoneReply(message);
  }

  function selectPhoneGalleryImageFromComposer(image: ChatImageAttachment) {
    setPhoneImages([image]);
  }

  function selectPhoneEmoji(emoji: string) {
    setPhoneDraft((current) => `${current}${emoji}`);
    setShowPhoneEmojiPicker(false);
    setRecentlyUsedEmojis((current) => {
      const filtered = current.filter((e) => e !== emoji);
      return [emoji, ...filtered].slice(0, 8);
    });
  }

  return {
    panelSessionRevision,
    resetPanelSession,
    chatPanelView,
    selectChatPanelView,
    selectPhonePanelView,
    drawerContent,
    setDrawerContent,
    isNarrowLayout,
    setPlayContentRef,
    contextDrawerWidth,
    setContextDrawerWidth,
    pastTurns,
    openPhoneDesktop,
    openPhoneApp,
    cyclePhoneNotificationOwner,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    narratorSelected,
    storyCharacters,
    playerCharacters,
    phoneCharacters,
    characterColors,
    characterColorSlots,
    setCharacterColorSlots,
    characterColorStyle,
    characterActivity,
    interactedCharacterIds,
    viewedPhoneCharacter,
    phoneGalleryImages,
    phoneGalleryOpenRequestId,
    roleplayShortcuts,
    selectChatCharacter,
    rememberChatCharacter,
    phoneConversationInfo,
    openPhoneConversation,
    phoneContacts,
    selectedPhoneContact,
    openPhoneContact,
    phoneSwitchTargetPlayable,
    switchActivePlayer,
    selectedPhoneConversation,
    selectedPhoneDividerAfterId,
    eventManagerAvailable,
    upcomingEvents,
    selectedEvent,
    selectedEventId,
    setSelectedEventId,
    closeEvent,
    cancelEvent,
    unreadPhoneConversations,
    unreadPhoneNotificationCount,
    viewedPhoneHasNotifications,
    unreadPhoneSwitchName,
    openUnreadPhoneConversation,
    openEmbeddedPhoneMessage,
    openEmbeddedSocialMessage,
    openSocialPost,
    socialPostOpenRequest,
    socialDirectMessageOpenRequest,
    socialImageById,
    socialLikesByAccount,
    setSocialLikesByAccount,
    socialDirectoryUsers: socialDirectory.users,
    fotogramContactsByCharacter,
    dynamicSocialUsers: socialDirectory.dynamicUsers,
    setDynamicSocialUsers,
    socialConnectionsByCharacter,
    persistedSocialConnectionsByCharacter,
    // Automatic grants are rebuilt from timeline messages. Saving the merged
    // view would turn them into permanent manual contacts after reload.
    savedSocialConnectionsByCharacter,
    setSocialConnectionsByCharacter,
    addSocialConnection,
    phoneNotesByCharacter,
    setPhoneNotesByCharacter,
    phoneNotesByCharacterRef,
    chatGpdChatsByCharacter,
    setChatGpdChatsByCharacter,
    chatGpdChatsByCharacterRef,
    toggleSocialLike,
    onlyFriendsPurchasesByCharacter,
    setOnlyFriendsPurchasesByCharacter,
    unlockOnlyFriendsPost,
    unreadEventCount,
    unreadChatCount,
    unreadBankingCount,
    markViewedBankingSeen,
    phoneAppNotificationCounts,
    markViewedPhoneAppSeen,
    markViewedSocialDmSeen,
    unreadSocialDirectMessages,
    phoneAppSeenByCharacter,
    setPhoneAppSeenByCharacter,
    phoneAuthorBadgesEnabled,
    changePhoneAuthorBadgesEnabled,
    chatReadsPhoneAppsEnabled,
    changeChatReadsPhoneAppsEnabled,
    autoTurnDisabled,
    autoTurnTitle,
    switchPlayerDisabled,
    switchPlayerTitle,
    highlightedPhoneMessage,
    highlightedEventIds,
    phoneSeenByConversation,
    setPhoneSeenByConversation,
    bankingSeenByCharacter,
    setBankingSeenByCharacter,
    bankingContactsByCharacter,
    setBankingContactsByCharacter,
    addBankingContact,
    markSelectedPhoneConversationSeen,
    accountLinkContext: { characters: appCharacters, owner: (chatPanelView === 'phone' ? viewedPhoneCharacter : selectedCharacter) ?? viewedPhoneCharacter,
      disabled: isRunning, open: openAccountLink, request: accountLinkOpenRequest },
    phoneHomeRequestId,
    phoneAppOpenRequest,
    phoneDividerAfterByConversation,
    setPhoneDividerAfterByConversation,
    openedPhoneConversationKey,
    setOpenedPhoneConversationKey,
    phoneReplyToMessage,
    selectPhoneReply,
    clearPhoneReply,
    phoneDraft,
    setPhoneDraft,
    phoneDraftContextComment,
    setPhoneDraftContextComment,
    phoneMoodStatus,
    setPhoneMoodStatus,
    phoneDraftCommands,
    setPhoneDraftCommands,
    phoneImages,
    setPhoneImages,
    showPhoneEmojiPicker,
    setShowPhoneEmojiPicker,
    recentlyUsedEmojis,
    setRecentlyUsedEmojis,
    setRecentChatCharacterIds,
    chatThreadRef,
    phoneImageInputRef,
    phoneEmojiPickerRef,
    phoneThreadRef,
    scrollPhoneThreadToBottom,
    scrollChatThreadToBottomIfFollowing,
    chatAutoFollowEngaged,
    chatUnreadMessageCount,
    engageChatAutoFollowAndScrollToBottom,
    smoothChatAutoScrollActive,
    selectPhoneReplyFromComposer,
    selectPhoneGalleryImageFromComposer,
    selectPhoneEmoji,
    parseStorybookJson: parseRpStorybookJson,
    narratorSpeakerName,
  };
}
