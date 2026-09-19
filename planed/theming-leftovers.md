# RPGraph Studio theming leftovers

Living audit started: 2026-09-18

## Scope

This list covers UI that should respond to the current **Studio theme system**.

It deliberately excludes:

- `src/styles/phone-widgets.css`;
- `src/components/phone-dating/phoneDating.css`;
- simulated-phone and registration/profile presentation under `.phone-*`, `.pt-*`,
  and `.social-profile-*` selectors (Studio-side controls such as the Storybook
  Phone Contacts matrix remain in scope);
- the React Flow canvas background, which is a documented library limitation;
- phone-theme work planned separately under `planed/phone-themes/`.

The audit treats two patterns as unfinished:

1. a direct color literal in an in-scope UI rule;
2. a `--theme-raw-*` variable that has only its original literal fallback and therefore
   normally remains visually fixed when switching Studio palettes.

The repository's initial extraction-analyzer baseline reported **1,349 in-scope hardcoded color
occurrences across 1,067 distinct literals in `src/styles.css` alone** at threshold 1.
A selector-level scan found at least **803 in-scope rule blocks with direct literals**
and **345 rule blocks using raw-only theme variables** across the current CSS files.
Those counts overlap, predate the fixes recorded below, and are discovery counts rather
than a proposed token count.

## Completed visual findings

Removed from the active backlog after implementation and focused theme-coverage tests:

- Graph `Ready` chip, Add Nodes collapse tab, and node search field.
- Provider preset tabs, Story Sampling field borders, and model action buttons.
- System Log action footer.
- Studio Files action footer and shared custom-select border.
- Storybook Phone Contacts matrix.
- Provider setup panels: preset cards, draft/role choices, llama.cpp notice,
  capability/TTS containers, ComfyUI onboarding/compatibility/checklists, provider
  tool panels, and inline provider actions.
- Provider status badges and connection text, plus model/secret field focus,
  disabled states, grouped model rows, favorites, Character LoRA variants, and
  empty model lists.
- Main-header burger menu button, including hover and open states.
- Comfy image-model load/unload states and provider action errors.
- Compression and history inspection panels, shared text fields, semantic
  source/summary/tail states, formatted-history preview, and empty preview.
- Graph system toasts with distinct informational, warning, and error tones;
  connection-button hover; graph node-count states; and the prompt-preset menu,
  headings, labels, switches, disabled states, and edit actions.
- Simulated-phone theme isolation: desktop labels and icon symbols, the clock widget,
  WhatsUp headers, and Studio-built tools opened inside the phone now resolve through
  a phone-owned palette instead of inheriting the selected Studio theme. This is an
  isolation boundary only; selectable phone themes remain in the separate phone-theme
  plan.
- Startup turn-autosave restoration dialog, including explanatory text, choice rows,
  Skip, and Restore actions.
- Shared tab-bar Save Workflow, Save RP, and Reset Workflow controls, including
  hover and disabled states, now use application roles derived from the selected
  theme's core palette rather than fixed shell-topbar colors.
- Play-mode autoplay chrome and the narration composer attachment control; the latter
  now uses a real image glyph instead of a fixed pseudo-element drawing.
- Assistant-window foundations across workflow/node help, custom-node, character, and
  image-generation assistants: backdrops, dialog shells, primary panels, headers,
  chat surfaces, message/table/code presentation, composers, core buttons, and
  custom-node diagnostics.
- Play footer cleanup: removed the pop-out-window control, retained the Switch control,
  flattened the Chat/Events rail onto the footer background, and made the character-tab
  strip use one continuous background color.
- Graph Run Trace now opens the existing in-memory Turn Trace viewer; Chat Tab Settings
  menu surfaces and states, plus the Voice Playback Close control, now use application
  theme roles.

Regression coverage: `src/app/themeCoverage.test.ts`.

## A. Graph workspace and node editor

- Base workflow node surface and active/error states.
- Note-node and group-node surfaces.
- Wire-link shapes, labels, hints, output indicators, and selected states.
- Prompt action, command, step-marker, plan-output, warning, error, and disabled states.
- Dynamic-context toolbar, collapse buttons, rule cards, active rules, arrows, remove
  actions, field labels, and collapsed previews.
- Missing-node and incompatible-node cards, descriptions, details, and hints.
- Node resize controls for load text, previews, write text, notes, groups, context
  builder, and LLM prompts.
- LLM call metric labels and values.
- Node preview surfaces.
- Note editor controls and rendered Markdown: links, blockquotes, rules, tables, code,
  scrollbars, and size controls.
- Context-compression slider, capacity bar, capacity legend, and status segments.
- Node toggles and node information button/tooltip/focus states.
- Resolver cast chips for active, user-controlled, newly engaged, and inactive states.
- Resolver, context-builder, history, workflow, and runtime-value ports.
- Context-builder load controls, draggable items, grips, labels, values, and disabled
  states.
- Character-stat controls, chart axes, chart turns, legends, toggles, and primary/
  secondary values.
- Custom-node assistant controls, error title row, diagnostic meters, preview handles,
  and function titles.
- Prompt preview modal tabs, route states, prompt/output panels, highlighted history
  blocks, labels, and empty state.
- Prompt-action character rows, badges, conditions, templates, and status notes.
- React Flow controls, node menu, remaining node-palette groups/favorites/disabled
  entries, panel resizers, and resource monitor.

Representative source range: `src/styles.css:569-6176`.

## B. Graph-specific styles still wired only through raw fallbacks

- Graph shell/canvas glass overlays.
- Graph inspector tags, facts, statistics, text rows, and routes.
- Turn-variant selector.

Source: `src/styles/graph-workbench.css`.

## C. Play-mode shell and conversation controls

- Chat header and active tabs.
- Active and muted tab badges.
- Feature-discovery hint.
- Speaker picker, narrator/speaker label, popover, and hover states.
- Auto-turn controls.
- Turn counter and turn navigation buttons.
- Composer container, heading, mode/command controls, textarea, image attachments,
  send/stop/voice/attach buttons, focus, hover, disabled, and recording states.
- RP day divider.
- Event list, event cards, unread markers, source/date labels, cancel button, detail
  view, and run button.

Representative source ranges: `src/styles.css:6208-7651`, `8496-8765`, and
`10500-11700`.

## D. Conversation cards and generated-output presentation

- Bank-transfer card body, icon, heading, status, route, amount, note, and timestamp.
- Social-post cards for Fotogram and OnlyFriends, including accents, app icons,
  metrics, content, and hover/focus states.
- Social-message cards for Fotogram, OnlyFriends, MatchMe, and WhatsUp.
- Embedded phone links and phone-message cards shown in the main conversation.
- Incoming and outgoing phone bubbles embedded in main chat.
- Created-note cards.
- Simulated-AI response cards.
- Output-action information, context, choices, progress, warning, success, and error
  states.
- Image-context badge/toggle and active/hover states.
- Message image frames, RP-time indicator, edited-caption chips, and attachment states.
- Message timeline rows, avatars, role variants, and action controls.
- Command menu, command pills, labels, examples, and hover/focus states.

Representative source range: `src/styles.css:9000-11060`.

## E. Media, image, audio, and generation UI

- Image gallery pagination.
- Full image-preview backdrop, header, buttons, caption, and side panel.
- Caption-change history list and original/updated states.
- Dark audio player progress fill is hardcoded inline in `DarkAudioPlayer.tsx`.
- Voice playback setup dialog, provider warnings/links, mode controls, result boxes,
  empty sample, generating state, and spinner.
- Remaining image-generation assistant preview/result details, metadata, and secondary
  controls.
- ComfyUI result images, field rows, file names, warnings, image strip, metadata,
  preview, and empty state.
- Run-LLM report cards, comparison panels, badges, headers, and empty state.

Representative source ranges: `src/styles.css:11100-13050` and
`src/components/DarkAudioPlayer.tsx:127`.

## F. Storybook management and editor

- Storybook file rows, more/output buttons, overwrite confirmation, and danger states.
- Storybook confirmation backdrop/dialog/actions.
- Character editor field surfaces, buttons, configured-state indicators, and disabled
  states.
- Character avatars, role badges, image counts, image controls, and delete button.
- Character voice setup and sample/result/generation surfaces.
- Comfy character preview.
- Profile-image picker backdrop, dialog, stage, crop area, and crop handles.
- Opening-history text, image descriptions, image frames, and message-count badge.
- Storybook chat panel, chat log, assistant avatar, and empty states.
- Character export/import filters, empty states, locations, and section headings.
- Storybook conversion introduction, rows, summaries, errors, assistant report, report
  controls, and token estimates.
- Storybook editor hint, valid/invalid status, toolbar actions, and fields.
- Workbench avatar, chips, overview cards, and overview photo still use raw-only
  fallbacks in `src/styles/storybook-editor.css`.

Representative source ranges: `src/styles.css:13080-15950` and `22150-22650`.

## G. Files, saved chats, diagnostics, and trace tools

- Saved-chat rows, selected state, open/info/delete actions, and empty list.
- Workflow/storybook/session file-type badges.
- Debug snapshot backdrop, popover, format tabs, compression toggle, and viewer.
- Turn-trace backdrop/dialog, prompt sections, result/preformatted output, and status
  presentation.
- System-log entry states and diagnostic content.
- Workflow-variable action buttons, including danger states.

Representative source ranges: `src/styles.css:16050-18220`.

## H. Provider, connection, and ComfyUI configuration

No remaining items currently identified. Keep this section for future visual
findings.

Representative source range: `src/styles.css:18250-19550`.

## I. Node assistant, help, welcome, and error UI

- Error-boundary screen and recovery controls.
- Node-assistant secondary content: remaining avatar variants, edit/cancel button
  refinements, and semantic markers.
- F1 node-help assistant dialog surfaces.
- Welcome/onboarding footer, indicator dots, primary/outline buttons, mock graph,
  mock conversation, keyboard shortcut badges, and format diagrams.
- RP-save, workflow, Storybook, opening-history, and character-card format diagrams.

Representative source range: `src/styles.css:19560-21540`.

## J. Character metadata components outside the main stylesheet

- Relationship cards, names, connection summaries, app-link pills, remove action, and
  mention-result popovers use only raw fallbacks in
  `src/components/characterRelationships.css`.
- Agency pill toggles and footer buttons retain direct fixed translucent colors in
  `src/components/characterAgencyField.css`.
- Account tab active state and account created/not-created status colors use only raw
  fallbacks in `src/components/characterAppProfiles.css`.
- The profile registration editors under `.social-profile-*` remain intentionally
  excluded and are not part of this cleanup.

## K. Other raw-only Studio surfaces

- Studio play-header overlay and native theme-picker options in
  `src/styles/studio-theme.css`.
- Detached roleplay popout document background in `src/styles/popout.css`.
- Composer context placeholder in `src/styles/roleplay-dual-pane.css`.
- Physical simulated-phone status bar, home control, screen, case, bezel, reflections,
  and shadow currently use raw-only Studio variables. These should not be converted to
  new Studio semantic tokens if the planned phone-theme separation will immediately
  move ownership to the phone-theme system.

## L. Hardcoded colors in TypeScript/TSX

- React Flow dotted background: `src/App.tsx` uses `#273043`. The surrounding canvas
  limitation is documented, but the dot color itself is still a fixed value and should
  be assessed separately from the opaque canvas background.
- Compatible/incompatible file glyphs: `StudioDialogs.tsx` uses fixed green/red
  strokes.
- Narrator composer label and fallback character-picker colors:
  `ChatConversationPanel.tsx` and `EdgeCharacterPicker.tsx`.
- Audio progress track: `DarkAudioPlayer.tsx`.
- Workflow pending/complete/prepared colors: `src/workflow/defaults.ts`.
- Dialogue quote color rotation: `src/chat/textRendering.ts`.
- Character-stat chart series palette: `src/nodes/character-stats/Card.tsx`.
- One roleplay-panel fallback text color in `src/app/useRoleplayPanelRuntime.ts`.

These data/status palettes need an explicit decision: semantic theme tokens, deliberate
fixed accessibility/status colors, or per-character/data colors. They should not be
mechanically collapsed into the main accent.

## Recommended cleanup order

1. Replace hardcoded **structural surfaces** first: backgrounds, panels, borders,
   inputs, ordinary text, hover/focus surfaces, and shadows.
2. Replace raw-only structural tokens with existing semantic `color.*`, `shell.*`,
   `graph.*`, `storybook.*`, or `app.*` tokens; add new semantic roles only when the
   existing roles are genuinely insufficient.
3. Handle graph/node status and data-visualization palettes as a separate semantic
   pass so success/warning/error and series colors remain distinguishable.
4. Migrate dialogs and secondary tools by feature group, keeping focused screenshots
   or computed-style checks per group.
5. Leave protected phone/profile rules untouched and hand physical phone ownership to
   the later phone-theme project rather than deepening Studio-theme coupling.
6. Finish with a static regression test that rejects new direct in-scope color literals
   except an explicit reviewed allowlist, then perform live switching across several
   maximally different themes.
