# Composer Popover Frame Styles

> **源码**: `src/style/components/composer-popover-frame.css`
> **状态**: [FINAL]

## 职责

为 Composer 内的 Agent、Permission 与 Model popover 提供共享的 shadcn `Popover + Command` 视觉框架（仅借 anatomy，未引入 shadcn/Radix/cmdk/Tailwind/Web font/外部资源）。该文件只定义可复用的 frame/header/content/footer/option 视觉合同；各选择器的具体 markup、尺寸和业务语义仍归各自样式模块所有。

## 关键类名

- Frame：`.opencodian-composer-popover-frame`、`-header`、`-content`、`-footer`、`-title`、`-escape-key`
- 列表：`.opencodian-composer-popover-option`、`-option-icon`、`-option-main`、`-option-text`、`-option-check`
- 文本与状态：`.opencodian-composer-popover-section`、`-state`、`-option-title`、`-option-description`
- 状态：`.is-selected`、`.is-highlighted`、`:focus-visible`

## 视觉合同

- 单一安静 surface：`background-primary` 实色、单层 `background-modifier-border`、`border-radius: 10px`、低强度 host shadow；禁止 `backdrop-filter`、`linear-gradient`、`radial-gradient`、玻璃、彩色左侧 rail 或嵌套卡。
- header/footer 是次要 metadata：sentence-case 12px/600 title、muted 11px keycap，footer 用 `text-faint` 表达快捷键提示，不再制造第二个强调层。
- option 采用 22px icon、弹性正文、18px check 的三列网格、`border-radius: 6px`、4px list inset；min-height 32px。
- hover、roving highlight (`is-highlighted`) 与 selected 共用同一低对比中性背景 `--background-modifier-hover`；selected **不**叠加 border、box-shadow、彩色左侧 rail 或整行 tint；选中态仅靠 checkmark 显隐 + 600 字重强调。
- 共享选择规则会自动加粗 `.opencodian-composer-popover-option-title`、`.opencodian-agent-option-label`、`.opencodian-permission-option-label`、`.opencodian-model-option-name`。
- 键盘焦点使用 `:focus-visible` 2px accent outline，`outline-offset: -2px`。
- `prefers-reduced-motion: reduce` 禁用 shared frame / option 的动画与平滑滚动。

## 修改注意点

- 此文件不改变 Agent、Permission 或 Model trigger 外观，也不迁移它们现有 selector-specific 内容。
- 新共享 class 必须保持 `opencodian-composer-popover-*` 命名空间，并同步更新该模块文档与 `styles.css`。
- 修改后运行 focused style-contract test 和 `npm run build:css`。
