import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');
const graphStyles = readFileSync('src/styles/graph-workbench.css', 'utf8');
const topbarStyles = readFileSync('src/styles/topbar-menu.css', 'utf8');
const studioShellStyles = readFileSync('src/styles/studio-shell.css', 'utf8');
const studioThemeStyles = readFileSync('src/styles/studio-theme.css', 'utf8');
const conversationPanel = readFileSync('src/components/ChatConversationPanel.tsx', 'utf8');
const appSource = readFileSync('src/App.tsx', 'utf8');

function cssRange(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing CSS start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing CSS end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function cssRule(source: string, selector: string): string {
  const startIndex = source.indexOf(`${selector} {`);
  expect(startIndex, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf('}', startIndex);
  expect(endIndex, `unterminated CSS rule: ${selector}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex + 1);
}

describe('theme coverage for audited Studio surfaces', () => {
  it('does not let the graph Ready chip fall back to graph-shell-local aliases', () => {
    const readyChip = cssRange(graphStyles, '.graph-ready-chip {', '.graph-secondary-action {');
    expect(readyChip).toContain('var(--theme-graph-panel');
    expect(readyChip).toContain('var(--theme-graph-line');
    expect(readyChip).toContain('var(--theme-graph-muted');
    expect(readyChip).toContain('var(--theme-graph-success');
  });

  it('themes the burger menu button from application roles', () => {
    const button = cssRule(topbarStyles, '.topbar-menu-button');
    const interactive = cssRule(topbarStyles, '.topbar-menu-button:hover,\n.topbar-menu-button.active');

    for (const rule of [button, interactive]) {
      expect(rule).toMatch(/var\(--theme-app-/);
      expect(rule).not.toMatch(/--theme-shell-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('themes the graph node-palette controls from graph roles', () => {
    const paletteControls = cssRange(styles, '.node-palette-tab {', '.node-palette-items {');
    expect(paletteControls).toContain('var(--graph-panel');
    expect(paletteControls).toContain('var(--graph-line');
    expect(paletteControls).toContain('var(--graph-cyan');
    expect(paletteControls).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('keeps Graph toast states semantically distinct', () => {
    const systemInfo = cssRule(styles, '.system-toast.info');
    const systemWarning = cssRule(styles, '.system-toast.warning');
    const systemError = cssRule(styles, '.system-toast.error');
    const graphInfo = cssRule(styles, '.graph-system-toast.info');
    const graphWarning = cssRule(styles, '.graph-system-toast.warning');
    const graphError = cssRule(styles, '.graph-system-toast.error');

    expect(systemInfo).toContain('var(--theme-app-accent)');
    expect(graphInfo).toContain('var(--theme-graph-accent)');
    for (const rule of [systemWarning, graphWarning]) expect(rule).toContain('var(--warning)');
    for (const rule of [systemError, graphError]) expect(rule).toContain('var(--danger)');
    for (const rule of [systemInfo, systemWarning, systemError, graphInfo, graphWarning, graphError]) {
      expect(rule).not.toMatch(/--theme-(?:app|graph)-(?:text|dialog-text)|--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('themes Graph header controls and the prompt-preset menu from semantic roles', () => {
    const selectors = [
      '.topbar .connection-button:hover',
      '.panel-label small,\n.graph-node-count-button',
      '.graph-node-count-button:hover,\n.graph-node-count-button.open',
      '.prompt-preset-menu',
      '.prompt-preset-menu-header',
      '.prompt-preset-menu-header small',
      '.prompt-preset-group',
      '.prompt-preset-group-title',
      '.prompt-preset-section-title',
      '.prompt-preset-row.action-row .prompt-preset-row-label strong',
      '.prompt-preset-row-label span',
      '.prompt-preset-row-label strong',
      '.prompt-preset-switch',
      '.prompt-preset-switch button',
      '.prompt-preset-switch button:hover:not(:disabled)',
      '.prompt-preset-switch button.active',
      '.prompt-preset-switch button:disabled',
      '.prompt-preset-edit-button',
      '.prompt-preset-edit-button:hover',
      '.prompt-preset-empty',
    ];

    for (const selector of selectors) {
      const rule = cssRule(styles, selector);
      expect(rule, selector).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(|\bblack\b/i);
    }

    const nodeCountStates = cssRange(
      styles,
      '.graph-node-count-button:hover,',
      '.graph-node-count-button.blink {',
    );
    expect(nodeCountStates).toContain('var(--warning)');
    expect(nodeCountStates).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(|\bblack\b/i);
  });

  it('themes provider tabs, sampling inputs, and model actions from semantic roles', () => {
    const tabs = cssRange(styles, '.preset-tabs button {', '.provider-tab-label {');
    const sampling = cssRange(styles, '.connection-sampling-section {', '.connection-detected-capabilities {');
    const modelActions = cssRange(
      styles,
      '.connection-provider-actions {\n  display: flex;',
      '.connection-field label {',
    );
    const inputs = cssRange(styles, '.connection-field input:not([type="checkbox"]):not([type="radio"]),', '.connection-field input[type="checkbox"] {');

    for (const block of [tabs, sampling, modelActions, inputs]) {
      expect(block).not.toMatch(/--theme-raw-/);
    }
    expect(tabs).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(modelActions).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('themes the remaining provider setup panels and tools from semantic roles', () => {
    const selectors = [
      '.connection-dialog-right',
      '.provider-presets button',
      '.provider-presets button:hover',
      '.connection-draft-placeholder',
      '.llama-router-notice code',
      '.llama-router-notice pre',
      '.llama-router-notice button',
      '.llama-router-notice button:hover',
      '.provider-presets button.active',
      '.comfy-role-options button',
      '.comfy-role-options button:hover',
      '.connection-detected-capabilities',
      '.connection-tts-section',
      '.comfy-workflow-onboarding',
      '.comfy-workflow-onboarding strong',
      '.comfy-workflow-memory-note',
      '.comfy-workflow-onboarding .comfy-workflow-memory-note strong',
      '.comfy-workflow-onboarding .comfy-workflow-memory-note span',
      '.comfy-workflow-compatibility',
      '.comfy-workflow-compatibility.error',
      '.comfy-workflow-compatibility.ready',
      '.comfy-workflow-compatibility strong',
      '.comfy-workflow-compatibility span',
      '.comfy-workflow-checklist-item',
      '.comfy-workflow-checklist-item.ok',
      '.comfy-workflow-checklist-item.missing',
      '.comfy-workflow-checklist-item small',
      '.comfy-workflow-checkmark',
      '.comfy-workflow-checklist-item.ok .comfy-workflow-checkmark',
      '.connection-inline-button',
      '.connection-vision-label',
      '.connection-provider-tools',
      '.connection-provider-tools strong',
    ];

    for (const selector of selectors) {
      const rule = cssRule(styles, selector);
      expect(rule, selector).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }

  });

  it('themes provider health and model-selection states from semantic roles', () => {
    const selectors = [
      '.provider-health',
      '.provider-health.online',
      '.provider-health.offline',
      '.provider-health.checking',
      '.provider-health.warning',
      '.model-id-input-row input,\n.secret-input-row input',
      '.model-id-input-row input:focus,\n.secret-input-row input:focus',
      '.model-id-picker.character-lora-selected .model-id-input-row input',
      '.model-id-picker.disabled .model-id-input-row input',
      '.model-id-picker.disabled .model-id-dropdown-button',
      '.model-id-dropdown-button,\n.secret-input-toggle',
      '.model-id-dropdown-button:hover,\n.model-id-dropdown-button:focus-visible,\n.secret-input-toggle:hover,\n.secret-input-toggle:focus-visible',
      '.model-id-option-group + .model-id-option-group',
      '.model-id-separator',
      '.model-id-option + .model-id-option',
      '.model-id-favorite-button,\n.model-id-option-button',
      '.model-id-favorite-button',
      '.model-id-favorite-button[aria-pressed="true"]',
      '.model-id-option:hover,\n.model-id-option:focus-within',
      '.model-id-option.character-lora',
      '.model-id-option.character-lora:hover,\n.model-id-option.character-lora:focus-within',
      '.model-id-option.character-lora .model-id-option-button',
      '.model-id-option.character-lora .model-id-favorite-button',
      '.model-id-option-button[aria-selected="true"]',
      '.model-id-empty',
      '.connection-status',
    ];

    for (const selector of selectors) {
      const rule = cssRule(styles, selector);
      expect(rule, selector).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }

    expect(cssRule(styles, '.provider-health.offline')).toContain('var(--danger)');
    expect(cssRule(styles, '.provider-health.checking')).toContain('var(--warning)');
    expect(cssRule(styles, '.provider-health.warning')).toContain('var(--warning)');
    expect(cssRule(styles, '.model-id-picker.character-lora-selected .model-id-input-row input')).toContain('var(--warning)');
  });

  it('themes Comfy image-model states from application and status roles', () => {
    const selectors = [
      '.image-model-state-button',
      '.image-model-state-button.loaded',
      '.image-model-state-button.loading,\n.image-model-state-button.unloading',
      '.image-model-state-button.unloaded',
      '.image-model-state-button.loaded:hover:not(:disabled)',
      '.image-generation-provider-error',
    ];

    for (const selector of selectors) {
      const rule = cssRule(styles, selector);
      expect(rule, selector).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
    expect(cssRule(styles, '.image-model-state-button.loaded')).toContain('var(--success)');
    expect(cssRule(styles, '.image-model-state-button.loading,\n.image-model-state-button.unloading')).toContain('var(--warning)');
    expect(cssRule(styles, '.image-model-state-button.loaded:hover:not(:disabled)')).toContain('var(--danger)');
  });

  it('themes compression and history inspection surfaces from semantic roles', () => {
    const selectors = [
      '.text-form label',
      '.text-form textarea',
      '.text-form textarea:focus',
      '.compression-inspection-part',
      '.history-inspection-part',
      '.history-inspection-part .highlighted-preview-text',
      '.history-preview-empty',
      '.compression-inspection-part.compressed-source label',
      '.compression-inspection-part.compressed-source textarea',
      '.compression-inspection-part.compressed-summary label',
      '.compression-inspection-part.compressed-summary textarea',
      '.compression-inspection-part.uncompressed-tail label',
      '.compression-inspection-part.uncompressed-tail textarea',
    ];

    for (const selector of selectors) {
      const rule = cssRule(styles, selector);
      expect(rule, selector).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(|\bblack\b/i);
    }
    expect(cssRule(styles, '.compression-inspection-part.compressed-source textarea')).toContain('var(--danger)');
    expect(cssRule(styles, '.compression-inspection-part.compressed-summary textarea')).toContain('var(--warning)');
    expect(cssRule(styles, '.compression-inspection-part.uncompressed-tail textarea')).toContain('var(--success)');
  });

  it('themes the System Log and Studio Files footers from shared dialog roles', () => {
    const fileFooter = cssRange(styles, '.dialog-actions.chat-files-actions {', '.character-import-filters {');
    const logFooter = cssRange(styles, '.system-log-actions {', '.connection-dialog-grid {');
    for (const footer of [fileFooter, logFooter]) {
      expect(footer).toContain('var(--theme-app-line');
      expect(footer).toContain('var(--theme-app-surface-soft');
      expect(footer).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it('themes the Storybook Phone Contacts matrix without crossing into simulated-phone styles', () => {
    const contacts = cssRange(styles, '.phone-contact-matrix-wrap {', '.no-data-msg {');
    expect(contacts).toContain('var(--storybook-panel');
    expect(contacts).toContain('var(--storybook-line');
    expect(contacts).toContain('var(--storybook-lime');
    expect(contacts).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('themes startup autosave choices from application roles', () => {
    const selectors = [
      '.turn-autosave-choice-copy',
      '.turn-autosave-choice-row',
      '.turn-autosave-choice-row button',
      '.turn-autosave-choice-row button:hover,\n.turn-autosave-choice-row button:focus-visible',
      '.dialog-title-row',
      '.dialog-title-row h2',
      '.dialog-title-row button',
      '.dialog-title-row button:hover,\n.dialog-title-row button:focus-visible',
    ];

    for (const selector of selectors) {
      expect(cssRule(styles, selector), selector).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('themes save and reset toolbar controls from application roles', () => {
    const controls = cssRule(styles, '.topbar-action-buttons .graph-reset');
    const hover = cssRule(styles, '.topbar-action-buttons .graph-reset:not(:disabled):hover');
    const disabled = cssRule(styles, '.topbar-action-buttons .graph-reset:disabled');

    for (const rule of [controls, hover, disabled]) {
      expect(rule).toContain('var(--theme-app-');
      expect(rule).not.toMatch(/--graph-|--theme-shell-|--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('themes autoplay chrome and uses a real image icon for attachments', () => {
    const autoplay = cssRule(styles, '.autoplay-split-button');
    const autoplayButtons = cssRule(styles, '.composer .autoplay-menu-trigger,\n.composer .autoplay-state-toggle');
    const autoplayHover = cssRule(styles, '.composer .autoplay-menu-trigger:hover,\n.composer .autoplay-menu-trigger[aria-expanded="true"],\n.composer .autoplay-state-toggle:hover');

    for (const rule of [autoplay, autoplayButtons, autoplayHover]) {
      expect(rule).toMatch(/var\(--theme-(?:shell|primary|border)/);
      expect(rule).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }

    expect(studioShellStyles).not.toContain('.attach-image-button:not(.voice-stop-button)::before');
    expect(conversationPanel).toContain('className="attach-image-icon"');
  });

  it('themes the shared assistant-window shells and primary content surfaces', () => {
    const selectors = [
      '.dialog-backdrop',
      '.node-assistant-dialog',
      '.node-assistant-header',
      '.node-assistant-context-meter',
      '.node-assistant-context-meter span',
      '.node-assistant-context-meter .context-meter-total',
      '.node-assistant-chat-log',
      '.node-assistant-empty-state .assistant-avatar-large',
      '.node-assistant-empty-state .prompt-suggestions button',
      '.node-assistant-table-wrap',
      '.node-assistant-table th,\n.node-assistant-table td',
      '.node-assistant-table th',
      '.node-assistant-table td',
      '.node-assistant-body .chat-message-row.user .chat-message-bubble',
      '.node-assistant-body .chat-message-row.assistant .chat-message-bubble',
      '.node-assistant-body .chat-message-row.context .chat-message-bubble',
      '.node-assistant-edit-form textarea',
      '.node-assistant-edit-actions button',
      '.node-assistant-form',
      '.node-assistant-form textarea',
      '.node-assistant-form .send-message-button',
      '.node-assistant-code-block',
      '.node-assistant-inline-code',
      '.image-generation-assistant-dialog',
      '.image-generation-preview-panel,\n.image-generation-settings,\n.image-generation-prompt-panel',
      '.image-generation-preview-stage',
      '.image-generation-placeholder',
      '.image-generation-placeholder strong',
      '.image-generation-provider-fields label > span',
      '.image-generation-assistant-dialog .dialog-header.storybook-creator-header',
      '.image-generation-assistant-dialog .storybook-title-row h2',
      '.preview-nav-btn',
      '.preview-save-btn',
      '.image-generation-error',
      '.custom-node-assistant-dialog .storybook-title-row p',
      '.custom-node-assistant-provider label',
      '.custom-node-diagnostics',
      '.custom-node-diagnostic',
      '.storybook-chat-panel',
      '.storybook-chat-log',
      '.assistant-avatar-large',
      '.chat-empty-state .empty-title',
      '.prompt-suggestions li',
      '.chat-message-bubble',
      '.chat-message-row.user .chat-message-bubble',
      '.chat-message-row.error .chat-message-bubble',
      '.storybook-chat-form',
      '.storybook-chat-form textarea',
      '.send-message-button',
    ];

    for (const selector of selectors) {
      expect(cssRule(styles, selector), selector).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('keeps the Play footer and character strip visually continuous', () => {
    const footerRail = cssRule(studioThemeStyles, '.studio[data-studio-theme] .studio-play-footer .studio-activity-rail');
    const characterStrip = cssRule(studioShellStyles, '.studio-character-strip');

    expect(footerRail).toContain('background: transparent');
    expect(characterStrip).toContain('background: var(--theme-surface-content');
  });

  it('keeps the Play footer Switch control and removes the pop-out control', () => {
    expect(appSource).toContain('className="switch-player-button"');
    expect(appSource).not.toContain('className="roleplay-detach-button"');
  });

  it('wires the Graph Run Trace control to the existing turn-trace viewer', () => {
    const graphHud = cssRange(appSource, 'const graphCanvasHud = (', 'const graphInspector = (');

    expect(graphHud).toContain('className="graph-hud-pill graph-run-trace-button"');
    expect(graphHud).toContain('onClick={() => setTurnTraceDialogOpen(true)}');
    expect(graphHud).not.toContain('<span className="graph-hud-pill">Run Trace</span>');
    expect(appSource).toContain('{turnTraceDialogOpen && (');
    expect(appSource).toContain('<TurnTraceDialog');
  });

  it('themes the Chat tab settings menu from application roles', () => {
    const selectors = [
      '.chat-tab-settings-popover',
      '.chat-tab-settings-section + .chat-tab-settings-section',
      '.chat-tab-settings-heading',
      '.chat-tab-settings-popover button',
      '.chat-tab-settings-popover button:hover,\n.chat-tab-settings-popover button:focus-visible,\n.chat-tab-settings-popover button.active',
      '.chat-tab-settings-popover button:disabled',
      '.chat-tab-settings-check',
      '.chat-tab-settings-checkbox.active .chat-tab-settings-check',
      '.chat-tab-settings-size-control',
      '.chat-tab-settings-size-control strong',
      '.chat-tab-settings-size-control button',
    ];

    for (const selector of selectors) {
      const rule = cssRule(styles, selector);
      expect(rule, selector).toContain('var(--theme-app-');
      expect(rule, selector).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(|--soft-white|--surface-alt/i);
    }
  });

  it('themes the Voice Playback close control from application roles', () => {
    const close = cssRule(styles, '.voice-playback-dialog-header > button');
    const closeInteractive = cssRule(styles, '.voice-playback-dialog-header > button:hover,\n.voice-playback-dialog-header > button:focus-visible');

    for (const rule of [close, closeInteractive]) {
      expect(rule).toContain('var(--theme-app-');
      expect(rule).not.toMatch(/--theme-raw-|#[0-9a-f]{3,8}\b|rgba?\(|--soft-white/i);
    }
  });
});
