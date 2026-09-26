import type { ReactNode } from 'react';

export type PhoneAppSwitcherAppId =
  | 'whatsup'
  | 'fotogram'
  | 'onlyfriends'
  | 'plottwist'
  | 'ai'
  | 'banking'
  | 'notes'
  | 'gallery'
  | 'camera';

type PhoneAppSwitcherCounts = {
  whatsup: number;
  banking: number;
  matchme: number;
  notes: number;
  ai: number;
  fotogram: number;
  onlyfriends: number;
};

type PhoneAppSwitcherStripProps = {
  activeApp?: PhoneAppSwitcherAppId;
  counts: PhoneAppSwitcherCounts;
  onSelectApp: (app: PhoneAppSwitcherAppId) => void;
};

function desktopBadgeLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

// Reuses the desktop icon grid's own SVG glyphs and `.phone-desktop-dock-app`
// button class (not a new class) so the existing `.phone-desktop-dock-app >
// .phone-X-icon` theme compound selectors in phone-widgets.css keep coloring
// these icons — see PHONE-HOME-THEME-INTERNALS.md's icon-collision gotcha.
const SWITCHER_APPS: ReadonlyArray<{
  id: PhoneAppSwitcherAppId;
  label: string;
  iconClassName: string;
  countKey: keyof PhoneAppSwitcherCounts | null;
  badgeVariant?: 'banking';
  icon: ReactNode;
}> = [
  {
    id: 'whatsup', label: 'WhatsUp', iconClassName: 'phone-whatsup-icon', countKey: 'whatsup',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18.8 5.2A8.9 8.9 0 0 0 4.7 15.9L3.4 20.4l4.7-1.2A8.9 8.9 0 1 0 18.8 5.2Z" />
      </svg>
    ),
  },
  {
    id: 'fotogram', label: 'Fotogram', iconClassName: 'phone-fotogram-icon', countKey: 'fotogram',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="1" />
      </svg>
    ),
  },
  {
    id: 'onlyfriends', label: 'OnlyFriends', iconClassName: 'phone-onlyfriends-icon', countKey: 'onlyfriends',
    icon: <span className="phone-onlyfriends-monogram">OF</span>,
  },
  {
    id: 'plottwist', label: 'MatchMe', iconClassName: 'phone-matchme-icon', countKey: 'matchme',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 13.5c1.2-1.3 1.8-2.7 1.8-3.9A4.1 4.1 0 0 0 12 6.9a4.1 4.1 0 0 0-8.8 2.7c0 1.2.6 2.6 1.8 3.9l7 6.8Z" />
      </svg>
    ),
  },
  { id: 'ai', label: 'ChatGPD', iconClassName: 'phone-chatgpd-icon', countKey: 'ai', icon: 'AI' },
  {
    id: 'banking', label: 'Banking', iconClassName: 'phone-banking-icon', countKey: 'banking', badgeVariant: 'banking',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9 12 4l9 5" />
        <path d="M4 9h16" />
        <path d="M6 11v7M10 11v7M14 11v7M18 11v7" />
        <path d="M3 20h18" />
      </svg>
    ),
  },
  {
    id: 'notes', label: 'Notes', iconClassName: 'phone-notes-icon', countKey: 'notes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M15 3v4h4" />
        <path d="M8 11h8M8 15h8M8 19h5" />
      </svg>
    ),
  },
  {
    id: 'gallery', label: 'Gallery', iconClassName: 'phone-gallery-icon', countKey: null,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8.5" cy="8.5" r="1.4" />
        <path d="m4.5 18 5.5-5.5 3.2 3.2 2.1-2.1 4.2 4.4" />
      </svg>
    ),
  },
  {
    id: 'camera', label: 'Camera', iconClassName: 'phone-camera-icon', countKey: null,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h3l1.2-2h7.6L17 7h3a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
];

export function PhoneAppSwitcherStrip({ activeApp, counts, onSelectApp }: PhoneAppSwitcherStripProps) {
  return (
    <div className="phone-app-switcher-strip" aria-label="App switcher">
      {SWITCHER_APPS.map((app) => {
        const badgeCount = app.countKey ? counts[app.countKey] : 0;
        return (
          <button
            key={app.id}
            type="button"
            className={`phone-desktop-dock-app${activeApp === app.id ? ' active' : ''}`}
            onClick={() => onSelectApp(app.id)}
            aria-label={badgeCount > 0 ? `Open ${app.label}, ${badgeCount} new` : `Open ${app.label}`}
            aria-current={activeApp === app.id ? 'true' : undefined}
          >
            <span className={app.iconClassName} aria-hidden="true">{app.icon}</span>
            {badgeCount > 0 && (
              <span
                className={`phone-desktop-app-badge${app.badgeVariant ? ` ${app.badgeVariant}` : ''}`}
                aria-hidden="true"
              >
                {desktopBadgeLabel(badgeCount)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
