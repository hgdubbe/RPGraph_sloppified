export const phoneMoodStatuses = [
  { id: 'online', label: 'Online', symbol: '', monoSymbol: '' },
  { id: 'happy', label: 'Happy', symbol: '🙂', monoSymbol: '☺' },
  { id: 'excited', label: 'Excited', symbol: '😄', monoSymbol: '☻' },
  { id: 'amused', label: 'Amused', symbol: '😂', monoSymbol: '〃' },
  { id: 'wild', label: 'Wild', symbol: '😵', monoSymbol: '※' },
  { id: 'playful', label: 'Playful', symbol: '😜', monoSymbol: '♪' },
  { id: 'flirty', label: 'Flirty', symbol: '😉', monoSymbol: '♡' },
  { id: 'horny', label: 'Thirsty', symbol: '💦', monoSymbol: '⋯' },
  { id: 'devilish', label: 'Devilish', symbol: '😈', monoSymbol: '♆' },
  { id: 'flustered', label: 'Flustered', symbol: '😳', monoSymbol: '!' },
  { id: 'anxious', label: 'Anxious', symbol: '😟', monoSymbol: '?' },
  { id: 'sad', label: 'Sad', symbol: '😔', monoSymbol: '☹' },
  { id: 'annoyed', label: 'Annoyed', symbol: '😒', monoSymbol: '⌁' },
  { id: 'angry', label: 'Angry', symbol: '😠', monoSymbol: '!' },
  { id: 'furious', label: 'Furious', symbol: '🤬', monoSymbol: '‼' },
  { id: 'tired', label: 'Tired', symbol: '😴', monoSymbol: '☾' },
] as const;

export type PhoneMoodStatusId = (typeof phoneMoodStatuses)[number]['id'];

const phoneMoodStatusIds = new Set<string>(phoneMoodStatuses.map((status) => status.id));

const phoneMoodStatusContext: Record<Exclude<PhoneMoodStatusId, 'online'>, string> = {
  happy: 'Phone status context: the sender is currently showing a happy mood.',
  excited: 'Phone status context: the sender is currently showing an excited mood.',
  amused: 'Phone status context: the sender is currently showing an amused or laughing mood.',
  wild: 'Phone status context: the sender is currently showing a chaotic, overwhelmed, or overstimulated mood.',
  playful: 'Phone status context: the sender is currently showing a playful, teasing mood.',
  flirty: 'Phone status context: the sender is currently showing a flirty mood.',
  horny: 'Phone status context: the sender is currently showing a thirsty or sexually charged mood.',
  devilish: 'Phone status context: the sender is currently showing a mischievous, provocative mood.',
  flustered: 'Phone status context: the sender is currently showing a flustered or embarrassed mood.',
  annoyed: 'Phone status context: the sender is currently showing an annoyed mood.',
  sad: 'Phone status context: the sender is currently showing a sad mood.',
  angry: 'Phone status context: the sender is currently showing an angry mood.',
  furious: 'Phone status context: the sender is currently showing a furious mood.',
  anxious: 'Phone status context: the sender is currently showing an anxious mood.',
  tired: 'Phone status context: the sender is currently showing a tired mood.',
};

export function isPhoneMoodStatusId(value: string): value is PhoneMoodStatusId {
  return phoneMoodStatusIds.has(value);
}

export function phoneMoodContext(id: PhoneMoodStatusId): string {
  return id === 'online' ? '' : phoneMoodStatusContext[id];
}
