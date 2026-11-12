import { parse } from 'jsonc-parser';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsOpenCode2Section } from '../../../../src/features/settings/backends/opencode/SettingsBackendSection';
import { setLocale, t } from '../../../../src/i18n';

/**
 * Behavior tests for the OpenCode 2 collection workspaces (agents, providers,
 * commands, MCP servers, permission rules, KV rows). Assertions target DOM
 * structure/attributes and observable state transitions (draft -> validated
 * apply -> saved), never source text; copy resolves through the same t()
 * fallback the section uses, so assertions hold with or without locale drops.
 * The in-progress JSONC draft is only observable through apply, so every
 * draft-shape assertion runs after clicking the validated apply button.
 */

const WORKSPACE_KEY = 'settings.opencode2.workspace';
const copy = (key: string, params?: Record<string, string | number>): string =>
  t(`${WORKSPACE_KEY}.${key}` as never, params);

const RUNTIME_CATALOG = {
  integrations: [],
  mcp: [
    { name: 'docs', status: { status: 'connected' } },
    { name: 'search', status: { status: 'disconnected' } },
  ],
  agents: [
    { id: 'build', name: 'Build', description: 'Implements changes', mode: 'primary', model: 'openai/model-a', system: 'Build things', steps: 8 },
    { id: 'plan', name: 'Plan', description: 'Plans work', mode: 'subagent' },
  ],
  commands: [{ name: 'commit', description: 'Creates a commit' }],
  skills: [{ id: 'review', name: 'Review' }],
  plugins: [],
};

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', models: [{ id: 'model-a', name: 'Model A' }, { id: 'model-b', name: 'Model B' }] },
  { id: 'anthropic', name: 'Anthropic', models: [{ id: 'claude-x', name: 'Claude X' }] },
];

/** Configured overlay: every configured record is draft-valid (template/URL/command filled). */
const CONFIGURED = [
  '{',
  '  // vault overlay',
  '  "agents": { "porter": { "description": "Configured porter", "mode": "subagent" } },',
  '  "providers": { "custom-hub": { "package": "@custom/hub", "models": { "hub-pro": { "name": "Hub Pro" } } } },',
  '  "mcp": { "servers": {',
  '    "docs": { "type": "local", "command": ["npx", "-y", "docs-mcp"], "environment": { "DOCS_KEY": "seed" } },',
  '    "selfhost": { "type": "remote", "url": "http://127.0.0.1:8080", "headers": { "X-Token": "seed-token" } }',
  '  } },',
  '  "commands": { "deploy": { "description": "Deploy helper", "template": "deploy it" } },',
  '  "permissions": [',
  '    { "action": "read", "resource": "**", "effect": "allow" },',
  '    { "action": "shell", "resource": "git*", "effect": "ask" },',
  '    { "action": "webfetch", "resource": "**", "effect": "deny" }',
  '  ]',
  '}',
].join('\n');

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
  agentServiceRegistry: { get: () => FixtureAdapter };
}

function createCollectionHost(configContent: string, mode: 'local' | 'remote' = 'local'): { host: FixtureHost; adapter: FixtureAdapter } {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  settings.backendSettings.opencode2.configContent = configContent;
  settings.backendSettings.opencode2.mode = mode;
  const adapter: FixtureAdapter = {
    readConfigurationSummary: jest.fn().mockResolvedValue({ version: '2.0.18', providers: 2, models: 3, agents: 2, skills: 1, commands: 1, mcp: 2 }),
    readManagementCatalog: jest.fn().mockResolvedValue(RUNTIME_CATALOG),
    getModelSelectorProviders: jest.fn().mockResolvedValue(PROVIDERS),
    validateConfigContent: jest.fn(async (value: string) => { settings.backendSettings.opencode2.configContent = value; }),
    setMcpConnection: jest.fn().mockResolvedValue(undefined),
  };
  const host: FixtureHost = { settings, saveSettings: jest.fn().mockResolvedValue(undefined), agentServiceRegistry: { get: () => adapter } };
  return { host, adapter };
}

function mountSection(host: FixtureHost, tab: string): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  new SettingsOpenCode2Section({ plugin: host as never, requestDisplayRefresh: jest.fn(), renderTitleSettings: jest.fn() }).attachTabbed(container, tab);
  return container;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function editControl(container: ParentNode, selector: string, value: string): void {
  const control = container.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  expect(control).not.toBeNull();
  control!.value = value;
  control!.dispatchEvent(new Event(control!.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

function collectionAt(container: HTMLElement, path: string): HTMLElement {
  const collection = container.querySelector<HTMLElement>(`.opencodian-opencode2-collection[data-collection-path='${path}']`);
  expect(collection).not.toBeNull();
  return collection!;
}

function itemAt(collection: HTMLElement, id: string): HTMLButtonElement {
  const item = collection.querySelector<HTMLButtonElement>(`.opencodian-opencode2-item[data-resource-id="${id}"]`);
  expect(item).not.toBeNull();
  return item!;
}

function selectRecord(container: HTMLElement, path: string, id: string): void {
  itemAt(collectionAt(container, path), id).click();
}

function fieldRow(container: ParentNode, dotPath: string): HTMLElement {
  const row = container.querySelector<HTMLElement>(`[data-config-path="${dotPath}"]`);
  expect(row).not.toBeNull();
  return row!;
}

function controlOf(row: HTMLElement, selector = 'input, select, textarea'): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const control = row.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  expect(control).not.toBeNull();
  return control!;
}

function buttonByText(scope: ParentNode, ...texts: string[]): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => texts.includes((button.textContent ?? '').trim()));
  expect(match).not.toBeNull();
  return match!;
}

function applyButton(container: HTMLElement): HTMLButtonElement {
  const apply = container.querySelector<HTMLButtonElement>('[data-action="apply"]');
  expect(apply).not.toBeNull();
  return apply!;
}

/** Parses the last applied configuration; only valid after applyButton().click() + settle(). */
function appliedDraft(host: FixtureHost): Record<string, unknown> {
  const errors: never[] = [];
  const value: unknown = parse(host.settings.backendSettings.opencode2.configContent, errors, { allowTrailingComma: true });
  expect(errors).toEqual([]);
  return value as Record<string, unknown>;
}

function submitCreateForm(form: HTMLFormElement, id: string): void {
  editControl(form, 'input', id);
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('OpenCode 2 collection pages', () => {
  beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('lists runtime and configured agent records with source badges and a scoped editor', async () => {
    const { host } = createCollectionHost(CONFIGURED);
    const agents = mountSection(host, 'agents');
    await settle();
    const collection = collectionAt(agents, '["agents"]');
    expect(collection.querySelector('.opencodian-opencode2-count')!.textContent).toBe(copy('collectionCount', { count: 3 }));
    expect(collection.querySelectorAll('.opencodian-opencode2-item')).toHaveLength(3);
    const build = itemAt(collection, 'build');
    expect(build.dataset.runtimeDefinition).toBe('true');
    expect(build.querySelector('.opencodian-opencode2-item-name')!.textContent).toBe('Build');
    expect(build.querySelector('.opencodian-opencode2-item-state')!.textContent).toBe(copy('collectionInherited'));
    const porter = itemAt(collection, 'porter');
    expect(porter.dataset.runtimeDefinition).toBe('false');
    expect(porter.querySelector('.opencodian-opencode2-item-state')!.textContent).toBe(copy('collectionCustom'));

    // The selection chosen at first paint (before the catalog arrives) is retained.
    selectRecord(agents, '["agents"]', 'build');
    expect(itemAt(collectionAt(agents, '["agents"]'), 'build').getAttribute('aria-pressed')).toBe('true');
    const title = copy('agents');
    const editor = agents.querySelector<HTMLElement>('.opencodian-opencode2-editor')!;
    expect(editor.querySelector('h5')!.textContent).toBe(copy('collectionOwner', { name: title, id: 'build' }));
    expect(editor.getAttribute('aria-label')).toBe(copy('collectionOwner', { name: title, id: 'build' }));
    selectRecord(agents, '["agents"]', 'plan');
    expect(agents.querySelector<HTMLElement>('.opencodian-opencode2-editor')!.querySelector('h5')!.textContent)
      .toBe(copy('collectionOwner', { name: title, id: 'plan' }));
    expect(itemAt(collectionAt(agents, '["agents"]'), 'build').getAttribute('aria-pressed')).toBe('false');
    expect(itemAt(collectionAt(agents, '["agents"]'), 'plan').getAttribute('aria-pressed')).toBe('true');
  });

  it('filters the record list by search and reports when nothing matches', async () => {
    const { host } = createCollectionHost(CONFIGURED);
    const agents = mountSection(host, 'agents');
    await settle();
    const collection = collectionAt(agents, '["agents"]');
    editControl(collection, '.opencodian-opencode2-search', 'bui');
    expect(itemAt(collection, 'build').hidden).toBe(false);
    expect(itemAt(collection, 'plan').hidden).toBe(true);
    expect(itemAt(collection, 'porter').hidden).toBe(true);
    editControl(collection, '.opencodian-opencode2-search', 'zzz-nothing');
    expect(collection.querySelectorAll('.opencodian-opencode2-item:not([hidden])')).toHaveLength(0);
    const emptyNote = collection.querySelector<HTMLElement>('.opencodian-opencode2-index .opencodian-opencode2-empty')!;
    expect(emptyNote.hidden).toBe(false);
    expect(emptyNote.textContent).toBe(copy('collectionNoMatches'));
    editControl(collection, '.opencodian-opencode2-search', '');
    expect(itemAt(collection, 'plan').hidden).toBe(false);
  });

  it('exposes providers, commands, and MCP collections with runtime flags and record summaries', async () => {
    const { host } = createCollectionHost(CONFIGURED);
    const model = mountSection(host, 'model');
    const mcp = mountSection(host, 'mcp');
    const tools = mountSection(host, 'tools');
    await settle();
    const providers = collectionAt(model, '["providers"]');
    expect(providers.querySelector('.opencodian-opencode2-count')!.textContent).toBe(copy('collectionCount', { count: 3 }));
    expect(itemAt(providers, 'openai').dataset.runtimeDefinition).toBe('true');
    const hub = itemAt(providers, 'custom-hub');
    expect(hub.dataset.runtimeDefinition).toBe('false');
    expect(hub.querySelector('.opencodian-opencode2-list-meta')!.textContent).toBe(copy('collectionCount', { count: 1 }));

    const servers = collectionAt(mcp, '["mcp","servers"]');
    expect(itemAt(servers, 'docs').querySelector('.opencodian-opencode2-list-meta')!.textContent).toBe(copy('localProcess'));
    expect(itemAt(servers, 'selfhost').dataset.runtimeDefinition).toBe('false');
    expect(itemAt(servers, 'selfhost').querySelector('.opencodian-opencode2-list-meta')!.textContent).toBe(copy('remoteHttp'));
    expect(itemAt(servers, 'search').dataset.runtimeDefinition).toBe('true');

    const commands = collectionAt(tools, '["commands"]');
    expect(itemAt(commands, 'commit').dataset.runtimeDefinition).toBe('true');
    expect(itemAt(commands, 'commit').querySelector('.opencodian-opencode2-list-meta')!.textContent).toBe('Creates a commit');
    expect(itemAt(commands, 'deploy').dataset.runtimeDefinition).toBe('false');
    expect(itemAt(commands, 'deploy').querySelector('.opencodian-opencode2-list-meta')!.textContent).toBe('Deploy helper');
  });

  it('validates new record ids and rejects invalid names and duplicates', async () => {
    const { host, adapter } = createCollectionHost(CONFIGURED);
    const agents = mountSection(host, 'agents');
    await settle();
    const collection = collectionAt(agents, '["agents"]');
    collection.querySelector<HTMLButtonElement>('[data-config-action="add"]')!.click();
    const form = agents.querySelector('.opencodian-opencode2-create')! as HTMLFormElement;
    expect(form).not.toBeNull();

    submitCreateForm(form, 'bad id!');
    expect(form.querySelector('.opencodian-opencode2-field-error')!.textContent).toBe(copy('invalidName'));
    submitCreateForm(form, 'build');
    expect(form.querySelector('.opencodian-opencode2-field-error')!.textContent).toBe(copy('alreadyExists'));
    expect(adapter.validateConfigContent).not.toHaveBeenCalled();
    expect(host.saveSettings).not.toHaveBeenCalled();

    submitCreateForm(form, 'porter2');
    expect(agents.querySelector('.opencodian-opencode2-create')).toBeNull();
    expect(itemAt(collectionAt(agents, '["agents"]'), 'porter2').getAttribute('aria-pressed')).toBe('true');
    applyButton(agents).click();
    await settle();
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1); // drafts never persist without apply
    expect((appliedDraft(host).agents as Record<string, unknown>)).toHaveProperty('porter2');
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('restores inherited records directly and removes configured records through inline confirmation', async () => {
    const { host, adapter } = createCollectionHost(CONFIGURED);
    const agents = mountSection(host, 'agents');
    await settle();
    // Runtime record: type an override, reselect so the editor repaints with the
    // record-level restore action enabled, then restore removes it without confirmation.
    selectRecord(agents, '["agents"]', 'build');
    editControl(fieldRow(agents, 'agents.build.description'), 'input', 'Override text');
    selectRecord(agents, '["agents"]', 'plan');
    selectRecord(agents, '["agents"]', 'build');
    const restore = agents.querySelector<HTMLButtonElement>('[data-config-action="restore-record"]')!;
    expect(restore.dataset.definitionPath).toBe(JSON.stringify(['agents', 'build']));
    expect(restore.disabled).toBe(false);
    restore.click();
    expect(fieldRow(agents, 'agents.build.description').querySelector('.opencodian-opencode2-badge')!.textContent).toBe(copy('inherited'));

    // Configured record: removal needs the inline confirmation, and cancel keeps the record.
    selectRecord(agents, '["agents"]', 'porter');
    const remove = agents.querySelector<HTMLButtonElement>('[data-config-action="remove-record"]')!;
    expect(remove.dataset.definitionPath).toBe(JSON.stringify(['agents', 'porter']));
    remove.click();
    const confirm = agents.querySelector('.opencodian-opencode2-confirm')!;
    expect(confirm).not.toBeNull();
    expect(itemAt(collectionAt(agents, '["agents"]'), 'porter')).not.toBeNull();
    buttonByText(confirm, copy('cancel')).click();
    expect(agents.querySelector('.opencodian-opencode2-confirm')).toBeNull();
    expect(itemAt(collectionAt(agents, '["agents"]'), 'porter')).not.toBeNull();

    agents.querySelector<HTMLButtonElement>('[data-config-action="remove-record"]')!.click();
    buttonByText(agents.querySelector('.opencodian-opencode2-confirm')!, copy('confirmRemove')).click();
    expect(agents.querySelector('.opencodian-opencode2-item[data-resource-id="porter"]')).toBeNull();
    applyButton(agents).click();
    await settle();
    expect(appliedDraft(host).agents).not.toHaveProperty('porter');
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCode 2 per-record drafts, steps, commands, and provider models', () => {
  beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('isolates per-record drafts and blocks apply on agent steps below one until corrected', async () => {
    const { host, adapter } = createCollectionHost(CONFIGURED);
    const agents = mountSection(host, 'agents');
    await settle();
    selectRecord(agents, '["agents"]', 'build');
    editControl(fieldRow(agents, 'agents.build.description'), 'input', 'Build override');
    selectRecord(agents, '["agents"]', 'plan');
    // plan shows only its inherited catalog readback, never the sibling override
    expect(controlOf(fieldRow(agents, 'agents.plan.description')).value).toBe('Plans work');
    selectRecord(agents, '["agents"]', 'build');
    expect(controlOf(fieldRow(agents, 'agents.build.description')).value).toBe('Build override');

    const stepsInput = () => controlOf(fieldRow(agents, 'agents.build.steps'), 'input') as HTMLInputElement;
    editControl(agents, '[data-config-path="agents.build.steps"] input', '0');
    expect(stepsInput().getAttribute('aria-invalid')).toBe('true');
    expect(applyButton(agents).disabled).toBe(true);
    // The invalid draft survives selection switches instead of being dropped.
    selectRecord(agents, '["agents"]', 'plan');
    selectRecord(agents, '["agents"]', 'build');
    expect(stepsInput().value).toBe('0');
    expect(stepsInput().getAttribute('aria-invalid')).toBe('true');
    expect(applyButton(agents).disabled).toBe(true);

    editControl(agents, '[data-config-path="agents.build.steps"] input', '2');
    expect(stepsInput().getAttribute('aria-invalid')).toBe('false');
    expect(applyButton(agents).disabled).toBe(false);
    applyButton(agents).click();
    await settle();
    const applied = appliedDraft(host) as { agents: Record<string, Record<string, unknown>> };
    expect(applied.agents.build?.steps).toBe(2);
    expect(applied.agents.build?.description).toBe('Build override');
    expect(applied.agents.plan).toBeUndefined();
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
  });

  it('requires command templates before a command draft can apply and never fabricates inherited templates', async () => {
    const { host, adapter } = createCollectionHost(CONFIGURED);
    const tools = mountSection(host, 'tools');
    await settle();
    selectRecord(tools, '["commands"]', 'commit');
    // Runtime command readback: catalog only carries name/description, so the
    // template starts empty and the runtime-only notice is shown.
    const commitTemplate = controlOf(fieldRow(tools, 'commands.commit.template'), 'textarea') as HTMLTextAreaElement;
    expect(commitTemplate.value).toBe('');
    expect(tools.querySelector('.opencodian-opencode2-editor')!.textContent).toContain(copy('recordRuntimeOnly'));
    editControl(tools, '[data-config-path="commands.commit.template"] textarea', '');
    expect(commitTemplate.getAttribute('aria-invalid')).toBe('true');
    expect(applyButton(tools).disabled).toBe(true);
    editControl(tools, '[data-config-path="commands.commit.template"] textarea', 'Run the checks');
    expect(commitTemplate.getAttribute('aria-invalid')).toBe('false');

    // A freshly created command must not be applicable until its template is filled.
    collectionAt(tools, '["commands"]').querySelector<HTMLButtonElement>('[data-config-action="add"]')!.click();
    const form = tools.querySelector('.opencodian-opencode2-create')! as HTMLFormElement;
    submitCreateForm(form, 'ship');
    expect(controlOf(fieldRow(tools, 'commands.ship.template'), 'textarea').value).toBe('');
    expect(applyButton(tools).disabled).toBe(true);
    editControl(tools, '[data-config-path="commands.ship.template"] textarea', 'ship it');
    expect(applyButton(tools).disabled).toBe(false);
    applyButton(tools).click();
    await settle();
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(adapter.validateConfigContent.mock.invocationCallOrder[0])
      .toBeLessThan(host.saveSettings.mock.invocationCallOrder[0]); // validation before persist
    const applied = appliedDraft(host) as { commands: Record<string, { template: string }> };
    expect(applied.commands.commit.template).toBe('Run the checks');
    expect(applied.commands.ship.template).toBe('ship it');
  });

  it('keeps provider model add/edit nested and never crosses providers', async () => {
    const { host, adapter } = createCollectionHost(CONFIGURED);
    const model = mountSection(host, 'model');
    await settle();
    selectRecord(model, '["providers"]', 'openai');
    const openaiModels = () => model.querySelector<HTMLElement>(".opencodian-opencode2-models[data-models-path='[\"providers\",\"openai\",\"models\"]']")!;
    expect(openaiModels().querySelectorAll('.opencodian-opencode2-model-item')).toHaveLength(2);
    openaiModels().querySelector<HTMLButtonElement>('.opencodian-opencode2-model-item[data-model-id="model-a"]')!.click();
    expect(model.querySelector<HTMLElement>('.opencodian-opencode2-model-editor')!.querySelector('h6')!.textContent).toContain('openai/model-a');
    editControl(model, '[data-config-path="providers.openai.models.model-a.name"] input', 'Renamed A');

    openaiModels().querySelector<HTMLButtonElement>('[data-config-action="add"]')!.click();
    submitCreateForm(openaiModels().querySelector('.opencodian-opencode2-create')! as HTMLFormElement, 'model-c');
    expect(openaiModels().querySelector('.opencodian-opencode2-model-item[data-model-id="model-c"]')).not.toBeNull();

    selectRecord(model, '["providers"]', 'anthropic');
    const anthropicModels = model.querySelector<HTMLElement>(".opencodian-opencode2-models[data-models-path='[\"providers\",\"anthropic\",\"models\"]']")!;
    expect(Array.from(anthropicModels.querySelectorAll('.opencodian-opencode2-model-item')).map((item) => item.dataset.modelId)).toEqual(['claude-x']);
    expect(anthropicModels.querySelector('.opencodian-opencode2-model-editor')).toBeNull(); // no selection leak across providers

    selectRecord(model, '["providers"]', 'openai');
    openaiModels().querySelector<HTMLButtonElement>('.opencodian-opencode2-model-item[data-model-id="model-a"]')!.click();
    expect(controlOf(fieldRow(model, 'providers.openai.models.model-a.name')).value).toBe('Renamed A');
    expect(model.querySelector('.opencodian-opencode2-model-item[data-model-id="model-c"]')).not.toBeNull();
    applyButton(model).click();
    await settle();
    const applied = appliedDraft(host) as { providers: Record<string, { models: Record<string, Record<string, unknown>> }> };
    expect(applied.providers.openai.models['model-a']?.name).toBe('Renamed A');
    expect(applied.providers.openai.models['model-c']).toBeDefined();
    expect(applied.providers.anthropic).toBeUndefined();
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
  });
});
