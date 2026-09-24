import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The simulated phone apps and registration/profile screens are
 * hand-recreated pixel-for-pixel from real prototypes and must never be
 * retheme'd. This guards against a future edit accidentally wiring a
 * `--theme-*` reference into any of their stylesheets. */
const EXCLUDED_STYLESHEETS = [
  'src/components/phone-dating/phoneDating.css',
];

/** Files that legitimately mix in-scope and out-of-scope rules -- checked
 * with the brace-tracking scan below instead of a blanket "no --theme-*
 * anywhere" assertion. phone-device.css holds both the .phone-* simulated
 * app content (excluded) and the .roleplay-phone-* device bezel/casing
 * (in scope: it's chrome, not handcrafted content). */
const MIXED_STYLESHEETS = [
  'src/styles/phone-device.css',
  'src/styles.css',
];

const EXCLUDE_SELECTOR_RE = /\.phone-|\.pt-|\.social-profile-/;

/** Walks a CSS file tracking brace depth and whether the selector that
 * opened the current block matched an exclusion pattern; returns every
 * line inside an excluded block that references a --theme-* variable. */
function findThemeReferencesInExcludedBlocks(contents: string): string[] {
  const lines = contents.split('\n');
  const offenders: string[] = [];
  let pendingSelectorText = '';
  const excludedStack = [false];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    if (opens > 0) {
      pendingSelectorText += ' ' + line;
      const isExcluded = EXCLUDE_SELECTOR_RE.test(pendingSelectorText) || excludedStack[excludedStack.length - 1];
      for (let k = 0; k < opens; k++) excludedStack.push(isExcluded);
      pendingSelectorText = '';
    } else if (closes === 0) {
      pendingSelectorText += ' ' + line;
    }

    if (excludedStack[excludedStack.length - 1] && /--theme-/.test(line)) {
      offenders.push(`${i + 1}: ${line.trim()}`);
    }

    for (let k = 0; k < closes; k++) excludedStack.pop();
    if (excludedStack.length === 0) excludedStack.push(false);
  }
  return offenders;
}

describe('theming exclusion boundary', () => {
  it.each(EXCLUDED_STYLESHEETS)('%s never references a --theme-* variable', (relativePath) => {
    const contents = readFileSync(relativePath, 'utf8');
    expect(contents).not.toMatch(/--theme-/);
  });

  it('characterAppProfiles.css never themes its .social-profile-* registration rules', () => {
    const contents = readFileSync('src/components/characterAppProfiles.css', 'utf8');
    const socialProfileBlockMatch = contents.match(/\.social-profile-[\s\S]*$/);
    expect(socialProfileBlockMatch).not.toBeNull();
    expect(socialProfileBlockMatch?.[0]).not.toMatch(/--theme-/);
  });

  it.each(MIXED_STYLESHEETS)('%s never themes a .phone-/.pt-/.social-profile- rule', (relativePath) => {
    const contents = readFileSync(relativePath, 'utf8');
    const offenders = findThemeReferencesInExcludedBlocks(contents);
    expect(offenders).toEqual([]);
  });

  it('resets inherited Studio colors at the simulated-phone screen boundary', () => {
    const contents = readFileSync('src/styles/phone-device.css', 'utf8');
    const boundary = contents.match(/\.roleplay-phone-screen\s*\{([\s\S]*?)\}/)?.[1];

    expect(boundary).toBeDefined();
    expect(boundary).toContain('--phone-ui-text:');
    expect(boundary).toContain('--phone-ui-accent:');

    const inheritedStudioVariables = [
      '--accent',
      '--accent-light',
      '--surface',
      '--surface-alt',
      '--surface-soft',
      '--line',
      '--muted',
      '--soft-white',
      '--success',
      '--warning',
      '--danger',
      '--theme-primary',
      '--theme-primary-foreground',
      '--theme-panel',
      '--theme-card',
      '--theme-input',
      '--theme-muted-foreground',
      '--theme-border',
      '--theme-app-accent',
      '--theme-app-surface',
      '--theme-app-surface-alt',
      '--theme-app-line',
      '--theme-app-muted',
      '--theme-app-text',
      '--theme-app-dialog-bg',
      '--theme-app-dialog-border',
      '--theme-app-dialog-text',
    ];

    for (const variable of inheritedStudioVariables) {
      expect(boundary, `${variable} must be owned by the phone palette`).toMatch(
        new RegExp(`${variable}:\\s*var\\(--phone-ui-`),
      );
    }
  });
});
