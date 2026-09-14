# TODO

User notes. Not mandatory standalone steps, but if a change in progress makes any
of these easy to pick up as a small side-patch, do it. They are listed in no specific order.

- WhatsUp annotations not showing in past messages
- LLM router node config UI (prompts etc) needs a rework, too complicated/chaotic/user-unfriendly
- applying a provider to all nodes does not apply to phone apps node Notes llm
- Assistant needs briefing for new systems, still operates on knowledge about original system and prompting
- Landscape mode of phone simulation still weird scaling (not the phone body, the screen content)
- https://github.com/0xfreddy/homescreen phone screen simulation. maybe claude can analyze this for better understanding how phones work, look and feel
-> phone widgets waste too much space
-> somehow get more actual space on the phone-screen, it's too narrow and feels cramped, especially in apps 
-> Themes should apply to phone simulation too
- the phone camera dialog for sending image generation promts to comfy from the phone simulation does not have any way to actually save or use a resulting image. also check if thats the case for other image generation interfaces (story editor/character editor)
- NPCs should be able to use the phone's mood indicator
- Themes per character
- Some themes suck (esp. the girly ones look "dirty/dark", more pastel, brighter colors)
- ~~Rename legacy system to original, structured (experimental) to structured, staged v1 to staged~~ done 2026-09-12 (RP Output node's Action protocol dropdown labels)
- Streaming seems broken, replies come at once, not streamed in
- clean up modes: "structured" and "staged" are legacy and were replaced by "decision". Remove their exposure to user, remove code that won't be used anymore since it was specifically tailored for these two modes. keep any code that is touched by original and decision mode.
  -> partially done 2026-09-14: RP Output node's Action protocol dropdown now only offers
     Original/Decision (Structured/Staged removed from the picker), and the Staged
     Instructions/Staged Plan/Staged Recipes debug buttons now also gate on a Decision Router
     node's presence, not just the field value. NOT finished: actions-v1/staged-v1 handling in
     useGraphRun.ts (useStructuredActions, useStagedActions, useDirectStructuredAction) and
     elsewhere is untouched — still needs the real dead-code removal pass.
- ~~create sample workflows from original sample workflows for the two modes: original, original-planned, decision~~ done 2026-09-13, then rebuilt again after merging upstream's v0.5.0 (resources/default-content/default_normal_v28.json / default_planning_v28.json / default_decision_v28.json)
- ~~upstream's rp-storybook content schema moved to 3.0.0 (this fork stays on 2.2.0); porting it forward is deferred future work~~ done — adopted during the v0.5.0 merge; `currentRpStorybookVersion` in src/nodes/rp-storybook/model.ts is now 3.0.0
- `scripts/build-action-baseline.mjs` still reads the old Response Router (`responseRouter` data field) shape from a bundled workflow, which only existed on our now-abandoned v26 templates — the new default_normal_v28.json/default_planning_v28.json use upstream's plain llm-prompt-switch, so the Response Router migration needs porting onto them before this script (and `workflows/default-actions-v1.json`/`default-planning-actions-v1.json`) can be regenerated again
- decision router configuration shouldnt sit on the node. it should have a button which opens a menu, similar to the story editor (both in behaviour and design). Same for llm router node
- storybook editor needs an overhaul to comply with v3 upstream: 
-> character sheet: Export Character button should be right of import character button. name and role fields are disaligned. Images field servers no purpose other than counting images...remove it.
-> account page from character setup - Phoneapps should live in social
-> character setup: voice setup should live in Character sheet
-> and so on...reduce the amount of redundant menus and the depth of the menu structure. if it has a matching category one or two layers above, move it there and fit it in