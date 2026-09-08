# Pi 模型选择绑定

> 源码: `src/features/chat/services/PiModelSelectionBinding.ts`
> Updated: 2026-09-08

## 职责

为 ModelSelectionRuntimeHost 组合 Pi 专属目录、默认值、可用性及历史 override 过滤；模型来自外部 Pi 服务，不访问 OpenCode 目录。

## 边界与升级

非 Pi 时委托原始 host，保持现有 OpenCode/Claude/Codex 模型逻辑。此模块不拥有进程、RPC 或会话状态。

## 验证

定向测试位于 `tests/unit/core/agents/backend/pi/` 和 `tests/unit/features/chat/services/PiModelSelectionBinding.test.ts`；真实协议冒烟为 `node scripts/pi-rpc-smoke.mjs`。完整门禁为 `npm run verify`。

非 Pi 分支直接返回原 host 的 Promise，不增加额外 async 包装或改变原界面的微任务更新时序；测试断言 Promise identity。

## 完整 SDK 接入

只在Pi启用preserveRequestedModel；不可用选择保留并阻止发送。模型快照保留contextWindow和reasoning variants，目录/默认值来自Pi服务。
