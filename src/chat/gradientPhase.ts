import { Children, isValidElement, type CSSProperties, type ReactNode } from 'react';

function visibleText(node: ReactNode): string {
  return Children.toArray(node).map((child): string => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (!isValidElement<{ text?: string; children?: ReactNode }>(child)) return '';
    return child.props.text ?? visibleText(child.props.children);
  }).join('');
}

/** Stable variation without timers or fresh randomness during rendering. */
export function gradientPhaseStyle(content: ReactNode): CSSProperties {
  const text = visibleText(content);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  const phase = 0.12 + ((hash >>> 0) % 801) / 10000;
  return {
    '--gradient-phase': phase,
    '--character-gradient-position': `${phase * 200}%`,
  } as CSSProperties;
}
