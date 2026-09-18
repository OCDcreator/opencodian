# batchOrganizePlan

> **源码**: `src/shared/batchOrganizePlan.ts`
> **状态**: [REVIEW]

## 概述

`BatchOrganizePlan` 是 R-B5 批量整理的**纯规划核心**（shared.foundation owner，与 R-B3 的 `editRevertPlan` 同构）：全部逻辑确定性、不依赖 Obsidian，可直接单测。有状态的 vault 侧 owner 是 `src/app/batchOrganize/BatchOrganizeCoordinator.ts`；模板文案是产品资产，全部走 `batchOrganize.*` i18n 键，本模块不含任何用户可见字符串。

## 导入关系

```text
上游: 无（零依赖纯模块）
下游: src/app/batchOrganize/BatchOrganizeCoordinator.ts, src/app/batchOrganize/BatchOrganizeModal.ts, src/shared/index.ts
```

## 关键导出

| 导出 | 说明 |
|------|------|
| `BATCH_ORGANIZE_TEMPLATE_IDS` | 内置任务模板：`move-notes` / `edit-properties` / `rename-by-rule` |
| `matchesBatchScope` / `normalizeTag` / `normalizeTagList` | 标签（`#` 容忍、大小写不敏感、含嵌套）、属性（存在/标量字符串化等值）、关键词（名称+内容，大小写不敏感）三类范围匹配 |
| `buildBatchPlan` | 模板 + 快照 → 确定性排序的操作计划；目标占用/重名目标以 `conflicts` 显式排除（**绝不覆盖**） |
| `planSignature` / `plansAreIdentical` | 计划签名；执行前重算比对，漂移即 fail-closed 拒绝（零写入） |
| `collectTargetFolders` | R-B5-D1：移动/重命名操作的目标目录清单（去重、码点序、父先于子、排除根目录）；执行侧据此确保目录存在，预览侧据此如实列出"将新建目录" |
| `parseBatchPropertyValue` / `applyBatchPropertyOperation` | 表单原始输入 → 带类型的属性值（text/number/boolean/list）；在 `processFrontMatter` 回调内按声明 JS 类型变更 frontmatter（YAML 序列化完全留给 Obsidian） |
| `validateTargetFolder` / `validateRenameRule` / `validatePropertyName` | 参数校验（错误码，UI 侧映射为 i18n 文案） |

## 边界与约束

- `BatchNoteSnapshot` 是匹配器的唯一输入（路径/名称/标签/属性/可选小写正文），由协调器从 metadataCache 与 `vault.cachedRead` 构建——本模块不感知 Obsidian。
- 关键词范围为空串、标签归一化后为空一律视为不匹配（fail-closed）。
- 重命名只改文件名主干、保留 `.md` 扩展名；规则把主干清空/产生路径分隔符时视为无效结果并排除。
- 计划排序按源路径码点序，保证签名稳定（跨输入顺序、跨机器）。
