# PermissionModeSelectorCoordinator

> **源码**: `src/features/chat/services/PermissionModeSelectorCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`PermissionModeSelectorCoordinator` 承接聊天工具栏 permission selector 的 DOM 与 dropdown lifecycle。它现在是 triple-backend selector owner：OpenCode backend 显示 `yolo` / `normal` / `plan` permission templates，Claude Code backend 显示 SDK permission modes `default` / `acceptEdits` / `bypassPermissions` / `plan`，Codex backend 显示 sandbox modes `read-only` / `workspace-write` / `danger-full-access`。

- trigger icon/text/class 渲染
- permission mode option list 构建与 selected state 刷新
- dropdown open/close、click-outside cleanup 与 Escape 协作入口
- permission mode selection 写回 host

它不处理 model catalog、provider icon 或 effort selector；这些仍留在 `ChatSelectionControlsCoordinator` 与 `ModelSelectionRuntime`。

## 公开接口

```typescript
export interface PermissionModeSelectorHost {
  getPermissionMode(): string;
  switchPermissionMode(mode: string): Promise<void>;
}

export interface PermissionModeOption {
  id: string;
  label: string;
  description: string;
}

export interface PermissionModeConfig {
  options: PermissionModeOption[];
  displayMap: Record<string, string>;
  modeCssClasses: readonly string[];
  backendLabel: 'opencode' | 'claude-code' | 'codex';
  boundaryHint?: string;
}

export function createOpenCodePermissionConfig(): PermissionModeConfig;
export function createClaudeCodePermissionConfig(): PermissionModeConfig;
export function createCodexSandboxConfig(): PermissionModeConfig;

export class PermissionModeSelectorCoordinator {
  mount(containerEl: HTMLElement): void;
  applyLocaleTexts(): void;
  updateTriggerDisplay(): void;
  isOpen(): boolean;
  closeDropdown(): void;
  destroy(): void;
}
```

## 关键行为

- `createOpenCodePermissionConfig()` 构建 OpenCode `yolo` / `normal` / `plan` selector；`createClaudeCodePermissionConfig()` 构建 Claude Code `default` / `acceptEdits` / `bypassPermissions` / `plan` selector；`createCodexSandboxConfig()` 构建 Codex `read-only` / `workspace-write` / `danger-full-access` sandbox selector
- `PermissionModeConfig` 与 `PermissionModeOption` 已导出，供 build-time selector 选择和测试复用
- host seam 使用 `string` 而不是 OpenCode-only `PermissionMode`，避免把两套 backend permission mode 类型混在同一个 UI owner 中
- trigger 文案按 active backend 映射：OpenCode 继续显示 `YOLO` / `ASK` / `PLAN`，Claude Code 显示 `DEF` / `EDIT` / `BYP` / `PLAN`，Codex 显示 `RO` / `WS` / `FULL`，并保留 `mode-*` class
- trigger 携带 `data-permission-backend="opencode|claude-code|codex"`，用于运行时验证当前 selector 属于哪个 backend
- `boundaryHint` 可选属性：若 config 提供了 `boundaryHint`，则 mount 时将其写入 trigger 的 `title` 属性，用于传达 selector 只影响后续 thread 创建的边界语义（Codex sandbox selector 默认启用此 hint）
- option labels/descriptions 按 config 提供，OpenCode 仍复用 `settings.security.permissionMode.*` locale keys 与 fallback 文案；Codex 复用 `settings.codex.sandbox.*` labels 与 `chat.codex.sandboxMode.*` description locale keys
- 选中 option 后先调用 `host.switchPermissionMode()`，再刷新 trigger/selected state 并关闭 dropdown
- click-outside listener 使用 capture 阶段注册，与 agent selector 保持一致，确保点击其他 toolbar dropdown trigger 时当前 dropdown 能被正确关闭
- click-outside listener 只在 dropdown open 时注册，close/destroy 时移除
- trigger 现在携带 `role="button"`、`tabindex="0"`、`aria-haspopup="listbox"` 与 `aria-expanded`，dropdown 打开/关闭时同步更新这些属性并添加/移除 `is-open` 类以触发 CSS 动画

## 与 `ChatSelectionControlsCoordinator` 的边界

- selection controls coordinator 仍负责 model selector、shared Escape handler、model unavailable copy 与 effort selector联动
- permission selector coordinator 只负责 permission mode UI lifecycle，并通过小 host seam 写回当前 backend 的 mode
