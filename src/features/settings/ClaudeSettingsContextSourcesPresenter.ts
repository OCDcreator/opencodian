/**
 * "Context & Sources" header presenter for the Claude configuration workbench.
 *
 * Owns the scope selector, target path, Global warning, unsaved-draft switch
 * decision, current-editing summary bar, and the source-inventory disclosure.
 * The section keeps draft/selection tokens and the read/save lifecycle; this
 * presenter only projects that state into DOM and reports user intent back
 * through the host. It never touches the canonical raw draft.
 */
import type { ClaudeSettingsSourceCandidate } from '../../core/agents/backend/ClaudeSettingsSourceService';
import type { ConfigurationEvidence } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { t, type TranslationKey } from '../../i18n';
import type { ClaudeConfigurationScope, ClaudeSettingsStatusLevel } from './ClaudeSettingsMutationController';

export function clearChildren(element: HTMLElement): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

export function appendText(parent: HTMLElement, className: string, text: string, attr?: { name: string; value: string }): HTMLElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  if (attr) node.setAttribute(attr.name, attr.value);
  parent.appendChild(node);
  return node;
}

/** Creates a labelled disclosure toggle pre-wired for aria-expanded/aria-controls. */
export function createDisclosureToggle(text: string, className: string, dataName: string, regionId: string): HTMLButtonElement {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `opencodian-claude-configuration-disclosure-toggle ${className}`;
  toggle.textContent = text;
  toggle.setAttribute('aria-label', text);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', regionId);
  toggle.setAttribute(dataName, 'true');
  return toggle;
}

/** Toggles only visibility/ARIA; the region's DOM and the canonical draft stay untouched. */
export function bindDisclosure(toggle: HTMLButtonElement, region: HTMLElement): void {
  toggle.addEventListener('click', () => {
    region.hidden = !region.hidden;
    toggle.setAttribute('aria-expanded', String(!region.hidden));
  });
}

export function createActionButton(text: string, className: string, dataName: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.title = text;
  button.setAttribute('aria-label', text);
  button.setAttribute(dataName, 'true');
  return button;
}

export function resolveConfigurationScopeSelection(explicit?: string | null): ClaudeConfigurationScope {
  if (explicit === 'global' || explicit === 'local') return explicit;
  return 'project';
}

export function isConfigurationSourceSelectable(source: { scope: string; editable: boolean }): boolean {
  return source.editable && source.scope !== 'managed';
}

const CLAUDE_SETTINGS_ORIGIN_KEYS: Readonly<Record<string, TranslationKey>> = {
  'user-settings': 'settings.claudeCode.configuration.origin.user-settings',
  'project-settings': 'settings.claudeCode.configuration.origin.project-settings',
  'local-settings': 'settings.claudeCode.configuration.origin.local-settings',
  'managed-file': 'settings.claudeCode.configuration.origin.managed-file',
  'managed-plist-device': 'settings.claudeCode.configuration.origin.managed-plist-device',
  'managed-plist-user': 'settings.claudeCode.configuration.origin.managed-plist-user',
  'managed-drop-in': 'settings.claudeCode.configuration.origin.managed-drop-in',
};

/** Localizes a known origin token; unknown tokens stay visible verbatim. */
export function localizeClaudeSettingsOrigin(origin: string): string {
  const key = CLAUDE_SETTINGS_ORIGIN_KEYS[origin];
  return key ? t(key) : origin;
}

export function claudeSettingsScopeLabel(scope: string): string {
  return t(`settings.claudeCode.configuration.scopeLabel.${scope}` as TranslationKey);
}

/** Formats the three evidence axes independently; no axis is ever promoted or merged. */
export function formatClaudeSettingsEvidenceHuman(evidence: ConfigurationEvidence): string {
  const axis = (name: 'persistence' | 'application' | 'runtime'): string =>
    `${t(`settings.claudeCode.configuration.axis.${name}`)}: ${t(`settings.claudeCode.configuration.axisState.${evidence[name]}`)}`;
  return `${axis('persistence')} · ${axis('application')} · ${axis('runtime')}`;
}

/** Raw evidence is deliberately restricted to explicitly expanded technical details. */
export function formatClaudeSettingsEvidenceTechnical(evidence: ConfigurationEvidence): string {
  return `persistence=${evidence.persistence}; application=${evidence.application}; runtime=${evidence.runtime}`;
}

export type ClaudeSettingsSwitchDecision = 'save' | 'discard' | 'cancel';

export interface ClaudeSettingsContextSourcesHost {
  getSelectedScope(): ClaudeConfigurationScope;
  /** Select-change intent; the host guards unsaved drafts before any switch. */
  onScopeSelected(next: ClaudeConfigurationScope): void;
  /** Switch-decision resolution; 'save' must save first and may still abort the switch. */
  onSwitchDecision(decision: ClaudeSettingsSwitchDecision, next: ClaudeConfigurationScope): void;
  getTargetPath(): string;
  isDirty(): boolean;
  /** Whether the current draft passes strict-JSON validation and is writable. */
  canSaveDraft(): boolean;
  selectedSourceExists(): boolean;
  isReadOnly(): boolean;
  getSelectedEvidence(): ConfigurationEvidence | null;
  setStatus(message: string, level: ClaudeSettingsStatusLevel): void;
  loadSources(): Promise<readonly ClaudeSettingsSourceCandidate[]>;
  /** Runs after rows render: refresh target/revision state and re-read if clean. */
  onSourcesLoaded(sources: readonly ClaudeSettingsSourceCandidate[]): void | Promise<void>;
  /** Keeps an inventory failure visible until a later inventory succeeds. */
  onSourcesLoadFailed(): void;
}

/** Renders the workbench header: scope row, warning, switch decision, summary bar, sources. */
export class ClaudeSettingsContextSourcesPresenter {
  private renderToken = 0;
  private scopeSelectEl: HTMLSelectElement | null = null;
  private targetPathEl: HTMLElement | null = null;
  private globalWarningEl: HTMLElement | null = null;
  private switchDecisionHostEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private sourcesToggleEl: HTMLButtonElement | null = null;
  private sourceListEl: HTMLElement | null = null;

  constructor(
    private readonly host: ClaudeSettingsContextSourcesHost,
    private readonly instanceId: number,
  ) {}

  render(workbench: HTMLElement): void {
    this.renderToken++;
    this.renderScopeControl(workbench);
    const warning = document.createElement('div');
    warning.className = 'opencodian-claude-configuration-global-warning';
    warning.setAttribute('data-claude-config-global-warning', 'true');
    warning.hidden = true;
    this.globalWarningEl = warning;
    workbench.appendChild(warning);
    const switchHost = document.createElement('div');
    switchHost.className = 'opencodian-claude-configuration-switch-host';
    this.switchDecisionHostEl = switchHost;
    workbench.appendChild(switchHost);
    const bar = document.createElement('div');
    bar.className = 'opencodian-claude-configuration-summary';
    bar.setAttribute('data-claude-config-summary', 'true');
    this.summaryEl = bar;
    workbench.appendChild(bar);
    this.refreshSummary();
    this.renderSourceList(workbench);
  }

  focusScopeControl(): void {
    this.scopeSelectEl?.focus();
  }

  /** Reverts the <select> to the authoritative scope after a guarded rejection. */
  syncScopeSelect(): void {
    if (this.scopeSelectEl) this.scopeSelectEl.value = this.host.getSelectedScope();
  }

  private renderScopeControl(workbench: HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'opencodian-claude-configuration-scope-row';
    workbench.appendChild(row);
    const label = document.createElement('label');
    label.className = 'opencodian-claude-configuration-scope-label';
    const selectId = `claude-configuration-scope-${this.instanceId}`;
    label.htmlFor = selectId;
    label.textContent = t('settings.claudeCode.configuration.scope.name');
    row.appendChild(label);
    const select = document.createElement('select');
    select.id = selectId;
    select.setAttribute('data-claude-config-scope', 'true');
    select.setAttribute('aria-label', t('settings.claudeCode.configuration.scope.name'));
    for (const value of ['project', 'local', 'global'] as const) {
      select.add(new Option(t(`settings.claudeCode.configuration.scope.${value}`), value));
    }
    select.value = this.host.getSelectedScope();
    this.scopeSelectEl = select;
    select.addEventListener('change', () => this.host.onScopeSelected(resolveConfigurationScopeSelection(select.value)));
    row.appendChild(select);
    const target = document.createElement('code');
    target.className = 'opencodian-claude-configuration-target-path';
    target.setAttribute('data-claude-config-target', 'true');
    this.targetPathEl = target;
    row.appendChild(target);
    this.renderTargetPath();
  }

  /** Shows the Save / Discard / Cancel decision for a dirty-draft scope switch. */
  showSwitchDecision(nextScope: ClaudeConfigurationScope): void {
    this.removeSwitchDecision();
    const host = this.switchDecisionHostEl;
    if (!host) return;
    const confirm = document.createElement('div');
    confirm.className = 'opencodian-claude-configuration-switch-confirm';
    confirm.setAttribute('data-claude-config-switch-confirm', 'true');
    confirm.setAttribute('role', 'group');
    confirm.setAttribute('aria-label', t('settings.claudeCode.configuration.unsavedSwitch.decisionLabel'));
    appendText(
      confirm,
      'opencodian-claude-configuration-confirm-text',
      t('settings.claudeCode.configuration.unsavedSwitch.message', {
        scope: claudeSettingsScopeLabel(this.host.getSelectedScope()),
        path: this.host.getTargetPath(),
      }),
    );
    const save = createActionButton(
      t('settings.claudeCode.configuration.unsavedSwitch.save'),
      'opencodian-claude-configuration-switch-save mod-cta',
      'data-claude-config-switch-save',
    );
    save.disabled = !this.host.canSaveDraft();
    save.addEventListener('click', () => this.host.onSwitchDecision('save', nextScope));
    confirm.appendChild(save);
    const discard = createActionButton(
      t('settings.claudeCode.configuration.unsavedSwitch.discard'),
      'opencodian-claude-configuration-switch-discard mod-warning',
      'data-claude-config-switch-discard',
    );
    discard.addEventListener('click', () => this.host.onSwitchDecision('discard', nextScope));
    confirm.appendChild(discard);
    const cancel = createActionButton(
      t('settings.claudeCode.configuration.cancel'),
      'opencodian-claude-configuration-switch-cancel',
      'data-claude-config-switch-cancel',
    );
    cancel.addEventListener('click', () => this.host.onSwitchDecision('cancel', nextScope));
    confirm.appendChild(cancel);
    host.appendChild(confirm);
    // Keep the focus target semantic and visibly focusable. A disabled Save
    // button cannot receive focus, so Discard is the first available choice.
    (save.disabled ? discard : save).focus();
  }

  removeSwitchDecision(): void {
    this.switchDecisionHostEl?.querySelector('[data-claude-config-switch-confirm]')?.remove();
  }

  /** Updates the target path display, the Global warning, and the summary bar. */
  renderTargetPath(): void {
    const scope = this.host.getSelectedScope();
    const targetPath = this.host.getTargetPath();
    if (this.targetPathEl) this.renderPathSegments(this.targetPathEl, targetPath);
    if (this.globalWarningEl) {
      this.globalWarningEl.hidden = scope !== 'global';
      if (scope === 'global') {
        this.globalWarningEl.textContent = t('settings.claudeCode.configuration.globalWarning', { path: targetPath });
      }
    }
    this.refreshSummary();
  }

  /** Rebuilds the compact "now editing" context bar: scope, path, presence, writable, dirty, axes. */
  refreshSummary(): void {
    const bar = this.summaryEl;
    if (!bar) return;
    const targetPath = this.host.getTargetPath();
    clearChildren(bar);
    const line = document.createElement('div');
    line.className = 'opencodian-claude-configuration-summary-line';
    appendText(
      line,
      'opencodian-claude-configuration-chip opencodian-claude-configuration-summary-scope',
      claudeSettingsScopeLabel(this.host.getSelectedScope()),
      { name: 'data-claude-config-summary-scope', value: this.host.getSelectedScope() },
    );
    const pathEl = document.createElement('code');
    pathEl.className = 'opencodian-claude-configuration-summary-path';
    pathEl.setAttribute('data-claude-config-summary-path', 'true');
    this.renderPathSegments(pathEl, targetPath);
    line.appendChild(pathEl);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'opencodian-claude-configuration-copy-path';
    copy.textContent = '⧉';
    copy.title = t('settings.claudeCode.configuration.copyPath');
    copy.setAttribute('aria-label', t('settings.claudeCode.configuration.copyPath'));
    copy.setAttribute('data-claude-config-copy-path', 'true');
    copy.addEventListener('click', () => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(targetPath);
        this.host.setStatus(t('settings.claudeCode.configuration.pathCopied'), 'ok');
      }
    });
    line.appendChild(copy);
    appendText(
      line,
      'opencodian-claude-configuration-chip opencodian-claude-configuration-summary-presence',
      this.host.selectedSourceExists()
        ? t('settings.claudeCode.configuration.presence.present')
        : t('settings.claudeCode.configuration.presence.absent'),
      { name: 'data-claude-config-summary-presence', value: this.host.selectedSourceExists() ? 'present' : 'absent' },
    );
    appendText(
      line,
      'opencodian-claude-configuration-chip opencodian-claude-configuration-summary-writable',
      this.host.isReadOnly()
        ? t('settings.claudeCode.configuration.readonly')
        : t('settings.claudeCode.configuration.writable.editable'),
      { name: 'data-claude-config-summary-writable', value: this.host.isReadOnly() ? 'read-only' : 'editable' },
    );
    const dirty = this.host.isDirty();
    appendText(
      line,
      `opencodian-claude-configuration-chip opencodian-claude-configuration-summary-dirty${dirty ? ' is-dirty' : ''}`,
      dirty ? t('settings.claudeCode.configuration.summary.dirty') : t('settings.claudeCode.configuration.summary.clean'),
      { name: 'data-claude-config-summary-dirty', value: dirty ? 'dirty' : 'clean' },
    );
    bar.appendChild(line);
    const axes = document.createElement('div');
    axes.className = 'opencodian-claude-configuration-summary-evidence';
    axes.setAttribute('data-claude-config-summary-evidence', 'true');
    const evidence = this.host.getSelectedEvidence();
    axes.textContent = evidence ? formatClaudeSettingsEvidenceHuman(evidence) : '';
    bar.appendChild(axes);
  }

  private renderSourceList(workbench: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.className = 'opencodian-claude-configuration-sources-wrap';
    const regionId = `claude-config-sources-${this.instanceId}`;
    const label = t('settings.claudeCode.configuration.sourcesToggle', { count: 0 });
    const toggle = createDisclosureToggle(
      label,
      'opencodian-claude-configuration-sources-toggle',
      'data-claude-config-sources-toggle',
      regionId,
    );
    this.sourcesToggleEl = toggle;
    wrap.appendChild(toggle);
    const list = document.createElement('div');
    list.className = 'opencodian-claude-configuration-sources';
    list.id = regionId;
    list.hidden = true;
    list.setAttribute('data-claude-config-sources', 'true');
    this.sourceListEl = list;
    wrap.appendChild(list);
    workbench.appendChild(wrap);
    bindDisclosure(toggle, list);
  }

  /** Loads the source inventory and renders one row per inspected source. */
  async refreshInventory(): Promise<void> {
    const container = this.sourceListEl;
    if (!container) return;
    const token = this.renderToken;
    container.setAttribute('aria-busy', 'true');
    let sources: readonly ClaudeSettingsSourceCandidate[];
    try {
      sources = await this.host.loadSources();
    } catch {
      if (token === this.renderToken && container.isConnected) {
        container.setAttribute('aria-busy', 'false');
        container.hidden = false;
        this.sourcesToggleEl?.setAttribute('aria-expanded', 'true');
        clearChildren(container);
        const error = appendText(container, 'opencodian-claude-configuration-error', t('settings.claudeCode.configuration.inventoryFailed'), {
          name: 'data-claude-config-error',
          value: 'true',
        });
        error.setAttribute('role', 'alert');
        error.setAttribute('aria-live', 'assertive');
        this.host.onSourcesLoadFailed();
      }
      return;
    }
    if (token !== this.renderToken || !container.isConnected) return;
    container.setAttribute('aria-busy', 'false');
    if (this.sourcesToggleEl) {
      const label = t('settings.claudeCode.configuration.sourcesToggle', { count: sources.length });
      this.sourcesToggleEl.textContent = label;
      this.sourcesToggleEl.setAttribute('aria-label', label);
    }
    clearChildren(container);
    for (const source of sources) this.appendSourceRow(container, source);
    // Awaited so a slow post-mutation re-read cannot wipe a later status.
    await this.host.onSourcesLoaded(sources);
  }

  private appendSourceRow(container: HTMLElement, source: ClaudeSettingsSourceCandidate): void {
    const row = document.createElement('div');
    row.className = 'opencodian-claude-configuration-source-row';
    const head = document.createElement('div');
    head.className = 'opencodian-claude-configuration-source-head';
    if (source.scope === this.host.getSelectedScope()) {
      appendText(head, 'opencodian-claude-configuration-chip opencodian-claude-configuration-source-current', t('settings.claudeCode.configuration.currentSource'), {
        name: 'data-claude-config-source-current',
        value: source.scope,
      });
    }
    appendText(head, 'opencodian-claude-configuration-source-scope', claudeSettingsScopeLabel(source.scope));
    appendText(head, 'opencodian-claude-configuration-source-origin', localizeClaudeSettingsOrigin(source.origin));
    appendText(
      head,
      'opencodian-claude-configuration-source-presence',
      source.exists ? t('settings.claudeCode.configuration.presence.present') : t('settings.claudeCode.configuration.presence.absent'),
    );
    if (!isConfigurationSourceSelectable(source)) {
      appendText(head, 'opencodian-claude-configuration-chip opencodian-claude-configuration-readonly', t('settings.claudeCode.configuration.readonly'), {
        name: 'data-claude-config-readonly',
        value: source.scope,
      });
    }
    row.appendChild(head);
    appendText(row, 'opencodian-claude-configuration-evidence-human', formatClaudeSettingsEvidenceHuman(source.evidence), {
      name: 'data-claude-config-evidence-human',
      value: source.scope,
    });
    const tech = document.createElement('details');
    tech.className = 'opencodian-claude-configuration-source-tech';
    const techSummary = document.createElement('summary');
    techSummary.textContent = t('settings.claudeCode.configuration.technicalDetails');
    tech.appendChild(techSummary);
    const path = document.createElement('code');
    path.className = 'opencodian-claude-configuration-source-path';
    path.setAttribute('data-claude-config-source-path', source.scope);
    this.renderPathSegments(path, source.path);
    tech.appendChild(path);
    appendText(tech, 'opencodian-claude-configuration-source-meta', `priority=${source.priority} · origin=${source.origin}`);
    appendText(
      tech,
      'opencodian-claude-configuration-source-revision',
      source.revision === null
        ? 'absent'
        : `${source.revision.canonicalPath} · ${source.revision.mtimeMs} · ${source.revision.size} · ${source.revision.sha256}`,
      { name: 'data-claude-config-revision', value: source.scope },
    );
    appendText(tech, 'opencodian-claude-configuration-evidence', formatClaudeSettingsEvidenceTechnical(source.evidence), {
      name: 'data-claude-config-evidence',
      value: source.scope,
    });
    row.appendChild(tech);
    container.appendChild(row);
  }

  /**
   * Preserves the full path for assistive tech/title/copy while exposing
   * natural slash-separated break points instead of breaking arbitrary bytes.
   */
  private renderPathSegments(element: HTMLElement, path: string): void {
    clearChildren(element);
    element.setAttribute('title', path);
    element.setAttribute('aria-label', path);
    const pieces = path.match(/[^/\\]+|[/\\]+/g) ?? [path];
    for (const piece of pieces) {
      const segment = document.createElement('span');
      segment.className = 'opencodian-claude-configuration-path-segment';
      segment.setAttribute('data-claude-config-path-segment', 'true');
      segment.textContent = piece;
      element.appendChild(segment);
    }
  }
}
