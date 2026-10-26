# EffortSelector

> **源码**: `src/features/chat/ui/EffortSelector.ts`
> **状态**: [REVIEW]

## 概述

`EffortSelector.ts` 是 composer toolbar 里的 thinking / effort variant dropdown。它不自行判断 backend 或模型类型，而是从 `EffortSelectorCallbacks` 读取当前模型、可选 variants、当前 variant，以及是否允许"默认/关闭"选项。

OpenCode 模式下，variants 来自当前 provider model catalog 的 `models[model].variants`，未选择时显示 `chat.effort.disabled`。Claude Code 模式下，`OpenCodianView` 提供固定的官方 effort variants：`low`、`medium`、`high`、`xhigh`、`max`，并禁用默认/关闭选项，因为 Claude Code effort 是 SDK option hint，不是 OpenCode-style variant off switch。Codex 模式下，提供 Codex 专有的 reasoning-effort variants：`minimal`、`low`、`medium`、`high`、`xhigh`，同样禁用默认/关闭选项，因为 Codex effort 是 `ThreadOptions.modelReasoningEffort`，不支持 variant off 语义。

## 职责

- 渲染 compact 当前值和 dropdown options；`Effort` / `思考强度` 通过当前 control 的 `aria-labelledby` visually-hidden carrier、当前值 custom tooltip 与菜单项 tooltip 暴露，不在 toolbar 内占可见宽度，也不让父 group 成为 Obsidian 原生 tooltip owner
- 点击当前值时打开/关闭菜单，点击外部或按 Escape 关闭菜单
- 以 reverse order 展示 variants，让较高 effort 靠上
- 在当前模型不存在或 variants 为空时隐藏自身，避免留下空 toolbar 控件
- 通过 `allowDefaultOption()` 和 `getDefaultOptionLabel()` 支持 backend-specific 默认项语义
- 通过 `getBoundaryHint()` 回调把边界提示拼入 custom tooltip，诚实告知用户 effort 变更的作用范围
- 当前值使用 `formatVariantLabel()` 显示完整标签（例如 `medium` → `Medium`），composer 中不得把 thinking effort 压缩成 `M` 或中文一字母式缩写
- dropdown 使用 `AnchoredOverlayLayoutController` 从当前值右边缘向左展开，以菜单实际内容宽度为首选、60px 为最小值，并相对最近的 Chat 容器保留左右 8px 安全区

## 维护约束

- 该组件只管理 DOM 与选择事件，不保存设置，也不直接读取 backend capability。
- OpenCode / Claude Code / Codex 的 variant 来源与保存策略由 `OpenCodianView` host seam 决定。
- Codex effort 写回路径：`onVariantChange` → `plugin.settings.backendSettings.codex.modelReasoningEffort` + `CodexAdapter.updateModelReasoningEffort()`。仅影响后续 thread 创建，不改变正在运行的 thread。该边界通过 `getBoundaryHint()` 回调进入当前值 `data-tooltip`，并由同一 control 的 `aria-labelledby` 指向 visually-hidden carrier（例如 `Effort: Medium. Controls how much reasoning budget... Applies to next turn`）。父 group、当前 trigger 和菜单 trigger 都不得持有 `aria-label` 或 `title`，避免 Obsidian 原生 tooltip 与全局 custom tooltip 重复。
- 新增 backend effort 语义时，优先扩展 callbacks，而不是在组件中硬编码 backend kind。
- `.opencodian-effort-label` 与 `.opencodian-effort-boundary-hint` 不再渲染；`.opencodian-effort-current` 是主 tooltip trigger，`.opencodian-effort-gear` 每一项也有独立 tooltip，鼠标在弹出菜单内移动时 tooltip 文案会随 hover 项更新，而不是停留在父级说明。
- tooltip 回归测试必须从真实 `EffortSelector` DOM seam 检查每个 `.opencodian-tooltip-trigger[data-tooltip]` 的祖先链，确保不存在 Obsidian 会接管的 `[aria-label]` / `[title]` owner，并验证当前 control 的 hidden accessible carrier 与 `aria-labelledby` 保持同步。
- 每次 variants 更新并重建 options DOM 时必须重建浮层控制器；destroy 时断开 observer，避免继续持有旧菜单节点。

## 2026-10-26 键盘与默认语义修复

- Effort trigger 同步 aria-expanded/controls；菜单为具名 menu，每个选项为 menuitemradio 并公开 aria-checked，使用单一 roving tabindex。Enter/Space 打开并聚焦当前选项；上下箭头、Home/End 移动，Enter/Space 选择，Escape 关闭并返回 trigger；Tab 关闭后继续正常焦点顺序。仅在菜单打开时消费 Escape，避免传给宿主关闭设置窗口。
- 选择保存由既有 callback 承担；等待期间防重复提交，失败保留菜单与 live 反馈。成功后仅在焦点仍位于菜单时恢复入口；保存期间用户已 Tab/点击离开或组件已卸载时不抢回焦点，所有 backend 共用这一约束。
- 菜单项不再有 hover tooltip；当前值 tooltip 在菜单打开时隐藏，边界说明在菜单内显示，避免遮挡选项。此条取代上文“每项独立 tooltip”的旧约束。
- 默认/显式选项由 host 区分，组件继续不读取 backend 或保存设置。


## 2026-10-26 宿主 Escape 验收补充

`handleEscape()` 供 Obsidian Scope 优先关闭已打开的菜单并恢复入口焦点；菜单关闭时返回 false，让原有 Escape 链继续。document 监听保留为独立组件的回退，不能用其单元测试代替宿主捕获阶段验收。
