# Obsidian 工具运行时组合（barrel）

> **源码**: `src/app/obsidianTooling/index.ts`
> **状态**: [REVIEW]

## 概述

`app.obsidian-tooling` owner 的桶导出：`ObsidianToolingCoordinator`（门供给、请求监听、探测缓存、注入计划）与 `ObsidianToolingApprovalModal`（高影响确认对话框）。由 `main.ts` 构造；聊天发送管线与设置界面经插件字段消费。
