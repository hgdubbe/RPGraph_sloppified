# RPGraph Phone Concept Mockup Guidance

The mockup is a review aid between specification and implementation. It is mandatory, small, disposable, and never proof that RPGraph loaded a theme.

## Choose the medium

Inspect the host first:

1. Prefer a local static HTML/CSS board shaped like a phone screen when the agent can create and render local files. Keep it isolated from RPGraph source and do not import application components or theme manifests.
2. Use an image-generation or drawing capability when available and better suited to visual review. Base the scene on the actual phone screen structure for each in-scope app (status bar, icon grid, chat list, ledger rows, etc. — not a generic phone mockup template).
3. Use a structured Markdown swatch/component board only when visual rendering is impossible. State that limitation.

Do not install a framework, add a dependency, start a full redesign, or write into an RPGraph theme directory for the mockup.

## Required content, per in-scope namespace

Fit each in-scope app's concept into one compact panel (multiple apps = multiple small panels, not one panel trying to represent all six):

- **`phoneHome`:** a phone-shaped frame with a wallpaper/scrim, a few app icons with their (unchanged) icon glyphs but the proposed label/badge treatment, the clock widget, one desktop widget card, and the bottom dock. Show one badge on an icon (e.g. WhatsUp) and, if `badgeBanking` differs, one on Banking too.
- **`phoneNotes`:** 2-3 sticky-note cards showing a sample of the 8 tints side by side (not all 8 crammed tiny — enough to judge coherence), plus the composer chrome.
- **`phoneChatgpd`:** a short message exchange showing the assistant bubble/glass treatment and the accent-colored send affordance.
- **`phoneBanking`:** a short ledger with one success (incoming) and one danger (outgoing/failed) row, clearly distinguishable.
- **`phoneGallery`:** the image stage backdrop next to the surrounding chrome, plus one badged thumbnail.
- **`phoneSocial`:** if both brands are in scope, two small panels side by side — Fotogram and OnlyFriends — each showing their brand accent/card so the reviewer can judge distinguishability directly; if only one brand, one panel plus the shared chrome.

## Fidelity rules

- Preserve each app's existing information architecture and rough proportions. Approximate content; do not invent a new phone feature or app.
- Represent only token-controlled appearance. Do not demonstrate icon-glyph changes, layout changes, new dock apps, or new note-taking features as if theming could add them.
- Reuse the exact proposed values from the specification. Any rendering shortcut must be named.
- For `phoneNotes`, render the bare `R, G, B` triplets as actual `rgb(R, G, B)` in the mockup's own CSS (the mockup is free-standing HTML, so it doesn't need the triplet format the real token uses) — but say so, so the reviewer knows the real file will store it differently.
- Keep mockup files separate from the eventual `<id>/theme.json` destination.

Display this exact label prominently:

> Concept mockup only — this is a visual direction preview, not a generated or validated RPGraph theme.

## Review gate

Present the mockup with a concise request:

"What should change before I write these tokens into the theme file? You can adjust the palette, contrast, per-app distinctiveness, or signature details for any app shown. Reply with corrections, or explicitly say `create the theme file` (or `write these tokens`) when you want implementation."

If the user asks for changes, revise both specification and mockup. "Looks good" approves the concept but does not authorize file generation; ask for the explicit implementation phrase if they want to proceed.
