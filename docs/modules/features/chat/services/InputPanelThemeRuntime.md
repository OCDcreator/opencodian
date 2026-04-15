# InputPanelThemeRuntime

> **源码**: `src/features/chat/services/InputPanelThemeRuntime.ts`
> **状态**: [REVIEW]

## 概述

`InputPanelThemeRuntime` 是聊天输入面板 theme/action-button runtime 的 owner。它把 composer shell class cleanup、glass-refraction SVG defs / filter layer，以及 liquid-glass adapter mount/update/unmount 从 `InputPanelAppearanceCoordinator` 的 diagnostics / follow-up 编排里分离出来。

它负责：

- 根据当前 chat appearance 配置同步 action-button style class
- 处理 preset、glass-refraction 与 liquid-glass 三条 input panel theme 分支
- 维护 composer SVG filter layer 与 glass refraction defs/preset class
- 统一挂载、更新、卸载 liquid-glass adapter，并保留 asset URL 解析 seam
- 暴露当前 filter-layer 引用，供上层 diagnostics 采样复用

## 公开接口

```typescript
export interface InputPanelThemeRuntimeHost {
  getComposerShellEl(): HTMLElement | null;
  getInputWrapperEl(): HTMLElement | null;
  getInputPanelTheme(): InputPanelThemeId;
  getInputActionButtonStyle(): InputPanelActionButtonStyleId;
  getInputPanelGlassRefractionSvgFilterSettings(): InputPanelGlassRefractionSvgFilterSettings;
  getLiquidGlassAdapterSettings(adapterId: LiquidGlassAdapterId): Record<string, GlassAdapterSettingsValue>;
  resolveAssetUrl(relativePath: string): string | null;
}

export class InputPanelThemeRuntime {
  syncAppearanceState(): LiquidGlassAdapterId | null;
  applyActionButtonStyleState(): void;
  applyThemeState(): LiquidGlassAdapterId | null;
  destroy(): void;
  getComposerSvgFilterLayerEl(): HTMLElement | null;
}
```

## 关键行为

- `syncAppearanceState()` 先同步 action-button class，再执行 theme runtime，并把 active liquid-glass adapter id 返回给调用方
- `applyThemeState()` 对 preset / glass-refraction / liquid-glass 分支做完整 cleanup，避免旧 theme class、旧 filter class 与旧 adapter 状态残留
- glass-refraction 分支只在 preset 非 `none` 且 scale 大于 `0` 时创建 filter layer；其余情况会移除 layer
- liquid-glass 分支会在 adapter 变化时先卸载旧 adapter，再复用新的 mount context 或调用 `updateSettings`

## 与 `InputPanelAppearanceCoordinator` 的边界

- `InputPanelThemeRuntime` 不调度 sticky mask 颜色同步、composer layout refresh，也不做 diagnostics 日志去重
- `InputPanelAppearanceCoordinator` 继续持有 diagnostics fingerprint、payload 采样与 post-appearance follow-up callback
- settings normalization、chat appearance CSS token、demo 路径与 `OpenCodianView` host seam 语义保持不变
