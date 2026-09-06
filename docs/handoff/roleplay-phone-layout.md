# Roleplay Phone Layout

Worktree: `.worktrees/storybook-hybrid-mockup`
Branch: `codex/storybook-hybrid-mockup`
Base: `7cbe62c` (`codex/ktello-uiV2-migration`)

## Changes

- Removed the upper surface navigation and session header from the roleplay area.
- Character tabs remain at the top and select the phone owner as well as the RP speaker. Narrator retains the last character's phone.
- Phone and RP chat now stay mounted side by side. Events replace the right pane; the phone stays available.
- Session actions, themes, and Graph Mode are accessible from the lower Session menu. Chat and Events remain in the lower controls.
- Added a 430 x 932 logical handset that scales uniformly to fit its available space. Chat takes the remaining width. The phone has a bezel, status area, and home gesture button.
- Added icon press feedback, a brief launch delay, app entry transitions originating at the pressed icon, and reduced-motion support.
- WhatsUp now uses a contact list followed by a full-width conversation, with a Back to chats action.
- Camera's existing image-generation assistant can render inside the handset instead of covering the workspace. Other uses retain the full dialog.
- New-profile home layouts put the clock above two rows of app icons. Existing persisted layouts remain stored.
- Drag coordinate calculations account for handset scaling and actual CSS grid dimensions.
- RP chat continues following new messages while the phone is active, unless the reader has scrolled away from the bottom.

## Implementation

- `src/components/RoleplayPhoneDevice.tsx`: stable handset dimensions and ResizeObserver-based scaling.
- `src/components/RoleplayStudioShell.tsx`: character-first layout and lower session controls.
- `src/App.tsx`: simultaneous phone/chat mounting and focus routing.
- `src/app/useRoleplayPanelRuntime.ts`: phone ownership, home navigation, chat following.
- `src/components/PhonePanel.tsx`: app launching, handset drag coordinates, WhatsUp navigation.
- `src/components/PhoneImagePicker.tsx` and `ImageGenerationAssistantDialog.tsx`: embedded camera assistant.
- `src/settings.ts` and `src/styles.css`: default home positions and layout styling.

## Verification

- `npm run build`: passed.
- `npx vitest run src/settings.test.ts`: 2 passed.
- `npx playwright test test/e2e/uiOverhaulShell.spec.ts`: 9 passed.
- Phone checks cover all eight apps, home navigation, phone ownership, Events access, side-by-side geometry, and constant aspect ratio at 1440, 1000, and 600 pixel widths.
- Screenshots are generated under ignored `test/results/roleplay-*.png`.
- Targeted lint reports two pre-existing React hook errors and one warning in PhonePanel/useRoleplayPanelRuntime. The same findings were reproduced against the unchanged migration worktree.

## Scope

This is a working React/Electron layout change. The earlier single-file storybook mockup remains a separate artifact in `docs/design/rpgraph-edit-storybook-hybrid.html`.
No live provider generation or message sending was exercised by the UI tests. Existing phone data and provider integrations are reused.
The broader settings/workflow improvement goal remains ongoing.

Run the built desktop app from this worktree with `npm run desktop:windows`.
