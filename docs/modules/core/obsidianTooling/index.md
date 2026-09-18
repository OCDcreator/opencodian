# Obsidian 原生工具核心（barrel）

> **源码**: `src/core/obsidianTooling/index.ts`
> **状态**: [REVIEW]

## 概述

`core.obsidian-tooling` owner 的桶导出。硬边界：任何导出都不得 import agent 后端、OpenCode 服务或 feature/app 模块；应用侧接触（vault 适配器、Modal、fs.watch）由 `app.obsidian-tooling` 绑定。导出面：命令目录与分类、门脚本生成器、请求/决策模式、注入计划与选项袋帮助器、能力块渲染、CLI 探测、状态快照契约。
