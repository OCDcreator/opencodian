# 可维护性改进：第三百二十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-328.md`
> **推进的 master-plan lane**: P1 `OpenCodianView header / server status shell`
> **完成的 roadmap queue item**: `R14 - Header and server status shell presenter`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R14 - Header and server status shell presenter`。本轮没有切换到 composer input、model/permission selector 或 appearance/glass，也没有修改 server manager / OpenCode service 行为；只把 header DOM、server status badge/loop、wordmark/settings/new-tab/history action 组装从 `OpenCodianView` 迁到一个较厚 presenter。

## 1. 本轮范围

- 新增 `src/features/chat/services/ChatHeaderPresenter.ts`
  - 统一承接 header title/logo/wordmark、header tab bar slot、server status badge、new/current-tab、history 与 settings 按钮 DOM refs
  - 管理 server status polling、manual refresh、status class、local/remote label 和 locale refresh
  - 通过 host seam 调用 view/plugin 层的 server availability、settings tab、history、new-tab、asset URL 与 layout/color sync 回调
- 收缩 `src/features/chat/OpenCodianView.ts`
  - `buildHeader()`、server status loop/status label、logo/wordmark sync 与 header button refs 离开主 view
  - view 只创建 `ChatHeaderPresenter`、提供 callbacks，并保存 presenter 暴露的 header tab bar slot
  - `OpenCodianView.ts` 从 R13 后的 **7582 行** 收缩到本轮 build 后的 **7414 行**
- 更新 focused tests 与模块文档
  - 新增 `tests/unit/features/chat/ChatHeaderPresenter.test.ts`
  - 新增 `docs/modules/features/chat/services/ChatHeaderPresenter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md` 与 `docs/modules/README.md`，说明 header/status shell ownership 已迁出

## 2. 削弱的 owner 与缩短的链路

- 削弱的 owner：`src/features/chat/OpenCodianView.ts`
  - 主 view 不再直接持有 header action refs、server status interval、status refresh flag、last availability、logo SVG 与 wordmark asset sync
- 缩短的主链路：
  - 原链路：`OpenCodianView` → `buildHeader()` / `startServerStatusLoop()` / `refreshServerStatusBadge()` / `getServerStatusLabel()` / `syncTitleWordmarkSrc()`
  - 现链路：`OpenCodianView` → `ChatHeaderPresenter`
- 刻意没有动的边界：
  - 没有改 server manager、OpenCode service health check、server start/restart 语义
  - 没有混入 model selector、permission selector、composer input 或 send pipeline 语义
  - 没有改 P2 question/todo/background-task、P3 composer-context、P4 persisted assistant shell

## 3. 验证

- Targeted:
  - `npm test -- --runInBand --runTestsByPath tests/unit/features/chat/ChatHeaderPresenter.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604132148`

## 4. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/features/chat/**`、`tests/unit/features/chat/**`、`docs/modules/**` 与 `docs/status/**`，未命中 AGENTS 规定的 deploy-relevant runtime/style/settings 路径

## 5. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ChatHeaderPresenter.ts`
- `tests/unit/features/chat/ChatHeaderPresenter.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ChatHeaderPresenter.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-329.md`

## 6. 下一步建议

下一轮应按 roadmap 推进 `R15 - Composer input shell coordinator`：优先收束 `buildInputArea`、textarea 行为、submit gate、高度同步与 composer layout metrics，不要混入 liquid-glass diagnostics、model selector 或 permission selector。

一句话总结第三百二十九阶段本轮：

> 第三百二十九阶段完成 R14，把 `OpenCodianView` 的 header/server status shell 收束到 `ChatHeaderPresenter`，让主 view 只保留 presenter host callbacks 与 header tab-slot 写回。
