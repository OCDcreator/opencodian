# Obsidian Tooling Confirm Modal Styles

> **源码**: `src/style/modals/obsidian-tooling-confirm-modal.css`
> **状态**: [FINAL]

## 职责

负责「Obsidian 原生工具」高影响操作确认弹窗（R-B4）的样式。该弹窗是插件生成的 CLI 确认门的用户侧界面：当 agent 试图执行安装/启用插件或主题这类高影响命令时，由它展示**将要执行的确切命令**并提供允许/拒绝。风险表达的准确性优先于观感。

## 关键类名 / CSS 变量

- 弹窗根：`.opencodian-tooling-confirm-modal`（由 `ObsidianToolingApprovalModal.onOpen` 加类）。声明全套 modal token（内容内边距 `22px`、header/body `16px`、区块 `20px`、区块内 `12px`、卡片 `12px`、表单行 `12px`、label/control `16px`、动作行 `8px`），宽度 `min(480px, 100vw - 40px)`。
- 内容壳：`.opencodian-tooling-confirm-modal .modal-content` 按 token 加内边距。
- 标题：`h3` 为 §3 Title（700 / 14px / 1.35）。
- 风险说明：`.opencodian-tooling-confirm-desc`（13px / 1.5、`--text-muted`、纵向 12px 间距；内部 `p` 无 margin）。
- 命令证据：`.opencodian-tooling-confirm-command` —— 确切命令以 `var(--font-monospace)` 呈现在扁平只读面上（`--background-secondary` 底 + 1px 边框 + 8px 圆角，12px / 1.5），长 argv 用 `overflow-wrap: anywhere` 换行而不是撑破弹窗（§3 Mono Evidence Rule）；`.opencodian-tooling-confirm-argv` 为参数行（与命令同色）。
- 按钮语义：`.mod-cta`（允许）用与批量整理弹窗相同的 ink 混色对比度修复；拒绝/破坏性路径使用原生 `.mod-warning`（rose），与仓库既有的行内权限拒绝词汇一致。
- 焦点与动效：`button:focus-visible` 为 2px accent 描边 + 2px offset；`.mod-cta` 与 `.mod-warning` 仅 150ms 背景色过渡，reduced-motion 下取消过渡。
- 拒绝按钮对比度契约：宿主主题把近黑标签压在 `rgb(211,47,47)` 上，**实机实测仅 4.22:1**，低于 13px 标签的 4.5:1 下限。因此本模块把 `.mod-warning` 背景改为 DESIGN.md rose 与 ink-graphite 的 72/28 混色、标签改浅色，实测提升到 **约 7.3:1**。选择「加深底色 + 浅标签」而非「提亮底色」有两个理由：提亮只在浅色主题成立、深色主题会反向劣化；且加深更符合 §2 的 Status Honesty Rule（不得把危险色软化到看不出风险）。改动这两个值时必须保证标签对比度在两个主题下都 ≥4.5:1。

## 关联 TS 组件

- `src/app/obsidianTooling/ObsidianToolingApprovalModal.ts`（DOM 合同来源；fail-closed 关闭语义：Deny、Esc、关闭窗口都写 `deny`）
- `src/app/obsidianTooling/ObsidianToolingCoordinator.ts`（请求轮询与决议落盘）

## 修改注意点

- 命令块必须保持 monospace 且可换行：它承载「用户到底批准了什么」这一事实，换成界面字体或去掉 `overflow-wrap` 都会削弱风险可见性。
- 拒绝路径的颜色语义要对齐既有 `-reject` 词汇（原生 `.mod-warning`）；不要自造第三种危险色。
- 该弹窗的关闭路径在 TS 里是 fail-closed，样式改动**不得**引入自动聚焦到「允许」这类会让误按变成批准的行为。
- 新增间距走 modal token，禁止 ad-hoc margin 与嵌套卡片（§5 Modal Layout）。
- 契约测试 `tests/unit/uiCssDesignContract.test.ts` 断言本文件的 token、`mod-warning` 拒绝词汇、focus-visible 与 reduced-motion；改动需同步断言。
