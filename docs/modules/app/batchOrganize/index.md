# 批量整理运行时组合（barrel）

> **源码**: `src/app/batchOrganize/index.ts`
> **状态**: [REVIEW]

## 概述

`app.batch-organize` owner 的桶导出：`BatchOrganizeCoordinator`（预览/执行握手、强制快照、vault 写路径、`BatchRevertResult` 回退结果含残留目录上报）与 `BatchOrganizeModal` / `BatchRevertConfirmModal`（模板表单、预览确认、结果回退入口、回退确认）。由 `main.ts` 构造并注册两条命令（打开模板模态 / 回退上一次批量）。
