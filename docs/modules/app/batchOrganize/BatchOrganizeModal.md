# BatchOrganizeModal

> **源码**: `src/app/batchOrganize/BatchOrganizeModal.ts`
> **状态**: [REVIEW]

## 概述

R-B5 批量整理的模态 UI（configure → preview → running → result 四阶段）。configure 阶段：模板下拉（i18n 模板名）+ 范围表单（标签/属性/关键词）+ 模板参数表单；preview 阶段展示将修改的文件数与具体清单（超过 200 条折叠为"+N more"）、冲突与跳过原因，确认按钮携带计划数量；running 阶段阻止关闭（防孤儿执行态）；result 阶段显示修改数、跳过清单与**立即一键回退**按钮（AC：任务完成后回退入口立即可见）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `BatchOrganizeModal` | 主流程模态；Esc/关闭在确认前 = 取消（零写入，execute 尚未开始） |
| `BatchRevertConfirmModal` | "回退上一次批量整理"命令的确认对话框；关闭 = 取消（fail-closed） |

## 边界与约束

- 模板名、字段标签、状态与错误文案全部来自 `batchOrganize.*` i18n 键（zh/en 双语），模板是产品资产，代码不含措辞。
- 确认时把预览签名传给 `BatchOrganizeCoordinator.execute`；stale-plan / snapshot-unavailable / empty / **folder-unavailable** 四种结果以 Notice 如实呈现并回到 configure 阶段。
- 预览阶段如实列出"将新建目录"（`foldersToCreate`）；结果页披露本批次新建的目录，并说明回退会移除其中因此变空的目录（R-B5-D1）。
- 回退按钮与"回退上一次批量"确认对话框共用 `revertLastBatchAndNotify`（同一套 Notice 反馈）。
- 样式遵循 Obsidian 原生优先（h3/p/button/select/input 原生元素，无新增 CSS）。
