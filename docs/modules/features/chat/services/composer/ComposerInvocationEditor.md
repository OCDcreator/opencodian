# ComposerInvocationEditor

> **源码**：`src/features/chat/services/composer/ComposerInvocationEditor.ts`
> **Owner**：`feature.chat-services`

## 职责

隔离富文本输入区的 CodeMirror DOM、原子 token、选区、撤销与剪贴板行为。不拥有后端目录、命令执行或会话状态；原有 textarea 继续作为草稿、Pi `set_editor_text`、菜单插入与发送的兼容端口。

## 展示与发送

- token 使用 ZCode 开源桌面端 `PromptMentionNode` / `mentionChip` 的「图标 + 名称」结构。技能、命令、文件/文件夹、会话、插件/应用和 MCP 资源复用本项目 Lucide 图标。调用标签隐藏前缀，稳定引用使用显式 `label`。
- CodeMirror 文档和 textarea 仍保存后端接受的原文，例如 `$design`、`/skill:design`、`/skills design`。装饰只替换展示，复制、提交与后端路由不从 DOM 的标签文字反推。
- `InvocationToken` 的 kind 和可选 label 与 widget equality/signature 一起参与更新，标签改名可正确重绘。稳定引用的 `opencodian-ref` 身份留在文档和 textarea 中，显示文字不承担身份解析。
- `EditorView.atomicRanges` 让光标与删除跨过完整 token，避免把隐藏调用语法删成半截；完整原文保留在 `data-value` 中供诊断。
- 同步原有 `value`、`focus`、`setSelectionRange`；输入事件在编辑器事务结束后发布，避免事务重入。粘贴事件继续经过原有图片/URL处理。
- 编辑器历史保留输入撤销/重做；外部草稿/菜单写入使用独立历史组。禁用通过 read-only/editable facets 同步。
- composer 被移出文档时销毁编辑器和观察器，恢复 textarea 属性。无浏览器布局能力时沿用原 textarea 路径。

## 上游依据

ZCode `zai-org/ZCode`，commit `3c5b227649371507ddc4eb46ac5133afe6db1cab`：`packages/ui/src/mentions/mentionChip.ts`、`nodes/PromptMentionNode.ts`、`nodes/promptMentionDecoration.ts`、`promptMentionLabel.ts` 及 `packages/ui/src/styles.css`。复用本项目现有 Lucide 图标，不引入 ZCode 的 Lexical 运行时。

## 验证

`tests/unit/features/chat/ComposerInvocationEditor.test.ts` 覆盖六种引用标签及改名重绘、可见标签与发送原文分离、选区和草稿同步、禁用、撤销/重做与卸载清理。既有真实输入路径在 Test Vault 通过 `/`、`$`、Tab、删除和多后端发送截取验证。
