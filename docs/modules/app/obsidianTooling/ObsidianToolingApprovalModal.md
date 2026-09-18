# 高影响操作确认对话框

> **源码**: `src/app/obsidianTooling/ObsidianToolingApprovalModal.ts`
> **状态**: [REVIEW]

## 概述

门请求到达时展示的模态确认（AC5 的"显式确认对话框"）：显示将执行的精确子命令与参数。**允许一次** = 写 `allow` 决策（仅该次、该 argv）；**拒绝**、Esc 或关闭对话框一律按 `deny` 处理——fail-closed，包装脚本不执行任何东西。

## 关键导出

| 导出 | 说明 |
|------|------|
| `ObsidianToolingApprovalModal` | Modal 子类；`onClose` 兜底 `deny` |
| `ObsidianToolingApprovalChoice` | `'allow' | 'deny'` |
