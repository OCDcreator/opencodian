# OpenCodeSdkExperimentalActionCoordinator

> **源码**: `src/core/opencode/OpenCodeSdkExperimentalActionCoordinator.ts`
> **状态**: [REVIEW]

## 概述

实验性、会改变服务器状态的 OpenCode SDK 操作统一由该 coordinator 处理。它不是 SDK boundary；所有实际调用仍由 `OpenCodeService` 通过 `OpenCodeSdkFacade` 完成。

## 核心逻辑

- 可执行集合仅包含 PTY 创建/移除、project copy、control-plane 会话迁移和后台会话。
- 每次执行都验证 action 与 capability id 的固定映射、生产 capability availability、显式确认、确认 target 与实际 input 的一致性，以及非 dry-run 状态。
- PTY 创建在取消或失败且返回已创建 id 时执行 best-effort remove；结果只暴露 completed/cancelled/unsupported/failed 和粗粒度 cleanup outcome。
- `v2.session.create` 保持 deferred，不在此 coordinator 中执行；已有会话生命周期 owner 继续拥有正常建会话路径。

## 边界

- 不能从 Settings 或 Chat 直接调用 raw SDK endpoint。
- 返回值不得包含 token、credential、原始 SDK/server 错误或 action 原始 payload。
- coordinator 不保存 gate；gate 的持久化与刷新仍在 Settings owner 和 capability discovery。
