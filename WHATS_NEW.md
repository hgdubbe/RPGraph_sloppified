# What's New

Raw entries of things this fork does differently from vanilla, added once a
feature actually works end-to-end (not when the code first lands). Presentation
TBD — for now just a plain running list.

---

- **Dev mode no longer opens a blank window.** Live Reload (`.bat` option 2)
  was silently broken since the v0.5.0 merge — a shared validation module was
  CommonJS-only, which Vite's dev server can't execute in the browser.
  Converted it to real ESM. Production builds were never affected.
