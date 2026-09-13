# TODO

User notes. Not mandatory standalone steps, but if a change in progress makes any
of these easy to pick up as a small side-patch, do it. They are listed in no specific order.

- WhatsUp annotations not showing in past messages
- LLM router node config UI (prompts etc) needs a rework, too complicated/chaotic/user-unfriendly
- Assistant needs briefing for new systems, still operates on knowledge about original system and prompting
- Landscape mode of phone simulation still weird scaling (not the phone body, the screen content)
- https://github.com/0xfreddy/homescreen phone screen simulation. maybe claude can analyze this for better understanding how phones work, look and feel
- NPCs should be able to use the phone's mood indicator
- Themes per character
- Themes should apply to phone simulation too
- Some themes suck (esp. the girly ones look "dirty/dark", more pastel, brighter colors)
- ~~Rename legacy system to original, structured (experimental) to structured, staged v1 to staged~~ done 2026-09-12 (RP Output node's Action protocol dropdown labels)
- Streaming seems broken, replies come at once, not streamed in
- clean up modes: "structured" and "staged" are legacy and were replaced by "decision". Remove their exposure to user, remove code that won't be used anymore since it was specifically tailored for these two modes. keep any code that is touched by original and decision mode.
- ~~create sample workflows from original sample workflows for the two modes: original, original-planned, decision~~ done 2026-09-13 (default_workflows/workflow.default_v26.json / _planning_v26 / _decision_v26)
- upstream's rp-storybook content schema moved to 3.0.0 (this fork stays on 2.2.0); porting it forward is deferred future work, not forgotten — see `currentRpStorybookVersion` in src/nodes/rp-storybook/model.ts
- the phone camera dialog for sending image generation promts to comfy from the phone simulation does not have any way to actually save or use a resulting image