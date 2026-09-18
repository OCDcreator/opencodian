# CanvasDocument

> **源码**: `src/core/canvas/CanvasDocument.ts`
> **状态**: [REVIEW]

## 概述

R-C5 `.canvas` JSON schema 与读写契约（owner `core.canvas`）。三段式分工是本文件的全部设计：`parseCanvasDocument` 宽松读（未知字段——真实库内文件中的 `readingDesk`、`x-nimbalyst`、edge 的 `toEnd` 等——原样保留，实现往返无损）；`serializeCanvasDocument` 确定性写（已知键固定键序 + 保留字段按插入序，2 空格缩进与 Obsidian 自身 writer 一致，同输入恒同输出）；`assertWritableDocument` 严格写前校验（id 唯一、边端点可解析、坐标有限、type 合法、按类型必需载荷），失败抛 `CanvasDocumentError`（稳定 reason），绝不修复、绝不静默丢弃。

## 关键导出

| 导出 | 说明 |
|------|------|
| `parseCanvasDocument(json)` | 宽松解析；仅对结构性不可能输入抛错（非法 JSON、非对象根、节点/边缺失 id） |
| `serializeCanvasDocument(doc)` | 确定性序列化（黄金测试可断言字节级一致） |
| `assertWritableDocument(doc)` | 写前强校验（未知 type 拒写；未知字段放行——它们只往返） |
| `CanvasDocumentError` | 携带稳定机器 reason 的失败类型 |
| `CANVAS_NODE_TYPES` / `isKnownCanvasNodeType()` | text/file/link/group；未来类型经宽松解析保留、写时拒绝 |

## 边界与约束

- 纯模块：零 Obsidian 导入，全部单测覆盖（`tests/unit/core/canvas/CanvasDocument.test.ts`）。
- 解析不做数值强制（无 `Number()`/`String()` 改写），保真优先；非法值由 assert 在写边界拒绝。
- 消费方：`CanvasGenerationService`（生成双重校验）、`CanvasNodeWriteService`（setData 前校验）。
