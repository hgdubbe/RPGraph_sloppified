#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleSections, validateSections } from '../src/nodes/llm-prompt-switch/promptSections.ts';
import { currentCoreNodeVersions } from '../src/nodes/nodeVersion.ts';

// Deliberately converts the checked-in default, never a user's active workflow.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const planning = process.argv.includes('--planning');
const workflow = JSON.parse(readFileSync(path.join(root, 'default_workflows', planning ? 'workflow.default_planning_v26.json' : 'workflow.default_v26.json'), 'utf8'));
const router = workflow.nodes.find((node) => node.data.nodeType === 'llm-prompt-switch');
const output = workflow.nodes.find((node) => node.data.nodeType === 'output');
if (!router?.data.responseRouter || !output) throw new Error('The default workflow shape changed.');
output.data.actionProtocol = 'actions-v1';
output.data.nodeDataVersion = currentCoreNodeVersions.output;
router.data.label = 'Response Router';
router.data.responseRouter.revision++;

for (const group of router.data.responseRouter.outputs.filter((entry) => [0, 1].includes(entry.selector))) {
  for (const route of group.routes) {
    const oldFields = [...route.sections.before, ...route.sections.after].filter((part) => part.kind === 'field');
    const task = oldFields.find((part) => part.category === 'task' && part.role === 'response')?.text;
    const knowledge = oldFields.find((part) => part.category === 'knowledge')?.text;
    if (!task || !knowledge) throw new Error(`Missing source context in ${route.title}.`);
    const fields = [
      ['task', 'Step description', task
        .replace(/ Do not write caption metadata JSON; a hidden action records the caption after the reply\./g, '')
        .replace(/; do not write caption metadata JSON; a hidden action records the caption after the reply\./g, '.')],
      ['knowledge', 'Character knowledge', knowledge],
      ['tone', 'Tone', 'Follow the character personalities, speech styles and current mood in the storybook and conversation. Keep the writing natural and specific to the situation; avoid generic filler.'],
      ['player', 'Player agency', 'Respond to what the player actually wrote or directed. Do not invent the player character\'s next reply, private thoughts or choices.'],
      ['pacing', 'Pacing and length', group.selector === 0
        ? 'Write one concrete story beat. Follow the requested response length; otherwise aim for 150 to 200 words. Leave room for the next player response.'
        : 'Prefer one concise, natural message. When the input explicitly requests a back-and-forth, use a short exchange of two to four messages between the same people. Do not replay earlier messages.'],
      ['dialogue', 'Dialogue and communication', group.selector === 0
        ? 'Characters who are physically together speak in the scene. Use quoted dialogue where it fits. Use WhatsUp only when remote communication makes sense, and only when this beat actually calls for texting. Most beats need no phone message.'
        : 'Reply through WhatsUp as the intended recipient of the newest message, unless the Narrator explicitly directs another sender. Do not replace a sent reply with narration describing what someone would text.'],
      ['images', 'Creative image direction', 'React to an attached image when one is visible to you. Send a photo only when it follows from the message, a promise or the scene. Prefer an appropriate existing photo; create a new one when the character is actually taking or requesting a new picture. Describe its subject, setting, pose and lighting naturally. Do not invent unseen image details.'],
    ];
    route.sections = { version: 1, before: [], after: fields.map(([category, title, text], index) => ({
      kind: 'field', id: `${route.id}-creative-${category}`, step: 'main', role: 'response',
      category, title, text, separator: index === fields.length - 1 ? '' : '\n\n',
    })) };
    if (planning) {
      const planningFields = oldFields.filter((part) => part.step === 'planning'
        && ['task', 'objective', 'npc', 'knowledge', 'focus', 'outcomes'].includes(part.category));
      if (planningFields.length !== 6) throw new Error(`Unexpected planning structure in ${route.title}.`);
      route.sections.after = [
        { kind: 'marker', id: `${route.id}-planning-start`, text: '@step:planning\n' },
        ...planningFields,
        { kind: 'field', id: `${route.id}-planning-images`, step: 'planning', role: 'intermediate',
          category: 'images', title: 'Image direction',
          text: 'If a photo matters to this beat, plan its purpose, subject and whether the character reuses a known photo or takes a new one. Describe the intent in plain words. The final response handles actual image creation and delivery using currently available capabilities. Planning does not create or send anything.', separator: '\n\n' },
        { kind: 'marker', id: `${route.id}-main-start`, text: '@step:main\n' },
        { kind: 'field', id: `${route.id}-resolved-plan`, step: 'main', role: 'response',
          category: 'plan', title: 'Resolved plan',
          text: 'Here is the plan for this turn. Uncertain developments have been diced automatically: follow the stated success or otherwise result. Treat the plan as guidance for events, not text to quote. A planned phone action still requires an available capability and actual execution; planning alone does not perform it.\n@output:planning', separator: '\n\n' },
        ...route.sections.after,
      ];
    }
    const errors = validateSections(route.sections);
    if (errors.length) throw new Error(errors.join('; '));
    Object.assign(route, assembleSections(route.sections));
    if (/@(?:action|command):|sendImageId|catalogId/.test(route.before + route.after)) {
      throw new Error(`Technical action text leaked into ${route.title}.`);
    }
  }
}
// Keep the legacy projection synchronized for exports and existing tools.
router.data.llmPromptSwitchPromptBeforesByOutput = router.data.responseRouter.outputs.map((group) => group.routes.map((route) => route.before));
router.data.llmPromptSwitchPromptAftersByOutput = router.data.responseRouter.outputs.map((group) => group.routes.map((route) => route.after));
workflow.savedAt = '2026-09-07T00:00:00.000Z';
const directory = path.join(root, 'workflows');
mkdirSync(directory, { recursive: true });
const target = path.join(directory, planning ? 'default-planning-actions-v1.json' : 'default-actions-v1.json');
writeFileSync(target, JSON.stringify(workflow, null, 2) + '\n');
console.log(`Created ${target}: 12 managed RP/WhatsUp routes; 10 legacy social/autoplay routes retained.`);
