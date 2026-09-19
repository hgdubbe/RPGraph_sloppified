# Decoupled Phone Theme System — Implementation Plan

Status: planned work; no product implementation has started.

Companion requirements: `spec.md` in this directory.

## 1. Outcome

Introduce a second, independent theming system for the simulated phones.

- Studio themes continue to control Studio, Graph, Storybook, dialogs, and other
  application chrome.
- Phone themes control the physical simulated device, phone OS, home screen, icon
  pack, phone typography, widgets, wallpaper presets, and supported phone-app skins.
- A character owns their selected phone theme and phone customization.
- Studio-theme and phone-theme selection never write to or derive from one another.
- Phone themes are selected and managed from inside the phone simulation.

## 2. Decisions fixed by this plan

### 2.1 Per-character ownership

`RpStorybookCharacterPhoneSettings` owns the phone theme and appearance overrides.
Two characters may display different phone themes at the same time. A bundled default
is used only when a character has no valid explicit selection.

This matches the existing per-character wallpaper behavior and avoids treating an
in-world character device as a global RPGraph preference.

### 2.2 Separate domain, state, and CSS namespace

Phone themes have their own:

- manifest type and schema version;
- bundled/user directories;
- registry, resolver, loader, diagnostics, and IPC channels;
- React application hook;
- root marker and CSS custom-property namespace.

No phone theme token is stored in or resolved through `ThemeManifest`,
`useThemeRegistry`, `resolveTheme`, `studioThemeStorageKey`, or document-root
`--theme-*` variables.

### 2.3 Data-only theme packages

Phone theme packages may contain JSON and local image/font assets. They may not ship
JavaScript or arbitrary CSS. The renderer owns all selectors and behavior; manifests
only fill declared semantic slots and defaults.

This prevents user themes from styling outside the phone root, depending on unstable
DOM details, or executing code.

### 2.4 Defaults do not overwrite customization

A theme supplies defaults. Explicit character choices win:

1. per-character override;
2. selected phone theme default;
3. bundled base phone theme default.

Changing themes does not erase wallpaper, layout, icon-size, or orientation overrides.
The settings UI provides an explicit **Reset appearance to theme defaults** action.

### 2.5 Accessibility remains user-owned

The existing global phone chat text-size preference remains a real-user accessibility
override. A phone theme may define font family, weight, line height, and its preferred
base size, but the user's text-size setting wins where readability is concerned.

## 3. Current-state constraints

The implementation must account for these existing behaviors:

- Studio themes are loaded from `resources/themes/*/theme.json` and user data
  `themes/`, then applied as `--theme-*` properties by `useAppliedTheme`.
- Phone-app token groups currently live in `src/app/themeTokens.ts` and are therefore
  still authored inside Studio theme manifests.
- Physical phone styling in `src/styles/phone-device.css` currently consumes Studio
  `raw.*` variables.
- Wallpaper is already stored per character in `phoneSettings.wallpaperId`.
- Desktop layout, orientation, and icon size currently live in global app settings.
- Home-screen icons are hardcoded JSX/SVG in `PhonePanel.tsx`.
- Packaged resources currently include `resources/themes` but no phone-theme folder.

## 4. Target architecture

```text
resources/phone-themes/*/phone-theme.json
userData/phone-themes/*/phone-theme.json
                    |
                    v
       phone-theme library loaders
       (browser fallback + Electron)
                    |
                    v
              PhoneThemeRegistry
                    |
        selected character.phoneSettings.themeId
                    |
                    v
             resolvePhoneTheme()
              /             \
     scoped CSS variables    resolved theme defaults/assets
              \             /
               RoleplayPhoneDevice
                    |
        PhonePanel and phone-app screens
```

Studio theme resolution remains a separate parallel path and never enters this flow.

## 5. Proposed manifest contract

Create `src/phone-theme/phoneThemeTypes.ts` with a versioned contract similar to:

```ts
type PhoneThemeManifest = {
  schemaVersion: 1;
  id: string;
  label: string;
  description?: string;
  extends?: string;
  hidden?: boolean;
  order?: number;
  tokens?: PhoneThemeTokenTree;
  assets?: Partial<Record<PhoneThemeAssetKey, string>>;
  defaults?: {
    wallpaperAsset?: PhoneThemeAssetKey;
    iconSize?: PhoneDesktopIconSize;
    orientation?: 'portrait' | 'landscape';
    desktopLayout?: PhoneDesktopLayout;
  };
  source?: 'bundled' | 'user';
};
```

Authored asset values are relative paths within the theme directory. Loader output
uses a separate resolved representation so authored paths are never mistaken for safe
renderer URLs:

```ts
type LoadedPhoneThemeManifest = PhoneThemeManifest & {
  resolvedAssets: Partial<Record<PhoneThemeAssetKey, string>>;
};
```

### 5.1 Initial semantic token groups

Keep the initial token surface explicit and reviewable:

- `device.*`: case/background layers, border, radius, glass, reflections, hardware
  buttons, shadow, screen inset, status-bar treatment, home-control treatment;
- `system.*`: background, panel, line, text, muted text, accent, danger, success,
  badge, focus, selection, overlay, scrim;
- `typography.*`: family, display family, weight, display weight, letter spacing,
  line height, label transform;
- `shape.*`: panel radius, icon radius, button radius, widget radius, border width;
- `motion.*`: duration, easing, press scale, hover scale;
- `desktop.*`: label color/shadow, widget surface/border/shadow, dock surface,
  settings-panel surface;
- `apps.whatsup.*`, `apps.gallery.*`, `apps.camera.*`, `apps.banking.*`,
  `apps.fotogram.*`, `apps.onlyfriends.*`, `apps.notes.*`, `apps.chatgpd.*`, and
  `apps.plottwist.*` for app-specific semantic skin values.

The resolver converts these to `--phone-theme-<path>` names. It never emits
`--theme-*`.

### 5.2 Initial asset keys

Support a fixed allowlist rather than arbitrary asset names:

- device reflection/detail textures in portrait and landscape;
- default wallpaper and additional wallpaper previews;
- one icon asset per phone app;
- optional system glyphs only where the renderer has an explicit consumer.

For the first release, accept local PNG, WebP, and JPEG files. Defer SVG and custom
font files until sanitization, licensing, CSP, and packaging behavior are deliberately
specified. Built-in fallbacks remain available for every optional asset.

### 5.3 Validation rules

- `schemaVersion` must equal `1`.
- `id` must match its directory name and use lowercase kebab-case.
- `label` is required and bounded.
- `extends` chains must be acyclic and fall back to `base` when invalid/missing.
- Token leaves must be strings; invalid branches are diagnosed and ignored.
- Asset paths must be relative, remain inside the theme directory after resolution,
  use an allowed extension, exist, and stay under configured per-file/total-size caps.
- Unknown tokens produce diagnostics and are ignored in the first release. This is
  stricter than Studio's open token dictionary because phone themes are intended to
  be portable packages with a stable contract.
- Duplicate IDs use the existing precedence rule: user package overrides bundled
  package of the same ID.

## 6. Persistence model

Expand `RpStorybookCharacterPhoneSettings` to contain optional appearance state:

```ts
type RpStorybookCharacterPhoneSettings = {
  wallpaperId: string;
  themeId?: string;
  desktopLayout?: PhoneDesktopLayout;
  iconSize?: PhoneDesktopIconSize;
};
```

Orientation remains part of `PhoneDesktopLayout` unless that type is split during the
implementation for clarity.

`rpStorybookCharacterPhoneSettings()` validates every field and preserves forward
compatibility by falling back field-by-field, not replacing the whole object when one
field is invalid.

### 6.1 Effective appearance calculation

Add a pure `resolvePhoneAppearance()` function that receives:

- selected/loaded phone theme;
- character phone settings;
- legacy global layout and icon size during migration;
- bundled base defaults.

It returns a fully usable effective theme ID, tokens, assets, layout, icon size,
orientation, and wallpaper reference without mutating stored data.

### 6.2 Compatibility migration

Do not bulk-rewrite every character on application startup.

- Existing `wallpaperId` remains untouched.
- If `desktopLayout` or `iconSize` is absent, the effective appearance temporarily
  falls back to the existing global setting.
- The first explicit phone appearance edit writes the full validated per-character
  field being changed.
- Loading and saving older Storybook files remains supported.
- Global `phoneDesktopLayout` and `phoneDesktopIconSize` remain readable for one
  compatibility period but receive no new writes after the phone migration is active.
- Remove those obsolete global fields only in a later, separately scoped cleanup after
  existing saves have had a release cycle to migrate.

## 7. Runtime and CSS isolation

### 7.1 Apply only at the device root

Add `useAppliedPhoneTheme()` and attach its output to the `.roleplay-phone-device`
element through a ref. It must:

- set `data-phone-theme="<id>"` for diagnostics and targeted snapshots;
- apply only `--phone-theme-*` properties to that element;
- remove stale variables on theme changes;
- never write phone variables to `document.documentElement`;
- use `useLayoutEffect` to avoid a stale-theme paint.

Phone UI must not portal themed content outside the phone root. If a future phone
popover requires a portal, it must render into a portal host inside the device.

### 7.2 CSS migration boundary

Migrate phone-owned rules in these surfaces:

- `src/styles/phone-device.css`;
- phone desktop/settings/widget rules currently in `src/styles.css`;
- `src/styles/phone-notes.css`;
- `src/styles/phone-chatgpd.css`;
- `src/styles/phone-banking.css`;
- `src/styles/phone-gallery.css`;
- `src/styles/phone-social.css`;
- `src/components/phone-dating/phoneDating.css`;
- any phone-camera/WhatsUp rules still located in mixed stylesheets.

Replace phone-owned `--theme-*`, global palette aliases such as `--soft-white`, and
hardcoded themeable appearance literals with semantic `--phone-theme-*` consumers.
Keep behavioral geometry that is not theme-configurable as ordinary CSS.

### 7.3 Icon rendering

Extract the repeated home-screen app button/icon markup from `PhonePanel.tsx` into a
small data-driven `PhoneDesktopAppIcon` component.

- If the resolved phone theme supplies an icon asset, render it as a decorative image.
- Otherwise render the current built-in SVG/monogram fallback.
- Keep the button accessible name independent from the decorative icon.
- Theme icon masks, radius, border, shadow, and label styling through tokens.
- Do not make app routing or availability data-driven from the theme manifest.

## 8. Library and packaging work

Create a phone-theme library parallel to—not embedded in—the Studio theme library:

- `src/phone-theme/phoneThemeLibrary.browser.ts` scans bundled manifests in Vite;
- `electron/phoneThemeLibrary.cjs` scans bundled and user packages;
- `src/phone-theme/phoneThemeRegistry.ts` exposes loaded/selectable themes and reload;
- `src/phone-theme/phoneThemeResolver.ts` performs pure inheritance/default
  resolution;
- `src/phone-theme/useAppliedPhoneTheme.ts` owns DOM application.

Add separate IPC channels and preload APIs:

- `phone-theme-library:get`;
- `phone-theme-library:reload`;
- `phone-theme-library:open-folder`;
- `phone-theme-library:changed`.

Update:

- `electron/main.cjs` to initialize and expose the service;
- `electron/preload.cjs` and `src/electron.d.ts` for the bridge contract;
- `electron-builder.yml` to package `resources/phone-themes/**/*`;
- browser/Vite globs so development loads bundled phone themes without Electron.

Do not refactor the existing Studio theme loader into a generic abstraction during
this feature. A later deduplication can happen after both libraries are proven; doing
it now increases regression surface without improving separation.

## 9. In-phone selection and customization UI

Extend the existing desktop settings menu in `PhonePanel.tsx` rather than adding a
Studio-level option.

### 9.1 Theme picker

- Add a **Phone theme** section showing selectable theme cards/rows.
- Show label, optional preview image, selected state, and source badge for user themes.
- Apply selection immediately through an `onPhoneThemeChange(character, themeId)`
  callback.
- Keep the menu usable in portrait and landscape.
- If the selected theme is unavailable, show the fallback as active plus a concise
  missing-theme note; retain the stored ID.

### 9.2 Appearance controls

- Keep wallpaper selection in the phone.
- Move layout, icon size, and orientation writes to the selected character's
  `phoneSettings`.
- Add **Reset appearance to theme defaults** with a confirmation that lists only the
  fields being cleared.
- Keep accessibility text sizing separate and label it as a readability preference if
  it remains exposed near phone appearance controls.
- Add **Reload phone themes** and **Open phone themes folder** only where the desktop
  bridge exists; hide or disable them in browser-only development.

## 10. Default theme and migration of current visuals

Create `resources/phone-themes/base/phone-theme.json` as hidden fallback and
`resources/phone-themes/classic/phone-theme.json` as the selectable shipped look.

The classic theme must reproduce the current phone appearance before adding any new
design. It owns:

- current black/metal device case and glass treatment;
- current app icons as fallbacks or packaged assets;
- current desktop/settings/widget colors and typography;
- existing functional app palettes;
- current default wallpaper set and desktop defaults.

Only after parity is verified should additional example themes be added. One second
theme should be sufficiently different to prove that case, icons, typography, home
layout defaults, and app colors are truly controlled by the phone-theme system rather
than coincidentally matching Classic.

## 11. Removal of Studio-theme phone ownership

After the phone resolver and CSS consumers are active:

1. Remove `phoneBanking.*`, `phoneGallery.*`, `phoneNotes.*`, `phoneChatgpd.*`, and
   `phoneSocial.*` from `CORE_TOKEN_KEYS`.
2. Remove phone-owned physical-device `raw.*` entries from Studio theme documentation
   and manifests where they no longer have any Studio consumer.
3. Remove phone token sections from bundled Studio `theme.json` files.
4. Update `resources/themes/README.md`, `THEMING-INTERNALS.md`, and the
   RPGraph theme-designer references so Studio theme authors are directed to the
   separate phone-theme format.
5. Strengthen the Studio theme exclusion test so any `--theme-*` reference under the
   simulated-phone root fails, including functional phone apps.

Do not remove old manifest keys before their last CSS consumer has moved. The migration
must stay green after every slice.

## 12. Work sequence

Each slice should be independently reviewable and leave focused tests green.

### Slice 1 — Pure contracts and resolver

Files:

- add `src/phone-theme/phoneThemeTypes.ts`;
- add `src/phone-theme/phoneThemeResolver.ts`;
- add `src/phone-theme/phoneAppearance.ts`;
- add colocated resolver/appearance tests;
- add base/classic manifest fixtures with no runtime wiring yet.

Prove:

- inheritance precedence and cycle handling;
- unknown/missing theme fallback;
- override > theme default > base default precedence;
- Studio theme ID is not an input to any phone resolver.

### Slice 2 — Bundled and user library loading

Files:

- add browser and Electron phone-theme libraries;
- add loader tests with invalid JSON, invalid IDs, duplicate IDs, traversal attempts,
  unsupported assets, and missing asset files;
- add IPC/preload/type declarations;
- add packaging resource entry.

Prove:

- bundled discovery in browser development;
- bundled plus user discovery in Electron;
- user override precedence;
- safe asset resolution and diagnostics;
- Studio theme service remains unchanged.

### Slice 3 — Character persistence and compatibility fallback

Files:

- update `src/nodes/rp-storybook/model.ts`;
- update `src/characters/character.ts`, runtime/conversion/migration helpers, and
  fixtures that explicitly construct `phoneSettings`;
- add App-level callbacks for per-character phone appearance changes;
- stop new global layout/icon-size writes while retaining legacy reads.

Prove:

- old saves load without modification errors;
- invalid phone appearance fields fail closed per field;
- per-character settings round-trip through save/load and character containers;
- message/social/banking/app data remains byte-equivalent through appearance edits.

### Slice 4 — Scoped runtime application

Files:

- add `usePhoneThemeRegistry` and `useAppliedPhoneTheme`;
- update `RoleplayPhoneDevice.tsx` to own the ref, marker, and scoped variables;
- thread the selected character/effective appearance from `App.tsx`;
- add DOM-level tests for stale-property removal and root isolation.

Prove:

- phone switch is immediate;
- Studio switch does not alter phone variables;
- phone switch does not alter document-root Studio variables;
- two mounted devices can resolve different phone themes without leaking.

### Slice 5 — Device shell and home-screen migration

Files:

- migrate device/desktop/widget/settings CSS;
- extract `PhoneDesktopAppIcon` and preserve current icon fallbacks;
- wire themed icon assets;
- make effective per-character layout/icon size/orientation drive `PhonePanel`.

Prove:

- Classic visually matches the previous phone;
- alternate theme changes case, icon pack, typography, palette, widget/settings chrome,
  and layout defaults;
- drag/resize/app-launch/notification behavior is unchanged;
- portrait and landscape both remain usable.

### Slice 6 — Functional phone-app skins

Migrate one app at a time in this order:

1. Gallery;
2. Notes;
3. Banking;
4. ChatGPD;
5. WhatsUp/Camera surfaces;
6. Fotogram/OnlyFriends shared social surface;
7. MatchMe/PlotTwist.

For every app, first add semantic phone tokens and focused style/interaction coverage,
then remove its Studio theme token consumers. Preserve brand-specific semantics where
Fotogram and OnlyFriends share structural UI.

### Slice 7 — In-phone picker and reset behavior

Files:

- extend the desktop settings UI;
- add theme selection, missing-theme state, reload/open-folder controls, and reset;
- add accessible labels and keyboard/focus behavior;
- add interaction tests for per-character switching and reset precedence.

Prove:

- selection is entirely inside the phone;
- changing Character A never changes Character B;
- custom wallpaper/layout survive theme changes;
- reset clears overrides and reveals theme defaults;
- browser fallback does not expose unavailable filesystem actions.

### Slice 8 — Cutover, documentation, and second proof theme

Files:

- remove obsolete phone keys from Studio theme contracts/manifests;
- tighten theme isolation tests;
- add `resources/phone-themes/README.md` and authoring reference;
- update Studio theming docs and skills to state the boundary;
- add one deliberately distinct phone theme covering all major capabilities.

Prove:

- no simulated-phone selector consumes `--theme-*`;
- no non-phone selector consumes `--phone-theme-*`;
- packaged and development builds discover the same bundled theme IDs;
- user phone themes never appear in the Studio theme picker, and vice versa.

## 13. Test strategy

Use focused tests per slice rather than repeatedly running the full application suite.

### Pure/unit tests

- manifest validation and inheritance;
- asset-path and extension validation;
- resolver precedence and safe fallback;
- appearance override precedence;
- per-field phone settings normalization;
- migration fallback from legacy global settings;
- selectable-theme ordering and user override behavior.

### Component tests

- root-scoped CSS variable application and cleanup;
- themed icon asset versus built-in fallback;
- picker selection, missing theme, reset, and character switching;
- accessibility labeling and keyboard operation;
- phone app behavior remains functional after skin migration.

### Static isolation tests

- reject `--theme-*` in simulated-phone selectors/files after cutover;
- reject `--phone-theme-*` outside phone-owned styles;
- every declared asset key has a renderer consumer or is intentionally optional;
- every bundled theme resolves all required phone tokens and defaults;
- bundled manifest folder ID matches manifest ID.

### Integration checks

- TypeScript build;
- targeted ESLint for changed modules;
- targeted Vitest files for the current slice;
- Electron library scan using temporary bundled/user directories;
- packaged-resource smoke check for `resources/phone-themes`;
- final manual visual matrix: Classic and alternate theme × portrait/landscape ×
  desktop plus each phone app × at least two characters;
- final save/reload test with different themes and overrides on two characters.

Reserve the full unit suite and Electron end-to-end pass for the cutover/integration
milestones, not every slice.

## 14. Failure conditions

The work is not complete if any of these remain true:

- changing Studio theme changes any phone appearance;
- changing phone theme changes anything outside the phone root;
- phone selection is global when multiple characters exist;
- theme changes silently replace explicit wallpaper or layout choices;
- a missing user theme breaks phone rendering or deletes its stored ID;
- phone packages can load code, arbitrary CSS, remote URLs, or paths outside their
  package directory;
- Classic cannot reproduce the current phone closely enough for existing saves;
- app behavior, data, drag layout, notifications, or orientation changes because of a
  purely visual theme switch;
- phone tokens remain in new Studio theme manifests after cutover;
- the feature works only in Vite development or only in packaged Electron.

## 15. Main risks and controls

### Appearance state is currently split between character and global settings

Control: introduce pure effective-appearance resolution first, retain legacy reads,
and migrate on explicit edits rather than bulk mutation.

### `PhonePanel.tsx` is already large

Control: extract only theme-related presentation seams—icon rendering and settings
sections. Do not combine this work with a broad PhonePanel refactor.

### Asset loading differs between Vite and packaged Electron

Control: define one loaded-manifest result contract and test both loaders against the
same fixtures. Keep authored relative paths out of renderer consumption.

### Theme tokens could become an uncontrolled CSS API

Control: closed semantic allowlist, data-only manifests, root scoping, and static
cross-boundary tests.

### Moving every phone app at once would make visual regressions hard to locate

Control: migrate app-by-app, keep Classic parity as the regression baseline, and do
not delete Studio token consumers until each app is on the new resolver.

## 16. Completion definition

The feature is complete only when:

- all acceptance criteria in `spec.md` pass;
- Classic and the alternate proof theme are bundled and selectable inside the phone;
- two characters can retain different themes and customizations across save/reload;
- Studio and phone theme switches are demonstrably isolated in both directions;
- development and packaged theme discovery both work;
- the old Studio phone tokens and physical-device raw-token ownership are removed;
- documentation explains phone-theme creation independently of Studio-theme creation;
- focused tests, final full tests, build, lint, packaged smoke check, and visual matrix
  are recorded in the implementation handoff.

## 17. Suggested later execution handoff

Implement this as the eight slices above, in order. Start a fresh implementation
session from Slice 1 and treat this plan plus `spec.md` as the source of truth. Do not
begin CSS migration or picker UI before the pure resolver, loader contract, and
persistence precedence are green; those foundations define the isolation guarantee
the rest of the feature depends on.
