# RPGraph Phone Theme Design Quality

Use this when the user delegates visual choices, uses broad mood words, or the concept risks becoming a single palette swap applied uniformly to every app.

## Build an app-native thesis, not one blanket phone thesis

A strong per-app thesis names the emotional tone appropriate to *that kind of app*, not a generic "phone mood." A messaging app, a banking app, and a photo app carry different real-world visual conventions, and RPGraph's independent namespaces exist specifically so a theme can honor that.

Weak: "make the whole phone dark and neon."

Stronger: "Home screen and Fotogram carry the neon identity (magenta/cyan accents, glow badges) since that's where the character actually lives online; Banking stays low-saturation and high-contrast so transaction status never gets ambiguous under the same neon palette."

Translate the thesis across supported axes, per in-scope namespace:

- **Color:** design real foreground/background pairs per app; do not just swap one accent hex across all six namespaces and call it done. Separate decorative accent from `success`/`danger` roles in Banking and Gallery.
- **Material:** `phoneChatgpd.glass`/`panelStrong`, `phoneSocial.glass`, and `phoneHome`'s widget-card treatment are the namespaces with an explicit "glass"/translucency leaf — use it deliberately, not everywhere just because it exists.
- **The Notes 8-tint set:** design it as one coherent set of 8, the way a real note-taking app ships a fixed color-picker row — not 8 independent unrelated hues.
- **Fotogram vs. OnlyFriends:** if both are in scope, make sure a screenshot of each is identifiable as a different app at a glance, even if both are inside one overall theme identity.
- **Home-screen badges:** `phoneHome.badge` (default) and `phoneHome.badgeBanking` (Banking's icon specifically) are two different tokens — decide deliberately whether Banking's notification badge should match or deliberately stand out (real phones often make financial-app badges visually distinct for exactly this reason).

## RPGraph-phone-specific anti-drift checks

- Do not propose a "dock color" token — the dock has none; it reuses `phoneHome.widgetBackground`/`phoneHome.accent`.
- Do not author `phoneNotes` tints as `#hex` or `rgb()` — they are bare `"R, G, B"` triplet strings.
- Do not silently merge `phoneSocial`'s Fotogram and OnlyFriends accents into one shared value unless the user explicitly wants the two brands indistinguishable.
- Do not treat `phoneHome`'s missing `CORE_TOKEN_KEYS` registration as license to also skip checking its literal CSS consumers — the keys still need to be real, just verified against `phone-widgets.css` directly instead.
- Do not claim a phone namespace value will track the main Studio theme automatically — none of these six derive from `color.*`; if the user wants them coordinated, that's a manual, one-time value copy, not a live link.
- Do not make `phoneBanking.success`/`phoneBanking.danger` or `phoneGallery`'s badge low-contrast in service of a mood — these carry real in-fiction meaning (a transaction succeeded or failed; new content arrived).
- Avoid making every one of the six namespaces share the exact same accent hue "for consistency" — that erases the reason these apps have independent identities in the first place, unless the user has explicitly asked for one unified phone-wide brand.

## Final audit

- Does each in-scope app read as itself, not as an interchangeable panel of "the phone"?
- Does every value map to a current, verified phone-namespace key with a real CSS consumer?
- Is `phoneBanking`'s success/danger, and `phoneGallery`'s new-content badge, still clearly legible?
- If `phoneSocial` is in scope with both brands, are Fotogram and OnlyFriends still visually distinguishable from each other?
- Are `phoneNotes` tints a complete, coherent 8-value set in the correct bare-triplet format?
- Are out-of-scope namespaces left untouched and explicitly noted as such, rather than silently left ambiguous?
- Are the `phoneHome` registration gap and any other approximations named?

If an answer is no, refine concrete per-app token roles or reduce the claim. Do not add unsupported effects to make the concept sound richer.
