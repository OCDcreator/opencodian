# core/canvas

> **源码**: `src/core/canvas/index.ts`
> **状态**: [REVIEW]

## 概述

R-C5 Canvas 子系统桶文件（owner `core.canvas`）。消费方（`feature.canvas-integration`、`app.composition`）统一从此导入，owner 内部文件布局对外是实现细节。

## 导出面

- `CanvasDocument`：schema、宽松解析、确定性序列化、严格写前校验（`assertWritableDocument`）。
- `CanvasLayout`：确定性网格/分组布局与几何判定。
- `CanvasGenerationService`：内存构建 → 双重校验 → 冲突后缀 → 单次 `vault.create` → 失败回收（`CanvasVaultPort` 注入）。
- `CanvasSplitProposal`：AI 主题拆分的提示词与严格 JSON 解析契约。
- `CanvasNodeWriteService`：运行时确认门、选中节点读取、文本节点 setData 写回、文件节点 process 写。

## 注意事项

- 新增导出须同步本页与 `docs/architecture/owners/core-canvas.md` 的职责描述。
- 本 owner 的不变量（往返无损、确定性布局、失败零残留、只读 aux 契约不削弱）见 owner 页 Hard invariants。
