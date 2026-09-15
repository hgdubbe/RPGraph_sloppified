import type { Character } from '../characters/character';
import { CharacterRelationships } from './CharacterRelationships';
import { characterReferenceCandidates } from '../characters/relationships';
import { HiddenAgencyField } from './HiddenAgencyField';
import { CharacterAppProfiles } from './CharacterAppProfiles';
import { useMemo, useState } from 'react';
import type { WorkflowNode } from '../types';
import {
  defaultRpStorybookCharacterBanking,
  defaultRpStorybookCharacterComfyConfig,
  defaultRpStorybookCharacterPhoneSettings,
  emptyRpStorybook,
  parseRpStorybookJson,
  type RpStorybook,
  type RpStorybookCharacter,
} from '../nodes/rp-storybook/model';
import {
  applyRpStorybookEditorJson,
  rpStorybookEditorJsonView,
} from '../nodes/rp-storybook-editor/rawJson';
import { JsonSyntaxTextarea } from '../nodes/shared/JsonSyntaxTextarea';
import { useBackdropDismiss } from './useBackdropDismiss';
import { StorybookReadonlyPreview } from './StorybookReadonlyPreview';

type ViewMode = 'fields' | 'preview' | 'json';
type RailSection = 'story' | 'characters';

type StorybookEditorDialogProps = {
  referenceCharacters?: Character[];
  node: WorkflowNode;
  identityLocked?: boolean;
  onRemoveCharacter?: (characterId: string) => void;
  onExportCharacter?: (characterId: string) => Promise<void>;
  onImportCharacter?: () => Promise<void>;
  // Returns a blocking error message (e.g. a running-story guard violation), or
  // null when the commit succeeded.
  onCommit: (storybook: RpStorybook, status: string) => string | null;
  onClose: () => void;
};

function characterLabel(character: RpStorybookCharacter) {
  return character.name || character.id || 'Unnamed';
}

function characterInitials(character: RpStorybookCharacter) {
  const label = characterLabel(character);
  return (
    label
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'CH'
  );
}

type StoryFieldsPanelProps = {
  draft: RpStorybook;
  onChange: (next: RpStorybook) => void;
};

/** Story-level fields: title/introduction, scenario, opening history summary. */
function StoryFieldsPanel({ draft, onChange }: StoryFieldsPanelProps) {
  return (
    <div className="storybook-editor-fields">
      <label className="storybook-editor-field">
        <span className="field-label">Title</span>
        <input
          type="text"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.currentTarget.value })}
        />
      </label>
      <label className="storybook-editor-field">
        <span className="field-label">Introduction</span>
        <textarea
          value={draft.introduction}
          spellCheck={false}
          onChange={(event) => onChange({ ...draft, introduction: event.currentTarget.value })}
        />
      </label>

      <fieldset className="storybook-editor-fieldset">
        <legend>Scenario</legend>
        <label className="storybook-editor-field">
          <span className="field-label">Summary</span>
          <textarea
            value={draft.scenario.summary}
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...draft, scenario: { ...draft.scenario, summary: event.currentTarget.value } })
            }
          />
        </label>
        <label className="storybook-editor-field">
          <span className="field-label">Opening Situation</span>
          <textarea
            value={draft.scenario.openingSituation}
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...draft, scenario: { ...draft.scenario, openingSituation: event.currentTarget.value } })
            }
          />
        </label>
        <label className="storybook-editor-field">
          <span className="field-label">Current Situation</span>
          <textarea
            value={draft.scenario.currentSituation}
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...draft, scenario: { ...draft.scenario, currentSituation: event.currentTarget.value } })
            }
          />
        </label>
      </fieldset>

      <fieldset className="storybook-editor-fieldset">
        <legend>Opening History</legend>
        <label className="storybook-editor-field">
          <span className="field-label">Summary</span>
          <textarea
            value={draft.openingHistory.summary}
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...draft, openingHistory: { ...draft.openingHistory, summary: event.currentTarget.value } })
            }
          />
        </label>
        <p className="storybook-empty-note">
          {draft.openingHistory.turns.length} imported turn{draft.openingHistory.turns.length === 1 ? '' : 's'} and{' '}
          {draft.openingHistory.events.length} event{draft.openingHistory.events.length === 1 ? '' : 's'} are protected
          runtime memory and are not editable here.
        </p>
      </fieldset>
    </div>
  );
}

type CharactersPanelProps = {
  referenceCharacters: Character[];
  draft: RpStorybook;
  selectedCharacterId: string | null;
  onSelectCharacter: (characterId: string) => void;
  onChange: (next: RpStorybook) => void;
  identityLocked: boolean;
  onRemoveCharacter?: (characterId: string) => void;
  onExportCharacter?: (characterId: string) => Promise<void>;
};

/**
 * Per-character editing surface, folding what used to be a separate "Character
 * Setup" modal (phone/social, gallery, banking) directly into this character's
 * own page as scrollable subsections instead of another layer of tabs.
 */
function CharactersPanel({
  referenceCharacters,
  draft,
  selectedCharacterId,
  onSelectCharacter,
  onChange,
  identityLocked,
  onRemoveCharacter,
  onExportCharacter,
}: CharactersPanelProps) {
  const character = draft.characters.find((entry) => entry.id === selectedCharacterId) ?? draft.characters[0];

  const setCharacter = (patch: Partial<RpStorybookCharacter>) => {
    if (!character) return;
    onChange({
      ...draft,
      characters: draft.characters.map((entry) => (entry.id === character.id ? { ...entry, ...patch } : entry)),
    });
  };

  if (draft.characters.length === 0) {
    return <p className="storybook-empty-note">No characters. Add them in Raw JSON.</p>;
  }

  return (
    <div className="storybook-workbench-section-stack">
      <div className="storybook-workbench-character-grid">
        {draft.characters.map((entry) => (
          <button
            type="button"
            key={entry.id}
            className={`storybook-workbench-character-card${entry.id === character?.id ? ' active' : ''}`}
            onClick={() => onSelectCharacter(entry.id)}
          >
            <span className="storybook-workbench-avatar">{characterInitials(entry)}</span>
            <span className="storybook-workbench-character-copy">
              <strong>{characterLabel(entry)}</strong>
              <small>{entry.role || 'No role'}</small>
            </span>
          </button>
        ))}
      </div>

      {character && (
        <div className="storybook-editor-panel storybook-editor-character-page">
          <div className="storybook-editor-tools">
            {onExportCharacter && (
              <button
                type="button"
                className="inspect-button nodrag"
                onClick={() => void onExportCharacter(character.id)}
              >
                Export Character
              </button>
            )}
            {onRemoveCharacter && (
              <button
                type="button"
                className="inspect-button nodrag danger"
                onClick={() => onRemoveCharacter(character.id)}
              >
                Remove Character
              </button>
            )}
          </div>

          <fieldset className="storybook-editor-fieldset">
            <legend>Identity</legend>
            <div className="storybook-editor-field-grid-2">
              <label className="storybook-editor-field">
                <span className="field-label">Name</span>
                <input
                  type="text"
                  value={character.name}
                  onChange={(event) => setCharacter({ name: event.currentTarget.value })}
                />
              </label>
              <label className="storybook-editor-field">
                <span className="field-label">Role</span>
                <input
                  type="text"
                  value={character.role}
                  onChange={(event) => setCharacter({ role: event.currentTarget.value })}
                />
              </label>
            </div>
            <label className="storybook-editor-field">
              <span className="field-label">Description</span>
              <textarea
                value={character.description}
                spellCheck={false}
                onChange={(event) => setCharacter({ description: event.currentTarget.value })}
              />
            </label>
            <label className="storybook-editor-field">
              <span className="field-label">Personality</span>
              <textarea
                value={character.personality}
                spellCheck={false}
                onChange={(event) => setCharacter({ personality: event.currentTarget.value })}
              />
            </label>
            <label className="storybook-editor-field">
              <span className="field-label">Speech Style</span>
              <textarea
                value={character.speechStyle}
                spellCheck={false}
                onChange={(event) => setCharacter({ speechStyle: event.currentTarget.value })}
              />
            </label>
          </fieldset>

          <fieldset className="storybook-editor-fieldset">
            <legend>Relationships &amp; Hidden Agency</legend>
            <CharacterRelationships
              character={character}
              characters={characterReferenceCandidates(draft.characters, referenceCharacters)}
              onChange={(relationships) => setCharacter({ relationships })}
            />
            <HiddenAgencyField value={character.hiddenAgency} onChange={(hiddenAgency) => setCharacter({ hiddenAgency })} />
          </fieldset>

          <fieldset className="storybook-editor-fieldset">
            <legend>Appearance &amp; Image Generation</legend>
            <label className="storybook-editor-field">
              <span className="field-label">Appearance</span>
              <textarea
                value={character.comfyConfig?.appearance ?? ''}
                spellCheck={false}
                onChange={(event) =>
                  setCharacter({
                    comfyConfig: {
                      ...(character.comfyConfig ?? defaultRpStorybookCharacterComfyConfig()),
                      appearance: event.currentTarget.value,
                    },
                  })
                }
              />
            </label>
            <p className="storybook-empty-note">
              LoRA selection and live test-image generation are available from the full Storybook Creator&rsquo;s
              Character Setup, which needs a connected ComfyUI provider.
            </p>
          </fieldset>

          <fieldset className="storybook-editor-fieldset">
            <legend>Phone &amp; Social</legend>
            <label className="storybook-editor-field">
              <span className="field-label">Phone Wallpaper ID</span>
              <input
                type="text"
                value={(character.phoneSettings ?? defaultRpStorybookCharacterPhoneSettings()).wallpaperId}
                onChange={(event) =>
                  setCharacter({
                    phoneSettings: {
                      ...(character.phoneSettings ?? defaultRpStorybookCharacterPhoneSettings()),
                      wallpaperId: event.currentTarget.value,
                    },
                  })
                }
              />
            </label>
            <CharacterAppProfiles
              character={character}
              characters={draft.characters}
              locked={identityLocked || draft.openingHistory.turns.length > 0 || draft.openingHistory.events.length > 0}
              onChange={(next) => {
                setCharacter({ apps: next.apps });
                return true;
              }}
            />
          </fieldset>

          <fieldset className="storybook-editor-fieldset">
            <legend>Banking</legend>
            <label className="storybook-editor-field">
              <span className="field-label">Starting Balance (USD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={(character.banking ?? defaultRpStorybookCharacterBanking()).startBalance}
                onChange={(event) => {
                  const startBalance = event.currentTarget.valueAsNumber;
                  setCharacter({
                    banking: {
                      ...(character.banking ?? defaultRpStorybookCharacterBanking()),
                      startBalance: Number.isFinite(startBalance) ? startBalance : 0,
                    },
                  });
                }}
              />
            </label>
            {(character.banking ?? defaultRpStorybookCharacterBanking()).fixedExpenses.map((expense, index) => (
              <div className="storybook-editor-field-grid-2" key={index}>
                <label className="storybook-editor-field">
                  <span className="field-label">Fixed Expense Label</span>
                  <input
                    type="text"
                    value={expense.label}
                    placeholder="Mobile plan"
                    onChange={(event) => {
                      const banking = character.banking ?? defaultRpStorybookCharacterBanking();
                      setCharacter({
                        banking: {
                          ...banking,
                          fixedExpenses: banking.fixedExpenses.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, label: event.currentTarget.value } : entry,
                          ),
                        },
                      });
                    }}
                  />
                </label>
                <label className="storybook-editor-field">
                  <span className="field-label">Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expense.amount}
                    onChange={(event) => {
                      const banking = character.banking ?? defaultRpStorybookCharacterBanking();
                      const amount = event.currentTarget.valueAsNumber;
                      setCharacter({
                        banking: {
                          ...banking,
                          fixedExpenses: banking.fixedExpenses.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, amount: Number.isFinite(amount) ? amount : 0 } : entry,
                          ),
                        },
                      });
                    }}
                  />
                </label>
              </div>
            ))}
            <div className="storybook-editor-tools">
              <button
                type="button"
                className="inspect-button nodrag"
                onClick={() => {
                  const banking = character.banking ?? defaultRpStorybookCharacterBanking();
                  setCharacter({
                    banking: { ...banking, fixedExpenses: [...banking.fixedExpenses, { label: '', amount: 0 }] },
                  });
                }}
              >
                Add Fixed Expense
              </button>
            </div>
          </fieldset>

          <fieldset className="storybook-editor-fieldset">
            <legend>Gallery ({character.images.length} image{character.images.length === 1 ? '' : 's'})</legend>
            {character.images.length === 0 && <p className="storybook-empty-note">This character has no images.</p>}
            {character.images.map((image, imageIndex) => (
              <div className="storybook-editor-image-row" key={image.id}>
                <img className="storybook-editor-image-thumb" src={image.dataUrl} alt={image.description || image.name || image.id} />
                <div className="storybook-editor-field-grid-2">
                  <label className="storybook-editor-field">
                    <span className="field-label">Image Name</span>
                    <input
                      type="text"
                      value={image.name}
                      onChange={(event) =>
                        setCharacter({
                          images: character.images.map((entry, index) =>
                            index === imageIndex ? { ...entry, name: event.currentTarget.value } : entry,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="storybook-editor-field">
                    <span className="field-label">Image Description</span>
                    <input
                      type="text"
                      value={image.description}
                      onChange={(event) =>
                        setCharacter({
                          images: character.images.map((entry, index) =>
                            index === imageIndex ? { ...entry, description: event.currentTarget.value } : entry,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}

export function StorybookEditorDialog({ referenceCharacters = [], node, identityLocked = false, onRemoveCharacter, onExportCharacter, onImportCharacter, onCommit, onClose }: StorybookEditorDialogProps) {
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);
  // Track parse validity so an Apply can't overwrite unparseable stored JSON
  // with empty/edited content (the fallback would otherwise be silent).
  const parsed = useMemo(() => {
    if (!node.data.storybookJson) {
      return { storybook: emptyRpStorybook, ok: true };
    }
    try {
      return { storybook: parseRpStorybookJson(node.data.storybookJson), ok: true };
    } catch {
      return { storybook: emptyRpStorybook, ok: false };
    }
  }, [node.data.storybookJson]);
  const storybook = parsed.storybook;

  const [viewMode, setViewMode] = useState<ViewMode>('fields');
  const [activeSection, setActiveSection] = useState<RailSection>('story');
  const [jsonDraft, setJsonDraft] = useState(() => rpStorybookEditorJsonView(storybook));
  const [fieldsDraft, setFieldsDraft] = useState<RpStorybook>(() => structuredClone(storybook));
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(() => storybook.characters[0]?.id ?? null);
  const [status, setStatus] = useState('');
  const [seededFromJson, setSeededFromJson] = useState(node.data.storybookJson);

  // Reseed drafts when the node's stored storybook changes (render-time reset).
  if (node.data.storybookJson !== seededFromJson) {
    setSeededFromJson(node.data.storybookJson);
    setJsonDraft(rpStorybookEditorJsonView(storybook));
    setFieldsDraft(structuredClone(storybook));
    setSelectedCharacterId(storybook.characters[0]?.id ?? null);
  }

  const jsonValidity = useMemo(() => {
    try {
      JSON.parse(jsonDraft);
      return { valid: true as const };
    } catch (error) {
      return { valid: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  }, [jsonDraft]);

  function commit(next: RpStorybook, successStatus: string) {
    const error = onCommit(next, successStatus);
    setStatus(error ? `Not applied: ${error}` : successStatus);
  }

  function beautifyJson() {
    try {
      setJsonDraft(JSON.stringify(JSON.parse(jsonDraft), null, 2));
      setStatus('JSON is valid and formatted.');
    } catch (error) {
      setStatus(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function minifyJson() {
    try {
      setJsonDraft(JSON.stringify(JSON.parse(jsonDraft)));
      setStatus('JSON minified.');
    } catch (error) {
      setStatus(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function copyDraft(value: string) {
    void navigator.clipboard?.writeText(value);
    setStatus('Copied to clipboard.');
  }

  function applyJson() {
    const result = applyRpStorybookEditorJson(storybook, jsonDraft);
    if ('error' in result) {
      setStatus(`Not applied: ${result.error}`);
      return;
    }
    const suffix = result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
    commit(result.storybook, `Applied JSON edits.${suffix}`);
  }

  const sections: Array<{ id: RailSection; label: string; detail: string; count?: number }> = [
    { id: 'story', label: 'Story', detail: 'title, scenario, opening history' },
    { id: 'characters', label: 'Characters', detail: 'identity, phone, social, bank, gallery', count: fieldsDraft.characters.length },
  ];

  return (
    <div className="dialog-backdrop" role="presentation" {...backdropDismiss}>
      <section
        className="storybook-creator-dialog storybook-workbench-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="RP Storybook Editor"
      >
        <div className="dialog-header storybook-creator-header">
          <div className="storybook-title-row">
            <h2>{node.data.label}</h2>
            <p>{status || node.data.storybookStatus || 'Ready'}</p>
          </div>
          <div className="storybook-header-actions">
            {onImportCharacter && (
              <button type="button" className="inspect-button nodrag" onClick={() => void onImportCharacter()}>
                Import Character
              </button>
            )}
            <button type="button" className="close-button danger" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {!parsed.ok && (
          <span className="run-note storybook-file-status">
            This node&rsquo;s stored JSON is invalid; editing is disabled to avoid overwriting it.
          </span>
        )}

        <section className="storybook-workbench-layout">
          <aside className="storybook-workbench-rail">
            <div className="storybook-tabs storybook-workbench-mode-switch" aria-label="Editor mode">
              <button type="button" className={`tab-button ${viewMode === 'fields' ? 'active' : ''}`} onClick={() => setViewMode('fields')}>
                Fields
              </button>
              <button type="button" className={`tab-button ${viewMode === 'preview' ? 'active' : ''}`} onClick={() => setViewMode('preview')}>
                Preview
              </button>
              <button type="button" className={`tab-button ${viewMode === 'json' ? 'active' : ''}`} onClick={() => setViewMode('json')}>
                Raw JSON
              </button>
            </div>
            {viewMode === 'fields' && (
              <nav className="storybook-workbench-nav" aria-label="Storybook sections">
                {sections.map((section) => (
                  <button
                    type="button"
                    key={section.id}
                    className={`storybook-workbench-nav-item${activeSection === section.id ? ' active' : ''}`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <span className="storybook-workbench-nav-copy">
                      <strong>{section.label}</strong>
                      <small>{section.detail}</small>
                    </span>
                    {section.count !== undefined ? <span className="storybook-workbench-badge">{section.count}</span> : null}
                  </button>
                ))}
              </nav>
            )}
          </aside>

          <section className="storybook-workbench-editor" aria-label="Focused storybook editor">
            {viewMode === 'fields' && (
              <>
                <div className="storybook-editor-tools">
                  <span className="storybook-editor-hint">Each field is edited directly — no parsing.</span>
                  <button
                    type="button"
                    className="inspect-button nodrag"
                    onClick={() => setFieldsDraft(structuredClone(storybook))}
                  >
                    Revert
                  </button>
                  <button
                    type="button"
                    className="inspect-button nodrag"
                    disabled={!parsed.ok}
                    onClick={() => commit(fieldsDraft, 'Applied field edits.')}
                  >
                    Apply
                  </button>
                </div>
                {activeSection === 'story' && <StoryFieldsPanel draft={fieldsDraft} onChange={setFieldsDraft} />}
                {activeSection === 'characters' && (
                  <CharactersPanel
                    referenceCharacters={referenceCharacters}
                    draft={fieldsDraft}
                    selectedCharacterId={selectedCharacterId}
                    onSelectCharacter={setSelectedCharacterId}
                    onChange={setFieldsDraft}
                    identityLocked={identityLocked}
                    onRemoveCharacter={onRemoveCharacter}
                    onExportCharacter={onExportCharacter}
                  />
                )}
              </>
            )}

            {viewMode === 'preview' && (
              <StorybookReadonlyPreview storybook={storybook} referenceCharacters={referenceCharacters} />
            )}

            {viewMode === 'json' && (
              <div className="storybook-json-panel storybook-editor-panel">
                <div className="storybook-editor-tools">
                  <span className={`storybook-editor-validity ${jsonValidity.valid ? 'valid' : 'invalid'}`}>
                    {jsonValidity.valid ? 'Valid JSON' : `Invalid JSON: ${jsonValidity.message}`}
                  </span>
                  <button type="button" className="inspect-button nodrag" onClick={beautifyJson}>
                    Beautify JSON
                  </button>
                  <button type="button" className="inspect-button nodrag" onClick={minifyJson}>
                    Minify
                  </button>
                  <button type="button" className="inspect-button nodrag" onClick={() => copyDraft(jsonDraft)}>
                    Copy
                  </button>
                  {/* Beautify/Minify/Revert replace the draft, which resets the
                      editor's own undo history; Revert is the escape hatch. */}
                  <button
                    type="button"
                    className="inspect-button nodrag"
                    onClick={() => setJsonDraft(rpStorybookEditorJsonView(storybook))}
                  >
                    Revert
                  </button>
                  <button
                    type="button"
                    className="inspect-button nodrag"
                    disabled={!parsed.ok}
                    onClick={applyJson}
                  >
                    Apply
                  </button>
                </div>
                <JsonSyntaxTextarea id="storybook-editor-json" value={jsonDraft} onChange={setJsonDraft} />
              </div>
            )}
          </section>
        </section>
      </section>
    </div>
  );
}
