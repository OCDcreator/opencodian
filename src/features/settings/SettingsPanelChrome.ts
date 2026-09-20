import { App, setIcon,Setting } from 'obsidian';

import { setLocale, t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getOpenCodianWordmarkDataUrl } from '../../shared/brandingWordmark';

export interface SettingHelpButtonConfig {
  tooltip: string;
  onClick: () => void;
}

export interface SettingsBlockOptions {
  title: string;
  description: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  descriptionPlacement?: 'summary' | 'footer';
}

export function renderLanguageSetting(
  containerEl: HTMLElement,
  plugin: OpenCodianPlugin,
  redisplay: () => void,
): void {
  new Setting(containerEl)
    .setName(t('settings.language.select.name'))
    .setDesc(t('settings.language.select.desc'))
    .addDropdown((dropdown) => {
      dropdown.addOption('en', t('settings.language.en'));
      dropdown.addOption('zh', t('settings.language.zh'));
      dropdown
        .setValue(plugin.settings.locale)
        .onChange(async (value) => {
          plugin.settings.locale = value as 'en' | 'zh';
          setLocale(value as 'en' | 'zh');
          await plugin.saveSettings();
          redisplay();
        });
    });
}

/**
 * advantage-parity R-D2: the keychain secrets toggle. Shared by the modal
 * settings tab and the editor-area settings view. The toggle is the explicit
 * rollback — while off, the next persist writes real secret values back into
 * `settings.core.json`. On hosts without the keychain API the row states the
 * honest degradation instead of pretending protection exists.
 */
export function renderSecretsKeychainSetting(containerEl: HTMLElement, plugin: OpenCodianPlugin): void {
  const keychainAvailable = plugin.storage?.isSettingsSecretsKeychainAvailable() ?? false;
  const setting = new Setting(containerEl)
    .setName(t('settings.secrets.name'))
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.secretsKeychainEnabled && keychainAvailable)
        .setDisabled(!keychainAvailable)
        .onChange(async (value) => {
          plugin.settings.secretsKeychainEnabled = value;
          await plugin.saveSettings();
          setting.setDesc(value ? t('settings.secrets.descOn') : t('settings.secrets.descOff'));
        });
    });
  setting.setDesc(
    keychainAvailable
      ? (plugin.settings.secretsKeychainEnabled
        ? t('settings.secrets.descOn')
        : t('settings.secrets.descOff'))
      : t('settings.secrets.descUnavailable'),
  );
}

/** Shared "settings in editor area" row (modal tab + editor-area view). */
export function renderSettingsInEditorAreaSettingRow(
  containerEl: HTMLElement,
  plugin: OpenCodianPlugin,
): void {
  new Setting(containerEl)
    .setName(t('settings.ui.settingsInEditorArea.name'))
    .setDesc(t('settings.ui.settingsInEditorArea.desc'))
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.settingsInEditorArea)
        .onChange(async (value) => {
          plugin.settings.settingsInEditorArea = value;
          await plugin.saveSettings();
        })
    );
}

export function createSettingsBlock(
  containerEl: HTMLElement,
  options: SettingsBlockOptions,
  applyInlineCodeTextToTarget: (targetEl: HTMLElement | null, text: string) => void,
): HTMLElement {
  const {
    title,
    description,
    collapsible = false,
    defaultOpen = true,
    onToggle,
    descriptionPlacement = 'summary',
  } = options;

  const hostEl = containerEl.createDiv({
    cls: 'opencodian-settings-block opencodian-settings-section',
    attr: { 'data-settings-surface': 'section' },
  });
  if (!collapsible) {
    hostEl.createEl('h4', {
      text: title,
      cls: 'opencodian-settings-subsection-heading opencodian-settings-section-heading',
    });
    const descEl = hostEl.createDiv({ cls: 'opencodian-settings-block-desc' });
    applyInlineCodeTextToTarget(descEl, description);
    return hostEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });
  }

  const detailsEl = hostEl.createEl('details', { cls: 'opencodian-settings-block-details' });
  detailsEl.open = defaultOpen;
  detailsEl.addEventListener('toggle', () => {
    onToggle?.(detailsEl.open);
  });

  const summaryEl = detailsEl.createEl('summary', { cls: 'opencodian-settings-block-summary' });
  summaryEl.createDiv({
    cls: 'opencodian-settings-subsection-heading opencodian-settings-section-heading',
    text: title,
  });
  if (descriptionPlacement === 'summary') {
    const descEl = summaryEl.createDiv({ cls: 'opencodian-settings-block-desc' });
    applyInlineCodeTextToTarget(descEl, description);
  }

  const bodyEl = detailsEl.createDiv({
    cls: 'opencodian-settings-block-body opencodian-settings-section-body',
    attr: { 'data-settings-surface': 'section-body' },
  });
  if (descriptionPlacement === 'footer') {
    const descEl = hostEl.createDiv({
      cls: 'opencodian-settings-block-desc opencodian-settings-block-footer-desc',
    });
    applyInlineCodeTextToTarget(descEl, description);
  }

  return bodyEl;
}

export function setSettingDescWithFormatting(
  setting: Setting,
  text: string,
  applyInlineCodeTextToTarget: (targetEl: HTMLElement | null, formattedText: string) => void,
): void {
  setting.setDesc(text);
  const descEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-description');
  applyInlineCodeTextToTarget(descEl, text);
}

export function setSettingNameWithFormatting(
  setting: Setting,
  text: string,
  applyInlineCodeTextToTarget: (targetEl: HTMLElement | null, formattedText: string) => void,
): void {
  setting.setName(text);
  const nameEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-name');
  applyInlineCodeTextToTarget(nameEl, text);
}

export function applyInlineCodeText(targetEl: HTMLElement | null, text: string): void {
  if (!targetEl) {
    return;
  }

  targetEl.empty();
  targetEl.appendChild(buildInlineCodeFragment(text));
}

export function addSettingHelpButton(setting: Setting, helpButton: SettingHelpButtonConfig): void {
  setting.addExtraButton((button) => {
    button
      .setIcon('help-circle')
      .setTooltip(helpButton.tooltip)
      .onClick(helpButton.onClick);
  });
}

export function renderSettingsPanelTitle(
  containerEl: HTMLElement,
  _app: App,
  _plugin: OpenCodianPlugin,
): void {
  const headingEl = containerEl.createEl('h2', { cls: 'opencodian-settings-panel-title' });
  const brandEl = headingEl.createSpan({ cls: 'opencodian-title' });
  const logoEl = brandEl.createSpan({ cls: 'opencodian-logo' });
  setIcon(logoEl, 'opencodian-app-icon');

  const wordmarks = [
    {
      className: 'is-light',
      src: getOpenCodianWordmarkDataUrl('light'),
    },
    {
      className: 'is-dark',
      src: getOpenCodianWordmarkDataUrl('dark'),
    },
  ];

  let renderedWordmark = false;
  for (const wordmark of wordmarks) {
    if (!wordmark.src) {
      continue;
    }

    renderedWordmark = true;
    brandEl.createEl('img', {
      cls: `opencodian-title-text opencodian-settings-title-wordmark ${wordmark.className}`,
      attr: {
        src: wordmark.src,
        alt: t('plugin.name'),
        draggable: 'false',
      },
    });
  }

  if (!renderedWordmark) {
    brandEl.createSpan({
      cls: 'opencodian-settings-panel-title-fallback',
      text: t('plugin.name'),
    });
  }
}

function buildInlineCodeFragment(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const segments = text.split(/(`[^`\n]+`)/g);

  for (const segment of segments) {
    if (!segment) {
      continue;
    }

    if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
      const codeEl = document.createElement('code');
      codeEl.setText(segment.slice(1, -1));
      fragment.appendChild(codeEl);
      continue;
    }

    const lines = segment.split('\n');
    lines.forEach((line, index) => {
      if (line.length > 0) {
        fragment.appendChild(document.createTextNode(line));
      }
      if (index < lines.length - 1) {
        fragment.appendChild(document.createElement('br'));
      }
    });
  }

  return fragment;
}
