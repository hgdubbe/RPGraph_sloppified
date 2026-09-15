export declare const currentCharacterContainerVersion: string;
export declare function validateCharacterContainer(value: unknown): unknown;
export declare function validateCharacterPayload(value: unknown): unknown;
export declare function validateCharacterRelationships(value: unknown, ownerId: string): void;

declare const _default: {
  currentCharacterContainerVersion: string;
  validateCharacterRelationships: typeof validateCharacterRelationships;
  validateCharacterContainer: typeof validateCharacterContainer;
  validateCharacterPayload: typeof validateCharacterPayload;
};
export default _default;
