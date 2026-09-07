#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assembleSections, splitPromptSections, validateSections } from '../src/nodes/llm-prompt-switch/promptSections.ts';

// Mechanical migration: preserve all original prompt text and selector mappings.
// Run explicitly against a workflow path; no discovery or user autosave writes.
const [file] = process.argv.slice(2);
if (!file) throw new Error('Usage: node scripts/structure-default-prompts.mjs <workflow.json>');
const workflow = JSON.parse(readFileSync(file, 'utf8'));
const nodes = workflow.nodes ?? workflow.graph?.nodes;
if (!Array.isArray(nodes)) throw new Error('Workflow has no nodes.');
const hash = (text) => createHash('sha256').update(text).digest('hex');
let routes = 0;
for (const node of nodes.filter((entry) => entry.data?.nodeType === 'llm-prompt-switch')) {
  const data = node.data;
  const titles = data.llmPromptSwitchOutputTitles;
  if (!data.responseRouter) {
    data.responseRouter = {
      version: 1, revision: 0, policy: 'legacy', nextOutputSelector: titles.length,
      outputs: titles.map((title, output) => ({
        id: `output-${output}`, handle: `output-channel-${output}`, selector: output, title,
        nextPromptSelector: data.llmPromptSwitchPromptTitlesByOutput[output].length,
        disconnected: 'allow', unused: false,
        routes: data.llmPromptSwitchPromptTitlesByOutput[output].map((name, slot) => ({
          id: `route-${output}-${slot}`, promptId: `prompt-${output}-${slot}`, selector: slot, title: name,
          before: data.llmPromptSwitchPromptBeforesByOutput[output][slot], after: data.llmPromptSwitchPromptAftersByOutput[output][slot],
        })),
      })),
    };
  }
  for (const output of data.responseRouter.outputs) {
    for (const route of output.routes) {
      route.sections = splitPromptSections(route.before, route.after);
      const errors = validateSections(route.sections);
      if (errors.length) throw new Error(`${route.title}: ${errors.join(' ')}`);
      const assembled = assembleSections(route.sections);
      if (assembled.before !== route.before || assembled.after !== route.after) throw new Error(`Text changed: ${route.title}`);
      console.log(`${node.id}/${route.id}: ${hash(route.before + '\0' + route.after)}`);
      routes++;
    }
  }
}
writeFileSync(file, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`Structured ${routes} routes without changing prompt text: ${file}`);
