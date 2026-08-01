# 可维护性改进：第二百四十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-245.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（context catalog batch scan / yield runner extraction）

本轮先按 lane map 的 P3 首查入口复审了 context catalog 这条 seam，并沿上一轮已经打开的 build/cache 边界继续收束；确认 `ContextFileCatalogService` 里剩余的高价值、低风险责任集中在 **batch scan / async yield 执行流程**，于是选择只做这一处单一切片：**新增 `ContextFileCatalogBuildRunner`，把 Vault 文件数组的分批扫描、批次间让出事件循环，以及 build 结束后的 index finalize 从 `ContextFileCatalogService` 中拆出，让 service 进一步收窄为 cache/build promise orchestration。**

这次改动保持 context picker 的文件可见性、排序顺序、扩展名桶内容、惰性缓存语义，以及 create/delete/rename 增量更新行为不变。变化点只在于 catalog build pipeline 不再内联在 service 中，而是由单独 runner 执行。

## 1. 本轮范围

- `src/features/chat/services/ContextFileCatalogBuildRunner.ts`
  - 新增 context catalog build runner
  - 集中批量扫描、批次 yield 与 `ContextFileCatalogIndex.finalizeBuild()` 收尾
- `src/features/chat/services/ContextFileCatalogService.ts`
  - 改为只负责 `vault.getFiles()` 读取、lazy cache、build promise 协调与 vault 事件转发
  - 不再直接持有 batch size / `setTimeout(0)` / append-build 循环细节
- 测试
  - 新增 `tests/unit/features/chat/ContextFileCatalogBuildRunner.test.ts`
  - 保留现有 `tests/unit/features/chat/ContextFileCatalogService.test.ts` 验证 service 外部语义未变
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ContextFileCatalogBuildRunner.md`
  - 更新 `docs/modules/features/chat/services/ContextFileCatalogService.md`
  - 更新 `docs/modules/features/chat/services/ContextFileCatalogIndex.md`

## 2. 变更文件

- `src/features/chat/services/ContextFileCatalogBuildRunner.ts`
- `src/features/chat/services/ContextFileCatalogService.ts`
- `tests/unit/features/chat/ContextFileCatalogBuildRunner.test.ts`
- `docs/modules/features/chat/services/ContextFileCatalogBuildRunner.md`
- `docs/modules/features/chat/services/ContextFileCatalogService.md`
- `docs/modules/features/chat/services/ContextFileCatalogIndex.md`
- `docs/status/maintainability-phase-246.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ContextFileCatalogBuildRunner ContextFileCatalogService`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130430`

本轮未执行完整 `npm test` 的原因：

- attempt `241` 不可被 `5` 整除
- 改动未命中仓库规则要求全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3 推进，建议回到更高层的 composer/context ownership，优先复审 `OpenCodianView` 中 context picker / retained-selection / editor bridge 的 host wiring，寻找能继续削弱 view ownership 的切口，而不是再把 catalog build pipeline 继续细拆。

一句话总结第二百四十六阶段本轮：

> 第二百四十六阶段新增 `ContextFileCatalogBuildRunner`，把 context catalog 的 batch scan / async yield 执行流程从 `ContextFileCatalogService` 中拆出，让 service 进一步收窄为 cache/build 协调层。
