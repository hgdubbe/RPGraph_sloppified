import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PhoneHomeThemeManifest } from '../app/phoneHomeThemeTokens';
import { useAppliedPhoneHomeTheme } from '../app/useAppliedPhoneHomeTheme';

export type PhoneStatusTray = {
  // Small inline slot inside the status bar, next to the battery readout —
  // for tap targets that belong in the system tray (mood, quick settings).
  icons: HTMLElement | null;
  // Full-device layer above everything (including the glass overlay) — for
  // the dropdown panels those tray icons open, so they're never clipped or
  // occluded by whichever app screen happens to be open underneath.
  overlay: HTMLElement | null;
};

export const PhoneStatusTrayContext = createContext<PhoneStatusTray>({ icons: null, overlay: null });

// Lay out apps at a stable handset resolution, then scale the whole device.
export function RoleplayPhoneDevice({
  children, owner, onHome, onFocus, orientation = 'portrait', phoneHomeThemeId, phoneHomeThemeManifests,
}: {
  children: ReactNode;
  owner: string;
  onHome: () => void;
  onFocus: () => void;
  orientation?: 'portrait' | 'landscape';
  // The phone's own OS-chrome theme — its own manifest-driven engine (see
  // src/app/phoneHomeTheme{Tokens,Resolver,Registry}.ts and
  // useAppliedPhoneHomeTheme.ts), deliberately independent of the Studio
  // theme registry/resolver.
  phoneHomeThemeId: string;
  phoneHomeThemeManifests: PhoneHomeThemeManifest[];
}) {
  const stage = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  useAppliedPhoneHomeTheme(deviceRef, phoneHomeThemeId, phoneHomeThemeManifests);
  const [scale, setScale] = useState(1);
  const isLandscape = orientation === 'landscape';
  const designWidth = isLandscape ? 932 : 430;
  const designHeight = isLandscape ? 430 : 932;
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.max(0.1, Math.min(entry.contentRect.width / designWidth, entry.contentRect.height / designHeight)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [designHeight, designWidth]);
  const trayIconsRef = useRef<HTMLSpanElement>(null);
  const trayOverlayRef = useRef<HTMLDivElement>(null);
  const [tray, setTray] = useState<PhoneStatusTray>({ icons: null, overlay: null });
  useLayoutEffect(() => {
    setTray({ icons: trayIconsRef.current, overlay: trayOverlayRef.current });
  }, []);
  return (
    <div className={`roleplay-phone-stage ${isLandscape ? 'landscape' : 'portrait'}`} ref={stage}>
      <div style={{ width: designWidth * scale, height: designHeight * scale }}>
        <div className={`roleplay-phone-device ${isLandscape ? 'landscape' : 'portrait'}`} aria-label={`${owner}'s phone`}
          ref={deviceRef}
          style={{ width: designWidth, height: designHeight, transform: `scale(${scale})` }} onFocusCapture={onFocus}>
          <div className="roleplay-phone-status">
            <span aria-hidden="true">5G</span>
            <i aria-hidden="true" />
            <span className="roleplay-phone-status-tray">
              <span className="roleplay-phone-status-tray-icons" ref={trayIconsRef} />
              <span className="roleplay-phone-status-battery" aria-hidden="true">100%</span>
            </span>
          </div>
          <div className="roleplay-phone-screen">
            <PhoneStatusTrayContext.Provider value={tray}>
              {children}
            </PhoneStatusTrayContext.Provider>
          </div>
          <div className="roleplay-phone-overlay-layer" ref={trayOverlayRef} />
          <button type="button" className="roleplay-phone-home" aria-label="Phone home" onClick={onHome}><span /></button>
        </div>
      </div>
    </div>
  );
}
