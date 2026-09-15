export const studioThemeStorageKey = 'rpgraph.studioTheme' as const;

export const studioThemes = [
  { id: 'studio-night', label: 'Studio Night' },
  { id: 'iphone-noir', label: 'iPhone Noir' },
  { id: 'neon-social', label: 'Neon Social' },
  { id: 'rainy-window', label: 'Rainy Window' },
  { id: 'kawaii-dream', label: 'Kawaii Dream' },
  { id: 'terminal-green', label: 'Terminal Green' },
  { id: 'cute-girly', label: 'Cute Girly' },
  { id: 'goth', label: 'Goth' },
  { id: 'hardcore', label: 'Hardcore' },
  { id: 'normal-guy', label: 'Normal Guy' },
] as const;

export type StudioTheme = (typeof studioThemes)[number]['id'];

export function isStudioTheme(value: unknown): value is StudioTheme {
  return typeof value === 'string' && studioThemes.some((theme) => theme.id === value);
}

export function studioThemeLabel(themeId: StudioTheme): string {
  return studioThemes.find((theme) => theme.id === themeId)?.label ?? 'Studio Night';
}
