import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The simulated phone apps and registration/profile screens are
 * hand-recreated pixel-for-pixel from real prototypes and must never be
 * retheme'd. This guards against a future edit accidentally wiring a
 * `--theme-*` reference into any of their stylesheets. It does not (and
 * cannot) guard `src/styles.css`, since that file legitimately contains
 * both in-scope and out-of-scope rules interleaved — reviewers must still
 * check that any `--theme-*` addition there stays outside `.phone-`/`.pt-`/
 * `.social-profile-` selectors. */
const EXCLUDED_STYLESHEETS = [
  'src/styles/phone-device.css',
  'src/styles/phone-widgets.css',
  'src/components/phone-dating/phoneDating.css',
];

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
});
