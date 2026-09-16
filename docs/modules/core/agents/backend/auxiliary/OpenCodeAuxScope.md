# OpenCodeAuxScope

> **源码**: `src/core/agents/backend/auxiliary/OpenCodeAuxScope.ts`
> **状态**: [REVIEW]

## 概述

为辅助查询持有**隔离的 opencode serve 实例**。inline edit 需要一个能运行时证明无法写入、且完全不碰用户配置的 OpenCode 执行作用域，因此不复用聊天 sidecar。

## 职责

- 在系统临时目录生成 scope（`opencodian-inline-aux-*`），其中 `opencode.json` 定义只读 agent `opencodian-inline-readonly`
- 启动独立 `opencode serve`：`OPENCODE_CONFIG` 指向生成的配置、`OPENCODE_PURE=true` 隔离用户插件、清理 `OPENCODE_CONFIG_DIR` / `OPENCODE_CONFIG_CONTENT` / `OPENCODE_PERMISSION`
- **私有会话目录**：服务进程的 cwd 与会话 `directory` 都指向 scope 内的 `work/`，使辅助会话归属于自己的 project，从而在聊天服务器的会话列表中不可见（两者共用同一份会话库）
- 为调用方目录（vault）写入只读 `external_directory` 授权，使 agent 仍能读取正在编辑的笔记
- `verifyEffectiveScope()`：启动后回读 `GET /agent` 与 `GET /experimental/tool/ids`，断言 (a) agent 权限规则以 `* → deny` 结尾、(b) 原生工具目录中每个非白名单工具都被显式关闭；任一不符即抛错（fail closed）
- `listNativeSessionIds()`：回读 scope 自身 project 的会话列表，供 dispose 残留检查
- 生命周期：`ensureStarted()` 懒启动并按 read root 绑定，`dispose()` 终止进程树（Windows 用 `taskkill /T /F`）并带重试删除 scope 目录

## 依赖

- `node:child_process` / `node:fs` / `node:net` / `node:os` / `node:path`
- `src/shared/logger.ts`：`createLogger`

## 维护约束

- **禁止**把生成配置写进 vault `.opencode` 或 `~/.config/opencode`；scope 目录是唯一落点
- `KNOWN_OPENCODE_TOOLS` 是启动前可写出的静态目录；启动后必须与 `/experimental/tool/ids` 对齐，新工具出现时验证会失败而不是静默放行
- 环境变量白名单（`OPENCODE_CONFIG` / `OPENCODE_PURE`）是隔离契约的一部分，新增注入前先确认不会扩大配置作用域
- 该文件只被 `OpenCodeAuxQuerySession` 使用；scope 是共享的温实例，**每会话**的原生 session 由会话对象负责创建与删除
