import { parse } from 'jsonc-parser';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsOpenCode2Section } from '../../../../src/features/settings/backends/opencode/SettingsBackendSection';
import { setLocale, t } from '../../../../src/i18n';

/**
 * Focused behavior tests for the Kimi-review fixes: negated boolean options
 * (Hide/Show, Disable/Enable) with their descriptions, official compaction
 * buffer validation (percent 1–99, tokens non-negative), string-form
 * references shown as path rows with sibling preservation, required MCP
 * transport semantics (no inherit option, no per-field reset, confirm-gated
 * removal, draft stash across transport switches), the permission-rule
 * collection frame with indexed rows and scoped JSON, line-list instruction
 * sources with JSON fallback for object arrays, and the neutral KV/empty
 * states. Copy resolves through the same t() fallback the section uses, so
 * assertions hold with or without locale drops.
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
  agents: [{ id: 'build', name: 'Build', description: 'Implements changes', mode: 'primary' }],
  commands: [],
  skills: [],
  plugins: [],
};

/** Every configured record stays draft-valid so apply is available when needed. */
const REVIEW_CONFIG = [
  '{',
  '  // vault overlay',
  '  "agents": { "build": { "hidden": true, "disabled": false } },',
  '  "mcp": { "servers": {',
  '    "docs": { "type": "local", "command": ["npx", "-y", "docs-mcp"], "environment": { "DOCS_KEY": "seed" } },',
  '    "selfhost": { "type": "remote", "url": "http://127.0.0.1:8080" }',
  '  } },',
  '  "references": { "notes": "./notes", "wiki": { "description": "Wiki", "path": "./wiki" } },',
  '  "permissions": [',
  '    { "action": "shell", "resource": "git*", "effect": "ask", "note": "reviewers" },',
  '    { "action": "read", "resource": "**", "effect": "allow" }',
  '  ],',
  '  "instructions": ["AGENTS.md", "docs/*.md"],',
  '  "skills": [{ "name": "review" }],',
  '  "watcher": { "ignore": ["dist"] },',
  '  "compaction": { "buffer": "20%" }',
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

function createReviewHost(configContent: string): { host: FixtureHost; adapter: FixtureAdapter } {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  settings.backendSettings.opencode2.configContent = configContent;
  const adapter: FixtureAdapter = {
    readConfigurationSummary: jest.fn().mockResolvedValue({ version: '2.0.18', providers: 1, models: 2, agents: 1, skills: 0, commands: 0, mcp: 2 }),
    readManagementCatalog: jest.fn().mockResolvedValue(RUNTIME_CATALOG),
    getModelSelectorProviders: jest.fn().mockResolvedValue([{ id: 'openai', name: 'OpenAI', models: [{ id: 'model-a', name: 'Model A' }] }]),
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

function typeInto(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

function collectionAt(container: HTMLElement, path: string): HTMLElement {
  const collection = container.querySelector<HTMLElement>(`.opencodian-opencode2-collection[data-collection-path='${path}']`);
  expect(collection).not.toBeNull();
  return collection!;
}

function selectRecord(container: HTMLElement, path: string, id: string): void {
  const item = collectionAt(container, path).querySelector<HTMLButtonElement>(`.opencodian-opencode2-item[data-resource-id="${id}"]`);
  expect(item).not.toBeNull();
  item!.click();
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

describe('OpenCode 2 review fixes', () => {
  beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('labels negated agent booleans Hide/Show and Disable/Enable with their descriptions', async () => {
    const { host } = createReviewHost(REVIEW_CONFIG);
    const agents = mountSection(host, 'agents');
    await settle();
    selectRecord(agents, '["agents"]', 'build');
    const hiddenRow = fieldRow(agents, 'agents.build.hidden');
    const hidden = controlOf(hiddenRow, 'select') as HTMLSelectElement;
    expect(hidden.value).toBe('true');
    expect(Array.from(hidden.options).map((option) => option.textContent)).toEqual([copy('inherited'), copy('trueHidden'), copy('falseHidden')]);
    expect(hidden.querySelector("option[value='true']")!.textContent).toBe(copy('trueHidden'));
    expect(hidden.querySelector("option[value='false']")!.textContent).toBe(copy('falseHidden'));
    expect(hiddenRow.querySelector('.setting-item-description')!.textContent).toBe(copy('hiddenAgentDesc'));
    const disabledRow = fieldRow(agents, 'agents.build.disabled');
    const disabled = controlOf(disabledRow, 'select') as HTMLSelectElement;
    expect(disabled.value).toBe('false');
    expect(disabled.querySelector("option[value='true']")!.textContent).toBe(copy('trueDisabled'));
    expect(disabled.querySelector("option[value='false']")!.textContent).toBe(copy('falseDisabled'));
    expect(disabledRow.querySelector('.setting-item-description')!.textContent).toBe(copy('disableAgentDesc'));
  });

  it('rejects 0%, 100%, and 0.5% buffers and accepts 1%, 99.5%, and absolute zero', async () => {
    const { host, adapter } = createReviewHost('{}');
    const advanced = mountSection(host, 'advanced');
    await settle();
    const mergeWith = (raw: string): HTMLButtonElement => {
      editControl(advanced, '.opencodian-opencode2-raw', raw);
      advanced.querySelector<HTMLButtonElement>('[data-action="merge-raw"]')!.click();
      return advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!; // repaint replaces the node
    };
    for (const rejected of ['0%', '100%', '0.5%']) {
      const apply = mergeWith(`{"compaction":{"buffer":"${rejected}"}}`);
      expect(apply.disabled).toBe(true);
      expect(adapter.validateConfigContent).not.toHaveBeenCalled();
    }
    // The merge feedback occupies the save status until a field edit clears it,
    // then the unified draft error surfaces.
    editControl(advanced, '[data-config-path="experimental.todo"] select', 'true');
    expect(advanced.querySelector('.opencodian-opencode2-save-status')!.textContent).toContain(copy('bufferInvalid'));
    expect(advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    expect(mergeWith('{"compaction":{"buffer":"1%"}}').disabled).toBe(false);
    expect(mergeWith('{"compaction":{"buffer":"99.5%"}}').disabled).toBe(false);
    const finalApply = mergeWith('{"compaction":{"buffer":0}}');
    expect(finalApply.disabled).toBe(false);
    finalApply.click();
    await settle();
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(appliedDraft(host).compaction).toEqual({ buffer: 0 });
  });

  it('shows string references as path rows with the actual path and preserves siblings on edit', async () => {
    const { host, adapter } = createReviewHost(REVIEW_CONFIG);
    const configuration = mountSection(host, 'configuration');
    await settle();
    const collection = collectionAt(configuration, '["references"]');
    const notes = collection.querySelector<HTMLButtonElement>(".opencodian-opencode2-item[data-resource-id='notes']")!;
    expect(notes.querySelector('.opencodian-opencode2-list-meta')!.textContent).toBe(copy('referenceSummaryLocal', { path: './notes' }));
    const wiki = collection.querySelector<HTMLButtonElement>(".opencodian-opencode2-item[data-resource-id='wiki']")!;
    expect(wiki.querySelector('.opencodian-opencode2-list-meta')!.textContent).toBe('Wiki');

    selectRecord(configuration, '["references"]', 'notes');
    const pathRow = fieldRow(configuration, 'references.notes.path');
    expect(pathRow.dataset.configKey).toBe(JSON.stringify(['references', 'notes']));
    expect(controlOf(pathRow).value).toBe('./notes');
    expect(pathRow.querySelector('[data-config-action="reset"]')).toBeNull(); // string references have no field reset
    editControl(configuration, '[data-config-path="references.notes.path"] input', './notes-v2');
    applyButton(configuration).click();
    await settle();
    const references = appliedDraft(host).references as Record<string, unknown>;
    expect(references.notes).toBe('./notes-v2'); // stays a string, never objectified
    expect(references.wiki).toEqual({ description: 'Wiki', path: './wiki' }); // sibling untouched
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
  });

  it('gives required MCP transports local/remote options only, no resets, and a placeholder for unoverridden servers', async () => {
    const { host } = createReviewHost(REVIEW_CONFIG);
    const mcp = mountSection(host, 'mcp');
    await settle();

    selectRecord(mcp, '["mcp","servers"]', 'search'); // runtime catalog server without a configured override
    const searchType = controlOf(fieldRow(mcp, 'mcp.servers.search.type'), 'select') as HTMLSelectElement;
    expect(searchType.options).toHaveLength(3);
    expect(searchType.options[0].disabled).toBe(true);
    expect(searchType.options[0].textContent).toBe(copy('mcpFieldDefault'));
    expect(searchType.options[0].textContent).not.toBe(copy('inherited'));

    selectRecord(mcp, '["mcp","servers"]', 'docs'); // configured override: no placeholder, no resets
    const docsType = controlOf(fieldRow(mcp, 'mcp.servers.docs.type'), 'select') as HTMLSelectElement;
    expect(Array.from(docsType.options).map((option) => option.value)).toEqual(['local', 'remote']);
    expect(docsType.value).toBe('local');
    expect(fieldRow(mcp, 'mcp.servers.docs.type').querySelector('[data-config-action="reset"]')).toBeNull();
    expect(fieldRow(mcp, 'mcp.servers.docs.command').querySelector('[data-config-action="reset"]')).toBeNull();

    selectRecord(mcp, '["mcp","servers"]', 'selfhost');
    mcp.querySelector<HTMLButtonElement>('[data-config-action="remove-record"]')!.click();
    const confirm = mcp.querySelector('.opencodian-opencode2-confirm');
    expect(confirm).not.toBeNull(); // whole-object removal only through the footer confirmation
    const cancel = Array.from(confirm!.querySelectorAll('button')).find((button) => (button.textContent ?? '').trim() === copy('cancel'))!;
    cancel.click();
    expect(mcp.querySelector('.opencodian-opencode2-confirm')).toBeNull();
    expect(collectionAt(mcp, '["mcp","servers"]').querySelector(".opencodian-opencode2-item[data-resource-id='selfhost']")).not.toBeNull();
  });

  it('stashes local transport drafts when switching MCP transports and restores them on switch-back', async () => {
    const { host, adapter } = createReviewHost(REVIEW_CONFIG);
    const mcp = mountSection(host, 'mcp');
    await settle();
    selectRecord(mcp, '["mcp","servers"]', 'docs');
    editControl(mcp, '[data-config-path="mcp.servers.docs.type"] select', 'remote');
    expect(mcp.querySelector('[data-config-path="mcp.servers.docs.command"]')).toBeNull();
    expect(mcp.querySelector('[data-config-path="mcp.servers.docs.environment"]')).toBeNull();
    expect(controlOf(fieldRow(mcp, 'mcp.servers.docs.url')).value).toBe('');
    expect(applyButton(mcp).disabled).toBe(true);
    expect(mcp.querySelector('.opencodian-opencode2-save-status')!.textContent).toContain(copy('mcpRemoteRequired'));

    editControl(mcp, '[data-config-path="mcp.servers.docs.type"] select', 'local');
    expect(controlOf(fieldRow(mcp, 'mcp.servers.docs.command'), 'textarea').value).toBe('npx\n-y\ndocs-mcp');
    const environment = fieldRow(mcp, 'mcp.servers.docs.environment').querySelectorAll<HTMLInputElement>('.opencodian-opencode2-kv-row input');
    expect(Array.from(environment).map((input) => input.value)).toEqual(['DOCS_KEY', 'seed']);
    expect(applyButton(mcp).disabled).toBe(false);
    applyButton(mcp).click();
    await settle();
    const docs = (appliedDraft(host).mcp as { servers: Record<string, Record<string, unknown>> }).servers.docs;
    expect(docs.type).toBe('local');
    expect(docs.command).toEqual(['npx', '-y', 'docs-mcp']);
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
  });

  it('frames permission rules as a collection with indexed rows, a scoped JSON view, and preserved metadata', async () => {
    const { host, adapter } = createReviewHost(REVIEW_CONFIG);
    const permissions = mountSection(host, 'permissions');
    await settle();
    const collection = permissions.querySelector<HTMLElement>('.opencodian-opencode2-rule-collection')!;
    expect(collection).not.toBeNull();
    const header = collection.querySelector<HTMLElement>('.opencodian-opencode2-rule-collection-header')!;
    expect(header.querySelector('h6')!.textContent).toBe(copy('orderedPermissions'));
    expect(header.querySelector('.opencodian-opencode2-count')!.textContent).toBe(copy('ruleCount', { count: 2 }));
    expect(header.querySelector('[data-config-action="add"]')).not.toBeNull(); // add lives in the collection header

    const rows = () => Array.from(collection.querySelectorAll('.opencodian-opencode2-rule'));
    expect(rows()).toHaveLength(2);
    expect(rows()[0].querySelector('.opencodian-opencode2-rule-header strong')!.textContent).toBe(copy('ruleNumber', { index: 1 }));
    expect(rows()[0].querySelector('.opencodian-opencode2-rule-header button')!.disabled).toBe(true); // edge: nothing above

    editControl(rows()[0], 'select', 'grep');
    expect(collection.querySelector('details textarea')!.value).toContain('"reviewers"'); // scoped JSON tracks the draft
    applyButton(permissions).click();
    await settle();
    const applied = (appliedDraft(host).permissions as Array<Record<string, string>>);
    expect(applied[0]).toEqual({ action: 'grep', resource: 'git*', effect: 'ask', note: 'reviewers' }); // unknown keys preserved
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
  });

  it('edits instruction sources as line lists, keeps object arrays in JSON, and lists watcher ignores', async () => {
    const { host, adapter } = createReviewHost(REVIEW_CONFIG);
    const context = mountSection(host, 'context');
    const advanced = mountSection(host, 'advanced');
    await settle();

    const instructions = controlOf(fieldRow(context, 'instructions'), 'textarea') as HTMLTextAreaElement;
    expect(instructions.value).toBe('AGENTS.md\ndocs/*.md');
    typeInto(instructions, 'AGENTS.md\ndocs/*.md\nmore.md');
    const skills = controlOf(fieldRow(context, 'skills'), 'textarea') as HTMLTextAreaElement;
    expect(skills.value).toContain('"review"'); // object arrays fall back to the JSON editor untouched

    const watcher = controlOf(fieldRow(advanced, 'watcher.ignore'), 'textarea') as HTMLTextAreaElement;
    expect(watcher.value).toBe('dist');
    typeInto(watcher, 'dist\nout');

    applyButton(context).click();
    await settle();
    expect(appliedDraft(host).instructions).toEqual(['AGENTS.md', 'docs/*.md', 'more.md']);
    expect(appliedDraft(host).watcher).toEqual({ ignore: ['dist', 'out'] });
    expect(appliedDraft(host).skills).toEqual([{ name: 'review' }]);
    expect(adapter.validateConfigContent).toHaveBeenCalledTimes(1);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(adapter.validateConfigContent.mock.invocationCallOrder[0])
      .toBeLessThan(host.saveSettings.mock.invocationCallOrder[0]);
  });

  it('renders the KV empty state, keeps blank staged rows invalid, and uses the neutral empty search state', async () => {
    const { host } = createReviewHost(REVIEW_CONFIG);
    const mcp = mountSection(host, 'mcp');
    await settle();
    selectRecord(mcp, '["mcp","servers"]', 'search');
    editControl(mcp, '[data-config-path="mcp.servers.search.type"] select', 'local');

    const kv = () => fieldRow(mcp, 'mcp.servers.search.environment').querySelector('.opencodian-opencode2-kv')!;
    expect(kv().querySelector('p')!.textContent).toBe(copy('kvEmpty')); // empty state visible with zero rows
    Array.from(kv().querySelectorAll('button')).find((button) => (button.textContent ?? '').trim() === copy('kvAdd'))!.click();
    expect(kv().querySelectorAll('.opencodian-opencode2-kv-row')).toHaveLength(1); // repaint replaces the section; re-query
    expect(kv().querySelector('.opencodian-opencode2-field-error')!.textContent).toBe(copy('kvInvalid'));
    expect(applyButton(mcp).disabled).toBe(true);

    const inputs = () => Array.from(kv().querySelectorAll<HTMLInputElement>('.opencodian-opencode2-kv-row input'));
    typeInto(inputs()[0], 'API_KEY');
    typeInto(inputs()[1], 'v2');
    expect(kv().querySelector('.opencodian-opencode2-field-error')!.textContent).toBe('');
    expect(applyButton(mcp).disabled).toBe(true); // still blocked: the local server needs a command
    expect(mcp.querySelector('.opencodian-opencode2-save-status')!.textContent).toContain(copy('mcpLocalRequired'));

    editControl(collectionAt(mcp, '["mcp","servers"]'), '.opencodian-opencode2-search', 'zzz');
    const note = collectionAt(mcp, '["mcp","servers"]').querySelector<HTMLElement>('.opencodian-opencode2-empty')!;
    expect(note).not.toBeNull(); // neutral empty-state class; visibility is CSS, not asserted here
    expect(note.classList.contains('opencodian-opencode2-field-error')).toBe(false);
  });
});
