# RPGraph Theme Specification Template

Produce a self-contained implementation prompt. Omit unsupported or irrelevant sections, but never omit material constraints or unknowns.

## 1. Objective and scope

- RPGraph repository/version/commit state, if known.
- Theme label and proposed lowercase-hyphenated id.
- Intended user and dominant workflow.
- Target destination: bundled development theme or packaged per-user theme.
- Files expected to be created; files and behaviors explicitly preserved.
- Verified engine constraints: inheritance, derivation, restart/discovery behavior, excluded surfaces.
- Current stage: **concept specified; no theme file created**.

## 2. Visual thesis

Write one or two sentences connecting atmosphere, repeated-use context, and a memorable identity. Add three to five governing principles and two to four concrete anti-patterns.

## 3. Native token mapping

Use actual dotted keys verified in the current checkout.

| RPGraph key | Proposed value | Role and intended result | Source of decision | Validation pair/surface |
| --- | --- | --- | --- | --- |
| `color.background` | Exact CSS value | Outermost app background | User choice / proposed default | Main shell |

Group rows by `color`, deliberate `shell` overrides, deliberate `graph`/`storybook`/`app` divergence, optional phone-app namespaces, `typography`, `shape`, `effect`, and `motion`. Omit inherited values unless documenting their inheritance materially improves implementation clarity.

Do not present explanatory aliases as native keys. If aliases help reasoning, put them in a separate “design roles” table and map each to real keys.

## 4. Themeable RPGraph surfaces and states

Describe only current surfaces and state cues proven in docs/source:

- Play shell: header/topbar, chat content, message bubbles, composer, tabs/rail, buttons, inputs, dialogs, menus, badges.
- Graph mode: surrounding canvas/workbench chrome, sidebars, panels, node cards, lines/connectors, ports/status accents where consumed. State explicitly that the canvas background behind nodes is fixed.
- Storybook editor: panels, text hierarchy, lines, accents, badge/highlight roles when supported.
- Shared application dialogs and semantic status colors.
- Independently themed phone apps only when explicitly in scope.

For default, hover, selected/active, focus, disabled, complete/success, warning, and danger states, name the actual token or existing CSS behavior that distinguishes the state. If no separate native control is verified, say it inherits existing RPGraph behavior. Never invent a state token or animation.

## 5. Typography, density, material, and motion

- Font stacks and weights, including availability assumptions.
- Base size/line height only; acknowledge that theme files do not redesign spacing/layout density.
- Radius/border rules by supported token.
- Exact supported shadow, glow, texture, and button-background values with placement and fallback.
- Transition duration/easing/hover scale, plus a static choice for motion-sensitive users when requested.

## 6. Accessibility and usability checks

Define checks, not blanket compliance claims:

- contrast of every actual foreground/background pair used for body text, muted text, primary buttons, selected tabs/nodes, message bubbles, inputs, and status text;
- distinguishability of graph lines, node chrome, ports/statuses, selection, active tabs, focus cues, disabled controls, warning, and danger;
- long roleplay text and long labels at the proposed `baseSize`/`lineHeight`;
- non-color cues already provided by RPGraph; document where the theme cannot add new ones;
- motion/glow sensitivity and legibility under the actual composited backgrounds.

Record each as passed, failed, or unverified after implementation. Do not claim WCAG conformance without measuring applicable rendered pairs and interactions.

## 7. Mockup plan

Name the representative elements: application shell, small graph, selected/unselected node, one status state, one toolbar/sidebar/dialog/input, swatches, and one or two signature details. Repeat the required concept-only label and identify visual approximations.

## 8. Implementation plan after approval

1. Reinspect current docs, token source, resolver, destination, and existing id collisions.
2. Create `<id>/theme.json` with `id`, `label`, `extends`, optional `order`, and only necessary overrides.
3. Parse JSON and check authored keys against current consumers.
4. Resolve/load through the appropriate RPGraph path; restart packaged RPGraph for a user theme when required.
5. Select it only if separately requested; inspect representative Play, Graph, Storybook, dialog/menu, and scoped phone-app surfaces.
6. Run repository tests appropriate to a bundled theme, or document why those tests do not cover an external user theme.
7. Fix theme-file defects, then report exact evidence and revert steps.

## 9. Acceptance criteria

- The folder/id convention and required fields are correct.
- Every authored key is a verified current RPGraph key with a real consumer.
- Inheritance and derivation are intentional; no “completeness” overrides accidentally freeze derived surfaces.
- Theme discovery/loading succeeds in the target environment.
- Named surfaces express the thesis while remaining readable.
- Selected/active/focus/status distinctions are observed or explicitly unverified.
- Unsupported requests are documented, not silently ignored.
- No unrelated source or behavior changes occur.
- Mockup, generation, validation, and activation statuses are reported separately.

## 10. Unknowns and limitations

List all unresolved repository facts, environment restrictions, unmeasured contrast pairs, unrendered surfaces, and approximations. Give the next specific check for each.
