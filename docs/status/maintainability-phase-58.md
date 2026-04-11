# 可维护性改进：第五十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-57.md`

本轮先处理上一阶段建议之外、但已经阻塞 macOS 基线验证的前置问题：**把 `OpenCodeService` 里分散的 Windows vault/context 路径归一化收束到独立 `contextPath` helper，并让 context file URL 构建与 attachment 路径还原都改走这套平台无关逻辑。** 这样在 macOS 环境里处理 `C:\vault`、`file:///C:/vault/...` 和 vault-relative attachment path 时，不再依赖当前宿主平台的 `path.resolve()` / `path.relative()` / `pathToFileURL()` 语义。

本轮没有改动 SDK/legacy 路由、provider/config 获取语义、question/todo 流程、上下文标签格式、行号参数格式或聊天渲染逻辑；只抽离并替换了 OpenCode context path 相关的宿主平台敏感逻辑。

## 1. 本轮范围

本轮只处理 OpenCodeService 的 Windows-path 兼容与职责拆分：

- `src/shared/contextPath.ts`
  - 新增独立 helper 模块，集中处理：
    - Windows / POSIX context path 规范化
    - 以 vaultPath 为根的相对路径解析
    - attachment path 的 vault-relative 还原
    - `file:///` URL 与路径的双向转换
- `src/core/opencode/OpenCodeService.ts`
  - 把本地 context part 的绝对路径解析改为委托 `resolveContextPath()`
  - 把 scoped `directory` 规范化改为委托 `normalizeContextPath()`
  - 删除服务内联的 context attachment path / file URL 归一化实现，改用 `shared/contextPath`
- `src/shared/obsidianContext.ts`
  - 让 `toFileContextUrl()` 改为基于 `pathToContextFileUrl()` 生成基础 file URL，再附加行号参数
- `tests/unit/shared/contextPath.test.ts`
  - 新增针对 Windows drive path、vault-relative 还原和 file URL round-trip 的平台无关单测

## 2. 变更文件

- `src/shared/contextPath.ts`
- `src/shared/obsidianContext.ts`
- `src/core/opencode/OpenCodeService.ts`
- `tests/unit/shared/contextPath.test.ts`
- `docs/modules/shared/contextPath.md`
- `docs/modules/shared/obsidianContext.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-58.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runInBand tests/unit/shared/contextPath.test.ts tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/opencode/sdkFetch.test.ts`
- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604120117`

## 5. 下一步建议

既然 macOS 下的 OpenCodeService Windows-path 基线已经恢复，下一轮最推荐回到 `ConversationRenderService` 的 skipped-debug logging 收尾：继续把 `logTrailingAssistantPatchSkippedDebug()` 里的 plan/payload 编排压缩成单一 helper，让 logger helper 只负责发送最终日志。

一句话总结第五十八阶段本轮：

> 第五十八阶段把 OpenCodeService 分散的 Windows context path / file URL 兼容逻辑抽成独立 `contextPath` 模块，修复 macOS 基线并为后续 skipped-debug refactor 清掉前置阻塞。
