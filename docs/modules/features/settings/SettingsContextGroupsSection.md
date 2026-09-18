# SettingsContextGroupsSection

> **源码**: `src/features/settings/SettingsContextGroupsSection.ts`
> **状态**: [REVIEW]

## 概述

R-B2「上下文组 / 主题」的设置页 CRUD 面。一个组 = 名称 + 有序条目列表（vault 相对路径，文件或目录），持久化在插件设置 `contextGroups`，因此跨笔记、跨会话、跨重启复用。行内编辑面板与聊天 composer 的「附加主题」入口消费同一数据源。

UI 形态沿用预设提示词 CRUD（SettingsInlineEditSection）：「添加主题组」按钮 + 每组一行（名称文本框 + 条目 textarea + 删除按钮）。条目 textarea 每行一个路径，行尾 `/` 表示目录。

## 公开接口

```typescript
class SettingsContextGroupsSection {
  attach(containerEl): HTMLHeadingElement
  attachTabbed(containerEl, secondaryTabId): void   // data-section-block="context-groups"
  dispose(): void
}
parseGroupEntryLines(value: string, previous: readonly ContextGroupEntry[]): ContextGroupEntry[]
// 行尾 '/' → folder；已存路径保留原 kind；空行/<>/重复丢弃，保持顺序
```

## 核心逻辑

- 持久化契约与预设相同：行内容原样保存（中途编辑的空行不消失），加载归一化（`normalizeContextGroups`）在下次启动时修剪半成品；
- 条目标签：`settings.conversation.tab.contextGroups` 二级标签（conversation 主标签下，位于 inline-edit 之后）；
- 注册点：`settingsLayoutRegistry.ts`（二级标签）、`SettingsTabbedRenderer.renderConversationContent`（tabbed 挂载）、`OpenCodianSettings.renderClassicDisplay`（classic 挂载）。

## 依赖

```text
上游: obsidian (Setting)、core/types (ContextGroup, normalize*)、i18n
下游: SettingsTabbedRenderer, OpenCodianSettings
```

## 维护约束

- 组数据形状的真理源在 `src/core/types/settings.ts`（`ContextGroup` / `normalizeContextGroups` + 上限常量），本文件不做二次校验；
- 路径存在性刻意不在设置页校验——附加时由 host 校验并提示（笔记可能稍后创建）。
