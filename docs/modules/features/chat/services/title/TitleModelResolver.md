# TitleModelResolver

> **源码**: `src/features/chat/services/title/TitleModelResolver.ts`
> **状态**: [REVIEW]

隔离六种原生模型目录格式、禁用模型和供应商边界。这是高风险依赖边界，不是单纯转发 helper。

## 解析

- OpenCode / OpenCode 2 使用保留的 aiTitleModel；其他后端读取 aiTitleModelOverrides[backend]，彼此不串用。
- Claude Code / Codex 的模型 ID 可含斜线，provider 由其 CLI 自身配置；其他后端使用 provider/model。
- 显式模型必须在所属后端的有效目录中存在，不能被 disabledModelRefs 禁用。不可用或目录异常则失败，保留规则标题，不偷偷换 provider。
- 未配置且当前聊天模型已是有效轻量模型时先沿用；否则只在当前 provider 选有效轻量候选；按 flash-lite / flash / haiku / mini / nano / luna 命名启发式排序，同档使用自然数字排序。没有候选或无目录读回则沿用聊天模型。
- 这不是实时价格比较，也不保证更便宜；记录 source 为 configured/lightweight/current。
- OpenCode 2 / DSH 适配 grouped providers，Pi 适配 provider+id，ZCode 从 workspace catalog 读取 providerId+modelId（不依赖前台 session snapshot），Claude 适配 supportedModels，Codex 适配 getModelList。
- 只有旧 OpenCode 的兼容路径读取 ModelConfigService。

测试覆盖真实目录形状、后端设置隔离、禁用/隐藏模型、native slash ID、显式不可用和同 provider 限制。
