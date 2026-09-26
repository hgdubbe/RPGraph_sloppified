import { createPortal } from 'react-dom';
import { useContext, useEffect, useRef, useState } from 'react';
import { PhoneStatusTrayContext } from './RoleplayPhoneDevice';
import { phoneMoodStatuses, type PhoneMoodStatusId } from '../phone/moodStatus';

type PhoneAppTopStripProps = {
  currentAppLabel: string;
  onHome: () => void;
  onBack: () => void;
  phoneMoodStatus: PhoneMoodStatusId;
  onPhoneMoodStatusChange: (value: PhoneMoodStatusId) => void;
};

// Persistent phone chrome: unlike the settings-tray icons (still portaled
// into the hardware status bar's own tray slot), Home/Back/label/mood live
// here because they need to render identically from every screen, not just
// the desktop — so this strip owns its own open state and click-outside
// handling instead of sharing PhonePanel's desktop-settings-only versions.
export function PhoneAppTopStrip({
  currentAppLabel,
  onHome,
  onBack,
  phoneMoodStatus,
  onPhoneMoodStatusChange,
}: PhoneAppTopStripProps) {
  const phoneTray = useContext(PhoneStatusTrayContext);
  const [moodOpen, setMoodOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedMoodStatus = phoneMoodStatuses.find((option) => option.id === phoneMoodStatus)
    ?? phoneMoodStatuses[0];

  useEffect(() => {
    if (!moodOpen) {
      return;
    }
    const closeMenu = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !buttonRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setMoodOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [moodOpen]);

  return (
    <div className="phone-app-top-strip">
      <button type="button" className="phone-app-top-strip-nav-button" onClick={onHome} aria-label="Phone home" title="Home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
        </svg>
      </button>
      <button type="button" className="phone-app-top-strip-nav-button" onClick={onBack} aria-label="Back" title="Back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      <span className="phone-app-top-strip-label">{currentAppLabel}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`phone-mood-status-button${selectedMoodStatus.id === 'online' ? ' online' : ''}`}
        onClick={() => setMoodOpen((open) => !open)}
        aria-label={`Phone status: ${selectedMoodStatus.label}`}
        aria-expanded={moodOpen}
        title={`Phone status: ${selectedMoodStatus.label}`}
      >
        {selectedMoodStatus.id === 'online' ? (
          <span className="phone-mood-status-dot" aria-hidden="true" />
        ) : (
          <span aria-hidden="true">{selectedMoodStatus.symbol}</span>
        )}
      </button>
      {moodOpen && phoneTray.overlay ? createPortal(
        <div className="phone-app-top-strip-tray" ref={menuRef}>
          <div className="phone-mood-status-menu phone-app-top-strip-menu" role="menu" aria-label="Phone status">
            {phoneMoodStatuses.map((option) => (
              <button
                className={`phone-mood-status-option${option.id === selectedMoodStatus.id ? ' active' : ''}`}
                type="button"
                key={option.id}
                onClick={() => {
                  onPhoneMoodStatusChange(option.id);
                  setMoodOpen(false);
                }}
                role="menuitemradio"
                aria-checked={option.id === selectedMoodStatus.id}
              >
                <span className="phone-mood-status-option-symbol" aria-hidden="true">
                  {option.id === 'online' ? <span className="phone-mood-status-dot" /> : option.symbol}
                </span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>,
        phoneTray.overlay,
      ) : null}
    </div>
  );
}
