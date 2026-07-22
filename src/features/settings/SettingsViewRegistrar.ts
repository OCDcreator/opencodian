/**
 * Settings View Registrar
 *
 * Registers the editor-area settings view type and command with the plugin.
 * Extracted from main.ts to keep the guarded plugin shell thin.
 */

import { VIEW_TYPE_OPENCODIAN_SETTINGS } from '../../core/types';
import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { OpenCodianSettingsView } from './OpenCodianSettingsView';

export function registerSettingsView(plugin: OpenCodianPlugin): void {
  plugin.registerView(
    VIEW_TYPE_OPENCODIAN_SETTINGS,
    (leaf) => new OpenCodianSettingsView(leaf, plugin),
  );

  plugin.addCommand({
    id: 'open-settings-in-editor-area',
    name: t('settings.ui.settingsInEditorArea.command'),
    checkCallback: (checking) => {
      if (!plugin.settings.settingsInEditorArea) {
        return false;
      }
      if (checking) {
        return true;
      }
      void activateSettingsView(plugin);
    },
  });

  const activeBackendChangeSubscription = plugin.agentServiceRegistry?.onActiveChange((backend) => {
    if (backend) {
      broadcastActiveBackendChangeToSettingsViews(plugin, backend);
    }
  });
  if (activeBackendChangeSubscription) {
    plugin.register(() => activeBackendChangeSubscription.dispose());
  }
}

export async function activateSettingsView(plugin: OpenCodianPlugin): Promise<void> {
  dismissNativeSettingsModals(document);

  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN_SETTINGS)[0];

  if (!leaf) {
    const newLeaf = workspace.getLeaf('tab');
    if (newLeaf) {
      await newLeaf.setViewState({
        type: VIEW_TYPE_OPENCODIAN_SETTINGS,
        active: true,
      });
      leaf = newLeaf;
    }
  }

  if (leaf) {
    workspace.revealLeaf(leaf);
  }
}

export function dismissNativeSettingsModals(ownerDocument: Document): void {
  ownerDocument
    .querySelectorAll<HTMLElement>('.modal.mod-settings .modal-close-button')
    .forEach((closeButtonEl) => {
      closeButtonEl.click();
    });
}

/** Broadcast model-loaded refresh to all active editor-area settings views */
export function broadcastModelsLoadedToSettingsViews(plugin: OpenCodianPlugin): void {
  for (const view of getSettingsViews(plugin)) {
    view.onModelsLoaded();
  }
}

/** Broadcast server-status refresh to all active editor-area settings views */
export function broadcastServerStatusToSettingsViews(plugin: OpenCodianPlugin): void {
  for (const view of getSettingsViews(plugin)) {
    view.refreshServerStatusDisplay();
  }
}

/** Broadcast an active-backend change to all open editor-area settings views. */
export function broadcastActiveBackendChangeToSettingsViews(
  plugin: OpenCodianPlugin,
  backend: AgentBackendKind,
): void {
  for (const view of getSettingsViews(plugin)) {
    view.handleActiveBackendChange(backend);
  }
}

function getSettingsViews(plugin: OpenCodianPlugin): OpenCodianSettingsView[] {
  const views: OpenCodianSettingsView[] = [];
  for (const leaf of plugin.app?.workspace?.getLeavesOfType(VIEW_TYPE_OPENCODIAN_SETTINGS) ?? []) {
    if (leaf.view instanceof OpenCodianSettingsView) {
      views.push(leaf.view);
    }
  }
  return views;
}
