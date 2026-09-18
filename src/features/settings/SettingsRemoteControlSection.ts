/**
 * SettingsRemoteControlSection — R-C6 remote-drive control surface.
 *
 * Owns the four remote-control settings rows (master switch, bind address,
 * token state + regeneration, audit observability) plus the two mandatory
 * confirmations: the non-loopback bind acknowledgement (plaintext HTTP,
 * sniffable bearer token, vault-writing capability, unidentifiable callers)
 * and the token-rotation warning (old token invalidates immediately).
 *
 * Security contract: the token itself is shown exactly once, in the reveal
 * modal right after generation; every other surface shows only its sha256
 * fingerprint prefix. The service re-validates the acknowledgement timestamp
 * at bind time, so the UI gate is convenience, not the enforcement boundary.
 */

import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';

import type { RemoteControlRuntimeState } from '../../core/remotecontrol';
import {
  deriveTokenFingerprint,
  generateRemoteControlToken,
  isLoopbackBindAddress,
} from '../../core/remotecontrol';
import type { OpenCodianSettings } from '../../core/types';
import { normalizeRemoteControlBindAddress } from '../../core/types';
import { t } from '../../i18n';

/** The plugin surface this section needs (structural: no app-layer import). */
interface RemoteControlSettingsHost {
  settings: OpenCodianSettings;
  saveSettings(): Promise<unknown>;
  /** Present after plugin onload; may be null in tests. */
  remoteControlService: {
    applySettings(): Promise<void>;
    getRuntimeState(): RemoteControlRuntimeState;
  } | null;
}

interface SettingsRemoteControlSectionOptions {
  app: App;
  plugin: RemoteControlSettingsHost;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

export class SettingsRemoteControlSection {
  private readonly app: App;
  private readonly plugin: RemoteControlSettingsHost;
  private readonly createSectionHeading: SettingsRemoteControlSectionOptions['createSectionHeading'];

  constructor(options: SettingsRemoteControlSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  dispose(): void { /* No subscriptions to release. */ }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.remoteControl.title'),
      t('settings.quickNav.remoteControlDesc'),
    );

    this.renderEnabledSetting(containerEl);
    this.renderStatusSetting(containerEl);
    this.renderBindAddressSetting(containerEl);
    this.renderTokenSetting(containerEl);
    this.renderAuditSetting(containerEl);
    return headingEl;
  }

  /** Tabbed-layout mount inside the security tab (remote secondary tab). */
  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    if (secondaryTabId !== 'remote') return;
    this.attach(containerEl);
  }

  private renderEnabledSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.remoteControl.enabled.name'))
      .setDesc(t('settings.remoteControl.enabled.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.remoteControlEnabled)
          .onChange(async (value) => {
            if (value) {
              const token = this.plugin.settings.remoteControlToken || generateRemoteControlToken();
              const isNewToken = !this.plugin.settings.remoteControlToken;
              this.plugin.settings.remoteControlEnabled = true;
              this.plugin.settings.remoteControlToken = token;
              await this.plugin.saveSettings();
              await this.plugin.remoteControlService?.applySettings();
              if (isNewToken) {
                this.openTokenRevealModal(token);
              }
            } else {
              // Close ≠ revoke: the token is kept so external drivers survive
              // on/off toggles; revocation is the explicit regenerate action.
              this.plugin.settings.remoteControlEnabled = false;
              await this.plugin.saveSettings();
              await this.plugin.remoteControlService?.applySettings();
            }
            this.refreshStatusText();
          }));
  }

  private statusSetting: Setting | null = null;

  private renderStatusSetting(containerEl: HTMLElement): void {
    this.statusSetting = new Setting(containerEl)
      .setName(t('settings.remoteControl.status.name'))
      .setDesc(this.resolveStatusText())
      .addExtraButton((button) => {
        button
          .setIcon('refresh-cw')
          .setTooltip(t('settings.remoteControl.status.refresh'))
          .onClick(async () => {
            await this.plugin.remoteControlService?.applySettings();
            this.refreshStatusText();
          });
      });
  }

  private refreshStatusText(): void {
    this.statusSetting?.setDesc(this.resolveStatusText());
  }

  private resolveStatusText(): string {
    const runtime = this.plugin.remoteControlService?.getRuntimeState();
    if (!runtime) {
      return t('settings.remoteControl.status.unavailable');
    }
    if (runtime.state === 'listening') {
      return t('settings.remoteControl.status.listening', {
        address: `${runtime.bindAddress}:${runtime.port}`,
      });
    }
    if (runtime.state === 'error') {
      if (runtime.blockedReason === 'missing-token') {
        return t('settings.remoteControl.status.blockedToken');
      }
      if (runtime.blockedReason === 'non-loopback-unacknowledged') {
        return t('settings.remoteControl.status.blockedNonLoopback');
      }
      return t('settings.remoteControl.status.error', {
        error: runtime.bindError ?? '',
      });
    }
    return t('settings.remoteControl.status.off');
  }

  private renderBindAddressSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.remoteControl.bind.name'))
      .setDesc(t('settings.remoteControl.bind.desc'))
      .addText((text) => {
        text
          .setValue(this.plugin.settings.remoteControlBindAddress)
          .onChange(async (value) => {
            const next = normalizeRemoteControlBindAddress(value);
            const previous = this.plugin.settings.remoteControlBindAddress;
            if (next === previous) return;

            if (isLoopbackBindAddress(next)) {
              // Returning to loopback clears the stale acknowledgement.
              this.plugin.settings.remoteControlBindAddress = next;
              this.plugin.settings.remoteControlNonLoopbackAcknowledgedAt = '';
              await this.plugin.saveSettings();
              await this.plugin.remoteControlService?.applySettings();
              this.refreshStatusText();
              return;
            }

            this.openNonLoopbackConfirmModal(next, previous, () => {
              text.setValue(previous);
            });
          });
      });
  }

  private renderTokenSetting(containerEl: HTMLElement): void {
    const token = this.plugin.settings.remoteControlToken;
    const stateText = token
      ? t('settings.remoteControl.token.configured', {
        fingerprint: deriveTokenFingerprint(token),
      })
      : t('settings.remoteControl.token.unconfigured');
    new Setting(containerEl)
      .setName(t('settings.remoteControl.token.name'))
      .setDesc(stateText)
      .addButton((button) => {
        button
          .setButtonText(t('settings.remoteControl.token.regenerate'))
          .onClick(() => {
            this.openRegenerateConfirmModal();
          });
      });
  }

  private renderAuditSetting(containerEl: HTMLElement): void {
    const runtime = this.plugin.remoteControlService?.getRuntimeState();
    const directory = runtime?.auditDirectory ?? '';
    const dropped = runtime?.droppedAuditEvents ?? 0;
    new Setting(containerEl)
      .setName(t('settings.remoteControl.audit.name'))
      .setDesc(t('settings.remoteControl.audit.desc', {
        directory,
        dropped: String(dropped),
      }))
      .addButton((button) => {
        button
          .setButtonText(t('settings.remoteControl.audit.open'))
          .onClick(() => {
            this.openAuditDirectory(directory);
          });
      });
  }

  private openNonLoopbackConfirmModal(
    nextAddress: string,
    previousAddress: string,
    onCancel: () => void,
  ): void {
    const confirmedAt = new Date().toISOString();
    new RemoteControlConfirmModal(this.app, {
      title: t('settings.remoteControl.nonLoopback.title'),
      body: t('settings.remoteControl.nonLoopback.body', { address: nextAddress }),
      confirmLabel: t('settings.remoteControl.nonLoopback.confirm'),
      cancelLabel: t('settings.remoteControl.nonLoopback.cancel'),
      onConfirm: async () => {
        this.plugin.settings.remoteControlBindAddress = nextAddress;
        this.plugin.settings.remoteControlNonLoopbackAcknowledgedAt = confirmedAt;
        await this.plugin.saveSettings();
        await this.plugin.remoteControlService?.applySettings();
        this.refreshStatusText();
        new Notice(t('settings.remoteControl.nonLoopback.enabledNotice', {
          address: nextAddress,
        }));
      },
      onCancel,
    }).open();
  }

  private openRegenerateConfirmModal(): void {
    new RemoteControlConfirmModal(this.app, {
      title: t('settings.remoteControl.regenerate.title'),
      body: t('settings.remoteControl.regenerate.body'),
      confirmLabel: t('settings.remoteControl.regenerate.confirm'),
      cancelLabel: t('settings.remoteControl.nonLoopback.cancel'),
      onConfirm: async () => {
        const token = generateRemoteControlToken();
        this.plugin.settings.remoteControlToken = token;
        await this.plugin.saveSettings();
        await this.plugin.remoteControlService?.applySettings();
        this.openTokenRevealModal(token);
        new Notice(t('settings.remoteControl.regenerate.doneNotice'));
      },
    }).open();
  }

  /** The single surface that ever displays the token. Shown exactly once. */
  private openTokenRevealModal(token: string): void {
    new RemoteControlTokenRevealModal(this.app, token).open();
  }

  private openAuditDirectory(directory: string): void {
    if (!directory) {
      new Notice(t('settings.remoteControl.audit.unavailable'));
      return;
    }
    const shell = resolveElectronShell();
    if (!shell) {
      new Notice(t('settings.remoteControl.audit.openFailed', { directory }));
      return;
    }
    void shell.openPath(directory).then((error) => {
      if (error) {
        new Notice(t('settings.remoteControl.audit.openFailed', { directory }));
      }
    });
  }
}

/** Options for the minimal confirmation modal (kept under the param cap). */
interface RemoteControlConfirmModalOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => Promise<void> | void;
  onCancel?: () => void;
}

/** Minimal confirmation modal with explicit confirm/cancel semantics. */
class RemoteControlConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly options: RemoteControlConfirmModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl('h3', { text: this.options.title });
    this.contentEl.createEl('p', { text: this.options.body });
    const actionsEl = this.contentEl.createDiv();
    actionsEl.style.display = 'flex';
    actionsEl.style.gap = '8px';
    actionsEl.style.justifyContent = 'flex-end';
    new ButtonComponent(actionsEl)
      .setButtonText(this.options.cancelLabel)
      .onClick(() => {
        this.options.onCancel?.();
        this.close();
      });
    new ButtonComponent(actionsEl)
      .setButtonText(this.options.confirmLabel)
      .setCta()
      .onClick(() => {
        void this.options.onConfirm();
        this.close();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** One-time token reveal: copy affordance + explicit storage warning. */
class RemoteControlTokenRevealModal extends Modal {
  constructor(
    app: App,
    private readonly token: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl('h3', { text: t('settings.remoteControl.tokenModal.title') });
    this.contentEl.createEl('p', { text: t('settings.remoteControl.tokenModal.body') });
    const codeEl = this.contentEl.createEl('code', {
      cls: 'opencodian-remote-control-token-reveal',
    });
    codeEl.setText(this.token);
    codeEl.style.userSelect = 'all';
    codeEl.style.wordBreak = 'break-all';
    this.contentEl.createEl('p', { text: t('settings.remoteControl.tokenModal.warning') });
    const actionsEl = this.contentEl.createDiv();
    actionsEl.style.display = 'flex';
    actionsEl.style.gap = '8px';
    actionsEl.style.justifyContent = 'flex-end';
    new ButtonComponent(actionsEl)
      .setButtonText(t('settings.remoteControl.tokenModal.copy'))
      .onClick(async () => {
        await navigator.clipboard.writeText(this.token);
        new Notice(t('settings.remoteControl.tokenModal.copied'));
      });
    new ButtonComponent(actionsEl)
      .setButtonText(t('settings.remoteControl.tokenModal.close'))
      .setCta()
      .onClick(() => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

interface ElectronShellModule {
  openPath: (path: string) => Promise<string>;
}

function resolveElectronShell(): ElectronShellModule | null {
  const globalWithRequire = globalThis as typeof globalThis & {
    require?: (module: string) => unknown;
  };
  const dynamicRequire = globalWithRequire.require;
  if (!dynamicRequire) {
    return null;
  }
  try {
    const remote = dynamicRequire('@electron/remote') as { shell?: ElectronShellModule };
    if (remote?.shell) return remote.shell;
  } catch {
    // ignore
  }
  try {
    const electron = dynamicRequire('electron') as { remote?: { shell?: ElectronShellModule } };
    if (electron?.remote?.shell) return electron.remote.shell;
  } catch {
    // ignore
  }
  return null;
}
