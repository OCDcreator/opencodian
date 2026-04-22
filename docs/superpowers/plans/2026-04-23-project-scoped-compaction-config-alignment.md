# Project-Scoped Compaction Config Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 OpenCodian 的自动压缩配置完全对齐 OpenCode SDK / backend 契约：压缩配置只作为当前项目 `.opencode/opencode.json` 的共享配置存在，删除错误的 per-session 压缩覆盖，保留手动 `session.summarize()` 作为会话级动作而不是会话级配置。

**Architecture:** 把项目 `.opencode/opencode.json` 作为用户可见的 compaction 配置真相源，设置页直接读写完整的 `compaction` 对象；会话设置仅保留真正的会话级显示项（当前只保留聊天字体大小）。运行时热应用不再由会话切换去推送 compaction，而是由设置保存后触发项目级实例重载，让当前 scoped backend 重新读取项目配置。

**Tech Stack:** TypeScript, Jest, Obsidian plugin settings UI, existing `OpencodeConfigManager`, OpenCode scoped instance lifecycle, module-doc guard, Test Vault deploy flow

---

## Scope And Non-Goals

### In scope

- 删除错误的 per-conversation compaction 数据模型与 UI。
- 让设置页的 compaction 控件直接编辑项目 `.opencode/opencode.json`。
- 对齐上游完整 compaction 字段：
  - `auto`
  - `prune`
  - `tail_turns`
  - `preserve_recent_tokens`
  - `reserved`
- 保存项目 compaction 后，触发 scoped backend 重载并给出明确提示。
- 保持已完成的 compaction transcript / `summary` / `session.compacted` 适配不回退。

### Out of scope

- 不新增新的手动压缩按钮或命令入口；只保留现有 `summarizeSession()` facade。
- 不重做 compaction transcript UI。
- 不扩展到 global `~/.opencode/opencode.json` 配置编辑。
- 不继续沿用“当前会话 compaction override”这一错误产品语义。

## Contract Summary For The Implementer

### Upstream truth

- 项目级 compaction 配置由 OpenCode config schema 定义：
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\config\config.ts`
- 当前 schema 已支持：
  - `auto`
  - `prune`
  - `tail_turns`
  - `preserve_recent_tokens`
  - `reserved`
- 自动压缩是否触发由会话运行时根据 **共享 config** 决定，而不是 per-session override：
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\overflow.ts`
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts`
- 手动压缩是单次动作：
  - `sdk.session.summarize(...)`
  - `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\sdk\js\src\v2\gen\sdk.gen.ts`

### Important defaults that the UI must respect

- `auto`: 缺省即启用；只有显式 `false` 才关闭自动压缩。
- `prune`: 缺省即启用；只有显式 `false` 才关闭工具输出修剪。
- `tail_turns`: 缺省 `2`。
- `preserve_recent_tokens`: 缺省是动态预算，不应强制写死到项目配置里；留空表示“跟随 OpenCode 默认策略”。
- `reserved`: 缺省是动态值 `min(20_000, maxOutputTokens(model))`；留空表示“跟随 OpenCode 默认策略”。

### Product rules after this change

1. `Conversation.sessionSettings` 不再承载任何 compaction 字段。
2. `OpenCodianSettings` 不再承载 compaction 默认值。
3. “会话设置”弹窗不再出现 compaction 分组。
4. 设置页中的 compaction 控件代表“当前项目的 OpenCode 压缩配置”。
5. 保存项目 compaction 后，如果重载当前 scoped backend，会中断当前进行中的对话；必须有明确提示文案。
6. 手动 `session.summarize()` 仍然是会话级 API，但不是本轮要新增的 UI。

## Reference Map

### Current repo files that must be understood first

- `src/core/types/settings.ts`
- `src/core/types/settingsLoadNormalization.ts`
- `src/core/types/chat.ts`
- `src/core/types/opencodeConfig.ts`
- `src/core/config/OpencodeConfigManager.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/features/settings/SettingsConversationSection.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`

### Existing status docs to keep aligned

- `docs/status/opencode-auto-compaction-adaptation-report-2026-04-22.md`
- `docs/status/opencode-auto-compaction-debug-handoff-2026-04-23.md`

## File Structure And Ownership

### Modify

- `src/core/types/opencodeConfig.ts`
  - 补齐完整 compaction 字段类型。
- `src/core/types/settings.ts`
  - 删除插件级 compaction 默认值。
- `src/core/types/settingsLoadNormalization.ts`
  - 删除插件 settings 中 compaction 默认值的加载/归一化。
- `src/core/types/chat.ts`
  - 删除 `ConversationSessionSettings` 里的 compaction 字段，只保留真实会话级显示设置。
- `src/core/opencode/OpenCodeService.ts`
  - 停止暴露“按当前会话应用 compaction config”的语义；改为项目级重载/验证语义。
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
  - 删除 compaction 分组，保留字体大小覆盖。
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
  - 删除 compaction apply / queue / fallback；只处理视觉状态。
- `src/features/chat/OpenCodianView.ts`
  - 精简会话设置 host wiring，去掉 compaction runtime callbacks。
- `src/features/settings/SettingsConversationSection.ts`
  - 把 compaction 控件改成项目 `.opencode/opencode.json` 编辑器。
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 删除/改写错误的 per-session compaction 文案，新增项目级 compaction 文案与提示。
- `devlog.md`
  - 记录本轮语义纠偏与实现方式。

### Tests to modify

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/core/types/chat.test.ts`
- `tests/unit/core/storage/StorageService.test.ts`
- `tests/unit/core/config/OpencodeConfigManager.test.ts`
- `tests/unit/core/opencode/OpenCodeService.compactionConfig.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsModal.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsCoordinator.compaction.test.ts`
- `tests/unit/features/settings/SettingsConversationSection.test.ts`

### Docs to refresh

- `docs/modules/core/types/settings.md`
- `docs/modules/core/types/chat.md`
- `docs/modules/core/types/opencodeConfig.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/features/chat/ui/ConversationSessionSettingsModal.md`
- `docs/modules/features/chat/services/ConversationSessionSettingsCoordinator.md`
- `docs/modules/features/settings/SettingsConversationSection.md`
- `docs/status/opencode-auto-compaction-adaptation-report-2026-04-22.md`

---

### Task 1: Remove invalid compaction state from plugin settings and conversation state

**Files:**
- Modify: `src/core/types/chat.ts`
- Test: `tests/unit/core/types/chat.test.ts`
- Test: `tests/unit/core/storage/StorageService.test.ts`
- Docs: `docs/modules/core/types/chat.md`

**Important sequencing rule:**

- Do **not** remove plugin-level compaction defaults from `OpenCodianSettings` in this task.
- Do **not** remove `normalizeCompactionReservedTokens` or its barrel export in this task.
- `SettingsConversationSection` still compiles against those plugin settings until Task 3; removing them early would leave the repo red between commits.

- [ ] **Step 1: Write the failing tests that describe the corrected state model**

```ts
it('drops legacy compaction override fields from conversation session settings', () => {
  const legacyValue = {
    autoCompactionEnabled: false,
    compactionReservedTokens: 16_000,
    chatFontSizePx: 15.2,
  } as unknown as Partial<ConversationSessionSettings>;

  expect(normalizeConversationSessionSettings(legacyValue)).toEqual({
    chatFontSizePx: 15,
  });
});
```

- [ ] **Step 2: Run the focused tests to verify the current code still encodes the wrong contract**

Run:

```powershell
npm test -- --runInBand tests/unit/core/types/chat.test.ts tests/unit/core/storage/StorageService.test.ts
```

Expected:

- `chat.test.ts` still preserves compaction overrides inside `ConversationSessionSettings`
- storage tests still round-trip legacy compaction session settings

- [ ] **Step 3: Remove compaction only from conversation session settings**

Update the core types to this shape:

```ts
export interface ConversationSessionSettings {
  chatFontSizePx?: number | null;
}

export function normalizeConversationSessionSettings(
  value?: Partial<ConversationSessionSettings> | null,
): ConversationSessionSettings | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const normalized: ConversationSessionSettings = {};

  if (value.chatFontSizePx === null) {
    normalized.chatFontSizePx = null;
  } else {
    const chatFontSizePx = normalizeChatFontSizePx(value.chatFontSizePx, 0);
    if (chatFontSizePx > 0) {
      normalized.chatFontSizePx = chatFontSizePx;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
```

Do **not** touch `OpenCodianSettings` yet in this task; that happens together with the settings-page refactor in Task 3.

- [ ] **Step 4: Update storage expectations so old saved conversation blobs silently drop legacy compaction overrides**

Use a regression like this:

```ts
expect(result?.sessionSettings).toEqual({
  chatFontSizePx: 15,
});
```

Do not add a migration file; rely on existing normalization at read time so older saved data is cleaned automatically.

- [ ] **Step 5: Re-run the focused tests**

Run:

```powershell
npm test -- --runInBand tests/unit/core/types/chat.test.ts tests/unit/core/storage/StorageService.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add src/core/types/chat.ts tests/unit/core/types/chat.test.ts tests/unit/core/storage/StorageService.test.ts docs/modules/core/types/chat.md
git commit -m "refactor: remove session compaction overrides from conversations"
```

**Completion checkpoint:** Compaction no longer exists in persisted conversation session settings, while plugin-level settings remain intact temporarily so the repo still builds before Task 3.

---

### Task 2: Strip compaction out of the session-settings modal and coordinator

**Files:**
- Modify: `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- Modify: `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Test: `tests/unit/features/chat/ConversationSessionSettingsModal.test.ts`
- Test: `tests/unit/features/chat/ConversationSessionSettingsCoordinator.compaction.test.ts`
- Docs: `docs/modules/features/chat/ui/ConversationSessionSettingsModal.md`
- Docs: `docs/modules/features/chat/services/ConversationSessionSettingsCoordinator.md`

**Important note:**

- `main.ts` and `tests/unit/main.test.ts` should not need code changes in this task.
- The `reapplyConversationSessionDefaults()` seam is generic and should keep working as long as `coordinator.applyConversationRuntimeState(...)` still exists and returns a `ResolvedConversationSessionSettings` object, now narrowed to `{ chatFontSizePx }`.

- [ ] **Step 1: Write failing UI/coordinator tests for the corrected session-settings contract**

Add regressions like:

```ts
it('renders only the display section for session settings', () => {
  const modal = new ConversationSessionSettingsModal({} as never, {
    conversationTitle: 'Current chat',
    defaults: { chatFontSizePx: 13 },
    initialOverrides: { chatFontSizePx: 16 },
    onSave: jest.fn(),
  });

  modal.onOpen();

  expect(modal.contentEl.querySelector('[data-section="compaction"]')).toBeNull();
  expect(modal.contentEl.querySelector('[data-section="display"]')).not.toBeNull();
});

it('saves only chatFontSizePx overrides for the current conversation', async () => {
  const conversation = createConversation();
  const { coordinator, host } = createCoordinator({ currentConversation: conversation });

  await coordinator.saveConversationOverrides(conversation, { chatFontSizePx: 15 });

  expect(host.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
    sessionSettings: { chatFontSizePx: 15 },
  }));
});
```

- [ ] **Step 2: Run the focused chat tests and confirm the old compaction UI is still present**

Run:

```powershell
npm test -- --runInBand tests/unit/features/chat/ConversationSessionSettingsModal.test.ts tests/unit/features/chat/ConversationSessionSettingsCoordinator.compaction.test.ts
```

Expected:

- modal test fails because compaction section still renders
- coordinator test fails because save path still tries to apply compaction config

- [ ] **Step 3: Simplify the modal to a display-only session-settings editor**

Keep only this defaults shape:

```ts
export interface ConversationSessionSettingsModalDefaults {
  chatFontSizePx: number;
}
```

And build overrides like this:

```ts
private buildOverrides(): ConversationSessionSettings | undefined {
  const overrides: ConversationSessionSettings = {};

  const chatFontSizeValue = this.chatFontSizeInputEl?.value.trim() ?? '';
  if (chatFontSizeValue.length > 0) {
    const normalizedChatFontSizePx = normalizeChatFontSizePx(Number(chatFontSizeValue), 0);
    if (normalizedChatFontSizePx <= 0) {
      throw new Error(t('chat.sessionSettings.validation.chatFontSize'));
    }
    overrides.chatFontSizePx = normalizedChatFontSizePx;
  } else {
    overrides.chatFontSizePx = null;
  }

  return Object.values(overrides).every((value) => value === null)
    ? undefined
    : overrides;
}
```

- [ ] **Step 4: Remove compaction runtime ownership from the coordinator and view**

Refactor the coordinator host to this minimal contract:

```ts
export interface ResolvedConversationSessionSettings {
  chatFontSizePx: number;
}

export interface ConversationSessionSettingsCoordinatorHost {
  app: App;
  getCurrentConversation(): Conversation | null;
  getSessionSettingsDefaults(): ResolvedConversationSessionSettings;
  getChatContainerEl(): HTMLElement | null;
  saveConversation(conversation: Conversation): Promise<void>;
  showNotice(message: string): void;
}
```

And make runtime apply purely visual:

```ts
async applyConversationRuntimeState(
  conversation: Conversation | null | undefined,
): Promise<ResolvedConversationSessionSettings> {
  return this.applyConversationVisualState(conversation);
}
```

Also remove these view host callbacks entirely:

```ts
applyCompactionConfig
reapplyCompactionConfigFromProjectConfig
refreshCurrentSessionState
getOpencodeConfigManager
```

- [ ] **Step 5: Update chat i18n so session-settings copy no longer claims compaction can be changed per conversation**

Delete or stop using these strings:

```ts
chat.sessionSettings.modal.compactionGroup
chat.sessionSettings.modal.compactionGroupDesc
chat.sessionSettings.modal.autoCompaction
chat.sessionSettings.modal.autoCompactionDesc
chat.sessionSettings.modal.compactionReservedTokens
chat.sessionSettings.modal.compactionReservedTokensDesc
chat.sessionSettings.validation.compactionReservedTokens
chat.sessionSettings.savedDeferred
chat.sessionSettings.savedRuntimeWarning
```

Keep the success path simple:

```ts
chat.sessionSettings.saved = 'Session settings saved'
```

- [ ] **Step 6: Re-run the focused chat tests**

Run:

```powershell
npm test -- --runInBand tests/unit/features/chat/ConversationSessionSettingsModal.test.ts tests/unit/features/chat/ConversationSessionSettingsCoordinator.compaction.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```powershell
git add src/features/chat/ui/ConversationSessionSettingsModal.ts src/features/chat/services/ConversationSessionSettingsCoordinator.ts src/features/chat/OpenCodianView.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/features/chat/ConversationSessionSettingsModal.test.ts tests/unit/features/chat/ConversationSessionSettingsCoordinator.compaction.test.ts docs/modules/features/chat/ui/ConversationSessionSettingsModal.md docs/modules/features/chat/services/ConversationSessionSettingsCoordinator.md
git commit -m "refactor: remove per-session compaction controls"
```

**Completion checkpoint:** 会话设置只保留真正的 per-session 显示项；聊天运行时不再因为切换会话而改写 compaction。

---

### Task 3: Turn the settings page into a project `.opencode/opencode.json` compaction editor

**Files:**
- Modify: `src/core/types/opencodeConfig.ts`
- Modify: `src/core/types/settings.ts`
- Modify: `src/core/types/settingsLoadNormalization.ts`
- Modify: `src/core/config/OpencodeConfigManager.ts`
- Modify: `src/features/settings/SettingsConversationSection.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Test: `tests/unit/core/types/settings.test.ts`
- Test: `tests/unit/core/config/OpencodeConfigManager.test.ts`
- Test: `tests/unit/features/settings/SettingsConversationSection.test.ts`
- Docs: `docs/modules/core/types/opencodeConfig.md`
- Docs: `docs/modules/core/types/settings.md`
- Docs: `docs/modules/core/config/OpencodeConfigManager.md`
- Docs: `docs/modules/features/settings/SettingsConversationSection.md`

- [ ] **Step 1: Write failing tests for full project-scoped compaction field coverage**

Add expectations like:

```ts
it('does not keep plugin-level compaction defaults anymore', () => {
  const settingsRecord = DEFAULT_SETTINGS as Record<string, unknown>;
  expect(settingsRecord.autoCompactionEnabled).toBeUndefined();
  expect(settingsRecord.compactionReservedTokens).toBeUndefined();
});

it('persists the full project compaction config into .opencode/opencode.json', async () => {
  await manager.updateCompactionConfig({
    auto: false,
    prune: false,
    tail_turns: 3,
    preserve_recent_tokens: 4_000,
    reserved: 16_000,
  });

  const config = await manager.read();
  expect(config.compaction).toEqual({
    auto: false,
    prune: false,
    tail_turns: 3,
    preserve_recent_tokens: 4_000,
    reserved: 16_000,
  });
});

it('saves compaction settings through project config instead of plugin settings', async () => {
  await section['saveProjectCompactionConfig']({
    auto: false,
    prune: true,
    tail_turns: 3,
    preserve_recent_tokens: undefined,
    reserved: 16_000,
  });

  expect(plugin.opencodeConfigManager?.updateCompactionConfig).toHaveBeenCalledWith({
    auto: false,
    prune: true,
    tail_turns: 3,
    preserve_recent_tokens: undefined,
    reserved: 16_000,
  });
  expect(plugin.saveSettings).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused project-config tests**

Run:

```powershell
npm test -- --runInBand tests/unit/core/types/settings.test.ts tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts
```

Expected:

- `DEFAULT_SETTINGS` still exposes plugin-level compaction defaults
- `SettingsConversationSection` still saves compaction through plugin settings
- no UI/test coverage yet for `prune`, `tail_turns`, `preserve_recent_tokens`

- [ ] **Step 3: Expand the local compaction type to match upstream**

Update the type to this shape:

```ts
export interface OpencodeCompactionConfig {
  auto?: boolean;
  prune?: boolean;
  tail_turns?: number;
  preserve_recent_tokens?: number;
  reserved?: number;
  [key: string]: unknown;
}
```

Keep the `[key: string]: unknown` index signature. The goal is to make the known upstream fields explicit **without** removing pass-through compatibility for unknown/future compaction keys.

Do not add a new helper file. Keep parsing local to `SettingsConversationSection` unless a second caller appears.

- [ ] **Step 4: In the same commit, remove plugin-level compaction settings and replace the UI with project-config-backed controls**

Delete the plugin settings fields together with the settings-page refactor so the repo never sits in a half-migrated state:

```ts
// Remove from OpenCodianSettings:
autoCompactionEnabled
compactionReservedTokens

// Remove from DEFAULT_SETTINGS:
autoCompactionEnabled: DEFAULT_AUTO_COMPACTION_ENABLED
compactionReservedTokens: DEFAULT_COMPACTION_RESERVED_TOKENS
```

Also remove their load normalization from `src/core/types/settingsLoadNormalization.ts`.

If `normalizeCompactionReservedTokens(...)` still remains useful for the project-scoped `reserved` input parser, keep both:

```ts
export const DEFAULT_COMPACTION_RESERVED_TOKENS = 10000;
export function normalizeCompactionReservedTokens(...)
```

The constant should stop representing plugin defaults, but it may remain as a shared numeric parser fallback for compaction forms. Do **not** delete it unless you also replace every remaining caller and export.

Inside `SettingsConversationSection`, keep title mode / question display / chat font size as plugin settings, but move compaction to project-config helpers:

```ts
private async loadProjectCompactionConfig(): Promise<void> {
  const config = await this.plugin.opencodeConfigManager?.getCompactionConfig() ?? {};
  this.setProjectCompactionState({
    auto: config.auto ?? true,
    prune: config.prune ?? true,
    tailTurns: config.tail_turns ?? 2,
    preserveRecentTokens: config.preserve_recent_tokens ?? null,
    reservedTokens: config.reserved ?? null,
  });
}
```

Use these UI rules:

- `auto`: toggle, default ON
- `prune`: toggle, default ON
- `tail_turns`: positive integer, placeholder `2`
- `preserve_recent_tokens`: optional positive integer, blank means “follow OpenCode default”
- `reserved`: optional positive integer, blank means “follow OpenCode default”

It is acceptable to keep using `normalizeCompactionReservedTokens(...)` as a numeric parser helper after plugin settings are removed. If you do, keep its export in `src/core/types/index.ts` unchanged and document that it now serves project-scoped compaction inputs rather than plugin defaults.

- [ ] **Step 5: Add explicit project-scoped copy so the UI no longer says “default unless the conversation overrides it”**

Use keys like these:

```ts
settings.conversation.compaction.auto.name
settings.conversation.compaction.auto.desc
settings.conversation.compaction.prune.name
settings.conversation.compaction.prune.desc
settings.conversation.compaction.tailTurns.name
settings.conversation.compaction.tailTurns.desc
settings.conversation.compaction.preserveRecentTokens.name
settings.conversation.compaction.preserveRecentTokens.desc
settings.conversation.compaction.reserved.name
settings.conversation.compaction.reserved.desc
settings.conversation.compaction.projectNote
```

The `projectNote` text must say this is the current project’s shared OpenCode compaction config, not a per-session override.

Before deleting old session-settings compaction keys, run a repo search for `chat.sessionSettings.` and update every remaining consumer in the same commit so no runtime path is left reading a now-missing translation key.

- [ ] **Step 6: Re-run the focused project-config tests**

Run:

```powershell
npm test -- --runInBand tests/unit/core/types/settings.test.ts tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```powershell
git add src/core/types/opencodeConfig.ts src/core/types/settings.ts src/core/types/settingsLoadNormalization.ts src/core/config/OpencodeConfigManager.ts src/features/settings/SettingsConversationSection.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/core/types/settings.test.ts tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts docs/modules/core/types/opencodeConfig.md docs/modules/core/types/settings.md docs/modules/core/config/OpencodeConfigManager.md docs/modules/features/settings/SettingsConversationSection.md
git commit -m "refactor: move compaction settings to project config"
```

**Completion checkpoint:** 插件级 compaction 默认值已与 settings UI 一起移除，设置页 compaction 控件现在明确代表项目 `.opencode/opencode.json`，并覆盖完整 upstream compaction 字段。

---

### Task 4: Reload the scoped backend from project config instead of pushing per-session compaction state

**Files:**
- Modify: `src/core/opencode/OpenCodeService.ts`
- Modify: `src/features/settings/SettingsConversationSection.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Test: `tests/unit/core/opencode/OpenCodeService.compactionConfig.test.ts`
- Test: `tests/unit/features/settings/SettingsConversationSection.test.ts`
- Docs: `docs/modules/core/opencode/OpenCodeService.md`
- Docs: `docs/status/opencode-auto-compaction-adaptation-report-2026-04-22.md`

- [ ] **Step 1: Write failing tests for the corrected runtime-apply semantics**

Add regressions like:

```ts
it('reloads scoped backend state from project compaction config without calling config.update', async () => {
  mockSdkClient.instance.dispose.mockResolvedValue(true);
  mockSdkClient.config.get.mockResolvedValue({
    compaction: {
      auto: false,
      prune: true,
      tail_turns: 3,
      reserved: 16_000,
    },
  });

  const result = await service.reapplyCompactionConfigFromProjectConfig({
    auto: false,
    prune: true,
    tail_turns: 3,
    reserved: 16_000,
  });

  expect(result).toEqual({ status: 'applied' });
  expect(mockSdkClient.instance.dispose).toHaveBeenCalledTimes(1);
  expect(mockSdkClient.config.update).not.toHaveBeenCalled();
});
```

And a UI-facing regression:

```ts
expect(Notice).toHaveBeenCalledWith(
  'Project compaction saved. OpenCode is reloading this project, so the active conversation may be interrupted.',
);
```

- [ ] **Step 2: Run the focused hot-apply tests**

Run:

```powershell
npm test -- --runInBand tests/unit/core/opencode/OpenCodeService.compactionConfig.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts
```

Expected:

- existing compaction service tests still assume `config.update`
- settings section has no save notice about project reload / interruption

- [ ] **Step 3: Make the project-file reload path the primary public API**

Keep this method and use it from settings save:

```ts
async reapplyCompactionConfigFromProjectConfig(
  compaction: OpencodeCompactionConfig | null | undefined,
): Promise<OpenCodeCompactionConfigApplyResult> {
  if (this.settings.modelSourceMode === 'server') {
    return {
      status: 'deferred',
      reason: 'Project config is disabled while modelSourceMode is server',
    };
  }

  if (!this.getScopedDirectoryPath()) {
    return {
      status: 'deferred',
      reason: 'Vault directory scope is unavailable',
    };
  }

  await this.disposeScopedInstance();
  const resolvedConfig = await this.getBackendResolvedConfigForUpdate();
  return this.resolvedCompactionMatches(resolvedConfig, compaction)
    ? { status: 'applied' }
    : { status: 'deferred', reason: 'Project compaction config reload did not affect the resolved config' };
}
```

Stop using `applyCompactionConfig()` from UI save flows. After Task 2 removes `ConversationSessionSettingsCoordinator` as the only caller, `OpenCodeService.applyCompactionConfig()` should be treated as dead API surface.

Delete `OpenCodeService.applyCompactionConfig()` entirely unless a newly discovered internal caller appears during implementation. This plan assumes the method is removed, not retained as a dormant helper.

Delete or rewrite the dead unit cases in `tests/unit/core/opencode/OpenCodeService.compactionConfig.test.ts` that currently call:

```ts
service.applyCompactionConfig(...)
scopedService.applyCompactionConfig(...)
```

Leave only the tests that still validate `reapplyCompactionConfigFromProjectConfig(...)`, or split them into a narrower reload-focused test file if that keeps the suite clearer.

- [ ] **Step 4: Save compaction settings in this exact order**

In `SettingsConversationSection`, implement the save path like this:

```ts
private async saveProjectCompactionConfig(compaction: OpencodeCompactionConfig): Promise<void> {
  const configManager = this.plugin.opencodeConfigManager;
  if (!configManager) {
    throw new Error('Project OpenCode config is unavailable');
  }

  await configManager.updateCompactionConfig(compaction);

  const result = await this.plugin.openCodeService.reapplyCompactionConfigFromProjectConfig(compaction);
  new Notice(
    result.status === 'applied'
      ? t('settings.conversation.compaction.savedApplied')
      : t('settings.conversation.compaction.savedDeferred'),
  );
}
```

Do not call `plugin.saveSettings()` in this path, and do not revive any per-conversation runtime apply hook.

- [ ] **Step 5: Add honest user-facing notices about reload and interruption**

Use copy with these semantics:

```ts
settings.conversation.compaction.savedApplied
// "Project compaction saved. OpenCode is reloading this project, so the active conversation may be interrupted."

settings.conversation.compaction.savedDeferred
// "Project compaction saved to .opencode/opencode.json. It will take effect after the next OpenCode project reload."
```

Keep the warning factual; do not promise “instant, seamless, no interruption” behavior.

- [ ] **Step 6: Re-run the focused hot-apply tests**

Run:

```powershell
npm test -- --runInBand tests/unit/core/opencode/OpenCodeService.compactionConfig.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```powershell
git add src/core/opencode/OpenCodeService.ts src/features/settings/SettingsConversationSection.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/core/opencode/OpenCodeService.compactionConfig.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts docs/modules/core/opencode/OpenCodeService.md docs/status/opencode-auto-compaction-adaptation-report-2026-04-22.md
git commit -m "refactor: reload project compaction from file-backed config"
```

**Completion checkpoint:** 项目 compaction 保存后会通过 scoped instance reload 生效；UI 不再走“当前会话 apply compaction”的错误路径。

---

### Task 5: Refresh docs, devlog, verification, and Test Vault handoff

**Files:**
- Modify: `docs/modules/core/types/settings.md`
- Modify: `docs/modules/core/types/chat.md`
- Modify: `docs/modules/core/types/opencodeConfig.md`
- Modify: `docs/modules/core/config/OpencodeConfigManager.md`
- Modify: `docs/modules/core/opencode/OpenCodeService.md`
- Modify: `docs/modules/features/chat/ui/ConversationSessionSettingsModal.md`
- Modify: `docs/modules/features/chat/services/ConversationSessionSettingsCoordinator.md`
- Modify: `docs/modules/features/settings/SettingsConversationSection.md`
- Modify: `docs/status/opencode-auto-compaction-debug-handoff-2026-04-23.md`
- Modify: `devlog.md`

- [ ] **Step 1: Write doc updates that explain the new ownership clearly**

Each touched module doc must say the same three facts:

```md
- Compaction config is project-scoped and stored in `.opencode/opencode.json`
- Conversation session settings no longer own compaction
- Manual `session.summarize()` remains a session action, not a session config
```

Update the debug handoff doc so future sessions do not keep chasing the removed per-session mechanism.

- [ ] **Step 2: Add a newest-first devlog entry**

Insert a new top entry like:

```md
## 2026-04-23 Project-scoped compaction config alignment

- Removed invalid per-conversation compaction overrides from session settings and persisted conversation state.
- Moved compaction editing to project `.opencode/opencode.json` in the settings UI.
- Replaced per-session compaction runtime apply with project-scoped instance reload after config save.
```

- [ ] **Step 3: Run focused regression tests before the full gate**

Run:

```powershell
npm test -- --runInBand tests/unit/core/types/settings.test.ts tests/unit/core/types/chat.test.ts tests/unit/core/storage/StorageService.test.ts tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/core/opencode/OpenCodeService.compactionConfig.test.ts tests/unit/features/chat/ConversationSessionSettingsModal.test.ts tests/unit/features/chat/ConversationSessionSettingsCoordinator.compaction.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts
```

Expected: PASS

- [ ] **Step 4: Run module-doc and devlog guards**

Run:

```powershell
npm run check:module-docs
npm run check:devlog-order
```

Expected: both PASS

- [ ] **Step 5: Run build and full verification**

Run:

```powershell
npm run build
npm run verify
```

Expected:

- build passes
- full verify passes with `0 errors / 0 warnings`

- [ ] **Step 6: Deploy to Test Vault because runtime/settings files changed**

Run sequentially, not chained:

```powershell
Copy-Item dist\main.js C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js
Copy-Item dist\manifest.json C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\manifest.json
Copy-Item dist\styles.css C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\styles.css
```

Then verify deployed build identity:

```powershell
Select-String -Path C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js -Pattern 'BUILD_ID'
```

Expected: deployed `main.js` contains the newest build ID from this run.

- [ ] **Step 7: Refresh the graph because code files changed**

Run:

```powershell
graphify update .
```

Expected: graph update completes successfully.

- [ ] **Step 8: Commit**

```powershell
git add docs/modules/core/types/settings.md docs/modules/core/types/chat.md docs/modules/core/types/opencodeConfig.md docs/modules/core/config/OpencodeConfigManager.md docs/modules/core/opencode/OpenCodeService.md docs/modules/features/chat/ui/ConversationSessionSettingsModal.md docs/modules/features/chat/services/ConversationSessionSettingsCoordinator.md docs/modules/features/settings/SettingsConversationSection.md docs/status/opencode-auto-compaction-debug-handoff-2026-04-23.md devlog.md
git commit -m "docs: align compaction ownership and rollout notes"
```

**Completion checkpoint:** 文档、验证、Test Vault、graphify 全部跟上；下一位执行者不会再被旧的 per-session compaction 语义误导。

---

## Acceptance Checklist

- [ ] `ConversationSessionSettings` 只剩 `chatFontSizePx`
- [ ] `OpenCodianSettings` 不再包含 compaction 默认值
- [ ] 会话设置弹窗不再展示 compaction UI
- [ ] 设置页 compaction 控件读写项目 `.opencode/opencode.json`
- [ ] 设置页覆盖完整 upstream compaction 字段
- [ ] 保存 compaction 后走项目级 instance reload，不再走 per-session runtime apply
- [ ] 提示文案明确说明当前对话可能中断
- [ ] 旧存储里的 per-session compaction 字段会被静默清理
- [ ] `npm run check:module-docs`、`npm run check:devlog-order`、`npm run verify` 全绿
- [ ] Test Vault 部署后的 `BUILD_ID` 已核对

## Self-Review Notes

### Spec coverage

- 纠正“项目级而不是全局/会话级”语义：Task 1, Task 2, Task 3, Task 4
- 保留手动 summarize 为动作而非配置：Task 5 docs + contract summary
- 新会话可直接执行的细化步骤、测试、命令、提交点：全部任务已覆盖

### Placeholder scan

- 未使用 `TODO` / `TBD` / “similar to” / “适当处理” 之类占位语句。
- 每个任务都包含了具体文件、示例代码、命令和期望结果。

### Type consistency

- `ConversationSessionSettings` 在整份计划中都只保留 `chatFontSizePx`
- `OpencodeCompactionConfig` 在整份计划中统一使用 `auto/prune/tail_turns/preserve_recent_tokens/reserved`
- 项目级热应用统一走 `reapplyCompactionConfigFromProjectConfig(...)` / 项目文件重载语义
