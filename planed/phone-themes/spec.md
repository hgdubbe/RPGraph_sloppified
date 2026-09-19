# Phone Theme System Scope

## Product intent

RPGraph Studio themes and simulated-phone themes are separate appearance systems.
Changing the Studio theme must not change a simulated phone. Changing a phone theme
must not change Studio, Graph, Storybook, dialogs, or other application chrome.

Phone themes are selected from inside the simulated phone and customize the phone as
an in-world device rather than as a panel of RPGraph Studio.

## Ownership model

Recommended: store the selected phone theme per Storybook character in
`phoneSettings.themeId`, with a global default used only when a character has not made
an explicit selection. This matches the existing per-character wallpaper ownership and
allows different characters to carry visibly different phones.

Desktop layout, icon size, wallpaper, case, and other user customizations should also
become per-phone settings where they represent that character's device. Accessibility
preferences that belong to the real RPGraph user, such as a readability override, may
remain global and layer on top without mutating the saved phone theme.

## Theme package boundary

Phone themes use their own manifest and discovery path, for example:

- `resources/phone-themes/<id>/phone-theme.json`
- user-installed phone themes under the app user-data phone-theme directory
- a dedicated phone-theme registry, resolver, validation schema, and asset resolver
- phone-scoped CSS variables such as `--phone-theme-*`
- a phone theme marker applied at `RoleplayPhoneDevice`, not at the document root

Phone themes must not extend Studio themes, read the active Studio theme ID, or reuse
Studio `--theme-*` variables. Shared implementation utilities are acceptable only when
they do not create shared theme state or shared token semantics.

## Theme capabilities

A phone theme may define:

- device hardware: case material/color, bezel, buttons, camera treatment, corners,
  glass, shadows, highlights, and portrait/landscape variants;
- simulated OS chrome: status bar, navigation/home control, notification badges,
  settings surfaces, menus, widgets, transitions, and system typography;
- home screen: icon pack, icon masks, labels, grid rhythm, dock/panel treatment,
  default layout, default widgets, and default wallpaper collection;
- phone-wide visual language: palette, typography, spacing, radii, elevation, and
  motion;
- individual app skins for WhatsUp, Gallery, Camera, Banking, Fotogram, OnlyFriends,
  Notes, ChatGPD, PlotTwist, and future phone apps;
- theme-owned local assets, including icons, textures, case art, and wallpapers.

Theme defaults are distinct from user choices. Applying a theme supplies defaults but
must not silently overwrite a phone owner's explicit wallpaper or layout customization.
The phone settings UI may offer a separate reset-to-theme-default action.

## Selection experience

- Theme selection lives inside the phone simulation's settings surface.
- The picker previews phone themes independently of the Studio theme picker.
- Selection updates that phone immediately and persists with the owning character.
- Missing or removed theme IDs fall back safely to the bundled default phone theme
  without deleting the stored ID or other phone settings.
- A phone theme can be changed without restarting RPGraph Studio.

## Migration

The existing phone appearance becomes the bundled default phone theme.

Existing `phoneNotes.*`, `phoneChatgpd.*`, `phoneBanking.*`, `phoneGallery.*`, and
`phoneSocial.*` values move out of Studio theme manifests and into phone-theme
manifests. The physical `roleplay-phone-*` device styling also moves off Studio tokens.
Legacy Studio themes that contain phone tokens remain loadable, but those tokens no
longer control phones after the migration.

Existing character wallpapers are preserved. Existing global desktop layout and icon
size values seed per-phone settings during compatibility migration rather than being
discarded.

## Non-goals

- A phone theme does not change message data, contacts, app availability, banking
  state, social content, notification logic, or application behavior.
- A phone theme does not grant arbitrary script execution or remote asset loading.
- This scope does not require a public theme editor; manifest loading and an in-phone
  picker are sufficient for the first release.
- Studio themes do not provide phone-theme overrides or paired-theme behavior in the
  first release.

## Acceptance criteria

1. Switching the Studio theme causes no computed-style or asset change inside an
   already selected phone theme.
2. Switching a phone theme causes no computed-style change outside the simulated
   phone root.
3. Two characters can use different phone themes simultaneously and retain them after
   save/reload.
4. A phone theme can visibly change the case, system chrome, typography, icon pack,
   home layout defaults, colors, and at least one phone-app skin.
5. Explicit wallpaper and layout customizations survive theme switching; reset restores
   the selected theme's defaults.
6. Missing themes and missing optional assets fall back to the bundled default without
   breaking phone interaction.
7. Existing saves migrate without losing wallpapers, layouts, icon size, messages, or
   app state.
8. Phone-theme manifests cannot introduce styles outside the phone root or execute
   code.

## Excluded alternative

Keeping phone tokens as optional sections of Studio themes is excluded because it
preserves the coupling the feature is intended to remove, prevents independent theme
selection, and makes a Studio-theme change capable of repainting an in-world device.
