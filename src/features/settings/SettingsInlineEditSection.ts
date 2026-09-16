/**
 * SettingsInlineEditSection — settings surface for the inline edit feature.
 *
 * Two settings (docs/requirements/inline-edit.md §9):
 * - `inlineEditEnabled`: master switch; hides the command and the editor menu entry.
 * - `inlineEditModelOverrides`: per-backend model override, keyed by backend kind
 *   because the value format differs per backend (`provider/model` for opencode
 *   and pi, a bare model id or SDK alias for claude-code and codex).
 *
 * The section shows one input per enabled backend rather than one global field,
 * so a stale entry for a backend the user does not run cannot silently apply.
 */

import { Setting } from 'obsidian';

import { normalizeInlineEditModelOverrides, type OpenCodianSettings } from '../../core/types';
import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import { parseModelOverride } from '../inline-edit/InlineEditPluginHost';

/**
 * The plugin surface this section needs.
 *
 * Structural on purpose: importing the plugin class from `src/main.ts` would
 * create a feature -> app dependency edge, and the section only needs the
 * settings object plus a save call. `OpenCodianPlugin` satisfies this shape.
 */
interface InlineEditSettingsHost {
  settings: OpenCodianSettings;
  saveSettings(): Promise<unknown>;
}

interface SettingsInlineEditSectionOptions {
  plugin: InlineEditSettingsHost;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

/** Backends offered in the per-backend override list. */
const OVERRIDE_BACKENDS: readonly AgentBackendKind[] = ['opencode', 'claude-code', 'codex', 'pi'];

export class SettingsInlineEditSection {
  private readonly plugin: InlineEditSettingsHost;
  private readonly createSectionHeading: SettingsInlineEditSectionOptions['createSectionHeading'];

  constructor(options: SettingsInlineEditSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  dispose(): void { /* No subscriptions to release. */ }

  /**
   * Tabbed-layout mount: renders into a `data-section-block="inline-edit"`
   * block that follows the conversation tab's secondary-tab visibility
   * contract (created after sibling sections so their showActiveBlock pass
   * cannot hide it).
   */
  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    const blockEl = containerEl.createDiv({ attr: { 'data-section-block': 'inline-edit' } });
    blockEl.style.display = secondaryTabId === 'inline-edit' ? '' : 'none';
    this.attach(blockEl);
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.inlineEdit.title'),
      t('settings.inlineEdit.desc'),
    );

    new Setting(containerEl)
      .setName(t('settings.inlineEdit.enabled.name'))
      .setDesc(t('settings.inlineEdit.enabled.desc'))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.inlineEditEnabled)
        .onChange(async (value) => {
          this.plugin.settings.inlineEditEnabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.inlineEdit.affordance.name'))
      .setDesc(t('settings.inlineEdit.affordance.desc'))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.inlineEditSelectionAffordance)
        .onChange(async (value) => {
          this.plugin.settings.inlineEditSelectionAffordance = value;
          await this.plugin.saveSettings();
        }));

    for (const backend of OVERRIDE_BACKENDS) {
      if (!this.plugin.settings.enabledBackends.includes(backend)) continue;
      this.addOverrideRow(containerEl, backend);
    }

    new Setting(containerEl)
      .setName(t('settings.inlineEdit.billingNotice.name'))
      .setDesc(t('settings.inlineEdit.billingNotice.desc'));

    return headingEl;
  }

  private addOverrideRow(containerEl: HTMLElement, backend: AgentBackendKind): void {
    const setting = new Setting(containerEl)
      .setName(t('settings.inlineEdit.override.name', { backend }))
      .setDesc(t('settings.inlineEdit.override.desc', { backend, example: overrideExample(backend) }));

    setting.addText((text) => {
      text.setPlaceholder(overrideExample(backend))
        .setValue(this.plugin.settings.inlineEditModelOverrides[backend] ?? '')
        .onChange(async (value) => {
          const trimmed = value.trim();
          const next: Partial<Record<AgentBackendKind, string>> = {
            ...this.plugin.settings.inlineEditModelOverrides,
          };
          if (!trimmed) {
            delete next[backend];
            setting.setDesc(t('settings.inlineEdit.override.desc', {
              backend,
              example: overrideExample(backend),
            }));
          } else if (parseModelOverride(backend, trimmed)) {
            next[backend] = trimmed;
            setting.setDesc(t('settings.inlineEdit.override.desc', {
              backend,
              example: overrideExample(backend),
            }));
          } else {
            // Keep the value visible but reject it, so the inline-edit path never
            // silently falls back to a default model (design §9).
            setting.setDesc(t('settings.inlineEdit.override.invalid', { backend }));
            return;
          }
          const settings: OpenCodianSettings = this.plugin.settings;
          settings.inlineEditModelOverrides = normalizeInlineEditModelOverrides(next);
          await this.plugin.saveSettings();
        });
    });
  }
}

/** Example value shown as placeholder; the format differs per backend. */
function overrideExample(backend: AgentBackendKind): string {
  switch (backend) {
    case 'opencode':
    case 'pi':
      return 'provider/model';
    case 'claude-code':
      return 'claude-sonnet-4-5';
    default:
      return 'gpt-5';
  }
}
