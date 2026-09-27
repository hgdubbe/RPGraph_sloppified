import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatImageAttachment } from '../types';
import {
  assertSelectedImageSize,
  encodedDataUrlBytes,
  normalizeImageAttachment,
  normalizeImageFile,
  type SelectedImageSource,
} from '../utils/imageNormalization';

type UseImageAttachmentsOptions = {
  createId: () => string;
  setDraftImages: Dispatch<SetStateAction<ChatImageAttachment[]>>;
  setPhoneImages: Dispatch<SetStateAction<ChatImageAttachment[]>>;
  draftImageInputRef: RefObject<HTMLInputElement | null>;
  phoneImageInputRef: RefObject<HTMLInputElement | null>;
  onError: (error: unknown) => void;
};

export function useImageAttachments({
  createId,
  setDraftImages,
  setPhoneImages,
  draftImageInputRef,
  phoneImageInputRef,
  onError,
}: UseImageAttachmentsOptions) {
  async function readImageAttachmentSource(source: SelectedImageSource): Promise<ChatImageAttachment> {
    return normalizeImageAttachment(source, createId);
  }

  async function readImageAttachment(file: File): Promise<ChatImageAttachment> {
    assertSelectedImageSize({
      name: file.name,
      size: file.size,
    });
    return normalizeImageFile(file, createId);
  }

  async function addDraftImages(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const images = Array.from(files);
    if (images.length === 0) {
      return;
    }
    try {
      const attachments = await Promise.all(images.map(readImageAttachment));
      setDraftImages((current) => [...current, ...attachments]);
    } catch (error) {
      onError(error);
    }
  }

  async function addPhoneImages(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const image = files.item(0);
    if (!image) {
      return;
    }
    try {
      const attachment = await readImageAttachment(image);
      setPhoneImages([attachment]);
    } catch (error) {
      onError(error);
    }
  }

  async function selectDraftImages() {
    try {
      const result = await window.rpgraph.selectImages(true);
      if (result.canceled || result.images.length === 0) {
        return;
      }
      const attachments = await Promise.all(result.images.map(readImageAttachmentSource));
      setDraftImages((current) => [...current, ...attachments]);
    } catch (error) {
      onError(error);
      draftImageInputRef.current?.click();
    }
  }

  async function addGeneratedImageToDraft(dataUrl: string) {
    try {
      const mimeType = /^data:([^;]+);base64,/.exec(dataUrl)?.[1] ?? 'image/png';
      const attachment = await readImageAttachmentSource({
        name: `generated-image.${mimeType.split('/')[1] ?? 'png'}`,
        mimeType,
        size: encodedDataUrlBytes(dataUrl),
        dataUrl,
      });
      setDraftImages((current) => [...current, attachment]);
    } catch (error) {
      onError(error);
    }
  }

  async function selectPhoneImages() {
    try {
      const result = await window.rpgraph.selectImages(false);
      if (result.canceled || result.images.length === 0) {
        return;
      }
      const attachment = await readImageAttachmentSource(result.images[0]!);
      setPhoneImages([attachment]);
    } catch (error) {
      onError(error);
      phoneImageInputRef.current?.click();
    }
  }

  return {
    addDraftImages,
    addPhoneImages,
    addGeneratedImageToDraft,
    selectDraftImages,
    selectPhoneImages,
  };
}
