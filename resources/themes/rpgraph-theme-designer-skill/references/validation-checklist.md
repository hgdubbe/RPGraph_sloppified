# RPGraph Theme Validation Checklist

Run this only after explicit approval has allowed creation of the real theme file. Record each check as **pass**, **fail**, or **unverified**, with evidence.

## 1. Destination and safety

- Confirm the target is a bundled repository theme or a packaged per-user theme.
- Confirm `<id>` is lowercase/hyphenated, folder name matches `id`, and no existing theme will be overwritten without specific approval.
- Verify only the approved theme file and any separately approved review artifacts changed.
- Keep user themes outside installed bundled resources unless the user explicitly requested a bundled contribution.

## 2. Static manifest checks

- Parse `theme.json` as JSON.
- Require non-empty string `id` and `label`.
- Check `extends` resolves to an available theme; normally use `base`.
- Check `order`, when present, is numeric and intentional.
- Do not author loader-owned `source`.
- Compare every `basic` and `tokens` leaf against current `themeTokens.ts`, resolver rules, and actual CSS consumers. Unknown keys are a failure unless source inspection proves a current custom consumer.
- Validate value syntax against the consuming CSS property. Pay special attention to RGB-triplet Notes tints, font stacks, dimensions, shadows, `clip-path`, transitions, and hover scale.
- Prefer parseable hex/rgb/rgba values for colors that feed derivation; flag HSL, named colors, and CSS Color 4 inputs used as derivation sources.

## 3. Resolution and discovery

- Confirm the inheritance chain resolves without a cycle or missing parent.
- Confirm guaranteed tokens resolve and deliberate optional omissions have CSS fallbacks or derivations.
- For a bundled theme, run:

  `npx vitest run src/app/themeTokens.test.ts src/app/studioTheme.test.ts`

  Add `src/app/themeExclusions.test.ts` only if shared styles or token plumbing changed; ordinary theme-file creation should not change those files.
- For a per-user theme, verify the packaged loader discovers it after the required restart. Repository tests over bundled fixtures do not prove discovery of an external user file.
- Distinguish parser success, resolver success, registry discovery, picker visibility, selection, and runtime application.

## 4. Representative visual inspection

When the environment permits, select the theme and inspect:

- Play shell: header, content, assistant/user bubbles, composer/input, tabs/rail, buttons, menu/dialog, muted text, long content.
- Graph mode: workbench chrome, panels, node cards, edges/connectors, ports/status accents, selected/active state. Note the fixed xyflow canvas background.
- Storybook: panels, text, dividers, badges/highlights.
- Shared dialog/status treatment: success/complete, warning, danger/error, focus, disabled, hover/active where present.
- Each independently themed phone app included in scope; otherwise confirm it remains intentionally unchanged.
- Portaled controls such as dropdowns, because theme variables are also applied at the document root.

Compare the live result with the specification, not just the concept mockup.

## 5. Accessibility and usability

- Measure relevant rendered foreground/background contrast pairs, including alpha compositing and gradients.
- Confirm selected nodes/tabs, focus cues, graph edges/ports, warning, danger, completion, and disabled states remain distinguishable.
- Check long labels, long roleplay text, proposed base size/line height, uppercase use, glow, and hover scaling for readability.
- Confirm the theme did not make essential meaning color-only; where RPGraph itself supplies no alternate cue, document that limitation rather than claiming compliance.
- Check motion/glow sensitivity requirements and the requested static/reduced treatment.

## 6. Report

State separately:

- theme file generated;
- JSON/static checks passed or failed;
- resolved/discovered/loaded;
- visually inspected surfaces;
- selected/activated, if separately requested;
- unverified checks and why;
- exact changed file(s) and focused revert path.

Never claim “validated” without naming the validation layer and evidence.
