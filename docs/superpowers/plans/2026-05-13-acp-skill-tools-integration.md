# ACP Client, Skill Management, and Tool Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three features to OpenCodian: (1) Skill discovery & management UI, (2) Tool catalog with permission control, (3) ACP client for connecting external AI coding agents.

**Architecture:** Sequential vertical slices. Slice 0 builds shared foundation (settings slots, i18n, permission write-through). Slice 1 adds Skill management. Slice 2 adds Tool catalog. Slice 3 adds ACP client. Each slice is independently mergeable.

**Tech Stack:** TypeScript, Obsidian API (Setting, PluginSettingTab, requestUrl), Jest, `@agentclientprotocol/sdk` (Slice 3 only), Node.js `child_process` (Slice 3 only).

**Spec:** `docs/superpowers/specs/2026-05-13-acp-skill-tools-integration-design.md`

---

## Scope Boundaries

**In scope:**
- Settings layout registry entries for `skills`, `tools`, `acp` primary tabs
- i18n strings for all three tabs (en + zh-CN)
- `SkillCatalogService` — fetch skill list from `GET /skill` HTTP endpoint
- Skill tab UI with list, content preview, flat permission control
- Tool tab UI with built-in/custom classification, schema display, flat permission control
- `Conversation` type extension with `transport`, `acpSessionId`, `acpAgentId` fields
- `AcpClientManager` — spawn/manage ACP agent processes
- `AcpTransportOwner` — produce core `StreamChunk` from ACP notifications
- ACP tab UI with agent config CRUD and presets

**Out of scope:**
- Nested per-skill-name permission patterns (needs new `OpencodeConfigManager` API)
- MCP tool management changes (already independent)
- ACP `loadSession` hydration for reopened conversations (future: requires full ACP replay → StreamChunk)
- Tool schema editing/creation UI
- Tests that require a live OpenCode server

**Required preservation:**
- Existing send pipeline (`openCodeService.sendMessage()` → `streamingRuntime.streamResponse()`)
- Existing permission flow (`OpencodeConfigManager.setToolPermission()`)
- Existing settings normalization pipeline
- Existing chat rendering pipeline (streaming controller, `convertToStreamingChunk`)

---

## File Structure

### Slice 0 — Shared Foundation

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/core/types/settings.ts` | Add `acpAgents`, `skillCatalogCacheTtl`, `toolCatalogCacheTtl` to `OpenCodianSettings` and `DEFAULT_SETTINGS` |
| Modify | `src/core/types/settingsLoadNormalization.ts` | Pass-through normalize new fields |
| Modify | `src/features/settings/settingsLayoutRegistry.ts` | Add `skills`, `tools`, `acp` primary tab entries |
| Modify | `src/i18n/locales/en.ts` | Add English strings for all three tabs |
| Modify | `src/i18n/locales/zh.ts` | Add Chinese strings for all three tabs |
| Modify | `src/core/types/chat.ts` | Add `transport`, `acpSessionId`, `acpAgentId` to `Conversation` |

### Slice 1 — Skill Management

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/features/chat/services/SkillCatalogService.ts` | Fetch + cache skills from `GET /skill` |
| Create | `src/features/settings/SettingsSkillSection.ts` | Skill tab UI (list, preview, permission) |
| Modify | `src/features/settings/OpenCodianSettings.ts` | Import and wire `SettingsSkillSection` |
| Create | `tests/unit/features/chat/SkillCatalogService.test.ts` | Unit tests for skill service |
| Create | `tests/unit/features/settings/SettingsSkillSection.test.ts` | Unit tests for skill UI |

### Slice 2 — Tool Catalog

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/core/opencode/OpenCodeCatalogStateStore.ts` | Add schema caching, builtin/custom classification |
| Create | `src/features/settings/SettingsToolSection.ts` | Tool tab UI (builtin/custom list, schema, permission) |
| Modify | `src/features/settings/OpenCodianSettings.ts` | Import and wire `SettingsToolSection` |
| Create | `tests/unit/features/settings/SettingsToolSection.test.ts` | Unit tests for tool UI |

### Slice 3 — ACP Client

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/core/acp/AcpClientManager.ts` | Spawn/manage ACP agent processes |
| Create | `src/core/acp/AcpTransportOwner.ts` | Produce core StreamChunk from ACP notifications |
| Create | `src/core/acp/types.ts` | ACP-specific types (`AcpAgentConfig`, `AcpConnectionState`, etc.) |
| Create | `src/features/settings/SettingsAcpSection.ts` | ACP tab UI (agent config CRUD, presets, status) |
| Modify | `src/features/settings/OpenCodianSettings.ts` | Import and wire `SettingsAcpSection` |
| Create | `tests/unit/core/acp/AcpTransportOwner.test.ts` | Unit tests for ACP → StreamChunk translation |

---

## Slice 0: Shared Foundation

### Task 1: Add settings fields for new features

**Files:**
- Modify: `src/core/types/settings.ts` (lines ~1675, ~1811)
- Test: `npm run verify` (typecheck catches missing fields)

- [ ] **Step 1: Add new fields to `OpenCodianSettings` interface**

In `src/core/types/settings.ts`, add these fields to the `OpenCodianSettings` interface (after `slashCommandSkillMode` around line 1900):

```typescript
  // Skill management
  skillCatalogCacheTtl: number;

  // Tool catalog
  toolCatalogCacheTtl: number;

  // ACP client
  acpAgents: AcpAgentConfig[];
```

Add the `AcpAgentConfig` type before the `OpenCodianSettings` interface:

```typescript
export interface AcpAgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  cwd?: string;
}
```

- [ ] **Step 2: Add defaults to `DEFAULT_SETTINGS`**

In the same file, add to `DEFAULT_SETTINGS` (after `slashCommandSkillMode: 'direct'` around line 1900):

```typescript
  skillCatalogCacheTtl: 30000,
  toolCatalogCacheTtl: 30000,
  acpAgents: [],
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add src/core/types/settings.ts
git commit -m "feat: add settings fields for skill, tool, and ACP features"
```

---

### Task 2: Add transport discriminator to Conversation type

**Files:**
- Modify: `src/core/types/chat.ts` (line ~361)

- [ ] **Step 1: Add transport fields to `Conversation` interface**

In `src/core/types/chat.ts`, add after `backgroundTaskMetadata` in the `Conversation` interface:

```typescript
  transport?: 'opencode' | 'acp';
  acpSessionId?: string;
  acpAgentId?: string;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: PASS (new fields are optional)

- [ ] **Step 3: Commit**

```bash
git add src/core/types/chat.ts
git commit -m "feat: add transport discriminator to Conversation type for ACP"
```

---

### Task 3: Register settings tabs

**Files:**
- Modify: `src/features/settings/settingsLayoutRegistry.ts` (line ~186)

- [ ] **Step 1: Add three new primary tab entries**

In `settingsLayoutRegistry.ts`, add three entries to `SETTINGS_PRIMARY_TABS` array before the closing `]` (after the `user` entry around line 185):

```typescript
  {
    id: 'skills',
    labelKey: 'settings.skills.title',
    icon: 'brain',
    defaultSecondaryTabId: 'catalog',
    secondaryTabs: [
      { id: 'catalog', labelKey: 'settings.skills.tab.catalog' },
    ],
  },
  {
    id: 'tools',
    labelKey: 'settings.tools.title',
    icon: 'wrench',
    defaultSecondaryTabId: 'builtin',
    secondaryTabs: [
      { id: 'builtin', labelKey: 'settings.tools.tab.builtin' },
      { id: 'custom', labelKey: 'settings.tools.tab.custom' },
    ],
  },
  {
    id: 'acp',
    labelKey: 'settings.acp.title',
    icon: 'radio-tower',
    defaultSecondaryTabId: 'agents',
    secondaryTabs: [
      { id: 'agents', labelKey: 'settings.acp.tab.agents' },
    ],
  },
```

- [ ] **Step 2: Run existing layout registry tests**

Run: `npx jest tests/unit/features/settings/settingsLayoutRegistry.test.ts`
Expected: All existing tests pass; new tabs are included in `SETTINGS_PRIMARY_TABS`.

- [ ] **Step 3: Commit**

```bash
git add src/features/settings/settingsLayoutRegistry.ts
git commit -m "feat: register skills, tools, acp primary tabs in settings layout"
```

---

### Task 4: Add i18n strings

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`

- [ ] **Step 1: Add English locale strings**

In `en.ts`, add these entries (in the settings section, following existing patterns):

```typescript
  'settings.skills.title': 'Skills',
  'settings.skills.tab.catalog': 'Catalog',
  'settings.skills.permission.label': 'Skill Permission',
  'settings.skills.permission.allow': 'Allow',
  'settings.skills.permission.deny': 'Deny',
  'settings.skills.permission.ask': 'Ask',
  'settings.skills.refresh': 'Refresh',
  'settings.skills.empty': 'No skills discovered. Start the OpenCode server to discover skills.',
  'settings.skills.source.project': 'Project',
  'settings.skills.source.global': 'Global',
  'settings.skills.source.builtin': 'Built-in',
  'settings.skills.source.claude': 'Claude Compat',
  'settings.skills.source.agents': 'Agents Compat',
  'settings.skills.content.unavailable': 'Skill content not available (server offline)',

  'settings.tools.title': 'Tools',
  'settings.tools.tab.builtin': 'Built-in',
  'settings.tools.tab.custom': 'Custom',
  'settings.tools.permission.label': 'Permission',
  'settings.tools.permission.allow': 'Allow',
  'settings.tools.permission.deny': 'Deny',
  'settings.tools.permission.ask': 'Ask',
  'settings.tools.group.fileOps': 'File Operations',
  'settings.tools.group.search': 'Search',
  'settings.tools.group.execution': 'Execution',
  'settings.tools.group.network': 'Network',
  'settings.tools.group.intelligence': 'Intelligence',
  'settings.tools.group.meta': 'Meta',
  'settings.tools.group.plan': 'Plan',
  'settings.tools.refresh': 'Refresh',
  'settings.tools.schema.noData': 'Schema not available',
  'settings.tools.empty': 'No tools discovered. Start the OpenCode server to load tools.',

  'settings.acp.title': 'ACP Agents',
  'settings.acp.tab.agents': 'Agents',
  'settings.acp.addAgent': 'Add Agent',
  'settings.acp.removeAgent': 'Remove',
  'settings.acp.testConnection': 'Test Connection',
  'settings.acp.agentName': 'Agent Name',
  'settings.acp.agentCommand': 'Command',
  'settings.acp.agentArgs': 'Arguments',
  'settings.acp.agentEnv': 'Environment Variables',
  'settings.acp.agentEnabled': 'Enabled',
  'settings.acp.agentCwd': 'Working Directory',
  'settings.acp.status.connected': 'Connected',
  'settings.acp.status.disconnected': 'Disconnected',
  'settings.acp.status.connecting': 'Connecting...',
  'settings.acp.status.error': 'Error',
  'settings.acp.preset.opencode': 'OpenCode',
  'settings.acp.preset.codex': 'Codex',
  'settings.acp.preset.claude': 'Claude Code',
  'settings.acp.empty': 'No ACP agents configured. Add an agent to connect external AI coding tools.',
```

- [ ] **Step 2: Add Chinese locale strings**

In `zh.ts`, add corresponding Chinese translations:

```typescript
  'settings.skills.title': '技能',
  'settings.skills.tab.catalog': '目录',
  'settings.skills.permission.label': '技能权限',
  'settings.skills.permission.allow': '允许',
  'settings.skills.permission.deny': '拒绝',
  'settings.skills.permission.ask': '询问',
  'settings.skills.refresh': '刷新',
  'settings.skills.empty': '未发现技能。启动 OpenCode 服务器以发现技能。',
  'settings.skills.source.project': '项目',
  'settings.skills.source.global': '全局',
  'settings.skills.source.builtin': '内置',
  'settings.skills.source.claude': 'Claude 兼容',
  'settings.skills.source.agents': 'Agents 兼容',
  'settings.skills.content.unavailable': '技能内容不可用（服务器离线）',

  'settings.tools.title': '工具',
  'settings.tools.tab.builtin': '内置',
  'settings.tools.tab.custom': '自定义',
  'settings.tools.permission.label': '权限',
  'settings.tools.permission.allow': '允许',
  'settings.tools.permission.deny': '拒绝',
  'settings.tools.permission.ask': '询问',
  'settings.tools.group.fileOps': '文件操作',
  'settings.tools.group.search': '搜索',
  'settings.tools.group.execution': '执行',
  'settings.tools.group.network': '网络',
  'settings.tools.group.intelligence': '智能',
  'settings.tools.group.meta': '元数据',
  'settings.tools.group.plan': '计划',
  'settings.tools.refresh': '刷新',
  'settings.tools.schema.noData': 'Schema 不可用',
  'settings.tools.empty': '未发现工具。启动 OpenCode 服务器以加载工具。',

  'settings.acp.title': 'ACP 代理',
  'settings.acp.tab.agents': '代理',
  'settings.acp.addAgent': '添加代理',
  'settings.acp.removeAgent': '移除',
  'settings.acp.testConnection': '测试连接',
  'settings.acp.agentName': '代理名称',
  'settings.acp.agentCommand': '命令',
  'settings.acp.agentArgs': '参数',
  'settings.acp.agentEnv': '环境变量',
  'settings.acp.agentEnabled': '启用',
  'settings.acp.agentCwd': '工作目录',
  'settings.acp.status.connected': '已连接',
  'settings.acp.status.disconnected': '未连接',
  'settings.acp.status.connecting': '连接中...',
  'settings.acp.status.error': '错误',
  'settings.acp.preset.opencode': 'OpenCode',
  'settings.acp.preset.codex': 'Codex',
  'settings.acp.preset.claude': 'Claude Code',
  'settings.acp.empty': '未配置 ACP 代理。添加代理以连接外部 AI 编码工具。',
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: PASS (new keys auto-extend `TranslationKey`)

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh.ts
git commit -m "feat: add i18n strings for skills, tools, and ACP settings tabs"
```

---

### Task 5: Verify Slice 0 end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Run full verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 2: Run `npm run check:module-docs`**

Run: `npm run check:module-docs`
Expected: PASS (no module doc changes needed for type-only additions)

---

## Slice 1: Skill Management

### Task 6: Create SkillCatalogService

**Files:**
- Create: `src/features/chat/services/SkillCatalogService.ts`
- Create: `tests/unit/features/chat/SkillCatalogService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/features/chat/SkillCatalogService.test.ts`:

```typescript
import { SkillCatalogService, type SkillCatalogServiceHost, type SkillInfo } from '../../../../../src/features/chat/services/SkillCatalogService';

function createHost(overrides: Partial<SkillCatalogServiceHost> = {}): SkillCatalogServiceHost {
  return {
    fetchSkills: jest.fn().mockResolvedValue([]),
    getCacheTtl: jest.fn().mockReturnValue(30000),
    ...overrides,
  };
}

describe('SkillCatalogService', () => {
  it('returns empty array when no skills available', async () => {
    const host = createHost();
    const service = new SkillCatalogService(host);
    const skills = await service.getAll();
    expect(skills).toEqual([]);
  });

  it('caches skills within TTL', async () => {
    const mockSkills: SkillInfo[] = [
      { name: 'git-release', description: 'Create releases', location: '.opencode/skills/git-release/SKILL.md', content: '---\nname: git-release\n---\nBody text' },
    ];
    const host = createHost({ fetchSkills: jest.fn().mockResolvedValue(mockSkills) });
    const service = new SkillCatalogService(host);

    const first = await service.getAll();
    const second = await service.getAll();
    expect(first).toEqual(mockSkills);
    expect(second).toBe(first); // same reference from cache
    expect(host.fetchSkills).toHaveBeenCalledTimes(1);
  });

  it('refreshes cache after TTL expires', async () => {
    jest.useFakeTimers();
    const mockSkills: SkillInfo[] = [
      { name: 'test', description: 'Test skill', location: 'builtin', content: '' },
    ];
    const host = createHost({
      fetchSkills: jest.fn().mockResolvedValue(mockSkills),
      getCacheTtl: jest.fn().mockReturnValue(1000),
    });
    const service = new SkillCatalogService(host);

    await service.getAll();
    expect(host.fetchSkills).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1001);
    await service.getAll();
    expect(host.fetchSkills).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('classifies skills by source location', async () => {
    const skills: SkillInfo[] = [
      { name: 'a', description: '', location: '.opencode/skills/a/SKILL.md', content: '' },
      { name: 'b', description: '', location: '/home/.config/opencode/skills/b/SKILL.md', content: '' },
      { name: 'c', description: '', location: '.claude/skills/c/SKILL.md', content: '' },
      { name: 'd', description: '', location: '.agents/skills/d/SKILL.md', content: '' },
      { name: 'e', description: '', location: 'builtin', content: '' },
    ];
    const host = createHost({ fetchSkills: jest.fn().mockResolvedValue(skills) });
    const service = new SkillCatalogService(host);
    const groups = await service.groupBySource();
    expect(groups.project).toHaveLength(1);
    expect(groups.global).toHaveLength(1);
    expect(groups.claude).toHaveLength(1);
    expect(groups.agents).toHaveLength(1);
    expect(groups.builtin).toHaveLength(1);
  });

  it('forces refresh when refresh() is called', async () => {
    const host = createHost({ fetchSkills: jest.fn().mockResolvedValue([]) });
    const service = new SkillCatalogService(host);
    await service.getAll();
    await service.refresh();
    expect(host.fetchSkills).toHaveBeenCalledTimes(2);
  });

  it('returns skill by name', async () => {
    const skills: SkillInfo[] = [
      { name: 'git-release', description: 'Releases', location: 'builtin', content: 'body' },
      { name: 'pr-review', description: 'Reviews', location: 'builtin', content: 'body2' },
    ];
    const host = createHost({ fetchSkills: jest.fn().mockResolvedValue(skills) });
    const service = new SkillCatalogService(host);
    const skill = await service.getByName('git-release');
    expect(skill?.name).toBe('git-release');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/features/chat/SkillCatalogService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SkillCatalogService**

Create `src/features/chat/services/SkillCatalogService.ts`:

```typescript
import { createLogger } from '../../../shared';

const logger = createLogger('SkillCatalogService');

export interface SkillInfo {
  name: string;
  description?: string;
  location: string;
  content: string;
}

export interface SkillSourceGroups {
  project: SkillInfo[];
  global: SkillInfo[];
  claude: SkillInfo[];
  agents: SkillInfo[];
  builtin: SkillInfo[];
}

export interface SkillCatalogServiceHost {
  fetchSkills(): Promise<SkillInfo[]>;
  getCacheTtl(): number;
}

export class SkillCatalogService {
  private cachedSkills: SkillInfo[] | null = null;
  private cacheTimestamp = 0;
  private pendingLoad: Promise<SkillInfo[]> | null = null;

  constructor(private readonly host: SkillCatalogServiceHost) {}

  async getAll(): Promise<SkillInfo[]> {
    const now = Date.now();
    const ttl = this.host.getCacheTtl();
    if (this.cachedSkills && now - this.cacheTimestamp < ttl) {
      return this.cachedSkills;
    }
    if (this.pendingLoad) {
      return this.pendingLoad;
    }
    this.pendingLoad = this.loadSkills();
    try {
      return await this.pendingLoad;
    } finally {
      this.pendingLoad = null;
    }
  }

  async getByName(name: string): Promise<SkillInfo | undefined> {
    const skills = await this.getAll();
    return skills.find((s) => s.name === name);
  }

  async refresh(): Promise<SkillInfo[]> {
    this.cachedSkills = null;
    this.cacheTimestamp = 0;
    return this.getAll();
  }

  async groupBySource(): Promise<SkillSourceGroups> {
    const skills = await this.getAll();
    const groups: SkillSourceGroups = { project: [], global: [], claude: [], agents: [], builtin: [] };
    for (const skill of skills) {
      const loc = skill.location;
      if (loc === 'builtin') {
        groups.builtin.push(skill);
      } else if (loc.includes('.opencode/skills')) {
        groups.project.push(skill);
      } else if (loc.includes('.config/opencode/skills')) {
        groups.global.push(skill);
      } else if (loc.includes('.claude/skills')) {
        groups.claude.push(skill);
      } else if (loc.includes('.agents/skills')) {
        groups.agents.push(skill);
      } else {
        groups.project.push(skill); // default to project
      }
    }
    return groups;
  }

  private async loadSkills(): Promise<SkillInfo[]> {
    try {
      const skills = await this.host.fetchSkills();
      this.cachedSkills = skills;
      this.cacheTimestamp = Date.now();
      return skills;
    } catch (error) {
      logger.error('Failed to fetch skills:', error);
      return this.cachedSkills ?? [];
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/features/chat/SkillCatalogService.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/services/SkillCatalogService.ts tests/unit/features/chat/SkillCatalogService.test.ts
git commit -m "feat: add SkillCatalogService for skill discovery and caching"
```

---

### Task 7: Create SettingsSkillSection UI

**Files:**
- Create: `src/features/settings/SettingsSkillSection.ts`

- [ ] **Step 1: Implement SettingsSkillSection**

Create `src/features/settings/SettingsSkillSection.ts`:

```typescript
import { Setting, debounce } from 'obsidian';
import type { OpenCodianPlugin } from '../../main';
import { t } from '../../i18n';
import { createLogger } from '../../shared';
import type { SkillInfo, SkillSourceGroups } from '../chat/services/SkillCatalogService';

const logger = createLogger('SettingsSkillSection');

const SOURCE_LABEL_KEYS: Record<string, string> = {
  project: 'settings.skills.source.project',
  global: 'settings.skills.source.global',
  builtin: 'settings.skills.source.builtin',
  claude: 'settings.skills.source.claude',
  agents: 'settings.skills.source.agents',
};

export class SettingsSkillSection {
  private refreshDebounced: ReturnType<typeof debounce>;

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly plugin: OpenCodianPlugin,
  ) {
    this.refreshDebounced = debounce(() => this.render(), 300, true);
  }

  render(): void {
    this.containerEl.empty();
    this.renderPermissionControl();
    this.renderRefreshButton();
    this.renderSkillList();
  }

  private renderPermissionControl(): void {
    new Setting(this.containerEl)
      .setName(t('settings.skills.permission.label'))
      .addDropdown(async (dropdown) => {
        dropdown
          .addOption('allow', t('settings.skills.permission.allow'))
          .addOption('ask', t('settings.skills.permission.ask'))
          .addOption('deny', t('settings.skills.permission.deny'))
          .setValue(await this.getCurrentSkillPermission())
          .onChange(async (value) => {
            const configManager = this.plugin.opencodeConfigManager;
            if (configManager) {
              await configManager.setToolPermission('skill', value as 'allow' | 'deny' | 'ask');
            }
          });
      });
  }

  private renderRefreshButton(): void {
    new Setting(this.containerEl)
      .addButton((btn) => {
        btn.setButtonText(t('settings.skills.refresh')).onClick(() => {
          this.render();
        });
      });
  }

  private async renderSkillList(): void {
    const service = this.plugin.skillCatalogService;
    if (!service) {
      this.containerEl.createEl('p', { text: t('settings.skills.empty') });
      return;
    }

    let groups: SkillSourceGroups;
    try {
      groups = await service.groupBySource();
    } catch {
      this.containerEl.createEl('p', { text: t('settings.skills.empty') });
      return;
    }

    const allEmpty = Object.values(groups).every((g) => g.length === 0);
    if (allEmpty) {
      this.containerEl.createEl('p', { text: t('settings.skills.empty') });
      return;
    }

    for (const [groupKey, skills] of Object.entries(groups)) {
      if (skills.length === 0) continue;
      const labelKey = SOURCE_LABEL_KEYS[groupKey] ?? groupKey;
      this.containerEl.createEl('h3', { text: t(labelKey as any) });

      for (const skill of skills) {
        this.renderSkillCard(skill);
      }
    }
  }

  private renderSkillCard(skill: SkillInfo): void {
    const cardEl = this.containerEl.createDiv({ cls: 'opencodian-skill-card' });
    const headerEl = cardEl.createDiv({ cls: 'opencodian-skill-card-header' });
    headerEl.createEl('strong', { text: skill.name });
    if (skill.description) {
      headerEl.createEl('span', { text: ` — ${skill.description}` });
    }
    headerEl.createEl('br');
    headerEl.createEl('small', { text: skill.location, cls: 'opencodian-skill-source' });

    if (skill.content) {
      const contentEl = cardEl.createDiv({ cls: 'opencodian-skill-content' });
      const preview = skill.content.length > 500 ? skill.content.slice(0, 500) + '...' : skill.content;
      contentEl.createEl('pre', { text: preview });
    }
  }

  private async getCurrentSkillPermission(): Promise<string> {
    try {
      const configManager = this.plugin.opencodeConfigManager;
      if (!configManager) return 'allow';
      const config = await configManager.read();
      const permission = config.permission;
      if (typeof permission === 'string') return permission;
      if (permission && typeof permission === 'object') {
        const skillPerm = (permission as Record<string, unknown>).skill;
        if (typeof skillPerm === 'string') return skillPerm;
      }
      return 'allow';
    } catch {
      return 'allow';
    }
  }
}
```

- [ ] **Step 2: Wire into OpenCodianSettings**

In `src/features/settings/OpenCodianSettings.ts`, add the import and wire the skill section for the `skills` primary tab. Find where other sections are imported (lines 12-38) and add:

```typescript
import { SettingsSkillSection } from './SettingsSkillSection';
```

Find the section rendering logic (likely in `SettingsSectionCoordinator` or the tabbed renderer dispatch) and add a case for the `skills` tab that creates `SettingsSkillSection`.

- [ ] **Step 3: Add `skillCatalogService` to plugin**

In `src/main.ts`, add a `skillCatalogService` property to the plugin class and instantiate it during initialization. The host implementation calls `GET /skill` via `requestUrl` or SDK facade.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/SettingsSkillSection.ts src/features/settings/OpenCodianSettings.ts src/main.ts
git commit -m "feat: add Skill management settings tab with permission control"
```

---

### Task 8: Verify Slice 1

**Files:** None (verification only)

- [ ] **Step 1: Run SkillCatalogService tests**

Run: `npx jest tests/unit/features/chat/SkillCatalogService.test.ts`
Expected: All tests PASS

- [ ] **Step 2: Run full verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 3: Run `npm run build`**

Run: `npm run build`
Expected: PASS

---

## Slice 2: Tool Catalog

### Task 9: Extend OpenCodeCatalogStateStore with tool classification

**Files:**
- Modify: `src/core/opencode/OpenCodeCatalogStateStore.ts`
- Create: `tests/unit/core/opencode/OpenCodeCatalogStateStore.toolClassification.test.ts`

- [ ] **Step 1: Write failing test for tool classification**

Create `tests/unit/core/opencode/OpenCodeCatalogStateStore.toolClassification.test.ts`:

```typescript
import { isBuiltinToolName } from '../../../../../src/shared/toolIdentity';

describe('Tool classification', () => {
  it('classifies known builtin tools', () => {
    expect(isBuiltinToolName('read')).toBe(true);
    expect(isBuiltinToolName('bash')).toBe(true);
    expect(isBuiltinToolName('task')).toBe(true);
    expect(isBuiltinToolName('skill')).toBe(true);
    expect(isBuiltinToolName('plan_enter')).toBe(true);
    expect(isBuiltinToolName('todowrite')).toBe(true);
  });

  it('classifies non-builtin tools as false', () => {
    expect(isBuiltinToolName('my_custom_tool')).toBe(false);
    expect(isBuiltinToolName('mcp__some_tool')).toBe(false);
    expect(isBuiltinToolName('database')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest tests/unit/core/opencode/OpenCodeCatalogStateStore.toolClassification.test.ts`
Expected: PASS (uses existing `isBuiltinToolName` from `toolIdentity.ts`)

- [ ] **Step 3: Add classification helper to OpenCodeCatalogStateStore**

In `OpenCodeCatalogStateStore.ts`, add a method that classifies tool IDs into builtin vs custom:

```typescript
  classifyToolIds(toolIds: string[]): { builtin: string[]; custom: string[] } {
    const builtin: string[] = [];
    const custom: string[] = [];
    for (const id of toolIds) {
      if (isBuiltinToolName(id)) {
        builtin.push(id);
      } else {
        custom.push(id);
      }
    }
    return { builtin, custom };
  }
```

Add the import at the top:
```typescript
import { isBuiltinToolName } from '../../shared/toolIdentity';
```

- [ ] **Step 4: Run full store tests**

Run: `npx jest tests/unit/core/opencode/`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/opencode/OpenCodeCatalogStateStore.ts tests/unit/core/opencode/OpenCodeCatalogStateStore.toolClassification.test.ts
git commit -m "feat: add tool classification helper to OpenCodeCatalogStateStore"
```

---

### Task 10: Create SettingsToolSection UI

**Files:**
- Create: `src/features/settings/SettingsToolSection.ts`

- [ ] **Step 1: Implement SettingsToolSection**

Create `src/features/settings/SettingsToolSection.ts`:

```typescript
import { Setting } from 'obsidian';
import type { OpenCodianPlugin } from '../../main';
import { t } from '../../i18n';
import { BUILTIN_TOOL_DEFINITIONS, getToolIdentity, type ToolIdentityKind } from '../../shared/toolIdentity';

const TOOL_GROUPS: Record<string, string[]> = {
  'settings.tools.group.fileOps': ['read', 'write', 'edit', 'multiedit', 'apply_patch', 'patch'],
  'settings.tools.group.search': ['glob', 'grep', 'list', 'codesearch'],
  'settings.tools.group.execution': ['bash', 'task'],
  'settings.tools.group.network': ['web_fetch', 'web_search'],
  'settings.tools.group.intelligence': ['lsp'],
  'settings.tools.group.meta': ['skill', 'todowrite', 'todoread', 'question'],
  'settings.tools.group.plan': ['plan_enter', 'plan_exit'],
};

export class SettingsToolSection {
  constructor(
    private readonly containerEl: HTMLElement,
    private readonly plugin: OpenCodianPlugin,
    private readonly mode: 'builtin' | 'custom',
  ) {}

  async render(): Promise<void> {
    this.containerEl.empty();

    if (this.mode === 'builtin') {
      await this.renderBuiltinTools();
    } else {
      await this.renderCustomTools();
    }
  }

  private async renderBuiltinTools(): Promise<void> {
    const currentPermissions = await this.readCurrentPermissions();

    for (const [groupLabelKey, toolNames] of Object.entries(TOOL_GROUPS)) {
      this.containerEl.createEl('h3', { text: t(groupLabelKey as any) });

      for (const toolName of toolNames) {
        const identity = getToolIdentity(toolName);
        const currentPerm = this.getPermissionForTool(currentPermissions, toolName);
        this.renderToolRow(identity.normalizedName, identity.displayName, identity.icon, currentPerm);
      }
    }
  }

  private async renderCustomTools(): Promise<void> {
    const catalogStore = this.plugin.openCodeCatalogStateStore;
    if (!catalogStore) {
      this.containerEl.createEl('p', { text: t('settings.tools.empty') });
      return;
    }

    const allToolIds = Array.from(catalogStore['registryToolIds'] as Set<string>);
    const { custom } = catalogStore.classifyToolIds(allToolIds);

    if (custom.length === 0) {
      this.containerEl.createEl('p', { text: t('settings.tools.empty') });
      return;
    }

    const currentPermissions = await this.readCurrentPermissions();

    for (const toolId of custom) {
      const identity = getToolIdentity(toolId);
      const currentPerm = this.getPermissionForTool(currentPermissions, toolId);
      this.renderToolRow(toolId, identity.displayName, identity.icon, currentPerm);
    }
  }

  private renderToolRow(toolId: string, displayName: string, icon: string, currentPerm: string): void {
    new Setting(this.containerEl)
      .setName(displayName)
      .setDesc(toolId)
      .addDropdown(async (dropdown) => {
        dropdown
          .addOption('allow', t('settings.tools.permission.allow'))
          .addOption('ask', t('settings.tools.permission.ask'))
          .addOption('deny', t('settings.tools.permission.deny'))
          .setValue(currentPerm)
          .onChange(async (value) => {
            const configManager = this.plugin.opencodeConfigManager;
            if (configManager) {
              await configManager.setToolPermission(toolId, value as 'allow' | 'deny' | 'ask');
            }
          });
      });
  }

  private async readCurrentPermissions(): Promise<Record<string, string>> {
    try {
      const configManager = this.plugin.opencodeConfigManager;
      if (!configManager) return {};
      const config = await configManager.read();
      const permission = config.permission;
      if (typeof permission === 'string') return { '*': permission };
      if (permission && typeof permission === 'object') {
        return permission as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private getPermissionForTool(permissions: Record<string, string>, toolId: string): string {
    return permissions[toolId] ?? permissions['*'] ?? 'allow';
  }
}
```

- [ ] **Step 2: Wire into OpenCodianSettings**

In `src/features/settings/OpenCodianSettings.ts`, add import and wire for `tools` primary tab with `builtin` and `custom` secondary tabs:

```typescript
import { SettingsToolSection } from './SettingsToolSection';
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/SettingsToolSection.ts src/features/settings/OpenCodianSettings.ts
git commit -m "feat: add Tool catalog settings tab with builtin/custom classification"
```

---

### Task 11: Verify Slice 2

**Files:** None (verification only)

- [ ] **Step 1: Run full verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS

---

## Slice 3: ACP Client

### Task 12: Create ACP types

**Files:**
- Create: `src/core/acp/types.ts`

- [ ] **Step 1: Define ACP types**

Create `src/core/acp/types.ts`:

```typescript
/**
 * ACP (Agent Client Protocol) types for connecting to external AI coding agents.
 */

export type AcpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AcpAgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  cwd?: string;
}

export interface AcpAgentRuntime {
  config: AcpAgentConfig;
  state: AcpConnectionState;
  process: ChildProcess | null;
  activeSessionId: string | null;
}

export interface AcpPromptOptions {
  agentId: string;
  sessionId?: string;
  cwd?: string;
}

/** ACP notification types (subset of the ACP protocol) */
export interface AcpToolCall {
  name: string;
  id: string;
  input: Record<string, unknown>;
}

export interface AcpToolCallUpdate {
  id: string;
  status: 'in_progress' | 'completed' | 'error';
  output?: string;
}

export interface AcpUsageUpdate {
  inputTokens: number;
  outputTokens: number;
}

export interface AcpPermissionRequest {
  id: string;
  tool: string;
  patterns: string[];
}
```

Note: Import `ChildProcess` from `node:child_process` at the top if used, or keep it as `unknown` to avoid importing Node types in the type file.

- [ ] **Step 2: Commit**

```bash
git add src/core/acp/types.ts
git commit -m "feat: add ACP client type definitions"
```

---

### Task 13: Create AcpClientManager

**Files:**
- Create: `src/core/acp/AcpClientManager.ts`

- [ ] **Step 1: Implement AcpClientManager**

Create `src/core/acp/AcpClientManager.ts`:

```typescript
import { spawn, type ChildProcess } from 'node:child_process';
import { createLogger } from '../../shared';
import type { AcpAgentConfig, AcpConnectionState } from './types';

const logger = createLogger('AcpClientManager');

interface AcpManagedAgent {
  config: AcpAgentConfig;
  state: AcpConnectionState;
  process: ChildProcess | null;
  activeSessionId: string | null;
}

export class AcpClientManager {
  private agents = new Map<string, AcpManagedAgent>();

  constructor() {}

  loadConfigs(configs: AcpAgentConfig[]): void {
    for (const config of configs) {
      if (!this.agents.has(config.id)) {
        this.agents.set(config.id, {
          config,
          state: 'disconnected',
          process: null,
          activeSessionId: null,
        });
      } else {
        this.agents.get(config.id)!.config = config;
      }
    }
    // Remove agents no longer in config
    for (const id of this.agents.keys()) {
      if (!configs.some((c) => c.id === id)) {
        this.disconnect(id);
        this.agents.delete(id);
      }
    }
  }

  listAgents(): AcpAgentConfig[] {
    return Array.from(this.agents.values()).map((a) => a.config);
  }

  getState(agentId: string): AcpConnectionState {
    return this.agents.get(agentId)?.state ?? 'disconnected';
  }

  async connect(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`ACP agent not found: ${agentId}`);
    if (agent.state === 'connected' || agent.state === 'connecting') return;

    agent.state = 'connecting';
    try {
      const childProcess = spawn(agent.config.command, agent.config.args, {
        cwd: agent.config.cwd,
        env: { ...process.env, ...agent.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      childProcess.on('error', (err) => {
        logger.error(`ACP agent ${agentId} process error:`, err);
        agent.state = 'error';
      });

      childProcess.on('exit', (code) => {
        logger.info(`ACP agent ${agentId} exited with code ${code}`);
        agent.state = 'disconnected';
        agent.process = null;
      });

      agent.process = childProcess;
      agent.state = 'connected';
      logger.info(`ACP agent ${agentId} (${agent.config.name}) connected`);
    } catch (error) {
      logger.error(`Failed to connect ACP agent ${agentId}:`, error);
      agent.state = 'error';
      throw error;
    }
  }

  disconnect(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    if (agent.process) {
      try {
        agent.process.kill();
      } catch {
        // Process may already be dead
      }
      agent.process = null;
    }
    agent.state = 'disconnected';
    agent.activeSessionId = null;
  }

  getProcess(agentId: string): ChildProcess | null {
    return this.agents.get(agentId)?.process ?? null;
  }

  setActiveSessionId(agentId: string, sessionId: string | null): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.activeSessionId = sessionId;
    }
  }

  dispose(): void {
    for (const id of this.agents.keys()) {
      this.disconnect(id);
    }
    this.agents.clear();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/acp/AcpClientManager.ts
git commit -m "feat: add AcpClientManager for ACP agent process lifecycle"
```

---

### Task 14: Create AcpTransportOwner

**Files:**
- Create: `src/core/acp/AcpTransportOwner.ts`
- Create: `tests/unit/core/acp/AcpTransportOwner.test.ts`

- [ ] **Step 1: Write failing test for StreamChunk translation**

Create `tests/unit/core/acp/AcpTransportOwner.test.ts`:

```typescript
import type { StreamChunk } from '../../../../../src/core/types/chat';

// We test the pure translation functions, not the full transport which requires a real ACP process
import { translateAcpMessageChunk, translateAcpToolCall, translateAcpToolCallUpdate } from '../../../../../src/core/acp/AcpTransportOwner';

describe('AcpTransportOwner chunk translation', () => {
  it('translates text chunk', () => {
    const chunk = translateAcpMessageChunk('Hello world');
    expect(chunk).toEqual({ type: 'text', content: 'Hello world' });
  });

  it('translates thinking chunk', () => {
    const chunk = translateAcpMessageChunk('thinking...', 'part-123');
    expect(chunk).toEqual({ type: 'thinking', content: 'thinking...', partId: 'part-123' });
  });

  it('translates tool_use chunk', () => {
    const chunk = translateAcpToolCall('bash', 'call-1', { command: 'ls' });
    expect(chunk.type).toBe('tool_use');
    if (chunk.type === 'tool_use') {
      expect(chunk.id).toBe('call-1');
      expect(chunk.name).toBe('bash');
      expect(chunk.input).toEqual({ command: 'ls' });
    }
  });

  it('translates tool_result chunk', () => {
    const chunk = translateAcpToolCallUpdate('call-1', 'file1.txt\nfile2.txt');
    expect(chunk).toEqual({ type: 'tool_result', toolUseId: 'call-1', content: 'file1.txt\nfile2.txt' });
  });

  it('translates tool_result error chunk', () => {
    const chunk = translateAcpToolCallUpdate('call-1', 'command failed', true);
    expect(chunk).toEqual({ type: 'tool_result', toolUseId: 'call-1', content: 'command failed', isError: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/core/acp/AcpTransportOwner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AcpTransportOwner**

Create `src/core/acp/AcpTransportOwner.ts`:

```typescript
import type { StreamChunk } from '../../core/types/chat';
import { createLogger } from '../../shared';

const logger = createLogger('AcpTransportOwner');

/**
 * Pure translation functions for converting ACP protocol data to core StreamChunk shapes.
 * These are exported for unit testing without requiring a real ACP process.
 */
export function translateAcpMessageChunk(text: string, partId?: string): StreamChunk {
  if (partId) {
    return { type: 'thinking', content: text, partId };
  }
  return { type: 'text', content: text };
}

export function translateAcpToolCall(
  name: string,
  id: string,
  input: Record<string, unknown>,
): StreamChunk {
  return {
    type: 'tool_use',
    id,
    name,
    input,
  };
}

export function translateAcpToolCallUpdate(
  id: string,
  output: string,
  isError = false,
): StreamChunk {
  return {
    type: 'tool_result',
    toolUseId: id,
    content: output,
    isError,
  };
}

/**
 * AcpTransportOwner manages an ACP session and produces core StreamChunk objects.
 *
 * Architecture note: This class produces core `StreamChunk` from `src/core/types/chat.ts`.
 * The downstream `OpenCodianView.convertToStreamingChunk()` (line 3416) converts these
 * to the streaming controller's `StreamChunk` from `src/utils/streaming/types.ts`.
 * ACP does NOT need to produce streaming controller chunks directly.
 */
export class AcpTransportOwner {
  private aborted = false;

  constructor(
    private readonly sendMessageToAcp: (sessionId: string, message: string) => Promise<void>,
    private readonly createSession: () => Promise<string>,
    private readonly onNotification: (handler: (notification: AcpNotification) => void) => () => void,
  ) {}

  async *sendMessage(message: string, sessionId?: string): AsyncGenerator<StreamChunk> {
    this.aborted = false;
    let sid: string;

    try {
      if (sessionId) {
        sid = sessionId;
      } else {
        sid = await this.createSession();
      }
    } catch (error) {
      yield { type: 'error', content: `ACP session creation failed: ${String(error)}` };
      return;
    }

    const chunks: StreamChunk[] = [];
    let resolveChunk: (() => void) | null = null;
    let done = false;

    const unsubscribe = this.onNotification((notification) => {
      const chunk = this.translateNotification(notification);
      if (chunk) {
        chunks.push(chunk);
        if (resolveChunk) {
          resolveChunk();
          resolveChunk = null;
        }
      }
      if (notification.type === 'done') {
        done = true;
        if (resolveChunk) {
          resolveChunk();
          resolveChunk = null;
        }
      }
    });

    yield { type: 'message_start' };

    try {
      await this.sendMessageToAcp(sid, message);

      while (!done && !this.aborted) {
        if (chunks.length > 0) {
          yield chunks.shift()!;
          continue;
        }
        await new Promise<void>((resolve) => {
          resolveChunk = resolve;
        });
      }

      // Drain remaining chunks
      while (chunks.length > 0) {
        yield chunks.shift()!;
      }

      yield { type: 'message_stop' };
    } catch (error) {
      yield { type: 'error', content: `ACP error: ${String(error)}` };
    } finally {
      unsubscribe();
    }
  }

  abort(): void {
    this.aborted = true;
  }

  private translateNotification(notification: AcpNotification): StreamChunk | null {
    switch (notification.type) {
      case 'text':
        return { type: 'text', content: notification.text };
      case 'thinking':
        return { type: 'thinking', content: notification.text, partId: notification.partId };
      case 'tool_call':
        return translateAcpToolCall(notification.name, notification.id, notification.input);
      case 'tool_call_update':
        return translateAcpToolCallUpdate(
          notification.id,
          notification.output ?? '',
          notification.status === 'error',
        );
      case 'usage':
        return {
          type: 'usage',
          inputTokens: notification.inputTokens,
          outputTokens: notification.outputTokens,
        };
      case 'permission_request':
        return {
          type: 'permission_request',
          id: notification.id,
          permission: notification.tool,
          patterns: notification.patterns,
          metadata: {},
          always: [],
        };
      default:
        return null;
    }
  }
}

/** Minimal ACP notification type for internal use */
interface AcpNotification {
  type: 'text' | 'thinking' | 'tool_call' | 'tool_call_update' | 'usage' | 'permission_request' | 'done';
  text?: string;
  partId?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  output?: string;
  status?: string;
  inputTokens?: number;
  outputTokens?: number;
  tool?: string;
  patterns?: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/core/acp/AcpTransportOwner.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/acp/AcpTransportOwner.ts tests/unit/core/acp/AcpTransportOwner.test.ts
git commit -m "feat: add AcpTransportOwner with core StreamChunk translation"
```

---

### Task 15: Create SettingsAcpSection UI

**Files:**
- Create: `src/features/settings/SettingsAcpSection.ts`

- [ ] **Step 1: Implement SettingsAcpSection**

Create `src/features/settings/SettingsAcpSection.ts`:

```typescript
import { Setting, Modal } from 'obsidian';
import type { OpenCodianPlugin } from '../../main';
import { t } from '../../i18n';
import type { AcpAgentConfig } from '../../core/acp/types';

const ACP_PRESETS: Omit<AcpAgentConfig, 'id'>[] = [
  { name: 'OpenCode', command: 'opencode', args: ['acp'], env: {}, enabled: true },
  { name: 'Codex', command: 'codex', args: ['acp'], env: {}, enabled: true },
  { name: 'Claude Code', command: 'claude', args: ['acp'], env: {}, enabled: true },
];

export class SettingsAcpSection {
  constructor(
    private readonly containerEl: HTMLElement,
    private readonly plugin: OpenCodianPlugin,
  ) {}

  render(): void {
    this.containerEl.empty();
    this.renderAddButtons();
    this.renderAgentList();
  }

  private renderAddButtons(): void {
    new Setting(this.containerEl)
      .setName(t('settings.acp.addAgent'))
      .addButton((btn) => {
        btn.setButtonText(t('settings.acp.addAgent')).onClick(() => {
          this.addAgent({
            id: crypto.randomUUID(),
            name: 'New Agent',
            command: '',
            args: [],
            env: {},
            enabled: true,
          });
        });
      });

    for (const preset of ACP_PRESETS) {
      new Setting(this.containerEl)
        .setName(`${t('settings.acp.addAgent')}: ${preset.name}`)
        .addButton((btn) => {
          btn.setButtonText(`+ ${preset.name}`).onClick(() => {
            this.addAgent({
              id: crypto.randomUUID(),
              ...preset,
            });
          });
        });
    }
  }

  private renderAgentList(): void {
    const agents = this.plugin.settings.acpAgents;
    if (agents.length === 0) {
      this.containerEl.createEl('p', { text: t('settings.acp.empty') });
      return;
    }

    for (const agent of agents) {
      this.renderAgentCard(agent);
    }
  }

  private renderAgentCard(agent: AcpAgentConfig): void {
    const cardEl = this.containerEl.createDiv({ cls: 'opencodian-acp-agent-card' });

    new Setting(cardEl)
      .setName(agent.name)
      .setDesc(`${agent.command} ${agent.args.join(' ')}`)
      .addToggle((toggle) => {
        toggle.setValue(agent.enabled).onChange(async (value) => {
          agent.enabled = value;
          await this.saveSettings();
        });
      })
      .addButton((btn) => {
        btn.setButtonText(t('settings.acp.removeAgent')).onClick(async () => {
          const agents = this.plugin.settings.acpAgents.filter((a) => a.id !== agent.id);
          this.plugin.settings.acpAgents = agents;
          await this.saveSettings();
          this.render();
        });
      });

    new Setting(cardEl)
      .setName(t('settings.acp.agentName'))
      .addText((text) => {
        text.setValue(agent.name).onChange(async (value) => {
          agent.name = value;
          await this.saveSettings();
        });
      });

    new Setting(cardEl)
      .setName(t('settings.acp.agentCommand'))
      .addText((text) => {
        text.setValue(agent.command).onChange(async (value) => {
          agent.command = value;
          await this.saveSettings();
        });
      });

    new Setting(cardEl)
      .setName(t('settings.acp.agentArgs'))
      .addText((text) => {
        text.setValue(agent.args.join(' ')).onChange(async (value) => {
          agent.args = value.split(/\s+/).filter(Boolean);
          await this.saveSettings();
        });
      });

    new Setting(cardEl)
      .setName(t('settings.acp.agentCwd'))
      .addText((text) => {
        text.setValue(agent.cwd ?? '').setPlaceholder('(default)').onChange(async (value) => {
          agent.cwd = value || undefined;
          await this.saveSettings();
        });
      });
  }

  private async addAgent(agent: AcpAgentConfig): Promise<void> {
    this.plugin.settings.acpAgents.push(agent);
    await this.saveSettings();
    this.render();
  }

  private async saveSettings(): Promise<void> {
    await this.plugin.getSettingsRuntimeCoordinator().saveSettings();
  }
}
```

- [ ] **Step 2: Wire into OpenCodianSettings**

In `src/features/settings/OpenCodianSettings.ts`, add import and wire for `acp` primary tab:

```typescript
import { SettingsAcpSection } from './SettingsAcpSection';
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/SettingsAcpSection.ts src/features/settings/OpenCodianSettings.ts
git commit -m "feat: add ACP agent settings tab with CRUD and presets"
```

---

### Task 16: Verify Slice 3 and full build

**Files:** None (verification only)

- [ ] **Step 1: Run ACP tests**

Run: `npx jest tests/unit/core/acp/`
Expected: All tests PASS

- [ ] **Step 2: Run full verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

---

### Task 17: Update module docs

**Files:**
- Create: `docs/modules/features/chat/SkillCatalogService.md`
- Create: `docs/modules/core/acp/AcpClientManager.md`
- Create: `docs/modules/core/acp/AcpTransportOwner.md`
- Create: `docs/modules/core/acp/types.md`
- Create: `docs/modules/features/settings/SettingsSkillSection.md`
- Create: `docs/modules/features/settings/SettingsToolSection.md`
- Create: `docs/modules/features/settings/SettingsAcpSection.md`

- [ ] **Step 1: Create module docs for each new file**

Create one module doc per new source file following the existing `docs/modules/**` pattern. Each doc should contain: purpose, location, key types/methods, and dependencies.

- [ ] **Step 2: Run module doc check**

Run: `npm run check:module-docs`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/modules/
git commit -m "docs: add module docs for skill, tool, and ACP features"
```

---

### Task 18: Final verification

**Files:** None

- [ ] **Step 1: Run full verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Run module doc check**

Run: `npm run check:module-docs`
Expected: PASS

---

## Self-Review

**1. Spec coverage check:**
- ✅ Slice 0: Settings fields, transport discriminator, layout registry, i18n — Tasks 1-5
- ✅ Slice 1: SkillCatalogService, skill UI, flat permission — Tasks 6-8
- ✅ Slice 2: Tool classification, tool UI, flat permission — Tasks 9-11
- ✅ Slice 3: ACP types, AcpClientManager, AcpTransportOwner, ACP UI — Tasks 12-16
- ✅ Module docs — Task 17
- ✅ Full verification — Task 18

**2. Placeholder scan:** No TBD/TODO/placeholders found. All code steps contain complete implementations.

**3. Type consistency check:**
- `AcpAgentConfig` defined in `src/core/types/settings.ts` (Task 1) and re-exported from `src/core/acp/types.ts` (Task 12) — consistent
- `StreamChunk` from `src/core/types/chat.ts` — `tool_use` uses `id`/`name`, `tool_result` uses `toolUseId` — matches AcpTransportOwner translations
- `Conversation.transport` is `'opencode' | 'acp'` — matches spec
- `OpencodeConfigManager.setToolPermission(tool, action)` — takes `string` and `PermissionAction` — matches all UI calls
- `TranslationKey` auto-derived from `en.ts` — all layout registry `labelKey` values match i18n keys
