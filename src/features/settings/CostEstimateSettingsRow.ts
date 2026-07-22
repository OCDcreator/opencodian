import { Setting } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { ModelPricingModal } from './ModelPricingModal';

export type CostEstimateBackend = 'opencode' | 'claude-code' | 'codex';

const BACKEND_DESCRIPTION_KEYS: Record<CostEstimateBackend, 'settings.cost.backend.opencode' | 'settings.cost.backend.claudeCode' | 'settings.cost.backend.codex'> = {
  opencode: 'settings.cost.backend.opencode',
  'claude-code': 'settings.cost.backend.claudeCode',
  codex: 'settings.cost.backend.codex',
};

function getBackendPricingSettings(
  plugin: OpenCodianPlugin,
  backend: Exclude<CostEstimateBackend, 'opencode'>,
) {
  return backend === 'claude-code'
    ? plugin.settings.backendSettings.claudeCode
    : plugin.settings.backendSettings.codex;
}

function renderThirdPartyPricingIdentity(
  containerEl: HTMLElement,
  plugin: OpenCodianPlugin,
  backend: Exclude<CostEstimateBackend, 'opencode'>,
): void {
  const settings = getBackendPricingSettings(plugin, backend);
  const backendKey = backend === 'claude-code'
    ? 'settings.cost.identity.claudeCode'
    : 'settings.cost.identity.codex';

  new Setting(containerEl)
    .setName(t('settings.cost.identity.provider.name'))
    .setDesc(t(`${backendKey}.provider` as 'settings.cost.identity.claudeCode.provider' | 'settings.cost.identity.codex.provider'))
    .addText((text) => {
      text
        .setPlaceholder('openrouter')
        .setValue(settings.pricingProviderId)
        .onChange(async (value) => {
          settings.pricingProviderId = value.trim().toLowerCase();
          await plugin.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName(t('settings.cost.identity.endpoint.name'))
    .setDesc(t(`${backendKey}.endpoint` as 'settings.cost.identity.claudeCode.endpoint' | 'settings.cost.identity.codex.endpoint'))
    .addText((text) => {
      text
        .setPlaceholder('https://api.example.com/v1')
        .setValue(settings.pricingEndpoint)
        .onChange(async (value) => {
          settings.pricingEndpoint = value.trim().replace(/\/+$/, '');
          await plugin.saveSettings();
        });
    });
}

/** Reused policy row: all backends edit one local rate table, but disclose different cost semantics. */
export function renderCostEstimateSettingsRow(
  containerEl: HTMLElement,
  plugin: OpenCodianPlugin,
  backend: CostEstimateBackend,
): void {
  if (backend !== 'opencode') {
    renderThirdPartyPricingIdentity(containerEl, plugin, backend);
  }
  const status = plugin.modelPricingService?.getStatus();
  const description = [
    t(BACKEND_DESCRIPTION_KEYS[backend]),
    status?.fetchedAt
      ? t('settings.cost.row.catalogReady', { count: String(status.entryCount) })
      : t('settings.cost.row.catalogMissing'),
  ].join(' ');

  new Setting(containerEl)
    .setName(t('settings.cost.row.name'))
    .setDesc(description)
    .addButton((button) => {
      button
        .setButtonText(t('settings.cost.row.manage'))
        .onClick(() => {
          new ModelPricingModal(plugin.app, plugin).open();
        });
    });
}
