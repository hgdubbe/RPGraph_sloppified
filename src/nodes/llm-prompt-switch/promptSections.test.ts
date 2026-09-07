import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPromptStepChain } from '../shared/promptSteps';
import { addSection, assembleSections, splitPromptSections, validateSections, copySection, sectionFields, promptSectionSteps, mergeSectionWithPrevious } from './promptSections';

describe('structured prompt sections', () => {
  for (const file of ['workflow.default_v25.json', 'workflow.default_planning_v25.json']) {
    it(`preserves every character and execution step in ${file}`, () => {
      const workflow = JSON.parse(readFileSync(file, 'utf8'));
      let count = 0;
      for (const node of workflow.nodes.filter((entry: { data: { nodeType: string } }) => entry.data.nodeType === 'llm-prompt-switch')) {
        node.data.llmPromptSwitchPromptTitlesByOutput.forEach((row: string[], output: number) => row.forEach((_title, slot) => {
          const before = node.data.llmPromptSwitchPromptBeforesByOutput[output][slot];
          const after = node.data.llmPromptSwitchPromptAftersByOutput[output][slot];
          const document = splitPromptSections(before, after);
          expect(validateSections(document)).toEqual([]);
          expect(assembleSections(document)).toEqual({ before, after });
          const assembled = assembleSections(document);
          expect(buildPromptStepChain(assembled.before, assembled.after)).toEqual(buildPromptStepChain(before, after));
          expect(sectionFields(document).length).toBeGreaterThan(4);
          expect(sectionFields(document).some((field) => field.category === 'other')).toBe(false);
          const stored = node.data.responseRouter?.outputs[output].routes[slot].sections;
          if (stored) {
            expect(validateSections(stored)).toEqual([]);
            expect(assembleSections(stored)).toEqual({ before, after });
          }
          count++;
        }));
      }
      expect(count).toBeGreaterThan(20);
    });
  }

  it('groups planning separately and identifies main dialogue, images and knowledge', () => {
    const doc = splitPromptSections('', '@step:planning\nThis is the planning pass.\n\nCharacters only know what they saw.\n\n@step:main\nVoice the scene: spoken dialogue.\n\nImage check. Find an image.');
    expect(sectionFields(doc).map(({ step, category }) => [step, category])).toEqual([
      ['planning', 'task'], ['planning', 'knowledge'], ['main', 'dialogue'], ['main', 'images'],
    ]);
  });

  it('copies only text and rejects unrelated categories or execution roles', () => {
    const doc = splitPromptSections('', 'Voice the scene: original dialogue.');
    const target = sectionFields(doc)[0];
    const source = { ...target, id: 'source', text: 'Voice the scene: copied dialogue.', step: 'response' };
    const result = copySection(doc, target.id, source);
    source.text = 'Later edit';
    expect(sectionFields(result)[0].text).toBe('Voice the scene: copied dialogue.');
    expect(sectionFields(doc)[0].text).toContain('original');
    expect(() => copySection(doc, target.id, { ...source, category: 'images' })).toThrow();
    expect(() => copySection(doc, target.id, { ...source, role: 'intermediate' })).toThrow();
  });

  it('rejects malformed documents, duplicate identities and hidden step markers', () => {
    expect(validateSections({ version: 999 })).not.toEqual([]);
    const doc = splitPromptSections('', 'This is one\n\nCharacters only know what they saw.');
    doc.after[1].id = doc.after[0].id;
    expect(validateSections(doc).join(' ')).toContain('Duplicate');
    const other = splitPromptSections('', 'One');
    other.after[0].text = '@step:secret\nUnexpected pass';
    expect(validateSections(other).join(' ')).toContain('step marker');
  });

  it('orders steps by execution, including leading text attached to the response', () => {
    const doc = splitPromptSections('Leading output instructions', '@step:planning\nPlan\n\n@step:main\nRespond');
    expect(promptSectionSteps(doc).map(([name]) => name)).toEqual(['planning', 'main']);
    const added = addSection(doc, 'main', 'tone');
    expect(validateSections(added)).toEqual([]);
    expect(() => addSection(doc, 'planning', 'tone')).toThrow();
  });

  it('adds to empty steps and before-only planning without recursion or misplaced text', () => {
    const empty = addSection(splitPromptSections('', ''), 'main', 'tone');
    expect(validateSections(empty)).toEqual([]);
    const doc = splitPromptSections('@step:planning\nPlan\n\n@step:main\nRespond', '');
    expect(validateSections(addSection(doc, 'planning', 'objective'))).toEqual([]);
    const markerOnly = splitPromptSections('', '@step:planning\n\n@step:main');
    expect(validateSections(addSection(markerOnly, 'main', 'tone'))).toEqual([]);
  });

  it('groups thematic continuations instead of creating a section at every blank line', () => {
    const text = 'This is the RP prompt.\n\nContinue the current scene.\n\nImage check. Find a photo.\n\n@action:Get character phone image list\n\n@action:Create character phone image\n\nOutput format:\nUse JSON.\n\nReplace MessengerAppName with whatsUpApp.\n\nThe messenger JSON itself sends the message.\n\nCommands:\nUse listed commands.\n\nMoney is transferred now:\n@command: Bank_transfer';
    const doc = splitPromptSections('', text);
    expect(sectionFields(doc).map((field) => field.category)).toEqual(['task', 'images', 'format', 'commands']);
    expect(assembleSections(doc).after).toBe(text);
  });

  it('merges neighboring sections losslessly without crossing a step boundary', () => {
    const text = '@step:planning\nThis is planning.\n\nCharacters only know what they saw.\n\n@step:main\nThe tone is warm.';
    const doc = splitPromptSections('', text);
    const fields = sectionFields(doc);
    fields[0].title = 'Scene planning';
    const merged = mergeSectionWithPrevious(doc, fields[1].id);
    expect(assembleSections(merged).after).toBe(text);
    expect(sectionFields(merged)[0].title).toBe('Scene planning');
    expect(sectionFields(merged)).toHaveLength(2);
    expect(() => mergeSectionWithPrevious(doc, fields[2].id)).toThrow();
  });
});
