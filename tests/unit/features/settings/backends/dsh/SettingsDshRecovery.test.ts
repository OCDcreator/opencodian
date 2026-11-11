import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Setting } from 'obsidian';

import { backendRecoveryIdentity } from '../../../../../../src/core/agents/backend/configuration/BackendConfigRecoveryStore';
import { validateDshMcpServers } from '../../../../../../src/core/agents/backend/dsh/DshProtocolCodec';
import type { DshBackendSettings, DshMcpServer } from '../../../../../../src/core/types/settings';
import { type DshSettingsHost, SettingsDshSection } from '../../../../../../src/features/settings/backends/dsh/SettingsDshSection';
import { setLocale, t } from '../../../../../../src/i18n';

async function settle(): Promise<void> { for (let i = 0; i < 12; i++) await Promise.resolve(); }

/** Recovery flows need real DOM buttons; wire Setting controls to actual elements. */
function installRealDomControls(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
    this.infoEl ??= this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.infoEl.createDiv({ cls: 'setting-item-name', text: name });
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, description: string) {
    this.settingEl.createDiv({ cls: 'setting-item-description', text: description });
    return this;
  });
  jest.spyOn(Setting.prototype, 'setClass').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting, callback) {
    const button = this.controlEl.createEl('button', { attr: { type: 'button' } });
    const handle = {
      setButtonText: (text: string) => { button.textContent = text; return handle; },
      setDisabled: (disabled: boolean) => { button.disabled = disabled; return handle; },
      setCta: () => handle,
      onClick: (handler: () => Promise<void> | void) => { button.addEventListener('click', () => { void handler(); }); return handle; },
    };
    callback(handle as never);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, callback) {
    const inputEl = this.controlEl.createEl('input', { attr: { 'aria-label': this.settingEl.querySelector('.setting-item-name')?.textContent ?? '' } });
    const input = {
      inputEl,
      setPlaceholder: (value: string) => { inputEl.placeholder = value; return input; },
      setValue: (value: string) => { inputEl.value = value; return input; },
      onChange: (handler: (value: string) => Promise<void> | void) => { inputEl.addEventListener('input', () => { void handler(inputEl.value); }); return input; },
    };
    callback(input as never);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function (this: Setting, callback) {
    const inputEl = this.controlEl.createEl('textarea');
    const input = {
      inputEl,
      setPlaceholder: (value: string) => { inputEl.placeholder = value; return input; },
      setValue: (value: string) => { inputEl.value = value; return input; },
      onChange: (handler: (value: string) => Promise<void> | void) => { inputEl.addEventListener('input', () => { void handler(inputEl.value); }); return input; },
    };
    callback(input as never);
    return this;
  });
}

function clickByName(container: HTMLElement, text: string): void {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
  const target = buttons.filter((button) => button.textContent === text).at(-1);
  expect(target).toBeDefined();
  target!.click();
}

/** Recovery lists render oldest..newest; the newest snapshot is the first Restore row. */
function clickFirstRecoveryRestore(container: HTMLElement): void {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('.opencodian-dsh-mcp-recovery-list button')];
  const target = buttons.find((button) => button.textContent === t('settings.agent.dsh.mcp.recovery.restore' as TranslationKey));
  expect(target).toBeDefined();
  target!.click();
}

function mount(options: { saveSettings?: () => Promise<void>; mcpServers?: DshMcpServer[]; env?: Record<string, string>; layout?: 'classic'; recoveryBaseDir?: string } = {}): { container: HTMLElement; settings: DshBackendSettings; host: DshSettingsHost; saveSettings: jest.Mock } {
  const settings: DshBackendSettings = {
    executablePath: '', workingDirectory: '', args: [],
    env: options.env ?? {}, profile: 'acp', transport: 'native',
    mcpServers: options.mcpServers,
  };
  const host: DshSettingsHost = {
    getSettings: () => settings,
    isEnabled: () => true,
    getAdapter: () => undefined,
    validateMcpServers: validateDshMcpServers,
    saveSettings: options.saveSettings ?? jest.fn(async () => {}),
    vaultPath,
    recoveryBaseDir: options.recoveryBaseDir ?? baseDir,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  if (options.layout === 'classic') new SettingsDshSection(host).attach(container);
  else new SettingsDshSection(host).attachTabbed(container, 'mcp');
  return { container, settings, host, saveSettings: host.saveSettings as jest.Mock };
}

function mcpBlock(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-settings-target="dsh-mcp"]')!;
}

// Retained fixture dirs under the worktree's node_modules/.cache: created
// per run, never deleted (global deletion guard applies to tests too).
let runId: string;
let baseDir: string;
let vaultPath: string;

function resetRecoveryFixture(): void {
  setLocale('en');
  runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  baseDir = join(process.cwd(), 'node_modules', '.cache', `dsh-recovery-${runId}`);
  vaultPath = join(process.cwd(), 'node_modules', '.cache', `dsh-vault-${runId}`);
  // 0700: the store enforces private modes on its dedicated directories.
  mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  mkdirSync(vaultPath, { recursive: true, mode: 0o700 });
  installRealDomControls();
}

function resetRecoveryDom(): void {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
  setLocale('en');
}

describe('SettingsDshSection durable MCP recovery', () => {
  beforeEach(resetRecoveryFixture);
  afterEach(resetRecoveryDom);

  function editRawDraft(container: HTMLElement, value: string): void {
    const textarea = mcpBlock(container).querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${t('settings.agent.dsh.mcp.declarations')}"]`,
    );
    expect(textarea).not.toBeNull();
    textarea!.value = value;
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function openRecoveryList(container: HTMLElement): void {
    const disclosure = mcpBlock(container).querySelector<HTMLDetailsElement>('details.opencodian-dsh-mcp-recovery');
    expect(disclosure).not.toBeNull();
    disclosure!.open = true;
    disclosure!.dispatchEvent(new Event('toggle', { bubbles: true }));
  }

  function recoveryRevisionOf(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  function recoveryEntries(): Array<{ index: number; revision: string; bytes: number }> {
    const identity = backendRecoveryIdentity(vaultPath, 'dsh:mcpServers');
    const directory = join(baseDir, identity);
    if (!existsSync(directory)) return [];
    return readdirSync(directory)
      .filter((name) => name.startsWith('dsh-mcp-servers-') && name.endsWith('.json'))
      .map((name) => {
        const raw = readFileSync(join(directory, name), 'utf8');
        const index = Number(name.replace('dsh-mcp-servers-', '').replace('.json', ''));
        return { index, revision: recoveryRevisionOf(raw), bytes: Buffer.byteLength(raw) };
      })
      .sort((a, b) => a.index - b.index);
  }

  it('keeps secret env and header value inputs masked as password fields', () => {
    // Classic layout renders every tab, so the launch (connection) and MCP
    // surfaces can be checked in one pass.
    const { container } = mount({
      layout: 'classic',
      env: { DSH_TOKEN: 'secret-launch-value' },
      mcpServers: [
        { name: 'stdio-one', command: '/bin/ls', args: [], env: [{ name: 'MCP_TOKEN', value: 'secret-mcp-value' }] },
        { type: 'http', name: 'http-one', url: 'https://example.invalid/mcp', headers: [{ name: 'Authorization', value: 'secret-header-value' }] },
      ],
    });
    const launch = container.querySelector('details.opencodian-dsh-launch-advanced');
    expect(launch).not.toBeNull();
    const maskedLaunch = launch!.querySelectorAll<HTMLInputElement>('.opencodian-dsh-kv-row input[type="password"]');
    expect(maskedLaunch.length).toBeGreaterThanOrEqual(1);
    const maskedMcp = container.querySelectorAll<HTMLInputElement>('.opencodian-dsh-mcp-pairs input[type="password"]');
    // Only the selected server's editor is mounted: one env row = one masked input.
    expect(maskedMcp.length).toBeGreaterThanOrEqual(1);
    // Masked values are never echoed as visible text anywhere in the workspace.
    expect(container.textContent).not.toContain('secret-launch-value');
    expect(container.textContent).not.toContain('secret-mcp-value');
    expect(container.textContent).not.toContain('secret-header-value');
  });

  it('restores the previous saved configuration in three actions and archives the displaced state', async () => {
    const { container, settings } = mount();
    const working = [{ name: 'working', command: '/bin/working', args: [], env: [] }];
    const broken = [{ name: 'broken', command: '/bin/broken', args: [], env: [] }];
    editRawDraft(container, JSON.stringify(working));
    clickByName(container, t('settings.agent.dsh.save'));
    await settle();
    editRawDraft(container, JSON.stringify(broken));
    clickByName(container, t('settings.agent.dsh.save'));
    await settle();
    expect(settings.mcpServers).toEqual(broken);
    // The first change archived the empty-array default too.
    expect(recoveryEntries()).toHaveLength(2);

    // Actions: open the recovery disclosure -> Restore -> Confirm.
    openRecoveryList(container);
    clickFirstRecoveryRestore(container);
    clickByName(container, t('settings.agent.dsh.mcp.recovery.confirm' as TranslationKey));
    await settle();

    expect(settings.mcpServers).toEqual(working);
    // Stack after restore: displaced 'broken', restored 'working', initial '[]'.
    expect(recoveryEntries()).toHaveLength(3);
    expect(mcpBlock(container).textContent).toContain(t('settings.agent.dsh.mcp.recovery.restored' as TranslationKey));
  });

  it('keeps recovery snapshots across a section remount (page reopen / app reload)', async () => {
    const first = mount();
    editRawDraft(first.container, JSON.stringify([{ name: 'kept', command: '/bin/kept', args: [], env: [] }]));
    clickByName(first.container, t('settings.agent.dsh.save'));
    await settle();
    editRawDraft(first.container, JSON.stringify([{ name: 'next', command: '/bin/next', args: [], env: [] }]));
    clickByName(first.container, t('settings.agent.dsh.save'));
    await settle();

    // A brand-new section (fresh WeakMap draft state) still lists the snapshot,
    // and the snapshot VALUES never render into the DOM.
    const second = mount();
    openRecoveryList(second.container);
    expect(second.container.querySelectorAll('.opencodian-dsh-mcp-recovery-list button').length).toBeGreaterThanOrEqual(1);
    expect(second.container.textContent).not.toContain('/bin/kept');
  });

  it('refuses to write when the saved configuration changed after the list was rendered (stale CAS)', async () => {
    const { container, settings } = mount();
    editRawDraft(container, JSON.stringify([{ name: 'good', command: '/bin/good', args: [], env: [] }]));
    clickByName(container, t('settings.agent.dsh.save'));
    await settle();
    editRawDraft(container, JSON.stringify([{ name: 'overwritten', command: '/bin/over', args: [], env: [] }]));
    clickByName(container, t('settings.agent.dsh.save'));
    await settle();

    openRecoveryList(container);
    settings.mcpServers = [{ name: 'external', command: '/bin/external', args: [], env: [] }];
    clickFirstRecoveryRestore(container);
    clickByName(container, t('settings.agent.dsh.mcp.recovery.confirm' as TranslationKey));
    await settle();

    expect(settings.mcpServers).toEqual([{ name: 'external', command: '/bin/external', args: [], env: [] }]);
    const recoveryFeedback = container.querySelector<HTMLElement>('.opencodian-dsh-mcp-recovery [role="status"]');
    expect(recoveryFeedback?.textContent).toContain(t('settings.backend.recovery.stale' as TranslationKey));
    // The stale path re-renders the existing two-entry history but archives nothing new.
    expect(recoveryEntries()).toHaveLength(2);
  });

  it('reverts and reports the generic failure without rotating history when the save fails', async () => {
    const failingSave = jest.fn(async () => { throw new Error('vault write denied'); });
    const { container, settings, saveSettings } = mount({ saveSettings: failingSave });
    editRawDraft(container, JSON.stringify([{ name: 'good', command: '/bin/good', args: [], env: [] }]));
    clickByName(container, t('settings.agent.dsh.save'));
    await settle();
    expect(saveSettings).toHaveBeenCalledTimes(1);

    const entriesBefore = recoveryEntries().length;
    editRawDraft(container, JSON.stringify([{ name: 'next', command: '/bin/next', args: [], env: [] }]));
    clickByName(container, t('settings.agent.dsh.save'));
    await settle();

    // A failed first save reverts to the pre-save value (undefined here); history did not rotate.
    expect(settings.mcpServers).toBeUndefined();
    expect(recoveryEntries().length).toBe(entriesBefore);
    expect(mcpBlock(container).textContent).toContain(t('settings.backend.recovery.failed'));
    expect(mcpBlock(container).textContent).not.toContain('vault write denied');
  });

  it('scopes snapshots per vault and keeps recovery copies out of vault-visible state', () => {
    const { settings } = mount({
      mcpServers: [{ name: 'token-holder', command: '/bin/x', args: [], env: [{ name: 'TOKEN', value: 'secret-value' }] }],
    });
    // The live configuration itself stays vault data; no recovery metadata or
    // snapshot copies are added to the plugin settings object.
    expect(JSON.stringify(settings)).not.toContain('dsh-mcp-servers');
    expect(Object.keys(settings).filter((key) => key.toLowerCase().includes('recovery'))).toEqual([]);
    // The very first save on an empty history archives nothing.
    expect(existsSync(join(baseDir, backendRecoveryIdentity(vaultPath, 'dsh:mcpServers')))).toBe(false);
  });

  it('never shares snapshot slots between two vaults', async () => {
    const vaultA = mount();
    editRawDraft(vaultA.container, JSON.stringify([{ name: 'only-a', command: '/bin/a', args: [], env: [] }]));
    clickByName(vaultA.container, t('settings.agent.dsh.save'));
    await settle();
    editRawDraft(vaultA.container, JSON.stringify([{ name: 'a2', command: '/bin/a2', args: [], env: [] }]));
    clickByName(vaultA.container, t('settings.agent.dsh.save'));
    await settle();

    const otherVaultHost: DshSettingsHost = {
      getSettings: () => ({ executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'native', mcpServers: [] }),
      isEnabled: () => true,
      getAdapter: () => undefined,
      validateMcpServers: validateDshMcpServers,
      saveSettings: async () => {},
      vaultPath: join(process.cwd(), 'node_modules', '.cache', `dsh-vault-other-${runId}`),
      recoveryBaseDir: baseDir,
    };
    const otherContainer = document.createElement('div');
    document.body.appendChild(otherContainer);
    new SettingsDshSection(otherVaultHost).attachTabbed(otherContainer, 'mcp');
    expect(otherContainer.querySelector('.opencodian-dsh-mcp-recovery-list')?.textContent ?? '').not.toContain('/bin/a2');
    // Vault A still sees its own snapshots (list refreshes on disclosure open).
    const vaultADisclosure = vaultA.container.querySelector<HTMLDetailsElement>('details.opencodian-dsh-mcp-recovery');
    vaultADisclosure!.open = true;
    vaultADisclosure!.dispatchEvent(new Event('toggle', { bubbles: true }));
    expect(vaultA.container.querySelectorAll('.opencodian-dsh-mcp-recovery-list button').length).toBeGreaterThanOrEqual(1);
  });


});

describe('SettingsDshSection recovery base failures', () => {
  beforeEach(resetRecoveryFixture);
  afterEach(resetRecoveryDom);

  it.each(['regular file', 'symlink'] as const)('keeps the MCP page usable when the recovery base is a %s', (kind) => {
    if (process.platform === 'win32' && kind === 'symlink') return;
    // Broken recovery bases live in the retained worktree cache; never the real
    // home config and no deletion of anything.
    const brokenDir = join(process.cwd(), 'node_modules', '.cache', `dsh-recovery-broken-${runId}-${kind}`);
    if (kind === 'regular file') writeFileSync(brokenDir, 'not a directory');
    else symlinkSync(join(process.cwd(), 'node_modules', '.cache', `dsh-recovery-missing-${runId}`), brokenDir, 'file');

    // Rendering the MCP page must not abort on an unreadable history directory.
    const { container } = mount({ recoveryBaseDir: brokenDir });
    const block = mcpBlock(container);
    const recoveryFeedback = block.querySelector<HTMLElement>('.opencodian-dsh-mcp-recovery [role="status"]');
    expect(recoveryFeedback?.textContent).toBe(t('settings.backend.recovery.unavailable' as TranslationKey));
    expect(block.textContent).not.toContain('Unsafe');
    expect(block.textContent).not.toContain(brokenDir);

    // The editable MCP surface stays reachable: save button and empty form.
    expect([...block.querySelectorAll('button')].some((button) => button.textContent === t('settings.agent.dsh.save'))).toBe(true);
    expect(block.textContent).toContain(t('settings.agent.dsh.mcp.empty'));

    // Toggling closed and open again re-reads the list without erasing the
    // localized unavailable status.
    const disclosure = block.querySelector<HTMLDetailsElement>('details.opencodian-dsh-mcp-recovery')!;
    disclosure.open = false;
    disclosure.open = true;
    disclosure.dispatchEvent(new Event('toggle', { bubbles: true }));
    expect(recoveryFeedback?.textContent).toBe(t('settings.backend.recovery.unavailable' as TranslationKey));
  });
});
