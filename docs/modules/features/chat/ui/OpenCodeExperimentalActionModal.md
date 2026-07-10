# OpenCodeExperimentalActionModal

> **源码**: `src/features/chat/ui/OpenCodeExperimentalActionModal.ts`
> **状态**: [REVIEW]

## 概述

该 modal 是已通过生产 gate 的实验性 OpenCode 操作的 Chat 确认面。它只接收已经可用的 action id，并把请求交给 `OpenCodeService.runExperimentalAction()`。

## 核心逻辑

- PTY 输入当前 vault scope 与 shell command；modal 同时只拥有一个 PTY，创建成功后禁用再次创建、提供显式移除按钮，modal 关闭也会清理仍归其拥有的 PTY。
- project copy 展示 source/destination 预览，并固定使用 `git_worktree` strategy。
- control-plane 迁移固定 `moveChanges: false`，确认 target 必须是输入的目标目录。
- 后台会话成功后只调用 callback 追加当前 turn 的状态提示，不写入 foreground stream 或 `session.status`。

## 边界

- 每个按钮在调用 service 前都会要求最后一次浏览器确认。
- modal 不保存 Settings、不直接读取 facade，也不展示原始 server 返回内容。
