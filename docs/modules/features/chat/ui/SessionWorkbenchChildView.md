# SessionWorkbenchChildView

> 源码：`src/features/chat/ui/SessionWorkbenchChildView.ts`
> Owner：feature.chat-ui

## 职责与边界

从 `SessionWorkbenchInformation` 拆出的子会话展示视图，承接原 `renderChild` 的公开行为。它只接收本视图需要的 actions 子集，不持有 coordinator 的原生状态，也不反向导入 `SessionWorkbench`。

- 只读转录：返回主会话入口、子会话身份与状态、实际消息及工具输入/输出；用户消息复用主气泡的显示脱敏投影，持久化消息与续接草稿源不变。
- 生命周期：独立创建、加载和销毁 Obsidian `Component`，通过 `MarkdownRenderer` 渲染助手消息；`destroy()` 释放该 Component，避免高频 overview 信息行与 Markdown 生命周期互相牵连。
- 续接 composer：只有 `mode === 'continuable'` 且 `canContinue === true` 才渲染可写输入。false、unknown 和未完成探测只显示诚实说明；queue/steer 选择、草稿、焦点和光标仍由 coordinator 持有。
- 发送只经 `continueChild` 指向精确子会话；失败保留草稿，成功清空当前输入，receipt 继续由 coordinator 状态投影。

## 验证

原 `SessionWorkbenchInformation.renderChild` 入口与 DOM 类名保持不变，因此现有主/子面板滚动恢复、子会话续接、脱敏和焦点测试继续覆盖本视图。重点套件：`SessionWorkbench.test.ts`、`SessionWorkbenchRows.test.ts`、`DshChildContinuationSurface.test.ts`。窄屏、长消息和真实 Markdown/宿主行为仍需 Test Vault 验收，不能由 jsdom 测试替代。
