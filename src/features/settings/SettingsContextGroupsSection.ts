/**
 * SettingsContextGroupsSection — CRUD surface for persisted context groups
 * (docs/requirements/flowtext-parity.md R-B2).
 *
 * A group is a named, ordered list of vault paths (notes or directories)
 * that both the inline-edit panel and the chat composer can attach in one
 * click ("附加主题"). Groups live in plugin settings (`contextGroups`), so
 * they survive restarts and work across notes; existence of each path is
 * validated at attach time, not here.
 *
 * Editing follows the preset-prompt CRUD contract
 * (SettingsInlineEditSection): rows persist as they are, and load-time
 * normalization prunes half-edited (empty) entries on the next restart, so
 * an empty row never vanishes from under the cursor mid-edit.
 */

import { Setting } from 'obsidian';

import type { ContextGroup, ContextGroupEntry, OpenCodianSettings } from '../../core/types';
import { t } from '../../i18n';

/**
 * The plugin surface this section needs.
 *
 * Structural on purpose: importing the plugin class from `src/main.ts` would
 * create a feature -> app dependency edge, and the section only needs the
 * settings object plus a save call. `OpenCodianPlugin` satisfies this shape.
 */
interface ContextGroupsSettingsHost {
  settings: OpenCodianSettings;
  saveSettings(): Promise<unknown>;
}

interface SettingsContextGroupsSectionOptions {
  plugin: ContextGroupsSettingsHost;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

export class SettingsContextGroupsSection {
  private readonly plugin: ContextGroupsSettingsHost;
  private readonly createSectionHeading: SettingsContextGroupsSectionOptions['createSectionHeading'];
  private groupListEl: HTMLElement | null = null;

  constructor(options: SettingsContextGroupsSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  dispose(): void { /* No subscriptions to release. */ }

  /**
   * Tabbed-layout mount: renders into a `data-section-block="context-groups"`
   * block that follows the conversation tab's secondary-tab visibility
   * contract (created after sibling sections so their showActiveBlock pass
   * cannot hide it).
   */
  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    const blockEl = containerEl.createDiv({ attr: { 'data-section-block': 'context-groups' } });
    blockEl.style.display = secondaryTabId === 'context-groups' ? '' : 'none';
    this.attach(blockEl);
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.contextGroups.title'),
      t('settings.contextGroups.desc'),
    );

    new Setting(containerEl)
      .setName(t('settings.contextGroups.add'))
      .setDesc(t('settings.contextGroups.addDesc'))
      .addButton((button) => button
        .setButtonText(t('settings.contextGroups.add'))
        .onClick(async () => {
          this.plugin.settings.contextGroups = [
            ...this.plugin.settings.contextGroups,
            { id: this.createGroupId(), name: '', entries: [] },
          ];
          await this.plugin.saveSettings();
          this.renderGroupRows();
        }));

    this.groupListEl = containerEl.createDiv({ cls: 'opencodian-context-groups' });
    this.renderGroupRows();

    return headingEl;
  }

  /** Rebuild the group rows from settings (called after add/remove). */
  private renderGroupRows(): void {
    const listEl = this.groupListEl;
    if (!listEl) return;
    listEl.empty();
    const groups = this.plugin.settings.contextGroups;
    if (groups.length === 0) {
      listEl.createDiv({
        cls: 'opencodian-context-groups-empty setting-item-description',
        text: t('settings.contextGroups.empty'),
      });
      return;
    }
    groups.forEach((group, index) => {
      this.addGroupRow(listEl, group, index);
    });
  }

  private addGroupRow(listEl: HTMLElement, group: ContextGroup, index: number): void {
    const setting = new Setting(listEl)
      .setName(t('settings.contextGroups.row.name', { index: index + 1 }))
      .setDesc(t('settings.contextGroups.row.desc'));
    setting.addText((text) => text
      .setPlaceholder(t('settings.contextGroups.row.namePlaceholder'))
      .setValue(group.name)
      .onChange(async (value) => {
        group.name = value;
        await this.plugin.saveSettings();
      }));
    setting.addTextArea((area) => {
      area.setPlaceholder(t('settings.contextGroups.row.entriesPlaceholder'))
        .setValue(group.entries.map((entry) => entry.path).join('\n'))
        .onChange(async (value) => {
          group.entries = parseGroupEntryLines(value, group.entries);
          await this.plugin.saveSettings();
        });
      area.inputEl.rows = 5;
    });
    setting.addExtraButton((button) => button
      .setIcon('trash-2')
      .setTooltip(t('settings.contextGroups.row.delete'))
      .onClick(async () => {
        this.plugin.settings.contextGroups =
          this.plugin.settings.contextGroups.filter((entry) => entry !== group);
        await this.plugin.saveSettings();
        this.renderGroupRows();
      }));
  }

  private createGroupId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `group-${crypto.randomUUID()}`
      : `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Parse the entries textarea (one vault-relative path per line) into an
 * ordered entry list. A trailing `/` marks a directory; a path that was
 * already stored keeps its kind. Blank lines, `<>`-bearing paths (protocol
 * backstop) and duplicates are dropped, keeping first occurrences.
 */
export function parseGroupEntryLines(
  value: string,
  previous: readonly ContextGroupEntry[],
): ContextGroupEntry[] {
  const previousKind = new Map(previous.map((entry) => [entry.path, entry.kind]));
  const seen = new Set<string>();
  const entries: ContextGroupEntry[] = [];
  for (const rawLine of value.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    const folder = line.endsWith('/');
    if (folder) line = line.slice(0, -1).trim();
    if (!line || /[<>]/.test(line) || seen.has(line)) continue;
    seen.add(line);
    entries.push({
      path: line,
      kind: previousKind.get(line) ?? (folder ? 'folder' : 'file'),
    });
  }
  return entries;
}
