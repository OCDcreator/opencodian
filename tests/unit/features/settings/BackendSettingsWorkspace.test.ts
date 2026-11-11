import { getDefaultBackendSettings, type OpenCodianSettings } from '../../../../src/core/types/settings';
import {
  captureBackendRecoveryPoint,
  readBackendRecoveryPoint,
  renderBackendSettingsWorkspace,
  restoreBackendRecoveryPoint,
  saveBackendRecoveryPoint,
} from '../../../../src/features/settings/controls/BackendSettingsWorkspace';
import { t } from '../../../../src/i18n';

function fixture() {
  const settings: Pick<OpenCodianSettings, 'backendSettings' | 'backendSettingsRecoveryPoints'> = {
    backendSettings: getDefaultBackendSettings(),
  };
  return { settings, saveSettings: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => { document.body.innerHTML = ''; });

it('saves only explicit backend defaults and excludes credentials, environment and raw overlays', () => {
  const host = fixture();
  host.settings.backendSettings.codex.apiKey = 'secret-codex-key';
  host.settings.backendSettings.claudeCode.env = { ANTHROPIC_API_KEY: 'secret-env-key' };
  host.settings.backendSettings.opencode2.password = 'secret-service-password';
  host.settings.backendSettings.opencode2.configContent = '{"apiKey":"secret-overlay-key"}';
  host.settings.backendSettings.opencode2.baseUrl = 'https://secret-user:secret-password@example.com';
  for (const backend of ['codex', 'claude-code', 'opencode2', 'pi', 'zcode', 'dsh'] as const) {
    const point = captureBackendRecoveryPoint(host.settings, backend, 10)!;
    expect(point.savedAt).toBe(10);
    expect(JSON.stringify(point)).not.toContain('secret-');
    expect(point.values).not.toHaveProperty('apiKey');
    expect(point.values).not.toHaveProperty('env');
    expect(point.values).not.toHaveProperty('password');
    expect(point.values).not.toHaveProperty('configContent');
  }
});

it('restores a working default without replacing live settings objects or changing another backend', async () => {
  const host = fixture();
  const liveClaude = host.settings.backendSettings.claudeCode;
  const liveCodex = host.settings.backendSettings.codex;
  await saveBackendRecoveryPoint(host, 'claude-code');
  liveClaude.effort = 'high';
  liveClaude.env = { ANTHROPIC_API_KEY: 'new-private-key' };
  liveCodex.model = 'unchanged-codex-model';
  await restoreBackendRecoveryPoint(host, 'claude-code');
  expect(host.settings.backendSettings.claudeCode).toBe(liveClaude);
  expect(host.settings.backendSettings.codex).toBe(liveCodex);
  expect(liveClaude.effort).toBe('medium');
  expect(liveClaude.env).toEqual({ ANTHROPIC_API_KEY: 'new-private-key' });
  expect(liveCodex.model).toBe('unchanged-codex-model');
  expect(host.saveSettings).toHaveBeenCalledTimes(2);
});

it('retains a recovery point after settings are serialized and loaded again', async () => {
  const host = fixture();
  host.settings.backendSettings.pi.provider = 'provider-one';
  host.settings.backendSettings.pi.model = 'model-one';
  await saveBackendRecoveryPoint(host, 'pi');
  const reloaded = { ...host, settings: JSON.parse(JSON.stringify(host.settings)) as typeof host.settings };
  reloaded.settings.backendSettings.pi.provider = 'provider-two';
  reloaded.settings.backendSettings.pi.model = 'model-two';
  await restoreBackendRecoveryPoint(reloaded, 'pi');
  expect(reloaded.settings.backendSettings.pi.provider).toBe('provider-one');
  expect(reloaded.settings.backendSettings.pi.model).toBe('model-one');
});

it('cannot inject extra settings or secrets through a modified recovery point', async () => {
  const host = fixture();
  host.settings.backendSettings.codex.apiKey = 'real-current-key';
  host.settings.backendSettingsRecoveryPoints = { codex: {
    version: 1, savedAt: 10, values: { model: 'working-model', apiKey: 'injected-key', env: { SECRET: 'x' }, unknown: true },
  } };
  expect(readBackendRecoveryPoint(host.settings, 'codex')?.values).toEqual({ model: 'working-model' });
  await restoreBackendRecoveryPoint(host, 'codex');
  expect(host.settings.backendSettings.codex.model).toBe('working-model');
  expect(host.settings.backendSettings.codex.apiKey).toBe('real-current-key');
  expect(host.settings.backendSettings.codex).not.toHaveProperty('unknown');
});

it('reverts in-memory defaults and recovery history when persistence fails', async () => {
  const host = fixture();
  await saveBackendRecoveryPoint(host, 'codex');
  const previous = host.settings.backendSettingsRecoveryPoints;
  host.settings.backendSettings.codex.model = 'new-model';
  host.saveSettings.mockRejectedValue(new Error('disk full'));
  await expect(saveBackendRecoveryPoint(host, 'codex')).rejects.toThrow('disk full');
  expect(host.settings.backendSettingsRecoveryPoints).toBe(previous);
  const live = host.settings.backendSettings.codex;
  await expect(restoreBackendRecoveryPoint(host, 'codex')).rejects.toThrow('disk full');
  expect(host.settings.backendSettings.codex).toBe(live);
  expect(live.model).toBe('new-model');
});

it('has a reachable two-action restore path and an honest empty state', async () => {
  const host = fixture();
  const container = document.body.createDiv();
  const onRestore = jest.fn();
  renderBackendSettingsWorkspace(container, 'zcode', host, onRestore);
  expect(container.dataset.backendWorkspace).toBe('zcode');
  const [save, restore] = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  expect(restore.disabled).toBe(true);
  save.click();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  expect(restore.disabled).toBe(false);
  host.settings.backendSettings.zcode.mode = 'yolo';
  restore.click();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  expect(host.settings.backendSettings.zcode.mode).toBe('');
  expect(onRestore).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="status"]')?.textContent).toContain('restored');
});

it('shows an actionable missing-program state and restores automatic discovery without changing other defaults', async () => {
  const host = fixture();
  host.settings.backendSettings.codex.executablePath = '/nonexistent/opencodian-acceptance-cli';
  host.settings.backendSettings.codex.model = 'keep-this-model';
  const container = document.body.createDiv();
  const refresh = jest.fn();
  renderBackendSettingsWorkspace(container, 'codex', host, refresh);
  const alert = container.querySelector<HTMLElement>('[data-backend-installation="missing"]')!;
  expect(alert.textContent).toContain('not found');
  expect(alert.querySelector('button')?.textContent).toBe('Restore automatic discovery');
  alert.querySelector<HTMLButtonElement>('button')!.click();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  expect(host.settings.backendSettings.codex.executablePath).toBe('');
  expect(host.settings.backendSettings.codex.model).toBe('keep-this-model');
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('does not expose a recovery UI for retired or unsupported backends', () => {
  const host = fixture();
  const container = document.body.createDiv();
  renderBackendSettingsWorkspace(container, 'opencode', host, jest.fn());
  expect(container.childElementCount).toBe(0);
  expect(captureBackendRecoveryPoint(host.settings, 'copilot')).toBeUndefined();
});

describe('DSH connection backup component', () => {
  it('names its purpose, exposes its exact scope and disables restore until a backup exists', () => {
    const host = fixture();
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, 'dsh', host, jest.fn());
    const details = container.querySelector<HTMLDetailsElement>('.opencodian-backend-recovery')!;
    const [save, restore] = Array.from(details.querySelectorAll<HTMLButtonElement>('button'));

    expect(container.dataset.backendWorkspace).toBe('dsh');
    expect(details.open).toBe(false);
    expect(details.querySelector('.opencodian-dsh-backup-title')?.textContent).toBe(t('settings.dsh.backup.title'));
    expect(details.querySelector('.opencodian-dsh-backup-status')?.textContent).toBe(t('settings.dsh.backup.empty'));
    expect(details.textContent).toContain(t('settings.dsh.backup.scope'));
    expect(details.textContent).toContain(t('settings.dsh.backup.storage'));
    expect(details.textContent).toContain(t('settings.dsh.backup.effect'));
    expect(container.querySelector('.opencodian-backend-workspace-context')).toBeNull();
    expect(save.textContent).toBe(t('settings.dsh.backup.save'));
    expect(restore.textContent).toBe(t('settings.dsh.backup.restore'));
    expect(restore.disabled).toBe(true);
    expect(host.saveSettings).not.toHaveBeenCalled();
  });

  it('disables both actions during save and immediately refreshes the saved timestamp and available restore', async () => {
    const host = fixture();
    let finish!: () => void;
    host.saveSettings.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, 'dsh', host, jest.fn());
    const [save, restore] = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    save.click();

    expect(save.disabled).toBe(true);
    expect(restore.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t('settings.dsh.backup.saving'));
    finish();
    for (let i = 0; i < 8; i++) await Promise.resolve();

    const point = readBackendRecoveryPoint(host.settings, 'dsh')!;
    expect(save.disabled).toBe(false);
    expect(restore.disabled).toBe(false);
    expect(save.textContent).toBe(t('settings.dsh.backup.update'));
    expect(container.querySelector('.opencodian-dsh-backup-status')?.textContent).toBe(t('settings.dsh.backup.savedAt', {
      date: new Date(point.savedAt).toLocaleString(),
    }));
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t('settings.dsh.backup.saved'));
    expect(Object.keys(point.values).sort()).toEqual(['executablePath', 'profile', 'transport', 'workingDirectory']);
  });

  it('retains the empty state after a failed save and permits retry without exposing the underlying error', async () => {
    const host = fixture();
    host.saveSettings.mockRejectedValueOnce(new Error('private credential-like error text'));
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, 'dsh', host, jest.fn());
    const [save, restore] = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    save.click();
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(readBackendRecoveryPoint(host.settings, 'dsh')).toBeUndefined();
    expect(container.querySelector('.opencodian-dsh-backup-status')?.textContent).toBe(t('settings.dsh.backup.empty'));
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t('settings.dsh.backup.failed'));
    expect(container.querySelector('[role="status"]')?.getAttribute('data-state')).toBe('error');
    expect(container.textContent).not.toContain('private credential-like');
    expect(save.disabled).toBe(false);
    expect(restore.disabled).toBe(true);
    save.click();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(restore.disabled).toBe(false);
    expect(host.saveSettings).toHaveBeenCalledTimes(2);
  });

  it('restores only the existing DSH connection snapshot and keeps excluded fields and other backend identities', async () => {
    const host = fixture();
    await saveBackendRecoveryPoint(host, 'dsh');
    const dsh = host.settings.backendSettings.dsh;
    const codex = host.settings.backendSettings.codex;
    dsh.transport = 'acp';
    dsh.args = ['--keep-argument'];
    dsh.env = { KEEP_THIS_VALUE: 'not-backed-up' };
    const refresh = jest.fn();
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, 'dsh', host, refresh);
    const restore = container.querySelectorAll<HTMLButtonElement>('button')[1];
    expect(restore.disabled).toBe(false);
    restore.click();
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(dsh.transport).toBe('native');
    expect(dsh.args).toEqual(['--keep-argument']);
    expect(dsh.env).toEqual({ KEEP_THIS_VALUE: 'not-backed-up' });
    expect(host.settings.backendSettings.dsh).toBe(dsh);
    expect(host.settings.backendSettings.codex).toBe(codex);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t('settings.dsh.backup.restored'));
  });

  it('keeps the old backup and timestamp when updating fails', async () => {
    const host = fixture();
    await saveBackendRecoveryPoint(host, 'dsh');
    const previous = host.settings.backendSettingsRecoveryPoints;
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, 'dsh', host, jest.fn());
    const statusBefore = container.querySelector('.opencodian-dsh-backup-status')?.textContent;
    host.settings.backendSettings.dsh.transport = 'acp';
    host.saveSettings.mockRejectedValueOnce(new Error('disk full'));
    const [save, restore] = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    save.click();
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(host.settings.backendSettingsRecoveryPoints).toBe(previous);
    expect(readBackendRecoveryPoint(host.settings, 'dsh')?.values.transport).toBe('native');
    expect(container.querySelector('.opencodian-dsh-backup-status')?.textContent).toBe(statusBefore);
    expect(save.textContent).toBe(t('settings.dsh.backup.update'));
    expect(restore.disabled).toBe(false);
  });

  it('rolls back a failed restore, keeps actions available and does not refresh the workspace', async () => {
    const host = fixture();
    await saveBackendRecoveryPoint(host, 'dsh');
    host.settings.backendSettings.dsh.transport = 'acp';
    host.saveSettings.mockRejectedValueOnce(new Error('disk full'));
    const refresh = jest.fn();
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, 'dsh', host, refresh);
    const [save, restore] = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    restore.click();
    expect(save.disabled).toBe(true);
    expect(restore.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t('settings.dsh.backup.restoring'));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(host.settings.backendSettings.dsh.transport).toBe('acp');
    expect(refresh).not.toHaveBeenCalled();
    expect(restore.disabled).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t('settings.dsh.backup.failed'));
  });
});
