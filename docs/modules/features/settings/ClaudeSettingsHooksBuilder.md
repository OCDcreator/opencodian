# ClaudeSettingsHooksBuilder

> **源码**: `src/features/settings/ClaudeSettingsHooksBuilder.ts`
> **状态**: [ACTIVE]

## 概述

Claude hooks 的原生 DOM editor。builder 是 raw strict-JSON draft 的 projection，不存储 hook 数据；所有 event/group/handler 控件均由 `ClaudeSettingsHookSchema` 和 `ClaudeSettingsHookModel` 驱动，确保 advanced editor 与结构化表单不会分叉。

## 核心行为

- 渲染 schema evidence、event selector、matcher group、handler type 和 known handler fields；unknown event/type 以 raw JSON 只读展示。字段级控件（label/input、typed parse、type 切换 replacement、aria-invalid 标记）由 `ClaudeSettingsHookFieldControls` 拥有，builder 通过唯一 `applyEdit` 路径接收其编辑；共享 diagnostic 位于可见 editor surface，不放进默认折叠的 Advanced JSON。
- 支持新增、删除、matcher 更新、上下移动 group，以及新增、字段更新、删除、上下移动 handler。动作先调用纯 model builder，再由宿主应用单 path edit。每个 delete/move 按钮带按 event/group/handler 区分的唯一 `aria-label`（1-based 人类序号）；增删、排序或类型切换重渲染后，焦点回落到目标 group/handler 内第一个仍存在、可用的原生 button/input/select/textarea，而不是无语义的结构容器。event catalog 超过阈值时提供可访问的 event 搜索过滤，分组只依据 pinned schema 的真实 catalog。无效字段只在共享 diagnostic 可见时置 `aria-invalid` + `aria-describedby`；下一次成功 projection 会移除失效 wiring。
- draft 无效或 source managed/read-only 时禁用结构化动作；field parse/schema diagnostics 进入宿主 inline diagnostic。移动只改变文档顺序；同一次匹配内 eligible handlers 仍并行、identical handlers 去重，多次独立 async trigger 不去重，UI 不改写这些语义。

## 证据边界

标题旁展示 CLI/SDK/schema provenance；这只是 schema evidence。builder 不执行 hooks、不会调用 Claude SDK，也不提供 runtime proof。保存仍由 source service 执行 strict JSON、CAS、archive-before-mutation；没有真实 runtime probe 时 `runtime=unavailable`。
