# RPGraph Theme Interview Guide

Use this as a branching question bank, not a questionnaire. Ask one to three related questions at a time in the user's language. Do not ask technical questions answered by the repository.

## Open with use and identity

Establish only missing decisions:

- Working theme name.
- Primary use: long roleplay reading/writing, graph editing, Storybook editing, phone-heavy play, or balanced use.
- Two or three desired qualities and at least one anti-goal.
- Intensity: subtle, distinctive, bold, or a user-defined point between them.
- Existing RPGraph identity or behavior that must remain recognizable.

Good prompt: “Which part do you spend the most time in—Play, Graph, Storybook, or a mix—and should the theme feel restrained, clearly distinctive, or bold?”

## Branch only into supported choices

- **Palette:** Ask about required hues, disliked hues, brand constraints, or permission to choose. Separate decorative accents from success, warning, danger, completion, selection, and readable text.
- **Mode:** RPGraph has no single-manifest light/dark variant mechanism. Ask dark, light, or separate paired themes only if the user cares. Explain that “both” means two manifests, not an automatic mode inside one file.
- **Density:** Tokens can change base size and line height, but not layout spacing or information architecture. Translate “compact/spacious” only within those controls and the current UI's fixed layout.
- **Typography:** Ask only if font character matters. Clarify that a theme supplies a font stack, not font files; preserve defaults or choose installed/system-safe fonts unless availability is known.
- **Geometry/depth:** Sharp/rounded, flat/outlined/elevated, texture/glow/none. Map to `shape.*` and `effect.*`; explain that effect placement is fixed.
- **Motion:** None, restrained feedback, or stronger hover response through `motion.*`. Do not promise keyframes or per-component animation.
- **Graph:** Ask whether graph chrome/nodes/edges should follow the main palette or deliberately diverge. Do not promise control of the xyflow canvas background.
- **Storybook:** Ask about a separate editor mood only if it matters; otherwise keep derived consistency.
- **Phone apps:** Ask only if the user explicitly wants Notes, ChatGPD, Banking, Gallery, Fotogram, or OnlyFriends rebranded. Their palettes do not follow the main theme automatically.
- **Accessibility:** Ask about low vision, color-vision needs, photosensitivity, preferred contrast, text size, or motion sensitivity when relevant. Phrase outcomes as checks, not compliance promises.
- **References:** Ask what aspect they like or dislike—palette, material, typography, contrast, or restraint. Do not copy another product wholesale.

## When the user is vague

For “futuristic,” “pretty,” or “surprise me,” offer two or three feasible directions. Make them visibly different through supported choices, for example:

- restrained industrial dark: near-neutral surfaces, precise cyan accent, sharp geometry, no glow;
- warm archival dark: brown-black layers, parchment foreground, amber accent, mild header texture;
- crisp high-contrast technical: flat surfaces, bright selection/accent, compact type, minimal shadow.

Recommend one based on the user's dominant RPGraph workflow. Do not default automatically to purple-blue gradients, blanket glass, or neon glow.

## Brief and stopping rule

Maintain:

- verified RPGraph capabilities;
- user decisions;
- proposed defaults;
- rejected traits;
- preserved content and behavior;
- themeable surfaces/states in scope;
- unresolved questions;
- validation plan.

Resolve contradictions with a concrete allocation. Example: keep graph/editor surfaces compact and quiet while letting the header texture and primary actions carry the expressive identity.

Stop when the theme has a coherent thesis, core palette/state strategy, supported geometry/effects/motion choices, scoped surface priorities, anti-goals, and validation plan. Delegated choices are permission to choose design defaults, not permission to write the theme file.
