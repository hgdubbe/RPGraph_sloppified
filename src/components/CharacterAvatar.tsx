import { gradientPhaseStyle } from '../chat/gradientPhase';
import { isNpcCharacterColor } from '../chat/characterColors';
import type { CSSProperties, ReactNode } from 'react';

type CharacterAvatarProps = {
  className: string;
  name: string;
  fallback: ReactNode;
  profileImageDataUrl?: string;
  style?: CSSProperties;
  ringColor?: string;
};

export function CharacterAvatar({
  className,
  name,
  fallback,
  profileImageDataUrl,
  style,
  ringColor,
}: CharacterAvatarProps) {
  const gradientColor = ringColor ?? style?.borderColor ?? 'var(--avatar-ring-default, currentColor)';
  const hasGradient = !isNpcCharacterColor(gradientColor);
  const avatarStyle = {
    ...style,
    ...gradientPhaseStyle(name),
    '--avatar-ring-color': gradientColor,
    borderColor: hasGradient ? `var(--avatar-ring-border, ${gradientColor})` : gradientColor,
  } as CSSProperties;
  return (
    <span className={`${className}${profileImageDataUrl ? ' has-profile-image' : ''}${hasGradient ? ' character-avatar-gradient' : ''}`} style={avatarStyle}>
      {profileImageDataUrl ? (
        <img src={profileImageDataUrl} alt={name ? `${name} profile` : 'Character profile'} />
      ) : (
        fallback
      )}
    </span>
  );
}
