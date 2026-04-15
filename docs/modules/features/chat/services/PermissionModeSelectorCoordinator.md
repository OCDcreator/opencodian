# PermissionModeSelectorCoordinator

> **源码**: `src/features/chat/services/PermissionModeSelectorCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`PermissionModeSelectorCoordinator` 承接聊天工具栏 permission selector 的 DOM 与 dropdown lifecycle：

- trigger icon/text/class 渲染
- permission mode option list 构建与 selected state 刷新
- dropdown open/close、click-outside cleanup 与 Escape 协作入口
- permission mode selection 写回 host

它不处理 model catalog、provider icon 或 effort selector；这些仍留在 `ChatSelectionControlsCoordinator` 与 `ModelSelectionRuntime`。

## 公开接口

```typescript
export interface PermissionModeSelectorHost {
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<void>;
}

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

- trigger 文案继续映射为 `YOLO` / `ASK` / `PLAN`，并保留 `mode-*` class
- option labels/descriptions 仍来自 `settings.security.permissionMode.*` locale keys，并保留原 fallback 文案
- 选中 option 后先调用 `host.switchPermissionMode()`，再刷新 trigger/selected state 并关闭 dropdown
- click-outside listener 只在 dropdown open 时注册，close/destroy 时移除

## 与 `ChatSelectionControlsCoordinator` 的边界

- selection controls coordinator 仍负责 model selector、shared Escape handler、model unavailable copy 与 effort selector联动
- permission selector coordinator 只负责 permission mode UI lifecycle，并通过小 host seam 写回当前 mode
