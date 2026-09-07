import { useMemo, useState } from 'react';
import type { ResponseRouterConfig, RouterRoute } from './routerModel';
import { addSection, assembleSections, copySection, mergeSectionWithPrevious, sectionCategories, sectionFields, splitPromptSections, promptSectionSteps,
  type PromptSections, type SectionCategory } from './promptSections';

type Props = { route: RouterRoute; config: ResponseRouterConfig; onChange: (sections: PromptSections) => void };

export function PromptSectionEditor({ route, config, onChange }: Props) {
  const sections = useMemo(() => route.sections ?? splitPromptSections(route.before, route.after), [route.sections, route.before, route.after]);
  const fields = sectionFields(sections);
  const steps = promptSectionSteps(sections);
  const [selectedStep, setSelectedStep] = useState(steps[0][0]);
  const [newCategory, setNewCategory] = useState<SectionCategory>('other');
  const [error, setError] = useState('');
  const step = steps.find(([name]) => name === selectedStep) ?? steps[0];
  const sources = useMemo(() => config.outputs.flatMap((output) => output.routes
    .filter((other) => other.id !== route.id)
    .flatMap((other) => sectionFields(other.sections ?? splitPromptSections(other.before, other.after))
      .map((field) => ({ key: JSON.stringify([other.id, field.id]), field,
        label: `${output.title} / ${other.title} / ${field.step} / ${field.title || sectionCategories[field.category]}` })))), [config, route.id]);

  function update(id: string, text: string) {
    onChange({ ...sections,
      before: sections.before.map((part) => part.kind === 'field' && part.id === id ? { ...part, text } : part),
      after: sections.after.map((part) => part.kind === 'field' && part.id === id ? { ...part, text } : part),
    });
  }

  return <section className="router-sections" aria-label="Prompt sections">
    <div className="router-section-management"><button type="button" onClick={() => {
      if (!window.confirm('Regroup this route by topic? Prompt text and execution steps stay unchanged. Existing section names and custom grouping will be replaced in the draft.')) return;
      const text = assembleSections(sections);
      onChange(splitPromptSections(text.before, text.after));
    }}>Regroup by topic</button></div>
    <div className="router-step-tabs" role="tablist" aria-label="Execution steps">
      {steps.map(([name, role], index) => <button key={name} type="button" role="tab" aria-selected={step[0] === name}
        aria-controls={`sections-${route.id}`} id={`step-${route.id}-${name}`} tabIndex={step[0] === name ? 0 : -1}
        onClick={() => setSelectedStep(name)} onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + steps.length) % steps.length;
          setSelectedStep(steps[next][0]);
          document.getElementById(`step-${route.id}-${steps[next][0]}`)?.focus();
        }}>{name === 'main' ? 'Main response' : name}<small>{role === 'response' ? 'Final output' : 'Intermediate step'}</small></button>)}
    </div>
    <div role="tabpanel" id={`sections-${route.id}`} aria-labelledby={`step-${route.id}-${step[0]}`}>
      {fields.filter((field) => field.step === step[0]).map((field, index) => {
        const choices = sources.filter(({ field: source }) => source.category === field.category && source.role === field.role &&
          (field.role === 'response' || field.step === source.step) && source.text.trim());
        const side = sections.before.some((part) => part.id === field.id) ? 'before' : 'after';
        const position = sections[side].findIndex((part) => part.id === field.id);
        const previous = sections[side][position - 1];
        const canMerge = previous?.kind === 'field' && previous.step === field.step;
        return <details className="router-prompt-section" key={field.id} open={index === 0}>
          <summary>{field.title || sectionCategories[field.category]}<small>{side === 'before' ? 'Before input' : 'After input'}</small></summary>
          <label className="router-section-name">Section name<input aria-label={`Name for ${sectionCategories[field.category]}`} maxLength={160}
            value={field.title ?? sectionCategories[field.category]} onChange={(event) => onChange({ ...sections,
              [side]: sections[side].map((part) => part.kind === 'field' && part.id === field.id ? { ...part, title: event.target.value } : part),
            })} /></label>
          <div className="router-section-toolbar">
            <select aria-label={`Category for ${sectionCategories[field.category]}`} value={field.category} onChange={(event) => {
              onChange({ ...sections, [side]: sections[side].map((part) => part.kind === 'field' && part.id === field.id
                ? { ...part, category: event.target.value as SectionCategory } : part) });
            }}>
              {Object.entries(sectionCategories).filter(([category]) => field.role === 'response' || !['tone', 'wording', 'perspective', 'dialogue'].includes(category))
                .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select aria-label={`Copy ${sectionCategories[field.category]} from`} value="" disabled={!choices.length}
              title={choices.length ? 'Copy text once from a matching field. Later edits stay independent.' : 'No matching fields in other routes yet.'}
              onChange={(event) => {
                const source = choices.find((choice) => choice.key === event.target.value);
                if (!source) return;
                if (field.text.trim() && !window.confirm(`Replace ${sectionCategories[field.category]} with a copy from ${source.label}? Apply is still required.`)) return;
                onChange(copySection(sections, field.id, source.field));
              }}>
              <option value="">Copy from...</option>
              {choices.map((choice, choiceIndex) => <option key={choice.key} value={choice.key}>{choice.label} ({choiceIndex + 1})</option>)}
            </select>
            <button type="button" aria-label={`Remove ${sectionCategories[field.category]}`} title="Remove section" onClick={() => {
              if (field.text.trim() && !window.confirm(`Remove ${sectionCategories[field.category]} and its instructions? Apply is still required.`)) return;
              onChange({ ...sections, [side]: sections[side].filter((part) => part.id !== field.id) });
            }}>&minus;</button>
          </div>
          {canMerge && <button type="button" className="router-merge" title={`Keep both texts in ${previous.title || sectionCategories[previous.category]}`}
            onClick={() => onChange(mergeSectionWithPrevious(sections, field.id))}>Merge with previous</button>}
          <textarea aria-label={`${sectionCategories[field.category]} instructions`} className="node-textarea nodrag nowheel"
            value={field.text} spellCheck={false} onChange={(event) => update(field.id, event.target.value)} />
        </details>;
      })}
      <div className="router-section-add">
        <select aria-label="New section category" value={newCategory} onChange={(event) => setNewCategory(event.target.value as SectionCategory)}>
          {Object.entries(sectionCategories).filter(([category]) => step[1] === 'response' || !['tone', 'wording', 'perspective', 'dialogue'].includes(category))
            .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button type="button" aria-label="Add section" title="Add section" onClick={() => {
          try {
            const category = step[1] !== 'response' && ['tone', 'wording', 'perspective', 'dialogue'].includes(newCategory) ? 'other' : newCategory;
            onChange(addSection(sections, step[0], category)); setError('');
          }
          catch (issue) { setError(issue instanceof Error ? issue.message : String(issue)); }
        }}>+</button>
      </div>
      {error && <p role="alert" className="router-error">{error}</p>}
    </div>
    <details><summary>Step preview</summary><pre>{(() => {
      const text = assembleSections({ ...sections,
        before: sections.before.filter((part) => part.kind === 'field' && part.step === step[0]),
        after: sections.after.filter((part) => part.kind === 'field' && part.step === step[0]),
      });
      return [text.before, '[Connected text input]', text.after].filter(Boolean).join('\n\n');
    })()}</pre></details>
  </section>;
}
