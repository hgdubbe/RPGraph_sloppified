# RPGraph Phone Theme Validation Checklist

Run this only after explicit approval has allowed editing the real `theme.json`. Record each check as **pass**, **fail**, or **unverified**, with evidence.

## 1. Destination and safety

- Confirm the target `theme.json` is the one the user intended (existing bundled/per-user theme, or a new one already created by the general theme skill in this same session).
- Confirm no leaf the user did not ask to change was altered — a phone-theming task should touch only the in-scope namespaces' blocks, never `color.*`, `graph.*`, or an out-of-scope phone namespace.
- Verify only the approved theme file and any separately approved review artifacts changed.

## 2. Static manifest checks

- Parse `theme.json` as JSON.
- For each in-scope registered namespace (`phoneNotes`, `phoneChatgpd`, `phoneBanking`, `phoneGallery`, `phoneSocial`), compare every authored leaf against the current `CORE_TOKEN_KEYS` list in `src/app/themeTokens.ts`. Unknown keys are a failure unless source inspection proves a current custom consumer.
- For `phoneHome`, compare every authored leaf against the literal `--theme-phone-home-<leaf-in-kebab-case>` references actually present in `src/styles/phone-widgets.css` — it has no `CORE_TOKEN_KEYS` entry, so this file-level check is the only ground truth.
- If `phoneNotes` tints were touched, confirm every one of the 8 is a bare `"R, G, B"` string (three comma-separated integers 0-255), not `#hex` or `rgb(...)`.
- If `phoneSocial` was touched, confirm the shared-chrome leaves and each brand's prefixed leaves (`fotogram*`/`onlyfriends*`) weren't accidentally cross-assigned (e.g. an OnlyFriends color landing on a `fotogram*` key).
- Prefer parseable hex/rgb/rgba values for every other leaf; these namespaces have no derivation layer to fail, but unparseable values are still hard for a human author to preview and adjust.

## 3. Resolution and discovery

- Confirm the surrounding theme's `extends` chain still resolves (this skill should not have touched it, but confirm nothing broke).
- For the five registered namespaces, run:

  `npx vitest run src/app/themeTokens.test.ts src/app/studioTheme.test.ts`

  Note explicitly in the report that this does **not** exercise `phoneHome` (it isn't in `CORE_TOKEN_KEYS`), so a `phoneHome`-only change gets no automated coverage from these tests.
- Run `npx vitest run src/app/themeExclusions.test.ts` if any CSS file was touched (it normally should not be for a pure theme-file edit); this is the test that enforces the exclusion boundary these six namespaces are exceptions to.
- For a per-user theme, verify the packaged loader discovers it after the required restart. Repository tests over bundled fixtures do not prove discovery of an external user file.

## 4. Representative visual inspection

When the environment permits, select the theme and inspect each in-scope app's representative screen:

- `phoneHome`: home screen wallpaper scrim, clock widget, at least one desktop widget (default and, if reachable, its hover/active state), an app icon's badge (and Banking's badge specifically if `badgeBanking` was set), the mood-status dot, and the bottom dock.
- `phoneNotes`: a note in each of the 8 tints, side by side if possible.
- `phoneChatgpd`: the message bubble/glass treatment and the send-button accent.
- `phoneBanking`: one success and one danger transaction row.
- `phoneGallery`: the image stage and a badged thumbnail.
- `phoneSocial`: Fotogram and OnlyFriends both, if both in scope, confirming they remain visually distinguishable from each other.

Compare the live result with the specification, not just the concept mockup.

## 5. Accessibility and usability

- Measure relevant rendered foreground/background contrast pairs for each in-scope app's body text and status/badge text.
- Confirm `phoneBanking`'s success/danger and `phoneGallery`'s badge remain distinguishable under the new colors — these carry real in-fiction meaning.
- Confirm `phoneNotes`'s 8 tints remain distinct from each other, not just individually legible.
- Confirm `phoneSocial`'s two brands (if both in scope) remain distinguishable from each other.
- Check long chat text/labels at each app's existing fixed font size; note that none of these namespaces expose typography controls, so this is a check of the chosen colors under existing type, not a tunable variable.

## 6. Report

State separately:

- which namespaces were touched and which were deliberately left at default;
- JSON/static checks passed or failed;
- resolved/discovered/loaded;
- which representative screens were visually inspected;
- unverified checks and why (explicitly flag the `phoneHome`/test-coverage gap if relevant);
- exact changed file(s) and focused revert path.

Never claim "validated" without naming the validation layer and evidence.
