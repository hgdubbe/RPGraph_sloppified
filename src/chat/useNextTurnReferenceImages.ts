import { useStorybookContentNodes } from '../storybook/useStorybookContentNodes';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChatImageAttachment, MessageRecord, WorkflowNode } from '../types';
import {
  collectRecentReferenceImages,
  type ReferenceImageOptions,
} from './referenceImages';

function messageImageIds(message?: MessageRecord) {
  const phoneImageIds = message?.phoneImageIds
    ?.map((imageId) => imageId.trim())
    .filter(Boolean);
  if (phoneImageIds?.length) {
    return phoneImageIds;
  }
  return message?.imageAttachments
    ?.map((image) => image.id.trim())
    .filter(Boolean) ?? [];
}

function uniqueImageIds(...groups: string[][]) {
  return [...new Set(groups.flat().map((imageId) => imageId.trim()).filter(Boolean))];
}

export function useNextTurnReferenceImages({
  messages,
  nodes,
  options,
  replyToMessage,
}: {
  messages: MessageRecord[];
  nodes: WorkflowNode[];
  options: ReferenceImageOptions;
  replyToMessage?: MessageRecord;
}) {
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const selectedImageIdsRef = useRef<string[]>([]);

  const updateSelectedImageIds = useCallback((update: (current: string[]) => string[]) => {
    const next = update(selectedImageIdsRef.current);
    selectedImageIdsRef.current = next;
    setSelectedImageIds(next);
  }, []);

  const toggleSelectedImage = useCallback((image: ChatImageAttachment) => {
    if (!options.enabled) {
      return;
    }
    const imageId = image.id.trim();
    if (!imageId) {
      return;
    }
    updateSelectedImageIds((current) =>
      current.includes(imageId)
        ? current.filter((entry) => entry !== imageId)
        : [...current, imageId],
    );
  }, [options.enabled, updateSelectedImageIds]);

  const clearSelectedImages = useCallback(() => {
    selectedImageIdsRef.current = [];
    setSelectedImageIds([]);
  }, []);

  const retainMessageImages = useCallback((message?: MessageRecord) => {
    if (!options.enabled) {
      return;
    }
    const imageIds = messageImageIds(message);
    if (imageIds.length > 0) {
      updateSelectedImageIds((current) => uniqueImageIds(current, imageIds));
    }
  }, [options.enabled, updateSelectedImageIds]);

  const additionalImageIds = useMemo(
    () => options.enabled
      ? uniqueImageIds(selectedImageIds, messageImageIds(replyToMessage))
      : [],
    [options.enabled, replyToMessage, selectedImageIds],
  );
  const nextTurnOptions = useMemo(
    () => ({ ...options, additionalImageIds }),
    [additionalImageIds, options],
  );
  const storybookContentNodes = useStorybookContentNodes(nodes);
  const contextualImageIds = useMemo(
    () => new Set(
      collectRecentReferenceImages({ messages, nodes: storybookContentNodes, options: nextTurnOptions })
        .map((reference) => reference.imageId)
        .filter(Boolean),
    ),
    [messages, nextTurnOptions, storybookContentNodes],
  );
  const selectedImageIdSet = useMemo(() => new Set(selectedImageIds), [selectedImageIds]);

  const optionsForRun = useCallback((replyMessage?: MessageRecord): ReferenceImageOptions => ({
    ...options,
    additionalImageIds: options.enabled
      ? uniqueImageIds(
          selectedImageIdsRef.current,
          messageImageIds(replyMessage),
        )
      : [],
  }), [options]);

  return {
    contextualImageIds,
    selectedImageIds: selectedImageIdSet,
    nextTurnOptions,
    optionsForRun,
    toggleSelectedImage,
    retainMessageImages,
    clearSelectedImages,
  };
}
