import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WorkflowNode } from '../types';
import {
  defaultRpStorybookCharacterComfyConfig,
  defaultRpStorybookCharacterBanking,
  defaultRpStorybookCharacterPhoneSettings,
  defaultRpStorybookCharacterSocial,
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

type ViewMode = 'fields' | 'preview' | 'json';
type StorybookSection = 'scenario' | 'intro' | 'history' | 'characters' | 'phone' | 'gallery' | 'social' | 'bank';

type StorybookEditorDialogProps = {
  node: WorkflowNode;
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
  return label
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'CH';
}

function selectedCharacter(draft: RpStorybook, selectedCharacterId: string | null) {
  return draft.characters.find((character) => character.id === selectedCharacterId) ?? draft.characters[0];
}

function sectionDescription(section: StorybookSection) {
  switch (section) {
    case 'intro':
      return 'Player-facing title, premise, and image description behavior.';
    case 'history':
      return 'Imported run memory and opening summary. Runtime-heavy details stay protected.';
    case 'characters':
      return 'Character identity, personality, speech, appearance, and image ownership.';
    case 'phone':
      return 'Character-owned phone settings and contact visibility.';
    case 'gallery':
      return 'Character image libraries, names, and descriptions used by the phone gallery.';
    case 'social':
      return 'Public and private social handles used by Fotogram and OnlyFriends.';
    case 'bank':
      return 'Starting balances and fixed expense data used by banking surfaces.';
    case 'scenario':
    default:
      return 'Core story setup that feeds the graph and Play Mode.';
  }
}

function StorybookEditableField({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`storybook-workbench-field${wide ? ' wide' : ''}`}>
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  );
}

type DraftEditorProps = {
  section: StorybookSection;
  draft: RpStorybook;
  selectedCharacterId: string | null;
  onSelectCharacter: (characterId: string) => void;
  onChange: (next: RpStorybook) => void;
};

function StorybookCharacterCards({
  draft,
  selectedCharacterId,
  onSelectCharacter,
}: Pick<DraftEditorProps, 'draft' | 'selectedCharacterId' | 'onSelectCharacter'>) {
  if (draft.characters.length === 0) {
    return <p className="storybook-empty-note">No characters. Add them in Raw JSON.</p>;
  }
  return (
    <div className="storybook-workbench-character-grid">
      {draft.characters.map((character) => (
        <button
          className={`storybook-workbench-character-card${character.id === selectedCharacterId ? ' active' : ''}`}
          type="button"
          key={character.id}
          onClick={() => onSelectCharacter(character.id)}
        >
          <span className="storybook-workbench-avatar">{characterInitials(character)}</span>
          <span className="storybook-workbench-character-copy">
            <strong>{characterLabel(character)}</strong>
            <small>{character.role || 'No role'}</small>
          </span>
          <span className="storybook-workbench-chip-row">
            {character.phoneSettings ? <span>Phone</span> : null}
            {character.social?.fotogramUsername ? <span>Fotogram</span> : null}
            {character.social?.onlyfriendsUsername ? <span>OnlyFriends</span> : null}
            <span>{character.images.length} images</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function StorybookDraftEditor({
  section,
  draft,
  selectedCharacterId,
  onSelectCharacter,
  onChange,
}: DraftEditorProps) {
  const character = selectedCharacter(draft, selectedCharacterId);
  const characterIndex = character
    ? draft.characters.findIndex((entry) => entry.id === character.id)
    : -1;

  const setCharacter = (patch: Partial<RpStorybook['characters'][number]>) => {
    if (!character || characterIndex < 0) {
      return;
    }
    onChange({
      ...draft,
      characters: draft.characters.map((entry, index) =>
        index === characterIndex ? { ...entry, ...patch } : entry,
      ),
    });
  };

  const setImagePrompt = (customText: string) => {
    onChange({
      ...draft,
      imageDescriptionPrompt: customText.trim()
        ? { mode: 'custom', customText }
        : { mode: 'default' },
    });
  };
  const imagePromptText = draft.imageDescriptionPrompt.mode === 'custom'
    ? draft.imageDescriptionPrompt.customText ?? ''
    : '';

  if (section === 'intro') {
    return (
      <div className="storybook-workbench-field-grid">
        <StorybookEditableField label="Title" hint="shown in Play Mode header" wide>
          <input
            type="text"
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.currentTarget.value })}
          />
        </StorybookEditableField>
        <StorybookEditableField label="Introduction" hint="storybook premise" wide>
          <textarea
            value={draft.introduction}
            spellCheck={false}
            onChange={(event) => onChange({ ...draft, introduction: event.currentTarget.value })}
          />
        </StorybookEditableField>
        <StorybookEditableField label="Image Description Prompt" hint="blank uses default prompt" wide>
          <textarea
            value={imagePromptText}
            placeholder="Default prompt"
            spellCheck={false}
            onChange={(event) => setImagePrompt(event.currentTarget.value)}
          />
        </StorybookEditableField>
      </div>
    );
  }

  if (section === 'history') {
    return (
      <div className="storybook-workbench-field-grid">
        <StorybookEditableField label="Opening History Summary" hint="editable imported memory summary" wide>
          <textarea
            value={draft.openingHistory.summary}
            spellCheck={false}
            onChange={(event) =>
              onChange({
                ...draft,
                openingHistory: { ...draft.openingHistory, summary: event.currentTarget.value },
              })
            }
          />
        </StorybookEditableField>
      </div>
    );
  }

  if (section === 'characters') {
    return (
      <div className="storybook-workbench-section-stack">
        <StorybookCharacterCards
          draft={draft}
          selectedCharacterId={character?.id ?? selectedCharacterId}
          onSelectCharacter={onSelectCharacter}
        />
        {character ? (
          <div className="storybook-workbench-field-grid">
            <StorybookEditableField label="Name" hint="display name">
              <input type="text" value={character.name} onChange={(event) => setCharacter({ name: event.currentTarget.value })} />
            </StorybookEditableField>
            <StorybookEditableField label="Role" hint="player, NPC, contact">
              <input type="text" value={character.role} onChange={(event) => setCharacter({ role: event.currentTarget.value })} />
            </StorybookEditableField>
            <StorybookEditableField label="Description" hint="identity and background" wide>
              <textarea value={character.description} spellCheck={false} onChange={(event) => setCharacter({ description: event.currentTarget.value })} />
            </StorybookEditableField>
            <StorybookEditableField label="Personality" hint="behavior pattern">
              <textarea value={character.personality} spellCheck={false} onChange={(event) => setCharacter({ personality: event.currentTarget.value })} />
            </StorybookEditableField>
            <StorybookEditableField label="Speech Style" hint="dialogue voice">
              <textarea value={character.speechStyle} spellCheck={false} onChange={(event) => setCharacter({ speechStyle: event.currentTarget.value })} />
            </StorybookEditableField>
            <StorybookEditableField label="Appearance" hint="image generation context" wide>
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
            </StorybookEditableField>
          </div>
        ) : null}
      </div>
    );
  }

  if (!character) {
    return <p className="storybook-empty-note">No character is available for this section.</p>;
  }

  if (section === 'phone') {
    return (
      <div className="storybook-workbench-section-stack">
        <StorybookCharacterCards draft={draft} selectedCharacterId={character.id} onSelectCharacter={onSelectCharacter} />
        <div className="storybook-workbench-field-grid">
          <StorybookEditableField label="Phone Wallpaper ID" hint="active phone home background" wide>
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
          </StorybookEditableField>
        </div>
      </div>
    );
  }

  if (section === 'gallery') {
    return (
      <div className="storybook-workbench-section-stack">
        <StorybookCharacterCards draft={draft} selectedCharacterId={character.id} onSelectCharacter={onSelectCharacter} />
        {character.images.length === 0 ? <p className="storybook-empty-note">This character has no images.</p> : null}
        {character.images.map((image, imageIndex) => (
          <div className="storybook-workbench-image-editor" key={image.id}>
            <div className="storybook-workbench-image-preview">
              <img src={image.dataUrl} alt={image.description || image.name || image.id} />
            </div>
            <div className="storybook-workbench-field-grid">
              <StorybookEditableField label="Image Name" hint={image.id} wide>
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
              </StorybookEditableField>
              <StorybookEditableField label="Image Description" hint="used for matching attachments" wide>
                <textarea
                  value={image.description}
                  spellCheck={false}
                  onChange={(event) =>
                    setCharacter({
                      images: character.images.map((entry, index) =>
                        index === imageIndex ? { ...entry, description: event.currentTarget.value } : entry,
                      ),
                    })
                  }
                />
              </StorybookEditableField>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section === 'social') {
    return (
      <div className="storybook-workbench-section-stack">
        <StorybookCharacterCards draft={draft} selectedCharacterId={character.id} onSelectCharacter={onSelectCharacter} />
        <div className="storybook-workbench-field-grid">
          <StorybookEditableField label="Fotogram Username" hint="public social account">
            <input
              type="text"
              value={(character.social ?? defaultRpStorybookCharacterSocial()).fotogramUsername}
              onChange={(event) =>
                setCharacter({
                  social: {
                    ...(character.social ?? defaultRpStorybookCharacterSocial()),
                    fotogramUsername: event.currentTarget.value,
                  },
                })
              }
            />
          </StorybookEditableField>
          <StorybookEditableField label="OnlyFriends Username" hint="private social account">
            <input
              type="text"
              value={(character.social ?? defaultRpStorybookCharacterSocial()).onlyfriendsUsername}
              onChange={(event) =>
                setCharacter({
                  social: {
                    ...(character.social ?? defaultRpStorybookCharacterSocial()),
                    onlyfriendsUsername: event.currentTarget.value,
                  },
                })
              }
            />
          </StorybookEditableField>
        </div>
      </div>
    );
  }

  if (section === 'bank') {
    return (
      <div className="storybook-workbench-section-stack">
        <StorybookCharacterCards draft={draft} selectedCharacterId={character.id} onSelectCharacter={onSelectCharacter} />
        <div className="storybook-workbench-field-grid">
          <StorybookEditableField label="Starting Balance" hint="phone banking balance" wide>
            <input
              type="number"
              value={(character.banking ?? defaultRpStorybookCharacterBanking()).startBalance}
              onChange={(event) =>
                setCharacter({
                  banking: {
                    ...(character.banking ?? defaultRpStorybookCharacterBanking()),
                    startBalance: Number.isFinite(event.currentTarget.valueAsNumber)
                      ? event.currentTarget.valueAsNumber
                      : defaultRpStorybookCharacterBanking().startBalance,
                  },
                })
              }
            />
          </StorybookEditableField>
        </div>
      </div>
    );
  }

  return (
    <div className="storybook-workbench-field-grid">
      <StorybookEditableField label="Title" hint="shown in Play Mode header" wide>
        <input
          type="text"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.currentTarget.value })}
        />
      </StorybookEditableField>
      <StorybookEditableField label="Introduction" hint="storybook premise" wide>
        <textarea
          value={draft.introduction}
          spellCheck={false}
          onChange={(event) => onChange({ ...draft, introduction: event.currentTarget.value })}
        />
      </StorybookEditableField>
      <StorybookEditableField label="Scenario Summary" hint="always included in context" wide>
        <textarea
          className="tall"
          value={draft.scenario.summary}
          spellCheck={false}
          onChange={(event) =>
            onChange({ ...draft, scenario: { ...draft.scenario, summary: event.currentTarget.value } })
          }
        />
      </StorybookEditableField>
      <StorybookEditableField label="Opening Situation" hint="first scene seed">
        <textarea
          value={draft.scenario.openingSituation}
          spellCheck={false}
          onChange={(event) =>
            onChange({ ...draft, scenario: { ...draft.scenario, openingSituation: event.currentTarget.value } })
          }
        />
      </StorybookEditableField>
      <StorybookEditableField label="Current Situation" hint="updated as story moves">
        <textarea
          value={draft.scenario.currentSituation}
          spellCheck={false}
          onChange={(event) =>
            onChange({ ...draft, scenario: { ...draft.scenario, currentSituation: event.currentTarget.value } })
          }
        />
      </StorybookEditableField>
    </div>
  );
}

function StorybookReadonlyPreview({ storybook }: { storybook: RpStorybook }) {
  return (
    <div className="storybook-ui-view">
      <div className="storybook-ui-header">
        <div className="storybook-ui-cover-art">
          <div className="book-spine" />
          <div className="book-details">
            <h3>{storybook.title || 'Untitled RP Storybook'}</h3>
            <p className="storybook-intro">{storybook.introduction || 'No introduction defined.'}</p>
          </div>
        </div>
      </div>

      <section className="storybook-section scenario-section">
        <div className="section-header">
          <h4>Scenario</h4>
        </div>
        <div className="section-content">
          <div className="scenario-field">
            <span className="field-label">Summary</span>
            <p>{storybook.scenario.summary || 'No scenario summary defined.'}</p>
          </div>
          <div className="scenario-grid">
            <div className="scenario-field">
              <span className="field-label">Opening Situation</span>
              <p>{storybook.scenario.openingSituation || 'No opening situation defined.'}</p>
            </div>
            <div className="scenario-field">
              <span className="field-label">Current Situation</span>
              <p>{storybook.scenario.currentSituation || 'No current situation defined.'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="storybook-section actors-section">
        <div className="section-header">
          <h4>Characters</h4>
        </div>
        {storybook.characters.length ? (
          <div className="storybook-actor-grid">
            {storybook.characters.map((character) => (
              <article className="storybook-actor-card" key={character.id}>
                <div className="character-card-header">
                  {character.profileImage?.dataUrl ? (
                    <img
                      className="storybook-editor-avatar"
                      src={character.profileImage.dataUrl}
                      alt={character.name || character.id}
                    />
                  ) : null}
                  <div className="storybook-editor-actor-heading">
                    <strong>{character.name || character.id}</strong>
                    {character.role ? <span className="field-label">{character.role}</span> : null}
                  </div>
                </div>
                {character.description ? <p>{character.description}</p> : null}
                {character.personality ? (
                  <p><span className="field-label">Personality</span> {character.personality}</p>
                ) : null}
                {character.speechStyle ? (
                  <p><span className="field-label">Speech Style</span> {character.speechStyle}</p>
                ) : null}
                {character.comfyConfig?.appearance ? (
                  <p><span className="field-label">Appearance</span> {character.comfyConfig.appearance}</p>
                ) : null}
                {character.images.length ? (
                  <div className="storybook-editor-thumbnails">
                    {character.images.slice(0, 8).map((image) => (
                      <img
                        key={image.id}
                        src={image.dataUrl}
                        alt={image.description || image.id}
                        title={image.description || image.id}
                      />
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="storybook-empty-note">No characters defined.</p>
        )}
      </section>
    </div>
  );
}

export function StorybookEditorDialog({ node, onCommit, onClose }: StorybookEditorDialogProps) {
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onClose);
  const dialogRef = useRef<HTMLElement | null>(null);
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
  const [activeSection, setActiveSection] = useState<StorybookSection>('scenario');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(() => storybook.characters[0]?.id ?? null);
  const [jsonDraft, setJsonDraft] = useState(() => rpStorybookEditorJsonView(storybook));
  const [fieldsDraft, setFieldsDraft] = useState<RpStorybook>(() => structuredClone(storybook));
  const [assistantDraft, setAssistantDraft] = useState('');
  const [status, setStatus] = useState('');
  const [seededFromJson, setSeededFromJson] = useState(node.data.storybookJson);

  useEffect(() => {
    const stopGraphDeleteKeys = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return;
      }
      const target = event.target;
      if (target instanceof Node && dialogRef.current?.contains(target)) {
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', stopGraphDeleteKeys, true);
    return () => window.removeEventListener('keydown', stopGraphDeleteKeys, true);
  }, []);

  // Reseed drafts when the node's stored storybook changes (render-time reset).
  if (node.data.storybookJson !== seededFromJson) {
    setSeededFromJson(node.data.storybookJson);
    setJsonDraft(rpStorybookEditorJsonView(storybook));
    setFieldsDraft(structuredClone(storybook));
    setSelectedCharacterId(storybook.characters[0]?.id ?? null);
  }

  const selectedDraftCharacter = selectedCharacter(fieldsDraft, selectedCharacterId);
  const jsonValidity = useMemo(() => {
    try {
      JSON.parse(jsonDraft);
      return { valid: true as const };
    } catch (error) {
      return { valid: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  }, [jsonDraft]);

  const storybookStats = useMemo(() => {
    const imageCount = fieldsDraft.characters.reduce((total, character) => total + character.images.length, 0);
    const socialCount = fieldsDraft.characters.reduce(
      (total, character) =>
        total + Number(Boolean(character.social?.fotogramUsername)) + Number(Boolean(character.social?.onlyfriendsUsername)),
      0,
    );
    return {
      imageCount,
      socialCount,
      protectedHistoryItems:
        fieldsDraft.openingHistory.turns.length +
        fieldsDraft.openingHistory.events.length +
        fieldsDraft.openingHistory.checkpoints.length,
    };
  }, [fieldsDraft]);

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

  function applyFields() {
    commit(fieldsDraft, 'Applied field edits.');
  }

  function selectSection(section: StorybookSection) {
    setActiveSection(section);
    setViewMode('fields');
  }

  const sections: Array<{
    id: StorybookSection;
    group: 'Story' | 'Characters' | 'Surfaces';
    label: string;
    detail: string;
    count?: number;
  }> = [
    { id: 'scenario', group: 'Story', label: 'Scenario', detail: 'summary, opening, current', count: 3 },
    { id: 'intro', group: 'Story', label: 'Intro', detail: 'title, premise, image prompt' },
    { id: 'history', group: 'Story', label: 'Opening History', detail: 'summary and protected memory', count: fieldsDraft.openingHistory.turns.length },
    { id: 'characters', group: 'Characters', label: 'Characters', detail: 'identity, voice, appearance', count: fieldsDraft.characters.length },
    { id: 'phone', group: 'Surfaces', label: 'Phone', detail: 'wallpaper and contacts' },
    { id: 'gallery', group: 'Surfaces', label: 'Gallery', detail: 'image libraries', count: storybookStats.imageCount },
    { id: 'social', group: 'Surfaces', label: 'Social', detail: 'Fotogram, OnlyFriends', count: storybookStats.socialCount },
    { id: 'bank', group: 'Surfaces', label: 'Bank', detail: 'balances, expenses' },
  ];

  const editorHeading = viewMode === 'json'
    ? 'Advanced JSON Editor'
    : viewMode === 'preview'
      ? 'Storybook Preview'
      : sections.find((section) => section.id === activeSection)?.label ?? 'Scenario';

  return (
    <div className="dialog-backdrop" role="presentation" {...backdropDismiss}>
      <section
        ref={dialogRef}
        className="storybook-creator-dialog storybook-workbench-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="RP Storybook Editor"
      >
        <header className="storybook-workbench-titlebar">
          <div className="storybook-workbench-title-main">
            <span className="storybook-workbench-mark">SB</span>
            <div className="storybook-title-row">
              <h2>{fieldsDraft.title || node.data.label}</h2>
              <p>{status || node.data.storybookStatus || 'Ready'}</p>
            </div>
          </div>
          <div className="storybook-header-actions">
            <button type="button" className="inspect-button nodrag" onClick={() => copyDraft(rpStorybookEditorJsonView(fieldsDraft))}>
              Copy JSON
            </button>
            <button type="button" className="close-button danger" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {!parsed.ok && (
          <span className="run-note storybook-file-status">
            This node&rsquo;s stored JSON is invalid; editing is disabled to avoid overwriting it.
          </span>
        )}

        <section className="storybook-workbench-layout">
          <aside className="storybook-workbench-rail">
            <div className="storybook-workbench-rail-head">
              <input className="storybook-workbench-search" type="search" placeholder="Search storybook" aria-label="Search storybook" />
              <button type="button" className="inspect-button nodrag" onClick={() => selectSection('characters')}>
                Character Detail
              </button>
            </div>
            <nav className="storybook-workbench-nav" aria-label="Storybook sections">
              {(['Story', 'Characters', 'Surfaces'] as const).map((group) => (
                <section className="storybook-workbench-nav-group" key={group}>
                  <h3>{group}</h3>
                  {sections.filter((section) => section.group === group).map((section) => (
                    <button
                      type="button"
                      className={`storybook-workbench-nav-item${activeSection === section.id && viewMode === 'fields' ? ' active' : ''}`}
                      key={section.id}
                      onClick={() => selectSection(section.id)}
                    >
                      <span className="storybook-workbench-nav-icon">{section.label.slice(0, 1)}</span>
                      <span className="storybook-workbench-nav-copy">
                        <strong>{section.label}</strong>
                        <small>{section.detail}</small>
                      </span>
                      {section.count !== undefined ? <span className="storybook-workbench-badge">{section.count}</span> : null}
                    </button>
                  ))}
                </section>
              ))}
            </nav>
            <div className="storybook-workbench-rail-foot">
              <strong>Safe edits</strong>
              <span>Editable fields are marked cyan. Read-only fields are shown in the side panel.</span>
            </div>
          </aside>

          <section className="storybook-workbench-editor" aria-label="Focused storybook editor">
            <header className="storybook-workbench-editor-head">
              <div>
                <h3>{editorHeading}</h3>
                <p>{viewMode === 'fields' ? sectionDescription(activeSection) : 'Switch back to Fields for normal editing.'}</p>
              </div>
              <div className="storybook-workbench-mode-switch" aria-label="Editor mode">
                <button type="button" className={viewMode === 'fields' ? 'active' : ''} onClick={() => setViewMode('fields')}>
                  Fields
                </button>
                <button type="button" className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')}>
                  Preview
                </button>
                <button type="button" className={viewMode === 'json' ? 'active' : ''} onClick={() => setViewMode('json')}>
                  Raw JSON
                </button>
              </div>
            </header>

            <div className="storybook-workbench-editor-body">
              {viewMode === 'fields' && (
                <StorybookDraftEditor
                  section={activeSection}
                  draft={fieldsDraft}
                  selectedCharacterId={selectedCharacterId}
                  onSelectCharacter={setSelectedCharacterId}
                  onChange={setFieldsDraft}
                />
              )}

              {viewMode === 'preview' && <StorybookReadonlyPreview storybook={fieldsDraft} />}

              {viewMode === 'json' && (
                <div className="storybook-json-panel storybook-workbench-json-panel">
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
                      Apply JSON
                    </button>
                  </div>
                  <label className="storybook-workbench-json-label" htmlFor="storybook-editor-json">
                    Storybook raw JSON
                  </label>
                  <JsonSyntaxTextarea
                    id="storybook-editor-json"
                    value={jsonDraft}
                    onChange={setJsonDraft}
                  />
                </div>
              )}
            </div>
          </section>

          <aside className="storybook-workbench-assistant" aria-label="Storybook assistant">
            <header>
              <strong>Assistant</strong>
              <small>Section-aware edit brief</small>
            </header>
            <div className="storybook-workbench-assistant-body">
              <section className="storybook-workbench-passive-card">
                <strong>Selected impact</strong>
                <p>{sectionDescription(activeSection)}</p>
                <div className="storybook-workbench-chip-row">
                  <span>{fieldsDraft.characters.length} characters</span>
                  <span>{storybookStats.imageCount} images</span>
                  <span>{storybookStats.protectedHistoryItems} protected history items</span>
                </div>
              </section>
              <section className="storybook-workbench-passive-card">
                <strong>Current character</strong>
                <p>{selectedDraftCharacter ? `${characterLabel(selectedDraftCharacter)} - ${selectedDraftCharacter.role || 'No role'}` : 'No character selected.'}</p>
                <div className="storybook-workbench-chip-row">
                  {selectedDraftCharacter?.phoneSettings ? <span>Phone</span> : null}
                  {selectedDraftCharacter?.social?.fotogramUsername ? <span>Fotogram</span> : null}
                  {selectedDraftCharacter?.social?.onlyfriendsUsername ? <span>OnlyFriends</span> : null}
                  {selectedDraftCharacter ? <span>{selectedDraftCharacter.images.length} images</span> : null}
                </div>
              </section>
              <label className="storybook-workbench-assistant-prompt">
                <span>Assistant request</span>
                <textarea
                  value={assistantDraft}
                  placeholder="Describe what should change in this section..."
                  onChange={(event) => setAssistantDraft(event.currentTarget.value)}
                />
              </label>
              <div className="storybook-workbench-assistant-actions">
                <button
                  type="button"
                  className="inspect-button nodrag"
                  onClick={() => {
                    setAssistantDraft(`Improve ${editorHeading.toLowerCase()} while preserving the current storybook structure.`);
                  }}
                >
                  Suggest Brief
                </button>
                <button
                  type="button"
                  className="inspect-button nodrag"
                  onClick={() => copyDraft(assistantDraft)}
                  disabled={!assistantDraft.trim()}
                >
                  Copy Brief
                </button>
              </div>
              <section className="storybook-workbench-passive-card">
                <strong>Validation</strong>
                <p>{jsonValidity.valid ? 'Raw JSON draft is valid.' : jsonValidity.message}</p>
                <div className="storybook-workbench-chip-row">
                  <span>Format 2.2.0</span>
                  <span>Binary data protected</span>
                </div>
              </section>
            </div>
          </aside>
        </section>

        <footer className="storybook-workbench-footer">
          <div className="storybook-workbench-footer-status">
            <span className="storybook-workbench-status-dot" />
            <span>{status || 'Draft ready. Apply writes the storybook back to the node.'}</span>
          </div>
          <div className="storybook-header-actions">
            <button type="button" className="inspect-button nodrag" onClick={() => setFieldsDraft(structuredClone(storybook))}>
              Revert All
            </button>
            <button type="button" className="inspect-button nodrag storybook-workbench-primary" disabled={!parsed.ok} onClick={applyFields}>
              Apply Storybook
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
