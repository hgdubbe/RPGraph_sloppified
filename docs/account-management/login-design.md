# Account entry design

Status: implemented in `src/accounts/AccountLogin.tsx` and `accounts.css`, using bundled artwork and the existing application logo/native wordmark. User-approved direction on 2026-09-27: illustrated split screen, common roleplay imagery and graph workflows. On 2026-09-30 the user supplied replacement phone/conversation artwork and requested matching the existing application style. No private previews before login. Built Windows desktop entry and account switching have been tested; other platform release checks remain outstanding.

### Current artwork provenance

`src/assets/account-login-artwork.png` is an AI-assisted adaptation of the illustration supplied by the user on 2026-09-30. The built-in image-editing tool retained the phone, five portraits, conversation cards and notification motifs, adjusted colors to navy/slate/lavender/teal, added graph-like connector sockets, and reframed it for the right-hand login pane. It contains no account-specific content, baked-in logo or login controls and is bundled locally with no network dependency. The supplied reference is preserved outside the repository. Upstream redistribution should confirm rights to the supplied source; this record does not assert a verified source license.

Edit prompt: preserve the supplied subjects and editorial illustration style; match dark navy `#111923`–`#172733`, slate `#1b2633`, lavender `#c4b5fd`, pale blue and muted teal, retaining warm portraits; reframe as tall right-pane artwork with clear upper space for separate copy; no text, logo, form, watermark or additional subjects. The complete illustrative prompt was submitted through the built-in image tool, not the API/CLI fallback.

## Current-product research

The following live entry screens were inspected on 2026-09-27. These are observations of current pages, not claims that their designs were first released in 2026.

| Reference | Observed principle | Apply to RPGraph |
| --- | --- | --- |
| [NovelAI login](https://novelai.net/login) | Compact labeled form beside atmospheric illustrated scenery; strong separation between artwork and authentication | Give the login one clear task; use illustration to establish creative mood without putting content behind the form. |
| [AI Dungeon sign-in](https://play.aidungeon.com/signin?redirect=%2Fdiscover) | Restrained dark panel, prominent heading, clear field hierarchy and warm primary action | Quiet form surface, one dominant submit button and immediate inline errors. |
| [Character.AI](https://character.ai/) | Large visual storytelling area paired with a compact rounded entry panel | Communicate roleplay visually, while keeping account actions compact and legible. |

Do not copy their social/email login mechanisms, marketing promises, remembered sessions, subscription UI or proprietary artwork. This is a local account chooser and unlock screen, not a web signup funnel.

## Art direction: stories connected by graphs

Current desktop composition follows the user's second reference supplied on 2026-09-30: equal-width artwork-left / form-right panes, a compact centered form, quiet dark surfaces and small link-style secondary actions. The previously approved phone/character artwork remains bundled; a public caption card sits above it. RPgraph's actual logo/native wordmark remains above the form. The reference's testimonial, email signup and forgotten-password recovery were not copied: these are local profiles without password reset. Below 800px the decorative artwork is hidden so controls retain enough space.

Use the real bundled app mark from `src/assets/app-icon-transparent.png` (or the appropriate existing high-resolution app icon). Preserve the exact window-bar branding: `RPgraph Studio`, with the `RP` treatment and native wordmark styling from `src/App.tsx:6408` and `.brand-name` / `.brand-name-rp` in `src/styles.css:338`. Extract a shared branding component if needed so login and the existing bar cannot drift. Do not invent a replacement logo, change capitalization, or introduce a competing display font for the wordmark. Keep the existing bundled Ubuntu Sans for controls.

The illustration is public shipped art with documented provenance/license. Never select an account's avatar, generated image, theme, last story, or last graph for the locked screen. No external font, image, analytics, or thumbnail request is needed to show login. If artwork is unavailable, a bundled graph-pattern fallback still provides a complete layout; don't delay account access for asset loading.

## Layout and copy

Brand appears above the form, with heading “Your stories, your space.” Supporting text: “Choose a local account to continue.” Avoid a wall of security copy.

Form order:

1. Public account alias selector with text protection indicator; no private counts or thumbnails.
2. For a passworded profile: visible “Password” label, show/hide control with accessible name, inline validation, submit “Unlock & enter”. Allow Enter, paste and password-manager autofill. Default shared account has a visible “Shared default — password: default. Not private.” notice.
3. For a passwordless profile: no dummy password field; submit “Enter account” and “This account is not encrypted.”
4. Secondary “Create account” and “Import account” actions, then a short “Accounts stay on this computer” explanation linking to the actual protection limitations.

Creation uses a focused form: public alias, protection choice, password/confirmation when enabled, concise forgotten-password warning, Create. No email, online identity, NSFW/SFW classification, security questions, or arbitrary password-composition puzzle. Let the user choose a strong passphrase; do not silently trim or normalize passwords.

Wrong password or failed authentication shows a neutral inline error and no content. Unsupported/corrupted formats get a distinct actionable error without file contents. Unlock shows a bounded progress state and disables duplicate submissions; a failure restores keyboard focus. Never display a success animation containing account data before the authenticated session is ready.

After unlock, the separate, fully themed recovery dialog controls restoring a prior workspace. Declining it opens a blank workspace. On lock/switch, return to the same neutral screen with no flash of the old account. “Forgot password?” is not a recovery action unless recovery actually exists; provide an honest help link instead.

## Account settings and autosave

Always-visible navigation entries: “Account” and “Autosave & Recovery”. Account shows protection state, change/add/remove password, export, lock/switch and delete where allowed. The shared default explains its fixed credentials and offers creating a private account, not a misleading strengthen-default button.

Autosave has an on/off control, current protection status, recovery settings and explanation of retained snapshots. Account encryption applies automatically; users should not need to enable separate autosave encryption. A protected account never offers a plaintext autosave checkbox. Account archive exports inherit protection and do not request the password again during the unlocked session; changing/removing protection and destructive operations do reauthenticate.

## Responsive, accessible and themed

Below the width needed for a comfortable form, stack or crop the illustration into a short decorative header; never squeeze fields to preserve art. Test 320 CSS px width, 200% zoom, keyboard-only use, screen readers, long public aliases and translated strings. Form remains primary in DOM order; decorative art and graph wires are hidden from accessibility APIs. Provide visible focus, 44px preferred targets, sufficient contrast (4.5:1 normal text), and errors associated with fields rather than color alone.

Respect reduced motion; keep art static by default. Reuse semantic theme roles for surfaces, text, borders, input, focus, primary/secondary actions and warnings. Pre-login uses an installation-bundled neutral palette; account custom theme is applied only after unlock. Verify dialogs, disabled states, password visibility controls and validation in light/dark themes, including the currently partly unthemed recovery surfaces.

Authentication must support password managers and copy/paste rather than memory tests, consistent with [WCAG accessible authentication guidance](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html).

## Visual acceptance

Capture synthetic-profile screenshots of wide, narrow, passworded, passwordless, default, invalid-password, loading, create, import and recovery states in the packaged app. Compare branding directly with the window bar. Ensure no private user content or real account alias appears in test captures or the PR. A mockup or browser-only screenshot is not evidence that the desktop startup privacy boundary works.
