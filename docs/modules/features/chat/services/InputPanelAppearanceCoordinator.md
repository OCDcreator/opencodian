# InputPanelAppearanceCoordinator

> **源码**: `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`InputPanelAppearanceCoordinator` 承接聊天输入面板的 appearance-sync owner。它现在把 action-button/theme/SVG/liquid-glass runtime 下沉给 `InputPanelThemeRuntime`，自己保留 chat appearance 入口编排、glass-refraction CSS token refresh、sticky mask / composer layout follow-up，以及 liquid-glass diagnostics 去重与采样。

它负责：

- 作为聊天输入面板 appearance 的统一入口，串联 action-button style、theme runtime、glass-refraction CSS token 与 post-apply follow-up
- 在 chat appearance 变更后写入输入面板 glass-refraction CSS variables，并调度 sticky mask 颜色同步与 composer layout refresh
- 在 debug logging 开启时调度并去重 liquid-glass diagnostics 日志
- 采样 backdrop point / overlap / ancestor chain，输出 diagnostics payload

## 公开接口

```typescript
export interface InputPanelAppearanceCoordinatorHost extends InputPanelThemeRuntimeHost {
  getChatContainerEl(): HTMLElement | null;
  getMessagesShellEl(): HTMLElement | null;
  getMessagesContainerEl(): HTMLElement | null;
  getInputPanelGlassRefractionSettings(): InputPanelGlassRefractionSettings;
  scheduleChatSurfaceColorSync(): void;
  scheduleComposerLayoutSync(): void;
  isDebugLoggingEnabled(): boolean;
  getLogPreview(text: string, maxLength?: number): string;
  stringifyLogPayload(payload: unknown): string;
}

export class InputPanelAppearanceCoordinator {
  syncAppearanceState(): void;
  applyActionButtonStyleState(): void;
  applyThemeState(): void;
  destroy(): void;
  logDiagnosticsEntry(label: string, payload: unknown): void;
}
```

## 关键行为

- `syncAppearanceState()` 先把 input-panel glass-refraction CSS variables 写到 chat container，再调用 `InputPanelThemeRuntime` 同步 action-button/theme state，并立刻触发 sticky mask 与 composer layout follow-up
- `applyThemeState()` 仍可单独复用，但液态玻璃 diagnostics 调度统一留在 coordinator，避免 runtime 与日志采样耦合
- `destroy()` 委托 runtime 完成 adapter/filter-layer 清理，确保 input shell teardown 前先完成 glass cleanup
- `logDiagnosticsEntry()` 通过 payload fingerprint 去重 diagnostics 日志；真正的 payload 采样仍保留在 coordinator 内部

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 host seam：提供 composer shell、input wrapper、messages shell、chat container、input-panel glass settings、follow-up callback 与 settings/log helper
- experimental `LiquidDiamondDemoController` / `GlassOctahedronDemoController` 仍留在 view，避免 demo 路径混入稳定 input panel lifecycle
- `InputPanelThemeRuntime` 负责 theme preset、glass-refraction、liquid-glass 与 action-button class runtime；coordinator 不再直接铺开这些状态分支
- theme preset、settings normalization、chat appearance CSS token 与 `ComposerInputShellCoordinator` 的 textarea/layout 语义没有变化
- 本模块刻意不接管 selector、textarea submit gate、context row 或 settings UI；这些仍由相邻 owner 负责
