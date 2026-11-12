/* eslint-disable max-lines -- Shared recovery and task-control cascade regressions use one DOM fixture family. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getDefaultBackendSettings, type OpenCodianSettings } from '../../../../src/core/types/settings';
import {
  captureBackendRecoveryPoint,
  finalizeBackendTaskWorkspace,
  readBackendRecoveryPoint,
  renderBackendSettingsWorkspace,
  renderBackendTaskHeading,
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

it('scopes the DSH A task layout and heading to the four refactored backends only', () => {
  const host = fixture();
  for (const backend of ['claude-code', 'codex', 'pi', 'zcode'] as const) {
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, backend, host, jest.fn());
    renderBackendTaskHeading(container, 'Task title');
    expect(container.classList.contains('opencodian-backend-task-workspace')).toBe(true);
    expect(container.querySelector('.opencodian-backend-task-title')?.textContent).toBe('Task title');
  }
  for (const backend of ['opencode2', 'dsh'] as const) {
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, backend, host, jest.fn());
    renderBackendTaskHeading(container, 'Task title');
    expect(container.classList.contains('opencodian-backend-task-workspace')).toBe(false);
    expect(container.querySelector('.opencodian-backend-task-title')).toBeNull();
  }
});

it.each([
  ['claude-code', 'conversation', 'connection'],
  ['codex', 'conversation', 'connection'],
  ['pi', 'model', 'connection'],
  ['zcode', 'chat', 'installation'],
] as const)('puts %s recovery after its connection content and starts other tasks with their title', (backend, task, connection) => {
  const host = fixture();
  for (const [taskId, hasRecovery] of [[task, false], [connection, true]] as const) {
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, backend, host, jest.fn());
    const bar = container.querySelector('.opencodian-backend-workspace-bar')!;
    renderBackendTaskHeading(container, 'Task title');
    const section = container.createDiv({ cls: 'backend-section-content' });
    section.createEl('h3', { text: 'Task title' });
    section.createEl('h4', { text: 'Task title' });
    section.createEl('h4', { text: 'Distinct field group' });

    finalizeBackendTaskWorkspace(container, taskId);

    expect(container.classList.contains('opencodian-backend-task-workspace')).toBe(true);
    expect(container.firstElementChild).toBe(container.querySelector('.opencodian-backend-task-header'));
    expect(container.querySelector('.backend-section-content > h4')?.textContent).toBe('Distinct field group');
    expect(Array.from(container.querySelectorAll('h3, h4')).filter(heading => heading.textContent === 'Task title')).toHaveLength(0);
    expect(container.querySelector('.opencodian-backend-workspace-bar')).toBe(hasRecovery ? bar : null);
    expect(container.lastElementChild === bar).toBe(hasRecovery);
  }
});

it('preserves classic headings and the OpenCode 2 / DSH workspace chrome', () => {
  const host = fixture();
  for (const backend of ['opencode2', 'dsh'] as const) {
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, backend, host, jest.fn());
    const bar = container.querySelector('.opencodian-backend-workspace-bar');
    const content = container.createDiv();
    content.createEl('h3', { text: 'Task title' });
    content.createEl('h4', { text: 'Task title' });
    finalizeBackendTaskWorkspace(container, 'conversation');
    expect(container.firstElementChild).toBe(bar);
    expect(content.querySelectorAll('h3, h4')).toHaveLength(2);
  }

  const classic = document.body.createDiv();
  renderBackendSettingsWorkspace(classic, 'pi', host, jest.fn());
  classic.createDiv().createEl('h3', { text: 'Classic task title' });
  finalizeBackendTaskWorkspace(classic, 'model');
  expect(classic.classList.contains('opencodian-backend-task-workspace')).toBe(true);
  expect(classic.querySelector('h3')?.textContent).toBe('Classic task title');
});

it('wins the shared 13px/700 cascade only inside the four-backend task workspace', () => {
  const readRule = (file: string, selector: string): string => {
    const css = readFileSync(join(process.cwd(), 'src/style', file), 'utf8');
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start) + 1);
  };
  const hostRule = readRule(
    'components/settings-layout-contract.css',
    '.opencodian-settings .opencodian-settings-content-shell .setting-item .setting-item-name',
  );
  const taskRule = readRule(
    'components/settings-backend-workspace.css',
    '.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace .setting-item-name',
  );
  expect(taskRule).toContain('font-size: 15px;');
  expect(taskRule).toContain('font-weight: 600;');
  expect(taskRule).not.toContain('!important');
  const style = document.head.createEl('style', { text: `${hostRule}\n${taskRule}` });
  try {
    const renderName = (taskWorkspace: boolean): HTMLElement => {
      const host = document.body.createDiv({ cls: 'opencodian-settings' });
      const shell = host.createDiv({ cls: 'opencodian-settings-content-shell' });
      const workspace = shell.createDiv({ cls: 'opencodian-backend-workspace' });
      workspace.classList.toggle('opencodian-backend-task-workspace', taskWorkspace);
      workspace.dataset.backendWorkspace = 'claude-code';
      return workspace.createDiv({ cls: 'setting-item' }).createDiv({ cls: 'setting-item-name' });
    };
    const taskName = renderName(true);
    const otherBackendName = renderName(false);
    expect(getComputedStyle(taskName).fontSize).toBe('15px');
    expect(getComputedStyle(taskName).fontWeight).toBe('600');
    expect(getComputedStyle(otherBackendName).fontSize).toBe('13px');
    expect(getComputedStyle(otherBackendName).fontWeight).toBe('700');
  } finally {
    style.remove();
  }
});

it('keeps dropdown height intrinsic in four-backend columns without changing horizontal workspaces', () => {
  const readRule = (file: string, selector: string): string => {
    const css = readFileSync(join(process.cwd(), 'src/style', file), 'utf8');
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start) + 1);
  };
  const hostRule = readRule(
    'components/settings-dropdown.css',
    '.setting-item-control > .opencodian-settings-dropdown',
  );
  const columnRule = readRule(
    'components/settings-backend-workspace.css',
    '.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item-control',
  );
  const taskRule = readRule(
    'components/settings-backend-workspace.css',
    '.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item-control > .opencodian-settings-dropdown',
  );
  expect(taskRule).not.toContain('!important');
  const style = document.head.createEl('style', { text: `${hostRule}\n${columnRule}\n${taskRule}` });
  try {
    const renderDropdown = (taskWorkspace: boolean): { control: HTMLElement; dropdown: HTMLElement; trigger: HTMLElement } => {
      const host = document.body.createDiv({ cls: 'opencodian-settings' });
      const workspace = host.createDiv({ cls: 'opencodian-backend-workspace' });
      workspace.classList.toggle('opencodian-backend-task-workspace', taskWorkspace);
      workspace.dataset.backendWorkspace = 'claude-code';
      const control = workspace.createDiv({ cls: 'setting-item-control' });
      const dropdown = control.createDiv({ cls: 'opencodian-settings-dropdown' });
      const trigger = dropdown.createEl('button', { cls: 'opencodian-settings-dropdown-trigger' });
      return { control, dropdown, trigger };
    };
    const task = renderDropdown(true);
    const other = renderDropdown(false);
    expect(getComputedStyle(task.control).flexDirection).toBe('column');
    expect(getComputedStyle(task.dropdown).flexBasis).toBe('auto');
    expect(getComputedStyle(task.dropdown).flexGrow).toBe('0');
    expect(getComputedStyle(task.dropdown).flexShrink).toBe('0');
    const unstyledDirection = getComputedStyle(document.createElement('div')).flexDirection;
    expect(getComputedStyle(other.control).flexDirection).toBe(unstyledDirection);
    expect(getComputedStyle(other.dropdown).flexBasis).toBe('240px');
    expect(getComputedStyle(other.dropdown).flexShrink).toBe('1');
  } finally {
    style.remove();
  }
});

it('wraps task choices at readable content widths without changing other backends', () => {
  const readRule = (selector: string): string => {
    const css = readFileSync(join(process.cwd(), 'src/style/components/settings-backend-workspace.css'), 'utf8');
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start) + 1);
  };
  const style = document.head.createEl('style', { text: [
    '.opencodian-backend-choice-group',
    '.opencodian-backend-choice',
    '.opencodian-backend-choice :is(span, small)',
    '.opencodian-settings .opencodian-backend-task-workspace .opencodian-backend-choice-group',
    '.opencodian-settings .opencodian-backend-task-workspace .opencodian-backend-choice',
    '.opencodian-settings .opencodian-backend-task-workspace .opencodian-backend-choice-label',
  ].map(readRule).join('\n') });
  try {
    const renderChoice = (taskWorkspace: boolean) => {
      const host = document.body.createDiv({ cls: 'opencodian-settings' });
      const workspace = host.createDiv({ cls: 'opencodian-backend-workspace' });
      workspace.classList.toggle('opencodian-backend-task-workspace', taskWorkspace);
      workspace.dataset.backendWorkspace = 'claude-code';
      const group = workspace.createDiv({ cls: 'opencodian-backend-choice-group' });
      const choice = group.createEl('label', { cls: 'opencodian-backend-choice' });
      const text = choice.createSpan({ cls: 'opencodian-backend-choice-text' });
      const label = text.createSpan({ cls: 'opencodian-backend-choice-label', text: 'medium' });
      const description = text.createSpan({ cls: 'opencodian-backend-choice-desc', text: 'A longer explanation' });
      return { group, choice, label, description };
    };
    const task = renderChoice(true);
    const other = renderChoice(false);
    expect(getComputedStyle(task.group).flexWrap).toBe('wrap');
    expect(getComputedStyle(task.choice).flexBasis).toBe('auto');
    expect(getComputedStyle(task.choice).minWidth).toBe('min-content');
    expect(getComputedStyle(task.choice).maxWidth).toBe('100%');
    expect(getComputedStyle(task.choice).boxSizing).toBe('border-box');
    expect(getComputedStyle(task.label).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(task.label).overflowWrap).toBe('normal');
    expect(getComputedStyle(task.description).overflowWrap).toBe('anywhere');
    expect(getComputedStyle(other.group).display).toBe('grid');
    expect(getComputedStyle(other.choice).flexBasis).toBe('92px');
    expect(getComputedStyle(other.choice).minWidth).toBe('0');
    expect(getComputedStyle(other.label).overflowWrap).toBe('anywhere');
  } finally {
    style.remove();
  }
});

it('keeps task proof indicators beside dropdowns and gives metadata a badge surface', () => {
  const readRule = (selector: string, file = 'components/settings-backend-workspace.css'): string => {
    const css = readFileSync(join(process.cwd(), 'src/style', file), 'utf8');
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start) + 1);
  };
  const style = document.head.createEl('style', { text: [
    readRule('.setting-item-control > .opencodian-settings-dropdown', 'components/settings-dropdown.css'),
    readRule('.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item-control'),
    readRule('.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item-control > .opencodian-settings-dropdown'),
    readRule('.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item-control:has(> .opencodian-claude-code-proof-chip):has(> select, > .opencodian-settings-dropdown)'),
    readRule('.opencodian-settings .opencodian-backend-task-workspace .setting-item-control > .opencodian-claude-code-proof-chip'),
    readRule('.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item-control:has(> .opencodian-claude-code-proof-chip) > .opencodian-settings-dropdown'),
    readRule('.opencodian-settings .opencodian-backend-task-workspace .opencodian-backend-field-meta'),
    readRule('.opencodian-settings .opencodian-backend-task-workspace .opencodian-backend-field-badge'),
    readRule('.opencodian-settings .opencodian-backend-task-workspace .opencodian-backend-field-badge-axis'),
    readRule('.opencodian-settings .opencodian-backend-task-workspace .opencodian-backend-field-badge-value'),
  ].join('\n') });
  try {
    const renderRow = (taskWorkspace: boolean) => {
      const host = document.body.createDiv({ cls: 'opencodian-settings' });
      const workspace = host.createDiv({ cls: 'opencodian-backend-workspace' });
      workspace.classList.toggle('opencodian-backend-task-workspace', taskWorkspace);
      workspace.dataset.backendWorkspace = 'claude-code';
      const control = workspace.createDiv({ cls: 'setting-item-control' });
      const chip = control.createSpan({ cls: 'opencodian-claude-code-proof-chip' });
      const dropdown = control.createDiv({ cls: 'opencodian-settings-dropdown' });
      const badge = workspace.createSpan({ cls: 'opencodian-backend-field-badge' });
      const axis = badge.createSpan({ cls: 'opencodian-backend-field-badge-axis' });
      const value = badge.createSpan({ cls: 'opencodian-backend-field-badge-value' });
      return { control, chip, dropdown, badge, axis, value };
    };
    const task = renderRow(true);
    const other = renderRow(false);
    expect(getComputedStyle(task.control).flexDirection).toBe('row');
    expect(getComputedStyle(task.control).justifyContent).toBe('flex-start');
    expect(getComputedStyle(task.chip).flexBasis).toBe('10px');
    expect(getComputedStyle(task.chip).marginInlineStart).toBe('0');
    expect(getComputedStyle(task.dropdown).flexBasis).toBe('0px');
    expect(getComputedStyle(task.dropdown).minWidth).toBe('0');
    expect(getComputedStyle(task.badge).border).toBe('1px solid var(--background-modifier-border)');
    expect(getComputedStyle(task.badge).background).toBe('var(--background-secondary)');
    expect(getComputedStyle(task.badge).borderRadius).toBe('5px');
    expect(getComputedStyle(task.badge).minHeight).toBe('22px');
    expect(getComputedStyle(task.axis).fontWeight).toBe('400');
    expect(getComputedStyle(task.value).fontWeight).toBe('600');
    expect(getComputedStyle(task.value).overflowWrap).toBe('anywhere');
    expect(getComputedStyle(other.dropdown).flexBasis).toBe('240px');
    expect(getComputedStyle(other.badge).border).not.toBe('1px solid var(--background-modifier-border)');
    expect(getComputedStyle(other.value).fontWeight).not.toBe('600');
  } finally {
    style.remove();
  }
});

it('right-aligns task controls while preserving the unmarked workspace alignment', () => {
  const css = readFileSync(join(process.cwd(), 'src/style/components/settings-backend-workspace.css'), 'utf8');
  const readRule = (selector: string): string => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start) + 1);
  };
  const style = document.head.createEl('style', { text: [
    '.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item-control',
    '.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item-control:has(> button):not(:has(input, textarea, select, .opencodian-settings-dropdown, .opencodian-backend-choice-group))',
    '.opencodian-settings .opencodian-backend-task-workspace .setting-item-control > button:not(.opencodian-settings-dropdown-trigger)',
  ].map(readRule).join('\n') });
  try {
    const renderControl = (taskWorkspace: boolean, button = false) => {
      const host = document.body.createDiv({ cls: 'opencodian-settings' });
      const workspace = host.createDiv({ cls: 'opencodian-backend-workspace' });
      workspace.classList.toggle('opencodian-backend-task-workspace', taskWorkspace);
      workspace.dataset.backendWorkspace = 'claude-code';
      const control = workspace.createDiv({ cls: 'setting-item-control' });
      const content = button
        ? control.createEl('button', { text: 'Apply' })
        : control.createDiv({ cls: 'checkbox-container' });
      return { control, content };
    };
    const taskToggle = renderControl(true);
    const otherToggle = renderControl(false);
    const taskButton = renderControl(true, true);
    const otherButton = renderControl(false, true);
    expect(getComputedStyle(taskToggle.control).alignItems).toBe('flex-end');
    expect(getComputedStyle(taskToggle.control).justifyContent).toBe('flex-end');
    expect(getComputedStyle(taskButton.control).flexDirection).toBe('row');
    expect(getComputedStyle(taskButton.control).justifyContent).toBe('flex-end');
    expect(getComputedStyle(taskButton.content).alignSelf).toBe('flex-end');
    expect(getComputedStyle(otherToggle.control).alignItems).not.toBe('flex-end');
    expect(getComputedStyle(otherToggle.control).justifyContent).not.toBe('flex-end');
    expect(getComputedStyle(otherButton.content).alignSelf).not.toBe('flex-end');
  } finally {
    style.remove();
  }
});

it('stacks four-backend rows only at the readable 600px container boundary', () => {
  const css = readFileSync(join(process.cwd(), 'src/style/components/settings-backend-workspace.css'), 'utf8');
  const boundary = css.match(/@container opencodian-settings-pane \(max-width: 600px\) \{([\s\S]*?)\n\}/);
  expect(boundary).not.toBeNull();
  expect(boundary?.[1]).toContain('.opencodian-backend-task-workspace[data-backend-workspace] .setting-item:not(.opencodian-settings-direct-host)');
  expect(boundary?.[1]).toContain('grid-template-columns: minmax(0, 1fr);');
  expect(boundary?.[1]).toContain('gap: 11px;');
  expect(boundary?.[1]).toContain('.opencodian-backend-task-workspace .setting-item-control');
  expect(boundary?.[1]).toContain('align-self: start;');
  expect(css).not.toContain('@container opencodian-settings-pane (max-width: 660px)');

  const sharedCss = readFileSync(join(process.cwd(), 'src/style/components/settings-layout-contract.css'), 'utf8');
  const sharedStart = sharedCss.indexOf('  .opencodian-settings .opencodian-settings-content-shell .setting-item:not(.opencodian-settings-direct-host):not(:is(');
  const sharedEnd = sharedCss.indexOf('\n  }', sharedStart);
  expect(sharedStart).toBeGreaterThanOrEqual(0);
  const sharedNarrowRule = sharedCss.slice(sharedStart, sharedEnd + 4);
  const taskSelector = '.opencodian-settings .opencodian-backend-workspace.opencodian-backend-task-workspace[data-backend-workspace] .setting-item:not(.opencodian-settings-direct-host)';
  const taskStart = css.indexOf(`${taskSelector} {`);
  expect(taskStart).toBeGreaterThanOrEqual(0);
  const taskWideRule = css.slice(taskStart, css.indexOf('}', taskStart) + 1);
  const style = document.head.createEl('style', { text: `${sharedNarrowRule}\n${taskWideRule}` });
  try {
    const renderRow = (taskWorkspace: boolean): HTMLElement => {
      const host = document.body.createDiv({ cls: 'opencodian-settings' });
      const shell = host.createDiv({ cls: 'opencodian-settings-content-shell' });
      const workspace = shell.createDiv({ cls: 'opencodian-backend-workspace' });
      workspace.classList.toggle('opencodian-backend-task-workspace', taskWorkspace);
      workspace.dataset.backendWorkspace = 'claude-code';
      return workspace.createDiv({ cls: 'setting-item' });
    };
    expect(getComputedStyle(renderRow(true)).gridTemplateColumns)
      .toBe('minmax(0, 1fr) minmax(220px, 300px)');
    expect(getComputedStyle(renderRow(false)).gridTemplateColumns).toBe('minmax(0, 1fr)');
  } finally {
    style.remove();
  }
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
