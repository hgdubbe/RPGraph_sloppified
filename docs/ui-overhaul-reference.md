# RPGraph UI Overhaul Reference

Date: 2026-08-30
Branch: `codex/ui-overhaul`

Purpose: preserve the approved design direction for the RPGraph UI overhaul so future implementation work can refer back to it without re-litigating the core product and visual decisions.

## Core Direction

RPGraph Studio should feel like a story-first roleplay studio with an immersive character phone and a full-power workflow editor. The overhaul must not sacrifice existing functionality. The current graph, node editing, provider setup, files, assistant, roleplay chat, phone apps, events, social apps, banking, gallery, notes, voice, image generation, run trace, undo, regeneration, AutoTurn, and workflow debugging behavior all remain in scope.

## Product Model

- Default experience: Play Mode / roleplay cockpit.
- Power experience: Graph Mode / full-canvas workflow editor.
- Bridge: every story output can expose a "why this happened" run trace that links back to the exact graph path, prompt route, provider call, parser result, and error/repair state.

## Non-Negotiables

- Do not compress the graph into a drawer-style layout. RPGraph workflows resemble ComfyUI graphs: large, spatial, highly editable, and hard to shrink without harming usability.
- Graph Mode must give the graph the full screen. Floating/collapsible overlays are acceptable for node palette, search, minimap, and inspector; the canvas remains primary.
- Do not remove or simplify features to make the redesign cleaner. Reorganize complexity; do not delete it.
- Orange / amber accents are rejected. Avoid using orange as a primary action, status, or brand color in the overhaul.
- Avoid generic "default AI design" markers: sterile dashboard cards, generic SaaS composition, needless pills/badges, clinical hero framing, and decorative filler.

## Visual Direction

Use a darker, immersive studio language with character and app-specific color where it has meaning:

- Active / focus: cyan or electric teal.
- Success / completed: green or lime.
- Player / identity: violet or character-assigned colors.
- Social surfaces: app-native colors and recognizable patterns.
- Error: red.
- Avoid warm amber/orange as a recurring system accent.

The UI may stay somewhat clinical where precision matters, but should feel purpose-built, not template-generated.

## App And Phone Direction

The Phone surface is for immersion. It should vaguely resemble using an actual phone, not a generic admin panel.

The in-world apps should evoke their real-life counterparts without copying protected branding exactly:

- WhatsUp should feel like WhatsApp: green messaging, phone chat conventions, contact list, message bubbles, media/reply affordances.
- Fotogram should feel like Instagram: image-first feed, story/social gradients, likes, comments, DMs, profile/account conventions.
- OnlyFriends should feel like OnlyFans: creator/subscriber dynamics, paid/unlocked posts, wallet/tips, blue creator-platform cues.
- Gallery should feel like a native phone image gallery: albums/grid, image viewer, selection, share/use-in-chat flow.
- ChatGPD should feel like a ChatGPT-style assistant app inside the character phone.
- Banking, Notes, Camera, and Gallery should feel like phone-native utilities owned by the selected character.

## Layout Model

Play Mode:

- Persistent roleplay cockpit, not a hover-dependent drawer.
- Character strip is first-class: Narrator plus playable characters with unread/activity state.
- Activity navigation gives fast access to Chat, Phone, Gallery, Social, Events, Bank, Notes.
- Main timeline can show story prose plus inline app artifacts such as phone messages, social posts, image cards, bank transfers, notes, choices, events, and context bars.
- Composer is mode-aware and preserves commands, attachments, voice, AutoTurn, regeneration, undo, and run/cancel states.

Graph Mode:

- Full-canvas graph editor, similar in spirit to ComfyUI.
- Node cards stay editable at useful sizes.
- Node palette/search can float over the canvas.
- Inspector can float or dock but must not squeeze the graph into an unusable column.
- Last-run path highlighting should make debugging visible without changing graph editability.

Run Trace Bridge:

- From a story/chat/app output, users can inspect why it happened.
- The bridge starts human-readable, then expands into technical details: node ids, ports, prompt slots, raw JSON, provider, tokens, duration, parser warnings, and repair actions.

## Mockup References

- Earlier sidebar idea: `docs/rp-sidebar-layout-mockup.html`
- Conversation visualization mockup V2: `C:/Users/hen/.codex/visualizations/2026/08/30/01a0531d-4be8-73b0-a8c1-1e03e2652a7a/rpgraph-remake-mockups-v2.html`

Use the V2 mockup as direction, not as a pixel-perfect spec. The next design pass should become more immersive and less generic, especially for the phone and app surfaces.
