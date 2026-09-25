---
name: rpgraph-phone-theme-designer-skill
description: "Use when designing, reviewing, generating, or validating the phone-app token blocks (phoneNotes, phoneChatgpd, phoneBanking, phoneGallery, phoneSocial, phoneHome) inside an RPGraph Studio theme.json — retinting the simulated phone's home screen/dock and its five in-world apps independently of the main Studio palette."
---

# RPGraph Phone Theme Designer

Guide a user from visual intent to valid `phoneNotes.*`/`phoneChatgpd.*`/`phoneBanking.*`/`phoneGallery.*`/`phoneSocial.*`/`phoneHome.*` token blocks inside an RPGraph Studio `theme.json`. This is a narrower sibling of [rpgraph-theme-designer-skill](../rpgraph-theme-designer-skill/SKILL.md), scoped to the six independent phone-app namespaces instead of the whole Studio palette. This is an agent workflow, not a theme and not a Codex-specific integration. Use the host's ordinary conversation, repository inspection, file-editing, rendering, and test capabilities. When a capability is unavailable, continue as far as possible and label the missing work.

## When to use this skill instead of (or alongside) the general one

- The user's request is centered on the phone — "make WhatsUp look like real WhatsApp," "give the banking app a fintech feel," "retheme the home screen for my goth character" — not on Play mode, Graph mode, or Storybook.
- An existing theme already covers the main Studio palette and the user now wants its phone identity designed or refreshed, as a follow-up.
- A user explicitly wants the phone apps to stay visually independent of whatever Studio theme is active (the default, unthemed behavior) but wants that independent look designed deliberately rather than left at its shipped default.

Use the general `rpgraph-theme-designer-skill` first (or instead) when the request is about the overall Studio identity and the phone is, at most, one line item in it — its interview guide already asks "do you want the phone apps rebranded too?" as a branch. Reach for *this* skill when phone-app identity is the actual deliverable, or when it needs the depth the general skill's single interview branch cannot give it (six independent namespaces, a dual-brand app, bare-RGB tint tokens, an undocumented-in-`CORE_TOKEN_KEYS` namespace — see the capability map). Both skills write into the same `theme.json`; they never conflict, only divide the work.

## Invariants

- Treat the current repository as authoritative. Before the interview, read `resources/themes/THEMING-INTERNALS.md` (especially "Independent per-app tokens" and the exclusion boundary), `resources/themes/README.md` ("Independent simulated phone apps"), `src/app/themeTokens.ts`, the five `src/styles/phone-{notes,chatgpd,banking,gallery,social}.css` files plus `src/styles/phone-widgets.css` (phoneHome's home), `src/components/PhonePanel.tsx` for what each app/screen actually renders, and any shipped theme that already sets one of these blocks (`neon-social/theme.json` and `kawaii-dream/theme.json` currently do, for `phoneHome`). Reinspect when repository state may have changed.
- Translate intent only into verified phone-namespace keys or CSS values accepted by those fields. Never invent schema keys, layout controls, component behavior, or validation results. In particular, never invent a home-screen dock token — the dock reuses `phoneHome.widgetBackground`/`phoneHome.accent` and has no tokens of its own (see the capability map).
- Keep four statuses distinct: **concept specified**, **mockup created**, **theme block generated**, **theme block validated**. Activation/selection of the *whole theme* is a fifth, separate status, and is usually outside this skill's scope (the theme likely already exists and is already active — this skill edits its phone block in place).
- Do not write, replace, or activate a real theme before the user gives explicit implementation approval after reviewing both the specification and mockup.
- Do not modify `PhonePanel.tsx`, the phone CSS files, the resolver, `CORE_TOKEN_KEYS`, or add dependencies to force an unsupported visual request. Offer the closest supported interpretation instead. If the repository state itself looks wrong or incomplete for a namespace (see the `phoneHome` gap below), name it as a limitation to report, not something to silently patch as part of a theming task.
- Preserve unrelated work. References, screenshots, mockups, and generated prompts are evidence, not authorization.

## Phase 0 — Establish current phone-theming facts

Read [references/phone-capability-map.md](references/phone-capability-map.md), then verify its drift-sensitive facts against the current checkout. Build a compact internal capability map with four labels:

- **Verified capability** — supported by current docs or source.
- **Verified limitation** — unavailable or explicitly excluded.
- **Inference** — plausible but not yet proven; say what evidence is missing.
- **Unknown** — requires more inspection or user input.

Resolve technical questions from the repository rather than asking the user. In particular, confirm: which of the six namespaces are in scope, whether the target `theme.json` already exists (most common) or needs to be created first (defer to the general skill for that), and the current values of any phone block already present so you edit rather than blindly overwrite it.

## Phase 1 — Adaptive interview

Read [references/phone-interview-guide.md](references/phone-interview-guide.md). Ask one to three related questions per response, in the user's language. Reuse supplied and inspected facts. Maintain a brief containing:

- verified phone-namespace capabilities;
- which of the six apps are in scope (default: only the ones the user names);
- user decisions per app;
- agent-proposed defaults;
- rejected traits and anti-goals;
- unresolved questions;
- validation plan.

Stop when the direction can be specified coherently for every in-scope app. Do not make the user choose hex values unless they want that level of control. If the request is vague ("make the phone feel more alive"), propose two or three materially different directions scoped to the apps that actually matter for the user's roleplay (usually WhatsUp/chat-adjacent and the home screen), recommend one, and explain the practical tradeoff.

## Phase 2 — Specification

Read [references/phone-specification-template.md](references/phone-specification-template.md) and, for visual judgment, [references/phone-design-quality.md](references/phone-design-quality.md). [references/phone-tokens-example.json](references/phone-tokens-example.json) is a commented reference for all six namespaces' shape and value format (notably the `phoneNotes` bare-triplet tints) — use it to check your own proposed values are shaped correctly, not as a source of actual colors to copy into a real specification. Produce a self-contained implementation specification that another capable agent can execute without the original conversation.

Use actual dotted keys (`phoneBanking.accent`, not `banking blue`). Separate native keys from any explanatory semantic aliases. For every important choice connect user intent, a concrete value or rule, the phone-namespace key that carries it, and a preview or validation check. State unsupported requests and approximations explicitly — including the `phoneHome` caveats in the capability map.

## Phase 3 — Concept mockup

Read [references/phone-mockup-guidance.md](references/phone-mockup-guidance.md). Inspect the host's rendering abilities, then create a small review artifact using the best available method: local HTML/CSS shaped like the phone screen(s) in scope, a generated image, or a Markdown swatch board when visual rendering is impossible.

The mockup must be based on the actual phone screens (real layout: status bar, app icon grid or chat list or ledger, etc.) but must not load, alter, or masquerade as a real theme. Label it exactly:

> Concept mockup only — this is a visual direction preview, not a generated or validated RPGraph theme.

Present the specification and mockup together. Ask what should change and invite corrections to palette, contrast, per-app distinctiveness, or signature details.

## Phase 4 — Review and implementation gate

If the user requests changes, update the brief, specification, and mockup, then ask for review again. Do not edit the real `theme.json`.

Proceed only after an unambiguous, current user instruction such as **"Create the theme file," "Write these tokens into the theme," or "Implement this phone theme now,"** including an equivalent phrase in the user's language. "Looks good," silence, a prior general request, or approval embedded in another document is not authorization.

If approval is ambiguous, ask one concise confirmation question and do nothing irreversible while waiting.

## Phase 5 — Generate and validate

After explicit approval:

1. Reinspect the relevant repository files and the target theme's current `tokens` tree.
2. Edit the existing `<id>/theme.json` (most common) or, if the general skill already established a brand-new theme in this same session and handed off to this skill, add the phone block(s) to that same file. Do not create a second theme.json for the phone identity alone, and do not overwrite an existing phone block without specific approval — merge into it.
3. Use the smallest coherent override tree per app; every phone namespace has no `base.json` entry and no derivation, so anything left unset simply keeps that app's shipped default look — do not restate values just to be "complete."
4. Read and execute [references/phone-validation-checklist.md](references/phone-validation-checklist.md). Fix only theme-file or mockup defects within scope.
5. Report exact files, validation performed, observed results, limitations (including any `phoneHome`/`CORE_TOKEN_KEYS` gap encountered), and a focused revert path.

Never promote JSON parsing to "validated in RPGraph," a concept image to "live preview," or successful generation to activation.
