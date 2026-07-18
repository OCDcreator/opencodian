# Composer Popover Frame Styles

> **源码**: `src/style/components/composer-popover-frame.css`
> **状态**: [FINAL]

## 职责

为 Composer 内的 Agent、Permission 与 Model popover 提供共享的扁平 Obsidian-native 卡片框架。该文件只定义可复用的 frame/header/content/footer/option 视觉合同；各选择器的具体 markup、尺寸和业务语义仍归各自样式模块所有。

## 关键类名

- Frame：`.opencodian-composer-popover-frame`、`-header`、`-content`、`-footer`、`-title`、`-escape-key`
- 列表：`.opencodian-composer-popover-option`、`-option-icon`、`-option-main`、`-option-text`、`-option-check`
- 文本与状态：`.opencodian-composer-popover-section`、`-state`、`-option-title`、`-option-description`
- 状态：`.is-selected` 与 `:focus-visible`

## 视觉合同

- 使用 Obsidian semantic variables 的实色背景、边框和阴影；禁止渐变、`backdrop-filter`、hover transform 与玻璃效果。
- option 采用 22px icon、弹性正文、18px check 的三列网格；长标题与描述必须截断。
- selected option 使用低饱和 accent tint、accent border 和 inset 左侧强调；键盘焦点使用 `:focus-visible` outline。
- `prefers-reduced-motion: reduce` 禁用 shared frame / option 的动画与平滑滚动。

## 修改注意点

- 此文件不改变 Agent、Permission 或 Model trigger 外观，也不迁移它们现有 selector-specific 内容。
- 新共享 class 必须保持 `opencodian-composer-popover-*` 命名空间，并同步更新该模块文档与 `styles.css`。
- 修改后运行 focused style-contract test 和 `npm run build:css`。
