import { migratedProfileName } from '../../characters/character';
import { useState } from 'react';
import { appAvatarDataUrl } from '../../characters/portrait';
import type { RpStorybookCharacterProfileImage } from '../../nodes/rp-storybook/model';
import type { CharacterAppAccount } from '../../characters/character';
import { profileIdentityError } from '../../characters/profiles';
import onlyFriendsBgUrl from '../../assets/social/onlyfriends/bg_of_reg.png';
import onlyFriendsLogoUrl from '../../assets/social/onlyfriends/logo_of.png';
import '../characterAppProfiles.css';

/** Shared by Character Setup and the phone apps. Images remain gallery references. */
export function SocialProfileEditor({ account, accountId, name, images, profileImage, locked, app = 'fotogram', onSave, onCancel }: {
  account?: CharacterAppAccount; accountId: string; name: string;
  app?: 'fotogram' | 'onlyfriends';
  profileImage?: RpStorybookCharacterProfileImage;
  images: Array<{ id: string; name: string; dataUrl: string }>;
  locked: boolean; onSave: (account: CharacterAppAccount) => boolean; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CharacterAppAccount>(() => ({
    ...account, accountId: account?.accountId ?? accountId, enabled: true,
    profileName: account ? migratedProfileName(account, name) : name, bio: account?.bio ?? '',
  }));
  const avatar = appAvatarDataUrl({ profileImage }, images.find((image) => image.id === draft.avatarImageId));
  const portrait = appAvatarDataUrl({ profileImage });
  const [error, setError] = useState('');
  const creating = !account?.enabled;
  const appName = app === 'fotogram' ? 'Photogram' : 'OnlyFriends';
  const isPrivate = draft.privacyMode === true;
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  return <form
    className={`social-profile-editor social-profile-editor--${app}`}
    style={app === 'onlyfriends' ? {
      backgroundImage: `linear-gradient(rgba(13, 7, 15, 0.45), rgba(13, 7, 15, 0.78) 55%, rgba(13, 7, 15, 0.94)), url(${onlyFriendsBgUrl})`,
    } : undefined}
    onSubmit={(event) => {
      event.preventDefault();
      const next = { ...draft, profileName: (draft.profileName ?? '').trim() };
      if (!next.profileName) { setError('Add a profile name for your profile.'); return; }
      const reason = profileIdentityError(account, next, locked);
      if (reason) { setError(reason); return; }
      if (!onSave(next)) setError('Could not save the profile. Please check the account identity and try again.');
    }}>
    {app === 'onlyfriends' && (
      <img className="social-profile-wordmark" src={onlyFriendsLogoUrl} alt="OnlyFriends, 18+" />
    )}
    {app === 'fotogram' && (
      <div className="social-profile-wordmark" aria-hidden="true">
        <span className="social-profile-wordmark-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none" /></svg>Photogram</span>
        <span className="social-profile-tag">Your world</span>
      </div>
    )}
    <header className="social-profile-heading">
      <span className="social-profile-eyebrow">
        {app === 'fotogram' ? (creating ? 'Create your profile' : 'Your profile') : `${appName} / ${creating ? 'Your debut' : 'Your profile'}`}
      </span>
      <h2>{app === 'fotogram' ? <>A little more <em>you.</em></> : creating ? 'Make yourself at home.' : 'A little more you.'}</h2>
      <p>{app === 'fotogram'
        ? (creating ? <>New face. Fresh feed. Your story.<br />Give your corner of Photogram a little life.</> : 'Give your profile a fresh look.')
        : <>{creating ? 'Set the scene for your first post.' : 'Give your profile a fresh look.'} Choose a photo, a display name, and a few words about yourself.</>}
      </p>
    </header>
    <section className="social-profile-preview" aria-label="Live profile preview">
      {app === 'fotogram' && <span className="social-profile-live-badge">Live preview</span>}
      <div className="social-profile-avatar">
        <span>{!isPrivate && avatar ? <img src={avatar} alt="Profile preview" /> : ((isPrivate ? draft.profileName : name) || '?').slice(0, 1).toUpperCase()}</span>
        {app === 'fotogram' && <span className="social-profile-plus-badge" aria-hidden="true">+</span>}
      </div>
      <div><span className="social-profile-eyebrow">Profile preview</span><h3>{isPrivate ? draft.profileName : (draft.profileName?.trim() || name)}</h3>
        {app === 'fotogram' && <div className="social-profile-handle">@{(draft.profileName ?? '').trim().replace(/^@/, '') || 'your.username'}</div>}
        <p>{draft.bio || 'Your story starts here.'}</p></div>
    </section>
    <section className="social-profile-section">
      {app === 'fotogram' ? <div className="social-profile-section-heading"><h3>The introduction</h3><span>Make it yours</span></div>
        : <h3><span aria-hidden="true">01</span> The essentials</h3>}
      <div className="social-profile-identity-row">
        <label>Profile name<input required maxLength={60} value={draft.profileName} onChange={(event) => setDraft({ ...draft, profileName: event.target.value })} placeholder="How you appear on your profile" /></label>
        <div className="social-profile-visibility-wrap">
          <label className="social-profile-visibility">
            <input type="checkbox" checked={isPrivate} onChange={(event) => setDraft({ ...draft, privacyMode: event.target.checked })} />
            <span>Privacy mode</span>
          </label>
          <div
            className={`social-profile-info-trigger${showPrivacyInfo ? ' active' : ''}`}
            tabIndex={0}
            role="button"
            aria-label="Privacy mode details"
            title="Privacy mode details"
            onClick={() => setShowPrivacyInfo((v) => !v)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShowPrivacyInfo((v) => !v); } }}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" />
              <line x1="8" y1="7.2" x2="8" y2="11.5" />
              <circle cx="8" cy="4.5" r="0.6" fill="currentColor" stroke="none" />
            </svg>
            <div className="social-profile-info-bubble" role="tooltip">
              When enabled, your character name and profile photo are hidden across this app, using only your profile name.
            </div>
          </div>
        </div>
      </div>
      <label>Bio{app === 'fotogram' && <span className="social-profile-optional"> · optional</span>}
        <textarea rows={4} maxLength={500} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} placeholder="A few words, a little personality…" />
        {app === 'fotogram'
          ? <div className="social-profile-field-foot"><span>A mood, a motto, or a little mystery.</span><span>{draft.bio.length} / 500</span></div>
          : <small className="social-profile-count">{draft.bio.length} / 500</small>}
      </label>
    </section>
    <section className="social-profile-section">
      {app === 'fotogram' ? (
        <div className="social-profile-section-heading">
          <h3>Put a face to the name</h3>
          <button type="button" className="social-profile-text-button" onClick={(event) => event.currentTarget.closest('form')?.querySelector('.social-profile-photos')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" /></svg>Upload
          </button>
        </div>
      ) : <h3><span aria-hidden="true">02</span> {app === 'onlyfriends' ? 'Choose your public teaser pic' : 'Your profile photo'}</h3>}
      {app !== 'fotogram' && <p>{app === 'onlyfriends' ? 'The one photo everyone sees before they unlock the rest.' : 'Choose your character portrait or a photo from your album.'}</p>}
      <div className="social-profile-photos">
        <button type="button" className="social-profile-photo" aria-pressed={!draft.avatarImageId} onClick={() => setDraft({ ...draft, avatarImageId: undefined })}>
          {portrait ? <img src={portrait} alt="Character portrait" /> : <span className="social-profile-photo-fallback">{name.slice(0, 1).toUpperCase()}</span>}
          {(app === 'fotogram' || !draft.avatarImageId) && <span className="social-profile-photo-check" aria-hidden="true">{!draft.avatarImageId ? '✓' : ''}</span>}
          <span>Portrait</span>
        </button>
        {images.map((image) => <button key={image.id} type="button" className="social-profile-photo" aria-pressed={draft.avatarImageId === image.id} onClick={() => setDraft({ ...draft, avatarImageId: image.id })}>
          <img src={image.dataUrl} alt={image.name || 'Album photo'} loading="lazy" />
          {(app === 'fotogram' || draft.avatarImageId === image.id) && <span className="social-profile-photo-check" aria-hidden="true">{draft.avatarImageId === image.id ? '✓' : ''}</span>}
          <span>{image.name || 'Album photo'}</span>
        </button>)}
      </div>
      {app === 'fotogram' && <p className="social-profile-album-note">Choose your character portrait or a photo from the album.</p>}
    </section>
    {error && <p className="social-profile-error" role="alert">{error}</p>}
    <footer className="social-profile-actions">
      <button type="button" className="social-profile-cancel" onClick={onCancel}>Cancel</button>
      <button className="social-profile-save" type="submit">
        {creating ? (app === 'onlyfriends' ? 'Join OnlyFriends' : app === 'fotogram' ? 'Create my profile' : 'Create profile') : 'Save changes'} <span aria-hidden="true">→</span>
      </button>
    </footer>
    {app === 'onlyfriends' && creating && <p className="social-profile-fineprint">You must be 18+ to use OnlyFriends.</p>}
    {app === 'fotogram' && creating && <p className="social-profile-fineprint">Your next chapter looks good on you.</p>}
  </form>;
}
