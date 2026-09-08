import { type App, Modal, Notice, Setting } from 'obsidian';

import type { PiServiceEvent } from '../../../core/agents/backend/pi/PiProtocol';

class PiDialog extends Modal {
  private completed = false;
  constructor(app: App, private readonly request: PiServiceEvent, private readonly finish: (result: Record<string, unknown>) => void) { super(app); }
  onOpen(): void {
    this.titleEl.setText(String(this.request.title ?? 'Pi'));
    if (this.request.message) this.contentEl.createEl('p', { text: String(this.request.message) });
    const method = String(this.request.method);
    if (method === 'select') {
      for (const option of Array.isArray(this.request.options) ? this.request.options : []) {
        new Setting(this.contentEl).setName(String(option)).addButton((button) => button.setButtonText('选择 / Select').onClick(() => this.resolve({ value: option })));
      }
    } else if (method === 'confirm') {
      new Setting(this.contentEl).addButton((b) => b.setButtonText('确认 / Confirm').setCta().onClick(() => this.resolve({ confirmed: true })));
    } else {
      const input = this.contentEl.createEl('textarea', { cls: 'opencodian-pi-dialog-input' });
      input.rows = method === 'editor' ? 12 : 3;
      input.style.width = '100%';
      input.value = String(this.request.prefill ?? '');
      input.placeholder = String(this.request.placeholder ?? '');
      input.setAttribute('aria-label', String(this.request.title ?? 'Pi input'));
      new Setting(this.contentEl).addButton((b) => b.setButtonText('提交 / Submit').setCta().onClick(() => this.resolve({ value: input.value })));
      input.focus();
    }
    new Setting(this.contentEl).addButton((b) => b.setButtonText('取消 / Cancel').onClick(() => this.resolve({ cancelled: true })));
  }
  onClose(): void { if (!this.completed) { this.completed = true; this.finish({ cancelled: true }); } }
  private resolve(result: Record<string, unknown>): void { if (this.completed) return; this.completed = true; this.finish(result); this.close(); }
}

/** Renders all nine official RPC UI methods without interpreting extension HTML. */
export async function presentPiUiRequest(app: App, request: PiServiceEvent, signal: AbortSignal): Promise<Record<string, unknown> | void> {
  const method = String(request.method);
  if (['select', 'confirm', 'input', 'editor'].includes(method)) {
    if (signal.aborted) return { cancelled: true };
    return new Promise((resolve) => {
      const close = (): void => modal.close();
      const modal = new PiDialog(app, request, (value) => { signal.removeEventListener('abort', close); resolve(value); });
      signal.addEventListener('abort', close, { once: true }); modal.open();
    });
  }
  if (method === 'notify') {
    const notice = new Notice(String(request.message ?? ''), request.url ? 0 : 6000);
    if (typeof request.url === 'string' && /^https?:\/\//i.test(request.url)) {
      notice.noticeEl.createEl('a', { text: '打开登录页面 / Open sign-in page', href: request.url, attr: { target: '_blank', rel: 'noopener noreferrer' } });
    }
    return;
  }
  const leaf = app.workspace.getLeavesOfType('opencodian-view').find((candidate) => {
    const view = candidate.view as unknown as { currentConversation?: { backend?: string; backendSessionId?: string } };
    return view.currentConversation?.backend === 'pi' && view.currentConversation.backendSessionId === request.sessionId;
  });
  const container = leaf?.view.containerEl;
  if (!container) return;
  if (method === 'set_editor_text') {
    const input = container.querySelector<HTMLTextAreaElement>('textarea.opencodian-input');
    if (input) { input.value = String(request.text ?? ''); input.dispatchEvent(new Event('input', { bubbles: true })); }
    return;
  }
  if (method === 'setTitle') { container.setAttribute('aria-label', String(request.title ?? 'Pi')); return; }
  if (!['setStatus', 'setWidget'].includes(method)) return;
  renderPiWidget(container, request, method);
}

function renderPiWidget(container: HTMLElement, request: PiServiceEvent, method: string): void {
  let surface = container.querySelector<HTMLElement>('.opencodian-pi-extension-ui');
  if (!surface) surface = container.createDiv({ cls: 'opencodian-pi-extension-ui', attr: { 'aria-live': 'polite' } });
  const key = String(request.widgetKey ?? request.statusKey ?? 'status');
  let item = [...surface.children].find((child) => (child as HTMLElement).dataset.piKey === key) as HTMLElement | undefined;
  const text = method === 'setWidget' ? (Array.isArray(request.widgetLines) ? request.widgetLines.join('\n') : '') : String(request.statusText ?? '');
  if (!text) { item?.remove(); return; }
  if (!item) { item = surface.createEl('pre'); item.dataset.piKey = key; }
  item.textContent = text;
}
