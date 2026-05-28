# Phase 0: Capability-Driven Frontend Refactoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OpenCodian chat and settings UI backend-agnostic by introducing a `Capability` system that gates UI rendering, without changing any backend code.

**Architecture:** Define an `AgentCapability` enum and a `getActiveBackendCapabilities()` function that initially returns OpenCode's full capability set. Wrap all backend-specific UI branches with `hasCapability()` checks (UI rendering only — data subscriptions continue regardless of capability gates). Add `activeBackend`/`enabledBackends` to settings with a Backend management sub-tab. Add `backend` field to `Conversation` type and propagate through `ConversationMeta` + `StorageService` + `ConversationMetadataCache`. All changes are pure frontend — zero backend code modified, fully reversible.

**Tech Stack:** TypeScript, Obsidian API, existing OpenCodian architecture (settings registry, chat coordinators, storage service)

**Important Constraint:** Capability gates affect **UI rendering only**. Data subscriptions (e.g., `subscribeToSessionTodoUpdates`, `subscribeToSessionStatusUpdates`) must continue running even when the corresponding UI is hidden. This ensures data isn't lost if capabilities change at runtime or when switching backends.

**Spec References:**
- `docs/requirements/multi-agent-foundation/09-chat-surface-migration.md` (Chat Surface)
- `docs/requirements/multi-agent-foundation/10-settings-migration.md` (Settings Surface)
- `docs/requirements/multi-agent-foundation/08-phased-rollback.md` §2 (Phase 0 plan)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/core/agents/AgentCapability.ts` | `AgentCapability` enum + `BackendCapabilities` type + `getActiveBackendCapabilities()` + `hasCapability()` |
| Modify | `src/core/types/chat.ts` | Add `AgentBackendKind` type + `backend?: AgentBackendKind` to `Conversation` + `ConversationMeta` |
| Modify | `src/core/types/settings.ts` | Add `activeBackend`, `enabledBackends` + per-backend settings fields |
| Modify | `src/core/types/settings.ts` (normalize) | Add defaults for new fields in `settingsLoadNormalization.ts` |
| Modify | `src/features/settings/settingsLayoutRegistry.ts` | Add `'backend'` secondary tab under General; make 10 OpenCode-only tabs conditional; add `backendRequired` to `SettingsSecondaryTab` |
| Create | `src/features/settings/SettingsBackendSection.ts` | Backend management sub-tab UI (i18n-ized) |
| Modify | `src/features/settings/SettingsTabbedRenderer.ts` | Restructure `renderGeneralContent` for secondary-tab dispatch; wire backend section; conditional tab rendering |
| Modify | `src/features/chat/OpenCodianView.ts` | Wrap capability-gated UI calls with `hasCapability()` |
| Modify | `src/features/chat/services/ChatHeaderPresenter.ts` | Backend-agnostic status badge |
| Modify | `src/features/chat/runtime/UserMessageFooterRenderer.ts` | Gate Fork/Revert buttons with `branching` capability |
| Modify | `src/core/storage/StorageService.ts` | Fallback `backend` field on load for old conversations + update serialization |
| Modify | `src/core/storage/ConversationMetadataCache.ts` | Include `backend` in metadata cache |
| Modify | `module-docs.config.json` | Add mappings for new files |
| Create | `tests/unit/core/agents/AgentCapability.test.ts` | Tests for capability system |

---

## Task 1: Define AgentCapability Type System

**Files:**
- Create: `src/core/agents/AgentCapability.ts`
- Test: `tests/unit/core/agents/AgentCapability.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/core/agents/AgentCapability.test.ts
import { describe, it, expect } from '@jest/globals';
import {
  AgentCapability,
  OPENCODE_FULL_CAPABILITIES,
  getActiveBackendCapabilities,
  hasCapability,
} from '../../../../src/core/agents/AgentCapability';

describe('AgentCapability', () => {
  it('should define all 18 capabilities', () => {
    const expected: AgentCapability[] = [
      'tools', 'mcp', 'permissions', 'branching', 'todos', 'questions',
      'models', 'subagents', 'context', 'providers', 'compaction',
      'cost-tracking', 'thinking', 'hooks', 'config', 'file-ops', 'shell', 'export',
    ];
    expect(Object.values(AgentCapability)).toHaveLength(18);
    for (const cap of expected) {
      expect(Object.values(AgentCapability)).toContain(cap);
    }
  });

  it('OPENCODE_FULL_CAPABILITIES should include all capabilities', () => {
    expect(OPENCODE_FULL_CAPABILITIES.size).toBe(18);
  });

  it('getActiveBackendCapabilities returns full set for default opencode', () => {
    const caps = getActiveBackendCapabilities();
    expect(caps).toEqual(OPENCODE_FULL_CAPABILITIES);
  });

  it('hasCapability returns true for known capability in full set', () => {
    expect(hasCapability(OPENCODE_FULL_CAPABILITIES, AgentCapability.Tools)).toBe(true);
  });

  it('hasCapability returns false for capability not in set', () => {
    const empty = new Set<AgentCapability>();
    expect(hasCapability(empty, AgentCapability.Tools)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/core/agents/AgentCapability.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/agents/AgentCapability.ts

/**
 * Backend capability identifiers.
 * Each represents a discrete feature that an agent backend may or may not support.
 * UI uses hasCapability() to conditionally render backend-specific areas.
 *
 * See docs/requirements/multi-agent-foundation/09-chat-surface-migration.md §9 for
 * the complete capability → UI mapping table.
 */
export const AgentCapability = {
  Tools: 'tools',
  Mcp: 'mcp',
  Permissions: 'permissions',
  Branching: 'branching',
  Todos: 'todos',
  Questions: 'questions',
  Models: 'models',
  Subagents: 'subagents',
  Context: 'context',
  Providers: 'providers',
  Compaction: 'compaction',
  CostTracking: 'cost-tracking',
  Thinking: 'thinking',
  Hooks: 'hooks',
  Config: 'config',
  FileOps: 'file-ops',
  Shell: 'shell',
  Export: 'export',
} as const;

export type AgentCapability = (typeof AgentCapability)[keyof typeof AgentCapability];

/** Canonical representation of a backend's capability set. */
export type BackendCapabilities = ReadonlySet<AgentCapability>;

/**
 * OpenCode's full capability set. Phase 0 hardcodes this as the only backend.
 * Phase 1 will replace getActiveBackendCapabilities() with a registry lookup.
 */
export const OPENCODE_FULL_CAPABILITIES: BackendCapabilities = new Set<AgentCapability>(
  Object.values(AgentCapability),
);

/**
 * Get the capabilities of the currently active backend.
 * Phase 0: always returns OpenCode's full capabilities.
 * Phase 1+: will read from AgentServiceRegistry.
 */
export function getActiveBackendCapabilities(): BackendCapabilities {
  return OPENCODE_FULL_CAPABILITIES;
}

/** Check whether a capability set includes a specific capability. */
export function hasCapability(caps: BackendCapabilities, cap: AgentCapability): boolean {
  return caps.has(cap);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/core/agents/AgentCapability.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Export from agents/index.ts**

Add to `src/core/agents/index.ts`:
```typescript
export { AgentCapability, OPENCODE_FULL_CAPABILITIES, getActiveBackendCapabilities, hasCapability } from './AgentCapability';
export type { AgentCapability as AgentCapabilityType, BackendCapabilities } from './AgentCapability';
```

- [ ] **Step 6: Run full verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/agents/AgentCapability.ts src/core/agents/index.ts tests/unit/core/agents/AgentCapability.test.ts
git commit -m "feat: add AgentCapability type system for backend-aware UI"
```

---

## Task 2: Add `backend` Field to Conversation Type + Persistence

**Files:**
- Modify: `src/core/types/chat.ts:362-378` (Conversation + ConversationMeta)
- Modify: `src/core/storage/StorageService.ts` (conversation load + save paths)
- Modify: `src/core/storage/ConversationMetadataCache.ts` (metadata cache)

- [ ] **Step 1: Add `AgentBackendKind` type and extend `Conversation`**

Add before `Conversation` interface in `src/core/types/chat.ts`:

```typescript
/** Logical agent backend identity. Determines which adapter owns a session. */
export type AgentBackendKind = 'opencode' | 'claude-code' | 'codex' | 'copilot' | 'pi';
```

Add field to `Conversation` interface (after `acpAgentId`):

```typescript
  /** Which agent backend owns this conversation. Old data defaults to 'opencode'. */
  backend?: AgentBackendKind;
```

Also add `backend` to `ConversationMeta` type (around line 338):

```typescript
  backend?: AgentBackendKind;
```

- [ ] **Step 2: Update StorageService serialization**

In `src/core/storage/StorageService.ts`, find the method that saves/serializes conversations. Ensure `backend` field is included in serialization output (if the save method manually picks fields, add `backend`; if it serializes the whole object, it's automatic).

Find the method that loads/deserializes conversations. Add normalization:

```typescript
// After loading each conversation from storage:
if (!conversation.backend) {
  conversation.backend = 'opencode';
}
```

- [ ] **Step 3: Update ConversationMetadataCache**

In `ConversationMetadataCache.buildConversationMetaFromStoredRecord()`, ensure `backend` is copied from the stored record into the metadata object:

```typescript
backend: record.backend ?? 'opencode',
```

- [ ] **Step 4: Add test for default backend fallback**

```typescript
it('should default conversation backend to opencode when not set', () => {
  const conversation: Partial<Conversation> = { id: 'test' };
  // After StorageService normalization:
  expect(conversation.backend).toBe('opencode');
});
```

- [ ] **Step 5: Run verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types/chat.ts src/core/storage/StorageService.ts src/core/storage/ConversationMetadataCache.ts
git commit -m "feat: add backend field to Conversation type + ConversationMeta with opencode default"
```

---

## Task 3: Add Backend Management Settings

**Files:**
- Modify: `src/core/types/settings.ts` (add fields)
- Modify: `src/core/types/settingsLoadNormalization.ts` (add normalization)
- Create: `src/features/settings/SettingsBackendSection.ts`
- Modify: `src/features/settings/settingsLayoutRegistry.ts`
- Modify: `src/features/settings/SettingsTabbedRenderer.ts`
- Modify: locale files (`en.ts` + `zh.ts`)

- [ ] **Step 1: Add `AgentBackendKind` import and new fields to settings type**

In `src/core/types/settings.ts`, add to `OpenCodianSettings` interface:

```typescript
import { AgentBackendKind } from '../types/chat';

// Inside OpenCodianSettings:
  /** Currently active backend for new conversations. Default: 'opencode'. */
  activeBackend: AgentBackendKind;

  /** List of enabled backends. At least one must always be enabled. */
  enabledBackends: AgentBackendKind[];
```

- [ ] **Step 2: Add normalization in settingsLoadNormalization.ts**

In `src/core/types/settingsLoadNormalization.ts`, find `normalizeLoadedPluginSettings()` (around line 473). Add:

```typescript
activeBackend: raw.activeBackend ?? 'opencode',
enabledBackends: raw.enabledBackends ?? ['opencode'],
```

This ensures old saved settings without these fields get correct defaults.

- [ ] **Step 3: Add 'backend' secondary tab to General in settingsLayoutRegistry.ts**

In `src/features/settings/settingsLayoutRegistry.ts`, find the `general` primary tab definition and add a new secondary tab. Follow existing convention:

```typescript
// In the general primary tab's secondaryTabs array, add:
{ id: 'backend', labelKey: 'settings.general.tab.backend' },
```

- [ ] **Step 4: Create SettingsBackendSection.ts (i18n-ized)**

```typescript
// src/features/settings/SettingsBackendSection.ts
import { Setting } from 'obsidian';
import type OpenCodianPlugin from '../../main';
import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../core/i18n';

const ALL_BACKENDS: { kind: AgentBackendKind; name: string; descKey: string }[] = [
  { kind: 'opencode', name: 'OpenCode', descKey: 'settings.backend.opencode.desc' },
  { kind: 'claude-code', name: 'Claude Code', descKey: 'settings.backend.claude-code.desc' },
  { kind: 'codex', name: 'Codex', descKey: 'settings.backend.codex.desc' },
  { kind: 'copilot', name: 'Copilot', descKey: 'settings.backend.copilot.desc' },
  { kind: 'pi', name: 'Pi', descKey: 'settings.backend.pi.desc' },
];

export class SettingsBackendSection {
  constructor(private plugin: OpenCodianPlugin) {}

  attachTabbed(containerEl: HTMLElement): void {
    const { settings } = this.plugin;

    // --- Default Backend Selector ---
    new Setting(containerEl)
      .setName(t('settings.backend.default'))
      .setDesc(t('settings.backend.default.desc'))
      .addDropdown((dd) => {
        for (const b of ALL_BACKENDS) {
          if (settings.enabledBackends.includes(b.kind)) {
            dd.addOption(b.kind, b.name);
          }
        }
        dd.setValue(settings.activeBackend);
        dd.onChange(async (val) => {
          settings.activeBackend = val as AgentBackendKind;
          await this.plugin.saveSettings();
        });
      });

    // --- Backend List ---
    containerEl.createEl('h3', { text: t('settings.backend.enabled') });

    for (const b of ALL_BACKENDS) {
      const isEnabled = settings.enabledBackends.includes(b.kind);
      const isLastEnabled = settings.enabledBackends.length <= 1 && isEnabled;
      const isOpencode = b.kind === 'opencode';

      new Setting(containerEl)
        .setName(b.name)
        .setDesc(t(b.descKey))
        .addToggle((toggle) => {
          toggle.setValue(isEnabled);
          // OpenCode cannot be disabled in Phase 0; last backend can't be disabled
          toggle.setDisabled(isLastEnabled || isOpencode);
          if (isOpencode) {
            toggle.setTooltip(t('settings.backend.opencode.required'));
          }
          toggle.onChange(async (enabled) => {
            if (enabled) {
              if (!settings.enabledBackends.includes(b.kind)) {
                settings.enabledBackends.push(b.kind);
              }
            } else {
              settings.enabledBackends = settings.enabledBackends.filter((k) => k !== b.kind);
              if (settings.activeBackend === b.kind) {
                settings.activeBackend = 'opencode';
              }
              if (settings.enabledBackends.length === 0) {
                settings.enabledBackends = ['opencode'];
              }
            }
            await this.plugin.saveSettings();
            this.refresh(containerEl);
          });
        });

      if (isEnabled) {
        const statusEl = containerEl.createSpan({
          cls: 'opencodian-backend-status',
          text: isOpencode ? t('settings.backend.status.active') : t('settings.backend.status.enabled'),
        });
        statusEl.style.color = 'var(--text-success)';
      }
    }
  }

  private refresh(containerEl: HTMLElement): void {
    containerEl.empty();
    this.attachTabbed(containerEl);
  }
}
```

- [ ] **Step 5: Restructure renderGeneralContent for secondary-tab dispatch**

In `SettingsTabbedRenderer.ts`, add static import at top:

```typescript
import { SettingsBackendSection } from './SettingsBackendSection';
```

Find `renderGeneralContent()`. Currently it renders all general settings in one block ignoring `secondaryTabId`. Restructure to dispatch:

```typescript
renderGeneralContent(containerEl: HTMLElement, secondaryTabId: string): void {
  switch (secondaryTabId) {
    case 'backend': {
      const section = new SettingsBackendSection(this.deps.plugin);
      section.attachTabbed(containerEl);
      break;
    }
    case 'basic':
    default: {
      // existing general settings rendering code (unchanged)
      break;
    }
  }
}
```

- [ ] **Step 6: Add i18n keys to BOTH locale files**

Add to `en.ts`:
```typescript
'settings.general.tab.backend': 'Backend Management',
'settings.backend.default': 'Default Backend',
'settings.backend.default.desc': 'Backend used for new conversations',
'settings.backend.enabled': 'Enabled Backends',
'settings.backend.opencode.desc': 'Built-in OpenCode backend (default)',
'settings.backend.claude-code.desc': 'Anthropic Claude Code SDK — Coming Soon',
'settings.backend.codex.desc': 'OpenAI Codex CLI — Coming Soon',
'settings.backend.copilot.desc': 'GitHub Copilot — Coming Soon',
'settings.backend.pi.desc': 'Pi Coding Agent — Coming Soon',
'settings.backend.opencode.required': 'OpenCode is the default backend and cannot be disabled',
'settings.backend.status.active': '● Active',
'settings.backend.status.enabled': '● Enabled',
```

Add to `zh.ts`:
```typescript
'settings.general.tab.backend': 'Backend 管理',
'settings.backend.default': '默认 Backend',
'settings.backend.default.desc': '新建会话使用的后端',
'settings.backend.enabled': '已启用 Backend',
'settings.backend.opencode.desc': '内置 OpenCode 后端（默认）',
'settings.backend.claude-code.desc': 'Anthropic Claude Code SDK — 即将推出',
'settings.backend.codex.desc': 'OpenAI Codex CLI — 即将推出',
'settings.backend.copilot.desc': 'GitHub Copilot — 即将推出',
'settings.backend.pi.desc': 'Pi Coding Agent — 即将推出',
'settings.backend.opencode.required': 'OpenCode 是默认后端，不可禁用',
'settings.backend.status.active': '● 使用中',
'settings.backend.status.enabled': '● 已启用',
```

- [ ] **Step 7: Run verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/core/types/settings.ts src/core/types/settingsLoadNormalization.ts src/features/settings/SettingsBackendSection.ts src/features/settings/settingsLayoutRegistry.ts src/features/settings/SettingsTabbedRenderer.ts
git commit -m "feat: add backend management settings section with i18n"
```

---

## Task 4: Conditional Settings Tab Display

**Files:**
- Modify: `src/features/settings/settingsLayoutRegistry.ts`
- Modify: `src/features/settings/SettingsTabbedRenderer.ts`

- [ ] **Step 1: Add isBackendOnly flag to primary tab definitions**

In `settingsLayoutRegistry.ts`, extend `SettingsPrimaryTabDefinition` to include:

```typescript
export interface SettingsPrimaryTabDefinition {
  id: string;
  labelKey: string;
  icon: string;
  defaultSecondaryTabId: string;
  secondaryTabs: { id: string; labelKey: string }[];
  /** If set, this tab only shows when the specified backend is enabled. */
  backendRequired?: AgentBackendKind;
}
```

- [ ] **Step 2: Mark OpenCode-only tabs**

Add `backendRequired: 'opencode'` to these 10 tabs:

```typescript
{ id: 'server', backendRequired: 'opencode', ... },
{ id: 'model', backendRequired: 'opencode', ... },
{ id: 'agents', backendRequired: 'opencode', ... },
{ id: 'commands', backendRequired: 'opencode', ... },
{ id: 'mcp', backendRequired: 'opencode', ... },
{ id: 'formatter', backendRequired: 'opencode', ... },
{ id: 'plugins', backendRequired: 'opencode', ... },
{ id: 'skills', backendRequired: 'opencode', ... },
{ id: 'tools', backendRequired: 'opencode', ... },
{ id: 'acp', backendRequired: 'opencode', ... },
```

- [ ] **Step 3: Filter tabs in SettingsTabbedRenderer**

In the tab rendering logic, filter `SETTINGS_PRIMARY_TABS` before rendering:

```typescript
import { getActiveBackendCapabilities } from '../../core/agents/AgentCapability';
// Or simpler: check plugin.settings.enabledBackends

const visibleTabs = SETTINGS_PRIMARY_TABS.filter((tab) => {
  if (!tab.backendRequired) return true;
  return this.deps.plugin.settings.enabledBackends.includes(tab.backendRequired);
});
```

- [ ] **Step 4: Add active tab fallback**

When the currently saved `settingsTabbedPrimaryTab` is hidden, fall back to `'general'`:

```typescript
if (!visibleTabs.some((t) => t.id === currentPrimaryTab)) {
  currentPrimaryTab = 'general';
}
```

- [ ] **Step 5: Mark Conversation's OpenCode-only sub-tabs**

The `conversation` primary tab stays always visible, but its `compaction`, `sharing`, and `questions` sub-tabs are OpenCode-only.

Extend `SettingsSecondaryTab` type to include `backendRequired?`:

```typescript
export interface SettingsSecondaryTab {
  id: string;
  labelKey: string;
  /** If set, this sub-tab only shows when the specified backend is enabled. */
  backendRequired?: AgentBackendKind;
}
```

Mark these 3 secondary tabs:

```typescript
{ id: 'compaction', labelKey: '...', backendRequired: 'opencode' },
{ id: 'sharing', labelKey: '...', backendRequired: 'opencode' },
{ id: 'questions', labelKey: '...', backendRequired: 'opencode' },
```

Update secondary tab rendering to filter by `backendRequired` using the same logic as Step 3.

- [ ] **Step 6: Run verify**

Run: `npm run verify`
Expected: PASS (Phase 0 default: all tabs visible, behavior unchanged)

- [ ] **Step 7: Commit**

```bash
git add src/features/settings/settingsLayoutRegistry.ts src/features/settings/SettingsTabbedRenderer.ts
git commit -m "feat: add conditional settings tab display based on enabled backends"
```

---

## Task 5: Capability-Gated Chat UI — High Priority Elements

**Files:**
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/features/chat/runtime/UserMessageFooterRenderer.ts` (Fork/Revert)
- Reference: `src/core/agents/AgentCapability.ts`

This task wraps the most impactful UI areas with `hasCapability()` checks. We gate 5 high-priority elements.

- [ ] **Step 1: Import capability helpers at top of OpenCodianView.ts**

```typescript
import { getActiveBackendCapabilities, hasCapability, AgentCapability } from '../../core/agents/AgentCapability';
```

Add a convenience getter:

```typescript
private get caps() {
  return getActiveBackendCapabilities();
}
```

- [ ] **Step 2: Gate TodoDock — `todos` capability**

Find where `TodoDock` is rendered (search for `TodoDock` or `sessionTodoCoordinator`). Wrap:

```typescript
if (hasCapability(this.caps, AgentCapability.Todos)) {
  // existing TodoDock rendering code
}
```

- [ ] **Step 3: Gate QuestionDock — `questions` capability**

Find where `QuestionDock` or `questionDockCoordinator` is rendered. Wrap:

```typescript
if (hasCapability(this.caps, AgentCapability.Questions)) {
  // existing QuestionDock rendering code
}
```

- [ ] **Step 4: Gate Fork/Revert buttons — `branching` capability**

In `src/features/chat/runtime/UserMessageFooterRenderer.ts`, find where fork/revert buttons are created (lines 32-45). Add `hasBranchingCapability(): boolean` to the `UserMessageFooterRendererHost` interface. In `OpenCodianView.createUserMessageFooterRendererHost()`, implement it to return `hasCapability(getActiveBackendCapabilities(), AgentCapability.Branching)`. In `UserMessageFooterRenderer.render()`, wrap fork/revert button creation:

```typescript
if (this.host.hasBranchingCapability()) {
  // fork button
  // revert button
}
```

Note: `UserMessageFooterRenderer` is not owned by `OpenCodianView`, so it uses the host interface pattern rather than `this.caps` directly.

- [ ] **Step 5: Gate PermissionInlineCard — `permissions` capability**

Find where `PermissionInlineCard` is rendered. Wrap:

```typescript
if (hasCapability(this.caps, AgentCapability.Permissions)) {
  // existing permission card rendering
}
```

- [ ] **Step 6: Gate ContextRing — `context` capability**

Find where `ContextRing` / `ContextUsageService` is rendered in the input area. Wrap:

```typescript
if (hasCapability(this.caps, AgentCapability.Context)) {
  // existing context ring rendering
}
```

- [ ] **Step 7: Run verify**

Run: `npm run verify`
Expected: PASS (OpenCode has all capabilities, so all UI still renders)

- [ ] **Step 8: Commit**

```bash
git add src/features/chat/OpenCodianView.ts src/features/chat/runtime/UserMessageFooterRenderer.ts
git commit -m "feat: add capability gates for TodoDock, QuestionDock, Fork/Revert, Permission, Context"
```

---

## Task 6: Capability-Gated Chat UI — Medium Priority Elements

**Files:**
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/features/chat/services/ChatHeaderPresenter.ts`

- [ ] **Step 1: Gate BackgroundTaskPanel — `subagents` capability**

Find where `BackgroundTaskInlinePanel` / `BackgroundTaskIndicator` / `BackgroundTaskTimeline` / `BackgroundTaskCompletionNotice` are rendered. Wrap each with:

```typescript
if (hasCapability(this.caps, AgentCapability.Subagents)) {
  // existing background task rendering
}
```

- [ ] **Step 2: Gate ChildSessionTree — `subagents` capability**

Find `ChildSessionTree` rendering. Wrap:

```typescript
if (hasCapability(this.caps, AgentCapability.Subagents)) {
  // existing child session tree rendering
}
```

- [ ] **Step 3: Gate ModifiedFilesSidebar — session diff data**

Find `showModifiedFilesSidebar` usage. This depends on both the user setting AND the backend having session diff. Add capability check:

```typescript
if (hasCapability(this.caps, AgentCapability.Context)) {
  // existing modified files sidebar logic (context capability implies session diff)
}
```

Note: There's no explicit `sessionDiff` capability — it's bundled into `context`. If a backend doesn't have session diffs, the sidebar will simply show no files.

- [ ] **Step 4: Gate Agent mention (@) — OpenCode only**

Find the agent mention dropdown trigger. Wrap:

```typescript
if (this.plugin.settings.activeBackend === 'opencode') {
  // existing @ mention logic
}
```

- [ ] **Step 5: Gate Slash command menu (/) — OpenCode only**

Find the slash command menu trigger. Wrap:

```typescript
if (this.plugin.settings.activeBackend === 'opencode') {
  // existing slash command logic
}
```

- [ ] **Step 6: Gate LSP indicator — OpenCode only**

In `ChatHeaderPresenter.ts`, find LSP status rendering. Wrap:

```typescript
if (this.plugin.settings.activeBackend === 'opencode') {
  // existing LSP indicator
}
```

- [ ] **Step 7: Gate EffortSelector — `thinking` capability**

Find the Effort/Thinking selector in the input area toolbar. Wrap:

```typescript
if (hasCapability(this.caps, AgentCapability.Thinking)) {
  // existing effort selector
}
```

- [ ] **Step 8: Gate Tool skill blocks — OpenCode only**

In `ToolCallRenderer` or the tool identity system, check tool `source` — skill tools (`source: 'opencode'` with `kind: 'skill'`) should only render when backend is OpenCode. This may already be handled by `toolIdentity.ts` source matching, but verify and add explicit gate if needed.

- [ ] **Step 9: Gate Compaction divider — `compaction` capability**

Find `CompactionDividerMeta` rendering in message display. Wrap:

```typescript
if (hasCapability(this.caps, AgentCapability.Compaction)) {
  // existing compaction divider rendering
}
```

- [ ] **Step 10: Run verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/features/chat/OpenCodianView.ts src/features/chat/services/ChatHeaderPresenter.ts
git commit -m "feat: add capability gates for remaining chat UI elements"
```

---

## Task 7: Session Attribution + History Filtering

**Files:**
- Modify: `src/features/chat/OpenCodianView.ts` (new session creation)
- Modify: conversation history rendering (wherever conversations are listed)

- [ ] **Step 1: Tag new conversations with backend**

Find where new `Conversation` objects are created (likely in `newSession()` or similar). Add:

```typescript
const conversation: Conversation = {
  // ... existing fields ...
  backend: this.plugin.settings.activeBackend,
};
```

- [ ] **Step 2: Filter conversation history by active backend**

Find where the conversation list/dialog is rendered. Add filtering:

```typescript
const filteredConversations = allConversations.filter(
  (c) => (c.backend ?? 'opencode') === this.plugin.settings.activeBackend,
);
```

- [ ] **Step 3: Run verify**

Run: `npm run verify`
Expected: PASS (all existing conversations get `'opencode'` fallback, filter is no-op)

- [ ] **Step 4: Commit**

```bash
git add src/features/chat/OpenCodianView.ts
git commit -m "feat: add session backend attribution and history filtering"
```

---

## Task 8: Update Module Docs + Config

**Files:**
- Create: `docs/modules/core/agents/AgentCapability.md`
- Modify: `docs/modules/core/types/chat.md` (update Conversation docs)
- Modify: `docs/modules/core/types/settings.md` (update settings docs)
- Modify: `docs/modules/features/chat/OpenCodianView.md` (note capability gates)
- Create: `docs/modules/features/settings/SettingsBackendSection.md`
- Modify: `module-docs.config.json` (add mappings for new files)

- [ ] **Step 1: Update module-docs.config.json for new files**

Add entries for:
- `src/core/agents/AgentCapability.ts` → `docs/modules/core/agents/AgentCapability.md`
- `src/features/settings/SettingsBackendSection.ts` → `docs/modules/features/settings/SettingsBackendSection.md`
- `tests/unit/core/agents/AgentCapability.test.ts` → test docs (if configured)

Run: `npm run check:module-docs`
Note any failures indicating new/changed modules that need docs.

- [ ] **Step 2: Create/update module docs for each touched module**

Follow existing module doc patterns. For each new file:
- Purpose
- Public API
- Dependencies
- Owner notes

- [ ] **Step 3: Run module-doc check**

Run: `npm run check:module-docs`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/modules/
git commit -m "docs: update module docs for Phase 0 capability-driven refactoring"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run full verify**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 2: Run graphify update (src/ changed)**

Run: `npm run graphify:update:src`

- [ ] **Step 3: Run graphify check**

Run: `npm run check:graphify`
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Deploy to test vault, verify:
- Settings shows Backend management sub-tab under General
- All OpenCode tabs visible (default state)
- Chat UI renders all elements (TodoDock, QuestionDock, Fork/Revert, etc.)
- New conversations have `backend: 'opencode'`
- Old conversations display normally

- [ ] **Step 5: Commit graphify artifacts**

```bash
git add graphify-out/
git commit -m "chore: refresh graphify after Phase 0 capability-driven refactoring"
```
