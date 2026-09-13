import type { ChatImageAttachment, WorkflowNode } from '../types';
import { normalizePhoneName, type ParsedPhoneMessage } from '../chat/phoneMessages';
import { isStorybookSourceNode, storyCharactersFromNodes, chatAttachmentFromStorybookImage, type StorybookCharacter } from '../storybook/runtime';
import { parseNodeStorybookJson, rpStorybookPhoneContactAllowed } from '../nodes/rp-storybook/model';
import type { ActionCatalog, ActionCatalogEntry, ActionScope, AssistantChatMessage, SocialApp } from './contracts';
import { prepareActionExecution, type JournalAdapter } from './runtime';

function socialUsername(character: StorybookCharacter, app: SocialApp): string {
  return (app === 'fotogram' ? character.social.fotogramUsername : character.social.onlyfriendsUsername).trim();
}

type Options = {
  scope: ActionScope;
  getNodes: () => WorkflowNode[];
  canGenerate: (character: StorybookCharacter) => boolean;
  generateImage: (character: StorybookCharacter, description: string) => Promise<ChatImageAttachment[]>;
  appendPhoneMessage: (message: ParsedPhoneMessage) => number;
  /** Creates a new text-only post from the character's own configured account. */
  postSocial: (character: StorybookCharacter, app: SocialApp, caption: string) => Promise<{ postId: string }>;
  /** Appends a comment to an existing post; must reject if the post no longer exists. */
  commentOnSocial: (character: StorybookCharacter, app: SocialApp, postId: string, text: string) => Promise<void>;
  /** Commits a bank transfer between the two characters' accounts. */
  transferFunds: (from: StorybookCharacter, to: StorybookCharacter, amount: number, note: string | undefined) => Promise<void>;
  /** Current bank balance for the catalog snapshot, so transfers can be re-validated. */
  bankBalanceForCharacter: (character: StorybookCharacter) => number;
  /** Creates a new phone Notes entry, or updates the owner's existing one when noteId is given. */
  writeNote: (owner: StorybookCharacter, title: string, body: string, noteId: string | undefined) => Promise<{ noteId: string }>;
  /** Creates and saves a new simulated ChatGPD conversation for the owner. */
  simulateAssistantChat: (owner: StorybookCharacter, messages: AssistantChatMessage[]) => Promise<{ chatId: string }>;
  /** Durable H7 effect journal. Optional so existing/test callers are unaffected. */
  journal?: JournalAdapter;
  signal?: AbortSignal;
};

export function createLiveActionBridge(options: Options) {
  const handles = new Map<string, string>();
  const handleFor = (kind: string, id: string) => {
    const key = `${kind}:${id}`;
    if (!handles.has(key)) handles.set(key, `${kind}_${handles.size + 1}`);
    return handles.get(key)!;
  };
  function snapshot() {
    const nodes = options.getNodes();
    const characters = storyCharactersFromNodes(nodes);
    // The current phone store keys conversations by normalized names.
    // Refuse ambiguous casts until that store also persists character IDs.
    const names = characters.map((character) => normalizePhoneName(character.name));
    if (new Set(names).size !== names.length) {
      throw new Error('Structured phone actions require unique character names in the current phone store.');
    }
    const entries: ActionCatalogEntry[] = [];
    const images = new Map<string, ChatImageAttachment>();
    const imageAccess = new Map<string, string[]>();
    const labels = new Map<string, string>();
    const base = { saveId: options.scope.saveId, branchId: options.scope.branchId, state: 'available' as const };
    for (const character of characters) {
      const node = nodes.find((candidate) => candidate.id === character.storybookNodeId);
      const storybook = parseNodeStorybookJson(node?.data.storybookJson);
      const allowedRecipientIds = characters.filter((other) => other.id !== character.id && other.storybookNodeId === character.storybookNodeId
        && storybook && rpStorybookPhoneContactAllowed(storybook, character.sourceId, other.sourceId)).map((other) => other.id);
      entries.push({ ...base, id: character.id, handle: handleFor('person', character.id), kind: 'character',
        capabilities: ['whatsup.send', 'whatsup.receive',
          ...(options.canGenerate(character) ? ['image.generate' as const] : []),
          ...(socialUsername(character, 'fotogram') ? ['fotogram.social' as const] : []),
          ...(socialUsername(character, 'onlyfriends') ? ['onlyfriends.social' as const] : [])],
        allowedRecipientIds,
        bankBalance: options.bankBalanceForCharacter(character),
      });
      labels.set(character.id, character.name);
      if (!node || !isStorybookSourceNode(node)) continue;
      for (const image of storybook?.characters.find((entry) => entry.id === character.sourceId)?.images ?? []) {
        if (!image.id || !image.dataUrl) continue;
        const existing = images.get(image.id);
        if (existing && existing.dataUrl !== image.dataUrl) throw new Error(`Conflicting image identity: ${image.id}.`);
        images.set(image.id, chatAttachmentFromStorybookImage(image));
        imageAccess.set(image.id, [...(imageAccess.get(image.id) ?? []), character.id]);
        labels.set(image.id, image.description || image.name || image.id);
      }
    }
    for (const [id, accessibleTo] of imageAccess) {
      entries.push({ ...base, id, handle: handleFor('image', id), kind: 'image', accessibleTo });
    }
    return { catalog: { scope: { ...options.scope }, entries }, characters, images, labels };
  }
  const getCatalog = (): ActionCatalog => snapshot().catalog;
  return {
    getCatalog,
    promptContext() {
      const current = snapshot();
      return JSON.stringify({ catalogId: options.scope.catalogId, entries: current.catalog.entries.map((entry) => ({
        handle: entry.handle, kind: entry.kind, label: current.labels.get(entry.id),
        ...(entry.kind === 'character' ? { capabilities: entry.capabilities, canMessage: entry.allowedRecipientIds?.map((id) => handleFor('person', id)) }
          : { accessibleTo: entry.accessibleTo.map((id) => handleFor('person', id)) }),
      })) });
    },
    async execute(input: unknown) {
      const prepared = prepareActionExecution(input, {
        scope: options.scope, getCatalog, allocateId: () => crypto.randomUUID(), signal: options.signal, journal: options.journal,
        adapters: {
          async generateImage(request) {
            const character = snapshot().characters.find((entry) => entry.id === request.ownerId);
            if (!character) throw new Error('Image owner disappeared.');
            const images = await options.generateImage(character, request.description);
            if (!images[0]) throw new Error('Image generation returned no artifact.');
            return { artifactId: images[0].id, ownerId: character.id };
          },
          async sendMessage(request) {
            const current = snapshot();
            const from = current.characters.find((entry) => entry.id === request.fromId);
            const to = current.characters.find((entry) => entry.id === request.toId);
            if (!from || !to) throw new Error('A message participant disappeared.');
            const image = request.artifactId ? current.images.get(request.artifactId) : undefined;
            if (request.artifactId && !image) throw new Error('Message image disappeared.');
            const messageId = options.appendPhoneMessage({ from: from.name, to: to.name, message: request.text,
              ...(image ? { imageId: image.id, imageDescription: image.description, imageAttachments: [image] } : {}),
              ...(request.isVoiceMessage ? { isVoiceMessage: true } : {}),
            });
            return { messageId, fromId: from.id, toId: to.id, text: request.text,
              ...(image ? { artifactId: image.id } : {}),
            };
          },
          async postSocial(request) {
            const character = snapshot().characters.find((entry) => entry.id === request.authorId);
            if (!character) throw new Error('Post author disappeared.');
            const { postId } = await options.postSocial(character, request.app, request.caption);
            return { postId, authorId: character.id, app: request.app };
          },
          async commentOnSocial(request) {
            const character = snapshot().characters.find((entry) => entry.id === request.authorId);
            if (!character) throw new Error('Comment author disappeared.');
            await options.commentOnSocial(character, request.app, request.postId, request.text);
            return { postId: request.postId, authorId: character.id, app: request.app, text: request.text };
          },
          async transferFunds(request) {
            const current = snapshot();
            const from = current.characters.find((entry) => entry.id === request.fromId);
            const to = current.characters.find((entry) => entry.id === request.toId);
            if (!from || !to) throw new Error('A transfer participant disappeared.');
            await options.transferFunds(from, to, request.amount, request.note);
            return { fromId: from.id, toId: to.id, amount: request.amount };
          },
          async writeNote(request) {
            const owner = snapshot().characters.find((entry) => entry.id === request.ownerId);
            if (!owner) throw new Error('Note owner disappeared.');
            const { noteId } = await options.writeNote(owner, request.title, request.body, request.noteId);
            return { noteId, ownerId: owner.id };
          },
          async simulateAssistantChat(request) {
            const owner = snapshot().characters.find((entry) => entry.id === request.ownerId);
            if (!owner) throw new Error('Assistant chat owner disappeared.');
            const { chatId } = await options.simulateAssistantChat(owner, request.messages);
            return { chatId, ownerId: owner.id };
          },
        },
      });
      if (!prepared.ok) throw new Error(prepared.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
      return prepared.execution.run();
    },
  };
}
