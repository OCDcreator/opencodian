/**
 * EnvironmentVariablesModal — advantage-parity R-F7: the per-provider
 * environment-variable domains editor.
 *
 * The `shared` map applies to every backend; each `providers[key]` map applies
 * only to one backend kind (e.g. `claude-code`) or custom provider/agent id
 * (e.g. an ACP agent id). Values persist through the normal settings save
 * path; the fingerprint notice then fires on the next load/save when the
 * resolved environment changed. Narrow structured host port — this file never
 * imports the app layer.
 */

import type { App } from 'obsidian';
import { Modal, Notice } from 'obsidian';

import { type EnvironmentVariablesDomains,normalizeEnvironmentVariablesDomains } from '../../core/agents/BackendEnvironment';
import { t } from '../../i18n';

/** Narrow feature-level port: structured shape only; no app-layer import. */
export interface EnvironmentVariablesModalHost {
  app: App;
  settings: { environmentVariables: EnvironmentVariablesDomains };
  saveSettings(): Promise<unknown>;
}

interface EnvironmentVariableRow {
  key: string;
  value: string;
}

interface EnvironmentProviderRow {
  providerKey: string;
  rows: EnvironmentVariableRow[];
}

export class EnvironmentVariablesModal extends Modal {
  private sharedRows: EnvironmentVariableRow[] = [];
  private providerRows: EnvironmentProviderRow[] = [];
  private selectedProvider: string | null = null;
  private providersBody: HTMLElement | null = null;

  constructor(private readonly host: EnvironmentVariablesModalHost) {
    super(host.app);
  }

  onOpen(): void {
    this.titleEl.setText(t('settings.envDomains.modalTitle'));
    this.modalEl.addClass('opencodian-env-domains-modal');
    this.hydrateFromSettings();
    this.renderSharedSection();
    this.providersBody = this.contentEl.createDiv({ cls: 'opencodian-env-domains-providers' });
    this.renderProvidersSection();
  }

  /** Working copies from the current settings so the modal edits a draft. */
  private hydrateFromSettings(): void {
    const domains = normalizeEnvironmentVariablesDomains(this.host.settings.environmentVariables);
    this.sharedRows = Object.entries(domains.shared).map(([key, value]) => ({ key, value }));
    this.providerRows = Object.entries(domains.providers)
      .map(([providerKey, vars]) => ({
        providerKey,
        rows: Object.entries(vars).map(([key, value]) => ({ key, value })),
      }));
    this.selectedProvider = this.providerRows[0]?.providerKey ?? null;
  }

  /** Write the normalized draft back and persist through the normal path. */
  private async persist(): Promise<void> {
    this.host.settings.environmentVariables = normalizeEnvironmentVariablesDomains(this.toDomains());
    await this.host.saveSettings();
  }

  private toDomains(): EnvironmentVariablesDomains {
    return {
      shared: toVariableMap(this.sharedRows),
      providers: Object.fromEntries(this.providerRows.map((provider) => [
        provider.providerKey,
        toVariableMap(provider.rows),
      ])),
    };
  }

  // ── shared domain ────────────────────────────────────────────────────────

  private renderSharedSection(): void {
    this.contentEl.createDiv({
      cls: 'opencodian-env-domains-section-title',
      text: t('settings.envDomains.sharedTitle'),
    });
    const listEl = this.contentEl.createDiv({ cls: 'opencodian-env-domains-list' });
    this.renderVariableRows(listEl, this.sharedRows, () => this.renderSharedSection());
    this.renderAddRow(this.contentEl, this.sharedRows, () => this.renderSharedSection());
  }

  // ── provider domains ─────────────────────────────────────────────────────

  private renderProvidersSection(): void {
    if (!this.providersBody) {
      return;
    }
    this.providersBody.empty();
    this.providersBody.createDiv({
      cls: 'opencodian-env-domains-section-title',
      text: t('settings.envDomains.providersTitle'),
    });
    this.renderProviderPicker(this.providersBody);
    const editorEl = this.providersBody.createDiv({ cls: 'opencodian-env-domains-list' });
    this.renderSelectedProviderEditor(editorEl);
  }

  private renderProviderPicker(containerEl: HTMLElement): void {
    const pickerEl = containerEl.createDiv({ cls: 'opencodian-env-domains-picker' });
    const select = pickerEl.createEl('select');
    for (const provider of this.providerRows) {
      select.createEl('option', { value: provider.providerKey, text: provider.providerKey });
    }
    select.createEl('option', { value: '__new__', text: t('settings.envDomains.newProviderOption') });
    if (!this.selectedProvider) {
      select.value = '__new__';
    } else {
      select.value = this.selectedProvider;
    }
    select.addEventListener('change', () => {
      this.selectedProvider = select.value === '__new__' ? null : select.value;
      this.renderProvidersSection();
    });
    if (select.value === '__new__') {
      this.renderNewProviderInput(pickerEl);
    }
    if (this.selectedProvider) {
      this.renderRemoveProviderButton(pickerEl, this.selectedProvider);
    }
  }

  private renderNewProviderInput(containerEl: HTMLElement): void {
    const input = containerEl.createEl('input', {
      attr: { type: 'text', placeholder: t('settings.envDomains.newProviderPlaceholder') },
    });
    input.addEventListener('change', () => {
      const key = input.value.trim();
      if (!key) {
        return;
      }
      if (this.providerRows.some((provider) => provider.providerKey === key)) {
        new Notice(t('settings.envDomains.duplicateProvider'));
        return;
      }
      this.providerRows.push({ providerKey: key, rows: [] });
      this.selectedProvider = key;
      void this.persist();
      this.renderProvidersSection();
    });
  }

  private renderRemoveProviderButton(containerEl: HTMLElement, providerKey: string): void {
    containerEl.createEl('button', {
      text: t('settings.envDomains.removeProvider'),
      attr: { type: 'button' },
    }).addEventListener('click', async () => {
      this.providerRows = this.providerRows.filter((provider) => provider.providerKey !== providerKey);
      this.selectedProvider = this.providerRows[0]?.providerKey ?? null;
      await this.persist();
      this.renderProvidersSection();
    });
  }

  private renderSelectedProviderEditor(editorEl: HTMLElement): void {
    const provider = this.providerRows.find((entry) => entry.providerKey === this.selectedProvider);
    if (!provider) {
      editorEl.createDiv({
        cls: 'opencodian-env-domains-empty',
        text: t('settings.envDomains.emptyProviders'),
      });
      return;
    }
    this.renderVariableRows(editorEl, provider.rows, () => this.renderProvidersSection());
    this.renderAddRow(editorEl, provider.rows, () => this.renderProvidersSection());
  }

  // ── variable rows (shared by both sections) ─────────────────────────────

  private renderVariableRows(
    listEl: HTMLElement,
    rows: EnvironmentVariableRow[],
    rerender: () => void,
  ): void {
    if (rows.length === 0) {
      listEl.createDiv({
        cls: 'opencodian-env-domains-empty',
        text: t('settings.envDomains.emptyVars'),
      });
      return;
    }
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowEl = listEl.createDiv({ cls: 'opencodian-env-domains-row' });
      const keyInput = rowEl.createEl('input', {
        attr: { type: 'text', placeholder: t('settings.envDomains.keyPlaceholder'), value: row.key },
      });
      keyInput.addEventListener('change', () => {
        row.key = keyInput.value;
        void this.persist();
      });
      const valueInput = rowEl.createEl('input', {
        attr: { type: 'text', placeholder: t('settings.envDomains.valuePlaceholder'), value: row.value },
      });
      valueInput.addEventListener('change', () => {
        row.value = valueInput.value;
        void this.persist();
      });
      rowEl.createEl('button', {
        text: t('settings.envDomains.removeRow'),
        attr: { type: 'button', 'aria-label': t('settings.envDomains.removeRow') },
      }).addEventListener('click', async () => {
        rows.splice(index, 1);
        await this.persist();
        rerender();
      });
    }
  }

  private renderAddRow(
    containerEl: HTMLElement,
    rows: EnvironmentVariableRow[],
    rerender: () => void,
  ): void {
    containerEl.createEl('button', {
      text: t('settings.envDomains.addRow'),
      cls: 'opencodian-env-domains-add',
      attr: { type: 'button' },
    }).addEventListener('click', () => {
      rows.push({ key: '', value: '' });
      rerender();
    });
  }
}

function toVariableMap(rows: EnvironmentVariableRow[]): Record<string, string> {
  return Object.fromEntries(rows
    .map((row) => [row.key.trim(), row.value.trim()] as const)
    .filter(([key]) => key.length > 0));
}
