# TODO

User notes. Not mandatory standalone steps, but if a change in progress makes any
of these easy to pick up as a small side-patch, do it. They are listed in no specific order.

## Standing instruction (ongoing, applies to all future work, not a one-off task)

When merging or reconciling with upstream: **upstream's structural/backend changes and
new systems take priority.** We build on top of upstream, not against it. Our own
changes should leave as much of upstream's code untouched as possible, adding only
the integration work necessary to fit our additions on top of upstream's current
shape — not preserving our own prior implementation choices at the cost of upstream
compatibility. When a merge conflict pits "keep our existing pattern" against "adopt
upstream's new pattern and adapt our wiring to it," default to the latter.

- WhatsUp annotations from other branch, narrative comments from other branch, phone-mood-selector from other branch: check if they still exist and are integrated.
- ~~applying a provider to all nodes does not apply to phone apps node Notes llm~~ fixed (vanilla-rebuild): `applyConnectionToAllNodes` now also updates `phoneAppsNotesConnectionId`.
- Landscape mode of phone simulation still weird scaling (not the phone body, the screen content)
- https://github.com/0xfreddy/homescreen https://github.com/Pierreg99/cryos-launcher phone screen simulations. maybe claude can analyze this for better understanding how phones work, look and feel, since this is code and claude understands code better than "imagination"
-> phone widgets waste too much space
-> somehow get more actual space on the phone-screen, it's too narrow and feels cramped, especially in apps 
-> Themes should apply to phone simulation too
-> investigated (vanilla-rebuild, Phase 6): the JS/attribute wiring is live (`data-studio-theme` is now set on the app root), but `src/styles.css` itself has never been touched in this whole rebuild effort — it's still byte-identical to upstream, with zero `data-studio-theme` selectors and zero `landscape` rules. The fork's `styles.css` has ~60 theme-selector occurrences and ~48 landscape occurrences that were never ported (several-thousand-line CSS diff, out of scope for App.tsx/StudioDialogs.tsx wiring). This is the real cause of both "themes don't apply to phone" and the landscape-scaling item just above. Needs its own dedicated pass — porting/reconciling `styles.css`'s theme+landscape rules — not a quick fix.
- the phone camera dialog for sending image generation promts to comfy from the phone simulation does not have any way to actually save or use a resulting image. also check if thats the case for other image generation interfaces (story editor/character editor)
-> investigated (vanilla-rebuild): saving already works (`onSaveImage` -> character's Storybook gallery, confirmed upstream, unmodified). The actual gap: no direct "use this in the current chat" action right after generating - you have to close the generator, reopen the phone image picker, then pick the just-generated image from the gallery. Story/character editor context has no gap (saving to the character IS the complete action there). Deferred for later - needs a new callback threaded from ImageGenerationAssistantDialog through PhonePanel into the message composer's attachment state.
- NPCs should be able to use the phone's mood indicator
- Themes per character
- Some themes suck (esp. the girly ones look "dirty/dark", more pastel, brighter colors)
- storybook editor needs an overhaul:
-> fixed (vanilla-rebuild, real V2-source rebuild pass, 2026-09-15): rebuilt both
   `StorybookCreatorDialog` (`src/components/AppDialogs.tsx`) and
   `StorybookEditorDialog` (`src/components/StorybookEditorDialog.tsx`) on the real
   old V2 left-rail "workbench" layout, read directly from
   `C:\Users\hen\Desktop\rpgraph\src\components\AppDialogs.tsx` /
   `StorybookEditorDialog.tsx` / `src\styles.css` (not approximated). Left rail:
   Story (Scenario/Intro/Opening History) / Characters (one item per character) /
   Surfaces (Phone/Gallery/Social/Bank, each its own page) next to a focused
   editor pane next to the existing AI assistant chat panel. CSS ported verbatim
   into new `src/styles/storybook-editor.css` (the `.storybook-workbench-*` rule
   block, `--storybook-*` palette scoped to `.storybook-creator-dialog` instead
   of V2's `.storybook-workbench-dialog`).
-> the `CharacterSetupDialog` modal (4 tabs: Phone Apps/Banking/Image/Voice) is
   gone. Its content was dissolved into the matching rail page instead of staying
   a separate dialog: Image Setup -> "Appearance & Image Generation" subsection
   on the Character Detail page; Voice Setup -> "Voice" subsection on the same
   page; Banking -> its own Bank rail page (starting balance + editable fixed
   expenses, moved in place); the "Phone Apps" tab (actually social-account
   management, `CharacterAppProfiles`) -> its own Social rail page, mounting the
   real v3 `CharacterAppProfiles`/`SocialProfileEditor`/`PhoneDatingScreen`
   components unmodified. All 4 "Character Setup" button entry points are gone.
   Every subsection now autosaves immediately via `onUpdateStorybook` on each
   change instead of buffering into a draft committed on modal close.
-> Export Character moved up to the Character Detail section toolbar, next to
   SillyTavern Import / Import Character (was previously a footer button, easy to
   miss next to Character Images).
-> Name/Role now share the same field-label/value layout as every other
   character field. The count-only "Images" summary field is removed.
-> Phone contact-visibility matrix (N×N table of who-can-see-whom) is new UI,
   added on the new Phone rail page, wired to the already-existing backend in
   `src/nodes/rp-storybook/model.ts` (`rpStorybookPhoneContactCharacters`,
   `rpStorybookPhoneContactAllowed`, `withRpStorybookPhoneContactPairBlocked`) —
   this function set previously had zero UI anywhere in the app.
-> `CharacterRelationships`/`HiddenAgencyField` stay wired on the Character
   Detail page's identity area, next to Description/Personality/Speech Style.
-> `StorybookEditorDialog` (the secondary/JSON node editor) got a smaller, real
   improvement in the same spirit rather than a full 3-column rail (it is a much
   simpler dialog with no Character-Setup-modal equivalent to dissolve): the old
   bottom `<details>` accordion listing every character's account editor at once
   was replaced with a character-grid switcher (pick one character card, its
   account editor appears below) — reduces menu depth the same way, without
   duplicating the primary dialog's full rail machinery.
- instead of switching between roleplay and graph mode, make them tabs of the main window