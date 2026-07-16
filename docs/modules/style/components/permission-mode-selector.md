# Permission Mode Selector Styles

> **源码**: `src/style/components/permission-mode-selector.css`
> **状态**: [FINAL]

## 职责

定义聊天工具栏权限模式选择器的触发器与下拉选项视觉，并提供模式语义色。OpenCode backend 使用 `yolo` / `normal` / `plan` 模板色；Claude Code backend 使用 `default` / `acceptEdits` / `plan` / `bypassPermissions` SDK mode 色与截图式紧凑菜单；Codex backend 使用 `read-only` / `workspace-write` / `danger-full-access` sandbox 色。输入工具栏内的 trigger 使用统一 control height，与 Agent / model selector 保持同一横向节奏；Claude Code trigger 只显示当前模式图标、短标签和 chevron，避免在 composer 有限空间里塞入大按钮。通用下拉面板仍采用 glass surface；Claude Code 下拉通过 `.opencodian-permission-selector--claude-code` 单独覆盖为平面菜单、无侧边强调条、无玻璃 blur，选中项只显示右侧 checkmark。

## 关键类名 / CSS 变量

- `.opencodian-permission-selector`：选择器容器。
- `.opencodian-permission-selector--claude-code`：Claude Code 专属 variant，挂在 container、trigger 与 dropdown 上，用于隔离截图式紧凑菜单。
- `.opencodian-permission-trigger` + `mode-yolo|mode-normal|mode-default|mode-acceptEdits|mode-bypassPermissions|mode-plan`：当前 backend 模式显示与颜色。
- `.opencodian-sandbox-config-badge*`：permission trigger 旁的 Claude Code sandbox 配置徽章，用于显示 expanded sandbox 摘要。
- `.opencodian-additional-directories-config-badge*`：permission trigger 旁的 Claude Code additional directories 配置徽章，用于显示 requested extra directory count；它复用紧凑 toolbar badge 几何，但使用 `folder-plus` 图标与 accent 色。
- `.opencodian-codex-runtime-defaults-badge*`：permission trigger 旁的 Codex runtime defaults 徽章，仅在网络访问启用、网页搜索未禁用或额外目录非空时渲染，使用紧凑 toolbar badge 几何与 ellipsis 截断。
- `.opencodian-permission-dropdown`：弹出菜单容器。
- `.opencodian-permission-option*`：选项项、图标、描述与选中勾选。
- `[data-mode="..."]`：按模式给图标着色。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`

## 修改注意点

- 模式色语义与行为绑定（OpenCode: 允许/询问/审查；Claude Code: 默认/接受编辑/绕过权限/计划），不要把不同风险等级做成几乎同色。
- 下拉体验与模型选择器需保持视觉一致（圆角、层级、焦点态），但 Claude Code 权限菜单是例外：它使用截图式平面菜单而不是通用 glass 菜单，以减少视觉臃肿并突出权限语义。
- Claude Code 的 `bypassPermissions` 可以显示为 `完全访问` / `Full access`，但描述与颜色必须保留它会绕过权限检查的风险含义，不得只写成普通的“少确认”。
- 下拉面板带有 `permission-dropdown-open` 入场动画，由 `.is-open` 类触发。
- dropdown 使用 `box-sizing: border-box`，280px CSS 宽度只作为无边界控制器时的回退；运行时由共享控制器限制在 Chat 容器左右 8px 安全区。
- 选项支持 `:focus-visible` 焦点轮廓，确保键盘导航可见。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
- 2026-06-07 新增 sandbox badge 样式，覆盖 enabled/disabled/readback 状态和 expanded sandbox 子策略摘要。
- 2026-06-07 Round 13 扩展为 Claude Code config badges，同一几何也覆盖 additional directories read-only badge。该 badge 只表示下一次 query 请求的额外目录作用域，不表示 SDK/CLI 已解析或实际可访问这些路径。
- 2026-06-15 Round 14 新增 Codex runtime defaults badge 样式，使用同一紧凑几何并支持 narrow-sidebar 截断。
