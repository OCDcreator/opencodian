import { type App, Modal, Notice, Setting } from 'obsidian';

import type { PiAdapter } from '../../core/agents/backend/pi/PiAdapter';
import type { PiRecord } from '../../core/agents/backend/pi/PiRpcClient';
import { PI_WORKBENCH_GROUPS, type PiActionField, type PiWorkbenchAction } from './PiWorkbenchActions';

/** Dedicated Pi management surface; all operational state remains in the service. */
export class PiWorkbenchModal extends Modal {
  private sessionId = '';
  private group = Object.keys(PI_WORKBENCH_GROUPS)[0];
  private action = PI_WORKBENCH_GROUPS[this.group][0];
  private output?: HTMLElement;
  private form?: HTMLElement;
  private unsubscribe?: { dispose(): void };
  private eventLines: string[] = [];

  constructor(app: App, private readonly adapter: PiAdapter, private readonly openChat?: (id: string) => Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.setText('Pi 工作台 / Pi workbench');
    this.contentEl.addClass('opencodian-pi-workbench');
    this.contentEl.createEl('p', { text: '会话、模型和队列设置只作用于选中的 Pi 服务。账户与扩展包操作会更新 Pi 的认证或包配置。 / Session controls are isolated; account and package actions persist explicitly.' });
    void this.load();
    this.unsubscribe = this.adapter.onEvent((id, event) => {
      if (id !== this.sessionId) return;
      const summary = String(event.type === 'message_update' ? (event.assistantMessageEvent as PiRecord)?.delta ?? '' : event.type);
      if (summary) this.eventLines.push(summary);
      this.eventLines = this.eventLines.slice(-80);
      const log = this.contentEl.querySelector<HTMLElement>('.opencodian-pi-workbench-log');
      if (log) log.textContent = this.eventLines.join('\n');
    });
  }
  onClose(): void { this.unsubscribe?.dispose(); this.contentEl.empty(); }

  private async load(): Promise<void> {
    const sessions = await this.adapter.listSessions();
    if (!this.sessionId) this.sessionId = sessions[0]?.id ?? '';
    this.contentEl.querySelectorAll('.opencodian-pi-workbench-controls, .opencodian-pi-workbench-log').forEach((element) => element.remove());
    this.form?.remove(); this.output?.remove();
    const controls = this.contentEl.createDiv({ cls: 'opencodian-pi-workbench-controls' });
    new Setting(controls).setName('当前会话 / Session').addDropdown((d) => {
      d.addOption('', '仅目录与账户 / Catalog and account');
      for (const session of sessions) d.addOption(session.id, session.title);
      d.setValue(this.sessionId).onChange((id) => { this.sessionId = id; });
    }).addButton((b) => b.setButtonText('新建 / New').onClick(async () => {
      this.sessionId = await this.adapter.createSession(); controls.remove(); this.form?.remove(); this.output?.remove(); await this.load();
    })).addButton((b) => b.setButtonText('打开聊天 / Open chat').onClick(async () => {
      if (this.sessionId && this.openChat) { await this.openChat(this.sessionId); this.close(); }
    }));
    new Setting(controls).setName('功能 / Area').addDropdown((d) => {
      for (const group of Object.keys(PI_WORKBENCH_GROUPS)) d.addOption(group, group);
      d.setValue(this.group).onChange((group) => { this.group = group; this.action = PI_WORKBENCH_GROUPS[group][0]; this.renderAction(); });
    });
    this.form = this.contentEl.createDiv(); this.output = this.contentEl.createDiv({ attr: { 'aria-live': 'polite' } });
    this.contentEl.createEl('pre', { cls: 'opencodian-pi-workbench-log', attr: { 'aria-label': 'Pi live events' } });
    this.renderAction();
  }
  private renderAction(): void {
    if (!this.form) return;
    this.form.empty();
    new Setting(this.form).setName('操作 / Action').addDropdown((d) => {
      for (const action of PI_WORKBENCH_GROUPS[this.group]) d.addOption(action.id, action.label);
      d.setValue(this.action.id).onChange((id) => { this.action = PI_WORKBENCH_GROUPS[this.group].find((a) => a.id === id) as PiWorkbenchAction; this.renderAction(); });
    });
    const input: PiRecord = {};
    for (const field of this.action.fields ?? []) this.renderField(field, input);
    let confirmed = !this.action.mutation;
    if (this.action.mutation) new Setting(this.form).setName('确认执行所选操作 / Confirm selected change').addToggle((t) => t.setValue(false).onChange((v) => { confirmed = v; }));
    new Setting(this.form).addButton((b) => b.setButtonText('执行 / Run').setCta().onClick(async () => {
      if (!confirmed) { new Notice('请确认所选操作 / Confirm the selected change'); return; }
      const action = this.action; b.setDisabled(true);
      try {
        const previous = this.sessionId;
        const result = await this.execute(action, input);
        if (previous !== this.sessionId || action.id === 'set_session_name') await this.load();
        this.output?.empty(); this.output?.createEl('pre', { text: JSON.stringify(result, null, 2) });
      } catch (error) { this.output?.setText(error instanceof Error ? error.message : String(error)); }
      finally { b.setDisabled(false); }
    }));
    new Setting(this.form).addButton((b) => b.setButtonText('停止当前操作 / Stop').onClick(() => {
      this.adapter.stopSession(this.sessionId || undefined);
    }));
  }
  private renderField(field: PiActionField, input: PiRecord): void {
    const setting = new Setting(this.form as HTMLElement).setName(field.label);
    if (field.kind === 'boolean') {
      input[field.key] = false; setting.addToggle((t) => t.onChange((v) => { input[field.key] = v; }));
    } else if (field.options) {
      input[field.key] = field.options[0]; setting.addDropdown((d) => {
        for (const option of field.options ?? []) d.addOption(option, option);
        d.onChange((v) => { input[field.key] = v; });
      });
    } else setting.addText((t) => {
      if (field.kind === 'secret') t.inputEl.type = 'password';
      t.onChange((v) => { input[field.key] = v; });
    });
  }
  private async execute(action: PiWorkbenchAction, values: PiRecord): Promise<unknown> {
    const input = { ...values };
    for (const field of action.fields ?? []) {
      if (field.kind === 'list') input[field.key] = String(input[field.key] ?? '').split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
      if (field.kind === 'json') input[field.key] = JSON.parse(String(input[field.key] || '[]'));
    }
    if (action.id === 'new_session') { this.sessionId = await this.adapter.createSession(); return { sessionId: this.sessionId }; }
    if (action.id === 'import_session' || action.id === 'switch_session') { this.sessionId = await this.adapter.importSession(String(input.sessionPath)); return { sessionId: this.sessionId }; }
    if (!this.sessionId && !['get_state', 'get_available_models', 'get_commands', 'get_resources', 'get_auth', 'get_packages', 'list_sessions', 'login', 'logout', 'set_api_key', 'install_package', 'remove_package', 'update_package'].includes(action.id)) throw new Error('请先选择会话 / Select a session first.');
    if (action.id === 'clone' || action.id === 'fork') {
      const fork = await this.adapter.forkSession(this.sessionId, action.id === 'fork' ? String(input.entryId) : undefined);
      this.sessionId = fork.id; return fork;
    }
    return this.adapter.command(this.sessionId || undefined, action.id, input);
  }
}
