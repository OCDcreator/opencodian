import type { StreamChunk } from '../../../core/types';
import { type PermissionReply,SessionPermissionTracker } from '../../../core/types/permission';
import { t, type TranslationKey } from '../../../i18n';
import type { TabId } from '../tabs';
import { StreamingInlineCardRenderer } from './StreamingInlineCardRenderer';

type PermissionRequestChunk = Extract<StreamChunk, { type: 'permission_request' }>;

export type PermissionInlineCardResult = 'once' | 'always' | 'session' | 'reject';
type PermissionResponder = (requestId: string, reply: PermissionReply) => Promise<void>;

interface PermissionInlineCardButtons {
  onceBtn: HTMLButtonElement;
  alwaysBtn: HTMLButtonElement;
  sessionBtn: HTMLButtonElement;
  rejectBtn: HTMLButtonElement;
}

export class PermissionInlineCardRenderer {
  private readonly sessionPermissionTracker = new SessionPermissionTracker();

  constructor(private readonly streamingInlineCardRenderer: StreamingInlineCardRenderer) {}

  async collectAndRespond(
    request: PermissionRequestChunk,
    tabId: TabId | null,
    respond: PermissionResponder,
  ): Promise<boolean> {
    const action = this.getSessionPermissionAction(request);
    if (this.sessionPermissionTracker.isSessionApproved(
      request.sessionID,
      request.permission,
      action,
      request.patterns,
    )) {
      await respond(request.id, 'always');
      return true;
    }

    const result = await this.collectResponse(request, tabId);
    if (!result) {
      return false;
    }

    if (result === 'session') {
      this.sessionPermissionTracker.addSessionApproval(
        request.sessionID,
        request.permission,
        action,
        request.patterns,
      );
      // NOTE: The OpenCode SDK does not have a 'session' permission level.
      // We send 'always' to the server but track it client-side so it only
      // auto-approves matching requests within the current plugin session.
      // If the OpenCode server persists 'always' beyond session scope,
      // the user may see auto-approvals in future sessions for matching patterns.
      await respond(request.id, 'always');
      return true;
    }

    await respond(request.id, result);
    return true;
  }

  clearSessionApprovals(): void {
    this.sessionPermissionTracker.clearAll();
  }

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
      sessionBtn: buttonsEl.createEl('button', {
        cls: 'opencodian-permission-inline-btn opencodian-permission-inline-session',
        text: t('permissionDialog.allowSession'),
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
      buttons.sessionBtn.addEventListener('click', () => resolve('session'), { once: true });
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

  private getSessionPermissionAction(request: PermissionRequestChunk): string {
    const rawAction = request.metadata.action;
    return typeof rawAction === 'string' ? rawAction : '';
  }
}
