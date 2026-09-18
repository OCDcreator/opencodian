/**
 * SettingsInlineEditSection — settings surface for the inline edit feature.
 *
 * Settings (docs/requirements/inline-edit.md §9, docs/requirements/flowtext-parity.md R-A1/R-A2):
 * - `inlineEditEnabled`: master switch; hides the command and the editor menu entry.
 * - `inlineEditSelectionAffordance`: floating button next to the selection.
 * - `inlineEditTriggerAt` (R-A1): typing `@` at line start / after whitespace
 *   opens the panel there; off by default.
 * - `inlineEditModelOverrides`: per-backend model override, keyed by backend kind
 *   because the value format differs per backend (`provider/model` for opencode
 *   and pi, a bare model id or SDK alias for claude-code and codex).
 * - `inlineEditPresetPrompts` (R-A2): user-defined `#` presets (label + body),
 *   add/remove/edit. The builtin catalog always shows on top in the menu.
 *
 * The section shows one input per enabled backend rather than one global field,
 * so a stale entry for a backend the user does not run cannot silently apply.
 */

import { Setting } from 'obsidian';

import {
  INLINE_COMPLETION_MAX_CHARS_MAX,
  INLINE_COMPLETION_MAX_CHARS_MIN,
  INLINE_EDIT_MAX_CONCURRENT_EDITS_MAX,
  INLINE_EDIT_MAX_CONCURRENT_EDITS_MIN,
  type InlineEditPresetPrompt,
  normalizeAutoInternalLinkExcludedTerms,
  normalizeInlineCompletionMaxChars,
  normalizeInlineEditMaxConcurrentEdits,
  normalizeInlineEditModelOverrides,
  type OpenCodianSettings,
} from '../../core/types';
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
  /**
   * R-C3: called after the completion toggle changes so the plugin can
   * dispose (or re-arm) the warm completion session pool immediately instead
   * of waiting for the next trigger.
   */
  onInlineCompletionSettingChanged?(enabled: boolean): void;
}

interface SettingsInlineEditSectionOptions {
  plugin: InlineEditSettingsHost;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  /** Opens Obsidian's own hotkeys settings tab (R-A1 discoverability). */
  openHotkeySettings?: () => void;
}

/** Backends offered in the per-backend override list. */
const OVERRIDE_BACKENDS: readonly AgentBackendKind[] = ['opencode', 'claude-code', 'codex', 'pi'];

export class SettingsInlineEditSection {
  private readonly plugin: InlineEditSettingsHost;
  private readonly createSectionHeading: SettingsInlineEditSectionOptions['createSectionHeading'];
  private readonly openHotkeySettings?: () => void;
  private presetListEl: HTMLElement | null = null;

  constructor(options: SettingsInlineEditSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.openHotkeySettings = options.openHotkeySettings;
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

    new Setting(containerEl)
      .setName(t('settings.inlineEdit.triggerAt.name'))
      .setDesc(t('settings.inlineEdit.triggerAt.desc'))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.inlineEditTriggerAt)
        .onChange(async (value) => {
          this.plugin.settings.inlineEditTriggerAt = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.inlineEdit.documentMode.name'))
      .setDesc(t('settings.inlineEdit.documentMode.desc'))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.inlineEditDocumentModeEnabled)
        .onChange(async (value) => {
          this.plugin.settings.inlineEditDocumentModeEnabled = value;
          await this.plugin.saveSettings();
        }));

    this.addInlineCompletionSettings(containerEl);

    new Setting(containerEl)
      .setName(t('settings.inlineEdit.maxConcurrentEdits.name'))
      .setDesc(t('settings.inlineEdit.maxConcurrentEdits.desc'))
      .addSlider((slider) => slider
        .setLimits(
          INLINE_EDIT_MAX_CONCURRENT_EDITS_MIN,
          INLINE_EDIT_MAX_CONCURRENT_EDITS_MAX,
          1,
        )
        .setValue(this.plugin.settings.inlineEditMaxConcurrentEdits)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.inlineEditMaxConcurrentEdits =
            normalizeInlineEditMaxConcurrentEdits(value);
          await this.plugin.saveSettings();
        }));

    this.addHotkeyDiscoveryRow(containerEl);

    for (const backend of OVERRIDE_BACKENDS) {
      if (!this.plugin.settings.enabledBackends.includes(backend)) continue;
      this.addOverrideRow(containerEl, backend);
    }

    this.addAutoInternalLinkSettings(containerEl);

    this.addPresetPromptSettings(containerEl);

    new Setting(containerEl)
      .setName(t('settings.inlineEdit.billingNotice.name'))
      .setDesc(t('settings.inlineEdit.billingNotice.desc'));

    return headingEl;
  }

  // ---------------------------------------------------------------------------
  // Inline completion (R-C3)
  // ---------------------------------------------------------------------------

  /**
   * R-C3 Alt ghost-text completion. Off by default: the feature keeps warm
   * read-only sessions while enabled, so the toggle is the explicit opt-in.
   * Turning it off notifies the plugin so the session pool is disposed
   * immediately (no background sessions, acceptance 7).
   */
  private addInlineCompletionSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.inlineCompletion.enabled.name'))
      .setDesc(t('settings.inlineCompletion.enabled.desc'))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.inlineCompletionEnabled)
        .onChange(async (value) => {
          this.plugin.settings.inlineCompletionEnabled = value;
          await this.plugin.saveSettings();
          this.plugin.onInlineCompletionSettingChanged?.(value);
        }));

    new Setting(containerEl)
      .setName(t('settings.inlineCompletion.maxChars.name'))
      .setDesc(t('settings.inlineCompletion.maxChars.desc'))
      .addSlider((slider) => slider
        .setLimits(
          INLINE_COMPLETION_MAX_CHARS_MIN,
          INLINE_COMPLETION_MAX_CHARS_MAX,
          50,
        )
        .setValue(this.plugin.settings.inlineCompletionMaxChars)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.inlineCompletionMaxChars =
            normalizeInlineCompletionMaxChars(value);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.inlineCompletion.hotkey.name'))
      .setDesc(t('settings.inlineCompletion.hotkey.desc'));
  }

  /**
   * R-A1 discoverability: the `inline-edit` command ships without a default
   * hotkey, so the section says so and links straight into Obsidian's own
   * hotkeys tab where the user can bind one.
   */
  private addHotkeyDiscoveryRow(containerEl: HTMLElement): void {
    const setting = new Setting(containerEl)
      .setName(t('settings.inlineEdit.hotkey.name'))
      .setDesc(t('settings.inlineEdit.hotkey.desc'));
    if (!this.openHotkeySettings) return;
    setting.addButton((button) => button
      .setButtonText(t('settings.inlineEdit.hotkey.action'))
      .onClick(() => { this.openHotkeySettings?.(); }));
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

  // ---------------------------------------------------------------------------
  // Auto internal links (R-B1)
  // ---------------------------------------------------------------------------

  /**
   * R-B1: deterministic post-processing that links verified reference-note
   * headings in generation results before the diff is shown. Default off —
   * it rewrites user-visible text, so the toggle states that explicitly.
   * The excluded-terms field is one term per line (blank lines ignored).
   */
  private addAutoInternalLinkSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.inlineEdit.autoLink.name'))
      .setDesc(t('settings.inlineEdit.autoLink.desc'))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoInternalLinkEnabled)
        .onChange(async (value) => {
          this.plugin.settings.autoInternalLinkEnabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.inlineEdit.autoLinkExcluded.name'))
      .setDesc(t('settings.inlineEdit.autoLinkExcluded.desc'))
      .addTextArea((area) => {
        area.setPlaceholder(t('settings.inlineEdit.autoLinkExcluded.placeholder'))
          .setValue(this.plugin.settings.autoInternalLinkExcludedTerms.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.autoInternalLinkExcludedTerms =
              normalizeAutoInternalLinkExcludedTerms(value.split('\n'));
            await this.plugin.saveSettings();
          });
        area.inputEl.rows = 4;
      });
  }

  // ---------------------------------------------------------------------------
  // Preset prompts (R-A2)
  // ---------------------------------------------------------------------------

  private addPresetPromptSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.inlineEdit.presets.name'))
      .setDesc(t('settings.inlineEdit.presets.desc'))
      .addButton((button) => button
        .setButtonText(t('settings.inlineEdit.presets.add'))
        .onClick(async () => {
          this.plugin.settings.inlineEditPresetPrompts = [
            ...this.plugin.settings.inlineEditPresetPrompts,
            { id: this.createPresetId(), label: '', prompt: '' },
          ];
          await this.plugin.saveSettings();
          this.renderPresetRows();
        }));

    this.presetListEl = containerEl.createDiv({ cls: 'opencodian-inline-edit-presets' });
    this.renderPresetRows();
  }

  /** Rebuild the preset rows from settings (called after add/remove). */
  private renderPresetRows(): void {
    const listEl = this.presetListEl;
    if (!listEl) return;
    listEl.empty();
    const presets = this.plugin.settings.inlineEditPresetPrompts;
    if (presets.length === 0) {
      listEl.createDiv({
        cls: 'opencodian-inline-edit-presets-empty setting-item-description',
        text: t('settings.inlineEdit.presets.empty'),
      });
      return;
    }
    presets.forEach((preset, index) => {
      this.addPresetRow(listEl, preset, index);
    });
  }

  private addPresetRow(listEl: HTMLElement, preset: InlineEditPresetPrompt, index: number): void {
    const setting = new Setting(listEl)
      .setName(t('settings.inlineEdit.presetRow.name', { index: index + 1 }))
      .setDesc(t('settings.inlineEdit.presetRow.desc'));
    setting.addText((text) => text
      .setPlaceholder(t('settings.inlineEdit.presetRow.labelPlaceholder'))
      .setValue(preset.label)
      .onChange(async (value) => {
        preset.label = value;
        await this.persistPresetPrompts();
      }));
    setting.addTextArea((area) => area
      .setPlaceholder(t('settings.inlineEdit.presetRow.promptPlaceholder'))
      .setValue(preset.prompt)
      .onChange(async (value) => {
        preset.prompt = value;
        await this.persistPresetPrompts();
      }));
    setting.addExtraButton((button) => button
      .setIcon('trash-2')
      .setTooltip(t('settings.inlineEdit.presetRow.delete'))
      .onClick(async () => {
        this.plugin.settings.inlineEditPresetPrompts =
          this.plugin.settings.inlineEditPresetPrompts.filter((entry) => entry !== preset);
        await this.plugin.saveSettings();
        this.renderPresetRows();
      }));
  }

  /**
   * Persist the user presets as they are: load-time normalization prunes
   * half-edited (empty) entries on the next restart, but mid-edit empties
   * must survive the session or the row would vanish from under the cursor.
   * The menu composition filters empty entries from showing.
   */
  private persistPresetPrompts(): Promise<unknown> {
    return this.plugin.saveSettings();
  }

  private createPresetId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `preset-${crypto.randomUUID()}`
      : `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
