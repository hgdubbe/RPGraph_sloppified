# RPGraph Phone Theme Interview Guide

Use this as a branching question bank, not a questionnaire. Ask one to three related questions at a time in the user's language. Do not ask technical questions answered by the repository.

## Open with scope and identity

Establish only missing decisions:

- Which phone surfaces are actually in scope: the home screen (`phoneHome`), and/or which of the five apps (Notes, ChatGPD, Banking, Gallery, Fotogram/OnlyFriends via `phoneSocial`)? Default to only the ones the user names — do not assume "the phone" means all six.
- Is there an existing theme this should be added to (the common case), or is a brand new theme needed first? If the latter, hand off to `rpgraph-theme-designer-skill` for the base theme, then return here for the phone block.
- Two or three desired qualities per in-scope app, and at least one anti-goal. A user may want radically different moods per app (a clinical banking app next to a playful Notes app) — don't force one mood across all of them unless they want that.
- Intensity: subtle retint, clearly distinctive, or a bold reskin.
- Anything about the current shipped phone look that must stay recognizable (e.g. "keep WhatsUp green, just fix the badge color").

Good prompt: "Which phone apps actually matter for your roleplay — just the home screen, or specific apps too — and should each keep its current personality or get a real reskin?"

## Branch only into supported choices, per app

- **Home screen (`phoneHome`):** Ask about the wallpaper scrim tint, clock widget mood, desktop widget cards, notification badge color(s) (note: `badge` is the general badge color, `badgeBanking` is separate), and the online-status dot. Mention the dock explicitly reuses `widgetBackground`/`accent` — there's no separate "dock color" to ask about. **If the user also wants corner sharpness/roundness or a monochrome icon set, stop and redirect**: `phoneHome.*` here has no shape or icon-coloring leaves at all — that's the sibling `phone-theme.json` engine's job (see the capability map's note on it), not this skill's.
- **Notes:** Ask whether they want the accent/background feel changed, and whether the 8 sticky-note tint colors should be redesigned as a set (they're a deliberate palette of 8, not one accent — a "redesign the tints" request means proposing 8 new `R, G, B` triplets, not one color). Clarify up front that these are bare RGB triplets, not hex, if the user wants to hand-author them.
- **ChatGPD:** Ask about the assistant-bubble feel (`glass`, `panelStrong`) versus the accent used for buttons/highlights (`accent`/`accentBright`/`accentLight`/`accentDeep`).
- **Banking:** Ask whether they want a "trustworthy fintech" feel, a "gritty ledger" feel, or something else — `success`/`danger` still need to read clearly as positive/negative transactions regardless of mood.
- **Gallery:** Ask about the stage (image viewer backdrop) versus the surrounding chrome (`panel`/`line`), and the `badge` used for new-image indicators.
- **Fotogram/OnlyFriends (`phoneSocial`):** Always ask which brand(s) — "both, same direction," "both, but distinct," or "just one." If both but distinct, get separate direction for each brand's `*Accent`/`*AccentStrong`/`*Card` set; if shared chrome should also shift, that's the plain `phoneSocial.*` leaves.
- **References:** Ask what aspect of a referenced real app (WhatsApp, real banking apps, Instagram, etc.) they like — palette, material, restraint — not a literal clone. Do not copy another product's exact branding/logo wording.

## When the user is vague

For "make the phone feel more real" or "give it personality," offer two or three feasible directions scoped to *which apps* rather than a single blanket palette swap, for example:

- **Minimal touch:** just `phoneHome` gets a mood-matching accent and badge color; every app keeps its shipped default so nothing else changes.
- **Chat-first:** `phoneHome` plus `phoneChatgpd` and `phoneSocial` get a coordinated warm/cool direction (the apps a roleplay-heavy user actually opens most), Banking/Gallery/Notes stay default.
- **Full reskin:** all six get a coherent direction, with `phoneSocial` explicitly asked to keep Fotogram/OnlyFriends distinguishable from each other even under one theme.

Recommend the middle option unless the user has clearly asked for "everything" or "just the home screen." Do not default automatically to making every app share one identical accent color — the whole point of these namespaces is that apps can (and often should) look like different apps.

## Brief and stopping rule

Maintain:

- verified phone-namespace capabilities and the `phoneHome` registration gap, if relevant to what the user is asking;
- in-scope apps and out-of-scope apps (explicitly noted as "left at default");
- user decisions per in-scope app;
- proposed defaults;
- rejected traits;
- unresolved questions;
- validation plan.

Resolve contradictions with a concrete allocation, e.g.: "Banking stays clinical and low-saturation so transaction status still reads clearly; the home screen and Fotogram carry the bold color identity instead."

Stop when every in-scope app has a coherent direction, `phoneSocial`'s brand scope is unambiguous, any bare-RGB Notes tints are specified in the right format, anti-goals are recorded, and a validation plan exists. Delegated choices are permission to choose design defaults, not permission to write the theme file.
