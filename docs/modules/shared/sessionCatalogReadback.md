# Session Catalog Readback

> **源码**: `src/shared/sessionCatalogReadback.ts`
> **状态**: [REVIEW]

## 概述

共享的目录读取结果、分页错误和固定失败分类。定义从 AgentBackendRouting 移入，避免 OpenCode lifecycle 引入 core.backend；routing 保留兼容 re-export，OpenCode 2 和 OpenCode 1 使用同一 Error 构造器。

## 导入关系

不依赖 core、feature 或 Obsidian。直接由 AgentBackendRouting、OpenCode2Adapter、OpenCodeSessionLifecycleCoordinator 三处复用。

## 核心类型 / 接口

- BackendSessionCatalogResult：complete 的游标为 null；partial/failed/unavailable 保留已读数据、下一页游标和固定原因。
- BackendSessionCatalogReadError：在原有数组返回 API 中透传结构化分页失败；instanceof 身份经 re-export 保持一致。
- backendSessionCatalogFailure：检查状态码和已知错误字段，只返回固定的 denied、unavailable、failed 分类，不向 UI 传递原始 URL、凭据或响应正文。

## 注意事项

本模块不发请求、不持有游标、不归一化 backend-specific rows；这些仍由各 backend/lifecycle 和 routing owner 负责。
