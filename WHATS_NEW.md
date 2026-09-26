# What's New

Raw entries of things this fork does differently from upstream, added once a
feature actually works end-to-end (not when the code first lands). Presentation
TBD — for now just a plain running list.

---

- **Dev mode no longer opens a blank window.** Live Reload (`.bat` option 2)
  was silently broken since the v0.5.0 merge — a shared validation module was
  CommonJS-only, which Vite's dev server can't execute in the browser.
  Converted it to real ESM. Production builds were never affected.

- **Play/Graph mode split.** Roleplaying and graph editing are now two
  distinct modes with their own dedicated shell, instead of one shared
  layout — switch between them from the topbar. Graph mode gets a real
  docked node palette and inspector, each with its own collapse/expand
  toggle, instead of hover-triggered drawers.

- **Redesigned phone simulation.** A reworked iPhone-style device chrome
  (bezel, notch, status bar, home screen, wallpapers) for the in-roleplay
  phone, plus a mood-status indicator and draft context-comment support
  ("obviously sarcastic," etc.) on messages you send.

- **Studio themes.** Ten selectable color themes for the roleplay shell and
  phone simulation (iPhone Noir, Neon Social, Rainy Window, Kawaii Dream,
  Terminal Green, Cute Girly, Goth, Hardcore, Normal Guy, plus the default).

- **Turn autosave.** Rotating autosaves of your roleplay turns, with a
  choice dialog on startup when more than one recent autosave is found.
  Toggle it on/off in Options.

- **Turn variants.** Regenerating or reflavoring a turn now keeps track of
  each version as a variant you can switch back to, instead of only ever
  keeping the latest rewrite.

- **New LLM provider support.** Added LM Studio, Unsloth, Venice AI, and a
  "Composite" provider (combine multiple backends behind one connection) as
  selectable provider types, alongside upstream's existing ones.

- **Rebuilt Play mode UI.** Chat, Phone, and Events used to be three
  mutually exclusive full-screen tabs — closing chat every time you glanced
  at the phone or your turn history. Chat now stays open at all times; a
  resizable Context Drawer shows either the Phone or a new Timeline (which
  replaces Events and also holds browsable past turns) alongside it. The
  phone gained a persistent top strip and app switcher so you can jump
  between apps directly instead of returning to its home screen each time,
  and a visible character-switch chip above chat replaces a hidden
  edge-hover gesture that had no keyboard-accessible equivalent.
