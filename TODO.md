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
upstream's new pattern and adapt our wiring to it," default to the latter. Any CSS 
newly added by Upstream and without adaption to the forks theming system should be adopted 
into it.

## Open

- Landscape mode of phone simulation still has weird scaling (not the phone body, the
  screen content). The underlying gap (theme/landscape CSS never ported) is fixed —
  see Done — but the scaling behavior itself hasn't been visually re-checked since.
- https://github.com/0xfreddy/homescreen https://github.com/Pierreg99/cryos-launcher
  phone screen simulations. maybe claude can analyze this for better understanding
  how phones work, look and feel, since this is code and claude understands code
  better than "imagination"
- Phone widgets waste too much space
- Somehow get more actual space on the phone screen, it's too narrow and feels
  cramped, especially in apps
- phone reflection broken
- NPCs should be able to use the phone's mood indicator
- Themes per character
- Some themes suck (esp. the girly ones look "dirty/dark", more pastel, brighter colors)
- Showcase changes, maybe visually — a quick theme gallery / before-and-after pass so
  the app-wide theming and phone-app reskins are actually visible to visitors instead of
  just being hidden in the code and config files.
- Chat Panel and Display of Actions like Messaging in Chat panel still share styles.css
  with upstream's own rendering — only the 5 phone apps got split out with independent
  theming so far (see Done); the chat/message-log split is a bigger, deliberate call
  since that content is upstream-owned, not fork-authored.
- chore: some UI elements slipped past the the theme-engine conversion and are still hardcoded
  or falling back to default style. Needs to be searched for and fixed.
- ComfyUi Provider: add cfg slider, make steps a slider, make scheduler and sampler dropdowns

## Done

- App-wide theming engine: covers Graph mode, the Storybook editor, and every dialog/
  menu (Options, Providers, System Log, NPC Library, Turn Trace, 25+ others), not just
  Play mode. 11 bundled presets, user-authored themes via a per-user folder. See
  `resources/themes/README.md` / `THEMING-INTERNALS.md`.
- Phone Apps (Notes, ChatGPD, Banking, Gallery, Social/Fotogram/OnlyFriends) split into
  their own CSS files under `src/styles/`, each with its own independent theme token
  namespace (`phoneNotes.*`, `phoneBanking.*`, etc.) instead of the shared app palette —
  first slice of the "own, separate CSS files, independently themed" item above.
- Merged upstream's social-identity unification (real names shown consistently
  alongside handles across MatchMe/Fotogram/OnlyFriends) and the new character agency-
  tags consent system (gates whether/how an NPC autonomously reacts to a post).
- Applying a provider to all nodes now also updates the phone apps Notes node's
  connection (`applyConnectionToAllNodes` covers `phoneAppsNotesConnectionId`).
- WhatsUp/narrative message comments (`contextComment`) and the phone mood selector
  (`src/phone/moodStatus.ts`) are wired end-to-end — confirmed present and integrated
  after the vanilla-rebuild merge into `main`.
- Themes and landscape mode now have real CSS backing (`src/styles/studio-theme.css`,
  `src/styles/phone-device.css`) — previously `styles.css` was byte-identical to
  upstream with zero theme/landscape rules; ported during the vanilla-rebuild effort.
- Storybook/character editor overhaul: both `StorybookCreatorDialog` and
  `StorybookEditorDialog` rebuilt on the old V2 left-rail "workbench" layout (Story /
  Characters / Surfaces rail + focused editor pane). The `CharacterSetupDialog` modal
  (Phone Apps/Banking/Image/Voice tabs) is gone — dissolved into matching rail
  subsections, each autosaving immediately instead of buffering to a draft. Export
  Character moved next to Import; Name/Role now match the standard field layout; the
  count-only Images field is removed; a new phone contact-visibility matrix was wired
  onto the Phone rail page.
- Instead of switching between roleplay and graph mode, make them tabs of the main window
- The phone camera dialog for sending image-generation prompts to Comfy has no way
  to directly use a resulting image in the current chat — you have to close the
  generator, reopen the phone image picker, then pick the image from the gallery.
  (Saving to the character's gallery already works.) Needs a new callback threaded
  from `ImageGenerationAssistantDialog` through `PhonePanel` into the message
  composer's attachment state. Fixed by remerging with upstream and theming.
