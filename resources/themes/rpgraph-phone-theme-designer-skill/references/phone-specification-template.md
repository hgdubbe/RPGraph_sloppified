# RPGraph Phone Theme Specification Template

Produce a self-contained implementation prompt. Omit unsupported or irrelevant sections, but never omit material constraints or unknowns.

## 1. Objective and scope

- RPGraph repository/version/commit state, if known.
- Target theme: existing `<id>/theme.json` this block will be added/merged into, or a note that a new theme is being created alongside this work (in which case the base-theme fields are the other skill's responsibility, not repeated here).
- In-scope namespaces: which of `phoneHome`, `phoneNotes`, `phoneChatgpd`, `phoneBanking`, `phoneGallery`, `phoneSocial` (and, if `phoneSocial`, which brand(s)). Out-of-scope namespaces stay at their shipped default — say so explicitly rather than leaving it implied.
- Current stage: **concept specified; no theme block written**.

## 2. Visual thesis

Write one or two sentences per in-scope app (not one sentence for "the phone" as a whole, unless the user explicitly wants one identical mood everywhere). Add anti-patterns per app where they diverge from a shared thesis.

## 3. Native token mapping

Use actual dotted keys verified in the current checkout, grouped by namespace.

| Namespace | Key | Proposed value | Role and intended result | Source of decision | Validation surface |
| --- | --- | --- | --- | --- | --- |
| `phoneHome` | `phoneHome.accent` | Exact CSS value | Clock/widget/badge accent, mood-status highlight | User choice / proposed default | Home screen |
| `phoneNotes` | `phoneNotes.tintSand` | `"R, G, B"` bare triplet | One of 8 sticky-note tints | User choice / proposed default | Notes app, that tint's note card |

Omit a namespace's row block entirely if it is out of scope. For `phoneNotes` tints, list all 8 leaves even if only some change, so the full palette reads as one coherent set. For `phoneSocial`, split the table into "shared chrome" and "Fotogram brand" / "OnlyFriends brand" sub-groups matching the capability map.

Do not present explanatory aliases as native keys. If aliases help reasoning (e.g. "clock accent" for `phoneHome.accent`), put them in a separate "design roles" table and map each to the real key.

## 4. Themeable phone surfaces and states

Describe only current surfaces proven in `PhonePanel.tsx`/the relevant CSS file, per in-scope app:

- `phoneHome`: wallpaper scrim, clock widget (default/hover/active), desktop widget cards (default/hover/active, including the narrative widget's ready-to-send state), app-icon label text, notification badges (`badge` vs. `badgeBanking`), the mood-status dot, the bottom favorites dock (reusing `widgetBackground`/`accent` — do not propose a separate dock color).
- `phoneNotes`: the 8 sticky-note tint cards, composer/editor chrome, danger (delete) affordance.
- `phoneChatgpd`: message bubbles/panel glass, accent used for the send button and highlights, danger state.
- `phoneBanking`: ledger/panel chrome, success vs. danger transaction coloring, accent used for primary actions.
- `phoneGallery`: image stage backdrop vs. surrounding chrome, new-image badge, danger (delete) affordance.
- `phoneSocial`: shared chrome (panels, incoming bubble, tip/tooltip), plus each brand's own accent/card/glow/background, kept distinguishable from each other if both are in scope.

For default, hover, active, success, and danger states, name the actual leaf that carries it. If a state has no separate leaf in that namespace (most of these namespaces are small — many states just reuse `accent` or `danger` everywhere they're needed), say so rather than inventing a state-specific token.

## 5. Cross-namespace consistency notes

State explicitly, per pair of namespaces that might be confused:

- Whether `phoneHome.badgeBanking` (home-screen badge on the Banking app icon) and `phoneBanking.*` (the Banking app's own internal palette) are being coordinated or deliberately left independent.
- Whether `phoneSocial`'s two brands are meant to feel like one family or two distinct apps.
- Whether any in-scope app is meant to echo the *main Studio theme's* `color.primary`/etc even though nothing forces that automatically — if so, copy the literal value across by hand; do not claim a token reference will keep them in sync, since these namespaces have no derivation from `color.*`.

## 6. Accessibility and usability checks

Define checks, not blanket compliance claims, for every in-scope app:

- contrast of every actual foreground/background pair used for that app's body text and any status/badge text;
- `phoneBanking`'s success/danger distinguishability (this is the one namespace where a contrast mistake has real in-fiction stakes: a user misreading a transaction as positive when it's negative);
- `phoneNotes`'s 8 tints staying visually distinct from each other, not just each individually readable;
- `phoneSocial`'s two brands staying visually distinct from each other when both are in scope;
- long chat text/labels at each app's fixed font size (these namespaces do not expose typography leaves — note that as a fixed constraint, not a gap to fill).

Record each as passed, failed, or unverified after implementation.

## 7. Mockup plan

Name the representative screen(s) per in-scope app: for `phoneHome`, the icon grid + clock + one widget + the dock; for a chat-style app, the message list + composer; for `phoneBanking`/`phoneGallery`, their respective list/stage view. Repeat the required concept-only label.

## 8. Implementation plan after approval

1. Reinspect the current token source, the target theme's existing `tokens` tree, and the relevant `phone-*.css` files for exact leaf names.
2. Edit the target `<id>/theme.json`: add or merge each in-scope namespace's block under `tokens`. Preserve any leaves already set that the user did not ask to change.
3. Parse JSON and check authored keys against `src/app/themeTokens.ts` (for the five registered namespaces) or the literal `--theme-phone-home-*` references in `phone-widgets.css` (for `phoneHome`, since it isn't in `themeTokens.ts` — see the capability map).
4. Resolve/load through the appropriate RPGraph path; restart packaged RPGraph for a per-user theme when required.
5. Inspect each in-scope app's representative screen(s) listed in section 7.
6. Run `npx vitest run src/app/themeExclusions.test.ts` if any CSS file was touched (it normally should not be); run `npx vitest run src/app/themeTokens.test.ts src/app/studioTheme.test.ts` for the five registered namespaces (note this does not exercise `phoneHome`).
7. Fix theme-file defects, then report exact evidence and revert steps.

## 9. Acceptance criteria

- Every authored key is a verified current phone-namespace key with a real CSS consumer (checked directly against the relevant `phone-*.css` file for `phoneHome`, since `themeTokens.ts` doesn't cover it).
- `phoneNotes` tints, if touched, are complete 8-value sets in the `"R, G, B"` triplet format, not hex/rgb().
- `phoneSocial`, if touched, keeps its brand split intentional and documented, not accidentally merged into one palette.
- No leaves were restated purely to be "complete" — namespaces with no default/derivation gain nothing from that and it only adds noise.
- No unrelated source, CSS, or main-Studio-palette change occurred.
- Mockup, generation, and validation statuses are reported separately.

## 10. Unknowns and limitations

List all unresolved repository facts, unmeasured contrast pairs, unrendered surfaces, and approximations. Give the next specific check for each. Always list the `phoneHome`/`CORE_TOKEN_KEYS` registration gap if `phoneHome` is in scope, even if it doesn't block the work.
