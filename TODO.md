# TODO

User notes. Not mandatory standalone steps, but if a change in progress makes any
of these easy to pick up as a small side-patch, do it. They are listed in no specific order.

- WhatsUp annotations from other branch, narrative comments from other branch, phone-mood-selector from other branch: check if they still exist and are integrated.
- ~~applying a provider to all nodes does not apply to phone apps node Notes llm~~ fixed (vanilla-rebuild): `applyConnectionToAllNodes` now also updates `phoneAppsNotesConnectionId`.
- Landscape mode of phone simulation still weird scaling (not the phone body, the screen content)
- https://github.com/0xfreddy/homescreen https://github.com/Pierreg99/cryos-launcher phone screen simulations. maybe claude can analyze this for better understanding how phones work, look and feel, since this is code and claude understands code better than "imagination"
-> phone widgets waste too much space
-> somehow get more actual space on the phone-screen, it's too narrow and feels cramped, especially in apps 
-> Themes should apply to phone simulation too
-> investigated (vanilla-rebuild, Phase 6): the JS/attribute wiring is live (`data-studio-theme` is now set on the app root), but `src/styles.css` itself has never been touched in this whole rebuild effort — it's still byte-identical to vanilla upstream, with zero `data-studio-theme` selectors and zero `landscape` rules. The fork's `styles.css` has ~60 theme-selector occurrences and ~48 landscape occurrences that were never ported (several-thousand-line CSS diff, out of scope for App.tsx/StudioDialogs.tsx wiring). This is the real cause of both "themes don't apply to phone" and the landscape-scaling item just above. Needs its own dedicated pass — porting/reconciling `styles.css`'s theme+landscape rules — not a quick fix.
- the phone camera dialog for sending image generation promts to comfy from the phone simulation does not have any way to actually save or use a resulting image. also check if thats the case for other image generation interfaces (story editor/character editor)
-> investigated (vanilla-rebuild): saving already works (`onSaveImage` -> character's Storybook gallery, confirmed vanilla, unmodified). The actual gap: no direct "use this in the current chat" action right after generating - you have to close the generator, reopen the phone image picker, then pick the just-generated image from the gallery. Story/character editor context has no gap (saving to the character IS the complete action there). Deferred for later - needs a new callback threaded from ImageGenerationAssistantDialog through PhonePanel into the message composer's attachment state.
- NPCs should be able to use the phone's mood indicator
- Themes per character
- Some themes suck (esp. the girly ones look "dirty/dark", more pastel, brighter colors)
- storybook editor needs an overhaul: 
-> character sheet: Export Character button should be right of import character button. name and role fields are disaligned. Images field servers no purpose other than counting images...remove it.
-> account page from character setup - Phoneapps should live in social
-> character setup: voice setup should live in Character sheet
-> and so on...reduce the amount of redundant menus and the depth of the menu structure. if it has a matching category one or two layers above, move it there and fit it in
- instead of switching between roleplay and graph mode, make them tabs of the main window