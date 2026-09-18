# CanvasGenerationFlow

> **源码**: `src/features/canvas-integration/CanvasGenerationFlow.ts`
> **状态**: [REVIEW]

## 概述

R-C5 生成流程编排（设计 §3.3/E1/E3）。入口链：`generateFromNotes()` = R-A7 多选 picker（组合根注入；R-B2 主题组作为 picker 内一键行，命中即解析为组条目；文件夹条目展开为其中全部 markdown）→ 模式弹窗（E1：文件引用为默认；AI 拆分为显式二级选项，无可用只读后端时禁用并说明）→ `generateFromResolvedNotes()`（公开供契约测试，比照 R-C4 `applyAnnotationWrite` 先例）。

拆分模式走只读 aux 会话：`buildCanvasSplitSystemPrompt` + `buildCanvasSplitPrompt` → `findWriteToolCalls` 阻断审计 → `parseCanvasSplitProposal` 严格解析；任何不可用结果都以稳定 reason 明示并**回退文件引用模式**（设计允许的显式替代，非静默降级，§6.4）。

落盘唯一路径 = `CanvasGenerationService.generate`（内存构建 → 双重校验 → 冲突后缀 → 单次 `vault.create` → 失败回收，验收 4）。创建成功后经 `EditRevertService.registerPluginCreatedAsset` 登记（created 条目，回退 = Obsidian 回收站），随后按 R-B5 record-then-close 约定 `endBatchCapture` 立即可一键回退；无会话可归属时成功通知明确说明"未纳入编辑回退覆盖"。

## 关键导出

| 导出 | 说明 |
|------|------|
| `CanvasGenerationFlow.generateFromNotes()` | 命令入口（pick → mode → create） |
| `generateFromResolvedNotes(notes, choice)` | 模式执行（契约测试入口） |
| `CanvasPickedEntry` / `CanvasGenerationFlowPorts` | 组合根端口（app、editRevert、会话 id、aux、picker、notify） |
| `openCanvasGenerationModeModal()` | 模式 + 标题选择（原生 Modal，无自定义 CSS） |

## 边界与约束

- 测试：`tests/unit/features/canvas-integration/CanvasGenerationFlow.test.ts`（真实 `EditRevertService` + 共享 vault harness：失败零残留、登记可回退、拆分只读零写、诚实通知）。
- 文件浏览器多选内部 API 的增强未实现（E3 的 feature-detect 回退态）：picker 保持唯一入口，已如实上报。
