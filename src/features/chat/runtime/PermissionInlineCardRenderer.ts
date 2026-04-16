import type { StreamChunk } from '../../../core/types';
import { t, type TranslationKey } from '../../../i18n';
import type { TabId } from '../tabs';
import { StreamingInlineCardRenderer } from './StreamingInlineCardRenderer';

type PermissionRequestChunk = Extract<StreamChunk, { type: 'permission_request' }>;

export type PermissionInlineCardResult = 'once' | 'always' | 'reject';

interface PermissionInlineCardButtons {
  onceBtn: HTMLButtonElement;
  alwaysBtn: HTMLButtonElement;
  rejectBtn: HTMLButtonElement;
}

export class PermissionInlineCardRenderer {
  constructor(private readonly streamingInlineCardRenderer: StreamingInlineCardRenderer) {}

  async collectResponse(
    request: PermissionRequestChunk,
    tabId: TabId | null,
  ): Promise<PermissionInlineCardResult | null> {
    const permissionCard = this.streamingInlineCardRenderer.createStreamingInlineCard(
      'opencodian-permission-inline',
      tabId,
    );
    if (!permissionCard) {
      return null;
    }

    const buttons = this.renderPermissionCard(permissionCard, request);
    const response = await this.waitForResponse(buttons);
    permissionCard.remove();
    return response;
  }

  private renderPermissionCard(
    permissionCard: HTMLElement,
    request: PermissionRequestChunk,
  ): PermissionInlineCardButtons {
    const { permission, patterns, metadata } = request;

    const headerEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-header' });
    headerEl.createSpan({ cls: 'opencodian-permission-inline-icon', text: '🔐' });
    headerEl.createSpan({
      cls: 'opencodian-permission-inline-title',
      text: t('permissionDialog.title'),
    });

    const infoEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-info' });
    infoEl.createDiv({
      cls: 'opencodian-permission-inline-tool',
      text: `${t('permissionDialog.description')} ${permission}`,
    });
    infoEl.createDiv({
      cls: 'opencodian-permission-inline-desc',
      text: this.getToolDescription(permission),
    });

    if (this.shouldRenderPatterns(patterns)) {
      const patternsEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-patterns' });
      patternsEl.createDiv({
        cls: 'opencodian-permission-inline-label',
        text: t('permissionDialog.patterns'),
      });
      patterns.forEach((pattern) => {
        patternsEl.createDiv({ cls: 'opencodian-permission-inline-pattern-item', text: pattern });
      });
    }

    if (metadata.command) {
      const commandEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-command' });
      commandEl.createSpan({
        cls: 'opencodian-permission-inline-label',
        text: `${t('permissionDialog.command')}: `,
      });
      commandEl.createEl('code', { text: String(metadata.command) });
    }

    return this.renderButtons(permissionCard);
  }

  private renderButtons(permissionCard: HTMLElement): PermissionInlineCardButtons {
    const buttonsEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-buttons' });

    return {
      onceBtn: buttonsEl.createEl('button', {
        cls: 'opencodian-permission-inline-btn opencodian-permission-inline-once',
        text: t('permissionDialog.allowOnce'),
      }),
      alwaysBtn: buttonsEl.createEl('button', {
        cls: 'opencodian-permission-inline-btn opencodian-permission-inline-always',
        text: t('permissionDialog.allowAlways'),
      }),
      rejectBtn: buttonsEl.createEl('button', {
        cls: 'opencodian-permission-inline-btn opencodian-permission-inline-reject',
        text: t('permissionDialog.reject'),
      }),
    };
  }

  private waitForResponse(buttons: PermissionInlineCardButtons): Promise<PermissionInlineCardResult> {
    return new Promise((resolve) => {
      buttons.onceBtn.addEventListener('click', () => resolve('once'), { once: true });
      buttons.alwaysBtn.addEventListener('click', () => resolve('always'), { once: true });
      buttons.rejectBtn.addEventListener('click', () => resolve('reject'), { once: true });
    });
  }

  private shouldRenderPatterns(patterns: string[]): boolean {
    return patterns.length > 0 && !(patterns.length === 1 && patterns[0] === '*');
  }

  private getToolDescription(permission: string): string {
    const baseTool = permission.split('_')[0].toLowerCase();
    const toolKey = `permissionDialog.tools.${baseTool}` as TranslationKey;
    const description = t(toolKey);
    return description === toolKey ? t('permissionDialog.tools.default') : description;
  }
}
