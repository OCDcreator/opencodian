# brandingWordmark

> **源码**: `src/shared/brandingWordmark.ts`
> **状态**: [REVIEW]

## 概述

为 OpenCodian light / dark title wordmark 提供内联 SVG data URL。标准 Obsidian release 仅安装 `main.js`、`manifest.json` 与 `styles.css`，因此该模块使设置页和聊天页无需依赖插件目录中的 `assets/branding/*.svg`。

## 公开接口

```typescript
export function getOpenCodianWordmarkDataUrl(theme: 'light' | 'dark'): string;
```

## 使用方

- `features/settings/SettingsPanelChrome.ts`：设置面板标题同时渲染两个 theme 版本。
- `features/chat/services/ChatHeaderPresenter.ts`：聊天 header 按当前 CSS theme 选择一个版本，并在 `css-change` 时更新。

## 注意事项

- 内联内容应与 `assets/branding/opencodian-wordmark-light.svg` 和 `assets/branding/opencodian-wordmark-dark.svg` 保持字节一致；更新品牌文件时需要一并更新本模块。
- 该模块只覆盖 title wordmark，不改变其他可选运行时资源的部署约定。
