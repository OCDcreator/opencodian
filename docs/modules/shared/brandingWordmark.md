# brandingWordmark

> **源码**: `src/shared/brandingWordmark.ts`
> **状态**: [REVIEW]

## 概述

为 OpenCodian light / dark title wordmark 提供内联 SVG data URL。标准 Obsidian release 仅安装 `main.js`、`manifest.json` 与 `styles.css`，因此该模块使设置页和聊天页无需依赖插件目录中的 `assets/branding/*.svg`。

同时导出插件品牌标记的图标 id：入口用 `addIcon(OPENCODIAN_APP_ICON_ID, OPENCODIAN_APP_ICON_SVG)` 注册一次，任何界面用 `setIcon(el, OPENCODIAN_APP_ICON_ID)` 渲染（侧边栏 ribbon、设置面板标题、行内编辑的字段框体引导图标 / 选区悬浮按钮 / 预览页脚身份标签）。图标 id 因此只有一处定义，不再在入口与视图里各存一份字面量。

## 公开接口

```typescript
export const OPENCODIAN_APP_ICON_ID = 'opencodian-app-icon';
export function getOpenCodianWordmarkDataUrl(theme: 'light' | 'dark'): string;
```

## 使用方

- `main.ts`：注册图标（`registerAppIcon`）与侧边栏 ribbon 按钮。
- `features/settings/SettingsPanelChrome.ts`：设置面板标题同时渲染两个 theme 版本。
- `features/chat/services/ChatHeaderPresenter.ts`：聊天 header 按当前 CSS theme 选择一个版本，并在 `css-change` 时更新。
- `features/chat/OpenCodianView.ts` 与 `features/inline-edit/{InlineEditInputOverlay,InlineEditSelectionAffordance,InlineEditWidgets}.ts`：渲染 app 标记。

## 注意事项

- 内联内容应与 `assets/branding/opencodian-wordmark-light.svg` 和 `assets/branding/opencodian-wordmark-dark.svg` 保持字节一致；更新品牌文件时需要一并更新本模块。
- app 标记的两个图层由 `src/style/base/core.css` 的 `.svg-icon.opencodian-app-icon` 规则按主题切换，新增渲染点不需要再写主题分支。
- 该模块只覆盖 title wordmark 与图标 id，不改变其他可选运行时资源的部署约定。
