# RPGraph Theme Design Quality

Use this when the user delegates visual choices, uses broad mood words, or the concept risks becoming a palette-only swap.

## Build an RPGraph-native thesis

A strong thesis names the emotional tone, dominant RPGraph workflow, memory hook, and where restraint protects repeated use.

Weak: “futuristic dark.”

Stronger: “A precise late-night graph studio: nearly neutral layered surfaces, cool signal-cyan for active paths, and sharp low-radius controls. Keep long roleplay text quiet; let selected nodes and topbar context carry the technical identity.”

Translate the thesis across supported axes:

- **Color:** establish a surface hierarchy across the distinct `color.*` roles. Separate decorative accents from completion, warning, and danger. Design actual foreground/background pairs.
- **Typography:** use available font stacks, weights, transform, size, spacing, and line height. Typography tokens do not supply font files.
- **Geometry:** use base/card/button/input radii, border width/style, and optional clip path. Respect fixed component layout.
- **Material:** place shadows, glow, and header texture only where their tokens are consumed. One deliberate detail is stronger than blanket glass or glow.
- **Motion:** use duration, easing, and hover scale only. Static themes are complete.
- **Surface identity:** normally let Graph, Storybook, and shared app palettes derive from `color.*`; override them only when intentional divergence supports the thesis.
- **Phone-app identity:** leave independent app brands alone unless retheming them is an explicit part of the concept.

## RPGraph-specific anti-drift checks

- Do not collapse `background`, `backgroundElevated`, `header`, `surfaceRail`, `surfaceContent`, `panel`, `card`, `cardStrong`, and `input` into one vague “background.”
- Do not treat accepted custom keys as visible capabilities.
- Do not promise to recolor the Graph canvas background behind nodes.
- Do not express density through imaginary spacing/layout tokens.
- Do not introduce web landing-page composition, Tailwind/React recipes, or component redesigns.
- Do not make selected graph elements, primary actions, and danger states compete with the same accent.
- Avoid generic purple-blue gradients, pervasive glass, and neon glow unless the user chose them and the exact supported tokens/placements serve the thesis.
- Do not claim accessibility from color names or isolated swatches; check rendered pairs and state distinctions.

## Final audit

- Can the theme be recognized by more than its dominant hue?
- Does every identity detail map to a current RPGraph key and consumer?
- Are long reading sessions and dense graph work still comfortable?
- Are selected/active, complete/success, warning, danger, muted, and disabled treatments distinguishable where RPGraph exposes them?
- Are fixed and excluded surfaces acknowledged?
- Are approximations and unverified effects named?

If an answer is no, refine concrete token roles or reduce the claim. Do not add unsupported effects to make the concept sound richer.
