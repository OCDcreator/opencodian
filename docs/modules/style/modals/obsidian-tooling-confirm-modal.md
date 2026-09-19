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
- 按钮语义：`.mod-cta`（允许）与拒绝/破坏性路径的原生 `.mod-warning`（rose，与仓库既有行内权限拒绝词汇一致）保留宿主底色；**标签对比度由共享契约 `plugin-modal-contrast.css` 承担**（浅标签 + 宿主自有实底：危险底实机实测 4.98:1，此前宿主近黑标签为 4.22:1 FAIL；accent 底换算 7.33:1）。历史记录：本模块曾自带 rose×ink-graphite 混色底 + 浅标签，实机复测证明混色底从未落地（主题在 background-color 上以更高特异性胜出，只有 `color: #fff` 生效），~7.3:1 的算术值描述的是一个到不了屏幕的底色——已删除，正确数字见共享契约文档。
- 焦点与动效：`button:focus-visible` 为 2px accent 描边 + 2px offset；按钮过渡及其 reduced-motion 回退由共享契约负责，本文件不再携带任何 motion 声明。

## 关联 TS 组件

- `src/app/obsidianTooling/ObsidianToolingApprovalModal.ts`（DOM 合同来源；fail-closed 关闭语义：Deny、Esc、关闭窗口都写 `deny`）
- `src/app/obsidianTooling/ObsidianToolingCoordinator.ts`（请求轮询与决议落盘）

## 修改注意点

- 命令块必须保持 monospace 且可换行：它承载「用户到底批准了什么」这一事实，换成界面字体或去掉 `overflow-wrap` 都会削弱风险可见性。
- 拒绝路径的颜色语义要对齐既有 `-reject` 词汇（原生 `.mod-warning`）；不要自造第三种危险色。
- 该弹窗的关闭路径在 TS 里是 fail-closed，样式改动**不得**引入自动聚焦到「允许」这类会让误按变成批准的行为。
- 新增间距走 modal token，禁止 ad-hoc margin 与嵌套卡片（§5 Modal Layout）。
- 契约测试 `tests/unit/uiCssDesignContract.test.ts` 断言本文件的 token、`mod-warning` 拒绝词汇、focus-visible 与 reduced-motion；改动需同步断言。
