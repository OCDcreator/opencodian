import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Setting } from 'obsidian';

import {
  type BackendConfigRecoveryStore,
  backendRecoveryIdentity,
  createBackendConfigRecoveryStore,
  recoveryRevision,
} from '../../../../src/core/agents/backend/configuration/BackendConfigRecoveryStore';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsOpenCode2Section } from '../../../../src/features/settings/backends/opencode/SettingsBackendSection';
import { setLocale, t } from '../../../../src/i18n';

/**
 * Machine-local recovery for the saved OpenCode 2 configContent, exercised
 * through the real advanced-tab section UI (behavior, not source-text
 * contracts): a successful apply archives the displaced SAVED version
 * (including an empty overlay), the history list is metadata-only, restore
 * re-enters the validated apply path behind the listed-revision CAS guard,
 * everything without an absolute vault path stays fail-closed, and an
 * unreadable recovery base degrades the list instead of crashing the tab.
 *
 * The recovery store base dirs below are task-created fixtures under the
 * worktree's node_modules/.cache and are intentionally left in place as
 * proof; no test here performs any cleanup or deletion.
 */

// Mirrors the production OC2_RECOVERY_KEY / target kind in SettingsBackendSection.
const RECOVERY_KEY = 'opencode2-config-content';
const RECOVERY_TARGET = 'opencode2:configContent';
const SECRET = 'sk-opencodian-fixture-secret-42';
const PREVIOUS = [
  '// previous saved version kept for restore',
  '{',
  '  // untracked comment that must survive round trips',
  '  "customSetting": { "untouched": true },',
  `  "secretToken": "${SECRET}",`,
  '  "model": "openai/model-a",',
  '}',
].join('\n');

let fixtureSequence = 0;

/** Task-created private fixture root (0700, symlink-free, never cleaned up). */
function newRecoveryFixture(): { base: string; vaultA: string; vaultB: string } {
  const root = join(process.cwd(), 'node_modules', '.cache', 'opencodian-oc2-recovery-fixture');
  const base = join(root, `${Date.now().toString(36)}-${(fixtureSequence += 1)}-${randomUUID().slice(0, 8)}`);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  return { base, vaultA: join(base, 'vault-a'), vaultB: join(base, 'vault-b') };
}

function identityFor(vaultPath: string): string {
  const identity = backendRecoveryIdentity(vaultPath, RECOVERY_TARGET);
  if (!identity) throw new Error(`fixture vault path must produce an identity: ${vaultPath}`);
  return identity;
}

function storeFor(base: string): BackendConfigRecoveryStore {
  return createBackendConfigRecoveryStore({ baseDir: base });
}

interface FixtureAdapter {
  readConfigurationSummary: jest.Mock;
  readManagementCatalog: jest.Mock;
  getModelSelectorProviders: jest.Mock;
  validateConfigContent: jest.Mock;
  setMcpConnection: jest.Mock;
}

interface FixtureHost {
  settings: typeof DEFAULT_SETTINGS;
  saveSettings: jest.Mock;
  agentServiceRegistry: { get: (kind: 'opencode2') => FixtureAdapter };
  vaultPath?: string;
  recoveryBaseDir?: string;
}

function createHost(
  configContent: string,
  recoveryBaseDir: string,
  vaultPath?: string,
): { host: FixtureHost; adapter: FixtureAdapter } {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  settings.backendSettings.opencode2.configContent = configContent;
  const adapter: FixtureAdapter = {
    readConfigurationSummary: jest.fn().mockResolvedValue({ version: '2.0.18', providers: 1, models: 2, agents: 1, skills: 1, commands: 0, mcp: 1 }),
    readManagementCatalog: jest.fn().mockResolvedValue({ integrations: [], mcp: [], agents: [], skills: [], commands: [], plugins: [] }),
    getModelSelectorProviders: jest.fn().mockResolvedValue([{ id: 'openai', name: 'OpenAI', models: [{ id: 'model-a', name: 'Model A' }, { id: 'model-b', name: 'Model B' }] }]),
    // Real adapter contract: validation applies the configuration to the plugin settings.
    validateConfigContent: jest.fn(async (value: string) => { settings.backendSettings.opencode2.configContent = value; }),
    setMcpConnection: jest.fn().mockResolvedValue(undefined),
  };
  const host: FixtureHost = {
    settings,
    saveSettings: jest.fn().mockResolvedValue(undefined),
    agentServiceRegistry: { get: () => adapter },
    vaultPath,
    recoveryBaseDir,
  };
  return { host, adapter };
}

/**
 * The shared obsidian mock's Setting never appends button DOM. Upgrade it for
 * this suite so recovery rows render real name/description/button elements and
 * restore clicks flow through the production handlers.
 */
function upgradeSettingDom(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting & { __name?: string }, name: string) {
    (this as Setting & { __name?: string }).__name = name;
    const info = document.createElement('div');
    info.className = 'setting-item-name';
    info.textContent = name;
    this.settingEl.insertBefore(info, this.controlEl);
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (this: Setting, desc: string) {
    const description = document.createElement('div');
    description.className = 'setting-item-description';
    description.textContent = desc;
    this.settingEl.appendChild(description);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting, callback: (component: {
    setButtonText: (text: string) => unknown;
    onClick: (handler: () => void) => unknown;
  }) => unknown) {
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    this.controlEl.appendChild(button);
    const component = {
      setButtonText: (text: string) => { button.textContent = text; return component; },
      onClick: (handler: () => void) => { button.addEventListener('click', () => { void handler(); }); return component; },
    };
    callback(component);
    return this;
  });
}

function mount(host: FixtureHost, tab: string): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  new SettingsOpenCode2Section({ plugin: host, requestDisplayRefresh: jest.fn(), renderTitleSettings: jest.fn() }).attachTabbed(container, tab);
  return container;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function edit(container: HTMLElement, selector: string, value: string): void {
  const input = container.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)!;
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

function applyButton(container: HTMLElement): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>('[data-action="apply"]')!;
}

function applyDraftFrom(container: HTMLElement): void {
  edit(container, '[data-config-path="compaction.auto"] select', 'false');
  applyButton(container).click();
}

function recoveryDisclosure(container: HTMLElement): HTMLDetailsElement {
  const disclosure = container.querySelector<HTMLDetailsElement>('details.opencodian-opencode2-recovery');
  expect(disclosure).not.toBeNull();
  return disclosure!;
}

/** Reopens the disclosure through its real toggle listener (reopen refreshes the list). */
function openRecovery(container: HTMLElement): void {
  const disclosure = recoveryDisclosure(container);
  disclosure.open = true;
  disclosure.dispatchEvent(new Event('toggle'));
}

function restoreButtons(container: HTMLElement): NodeListOf<HTMLButtonElement> {
  return container.querySelectorAll<HTMLButtonElement>('.opencodian-opencode2-recovery-list .setting-item button');
}

function confirmButton(container: HTMLElement): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>('.opencodian-opencode2-recovery-confirm button')!;
}

function recoveryFeedback(container: HTMLElement): string {
  return recoveryDisclosure(container).querySelector('.opencodian-opencode2-recovery-body [role="status"]')?.textContent ?? '';
}

describe('OpenCode 2 saved configuration recovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLocale('en');
    upgradeSettingDom();
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('archives the previous saved configContent machine-locally after a successful apply', async () => {
    const { base, vaultA } = newRecoveryFixture();
    const identity = identityFor(vaultA);
    const { host, adapter } = createHost(PREVIOUS, base, vaultA);
    const advanced = mount(host, 'advanced');
    await settle();

    applyDraftFrom(advanced);
    await settle();

    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    const store = storeFor(base);
    const entries = store.list(identity, RECOVERY_KEY);
    expect(entries).toHaveLength(1);
    expect('raw' in entries[0]).toBe(false); // listings are metadata only
    expect(entries[0].revision).toBe(recoveryRevision(PREVIOUS));
    expect(store.read(identity, RECOVERY_KEY, entries[0].index)?.raw).toBe(PREVIOUS); // byte-identical, comments included

    const directory = join(base, identity);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    const slotFiles = readdirSync(directory).filter((name) => name.endsWith('.json'));
    expect(slotFiles).toHaveLength(1);
    expect(statSync(join(directory, slotFiles[0])).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(directory, slotFiles[0]), 'utf8')).toContain(SECRET); // secret lives only in the machine-local archive
  });

  it('restores a previous saved version through the section UI on a remounted host and archives the displaced state', async () => {
    const { base, vaultA } = newRecoveryFixture();
    const identity = identityFor(vaultA);
    const first = createHost(PREVIOUS, base, vaultA);
    const advanced = mount(first.host, 'advanced');
    await settle();
    applyDraftFrom(advanced);
    await settle();
    const edited = first.host.settings.backendSettings.opencode2.configContent;
    expect(edited).not.toBe(PREVIOUS);

    // Remount with a brand-new host (plugin restart): history must survive on disk.
    const second = createHost(edited, base, vaultA);
    const remounted = mount(second.host, 'advanced');
    await settle();
    openRecovery(remounted);
    const buttons = restoreButtons(remounted);
    expect(buttons).toHaveLength(1);
    const previewText = recoveryDisclosure(remounted).textContent;
    expect(previewText).not.toContain(SECRET); // metadata-only preview
    expect(previewText).toContain(t('settings.opencode2.workspace.recoveryEntryDetail', { bytes: Buffer.byteLength(PREVIOUS) })); // byte size + hidden note, never contents

    buttons[0].click();
    expect(remounted.querySelector('.opencodian-opencode2-recovery-confirm')).not.toBeNull();
    confirmButton(remounted).click();
    await settle();

    expect(second.host.settings.backendSettings.opencode2.configContent).toBe(PREVIOUS); // comments and unknown fields intact
    expect(second.adapter.validateConfigContent).toHaveBeenCalledTimes(1);
    expect(second.adapter.validateConfigContent.mock.calls[0][0]).toBe(PREVIOUS);
    expect(second.host.saveSettings).toHaveBeenCalledTimes(1);

    // Undo-of-undo: the successful restore archived the displaced current version.
    const store = storeFor(base);
    const entries = store.list(identity, RECOVERY_KEY);
    expect(entries).toHaveLength(2);
    expect(store.read(identity, RECOVERY_KEY, 1)?.raw).toBe(edited);
    expect(store.read(identity, RECOVERY_KEY, 2)?.raw).toBe(PREVIOUS);
  });

  it('refuses a stale restore when the saved configuration changed after the list was rendered', async () => {
    const { base, vaultA } = newRecoveryFixture();
    const identity = identityFor(vaultA);
    const first = createHost(PREVIOUS, base, vaultA);
    const advanced = mount(first.host, 'advanced');
    await settle();
    applyDraftFrom(advanced);
    await settle();
    const edited = first.host.settings.backendSettings.opencode2.configContent;

    const second = createHost(edited, base, vaultA);
    const remounted = mount(second.host, 'advanced');
    await settle();
    openRecovery(remounted);
    expect(restoreButtons(remounted)).toHaveLength(1);

    // The saved overlay changed elsewhere after this list was rendered.
    second.host.settings.backendSettings.opencode2.configContent = '{"external":true}';

    restoreButtons(remounted)[0].click();
    confirmButton(remounted).click();
    await settle();

    // The queued toggle refresh no longer clears feedback: the refusal message
    // persists, and the CAS re-check applied and archived nothing.
    expect(recoveryFeedback(remounted)).toContain(t('settings.backend.recovery.stale'));
    expect(second.adapter.validateConfigContent).not.toHaveBeenCalled(); // no adapter apply
    expect(second.host.saveSettings).not.toHaveBeenCalled(); // no save
    const store = storeFor(base);
    const entries = store.list(identity, RECOVERY_KEY);
    expect(entries).toHaveLength(1); // refused restore archived nothing
    expect(store.read(identity, RECOVERY_KEY, 1)?.raw).toBe(PREVIOUS);
  });

  it('does not archive history when the save fails after validation', async () => {
    const { base, vaultA } = newRecoveryFixture();
    const identity = identityFor(vaultA);
    const { host, adapter } = createHost(PREVIOUS, base, vaultA);
    host.saveSettings = jest.fn().mockRejectedValue(new Error('disk full'));
    const advanced = mount(host, 'advanced');
    await settle();

    applyDraftFrom(advanced);
    await settle();

    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(host.settings.backendSettings.opencode2.configContent).toBe(PREVIOUS); // rolled back to the saved state
    expect(storeFor(base).list(identity, RECOVERY_KEY)).toHaveLength(0);
    expect(existsSync(join(base, identity))).toBe(false); // nothing persisted for the failed save
  });
});

describe('OpenCode 2 recovery failure semantics and isolation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLocale('en');
    upgradeSettingDom();
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('keeps the saved configuration and reports history-unavailable when the recovery store write fails', async () => {
    const { base, vaultA } = newRecoveryFixture();
    const identity = identityFor(vaultA);
    // Task-created broken slot layout: slot directories are not readable slots,
    // so the listing stays empty and healthy, but the store's oldest-first
    // rotation cannot replace occupied slot 5, so archive() fails on the real
    // fs only AFTER validate + save succeeded. An unsafe base (regular file /
    // symlink) is refused at listing time by the frozen store; this test pins
    // the section's post-save semantics.
    const directory = join(base, identity);
    mkdirSync(directory, { mode: 0o700 });
    mkdirSync(join(directory, `${RECOVERY_KEY}-4.json`), { mode: 0o700 });
    mkdirSync(join(directory, `${RECOVERY_KEY}-5.json`), { mode: 0o700 });
    writeFileSync(join(directory, `${RECOVERY_KEY}-5.json`, 'occupied'), 'jammed', { mode: 0o600 });
    const { host, adapter } = createHost(PREVIOUS, base, vaultA);
    const advanced = mount(host, 'advanced');
    await settle();
    expect(storeFor(base).list(identity, RECOVERY_KEY)).toHaveLength(0); // mount-time listing stays healthy

    applyDraftFrom(advanced);
    await settle();

    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
    expect(host.saveSettings).toHaveBeenCalledTimes(1); // the configuration itself was persisted
    const applied = host.settings.backendSettings.opencode2.configContent;
    expect(applied).not.toBe(PREVIOUS); // the new value stays in memory, not rolled back
    expect(applied).toContain('"auto": false');
    const status = advanced.querySelector('.opencodian-opencode2-save-status')?.textContent ?? '';
    expect(status).toContain(t('settings.opencode2.workspace.applied')); // the apply itself succeeded
    expect(status).toContain(t('settings.backend.recovery.historyUnavailable')); // saved, but the backup failed
    expect(status).not.toContain(t('settings.opencode2.workspace.applyFailed')); // never claims the configuration change failed
  });

  it('degrades the history list to an unavailable state instead of crashing when the recovery base is a regular file', async () => {
    const { base } = newRecoveryFixture();
    // Task-created REGULAR FILE as the recovery base: the frozen store refuses
    // it at listing time, and the section must keep the advanced tab usable.
    const blockedBase = join(base, 'blocked');
    writeFileSync(blockedBase, 'not a directory', { mode: 0o600 });
    const { host } = createHost(PREVIOUS, blockedBase, join(base, 'vault-a'));
    const advanced = mount(host, 'advanced'); // must not throw
    await settle();

    recoveryDisclosure(advanced); // the disclosure still renders
    expect(recoveryFeedback(advanced)).toContain(t('settings.backend.recovery.unavailable'));
    expect(restoreButtons(advanced)).toHaveLength(0);
    expect(advanced.querySelector('.opencodian-opencode2-recovery-list .setting-item')).toBeNull();

    openRecovery(advanced);
    await settle();
    expect(recoveryFeedback(advanced)).toContain(t('settings.backend.recovery.unavailable')); // still degraded after reopen
    expect(applyButton(advanced)).not.toBeNull(); // the advanced tab itself stays usable
  });

  it('stays fail-closed without an absolute vault path: no history is written or listed', async () => {
    const { base } = newRecoveryFixture();
    const { host, adapter } = createHost(PREVIOUS, base); // no vault path -> no identity
    const advanced = mount(host, 'advanced');
    await settle();
    expect(restoreButtons(advanced)).toHaveLength(0);
    expect(advanced.querySelector('.opencodian-opencode2-recovery-list p')).not.toBeNull();

    applyDraftFrom(advanced);
    await settle();

    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
    expect(host.saveSettings).toHaveBeenCalledTimes(1); // the apply itself is unaffected
    expect(readdirSync(base)).toEqual([]); // no machine-local namespace was created
    expect(restoreButtons(advanced)).toHaveLength(0);
  });

  it('restores the initial empty overlay after the first saved edit', async () => {
    // An empty saved overlay is a valid snapshot value: the first saved edit
    // archives '' and a restore returns the vault to ''.
    const { base, vaultA } = newRecoveryFixture();
    const identity = identityFor(vaultA);
    const first = createHost('', base, vaultA);
    const advanced = mount(first.host, 'advanced');
    await settle();
    applyDraftFrom(advanced);
    await settle();
    const applied = first.host.settings.backendSettings.opencode2.configContent;
    expect(applied).toContain('"auto": false');

    const store = storeFor(base);
    expect(store.list(identity, RECOVERY_KEY)).toHaveLength(1);
    expect(store.read(identity, RECOVERY_KEY, 1)?.raw).toBe('');

    const second = createHost(applied, base, vaultA);
    const remounted = mount(second.host, 'advanced');
    await settle();
    openRecovery(remounted);
    expect(restoreButtons(remounted)).toHaveLength(1);
    restoreButtons(remounted)[0].click();
    confirmButton(remounted).click();
    await settle();

    expect(second.host.settings.backendSettings.opencode2.configContent).toBe('');
    expect(second.adapter.validateConfigContent.mock.calls[0][0]).toBe('');
  });

  it('never shares recovery history between different vaults in the same machine-local base', async () => {
    const { base, vaultA, vaultB } = newRecoveryFixture();
    const identityA = identityFor(vaultA);
    const identityB = identityFor(vaultB);
    expect(identityA).toMatch(/^[0-9a-f]{64}$/);
    expect(identityB).toMatch(/^[0-9a-f]{64}$/);
    expect(identityA).not.toBe(identityB);

    const first = createHost(PREVIOUS, base, vaultA);
    const advanced = mount(first.host, 'advanced');
    await settle();
    applyDraftFrom(advanced);
    await settle();

    // A second vault on the same machine sees no history and cannot restore vault A's snapshot.
    const second = createHost(first.host.settings.backendSettings.opencode2.configContent, base, vaultB);
    const other = mount(second.host, 'advanced');
    await settle();
    openRecovery(other);
    expect(restoreButtons(other)).toHaveLength(0);
    expect(readdirSync(base)).toEqual([identityA]);
    expect(existsSync(join(base, identityB))).toBe(false);
  });
});
