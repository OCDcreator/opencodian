import {
  createClaudeCodePermissionConfig,
  createCodexSandboxConfig,
  createOpenCode2PermissionConfig,
  createOpenCodePermissionConfig,
  createZCodeModeConfig,
  type PermissionModeConfig,
  type PermissionModeOption,
  PermissionModeSelectorCoordinator,
} from '../../../../src/features/chat/services/selection/PermissionModeSelectorCoordinator';
import { setLocale } from '../../../../src/i18n';

const id = (value: string) => `preset-2-${value}`;
const baseOptions = (): PermissionModeOption[] => ['read-only', 'workspace-write', 'danger-full-access']
  .map(value => ({ id: id(value), label: value, description: '', icon: 'shield' }));

describe('DSH official permission menu presentation', () => {
  const selectors: PermissionModeSelectorCoordinator[] = [];
  function mount(options = baseOptions(), initial = id('workspace-write'), backendLabel: PermissionModeConfig['backendLabel'] = 'dsh') {
    let current = initial;
    const config: PermissionModeConfig = {
      backendLabel, options,
      displayMap: Object.fromEntries(options.map(option => [option.id, option.label])),
      modeCssClasses: options.map(option => `mode-${option.id}`),
    };
    const switchMode = jest.fn(async (mode: string) => { current = mode; return true; });
    const selector = new PermissionModeSelectorCoordinator({ getPermissionMode: () => current,
      switchPermissionMode: switchMode, restoreInputFocus: jest.fn() }, config);
    const container = document.createElement('div');
    document.body.appendChild(container);
    selector.mount(container);
    selectors.push(selector);
    return { selector, container, config, switchMode, setCurrent: (mode: string) => { current = mode; } };
  }
  const labels = (container: HTMLElement) => [...container.querySelectorAll('.opencodian-permission-option-label')].map(e => e.textContent);
  const trigger = (container: HTMLElement) => container.querySelector<HTMLElement>('.opencodian-permission-trigger')!;

  beforeEach(() => setLocale('zh'));
  afterEach(() => { for (const selector of selectors.splice(0)) selector.destroy(); document.body.empty(); setLocale('en'); });

  it('shows the three official Chinese names in catalog order and preserves the selected ID', () => {
    const { container } = mount();
    expect(labels(container)).toEqual(['仅可查看', '工作区内修改', '完全权限']);
    expect([...container.querySelectorAll('[role="option"]')].map(e => e.getAttribute('data-mode'))).toEqual(baseOptions().map(o => o.id));
    expect(container.querySelector('[aria-selected="true"]')?.getAttribute('data-mode')).toBe(id('workspace-write'));
    expect(trigger(container).getAttribute('aria-label')).toBe('工作区内修改');
    expect(container.querySelectorAll('.opencodian-permission-option-desc')).toHaveLength(0);
  });

  it('localizes only the exact official English aliases', () => {
    const options = baseOptions();
    ['Read Only', 'Workspace Write', 'Full access'].forEach((label, i) => { options[i].label = label; });
    expect(labels(mount(options).container)).toEqual(['仅可查看', '工作区内修改', '完全权限']);
  });

  it('preserves host names and descriptions, including custom names for built-in presets', () => {
    const options = baseOptions(); options[1].label = '项目专用'; options[1].description = 'Custom policy';
    const { container } = mount(options);
    expect(labels(container)[1]).toBe('项目专用');
    expect(trigger(container).getAttribute('aria-label')).toBe('项目专用');
    expect(container.querySelector('.opencodian-permission-option-desc')?.textContent).toBe('Custom policy');
  });

  it('keeps a nonstandard catalog order without adding unavailable auto review', () => {
    const { container } = mount(baseOptions().reverse());
    expect(labels(container)).toEqual(['完全权限', '工作区内修改', '仅可查看']);
    expect(container.querySelectorAll('.opencodian-permission-badge')).toHaveLength(0);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it('displays registered auto review with EXP in its row, trigger and accessible name', () => {
    const { container } = mount([...baseOptions(), { id: id('auto'), label: 'Backend auto name', description: '', icon: 'shield' }], id('auto'));
    expect(labels(container)).toEqual(['仅可查看', '工作区内修改', '完全权限', '自动审查']);
    expect(container.querySelectorAll('.opencodian-permission-badge')).toHaveLength(2);
    expect(trigger(container).getAttribute('aria-label')).toBe('自动审查 EXP');
    expect(trigger(container).classList.contains('opencodian-permission-trigger--experimental')).toBe(true);
  });

  it('removes the trigger experiment marker when authoritative current changes', () => {
    const { container, selector, setCurrent } = mount([...baseOptions(), { id: id('auto'), label: 'auto', description: '' }], id('auto'));
    setCurrent(id('workspace-write')); selector.updateTriggerDisplay();
    expect(trigger(container).querySelector('.opencodian-permission-badge')).toBeNull();
    expect(trigger(container).classList.contains('opencodian-permission-trigger--experimental')).toBe(false);
    expect(trigger(container).getAttribute('aria-label')).toBe('工作区内修改');
  });

  it('refreshes translations without mutating the source catalog', () => {
    const { container, config, selector } = mount(); const before = JSON.stringify(config);
    setLocale('en'); selector.applyLocaleTexts();
    expect(labels(container)).toEqual(['Read Only', 'Workspace Write', 'Full access']);
    expect(trigger(container).getAttribute('aria-label')).toBe('Workspace Write');
    expect(JSON.stringify(config)).toBe(before);
  });

  it('passes the exact generation-protected ID to the existing switch path', async () => {
    const { container, switchMode } = mount();
    container.querySelector<HTMLElement>(`[data-mode="${id('read-only')}"]`)!.click();
    await Promise.resolve(); await Promise.resolve();
    expect(switchMode).toHaveBeenCalledWith(id('read-only'));
    expect(trigger(container).getAttribute('aria-label')).toBe('仅可查看');
    expect(container.querySelector('[aria-selected="true"]')?.getAttribute('data-mode')).toBe(id('read-only'));
  });

  it('does not relabel current or selection when switching is rejected', async () => {
    const { container, selector, switchMode } = mount(); switchMode.mockResolvedValue(false);
    trigger(container).click();
    container.querySelector<HTMLElement>(`[data-mode="${id('danger-full-access')}"]`)!.click();
    await Promise.resolve(); await Promise.resolve();
    expect(trigger(container).getAttribute('aria-label')).toBe('工作区内修改');
    expect(selector.isOpen()).toBe(true);
    expect(container.querySelector('[aria-selected="true"]')?.getAttribute('data-mode')).toBe(id('workspace-write'));
  });

  it.each(['preset-2-project-auto', 'preset-2-auto-extra', 'preset-x-read-only', 'read-only'])(
    'does not infer built-in semantics from the lookalike ID %s', value => {
      const { container } = mount([{ id: value, label: 'read-only', description: '', icon: 'shield' }], value);
      expect(labels(container)).toEqual(['read-only']);
      expect(trigger(container).getAttribute('aria-label')).toBe('read-only');
      expect(container.querySelectorAll('.opencodian-permission-badge')).toHaveLength(0);
    });

  it('keeps an unknown current value display-only and adds no selectable row', () => {
    const { container, config, selector, setCurrent } = mount();
    const unknown = id('custom'); config.displayMap[unknown] = 'custom'; setCurrent(unknown); selector.updateTriggerDisplay();
    expect(trigger(container).getAttribute('aria-label')).toBe('custom');
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(container.querySelector('[aria-selected="true"]')).toBeNull();
  });

  it.each(['opencode', 'opencode2', 'claude-code', 'codex', 'zcode'] as const)(
    'leaves %s catalog labels alone even with a DSH-looking ID', backend => {
      const { container } = mount(baseOptions(), id('workspace-write'), backend);
      expect(labels(container)).toEqual(['read-only', 'workspace-write', 'danger-full-access']);
      expect(trigger(container).getAttribute('aria-label')).toBe('workspace-write');
      expect(container.querySelectorAll('.opencodian-permission-badge')).toHaveLength(0);
    });

  it.each([createOpenCodePermissionConfig, createOpenCode2PermissionConfig, createClaudeCodePermissionConfig,
    createCodexSandboxConfig, createZCodeModeConfig])('preserves other backend trigger display maps', factory => {
    const config = factory(); const current = config.options[0].id; const container = document.createElement('div');
    const selector = new PermissionModeSelectorCoordinator({ getPermissionMode: () => current,
      switchPermissionMode: async () => false, restoreInputFocus: jest.fn() }, config);
    selectors.push(selector); selector.mount(container);
    expect(trigger(container).getAttribute('aria-label')).toBe(config.displayMap[current]);
    expect(labels(container)).toEqual(config.options.map(o => o.label));
    expect(container.querySelectorAll('.opencodian-permission-badge')).toHaveLength(0);
  });
});
