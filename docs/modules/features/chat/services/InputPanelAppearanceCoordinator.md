# InputPanelAppearanceCoordinator

> **源码**: `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`InputPanelAppearanceCoordinator` 承接聊天输入面板的 appearance / glass state ownership，避免 `OpenCodianView` 继续直接维护 theme class、action-button class、SVG filter layer、liquid-glass adapter mount/unmount 与 diagnostics log fingerprint。

它负责：

- 根据当前 input panel theme 清理并应用 composer shell class
- 切换 action button style，并保持与 chat appearance setting 对齐
- 创建/移除 SVG filter layer，维护 glass refraction defs 与 preset class
- 统一挂载、更新、卸载 liquid-glass adapter，并保留 asset URL 解析 seam
- 在 debug logging 开启时调度并去重 diagnostics 日志

## 公开接口

```typescript
export interface InputPanelAppearanceCoordinatorHost {
  getComposerShellEl(): HTMLElement | null;
  getInputWrapperEl(): HTMLElement | null;
  getChatContainerEl(): HTMLElement | null;
  getMessagesShellEl(): HTMLElement | null;
  getMessagesContainerEl(): HTMLElement | null;
  getInputPanelTheme(): InputPanelThemeId;
  getInputActionButtonStyle(): InputPanelActionButtonStyleId;
  getInputPanelGlassRefractionSvgFilterSettings(): InputPanelGlassRefractionSvgFilterSettings;
  getLiquidGlassAdapterSettings(adapterId: LiquidGlassAdapterId): Record<string, GlassAdapterSettingsValue>;
  isDebugLoggingEnabled(): boolean;
  resolveAssetUrl(relativePath: string): string | null;
  getLogPreview(text: string, maxLength?: number): string;
  stringifyLogPayload(payload: unknown): string;
}

export class InputPanelAppearanceCoordinator {
  applyActionButtonStyleState(): void;
  applyThemeState(): void;
  destroy(): void;
  logDiagnosticsEntry(label: string, payload: unknown): void;
}
```

## 关键行为

- `applyActionButtonStyleState()` 统一清理 etched/default class，避免 view 自己直接操作 composer shell class list
- `applyThemeState()` 处理 preset、glass-refraction 与 liquid-glass 三条 appearance 分支，并把 filter-layer / adapter lifecycle 收进一个 owner
- `destroy()` 在 view 关闭前卸载 adapter 并移除 filter layer，确保 input shell teardown 前先完成 glass cleanup
- `logDiagnosticsEntry()` 通过 payload fingerprint 去重 diagnostics 日志；真正的 diagnostics payload 采样和调度仍在 coordinator 内部完成

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 host seam：提供 composer shell、input wrapper、messages shell、chat container 与 settings/log helper
- experimental `LiquidDiamondDemoController` / `GlassOctahedronDemoController` 仍留在 view，避免 demo 路径混入稳定 input panel lifecycle
- theme preset、settings normalization、chat appearance CSS token 与 `ComposerInputShellCoordinator` 的 textarea/layout 语义没有变化
- 本模块刻意不接管 selector、textarea submit gate、context row 或 settings UI；这些仍由相邻 owner 负责
