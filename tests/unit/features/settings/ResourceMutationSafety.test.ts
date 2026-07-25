/* eslint-disable @typescript-eslint/no-explicit-any, max-lines, max-lines-per-function -- DOM-driven mutation safety matrix keeps the seven backend operations and cancellation paths auditable together. */

import { Modal, Setting } from 'obsidian';

import { SettingsClaudeResourcesSection } from '../../../../src/features/settings/SettingsClaudeResourcesSection';
import { SettingsCodexResourcesSection } from '../../../../src/features/settings/SettingsCodexResourcesSection';
import { setLocale, t } from '../../../../src/i18n';

jest.mock('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery', () => ({
  discoverClaudeCommandResources: jest.fn().mockResolvedValue([]),
  createClaudeCommandResource: jest.fn(),
  updateClaudeCommandResource: jest.fn(),
  deleteClaudeCommandResource: jest.fn(),
  catalogClaudeCommandResourceHistory: jest.fn().mockResolvedValue({ status: 'success', targets: [] }),
  restoreClaudeCommandResourceHistoryEntry: jest.fn(),
  readClaudeCommandResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '# command\n', revision: { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 10, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.claude/commands/review.md' }),
  validateClaudeCommandContent: jest.fn().mockReturnValue(null),
}));

jest.mock('../../../../src/core/agents/backend/ClaudeProjectSkillDiscovery', () => ({
  discoverClaudeSkillResources: jest.fn().mockResolvedValue([]),
  createClaudeSkillResource: jest.fn(),
  updateClaudeSkillResource: jest.fn(),
  deleteClaudeSkillResource: jest.fn(),
  catalogClaudeSkillResourceHistory: jest.fn().mockResolvedValue({ status: 'success', targets: [] }),
  restoreClaudeSkillResourceHistoryEntry: jest.fn(),
  readClaudeSkillResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '# skill\n', revision: { canonicalPath: '/vault/.claude/skills/review/SKILL.md', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.claude/skills/review/SKILL.md' }),
  validateClaudeSkillContent: jest.fn().mockReturnValue(null),
}));

jest.mock('../../../../src/core/agents/backend/ClaudeProjectAgentDiscovery', () => ({
  discoverClaudeAgentResources: jest.fn().mockResolvedValue([]),
  createClaudeAgentResource: jest.fn(),
  updateClaudeAgentResource: jest.fn(),
  deleteClaudeAgentResource: jest.fn(),
  catalogClaudeAgentResourceHistory: jest.fn().mockResolvedValue({ status: 'success', targets: [] }),
  restoreClaudeAgentResourceHistoryEntry: jest.fn(),
  readClaudeAgentResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '# agent\n', revision: { canonicalPath: '/vault/.claude/agents/review.md', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.claude/agents/review.md' }),
  validateClaudeAgentContent: jest.fn().mockReturnValue(null),
}));

jest.mock('../../../../src/core/agents/backend/CodexProjectResourceDiscovery', () => ({
  discoverCodexSkillResources: jest.fn().mockResolvedValue([]),
  createCodexSkillResource: jest.fn(),
  updateCodexSkillResource: jest.fn(),
  deleteCodexSkillResource: jest.fn(),
  catalogCodexSkillResourceHistory: jest.fn().mockResolvedValue({ status: 'success', targets: [] }),
  restoreCodexSkillResourceHistoryEntry: jest.fn(),
  discoverCodexAgentResources: jest.fn().mockResolvedValue([]),
  createCodexAgentResource: jest.fn(),
  updateCodexAgentResource: jest.fn(),
  deleteCodexAgentResource: jest.fn(),
  catalogCodexAgentResourceHistory: jest.fn().mockResolvedValue({ status: 'success', targets: [] }),
  restoreCodexAgentResourceHistoryEntry: jest.fn(),
  readCodexSkillResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '# skill\n', revision: { canonicalPath: '/vault/.agents/skills/review/SKILL.md', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.agents/skills/review/SKILL.md' }),
  readCodexAgentResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: 'name = "review"\n', revision: { canonicalPath: '/vault/.codex/agents/review.toml', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.codex/agents/review.toml' }),
  validateCodexSkillContent: jest.fn().mockReturnValue(null),
  validateCodexAgentContent: jest.fn().mockReturnValue(null),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function makePlugin(): any {
  return {
    app: { vault: { adapter: { basePath: '/vault' } } },
    settings: { backendSettings: { claudeCode: { settingSources: ['project'] }, codex: {} } },
    invalidateSlashCommandCatalog: jest.fn(),
    agentServiceRegistry: { get: jest.fn() },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function captureModals(): Modal[] {
  const modals: Modal[] = [];
  jest.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal) { modals.push(this); });
  jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
  return modals;
}

function captureTextInput(): { set(value: string): void } {
  const setters: Array<(value: string) => void> = [];
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, callback: any) {
    const control = {
      onChange(setter: (value: string) => void) { setters.push(setter); return control; },
      setValue() { return control; },
    };
    callback(control);
    return this;
  });
  return { set(value: string): void { setters.at(-1)?.(value); } };
}

const claudeRevision = { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 10, sha256: 'a'.repeat(64) };
const codexRevision = { canonicalPath: '/vault/.agents/skills/review/SKILL.md', mtimeMs: 1, size: 10, sha256: 'b'.repeat(64) };

function claudeCommandItem() {
  return { name: 'review', description: 'Review', filePath: claudeRevision.canonicalPath, relativePath: '.claude/commands/review.md', readonly: false, scope: 'project', revision: claudeRevision };
}

function codexSkillItem() {
  return { name: 'review', description: 'Review', skillMdPath: codexRevision.canonicalPath, relativePath: '.agents/skills/review', readonly: false, scope: 'project', revision: codexRevision };
}

function historyTarget(canonicalTarget: string, backend: 'claude' | 'codex', kind: 'command' | 'skill') {
  return {
    canonicalTarget,
    backend,
    scope: 'project' as const,
    kind,
    format: kind === 'command' ? 'markdown' as const : 'markdown' as const,
    entries: [{ identity: `${backend}-history`, archiveKind: 'overwrite' as const, timestamp: 1, size: 10 }],
  };
}

describe('resource mutation safety — DOM deferred promises', () => {
  beforeEach(() => {
    setLocale('en');
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('guards Claude Create against double activation and restores button state after a thrown write', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const pending = deferred<never>();
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([claudeCommandItem()]);
    (command.createClaudeCommandResource as jest.Mock).mockReturnValue(pending.promise);
    const modals = captureModals();
    const input = captureTextInput();
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-create') as HTMLButtonElement).click();
    input.set('review');
    const button = modals.at(-1)?.contentEl.querySelector<HTMLButtonElement>('.mod-cta');
    if (!button) throw new Error('Claude create button missing');
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(command.createClaudeCommandResource).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(t('settings.claudeCode.resources.creating'));
    pending.reject(new Error('create failed'));
    await flush();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(t('settings.claudeCode.resources.create'));
  });

  it('guards Claude Delete against double activation and restores icon state after a rejected write', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const pending = deferred<never>();
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([claudeCommandItem()]);
    (command.deleteClaudeCommandResource as jest.Mock).mockReturnValue(pending.promise);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    const button = container.querySelector<HTMLButtonElement>('.opencodian-claude-resource-delete');
    if (!button) throw new Error('Claude delete button missing');
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(command.deleteClaudeCommandResource).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(t('settings.claudeCode.resources.deleting'));
    pending.reject(new Error('delete failed'));
    await flush();
    expect(button.disabled).toBe(false);
    expect(button.querySelector('svg[data-icon="trash"]')).not.toBeNull();
  });

  it('guards Claude Restore against double activation and restores button state after a rejected write', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const pending = deferred<never>();
    (command.catalogClaudeCommandResourceHistory as jest.Mock).mockResolvedValue({ status: 'success', targets: [historyTarget(claudeRevision.canonicalPath, 'claude', 'command')] });
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([claudeCommandItem()]);
    (command.restoreClaudeCommandResourceHistoryEntry as jest.Mock).mockReturnValue(pending.promise);
    const modals = captureModals();
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-history') as HTMLButtonElement).click();
    await flush();
    const modal = modals.at(-1);
    const button = modal?.contentEl.querySelector<HTMLButtonElement>('.opencodian-resource-history-restore');
    if (!button) throw new Error('Claude restore button missing');
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(command.restoreClaudeCommandResourceHistoryEntry).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(t('settings.claudeCode.resources.restoring'));
    pending.reject(new Error('restore failed'));
    await flush();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(t('settings.claudeCode.resources.restore'));
  });

  it('guards Codex Create against double activation and restores button state after a thrown write', async () => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    const pending = deferred<never>();
    (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([codexSkillItem()]);
    (codex.createCodexSkillResource as jest.Mock).mockReturnValue(pending.promise);
    const modals = captureModals();
    const input = captureTextInput();
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-create') as HTMLButtonElement).click();
    input.set('review');
    const button = modals.at(-1)?.contentEl.querySelector<HTMLButtonElement>('.mod-cta');
    if (!button) throw new Error('Codex create button missing');
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(codex.createCodexSkillResource).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(t('settings.codex.resources.creating'));
    pending.reject(new Error('create failed'));
    await flush();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(t('settings.codex.resources.create'));
  });

  it('guards Codex Delete against double activation and restores icon state after a resolved write', async () => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    const pending = deferred<{ status: 'success'; targetPath: string }>();
    (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([codexSkillItem()]);
    (codex.deleteCodexSkillResource as jest.Mock).mockReturnValue(pending.promise);
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    const button = container.querySelector<HTMLButtonElement>('[data-codex-resource-group="skill"] .opencodian-codex-resource-delete');
    if (!button) throw new Error('Codex delete button missing');
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(codex.deleteCodexSkillResource).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(t('settings.codex.resources.deleting'));
    pending.resolve({ status: 'success', targetPath: codexRevision.canonicalPath });
    await flush();
    expect(button.disabled).toBe(false);
    expect(button.querySelector('svg[data-icon="trash"]')).not.toBeNull();
  });

  it('guards Codex Restore against double activation and restores button state after a rejected write', async () => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    const pending = deferred<never>();
    (codex.catalogCodexSkillResourceHistory as jest.Mock).mockResolvedValue({ status: 'success', targets: [historyTarget(codexRevision.canonicalPath, 'codex', 'skill')] });
    (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([codexSkillItem()]);
    (codex.restoreCodexSkillResourceHistoryEntry as jest.Mock).mockReturnValue(pending.promise);
    const modals = captureModals();
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-history') as HTMLButtonElement).click();
    await flush();
    const modal = modals.at(-1);
    const button = modal?.contentEl.querySelector<HTMLButtonElement>('.opencodian-resource-history-restore');
    if (!button) throw new Error('Codex restore button missing');
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(codex.restoreCodexSkillResourceHistoryEntry).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(t('settings.codex.resources.restoring'));
    pending.reject(new Error('restore failed'));
    await flush();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(t('settings.codex.resources.restore'));
  });

  it.each([false, undefined] as const)('fails closed for Claude Delete confirmation=%s', async (answer) => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([claudeCommandItem()]);
    (window.confirm as jest.Mock).mockReturnValue(answer as unknown as boolean);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-delete') as HTMLButtonElement).click();
    await flush();
    expect(command.deleteClaudeCommandResource).toHaveBeenCalledTimes(0);
  });

  it.each([false, undefined] as const)('fails closed for Claude Restore confirmation=%s', async (answer) => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    (command.catalogClaudeCommandResourceHistory as jest.Mock).mockResolvedValue({ status: 'success', targets: [historyTarget(claudeRevision.canonicalPath, 'claude', 'command')] });
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([claudeCommandItem()]);
    (window.confirm as jest.Mock).mockReturnValue(answer as unknown as boolean);
    const modals = captureModals();
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-history') as HTMLButtonElement).click();
    await flush();
    (modals.at(-1)?.contentEl.querySelector('.opencodian-resource-history-restore') as HTMLButtonElement).click();
    await flush();
    expect(command.restoreClaudeCommandResourceHistoryEntry).toHaveBeenCalledTimes(0);
  });

  it.each([false, undefined] as const)('fails closed for Codex Delete confirmation=%s', async (answer) => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([codexSkillItem()]);
    (window.confirm as jest.Mock).mockReturnValue(answer as unknown as boolean);
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-delete') as HTMLButtonElement).click();
    await flush();
    expect(codex.deleteCodexSkillResource).toHaveBeenCalledTimes(0);
  });

  it.each([false, undefined] as const)('fails closed for Codex Restore confirmation=%s', async (answer) => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    (codex.catalogCodexSkillResourceHistory as jest.Mock).mockResolvedValue({ status: 'success', targets: [historyTarget(codexRevision.canonicalPath, 'codex', 'skill')] });
    (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([codexSkillItem()]);
    (window.confirm as jest.Mock).mockReturnValue(answer as unknown as boolean);
    const modals = captureModals();
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-history') as HTMLButtonElement).click();
    await flush();
    (modals.at(-1)?.contentEl.querySelector('.opencodian-resource-history-restore') as HTMLButtonElement).click();
    await flush();
    expect(codex.restoreCodexSkillResourceHistoryEntry).toHaveBeenCalledTimes(0);
  });
});
