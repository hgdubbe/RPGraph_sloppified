import { AccountLinkContext } from '../chat/accountLinkContext';
import { AccountLinkText } from './AccountLinkText';
import type { CharacterAppAccount } from '../characters/character';
import { PhoneDatingScreen } from './phone-dating/PhoneDatingScreen';
import { phoneCharacterAvatarDataUrl } from '../chat/phoneCharacters';
import type { DatingProfile } from '../chat/datingProfile';
import {
  Fragment,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  defaultPhoneChatTextSize,
  phoneDesktopGridColumns,
  phoneDesktopGridRows,
} from '../settings';
import type { StorybookCharacter } from '../storybook/runtime';
import { phoneMoodStatuses, type PhoneMoodStatusId } from '../phone/moodStatus';
import type { PhoneDesktopIconSize, PhoneDesktopLayout, PhoneDesktopWidgetId } from '../types';
import type {
  ChatImageAttachment,
  ConnectionPreset,
  ImageCaptionChange,
  MessageRecord,
  SocialPostRecord,
  SocialMessengerAppKind,
  SocialDirectMessageOpenRequest,
  SocialDmUnreadByHandle,
  SocialDirectMessageRecord,
  SocialReactionComment,
  SocialThreadActionRecord,
  ProviderConnectionHealth,
  RpDateTimeFormat,
  RpWeekdayLanguage,
} from '../types';
import {
  matchingPhoneName,
  phoneConversationMessageViews,
} from '../data-management/selectors';
import { formatRpDateTimeParts, formatRpDayLabel } from '../workflow';
import { dialogueSpeechText } from '../chat/dialogueVoiceSegments';
import { phoneReplyVisibleText } from '../chat/phoneReplies';
import { PhoneImagePicker } from './PhoneImagePicker';
import { PhoneGalleryScreen } from './PhoneGalleryScreen';
import { PhoneBankingScreen } from './PhoneBankingScreen';
import { PhoneNotesScreen } from './PhoneNotesScreen';
import { PhoneChatGpdScreen } from './PhoneChatGpdScreen';
import type { ChatGpdPhoneApp } from '../chat/useChatGpdPhoneApp';
import type { ChatGpdChatRecord, PhoneNoteRecord } from '../chat/phoneAppsSessions';
import { PhoneSocialFeedScreen } from './phone-social/PhoneSocialFeedScreen';
import { socialApps } from './phone-social/socialApps';
import type { OnlyFriendsPurchasesByCharacter } from '../chat/onlyFriendsWallet';
import type {
  SocialConnectionsByCharacter,
  SocialDirectoryUser,
} from '../chat/socialDirectory';
import { PhoneVoiceMessage } from './PhoneVoiceMessage';
import { CharacterAvatar } from './CharacterAvatar';
import { ImageContextControl } from './ImageContextControl';
import {
  CommandPillComposer,
  CommandPillList,
  type CommandPillComposerHandle,
} from './CommandPillComposer';
import type { CommandInputCommand } from '../chat/structuredCommands';
import type {
  ImageGenerationAssistantMessage,
  ImageGenerationAssistantResult,
  ImageGenerationSettings,
  ImageAssistantModelState,
} from '../chat/imageGenerationAssistant';
import { imageGenerationCharacterContext } from '../chat/imageGenerationAssistant';
import iphoneAuroraWallpaperUrl from '../assets/wallpapers/iphone-aurora.png';
import iphoneHorizonWallpaperUrl from '../assets/wallpapers/iphone-horizon.png';
import iphoneLiquidWallpaperUrl from '../assets/wallpapers/iphone-liquid.png';
import iphoneSatinWallpaperUrl from '../assets/wallpapers/iphone-satin.png';

type PhoneContact = {
  character: StorybookCharacter;
  color: string;
  conversationKey: string;
  latestPhoneId: number;
  preview: string;
  time: string;
  unreadCount: number;
};

type UnreadPhoneConversation = {
  key: string;
  conversationKey: string;
  viewerName: string;
  contactName: string;
  latestId: number;
  unreadCount: number;
  unread: boolean;
};

type PhoneScreen =
  | 'desktop' | 'whatsup' | 'gallery' | 'chat-gallery' | 'camera' | 'banking'
  | 'fotogram' | 'onlyfriends' | 'notes' | 'ai' | 'plottwist';

type PhoneDesktopAppId = 'whatsup' | 'gallery' | 'camera' | 'banking' | 'fotogram' | 'onlyfriends' | 'notes' | 'ai' | 'plottwist';
type PhoneDesktopWidgetLayout = NonNullable<NonNullable<PhoneDesktopLayout['widgets']>[PhoneDesktopWidgetId]>;
export type PhoneAppOpenRequest = {
  requestId: number;
  app: Exclude<PhoneScreen, 'desktop' | 'chat-gallery'>;
};

const phoneDesktopAppIds: readonly PhoneDesktopAppId[] =
  ['whatsup', 'gallery', 'camera', 'banking', 'fotogram', 'onlyfriends', 'notes', 'ai', 'plottwist'];

const phoneDesktopWidgetLandscapeFallbacks: Record<PhoneDesktopWidgetId, PhoneDesktopWidgetLayout> = {
  gallery: { column: 5, row: 1, width: 4, height: 2, enabled: true },
  chat: { column: 5, row: 1, width: 4, height: 2, enabled: true },
  notes: { column: 5, row: 3, width: 4, height: 2, enabled: true },
  social: { column: 9, row: 1, width: 2, height: 2, enabled: true },
  banking: { column: 9, row: 3, width: 2, height: 2, enabled: true },
  narrative: { column: 1, row: 3, width: 4, height: 2, enabled: true },
};

const phoneDesktopWidgetPortraitFallbacks: Record<PhoneDesktopWidgetId, PhoneDesktopWidgetLayout> = {
  gallery: { column: 1, row: 7, width: 4, height: 2, enabled: true },
  chat: { column: 1, row: 7, width: 4, height: 2, enabled: true },
  notes: { column: 1, row: 9, width: 4, height: 2, enabled: true },
  social: { column: 1, row: 9, width: 4, height: 2, enabled: true },
  banking: { column: 1, row: 11, width: 4, height: 2, enabled: true },
  narrative: { column: 1, row: 11, width: 4, height: 2, enabled: true },
};

const defaultPhoneWallpapers: ChatImageAttachment[] = [
  {
    id: 'iphone-aurora',
    name: 'Aurora',
    mimeType: 'image/png',
    size: 0,
    dataUrl: iphoneAuroraWallpaperUrl,
  },
  {
    id: 'iphone-satin',
    name: 'Satin',
    mimeType: 'image/png',
    size: 0,
    dataUrl: iphoneSatinWallpaperUrl,
  },
  {
    id: 'iphone-horizon',
    name: 'Horizon',
    mimeType: 'image/png',
    size: 0,
    dataUrl: iphoneHorizonWallpaperUrl,
  },
  {
    id: 'iphone-liquid',
    name: 'Liquid',
    mimeType: 'image/png',
    size: 0,
    dataUrl: iphoneLiquidWallpaperUrl,
  },
];

const phoneDesktopIconSizePx: Record<PhoneDesktopIconSize, number> = {
  medium: 52,
  large: 68,
};

function phoneReplySizeClass(text: string) {
  if (text.length > 120) {
    return ' long';
  }
  return text.length > 60 ? ' medium' : '';
}

function desktopBadgeLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

function compactPhoneText(text: string, fallback: string, maxLength = 92) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return fallback;
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}...` : compact;
}

type PhonePanelProps = {
  phoneContacts: PhoneContact[];
  appCharacters: StorybookCharacter[];
  storyCharacters: StorybookCharacter[];
  characterColors: Map<string, string>;
  selectedPhoneContact?: PhoneContact;
  selectedCharacter?: StorybookCharacter;
  selectedCharacterPlayable?: boolean;
  selectedPhoneConversation: MessageRecord[];
  selectedPhoneDividerAfterId?: number;
  highlightedPhoneMessageId?: number;
  highlightedPhoneMessagePulseKey: number;
  unreadPhoneConversations: UnreadPhoneConversation[];
  unreadBankingCount: number;
  phoneAppNotificationCounts: Record<'notes' | 'ai' | 'fotogram' | 'onlyfriends' | 'matchme', number>;
  phoneHomeRequestId: number;
  phoneAppOpenRequest?: PhoneAppOpenRequest;
  socialPostOpenRequest?: {
    requestId: number;
    app: 'fotogram' | 'onlyfriends';
    postId: string;
  };
  socialDirectMessageOpenRequest?: SocialDirectMessageOpenRequest;
  phoneGalleryOpenRequestId: number;
  phoneImages: ChatImageAttachment[];
  phoneGalleryImages: ChatImageAttachment[];
  rpDraft: string;
  onRpDraftChange: (value: string) => void;
  canSendRpNarrative: boolean;
  onSubmitRpNarrative: (event: FormEvent<HTMLFormElement>) => void;
  phoneDraft: string;
  phoneDraftCommands: CommandInputCommand[];
  replyToMessage?: MessageRecord;
  showPhoneEmojiPicker: boolean;
  phoneEmojiOptions: string[];
  recentlyUsedEmojis?: string[];
  isRunning: boolean;
  canSend: boolean;
  inputLocked?: boolean;
  voiceMessageSpeakerNames: ReadonlySet<string>;
  onGenerateVoiceMessageClip: (request: { messageId: number; speakerName: string; text: string }) => Promise<string | null>;
  englishProcessingEnabled: boolean;
  rpTimeTrackingEnabled: boolean;
  phoneAuthorBadgesEnabled: boolean;
  phoneChatTextSize: number;
  rpDateTimeFormat: RpDateTimeFormat;
  rpWeekdayLanguage: RpWeekdayLanguage;
  contextualReferenceImageIds: ReadonlySet<string>;
  selectedReferenceImageIds: ReadonlySet<string>;
  imageUploadEnabled?: boolean;
  imageUploadDisabledReason?: string;
  referenceImageContextEnabled?: boolean;
  referenceImageContextDisabledReason?: string;
  phoneThreadRef: RefObject<HTMLDivElement | null>;
  phoneEmojiPickerRef: RefObject<HTMLDivElement | null>;
  phoneImageInputRef: RefObject<HTMLInputElement | null>;
  onOpenPhoneContact: (contact: PhoneContact) => void;
  onMarkSelectedPhoneConversationSeen: () => void;
  onMarkBankingSeen: () => void;
  onMarkPhoneAppSeen: (app: 'notes' | 'ai' | 'fotogram' | 'onlyfriends') => void;
  onMarkSocialDirectMessagesSeen: (app: SocialMessengerAppKind, partnerHandle: string) => void;
  unreadSocialDirectMessages: Record<SocialMessengerAppKind, SocialDmUnreadByHandle>;
  onOpenUnreadPhoneConversation: (conversation: UnreadPhoneConversation) => void;
  unreadPhoneSwitchName: (conversation: UnreadPhoneConversation) => string;
  onSwitchToViewedCharacter: () => void;
  onPreviewImage: (image: ChatImageAttachment) => void;
  onToggleReferenceImage: (image: ChatImageAttachment) => void;
  onPreviewImageCaptionChange: (change: ImageCaptionChange) => void;
  onScrollPhoneThreadToBottom: (behavior?: ScrollBehavior) => void;
  onRemovePhoneImage: (imageId: string) => void;
  onPhoneDraftChange: (value: string) => void;
  phoneDraftContextComment: string;
  onPhoneDraftContextCommentChange: (value: string) => void;
  phoneMoodStatus: PhoneMoodStatusId;
  onPhoneMoodStatusChange: (value: PhoneMoodStatusId) => void;
  onPhoneDraftCommandsChange: (commands: CommandInputCommand[]) => void;
  onReplyToMessage: (message: MessageRecord) => void;
  onCancelPhoneReply: () => void;
  onSubmitPhoneMessage: (event: FormEvent<HTMLFormElement>) => void;
  onTogglePhoneEmojiPicker: () => void;
  onSelectPhoneEmoji: (emoji: string) => void;
  onSelectPhoneImages: () => void;
  onSelectPhoneGalleryImage: (image: ChatImageAttachment) => void;
  onAddPhoneImages: (files: FileList | null) => void;
  connections?: ConnectionPreset[];
  providerHealthById?: Record<string, ProviderConnectionHealth>;
  estimatedTokenBytesPerToken: number;
  imageAssistantChatHistoryContext: string;
  onSubmitImageAssistantMessage: (request: {
    connectionId: string;
    imageProviderId: string;
    currentPrompt: string;
    currentSettings: ImageGenerationSettings;
    currentImage?: { dataUrl: string; description: string };
    availableCharacterLoras: string[];
    characterContext: string;
    chatHistoryContext: string;
    messages: ImageGenerationAssistantMessage[];
    userMessage: string;
    describeImage?: boolean;
  }) => Promise<ImageGenerationAssistantResult>;
  onGenerateImageAssistantImages: (request: {
    providerId: string;
    prompt: string;
    settings: ImageGenerationSettings;
  }) => Promise<string[]>;
  onSaveImageAssistantImage: (request: {
    characterId: string;
    dataUrl: string;
    description: string;
  }) => Promise<void>;
  onPhoneWallpaperChange: (character: StorybookCharacter, wallpaperId: string) => void;
  bankTransferMessages: MessageRecord[];
  bankingContactNames: string[];
  onAddBankingContact: (characterId: string, contactName: string) => void;
  onSendBankTransfer: (request: {
    from: StorybookCharacter;
    to: string;
    amount: number;
    note: string;
  }) => void;
  onTransferOnlyFriendsWallet: (request: {
    owner: StorybookCharacter;
    direction: 'top-up' | 'withdraw';
    amount: number;
  }) => void;
  socialMediaMessages: MessageRecord[];
  onSubmitSocialPost: (request: {
    author: StorybookCharacter;
    post: SocialPostRecord;
    image?: ChatImageAttachment;
  }) => Promise<boolean>;
  onSubmitSocialThreadAction: (request: {
    actor: StorybookCharacter;
    action: SocialThreadActionRecord;
    existingComments: SocialReactionComment[];
    likeCount: number;
  }) => Promise<boolean>;
  onSubmitSocialDirectMessage: (message: SocialDirectMessageRecord, characterId: string) => Promise<boolean>;
  onSaveDatingProfile: (owner: StorybookCharacter, profile: DatingProfile) => boolean;
  onCreateSocialAccount: (
    character: StorybookCharacter,
    app: 'fotogram' | 'onlyfriends',
    username: string,
    profile?: CharacterAppAccount,
  ) => boolean;
  onImportSocialPostImage: (request: {
    owner: StorybookCharacter;
    image: ChatImageAttachment;
  }) => Promise<ChatImageAttachment | undefined>;
  socialImageById: (imageId: string, ownerId?: string) => ChatImageAttachment | undefined;
  socialLikesByAccount: Record<string, string[]>;
  socialDirectoryUsers: SocialDirectoryUser[];
  fotogramContactsByCharacter: Record<string, string[]>;
  socialConnectionsByCharacter: SocialConnectionsByCharacter;
  onAddSocialConnection: (
    characterId: string,
    app: 'fotogram' | 'onlyfriends',
    socialUserId: string,
  ) => void;
  onToggleSocialLike: (
    characterId: string,
    app: 'fotogram' | 'onlyfriends',
    postId: string,
  ) => void;
  onlyFriendsPurchasesByCharacter: OnlyFriendsPurchasesByCharacter;
  onUnlockOnlyFriendsPost: (characterId: string, postId: string, price: number) => void;
  chatGpd: ChatGpdPhoneApp;
  chatGpdSidebarOpen: boolean;
  onChatGpdSidebarOpenChange: (open: boolean) => void;
  chatGpdSidebarWidth: number;
  onChatGpdSidebarWidthChange: (width: number) => void;
  archivedChatGpdChatIds: ReadonlySet<string>;
  phoneNotes: PhoneNoteRecord[];
  onPhoneNoteDelete: (noteId: string) => boolean;
  onPhoneNoteColorChange: (noteId: string, color: PhoneNoteRecord['color']) => void;
  onPhoneNoteCommit: (note: PhoneNoteRecord) => boolean;
  onChatGpdChatCommit: (chat: ChatGpdChatRecord) => void;
  phoneDesktopLayout: PhoneDesktopLayout;
  onPhoneDesktopLayoutChange: (layout: PhoneDesktopLayout) => void;
  phoneDesktopIconSize: PhoneDesktopIconSize;
  onPhoneDesktopIconSizeChange: (size: PhoneDesktopIconSize) => void;
  phoneClockRpDateTime?: string;
  imageAssistantModelStateById: Record<string, ImageAssistantModelState>;
  onSetImageAssistantLlmModelLoaded: (providerId: string, loaded: boolean) => Promise<void>;
  onUnloadImageAssistantComfyModel: (providerId: string) => Promise<void>;
  onRefreshImageAssistantModelState: (providerId: string) => void;
};

export function PhonePanel({
  phoneContacts,
  appCharacters,
  storyCharacters,
  characterColors,
  selectedPhoneContact,
  selectedCharacter,
  selectedCharacterPlayable = true,
  selectedPhoneConversation,
  selectedPhoneDividerAfterId,
  highlightedPhoneMessageId,
  highlightedPhoneMessagePulseKey,
  unreadPhoneConversations,
  unreadBankingCount,
  phoneAppNotificationCounts,
  phoneHomeRequestId,
  phoneAppOpenRequest,
  socialPostOpenRequest,
  socialDirectMessageOpenRequest,
  phoneGalleryOpenRequestId,
  phoneImages,
  phoneGalleryImages,
  rpDraft,
  onRpDraftChange,
  canSendRpNarrative,
  onSubmitRpNarrative,
  phoneDraft,
  phoneDraftCommands,
  replyToMessage,
  showPhoneEmojiPicker,
  phoneEmojiOptions,
  recentlyUsedEmojis = [],
  isRunning,
  canSend,
  inputLocked = false,
  voiceMessageSpeakerNames,
  onGenerateVoiceMessageClip,
  englishProcessingEnabled,
  rpTimeTrackingEnabled,
  phoneAuthorBadgesEnabled,
  phoneChatTextSize,
  rpDateTimeFormat,
  rpWeekdayLanguage,
  contextualReferenceImageIds,
  selectedReferenceImageIds,
  imageUploadEnabled = true,
  imageUploadDisabledReason,
  referenceImageContextEnabled = true,
  referenceImageContextDisabledReason,
  phoneThreadRef,
  phoneEmojiPickerRef,
  phoneImageInputRef,
  onOpenPhoneContact,
  onMarkSelectedPhoneConversationSeen,
  onMarkBankingSeen,
  onMarkPhoneAppSeen,
  onMarkSocialDirectMessagesSeen,
  unreadSocialDirectMessages,
  onOpenUnreadPhoneConversation,
  unreadPhoneSwitchName,
  onSwitchToViewedCharacter,
  onPreviewImage,
  onToggleReferenceImage,
  onPreviewImageCaptionChange,
  onScrollPhoneThreadToBottom,
  onRemovePhoneImage,
  onPhoneDraftChange,
  phoneDraftContextComment,
  onPhoneDraftContextCommentChange,
  phoneMoodStatus,
  onPhoneMoodStatusChange,
  onPhoneDraftCommandsChange,
  onReplyToMessage,
  onCancelPhoneReply,
  onSubmitPhoneMessage,
  onTogglePhoneEmojiPicker,
  onSelectPhoneEmoji,
  onSelectPhoneImages,
  onSelectPhoneGalleryImage,
  onAddPhoneImages,
  connections = [],
  providerHealthById = {},
  estimatedTokenBytesPerToken,
  imageAssistantChatHistoryContext,
  onSubmitImageAssistantMessage,
  onGenerateImageAssistantImages,
  onSaveImageAssistantImage,
  onPhoneWallpaperChange,
  bankTransferMessages,
  bankingContactNames,
  onAddBankingContact,
  onSendBankTransfer,
  onTransferOnlyFriendsWallet,
  socialMediaMessages,
  onSubmitSocialPost,
  onSubmitSocialThreadAction,
  onSubmitSocialDirectMessage,
  onCreateSocialAccount,
  onSaveDatingProfile,
  onImportSocialPostImage,
  socialImageById,
  socialLikesByAccount,
  socialDirectoryUsers,
  fotogramContactsByCharacter,
  socialConnectionsByCharacter,
  onAddSocialConnection,
  onToggleSocialLike,
  onlyFriendsPurchasesByCharacter,
  onUnlockOnlyFriendsPost,
  chatGpd,
  chatGpdSidebarOpen,
  onChatGpdSidebarOpenChange,
  chatGpdSidebarWidth,
  onChatGpdSidebarWidthChange,
  archivedChatGpdChatIds,
  phoneNotes,
  onPhoneNoteDelete,
  onPhoneNoteColorChange,
  onPhoneNoteCommit,
  onChatGpdChatCommit,
  phoneDesktopLayout,
  onPhoneDesktopLayoutChange,
  phoneDesktopIconSize,
  onPhoneDesktopIconSizeChange,
  phoneClockRpDateTime,
  imageAssistantModelStateById,
  onSetImageAssistantLlmModelLoaded,
  onUnloadImageAssistantComfyModel,
  onRefreshImageAssistantModelState,
}: PhonePanelProps) {
  const { request: accountLinkRequest } = useContext(AccountLinkContext);
  const accountLinkScreen = accountLinkRequest?.app === 'matchme' ? 'plottwist' : accountLinkRequest?.app;
  const linkedSocialRequest = accountLinkRequest && accountLinkRequest.app !== 'whatsup' ? {
    requestId: accountLinkRequest.requestId, app: accountLinkRequest.app, messageId: '',
    participantName: accountLinkRequest.name,
    participantHandle: accountLinkRequest.app === 'matchme' ? accountLinkRequest.accountId : accountLinkRequest.username,
  } : undefined;
  const directMessageRequest = linkedSocialRequest ?? socialDirectMessageOpenRequest;
  const commandComposerRef = useRef<CommandPillComposerHandle | null>(null);
  const [contactListOpen, setContactListOpen] = useState(!selectedPhoneContact);
  // Start on the conversation when the panel opens through a chat message
  // link, or on a requested social post; otherwise start on the desktop.
  const [screen, setScreen] = useState<PhoneScreen>(() =>
    accountLinkScreen ??
    (directMessageRequest?.app === 'matchme' ? 'plottwist' : directMessageRequest?.app) ??
    socialPostOpenRequest?.app ??
    (highlightedPhoneMessageId !== undefined ? 'whatsup' : 'desktop'));
  const [seenAccountLinkRequest, setSeenAccountLinkRequest] = useState(accountLinkRequest);
  if (seenAccountLinkRequest !== accountLinkRequest) {
    setSeenAccountLinkRequest(accountLinkRequest);
    if (accountLinkScreen) setScreen(accountLinkScreen);
  }
  const [seenPhoneHomeRequestId, setSeenPhoneHomeRequestId] = useState(phoneHomeRequestId);
  if (seenPhoneHomeRequestId !== phoneHomeRequestId) {
    setSeenPhoneHomeRequestId(phoneHomeRequestId);
    if (screen !== 'desktop') {
      setScreen('desktop');
    }
  }
  const [seenPhoneAppOpenRequestId, setSeenPhoneAppOpenRequestId] = useState(
    phoneAppOpenRequest?.requestId ?? 0,
  );
  if (
    phoneAppOpenRequest &&
    seenPhoneAppOpenRequestId !== phoneAppOpenRequest.requestId
  ) {
    setSeenPhoneAppOpenRequestId(phoneAppOpenRequest.requestId);
    if (screen !== phoneAppOpenRequest.app) {
      setScreen(phoneAppOpenRequest.app);
    }
  }
  const [seenSocialPostOpenRequestId, setSeenSocialPostOpenRequestId] = useState(
    socialPostOpenRequest?.requestId ?? 0,
  );
  // Leaving the social screen consumes the request; otherwise reopening the
  // app from the desktop would jump back to the previously requested post.
  const [dismissedSocialPostOpenRequestId, setDismissedSocialPostOpenRequestId] =
    useState<number>();
  const [dismissedSocialDirectMessageOpenRequestId, setDismissedSocialDirectMessageOpenRequestId] =
    useState<number>();
  if (
    socialPostOpenRequest &&
    seenSocialPostOpenRequestId !== socialPostOpenRequest.requestId
  ) {
    setSeenSocialPostOpenRequestId(socialPostOpenRequest.requestId);
    if (screen !== socialPostOpenRequest.app) {
      setScreen(socialPostOpenRequest.app);
    }
  }
  const [seenSocialDirectMessageOpenRequestId, setSeenSocialDirectMessageOpenRequestId] = useState(
    directMessageRequest?.requestId ?? 0,
  );
  if (
    directMessageRequest &&
    seenSocialDirectMessageOpenRequestId !== directMessageRequest.requestId
  ) {
    setSeenSocialDirectMessageOpenRequestId(directMessageRequest.requestId);
    if (screen !== directMessageRequest.app) {
      setScreen(directMessageRequest.app === 'matchme' ? 'plottwist' : directMessageRequest.app);
    }
  }
  const [seenPhoneGalleryOpenRequestId, setSeenPhoneGalleryOpenRequestId] = useState(phoneGalleryOpenRequestId);
  if (seenPhoneGalleryOpenRequestId !== phoneGalleryOpenRequestId) {
    setSeenPhoneGalleryOpenRequestId(phoneGalleryOpenRequestId);
    if (screen !== 'gallery') {
      setScreen('gallery');
    }
  }
  const unreadWhatsUpCount = phoneContacts.reduce(
    (count, contact) => count + contact.unreadCount,
    0,
  );

  useEffect(() => {
    if (screen === 'whatsup' && selectedPhoneContact) {
      onMarkSelectedPhoneConversationSeen();
    }
  }, [
    onMarkSelectedPhoneConversationSeen,
    screen,
    selectedPhoneContact,
  ]);

  useEffect(() => {
    if (screen === 'banking' && unreadBankingCount > 0) {
      onMarkBankingSeen();
    }
  }, [onMarkBankingSeen, screen, unreadBankingCount]);

  useEffect(() => {
    if (screen === 'notes' || screen === 'ai' || screen === 'fotogram' || screen === 'onlyfriends') {
      onMarkPhoneAppSeen(screen);
    }
  }, [onMarkPhoneAppSeen, screen]);

  // Jump straight to the conversation when a chat message links into the
  // phone (each click bumps the highlight pulse key).
  const [seenHighlightPulseKey, setSeenHighlightPulseKey] = useState(highlightedPhoneMessagePulseKey);
  if (seenHighlightPulseKey !== highlightedPhoneMessagePulseKey) {
    setSeenHighlightPulseKey(highlightedPhoneMessagePulseKey);
    if (highlightedPhoneMessageId !== undefined && screen !== 'whatsup') {
      setContactListOpen(false);
      setScreen('whatsup');
    }
  }
  const [desktopLayoutOverride, setDesktopLayoutOverride] = useState<PhoneDesktopLayout | undefined>(undefined);
  const desktopLayout = desktopLayoutOverride ?? phoneDesktopLayout;
  const desktopLayoutRef = useRef(phoneDesktopLayout);
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const desktopInteractionRef = useRef<{
    kind: 'clock' | 'app' | 'resize' | 'widget' | 'resize-widget';
    appId?: PhoneDesktopAppId;
    widgetId?: PhoneDesktopWidgetId;
    startedAt: { x: number; y: number };
    moved: boolean;
  } | undefined>(undefined);
  const suppressAppClickRef = useRef(false);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [launchingApp, setLaunchingApp] = useState<PhoneDesktopAppId>();
  useEffect(() => () => clearTimeout(launchTimer.current), [phoneHomeRequestId, selectedCharacter?.id]);

  function launchDesktopApp(app: PhoneDesktopAppId) {
    clearTimeout(launchTimer.current);
    setLaunchingApp(app);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    launchTimer.current = setTimeout(() => {
      setLaunchingApp(undefined);
      setScreen(app);
    }, reduceMotion ? 0 : 140);
  }
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [phoneMoodStatusOpen, setPhoneMoodStatusOpen] = useState(false);
  const [narrativeWidgetExpanded, setNarrativeWidgetExpanded] = useState(false);
  const desktopSettingsRef = useRef<HTMLDivElement | null>(null);
  const desktopIconPx = Math.min(58, phoneDesktopIconSizePx[phoneDesktopIconSize]);
  const phoneDesktopOrientation = desktopLayout.orientation ?? 'portrait';
  const effectiveDesktopIconPx = phoneDesktopOrientation === 'landscape'
    ? Math.min(44, desktopIconPx)
    : desktopIconPx;

  useEffect(() => {
    if (!desktopSettingsOpen && !phoneMoodStatusOpen) {
      return;
    }
    const closeMenu = (event: PointerEvent) => {
      if (event.target instanceof Node && !desktopSettingsRef.current?.contains(event.target)) {
        setDesktopSettingsOpen(false);
        setPhoneMoodStatusOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [desktopSettingsOpen, phoneMoodStatusOpen]);

  const selectedPhoneMoodStatus = phoneMoodStatuses.find((option) => option.id === phoneMoodStatus)
    ?? phoneMoodStatuses[0];

  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    if (screen !== 'desktop') {
      return;
    }
    const updateClock = () => setClockNow(new Date());
    const kickoff = window.setTimeout(updateClock, 0);
    const timer = window.setInterval(updateClock, 30_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [screen]);

  const pad2 = (value: number) => String(value).padStart(2, '0');
  const localClockDateTime = `${clockNow.getFullYear()}-${pad2(clockNow.getMonth() + 1)}-` +
    `${pad2(clockNow.getDate())}T${pad2(clockNow.getHours())}:${pad2(clockNow.getMinutes())}`;
  const clockDateTime = rpTimeTrackingEnabled && phoneClockRpDateTime
    ? phoneClockRpDateTime
    : localClockDateTime;
  const clockParts = formatRpDateTimeParts(clockDateTime, rpDateTimeFormat, rpWeekdayLanguage);
  const clockDayLabel = formatRpDayLabel(clockDateTime, rpDateTimeFormat, rpWeekdayLanguage);

  const isImageInContext = (image: ChatImageAttachment) =>
    !!image.id.trim() && contextualReferenceImageIds.has(image.id.trim());
  const isImageManuallySelected = (image: ChatImageAttachment) =>
    !!image.id.trim() && selectedReferenceImageIds.has(image.id.trim());
  const phoneOwnerName = selectedCharacter?.name.trim().split(/\s+/)[0];
  const phoneListTitle = phoneOwnerName ? `${phoneOwnerName}'s Chats` : 'Phone Chats';
  const wallpaperImageId = selectedCharacter?.phoneSettings.wallpaperId ?? 'wallpaper-1';
  const wallpaperImage = [...defaultPhoneWallpapers, ...phoneGalleryImages]
    .find((image) => image.id === wallpaperImageId) ?? defaultPhoneWallpapers[0];
  const desktopStyle = wallpaperImage?.dataUrl
    ? { backgroundImage: `url("${wallpaperImage.dataUrl}")` }
    : undefined;
  const desktopWidgetBounds = phoneDesktopOrientation === 'landscape'
    ? { columns: 10, rows: 4 }
    : { columns: phoneDesktopGridColumns, rows: 10 };

  function desktopWidgetFallback(widgetId: PhoneDesktopWidgetId, orientation = phoneDesktopOrientation) {
    return orientation === 'landscape'
      ? phoneDesktopWidgetLandscapeFallbacks[widgetId]
      : phoneDesktopWidgetPortraitFallbacks[widgetId];
  }

  function fitDesktopWidgetLayout(
    layout: PhoneDesktopWidgetLayout,
    bounds = desktopWidgetBounds,
  ): PhoneDesktopWidgetLayout {
    const width = Math.max(2, Math.min(layout.width, bounds.columns));
    const height = Math.max(1, Math.min(layout.height, bounds.rows));
    return {
      ...layout,
      width,
      height,
      column: Math.max(1, Math.min(layout.column, bounds.columns - width + 1)),
      row: Math.max(1, Math.min(layout.row, bounds.rows - height + 1)),
    };
  }

  function desktopWidgetLayout(widgetId: PhoneDesktopWidgetId) {
    const stored = desktopLayout.widgets?.[widgetId];
    const fallback = desktopWidgetFallback(widgetId);
    const layout = stored ?? fallback;
    const offscreen =
      layout.column > desktopWidgetBounds.columns ||
      layout.row > desktopWidgetBounds.rows ||
      layout.column + layout.width - 1 > desktopWidgetBounds.columns ||
      layout.row + layout.height - 1 > desktopWidgetBounds.rows;
    return fitDesktopWidgetLayout(offscreen ? { ...fallback, enabled: layout.enabled } : layout);
  }
  const selectedReplyText = replyToMessage
    ? phoneReplyVisibleText(replyToMessage, englishProcessingEnabled) || 'Image'
    : '';
  const phoneMessageViews = useMemo(() => phoneConversationMessageViews(
    selectedPhoneConversation,
    {
      viewerName: selectedCharacter?.name,
      selectedPhoneDividerAfterId,
      englishProcessingEnabled,
      rpTimeTrackingEnabled,
    },
  ), [
    englishProcessingEnabled,
    rpTimeTrackingEnabled,
    selectedCharacter?.name,
    selectedPhoneConversation,
    selectedPhoneDividerAfterId,
  ]);
  const galleryOwnerId = selectedCharacter?.id ?? '';
  const [, setKnownGalleryImageIdsByOwner] = useState<Record<string, string[]>>({});
  const [newGalleryImageIdsByOwner, setNewGalleryImageIdsByOwner] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!galleryOwnerId) {
      return;
    }
    const imageIds = phoneGalleryImages.map((image) => image.id);
    // Diffing against external prop data (phoneGalleryImages) to detect newly arrived images.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKnownGalleryImageIdsByOwner((current) => {
      const knownIds = current[galleryOwnerId];
      if (!knownIds) {
        return { ...current, [galleryOwnerId]: imageIds };
      }
      const knownSet = new Set(knownIds);
      const addedIds = imageIds.filter((imageId) => !knownSet.has(imageId));
      if (addedIds.length > 0) {
        setNewGalleryImageIdsByOwner((newCurrent) => ({
          ...newCurrent,
          [galleryOwnerId]: [
            ...(newCurrent[galleryOwnerId] ?? []).filter((imageId) => imageIds.includes(imageId)),
            ...addedIds,
          ],
        }));
      }
      const changed =
        knownIds.length !== imageIds.length ||
        knownIds.some((imageId, index) => imageId !== imageIds[index]);
      return changed ? { ...current, [galleryOwnerId]: imageIds } : current;
    });
  }, [galleryOwnerId, phoneGalleryImages]);
  const newGalleryImageIds = useMemo(
    () => new Set(newGalleryImageIdsByOwner[galleryOwnerId] ?? []),
    [galleryOwnerId, newGalleryImageIdsByOwner],
  );

  function markGalleryImageSeen(imageId: string) {
    if (!galleryOwnerId) {
      return;
    }
    setNewGalleryImageIdsByOwner((current) => ({
      ...current,
      [galleryOwnerId]: (current[galleryOwnerId] ?? []).filter((entry) => entry !== imageId),
    }));
  }

  const latestPhoneContact = useMemo(
    () => [...phoneContacts].sort((left, right) => right.latestPhoneId - left.latestPhoneId)[0],
    [phoneContacts],
  );
  const latestNote = phoneNotes[0];
  const latestBankTransfer = [...bankTransferMessages].reverse().find((message) => message.bankTransfer)?.bankTransfer;
  const latestSocialPost = [...socialMediaMessages].reverse().find((message) =>
    message.socialPost &&
    (!selectedCharacter || message.socialPost.author === selectedCharacter.name)
  )?.socialPost;
  const desktopWidgets: Array<{
    id: PhoneDesktopWidgetId;
    label: string;
    value: string;
    detail?: string;
    available: boolean;
    onOpen: () => void;
  }> = [
    {
      id: 'narrative',
      label: 'Narrative',
      value: rpDraft.trim() ? 'Drafting' : 'Write next beat',
      detail: rpDraft,
      available: true,
      onOpen: () => setNarrativeWidgetExpanded(true),
    },
    {
      id: 'gallery',
      label: 'Memories',
      value: '',
      available: phoneGalleryImages.length > 0,
      onOpen: () => launchDesktopApp('gallery'),
    },
    {
      id: 'chat',
      label: 'Latest chat',
      value: latestPhoneContact?.character.name ?? 'No chats',
      detail: latestPhoneContact?.preview,
      available: !!latestPhoneContact,
      onOpen: () => launchDesktopApp('whatsup'),
    },
    {
      id: 'notes',
      label: 'Notes',
      value: latestNote?.title || 'No notes',
      detail: latestNote?.text,
      available: !!latestNote,
      onOpen: () => launchDesktopApp('notes'),
    },
    {
      id: 'social',
      label: latestSocialPost?.app === 'onlyfriends' ? 'OnlyFriends' : 'Fotogram',
      value: latestSocialPost?.authorHandle ?? 'No posts',
      detail: latestSocialPost?.caption,
      available: !!latestSocialPost,
      onOpen: () => launchDesktopApp(latestSocialPost?.app === 'onlyfriends' ? 'onlyfriends' : 'fotogram'),
    },
    {
      id: 'banking',
      label: 'Wallet',
      value: latestBankTransfer ? `${latestBankTransfer.amount}` : 'No transfers',
      detail: latestBankTransfer?.note || latestBankTransfer?.to || latestBankTransfer?.from,
      available: !!latestBankTransfer || unreadBankingCount > 0,
      onOpen: () => launchDesktopApp('banking'),
    },
  ];
  // desktopWidgets' onOpen closures only run from click handlers, never during render;
  // the filter/map calls below only read `available`/`id`, not the closures.
  // eslint-disable-next-line react-hooks/refs
  const visibleDesktopWidgets = desktopWidgets.filter((widget) =>
    widget.available && (desktopLayout.widgets?.[widget.id]?.enabled ?? true));

  function toggleDesktopWidget(widgetId: PhoneDesktopWidgetId) {
    const current = desktopLayoutRef.current;
    const fallback = current.widgets?.[widgetId] ?? desktopWidgetFallback(widgetId, current.orientation ?? 'portrait');
    const next = {
      ...current,
      widgets: {
        ...current.widgets,
        [widgetId]: { ...fallback, enabled: !fallback.enabled },
      },
    };
    desktopLayoutRef.current = next;
    setDesktopLayoutOverride(next);
    onPhoneDesktopLayoutChange(next);
  }

  function desktopGridPoint(clientX: number, clientY: number) {
    const bounds = desktopRef.current?.getBoundingClientRect();
    if (!bounds || !desktopRef.current) {
      return { column: 1, row: 1, fitColumns: 1, fitRows: 1 };
    }
    const style = getComputedStyle(desktopRef.current);
    const gapX = parseFloat(style.columnGap) || 0;
    const gapY = parseFloat(style.rowGap) || 0;
    const cellWidth = parseFloat(style.gridTemplateColumns);
    const cellHeight = parseFloat(style.gridAutoRows);
    const pitchX = cellWidth + gapX;
    const pitchY = cellHeight + gapY;
    const scale = bounds.width / (desktopRef.current?.offsetWidth || bounds.width);
    const localWidth = bounds.width / scale;
    const localHeight = bounds.height / scale;
    const paddingX = parseFloat(style.paddingLeft);
    const paddingY = parseFloat(style.paddingTop);
    const fitColumns = Math.min(
      desktopWidgetBounds.columns,
      Math.max(1, Math.floor((localWidth - paddingX - parseFloat(style.paddingRight) + gapX) / pitchX)),
    );
    const fitRows = Math.min(
      phoneDesktopGridRows,
      Math.max(1, Math.floor((localHeight - paddingY - parseFloat(style.paddingBottom) + gapY) / pitchY)),
    );
    return {
      column: Math.min(fitColumns, Math.max(1, Math.floor(((clientX - bounds.left) / scale - paddingX - (localWidth - paddingX * 2 - fitColumns * pitchX + gapX) / 2) / pitchX) + 1)),
      row: Math.min(fitRows, Math.max(1, Math.floor(((clientY - bounds.top) / scale - paddingY) / pitchY) + 1)),
      fitColumns,
      fitRows,
    };
  }

  function beginDesktopInteraction(
    event: ReactPointerEvent<HTMLElement>,
    interaction: {
      kind: 'clock' | 'app' | 'resize' | 'widget' | 'resize-widget';
      appId?: PhoneDesktopAppId;
      widgetId?: PhoneDesktopWidgetId;
    },
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const display = desktopRef.current?.parentElement;
    if (display) {
      const bounds = display.getBoundingClientRect();
      display.style.setProperty('--phone-launch-origin', `${(event.clientX - bounds.left) / bounds.width * 100}% ${(event.clientY - bounds.top) / bounds.height * 100}%`);
    }
    desktopLayoutRef.current = desktopLayout;
    desktopInteractionRef.current = {
      ...interaction,
      startedAt: { x: event.clientX, y: event.clientY },
      moved: false,
    };
  }

  function moveDesktopInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    const interaction = desktopInteractionRef.current;
    if (!interaction) {
      return;
    }
    if (Math.hypot(event.clientX - interaction.startedAt.x, event.clientY - interaction.startedAt.y) > 5) {
      interaction.moved = true;
    }
    const point = desktopGridPoint(event.clientX, event.clientY);
    setDesktopLayoutOverride((previous) => {
      const current = previous ?? phoneDesktopLayout;
      if (interaction.kind === 'app' && interaction.appId) {
        const cellOccupied = phoneDesktopAppIds.some((app) =>
          app !== interaction.appId &&
          current.apps[app].column === point.column &&
          current.apps[app].row === point.row,
        );
        if (cellOccupied) {
          desktopLayoutRef.current = current;
          return current;
        }
        const next = {
          ...current,
          apps: {
            ...current.apps,
            [interaction.appId]: { column: point.column, row: point.row },
          },
        };
        desktopLayoutRef.current = next;
        return next;
      }
      if (interaction.kind === 'clock') {
        const next = {
          ...current,
          clock: {
            ...current.clock,
            column: Math.max(1, Math.min(point.fitColumns - current.clock.width + 1, point.column)),
            row: Math.max(1, Math.min(point.fitRows - current.clock.height + 1, point.row)),
          },
        };
        desktopLayoutRef.current = next;
        return next;
      }
      if (interaction.kind === 'widget' && interaction.widgetId) {
        const orientation = current.orientation ?? phoneDesktopOrientation;
        const bounds = { columns: point.fitColumns, rows: point.fitRows };
        const storedWidget = current.widgets?.[interaction.widgetId] ?? desktopWidgetFallback(interaction.widgetId, orientation);
        const widget = fitDesktopWidgetLayout(storedWidget, bounds);
        const next = {
          ...current,
          widgets: {
            ...current.widgets,
            [interaction.widgetId]: {
              ...widget,
              column: Math.max(1, Math.min(point.fitColumns - widget.width + 1, point.column)),
              row: Math.max(1, Math.min(point.fitRows - widget.height + 1, point.row)),
            },
          },
        };
        desktopLayoutRef.current = next;
        return next;
      }
      if (interaction.kind === 'resize-widget' && interaction.widgetId) {
        const orientation = current.orientation ?? phoneDesktopOrientation;
        const bounds = { columns: point.fitColumns, rows: point.fitRows };
        const storedWidget = current.widgets?.[interaction.widgetId] ?? desktopWidgetFallback(interaction.widgetId, orientation);
        const widget = fitDesktopWidgetLayout(storedWidget, bounds);
        const next = {
          ...current,
          widgets: {
            ...current.widgets,
            [interaction.widgetId]: {
              ...widget,
              width: Math.max(2, Math.min(point.fitColumns - widget.column + 1, point.column - widget.column + 1)),
              height: Math.max(1, Math.min(4, point.fitRows - widget.row + 1, point.row - widget.row + 1)),
            },
          },
        };
        desktopLayoutRef.current = next;
        return next;
      }
      const next = {
        ...current,
        clock: {
          ...current.clock,
          width: Math.max(2, Math.min(point.fitColumns - current.clock.column + 1, point.column - current.clock.column + 1)),
          height: Math.max(1, Math.min(point.fitRows - current.clock.row + 1, point.row - current.clock.row + 1)),
        },
      };
      desktopLayoutRef.current = next;
      return next;
    });
  }

  function endDesktopInteraction() {
    const interaction = desktopInteractionRef.current;
    if (!interaction) {
      return;
    }
    desktopInteractionRef.current = undefined;
    suppressAppClickRef.current = interaction.kind === 'app' || interaction.kind === 'widget' || interaction.moved;
    if (interaction.moved) {
      onPhoneDesktopLayoutChange(desktopLayoutRef.current);
    }
    if (interaction.kind === 'app' && interaction.appId && !interaction.moved) {
      launchDesktopApp(interaction.appId);
    }
    if (interaction.kind === 'widget' && interaction.widgetId && !interaction.moved) {
      desktopWidgets.find((widget) => widget.id === interaction.widgetId)?.onOpen();
    }
  }

  function selectWallpaper(image?: ChatImageAttachment) {
    if (!selectedCharacter) {
      return;
    }
    onPhoneWallpaperChange(selectedCharacter, image?.id ?? 'wallpaper-1');
  }

  function phoneCharacterColor(name: string) {
    const directColor = characterColors.get(name);
    if (directColor) {
      return directColor;
    }
    const matchedCharacter = matchingPhoneName(storyCharacters, name);
    return matchedCharacter ? characterColors.get(matchedCharacter.name) : undefined;
  }

  function phoneVoiceClipDataUrl(message: MessageRecord, speakerName: string, text: string) {
    const speechText = dialogueSpeechText(text);
    return message.voiceClips?.find((clip) =>
      clip.source === 'phone' &&
      clip.speakerName === speakerName &&
      clip.text === speechText &&
      !!clip.dataUrl
    )?.dataUrl;
  }

  const phoneSystemTrayControls = (
    <div className="phone-desktop-settings" ref={desktopSettingsRef}>
      {phoneMoodStatusOpen && (
        <div className="phone-mood-status-menu" role="menu" aria-label="Phone status">
          {phoneMoodStatuses.map((option) => (
            <button
              className={`phone-mood-status-option${option.id === selectedPhoneMoodStatus.id ? ' active' : ''}`}
              type="button"
              key={option.id}
              onClick={() => {
                onPhoneMoodStatusChange(option.id);
                setPhoneMoodStatusOpen(false);
              }}
              role="menuitemradio"
              aria-checked={option.id === selectedPhoneMoodStatus.id}
            >
              <span className="phone-mood-status-option-symbol" aria-hidden="true">
                {option.id === 'online' ? <span className="phone-mood-status-dot" /> : option.symbol}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
      {desktopSettingsOpen && (
        <div className="phone-desktop-settings-menu" role="menu" aria-label="Desktop settings">
          <span className="phone-desktop-settings-grabber" aria-hidden="true" />
          <span className="phone-desktop-settings-label">Wallpaper</span>
          <div className="phone-desktop-wallpaper-options">
            {defaultPhoneWallpapers.map((wallpaper) => (
              <button
                className={`phone-desktop-wallpaper-option${
                  wallpaperImageId === wallpaper.id ? ' active' : ''
                }`}
                type="button"
                key={wallpaper.id}
                onClick={() => selectWallpaper(wallpaper)}
                title={`Use ${wallpaper.name}`}
                aria-label={`Use ${wallpaper.name}`}
              >
                <img src={wallpaper.dataUrl} alt={wallpaper.name} />
              </button>
            ))}
            <button
              className="phone-desktop-wallpaper-gallery"
              type="button"
              onClick={() => {
                setDesktopSettingsOpen(false);
                setScreen('gallery');
              }}
              aria-label="Select wallpaper from gallery"
              title="Select image from gallery"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="8.5" cy="10" r="1.5" />
                <path d="m21 15-4.5-4.5L8 19" />
              </svg>
            </button>
          </div>
          <span className="phone-desktop-settings-label">Icon Size</span>
          <div className="phone-desktop-icon-size-options">
            {(['medium', 'large'] as const).map((size) => (
              <button
                className={phoneDesktopIconSize === size ? 'active' : ''}
                type="button"
                key={size}
                onClick={() => onPhoneDesktopIconSizeChange(size)}
                aria-label={`${size === 'medium' ? 'Medium' : 'Large'} app icons`}
                title={`${size === 'medium' ? 'Medium' : 'Large'} app icons`}
              >
                <span className={`phone-settings-size-symbol ${size}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            ))}
          </div>
          <span className="phone-desktop-settings-label">Orientation</span>
          <div className="phone-desktop-icon-size-options">
            {(['portrait', 'landscape'] as const).map((orientation) => (
              <button
                className={(desktopLayout.orientation ?? 'portrait') === orientation ? 'active' : ''}
                type="button"
                key={orientation}
                onClick={() => {
                  const next = { ...desktopLayoutRef.current, orientation };
                  desktopLayoutRef.current = next;
                  setDesktopLayoutOverride(next);
                  onPhoneDesktopLayoutChange(next);
                }}
                aria-label={`${orientation === 'portrait' ? 'Portrait' : 'Horizontal'} phone orientation`}
                title={`${orientation === 'portrait' ? 'Portrait' : 'Horizontal'} phone orientation`}
              >
                <span className={`phone-settings-orientation-symbol ${orientation}`} aria-hidden="true" />
              </button>
            ))}
          </div>
          {
            // eslint-disable-next-line react-hooks/refs -- reads `available` only, closures run in handlers
            desktopWidgets.some((widget) => widget.available) && (
            <>
              <span className="phone-desktop-settings-label">Widgets</span>
              <div className="phone-desktop-widget-options">
                {
                  // eslint-disable-next-line react-hooks/refs -- reads `available`/`id` only, closures run in handlers
                  desktopWidgets.filter((widget) => widget.available).map((widget) => (
                  <button
                    className={(desktopLayout.widgets?.[widget.id]?.enabled ?? true) ? 'active' : ''}
                    type="button"
                    key={widget.id}
                    onClick={() => toggleDesktopWidget(widget.id)}
                  >
                    {widget.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <button
        className="phone-desktop-settings-button"
        type="button"
        onClick={() => {
          setPhoneMoodStatusOpen(false);
          setDesktopSettingsOpen((open) => !open);
        }}
        aria-label="Desktop settings"
        aria-expanded={desktopSettingsOpen}
        title="Desktop settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.02a1.7 1.7 0 0 0 1.02-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.02a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
        </svg>
      </button>
      <button
        className={`phone-mood-status-button${selectedPhoneMoodStatus.id === 'online' ? ' online' : ''}`}
        type="button"
        onClick={() => {
          setDesktopSettingsOpen(false);
          setPhoneMoodStatusOpen((open) => !open);
        }}
        aria-label={`Phone status: ${selectedPhoneMoodStatus.label}`}
        aria-expanded={phoneMoodStatusOpen}
        title={`Phone status: ${selectedPhoneMoodStatus.label}`}
      >
        {selectedPhoneMoodStatus.id === 'online' ? (
          <span className="phone-mood-status-dot" aria-hidden="true" />
        ) : (
          <span aria-hidden="true">{selectedPhoneMoodStatus.symbol}</span>
        )}
      </button>
    </div>
  );

  if (screen === 'gallery' || screen === 'chat-gallery') {
    const wallpaperMode = screen === 'gallery';
    return (
      <Fragment>
        <PhoneGalleryScreen
          title={`${phoneOwnerName ?? 'Phone'}'s Gallery`}
          images={phoneGalleryImages}
          action={wallpaperMode ? 'wallpaper' : 'select'}
          selectedWallpaperId={wallpaperMode ? wallpaperImageId : undefined}
          newImageIds={wallpaperMode ? undefined : newGalleryImageIds}
          onBack={() => setScreen(wallpaperMode ? 'desktop' : 'whatsup')}
          onSelectImage={(image) => {
            markGalleryImageSeen(image.id);
            if (wallpaperMode) {
              selectWallpaper(image);
              setScreen('desktop');
            } else {
              onSelectPhoneGalleryImage(image);
              setScreen('whatsup');
            }
          }}
        />
        {phoneSystemTrayControls}
      </Fragment>
    );
  }

  if (screen === 'plottwist') {
    return <PhoneDatingScreen key={selectedCharacter?.id ?? 'no-owner'} owner={selectedCharacter}
      characters={appCharacters} history={socialMediaMessages} isRunning={isRunning}
      onSendMessage={onSubmitSocialDirectMessage}
      unread={unreadSocialDirectMessages.matchme} onMarkSeen={(id) => onMarkSocialDirectMessagesSeen('matchme', id)}
      openRequest={directMessageRequest?.app === 'matchme' ? directMessageRequest : undefined}
      emojiOptions={phoneEmojiOptions} recentlyUsedEmojis={recentlyUsedEmojis}
      images={phoneGalleryImages} onImportImage={onImportSocialPostImage} onSave={onSaveDatingProfile}
      onBack={() => setScreen('desktop')} />;
  }

  if (screen === 'banking') {
    return (
      <Fragment>
        <PhoneBankingScreen
          key={selectedCharacter?.id ?? 'no-account'}
          owner={selectedCharacter}
          storyCharacters={storyCharacters}
          characterColors={characterColors}
          bankTransferMessages={bankTransferMessages}
          bankingContactNames={bankingContactNames}
          clockDateTime={clockDateTime}
          rpDateTimeFormat={rpDateTimeFormat}
          rpWeekdayLanguage={rpWeekdayLanguage}
          sendLocked={inputLocked}
          isRunning={isRunning}
          onBack={() => setScreen('desktop')}
          onAddBankingContact={onAddBankingContact}
          onSendBankTransfer={onSendBankTransfer}
        />
        {phoneSystemTrayControls}
      </Fragment>
    );
  }

  if (screen === 'notes') {
    return (
      <Fragment>
        <PhoneNotesScreen
          key={selectedCharacter?.id ?? 'no-owner'}
          owner={selectedCharacter}
          notes={phoneNotes}
          onDeleteNote={onPhoneNoteDelete}
          onChangeNoteColor={onPhoneNoteColorChange}
          clockDateTime={clockDateTime}
          rpDateTimeFormat={rpDateTimeFormat}
          rpWeekdayLanguage={rpWeekdayLanguage}
          onCommitNote={onPhoneNoteCommit}
          onBack={() => setScreen('desktop')}
        />
        {phoneSystemTrayControls}
      </Fragment>
    );
  }

  if (screen === 'ai') {
    return (
      <Fragment>
        <PhoneChatGpdScreen
          key={selectedCharacter?.id ?? 'no-owner'}
          chatGpd={chatGpd}
          sidebarOpen={chatGpdSidebarOpen}
          onSidebarOpenChange={onChatGpdSidebarOpenChange}
          sidebarWidth={chatGpdSidebarWidth}
          onSidebarWidthChange={onChatGpdSidebarWidthChange}
          archivedChatIds={archivedChatGpdChatIds}
          onCommitChat={onChatGpdChatCommit}
          onBack={() => setScreen('desktop')}
        />
        {phoneSystemTrayControls}
      </Fragment>
    );
  }

  if (screen === 'fotogram' || screen === 'onlyfriends') {
    const socialScreen = screen;
    return (
      <Fragment>
        <PhoneSocialFeedScreen
          key={`${screen}-${selectedCharacter?.id ?? 'no-account'}`}
          app={socialApps[screen]}
          owner={selectedCharacter}
          storyCharacters={appCharacters}
          characterColors={characterColors}
          phoneGalleryImages={phoneGalleryImages}
          bankTransferMessages={bankTransferMessages}
          socialMediaMessages={socialMediaMessages}
          phoneEmojiOptions={phoneEmojiOptions}
          recentlyUsedEmojis={recentlyUsedEmojis}
          rpTimeTrackingEnabled={rpTimeTrackingEnabled}
          onSendDirectMessage={onSubmitSocialDirectMessage}
          unreadDirectMessages={unreadSocialDirectMessages[socialScreen]}
          onMarkDirectMessagesSeen={(partnerHandle) =>
            onMarkSocialDirectMessagesSeen(socialScreen, partnerHandle)}
          openPostRequest={
            socialPostOpenRequest?.app === screen &&
            socialPostOpenRequest.requestId !== dismissedSocialPostOpenRequestId
              ? {
                  requestId: socialPostOpenRequest.requestId,
                  postId: socialPostOpenRequest.postId,
                }
              : undefined
          }
          openDirectMessageRequest={
            directMessageRequest?.app === screen &&
            directMessageRequest.requestId !== dismissedSocialDirectMessageOpenRequestId
              ? directMessageRequest
              : undefined
          }
          isRunning={isRunning}
          onTransferOnlyFriendsWallet={onTransferOnlyFriendsWallet}
          onSubmitSocialPost={onSubmitSocialPost}
          onSubmitSocialThreadAction={onSubmitSocialThreadAction}
          onCreateSocialAccount={onCreateSocialAccount}
          onImportPostImage={onImportSocialPostImage}
          socialImageById={socialImageById}
          socialLikesByAccount={socialLikesByAccount}
          socialDirectoryUsers={socialDirectoryUsers}
          fotogramContactsByCharacter={fotogramContactsByCharacter}
          socialConnectionsByCharacter={socialConnectionsByCharacter}
          onAddSocialConnection={onAddSocialConnection}
          onlyFriendsPurchasesByCharacter={onlyFriendsPurchasesByCharacter}
          onUnlockOnlyFriendsPost={onUnlockOnlyFriendsPost}
          onToggleLike={(postId) => {
            if (selectedCharacter) {
              onToggleSocialLike(selectedCharacter.id, socialScreen, postId);
            }
          }}
          onBack={() => {
            setDismissedSocialPostOpenRequestId(socialPostOpenRequest?.requestId);
            setDismissedSocialDirectMessageOpenRequestId(directMessageRequest?.requestId);
            setScreen('desktop');
          }}
          connections={connections}
          providerHealthById={providerHealthById}
          estimatedTokenBytesPerToken={estimatedTokenBytesPerToken}
          imageAssistantChatHistoryContext={imageAssistantChatHistoryContext}
          imageAssistantModelStateById={imageAssistantModelStateById}
          onSetImageAssistantLlmModelLoaded={onSetImageAssistantLlmModelLoaded}
          onUnloadImageAssistantComfyModel={onUnloadImageAssistantComfyModel}
          onRefreshImageAssistantModelState={onRefreshImageAssistantModelState}
          onSubmitImageAssistantMessage={onSubmitImageAssistantMessage}
          onGenerateImageAssistantImages={onGenerateImageAssistantImages}
          onSaveImageAssistantImage={onSaveImageAssistantImage}
          rpDateTimeFormat={rpDateTimeFormat}
          rpWeekdayLanguage={rpWeekdayLanguage}
        />
        {phoneSystemTrayControls}
      </Fragment>
    );
  }

  if (screen === 'camera') {
    return (
      <Fragment>
        <div className="phone-desktop" style={desktopStyle} aria-label="Phone desktop">
          <div className="phone-desktop-scrim" />
          <PhoneImagePicker
            hideLauncher
            openCameraOnMount
            onCameraClose={() => setScreen('desktop')}
            onUploadFromComputer={() => {}}
            connections={connections}
            providerHealthById={providerHealthById}
            availableCharacterLoras={storyCharacters.flatMap((character) => {
              const loraName = character.comfyConfig?.loraName.trim();
              return loraName ? [`${character.name}: ${loraName}`] : [];
            })}
            characterContext={imageGenerationCharacterContext(storyCharacters)}
            characterCount={storyCharacters.length}
            chatHistoryContext={imageAssistantChatHistoryContext}
            estimatedTokenBytesPerToken={estimatedTokenBytesPerToken}
            saveCharacters={storyCharacters}
            preferredSaveCharacterId={selectedCharacter?.id}
            onSubmitImageAssistantMessage={onSubmitImageAssistantMessage}
            onGenerateImageAssistantImages={onGenerateImageAssistantImages}
            onSaveImageAssistantImage={onSaveImageAssistantImage}
            imageAssistantModelStateById={imageAssistantModelStateById}
            onSetImageAssistantLlmModelLoaded={onSetImageAssistantLlmModelLoaded}
            onUnloadImageAssistantComfyModel={onUnloadImageAssistantComfyModel}
            onRefreshImageAssistantModelState={onRefreshImageAssistantModelState}
          />
        </div>
        {phoneSystemTrayControls}
      </Fragment>
    );
  }

  if (screen === 'desktop') {
    return (
      <Fragment>
      <div
        className={`phone-desktop${launchingApp ? ' is-launching' : ''}`}
        ref={desktopRef}
        style={{ ...desktopStyle, '--phone-icon': `${effectiveDesktopIconPx}px` } as CSSProperties}
        aria-label="Phone desktop"
        onPointerMove={moveDesktopInteraction}
        onPointerUp={endDesktopInteraction}
        onPointerCancel={() => { desktopInteractionRef.current = undefined; }}
      >
        <div className="phone-desktop-scrim" />
        <div
          className={`phone-clock-widget phone-clock-widget-${desktopLayout.clock.width}x${desktopLayout.clock.height}`}
          style={{
            gridColumn: `${desktopLayout.clock.column} / span ${desktopLayout.clock.width}`,
            gridRow: `${desktopLayout.clock.row} / span ${desktopLayout.clock.height}`,
          }}
          onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'clock' })}
        >
          <strong>{clockParts?.time ?? '--:--'}</strong>
          <span>{clockDayLabel || clockParts?.date || ''}</span>
          <button
            className="phone-clock-resize-handle"
            type="button"
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'resize' })}
            aria-label="Resize clock widget"
            title="Resize clock widget"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M8 16h8M12 12h4M16 8h1" />
            </svg>
          </button>
        </div>
        <div className="phone-desktop-widgets" aria-label="Phone widgets">
          {visibleDesktopWidgets.map((widget) => {
            const widgetLayout = desktopWidgetLayout(widget.id);
            const displayLayout = widget.id === 'narrative' && narrativeWidgetExpanded
              ? fitDesktopWidgetLayout({
                ...widgetLayout,
                row: Math.max(1, widgetLayout.row - 1),
                height: Math.max(widgetLayout.height, phoneDesktopOrientation === 'landscape' ? 3 : 4),
              })
              : widgetLayout;
            if (widget.id === 'narrative') {
              return (
                <form
                  key={widget.id}
                  className={`phone-desktop-widget phone-narrative-widget${narrativeWidgetExpanded ? ' expanded' : ''}`}
                  style={{
                    gridColumn: `${displayLayout.column} / span ${displayLayout.width}`,
                    gridRow: `${displayLayout.row} / span ${displayLayout.height}`,
                  }}
                  onSubmit={onSubmitRpNarrative}
                  aria-label="Narrative input widget"
                >
                  <button
                    className="phone-narrative-widget-grip"
                    type="button"
                    onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'widget', widgetId: widget.id })}
                    aria-label="Move narrative widget"
                    title="Move narrative widget"
                  >
                    <span className="phone-desktop-widget-label">Narrative</span>
                    <strong>{rpDraft.trim() ? 'Ready to run' : 'Next beat'}</strong>
                  </button>
                  <textarea
                    value={rpDraft}
                    disabled={inputLocked}
                    onFocus={() => setNarrativeWidgetExpanded(true)}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => onRpDraftChange(event.currentTarget.value)}
                    placeholder="Write narration..."
                    aria-label="Narrative draft"
                  />
                  <div className="phone-narrative-widget-actions">
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        onRpDraftChange('');
                        setNarrativeWidgetExpanded(false);
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="submit"
                      onPointerDown={(event) => event.stopPropagation()}
                      disabled={!canSendRpNarrative}
                    >
                      {isRunning ? 'Stop' : 'Run'}
                    </button>
                  </div>
                  <span
                    className="phone-widget-resize-handle"
                    aria-label="Resize Narrative widget"
                    title="Resize Narrative widget"
                    onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'resize-widget', widgetId: widget.id })}
                  />
                </form>
              );
            }
            return (
              <button
                key={widget.id}
                type="button"
                className={`phone-desktop-widget ${widget.id}`}
                style={{
                  gridColumn: `${displayLayout.column} / span ${displayLayout.width}`,
                  gridRow: `${displayLayout.row} / span ${displayLayout.height}`,
                }}
                onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'widget', widgetId: widget.id })}
                onClick={(event) => {
                  if (suppressAppClickRef.current) {
                    suppressAppClickRef.current = false;
                    event.preventDefault();
                    return;
                  }
                  widget.onOpen();
                }}
                aria-label={`View ${widget.label} widget`}
              >
                <span className="phone-desktop-widget-label">{widget.label}</span>
                {widget.id === 'gallery' && phoneGalleryImages.length > 0 && (
                  <span className="phone-desktop-gallery-strip" aria-hidden="true">
                    {[...phoneGalleryImages, ...phoneGalleryImages]
                      .slice(0, Math.min(8, Math.max(4, phoneGalleryImages.length * 2)))
                      .map((image, index) => (
                        <img key={`${image.id}-${index}`} src={image.dataUrl} alt="" />
                      ))}
                  </span>
                )}
                {widget.value && <strong>{widget.value}</strong>}
                {widget.detail && (
                  <span>{compactPhoneText(widget.detail, '', widget.id === 'gallery' ? 58 : 82)}</span>
                )}
                <span
                  className="phone-widget-resize-handle"
                  aria-label={`Resize ${widget.label} widget`}
                  title={`Resize ${widget.label} widget`}
                  onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'resize-widget', widgetId: widget.id })}
                />
              </button>
            );
          })}
        </div>
        <div className="phone-desktop-apps">
          <button className="phone-desktop-app" type="button"
            style={{ gridColumn: desktopLayout.apps.plottwist.column, gridRow: desktopLayout.apps.plottwist.row }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'plottwist' })}
            onClick={() => {
              if (suppressAppClickRef.current) { suppressAppClickRef.current = false; return; }
              setScreen('plottwist');
            }} aria-label="Open MatchMe">
            <span className="phone-matchme-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 13.5c1.2-1.3 1.8-2.7 1.8-3.9A4.1 4.1 0 0 0 12 6.9a4.1 4.1 0 0 0-8.8 2.7c0 1.2.6 2.6 1.8 3.9l7 6.8Z" />
              </svg>
            </span>{phoneAppNotificationCounts.matchme > 0 && <span className="phone-desktop-app-badge" aria-hidden="true">{desktopBadgeLabel(phoneAppNotificationCounts.matchme)}</span>}<span>MatchMe</span>
          </button>
          <button
            className="phone-desktop-app"
            type="button"
            style={{
              gridColumn: desktopLayout.apps.whatsup.column,
              gridRow: desktopLayout.apps.whatsup.row,
            }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'whatsup' })}
            onClick={() => {
              if (suppressAppClickRef.current) {
                suppressAppClickRef.current = false;
                return;
              }
              launchDesktopApp('whatsup');
            }}
            aria-label={unreadWhatsUpCount > 0
              ? `Open WhatsUp, ${unreadWhatsUpCount} unread`
              : 'Open WhatsUp'}
          >
            <span className="phone-whatsup-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.8 5.2A8.9 8.9 0 0 0 4.7 15.9L3.4 20.4l4.7-1.2A8.9 8.9 0 1 0 18.8 5.2Z" />
              </svg>
            </span>
            {unreadWhatsUpCount > 0 && (
              <span className="phone-desktop-app-badge" aria-hidden="true">
                {desktopBadgeLabel(unreadWhatsUpCount)}
              </span>
            )}
            <span>WhatsUp</span>
          </button>
          <button
            className="phone-desktop-app"
            type="button"
            style={{
              gridColumn: desktopLayout.apps.gallery.column,
              gridRow: desktopLayout.apps.gallery.row,
            }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'gallery' })}
            onClick={() => {
              if (suppressAppClickRef.current) {
                suppressAppClickRef.current = false;
                return;
              }
              launchDesktopApp('gallery');
            }}
            aria-label="Open Gallery"
          >
            <span className="phone-gallery-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="8.5" cy="8.5" r="1.4" />
                <path d="m4.5 18 5.5-5.5 3.2 3.2 2.1-2.1 4.2 4.4" />
              </svg>
            </span>
            <span>Gallery</span>
          </button>
          <button
            className="phone-desktop-app"
            type="button"
            style={{
              gridColumn: desktopLayout.apps.camera.column,
              gridRow: desktopLayout.apps.camera.row,
            }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'camera' })}
            onClick={() => {
              if (suppressAppClickRef.current) {
                suppressAppClickRef.current = false;
                return;
              }
              launchDesktopApp('camera');
            }}
            aria-label="Open Camera"
          >
            <span className="phone-camera-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h3l1.2-2h7.6L17 7h3a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
            <span>Camera</span>
          </button>
          <button
            className="phone-desktop-app"
            type="button"
            style={{
              gridColumn: desktopLayout.apps.banking.column,
              gridRow: desktopLayout.apps.banking.row,
            }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'banking' })}
            onClick={() => {
              if (suppressAppClickRef.current) {
                suppressAppClickRef.current = false;
                return;
              }
              launchDesktopApp('banking');
            }}
            aria-label={unreadBankingCount > 0
              ? `Open Banking, ${unreadBankingCount} new transactions`
              : 'Open Banking'}
          >
            <span className="phone-banking-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9 12 4l9 5" />
                <path d="M4 9h16" />
                <path d="M6 11v7M10 11v7M14 11v7M18 11v7" />
                <path d="M3 20h18" />
              </svg>
            </span>
            {unreadBankingCount > 0 && (
              <span className="phone-desktop-app-badge banking" aria-hidden="true">
                {desktopBadgeLabel(unreadBankingCount)}
              </span>
            )}
            <span>Banking</span>
          </button>
          <button
            className="phone-desktop-app"
            type="button"
            style={{
              gridColumn: desktopLayout.apps.fotogram.column,
              gridRow: desktopLayout.apps.fotogram.row,
            }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'fotogram' })}
            onClick={() => {
              if (suppressAppClickRef.current) {
                suppressAppClickRef.current = false;
                return;
              }
              launchDesktopApp('fotogram');
            }}
            aria-label={phoneAppNotificationCounts.fotogram > 0
              ? `Open Fotogram, ${phoneAppNotificationCounts.fotogram} new`
              : 'Open Fotogram'}
          >
            <span className="phone-fotogram-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="1" />
              </svg>
            </span>
            {phoneAppNotificationCounts.fotogram > 0 && (
              <span className="phone-desktop-app-badge" aria-hidden="true">
                {desktopBadgeLabel(phoneAppNotificationCounts.fotogram)}
              </span>
            )}
            <span>Fotogram</span>
          </button>
          <button
            className="phone-desktop-app"
            type="button"
            style={{
              gridColumn: desktopLayout.apps.onlyfriends.column,
              gridRow: desktopLayout.apps.onlyfriends.row,
            }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'onlyfriends' })}
            onClick={() => {
              if (suppressAppClickRef.current) {
                suppressAppClickRef.current = false;
                return;
              }
              launchDesktopApp('onlyfriends');
            }}
            aria-label={phoneAppNotificationCounts.onlyfriends > 0
              ? `Open OnlyFriends, ${phoneAppNotificationCounts.onlyfriends} new`
              : 'Open OnlyFriends'}
          >
            <span className="phone-onlyfriends-icon" aria-hidden="true">
              <span className="phone-onlyfriends-monogram">OF</span>
            </span>
            {phoneAppNotificationCounts.onlyfriends > 0 && (
              <span className="phone-desktop-app-badge" aria-hidden="true">
                {desktopBadgeLabel(phoneAppNotificationCounts.onlyfriends)}
              </span>
            )}
            <span>OnlyFriends</span>
          </button>
          <button
            className="phone-desktop-app"
            type="button"
            style={{
              gridColumn: desktopLayout.apps.notes.column,
              gridRow: desktopLayout.apps.notes.row,
            }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'notes' })}
            onClick={() => {
              if (suppressAppClickRef.current) {
                suppressAppClickRef.current = false;
                return;
              }
              launchDesktopApp('notes');
            }}
            aria-label={phoneAppNotificationCounts.notes > 0
              ? `Open Notes, ${phoneAppNotificationCounts.notes} new`
              : 'Open Notes'}
          >
            <span className="phone-notes-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
                <path d="M15 3v4h4" />
                <path d="M8 11h8M8 15h8M8 19h5" />
              </svg>
            </span>
            {phoneAppNotificationCounts.notes > 0 && (
              <span className="phone-desktop-app-badge" aria-hidden="true">
                {desktopBadgeLabel(phoneAppNotificationCounts.notes)}
              </span>
            )}
            <span>Notes</span>
          </button>
          <button
            className="phone-desktop-app"
            type="button"
            style={{
              gridColumn: desktopLayout.apps.ai.column,
              gridRow: desktopLayout.apps.ai.row,
            }}
            onPointerDown={(event) => beginDesktopInteraction(event, { kind: 'app', appId: 'ai' })}
            onClick={() => {
              if (suppressAppClickRef.current) {
                suppressAppClickRef.current = false;
                return;
              }
              launchDesktopApp('ai');
            }}
            aria-label={phoneAppNotificationCounts.ai > 0
              ? `Open ChatGPD, ${phoneAppNotificationCounts.ai} new`
              : 'Open ChatGPD'}
          >
            <span className="phone-chatgpd-icon" aria-hidden="true">AI</span>
            {phoneAppNotificationCounts.ai > 0 && (
              <span className="phone-desktop-app-badge" aria-hidden="true">
                {desktopBadgeLabel(phoneAppNotificationCounts.ai)}
              </span>
            )}
            <span>ChatGPD</span>
          </button>
        </div>
      </div>
        <div className="phone-desktop-settings" ref={desktopSettingsRef}>
          {phoneMoodStatusOpen && (
            <div className="phone-mood-status-menu" role="menu" aria-label="Phone status">
              {phoneMoodStatuses.map((option) => (
                <button
                  className={`phone-mood-status-option${option.id === selectedPhoneMoodStatus.id ? ' active' : ''}`}
                  type="button"
                  key={option.id}
                  onClick={() => {
                    onPhoneMoodStatusChange(option.id);
                    setPhoneMoodStatusOpen(false);
                  }}
                  role="menuitemradio"
                  aria-checked={option.id === selectedPhoneMoodStatus.id}
                >
                  <span className="phone-mood-status-option-symbol" aria-hidden="true">
                    {option.id === 'online' ? <span className="phone-mood-status-dot" /> : option.symbol}
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}
          {desktopSettingsOpen && (
            <div className="phone-desktop-settings-menu" role="menu" aria-label="Desktop settings">
              <span className="phone-desktop-settings-grabber" aria-hidden="true" />
              <span className="phone-desktop-settings-label">Wallpaper</span>
              <div className="phone-desktop-wallpaper-options">
                {defaultPhoneWallpapers.map((wallpaper) => (
                  <button
                    className={`phone-desktop-wallpaper-option${
                      wallpaperImageId === wallpaper.id ? ' active' : ''
                    }`}
                    type="button"
                    key={wallpaper.id}
                    onClick={() => selectWallpaper(wallpaper)}
                    title={`Use ${wallpaper.name}`}
                    aria-label={`Use ${wallpaper.name}`}
                  >
                    <img src={wallpaper.dataUrl} alt={wallpaper.name} />
                  </button>
                ))}
                <button
                  className="phone-desktop-wallpaper-gallery"
                  type="button"
                  onClick={() => {
                    setDesktopSettingsOpen(false);
                    setScreen('gallery');
                  }}
                  aria-label="Select wallpaper from gallery"
                  title="Select image from gallery"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="8.5" cy="10" r="1.5" />
                    <path d="m21 15-4.5-4.5L8 19" />
                  </svg>
                </button>
              </div>
              <span className="phone-desktop-settings-label">Icon Size</span>
              <div className="phone-desktop-icon-size-options">
                {(['medium', 'large'] as const).map((size) => (
                  <button
                    className={phoneDesktopIconSize === size ? 'active' : ''}
                    type="button"
                    key={size}
                    onClick={() => onPhoneDesktopIconSizeChange(size)}
                    aria-label={`${size === 'medium' ? 'Medium' : 'Large'} app icons`}
                    title={`${size === 'medium' ? 'Medium' : 'Large'} app icons`}
                  >
                    <span
                      className={`phone-settings-size-symbol ${size}`}
                      aria-hidden="true"
                    >
                      <span />
                      <span />
                      <span />
                      <span />
                    </span>
                  </button>
                ))}
              </div>
              <span className="phone-desktop-settings-label">Orientation</span>
              <div className="phone-desktop-icon-size-options">
                {(['portrait', 'landscape'] as const).map((orientation) => (
                  <button
                    className={(desktopLayout.orientation ?? 'portrait') === orientation ? 'active' : ''}
                    type="button"
                    key={orientation}
                    onClick={() => {
                      const next = { ...desktopLayoutRef.current, orientation };
                      desktopLayoutRef.current = next;
                      setDesktopLayoutOverride(next);
                      onPhoneDesktopLayoutChange(next);
                    }}
                    aria-label={`${orientation === 'portrait' ? 'Portrait' : 'Horizontal'} phone orientation`}
                    title={`${orientation === 'portrait' ? 'Portrait' : 'Horizontal'} phone orientation`}
                  >
                    <span
                      className={`phone-settings-orientation-symbol ${orientation}`}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              {
                // eslint-disable-next-line react-hooks/refs -- reads `available` only, closures run in handlers
                desktopWidgets.some((widget) => widget.available) && (
                <>
                  <span className="phone-desktop-settings-label">Widgets</span>
                  <div className="phone-desktop-widget-options">
                    {
                      // eslint-disable-next-line react-hooks/refs -- reads `available`/`id` only, closures run in handlers
                      desktopWidgets.filter((widget) => widget.available).map((widget) => (
                      <button
                        className={(desktopLayout.widgets?.[widget.id]?.enabled ?? true) ? 'active' : ''}
                        type="button"
                        key={widget.id}
                        onClick={() => toggleDesktopWidget(widget.id)}
                      >
                        {widget.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            className="phone-desktop-settings-button"
            type="button"
            onClick={() => {
              setPhoneMoodStatusOpen(false);
              setDesktopSettingsOpen((open) => !open);
            }}
            aria-label="Desktop settings"
            aria-expanded={desktopSettingsOpen}
            title="Desktop settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.02a1.7 1.7 0 0 0 1.02-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.02a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
            </svg>
          </button>
          <button
            className={`phone-mood-status-button${selectedPhoneMoodStatus.id === 'online' ? ' online' : ''}`}
            type="button"
            onClick={() => {
              setDesktopSettingsOpen(false);
              setPhoneMoodStatusOpen((open) => !open);
            }}
            aria-label={`Phone status: ${selectedPhoneMoodStatus.label}`}
            aria-expanded={phoneMoodStatusOpen}
            title={`Phone status: ${selectedPhoneMoodStatus.label}`}
          >
            {selectedPhoneMoodStatus.id === 'online' ? (
              <span className="phone-mood-status-dot" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">{selectedPhoneMoodStatus.symbol}</span>
            )}
          </button>
        </div>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <div className={`phone-surface${contactListOpen || !selectedPhoneContact ? ' shows-contacts' : ' shows-conversation'}`}>
        <div className="phone-list" aria-label="Phone chats">
        <div className="phone-list-header">
          <button
            className="phone-home-button"
            type="button"
            onClick={() => setScreen('desktop')}
            aria-label="Back to phone desktop"
            title="Phone desktop"
          >
            ←
          </button>
          <strong>{phoneListTitle}</strong>
          <span>{phoneContacts.length}</span>
        </div>
        <div className="phone-contact-list">
          {phoneContacts.map((contact) => (
            <button
              className={`phone-contact${
                selectedPhoneContact?.character.id === contact.character.id ? ' active' : ''
              }`}
              type="button"
              key={contact.character.id}
              onClick={() => {
                setContactListOpen(false);
                onOpenPhoneContact(contact);
              }}
            >
              <CharacterAvatar
                className="phone-avatar"
                name={contact.character.name}
                fallback={contact.character.name.slice(0, 1).toUpperCase()}
                profileImageDataUrl={phoneCharacterAvatarDataUrl(contact.character)}
                style={{ borderColor: contact.color, color: contact.color }}
              />
              <span className="phone-contact-main">
                <span className="phone-contact-topline">
                  <strong style={{ color: contact.color }}>{contact.character.name}</strong>
                  <small>{contact.time}</small>
                </span>
                <span className="phone-contact-bottomline">
                  <span>{contact.preview}</span>
                  {contact.unreadCount > 0 && (
                    <span className="phone-contact-badge">
                      {contact.unreadCount}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))}
          {phoneContacts.length === 0 && (
            <div className="phone-empty">No characters in this RP.</div>
          )}
        </div>
        {unreadPhoneConversations.length > 0 && (
          <div className="phone-unread-switches" aria-label="Phone switches">
            {unreadPhoneConversations.map((conversation) => (
              <button
                type="button"
                className={conversation.unread ? 'unread' : 'idle'}
                key={conversation.key}
                onClick={() => {
                  setContactListOpen(false);
                  onOpenUnreadPhoneConversation(conversation);
                }}
              >
                <span>Switch to {unreadPhoneSwitchName(conversation)} Phone</span>
                {conversation.unread && (
                  <span className="phone-switch-badge">
                    {conversation.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="phone-chat" aria-label="Phone conversation">
        {selectedPhoneContact ? (
          <>
            <div className="phone-chat-header">
              <button className="phone-home-button" type="button" aria-label="Back to chats" onClick={() => setContactListOpen(true)}>←</button>
              <CharacterAvatar
                className="phone-avatar large"
                name={selectedPhoneContact.character.name}
                fallback={selectedPhoneContact.character.name.slice(0, 1).toUpperCase()}
                profileImageDataUrl={phoneCharacterAvatarDataUrl(selectedPhoneContact.character)}
                style={{
                  borderColor: selectedPhoneContact.color,
                  color: selectedPhoneContact.color,
                }}
              />
              <div>
                <strong style={{ color: selectedPhoneContact.color }}>
                  {selectedPhoneContact.character.name}
                </strong>
                <span>Last seen Today</span>
              </div>
            </div>
            <div className="phone-thread" ref={phoneThreadRef}>
              {phoneMessageViews.length > 0 ? (
                phoneMessageViews.map((view) => {
                  const { message } = view;
                  const focusHighlighted = highlightedPhoneMessageId === message.id;
                  const repliedToMessage = message.replyToMessageId !== undefined
                    ? selectedPhoneConversation.find((entry) => entry.id === message.replyToMessageId)
                    : undefined;
                  const replySelected = replyToMessage?.id === message.id;
                  const repliedToText = repliedToMessage
                    ? phoneReplyVisibleText(repliedToMessage, englishProcessingEnabled) || 'Image'
                    : '';
                  const fromColor = phoneCharacterColor(view.senderName);
                  const dayLabel = view.dayRpDateTime
                    ? formatRpDayLabel(view.dayRpDateTime, rpDateTimeFormat, rpWeekdayLanguage)
                    : '';
                  return (
                    <Fragment key={`${message.id}-${focusHighlighted ? highlightedPhoneMessagePulseKey : 'idle'}`}>
                      {dayLabel && <div className="rp-day-divider"><span>{dayLabel}</span></div>}
                      <div
                        className={`phone-message-row${replySelected ? ' reply-selected' : ''}${
                          focusHighlighted ? ' phone-focus-highlight' : ''
                        }`}
                        data-phone-message-id={message.id}
                      >
                      {view.showNewDivider && <div className="phone-new-divider"><span>New</span></div>}
                      <div className={`phone-message-content ${view.outgoing ? 'outgoing' : 'incoming'}`}>
                        <div
                          className={`phone-bubble ${view.outgoing ? 'outgoing' : 'incoming'}`}
                          style={{ fontSize: phoneChatTextSize || defaultPhoneChatTextSize }}
                        >
                          <span
                            className="phone-bubble-sender"
                            style={fromColor ? { color: fromColor } : undefined}
                          >
                            {view.senderName}
                            {phoneAuthorBadgesEnabled && (
                              <span className={`phone-author-badge ${message.role === 'user' ? 'user' : 'ai'}`}>
                                {message.role === 'user' ? 'USER' : 'AI'}
                              </span>
                            )}
                          </span>
                          {repliedToMessage && (
                            <div className={`phone-bubble-reply-context${phoneReplySizeClass(repliedToText)}`}>
                              {!!repliedToMessage.imageAttachments?.length && (
                                <img
                                  src={repliedToMessage.imageAttachments[0]?.dataUrl}
                                  alt={repliedToMessage.imageAttachments[0]?.name ?? 'Replied image'}
                                  onLoad={() => onScrollPhoneThreadToBottom('auto')}
                                />
                              )}
                              <div className="phone-bubble-reply-copy">
                                <strong>
                                  Reply to {repliedToMessage.phoneFrom || repliedToMessage.speakerName || 'Unknown'}
                                </strong>
                                <span>{repliedToText}</span>
                              </div>
                            </div>
                          )}
                          {!!message.imageAttachments?.length && (
                            <div className="phone-bubble-images">
                              {message.imageAttachments.map((image) => (
                                <div className="phone-bubble-image" key={image.id}>
                                  <button
                                    className="phone-bubble-image-preview"
                                    type="button"
                                    onClick={() => onPreviewImage(image)}
                                  >
                                    <img
                                      src={image.dataUrl}
                                      alt={image.name}
                                      onLoad={() => onScrollPhoneThreadToBottom('auto')}
                                    />
                                  </button>
                                  <ImageContextControl
                                    image={image}
                                    inContext={isImageInContext(image)}
                                    manuallySelected={isImageManuallySelected(image)}
                                    disabled={isRunning}
                                    contextEnabled={referenceImageContextEnabled}
                                    contextDisabledReason={referenceImageContextDisabledReason}
                                    onToggle={onToggleReferenceImage}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          {view.visibleText && (
                            message.phoneVoiceMessage && voiceMessageSpeakerNames.has(view.senderName) ? (
                              <PhoneVoiceMessage
                                text={view.visibleText}
                                clipDataUrl={phoneVoiceClipDataUrl(message, view.senderName, view.visibleText)}
                                disabled={isRunning}
                                disabledReason="Voice messages are unavailable while the chat is running."
                                onGenerateClip={() =>
                                  onGenerateVoiceMessageClip({
                                    messageId: message.id,
                                    speakerName: view.senderName,
                                    text: view.visibleText,
                                  })
                                }
                              />
                            ) : (
                              <span><AccountLinkText text={view.visibleText} bindings={message.accountLinks} /></span>
                            )
                          )}
                          {message.phoneImageCaptionChange && (
                            <button
                              className="caption-change-chip"
                              type="button"
                              onClick={() => onPreviewImageCaptionChange(message.phoneImageCaptionChange!)}
                            >
                              Image Caption Updated
                            </button>
                          )}
                          {message.rpDateTime && (
                            <span className="phone-bubble-time">
                              {(() => {
                                const parts = formatRpDateTimeParts(
                                  message.rpDateTime,
                                  rpDateTimeFormat,
                                  rpWeekdayLanguage,
                                );
                                return parts
                                  ? (
                                      <>
                                        <span className="rp-time-date">{parts.date}</span>
                                        {'   '}
                                        <span className="rp-time-clock">{parts.time}</span>
                                      </>
                                    )
                                  : message.rpDateTime;
                              })()}
                            </span>
                          )}
                        </div>
                        {!inputLocked && (
                          <div className="phone-message-side-actions">
                            {message.replyToMessageId === undefined && (
                              <button
                                className="phone-reply-action"
                                type="button"
                                onClick={() => onReplyToMessage(message)}
                                aria-label={`Reply to ${view.senderName}`}
                                title="Reply to message"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="9 17 4 12 9 7" />
                                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      </div>
                    </Fragment>
                  );
                })
              ) : null}
            </div>
            <div className={`phone-input-zone${inputLocked ? ' locked' : ''}`}>
              {replyToMessage && (
                <div
                  className={`phone-reply-preview${phoneReplySizeClass(selectedReplyText)}`}
                  aria-label="Replying to message"
                >
                  {!!replyToMessage.imageAttachments?.length && (
                    <img
                      src={replyToMessage.imageAttachments[0]?.dataUrl}
                      alt={replyToMessage.imageAttachments[0]?.name ?? 'Replied image'}
                      onLoad={() => onScrollPhoneThreadToBottom('auto')}
                    />
                  )}
                  <div className="phone-reply-preview-copy">
                    <strong>
                      Replying to {replyToMessage.phoneFrom || replyToMessage.speakerName || 'Unknown'}
                    </strong>
                    <span>
                      {selectedReplyText}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onCancelPhoneReply}
                    aria-label="Cancel reply"
                    title="Cancel reply"
                    className="phone-cancel-reply-button"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}
              {!!phoneImages.length && (
                <div className="phone-attachment-tray" aria-label="Selected phone images">
                  {phoneImages.map((image) => (
                    <div
                      className={`phone-attachment${
                        image.width && image.height && image.height > image.width
                          ? ' portrait'
                          : ''
                      }`}
                      key={image.id}
                    >
                      <button
                        className="phone-image-preview"
                        type="button"
                        onClick={() => onPreviewImage(image)}
                      >
                        <img src={image.dataUrl} alt={image.name} />
                      </button>
                      <button
                        className="phone-image-remove"
                        type="button"
                        onClick={() => onRemovePhoneImage(image.id)}
                        title={`Remove ${image.name}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!!selectedCharacter && !!phoneDraft.trim() ? (
                <div className="phone-typing">
                  <strong style={{ color: characterColors.get(selectedCharacter.name) }}>
                    {selectedCharacter.name}
                  </strong>
                  <span>typing...</span>
                  <CommandPillList
                    className="phone-command-pill-list"
                    commands={phoneDraftCommands}
                    onCommandsChange={onPhoneDraftCommandsChange}
                    onRequestMessageFocus={() => commandComposerRef.current?.focusMessage()}
                  />
                </div>
              ) : phoneDraftCommands.length > 0 ? (
                <div className="phone-active-commands-row">
                  <CommandPillList
                    className="phone-command-pill-list"
                    commands={phoneDraftCommands}
                    onCommandsChange={onPhoneDraftCommandsChange}
                    onRequestMessageFocus={() => commandComposerRef.current?.focusMessage()}
                  />
                </div>
              ) : null}
              <form className="phone-composer" onSubmit={onSubmitPhoneMessage}>
                <CommandPillComposer
                  ref={commandComposerRef}
                  value={phoneDraft}
                  commands={phoneDraftCommands}
                  commandsEnabled={rpTimeTrackingEnabled}
                  disabled={inputLocked}
                  onValueChange={onPhoneDraftChange}
                  onCommandsChange={onPhoneDraftCommandsChange}
                  onSubmit={onSubmitPhoneMessage}
                  placeholder="Write message"
                  rows={4}
                />
                {(phoneDraft.trim() || phoneDraftContextComment.trim()) && (
                  <details className="phone-draft-context-note" open={!!phoneDraftContextComment.trim()}>
                    <summary>
                      <span>Context</span>
                      <small>{phoneDraftContextComment.trim() ? 'attached' : 'optional'}</small>
                    </summary>
                    <textarea
                      className="phone-draft-context-textarea"
                      value={phoneDraftContextComment}
                      onChange={(event) => onPhoneDraftContextCommentChange(event.currentTarget.value)}
                      placeholder="How this text should land, e.g. clearly sarcastic."
                      rows={2}
                    />
                  </details>
                )}
                <div className="phone-composer-actions">
                  <button className="phone-send-button" type="submit" disabled={!canSend}>
                    {isRunning ? 'Cancel' : 'Send'}
                  </button>
                  <div className="phone-secondary-actions">
                    <div className="phone-emoji-menu" ref={phoneEmojiPickerRef}>
                      <button
                        className="phone-emoji-button"
                        type="button"
                        onClick={onTogglePhoneEmojiPicker}
                        aria-label="Open phone emoji picker"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                          <line x1="9" y1="9" x2="9.01" y2="9" />
                          <line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                      </button>
                      {showPhoneEmojiPicker && (
                        <div className="phone-emoji-picker">
                          {recentlyUsedEmojis.length > 0 && (
                            <div className="phone-emoji-recent-row">
                              <div className="phone-emoji-recent-label">RECENT</div>
                              <div className="phone-emoji-recent-list">
                                {recentlyUsedEmojis.map((emoji) => (
                                  <button
                                    type="button"
                                    key={`recent-${emoji}`}
                                    onClick={() => onSelectPhoneEmoji(emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="phone-emoji-all-grid">
                            {phoneEmojiOptions.map((emoji) => (
                              <button
                                type="button"
                                key={emoji}
                                onClick={() => onSelectPhoneEmoji(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <PhoneImagePicker
                      uploadDisabled={!imageUploadEnabled}
                      uploadDisabledReason={imageUploadDisabledReason}
                      onOpenGallery={() => setScreen('chat-gallery')}
                      onUploadFromComputer={onSelectPhoneImages}
                      connections={connections}
                      providerHealthById={providerHealthById}
                      availableCharacterLoras={storyCharacters.flatMap((character) => {
                        const loraName = character.comfyConfig?.loraName.trim();
                        return loraName ? [`${character.name}: ${loraName}`] : [];
                      })}
                      characterContext={imageGenerationCharacterContext(storyCharacters)}
                      characterCount={storyCharacters.length}
                      chatHistoryContext={imageAssistantChatHistoryContext}
                      estimatedTokenBytesPerToken={estimatedTokenBytesPerToken}
                      saveCharacters={storyCharacters}
                      preferredSaveCharacterId={selectedCharacter?.id}
                      onSubmitImageAssistantMessage={onSubmitImageAssistantMessage}
                      onGenerateImageAssistantImages={onGenerateImageAssistantImages}
                      onSaveImageAssistantImage={onSaveImageAssistantImage}
                      imageAssistantModelStateById={imageAssistantModelStateById}
                      onSetImageAssistantLlmModelLoaded={onSetImageAssistantLlmModelLoaded}
                      onUnloadImageAssistantComfyModel={onUnloadImageAssistantComfyModel}
                      onRefreshImageAssistantModelState={onRefreshImageAssistantModelState}
                    />
                  </div>
                </div>
                <input
                  ref={phoneImageInputRef}
                  className="phone-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!imageUploadEnabled}
                  onChange={(event) => {
                    onAddPhoneImages(event.target.files);
                    event.target.value = '';
                  }}
                />
              </form>
              {inputLocked && (
                <div className="phone-input-locked-overlay" aria-live="polite">
                  <div>
                    {!!selectedCharacter && selectedCharacterPlayable && (
                      <button type="button" onClick={onSwitchToViewedCharacter}>
                        Switch to {selectedCharacter.name}
                      </button>
                    )}
                    <span>
                      Use AutoTurn to let the LLM decide what happens next.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="phone-chat-empty">No chat selected.</div>
        )}
        </div>
      </div>
      {phoneSystemTrayControls}
    </Fragment>
  );
}
