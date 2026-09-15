export type RoleplayActivityShortcutId =
  | 'last-chat'
  | 'last-message'
  | 'last-post'
  | 'last-picture';

export type RoleplayActivityShortcutIconKind =
  | 'chat'
  | 'messages'
  | 'social'
  | 'gallery';

export function roleplayActivityShortcutIconKind(
  id: RoleplayActivityShortcutId,
): RoleplayActivityShortcutIconKind {
  switch (id) {
    case 'last-message':
      return 'messages';
    case 'last-post':
      return 'social';
    case 'last-picture':
      return 'gallery';
    case 'last-chat':
    default:
      return 'chat';
  }
}
