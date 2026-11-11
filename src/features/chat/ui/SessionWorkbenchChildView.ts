/** Read-only child transcripts and the capability-gated continuation composer. */
import { Component, MarkdownRenderer, setIcon } from 'obsidian';

import { t } from '../../../i18n';
import { maskUserMessageSecretsForDisplay } from '../rendering/userMessageDisplay';
import type { SessionWorkbenchActions, SessionWorkbenchState } from './SessionWorkbenchInformation';

type Child = NonNullable<SessionWorkbenchState['child']>;
type ChildActions = Pick<SessionWorkbenchActions, 'app' | 'returnToParent' | 'continueChild'
  | 'onChildComposerInput' | 'onChildComposerDelivery' | 'onChildComposerFocus'>;

/** Owns the MarkdownRenderer/Component lifecycle away from the overview's frequently rebuilt information rows. */
export class SessionWorkbenchChildView {
  private childComponent: Component | null = null;

  constructor(private readonly actions: ChildActions) {}

  render(parent: HTMLElement, child: Child): void {
    this.button(parent, t('workbench.info.returnToParent'), 'arrow-left', () => this.actions.returnToParent?.());
    parent.createEl('h3', { cls: 'opencodian-workbench-child-title', text: child.agent.title });
    parent.createDiv({ cls: 'opencodian-workbench-muted', text: `${child.agent.id} · ${t(`workbench.info.agent.${child.agent.status}`)}` });
    if (child.agent.mode && child.agent.mode !== 'continuable') {
      parent.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.childReadOnly'), attr: { role: 'note' } });
    }
    if (child.agent.mode === 'continuable') this.renderComposer(parent, child);
    if (child.error) parent.createDiv({ cls: 'opencodian-workbench-error', text: child.error, attr: { role: 'alert' } });
    if (child.loading && !child.messages.length) parent.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.loading') });
    if (!child.loading && !child.error && !child.messages.length) parent.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.emptyChild') });
    const component = this.childComponent = new Component(); component.load();
    for (const message of child.messages) {
      const row = parent.createDiv({ cls: 'opencodian-workbench-child-message' });
      row.createDiv({ cls: 'opencodian-workbench-muted', text: t(message.role === 'user' ? 'workbench.info.user' : 'workbench.info.assistant') });
      const body = row.createDiv({ cls: 'opencodian-workbench-child-content' });
      // Display-only projection: persisted messages and resend drafts stay original.
      const display = message.role === 'user' ? maskUserMessageSecretsForDisplay(message.content) : message.content;
      if (this.actions.app) void MarkdownRenderer.render(this.actions.app, display, body, '', component).catch(() => body.setText(display));
      else body.setText(display);
      for (const tool of message.toolCalls ?? []) {
        const details = row.createEl('details', { cls: 'opencodian-workbench-child-tool' });
        details.createEl('summary', { text: `${tool.name} · ${tool.status ?? 'unknown'}` });
        details.createEl('pre', { text: JSON.stringify(tool.input, null, 2) });
        if (tool.result) details.createEl('pre', { text: tool.result });
      }
    }
  }

  /** Sends only through the proven child-continuation seam; a failed send preserves the draft. */
  private renderComposer(parent: HTMLElement, child: Child): void {
    const form = parent.createDiv({ cls: 'opencodian-workbench-child-composer' });
    if (child.canContinue === false) {
      form.createDiv({ cls: 'opencodian-workbench-muted', text: t('workbench.info.childParentUnavailable'), attr: { role: 'note' } });
      this.renderReceipt(form, child);
      return;
    }
    if (child.canContinue !== true) {
      form.createDiv({ cls: 'opencodian-workbench-muted',
        text: child.canContinue === 'unknown' ? t('workbench.info.childCapabilityUnknown') : t('workbench.info.loading'), attr: { role: 'status' } });
      this.renderReceipt(form, child);
      return;
    }
    const input = form.createEl('textarea', { cls: 'opencodian-workbench-child-input', attr: {
      rows: '2', placeholder: t('workbench.info.childComposerPlaceholder'), 'aria-label': t('workbench.info.childComposerPlaceholder') } });
    input.value = child.draft ?? '';
    input.addEventListener('input', () => this.actions.onChildComposerInput?.(input.value, input.selectionStart ?? undefined));
    input.addEventListener('select', () => this.actions.onChildComposerInput?.(input.value, input.selectionStart ?? undefined));
    input.addEventListener('focus', () => this.actions.onChildComposerFocus?.(true));
    input.addEventListener('blur', () => this.actions.onChildComposerFocus?.(false));
    if (child.composerFocused) input.focus();
    const caret = Math.min(child.composerCaret ?? input.value.length, input.value.length);
    input.setSelectionRange(caret, caret);
    const row = form.createDiv({ cls: 'opencodian-workbench-child-composer-row' });
    const delivery = row.createDiv({ cls: 'opencodian-workbench-child-delivery', attr: { role: 'radiogroup', 'aria-label': t('workbench.info.childDelivery') } });
    let selected = child.delivery ?? 'queue';
    for (const [value, key] of [['queue', 'workbench.info.childDeliveryQueue'], ['steer', 'workbench.info.childDeliverySteer']] as const) {
      const option = delivery.createEl('button', { cls: 'opencodian-workbench-child-delivery-option', attr: {
        type: 'button', role: 'radio', 'aria-checked': String(selected === value) } });
      option.setText(t(key));
      option.addEventListener('click', () => {
        if (selected === value) return;
        selected = value;
        for (const sibling of delivery.querySelectorAll<HTMLButtonElement>('.opencodian-workbench-child-delivery-option')) {
          sibling.setAttribute('aria-checked', String(sibling === option));
        }
        this.actions.onChildComposerDelivery?.(value);
      });
    }
    const status = row.createEl('p', { cls: 'opencodian-workbench-muted', attr: { role: 'status' } });
    this.renderReceipt(status, child);
    let sending = false;
    this.button(row, t('workbench.info.childSend'), 'send', async () => {
      const text = input.value.trim();
      if (!text || sending || !this.actions.continueChild) return;
      sending = true; status.setText(t('workbench.info.childSendPending'));
      try {
        await this.actions.continueChild(text, selected);
        input.value = '';
      } catch (error) { status.setText(error instanceof Error ? error.message : String(error)); }
      finally { sending = false; }
    });
  }

  private renderReceipt(parent: HTMLElement, child: Child): void {
    if (child.sendNote) parent.createDiv({ cls: 'opencodian-workbench-muted', text: child.sendNote, attr: { role: 'status' } });
  }

  private button(parent: HTMLElement, label: string, icon: string, action: () => void | Promise<void>): HTMLButtonElement {
    const button = parent.createEl('button', { cls: 'opencodian-workbench-button', attr: { type: 'button', 'aria-label': label, title: label } });
    const glyph = button.createSpan(); setIcon(glyph, icon);
    button.createSpan({ text: label });
    button.addEventListener('click', () => { void Promise.resolve().then(action).catch(() => undefined); });
    return button;
  }

  destroy(): void { this.childComponent?.unload(); this.childComponent = null; }
}
