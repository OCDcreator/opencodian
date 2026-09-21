# EditRevertPreviewModal
> 2026-09-21 (advantage-parity R-F3 质量修复)：行数两侧各加语义标签（`linesBeforeLabel` = 本轮开始时 / `linesAfterLabel` = 捕获结束时），不再显示两个无名数字；每行新增 `opencodian-edit-revert-preview-action` 动作说明，created = 回退将删除该文件、deleted = 回退将用快照恢复、moved = 回退将重命名回原路径、modified = 回退恢复本轮开始前内容且上方数字是捕获前后统计。写回逻辑未改。中英文同步。

> **源码**: `src/features/chat/ui/EditRevertPreviewModal.ts`
> **状态**: [REVIEW]

## 概述

`EditRevertPreviewModal` 是 R-F3 在实际 R-B3 回退写入前的显式安全握手。它只渲染由 `EditRevertServicePort.getRevertPreview()` 提供的只读数据，绝不 import `EditRevertService`、绝不读写 vault；用户确认后才调用 sidebar 传入的既有回退 action。

## 输入与行为

- 每行显示 vault 相对路径，以及带标签的两侧行数：`本轮开始时 <n> 行 → 捕获结束时 <n> 行`。标签说明这两个数字是「本轮开始时」与「捕获结束时」的统计，不是「点击回退前/后」；行数不可诚实计算时该侧显示“不可计算”。
- 每行还有一句动作说明，直接讲清回退会做什么（created → 删除文件；deleted → 用快照恢复；moved → 重命名回原路径；modified → 恢复本轮开始前内容）。
- 冲突行同时使用警告图标、文本和 1px 边框，不以颜色作为唯一信号。冲突存在时明确说明“捕获后已修改”或“捕获基线不可用”，确认文案改为“仍然回退”。
- 普通行提供“取消 / 确认回退”；错误、无目标或 `roundOpen` 预览都 fail-closed，仅有取消按钮，不能调用确认 callback。
- `resolve` 为一次性 gate：关闭、取消、重复 click 均不会重复执行 callback。

## 交互边界

`ModifiedFilesSidebar` 负责 preview-first 请求与 modal 生命周期锁，`OpenCodianView` 仅把 consumer-owned port 的 preview 与原有 action 组装为 callbacks。写语义仍只属于 `EditRevertVaultWriteback`。

## 验证

聚焦测试：`tests/unit/features/chat/EditRevertPreviewModal.test.ts` 覆盖行数、冲突图标/文案、确认二选一，以及失败/开放 round 时的无确认 fail-closed 行为。
