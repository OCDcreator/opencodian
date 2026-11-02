# SessionWorkbenchTools

> 源码：`src/features/chat/ui/SessionWorkbenchTools.ts`
> Owner：feature.chat-ui

## 职责与边界

真实 xterm PTY、隔离 webview 浏览/截图附图、显式 Git 操作、上下文资源入口。SessionWorkbenchDesktopView 复用同一宿主 runtime，在 Obsidian 主区域打开大内容；关闭视图不终止 PTY。来源会话变化后拒绝向错误会话附加上下文。浏览器按需创建，theme/目录/进程归属清楚；worktree/commit 仅由明确按钮触发。

入口通过 `openTool` 直接选择终端、仓库、浏览器或资源卡片；工具内容不再嵌套“工具”标签和下拉选择器。在主工作区打开的操作仍作用于当前选中的工具，主区域视图和标题也使用具体工具名称，会话标题作为次要信息，避免重复导航。

资源工具以“命令与资源”命名，包含当前上下文资源、当前后端命令与技能加载、工作区记忆和设置诊断入口；与信息面板列出当前附件及后端加载来源的“会话引用”分组区分。

## 验证

浏览器按会话隔离 URL 和预览节点；异步截图在完成时再次检查来源会话和 webview 身份。切换后拒绝附加旧页面，返回时仅恢复对应会话的 URL。

工具切换测试检查仅显示选中内容且没有第二层工具选择器；会话卡片标题与工具恢复由 SessionWorkbench 测试覆盖。

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。
