import { Setting } from 'obsidian';

import { t, type TranslationKey } from '../../../../i18n';

export interface DshMcpPairRow { name: string; value: string }
export interface DshMcpPairOptions {
  container: HTMLElement;
  label: string;
  description: string;
  initial: DshMcpPairRow[];
  onChange: (rows: DshMcpPairRow[]) => void;
}
export interface DshMcpRuntimeStatusPort {
  getSessionMcpStatus?(sessionId?: string): Promise<{
    servers: Array<{ name: string; connected?: boolean | null; status?: string; state?: string; toolCount?: number }>;
  }>;
}

/** Shared masked controls for both stdio environment and HTTP headers. */
export function renderDshMcpPairRows(options: DshMcpPairOptions): void {
  const { container, label, description, initial, onChange } = options;
  let rows = initial.map((row) => ({ ...row }));
  const holder = container.createDiv({ cls: 'opencodian-dsh-mcp-pairs' });
  new Setting(holder).setName(label).setDesc(description);
  const rowsHolder = holder.createDiv({ cls: 'opencodian-dsh-kv-rows' });
  const render = (): void => {
    rowsHolder.empty();
    rows.forEach((row, index) => {
      const rowEl = rowsHolder.createDiv({ cls: 'opencodian-dsh-kv-row' });
      const input = (type: 'text' | 'password', key: 'name' | 'value', placeholder: string): void => {
        const element = rowEl.createEl('input', { type, attr: { 'aria-label': `${label} · ${placeholder}`, placeholder } });
        element.value = row[key];
        element.addEventListener('input', () => { row[key] = element.value; onChange(rows); });
      };
      input('text', 'name', t('settings.agent.dsh.launch.env.name.placeholder'));
      input('password', 'value', t('settings.agent.dsh.launch.env.value.placeholder'));
      const remove = rowEl.createEl('button', { text: t('settings.agent.dsh.launch.env.remove'), attr: { type: 'button', 'aria-label': `${t('settings.agent.dsh.launch.env.remove')} ${index + 1}` } });
      remove.addEventListener('click', () => {
        rows = rows.filter((_, candidate) => candidate !== index);
        render();
        onChange(rows);
      });
    });
    const add = rowsHolder.createEl('button', { text: t('settings.agent.dsh.launch.env.add'), attr: { type: 'button' } });
    add.addEventListener('click', () => { rows = [...rows, { name: '', value: '' }]; render(); });
  };
  render();
}

/** Native-only overrides stay in the owning draft while ACP displays them read-only. */
export function renderDshMcpAdvanced(
  editor: HTMLElement,
  entry: Record<string, unknown>,
  change: (key: string, value: unknown) => void,
  isNative: () => boolean,
): void {
  const native = isNative();
  const update = (key: string, value: unknown): void => { if (native && isNative()) change(key, value); };
  const disclosure = editor.createEl('details', { cls: 'opencodian-dsh-native-disclosure' });
  disclosure.createEl('summary', { text: t('settings.dsh.mcpAdvanced.title') });
  const body = disclosure.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
  body.createEl('p', { cls: 'setting-item-description', text: t(native ? 'settings.dsh.mcpAdvanced.desc' : 'settings.dsh.mcpAdvanced.acpUnavailable') });
  if (entry.type !== 'http') {
    new Setting(body).setName(t('settings.dsh.mcpAdvanced.cwd')).setDesc(t(native ? 'settings.dsh.mcpAdvanced.cwd.desc' : 'settings.dsh.mcpAdvanced.savedForNative'))
      .addText((input) => {
        input.setValue(typeof entry.cwd === 'string' ? entry.cwd : '').setPlaceholder(t('settings.agent.dsh.workingDirectory.vault'))
          .onChange((value) => update('cwd', value.trim() || undefined));
        input.inputEl.disabled = !native;
        input.inputEl.setAttribute('aria-label', t('settings.dsh.mcpAdvanced.cwd'));
      });
  }
  const number = (options: {
    key: string; label: TranslationKey; inherited: number; minimum: number; value: unknown;
    change: (value: number | undefined) => void;
  }): void => {
    const { key, label, inherited, minimum, value, change } = options;
    new Setting(body).setName(t(label)).setDesc(t(native ? 'settings.dsh.mcpAdvanced.inherit' : 'settings.dsh.mcpAdvanced.savedForNative', { value: String(inherited) }))
      .addText((input) => {
        input.setValue(typeof value === 'number' ? String(value) : '').setPlaceholder(String(inherited));
        input.inputEl.disabled = !native;
        input.inputEl.type = 'number';
        input.inputEl.min = String(minimum);
        input.inputEl.step = '1';
        input.inputEl.setAttribute('aria-label', t(label));
        input.inputEl.dataset.dshMcpAdvanced = key;
        input.onChange((text) => change(text.trim() ? Number(text) : undefined));
      });
  };
  const choice = (options: { label: TranslationKey; value: unknown; inherited: boolean; change: (value: boolean | undefined) => void }): void => {
    new Setting(body).setName(t(options.label)).addDropdown((dropdown) => {
      dropdown.addOption('inherit', t('settings.dsh.mcpAdvanced.inheritBoolean', { value: t(options.inherited ? 'settings.dsh.mcpAdvanced.enabled' : 'settings.dsh.mcpAdvanced.disabled') }));
      dropdown.addOption('true', t('settings.dsh.mcpAdvanced.enabled'));
      dropdown.addOption('false', t('settings.dsh.mcpAdvanced.disabled'));
      dropdown.setValue(typeof options.value === 'boolean' ? String(options.value) : 'inherit');
      dropdown.selectEl.disabled = !native;
      dropdown.selectEl.setAttribute('aria-label', t(options.label));
      dropdown.onChange((value) => options.change(value === 'inherit' ? undefined : value === 'true'));
    });
  };
  number({ key: 'toolCallTimeoutMs', label: 'settings.dsh.mcpAdvanced.timeout', inherited: 60000, minimum: 1, value: entry.toolCallTimeoutMs, change: (value) => update('toolCallTimeoutMs', value) });
  number({ key: 'maxInstructionBytes', label: 'settings.dsh.mcpAdvanced.instructions', inherited: 32768, minimum: 0, value: entry.maxInstructionBytes, change: (value) => update('maxInstructionBytes', value) });
  choice({ label: 'settings.dsh.mcpAdvanced.failOnStartup', value: entry.failOnStartupError, inherited: true, change: (value) => update('failOnStartupError', value) });
  const reconnect: Record<string, unknown> = entry.reconnect && typeof entry.reconnect === 'object' && !Array.isArray(entry.reconnect)
    ? { ...entry.reconnect as Record<string, unknown> } : {};
  const updateReconnect = (key: string, value: unknown): void => {
    if (value === undefined) delete reconnect[key];
    else reconnect[key] = value;
    update('reconnect', Object.keys(reconnect).length ? { ...reconnect } : undefined);
  };
  choice({ label: 'settings.dsh.mcpAdvanced.reconnect', value: reconnect.enabled, inherited: true, change: (value) => updateReconnect('enabled', value) });
  number({ key: 'initialDelayMs', label: 'settings.dsh.mcpAdvanced.initialDelay', inherited: 500, minimum: 0, value: reconnect.initialDelayMs, change: (value) => updateReconnect('initialDelayMs', value) });
  number({ key: 'maxDelayMs', label: 'settings.dsh.mcpAdvanced.maxDelay', inherited: 30000, minimum: 0, value: reconnect.maxDelayMs, change: (value) => updateReconnect('maxDelayMs', value) });
  number({ key: 'maxAttempts', label: 'settings.dsh.mcpAdvanced.maxAttempts', inherited: 10, minimum: 0, value: reconnect.maxAttempts, change: (value) => updateReconnect('maxAttempts', value) });
}

/** Reads evidence rather than treating successful mounting as an online check. */
export function renderDshMcpStatus(group: HTMLElement, options: {
  adapter?: DshMcpRuntimeStatusPort;
  native: boolean;
  isCurrent: () => boolean;
}): void {
  const { adapter } = options;
  const available = options.native && !!adapter?.getSessionMcpStatus;
  const row = new Setting(group).setName(t('settings.dsh.mcpAdvanced.status')).setDesc(t('settings.dsh.mcpAdvanced.status.desc'));
  const output = row.infoEl.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite' } });
  row.addButton((button) => button.setButtonText(t('settings.dsh.mcpAdvanced.refresh')).setDisabled(!available).onClick(async () => {
    button.setDisabled(true);
    output.setText(t('settings.dsh.mcpAdvanced.reading'));
    try {
      if (!available || !adapter?.getSessionMcpStatus) throw new Error('Unavailable');
      const snapshot = await adapter.getSessionMcpStatus();
      if (!options.isCurrent() || !group.contains(output)) return;
      output.empty();
      if (!snapshot.servers.length) output.setText(t('settings.dsh.mcpAdvanced.noMounted'));
      for (const server of snapshot.servers) {
        const state = server.connected === true ? 'settings.dsh.mcpAdvanced.connected'
          : server.connected === false ? 'settings.dsh.mcpAdvanced.disconnected' : 'settings.dsh.mcpAdvanced.connectionUnknown';
        output.createEl('p', { text: `${server.name} · ${t(state)}` });
      }
    } catch {
      if (options.isCurrent()) output.setText(t('settings.dsh.mcpAdvanced.readFailed'));
    } finally { button.setDisabled(false); }
  }));
  if (!available) output.setText(t('settings.dsh.mcpAdvanced.unavailable'));
}
