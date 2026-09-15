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
- ~~storybook editor needs an overhaul~~ fixed (vanilla-rebuild): `StorybookEditorDialog.tsx` and `StorybookCreatorDialog`/`CharacterSetupDialog` in `AppDialogs.tsx` were redesigned around a left-rail Story/Characters navigation (adopted from the abandoned `codex/code-quality-cleanup` fork's layout ideas, adapted to keep every upstream v0.5.1 feature — character assistant, relationships, removal dialog, save options, hidden agency field, mention input). See `.issues/2026-09-14-vanilla-rebuild-plan/snapshot.md` for the full before/after structure.
-> follow-up fix: the first pass kept upstream's own outer view-mode tab strip (UI Preview/Fields/Raw JSON) as a separate layer ABOVE the new rail, instead of replacing it — so both dialogs ended up with two competing nav layers (cluttered/redundant, per user feedback that they preferred the fork's original single-rail feel). Fixed by moving the mode-switch into the content pane's own small header (matching the fork's actual layout exactly, verified against its real source) and making the rail a permanent sibling that's always visible instead of only rendering in one view mode.
-> character sheet: Export Character button should be right of import character button. -> fixed: Export Character is now the first/most prominent action on each character's own page (no new per-character import-to-replace action was added, per the approved plan).
-> name and role fields are disaligned. -> fixed: Name/Role now share the same field-label/value layout as every other character field, side by side in a two-column grid instead of the old mismatched header/subrole styling.
-> Images field servers no purpose other than counting images...remove it. -> fixed: removed; the roster card and the Gallery/Character Images entry points already cover it.
-> account page from character setup - Phoneapps should live in social. -> fixed: the tab that was labeled "Phone Apps" was actually social-account management (Fotogram/OnlyFriends/MatchMe); it's now labeled "Social" and folded directly into the character's own page.
-> character setup: voice setup should live in Character sheet. -> fixed: Voice (and Image Generation and Banking) now render as subsections on the character's own page instead of a separate "Character Setup" modal.
-> and so on...reduce the amount of redundant menus and the depth of the menu structure. if it has a matching category one or two layers above, move it there and fit it in. -> fixed: the separate Character Setup modal and StorybookEditorDialog's bottom "Character accounts and export" accordion are both gone; everything about a character lives on that character's own page, reached in one click from the Characters rail item.
- instead of switching between roleplay and graph mode, make them tabs of the main window