# RPGraph Concept Mockup Guidance

The mockup is a review aid between specification and implementation. It is mandatory, small, disposable, and never proof that RPGraph loaded a theme.

## Choose the medium

Inspect the host first:

1. Prefer a local static HTML/CSS board when the agent can create and render local files. Keep it isolated from RPGraph source and do not import application components or theme manifests.
2. Use an image-generation or drawing capability when available and better suited to visual review. Base the scene on actual RPGraph structure.
3. Use a structured Markdown swatch/component board only when visual rendering is impossible. State that limitation.

Do not install a framework, add a dependency, start a full redesign, or write into an RPGraph theme directory for the mockup.

## Required content

Fit the concept into one compact board or viewport:

- RPGraph shell/header and a restrained canvas/work area;
- a miniature graph with two or three representative nodes, visible edges/ports, and selected versus unselected treatment;
- one supported status such as complete/success, warning, danger, or disabled;
- one representative toolbar, sidebar/inspector, dialog/menu, or input;
- core swatches labelled by semantic role and mapped to native RPGraph keys;
- one or two signature details that communicate the thesis.

If the specification deliberately themes Storybook or a phone app independently, substitute one small representative panel rather than expanding the board into a second application.

## Fidelity rules

- Preserve RPGraph's existing information architecture. Approximate proportions and content; do not invent a new workflow.
- Represent only token-controlled appearance. Do not demonstrate unsupported layout changes, keyframe motion, custom imagery placement, automatic light/dark switching, or the Graph canvas background as if it were themeable.
- Reuse the exact proposed values from the specification. Any rendering shortcut must be named.
- Include at least one foreground/background text pair and one graph readability example.
- Keep mockup files separate from the eventual `<id>/theme.json` destination.

Display this exact label prominently:

> Concept mockup only — this is a visual direction preview, not a generated or validated RPGraph theme.

## Review gate

Present the mockup with a concise request:

“What should change before I create the RPGraph theme file? You can adjust the palette, contrast, density, graph styling, mood, or signature details. Reply with corrections, or explicitly say `create the theme file` when you want implementation.”

If the user asks for changes, revise both specification and mockup. “Looks good” approves the concept but does not authorize file generation; ask for the explicit implementation phrase if they want to proceed.
