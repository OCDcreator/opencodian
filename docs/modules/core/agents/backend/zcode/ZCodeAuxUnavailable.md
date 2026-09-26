# ZCodeAuxUnavailable

> 源码: src/core/agents/backend/zcode/ZCodeAuxUnavailable.ts

> 2026-09-24 (票 08)：历史 fail-closed 文案，当前活跃 adapter 不再引用；实际通用辅助查询见 `ZCodeAuxQuerySession`。

## 职责

2026-09-24 纠错：官方 `session/create`/`session/resume` 有 `toolAllowlist`/`toolDenylist`，官方运行时会在模型调用前以它们过滤工具注册表；此前“协议完全没有工具限制入口”不准确。`plan` 读回仍是 `build`，但它不是安全边界。`session/read` 没有效工具清单，然而首轮后 `session/messages[].info.tools` 是可审计的原生有效工具读回，必须实测为 `[Read]`，不能把请求字段当证明。

aux 契约（`AgentAuxQueryCapability`）要求**运行时验证的只读执行**（提示词从来不是证据）。当前 adapter 已使用插件自有 `mkdtemp` 根作为第二 app-server 的 `ZCODE_STORAGE_DIR`，只读引用现有 provider config、空工具 allowlist 与无 MCP 会话；每轮读回 `session/messages[].info.tools`，并完成图片、恶意写、取消、vault/config 哈希及退出后清理审计。本模块只保留历史不可用诊断的常量与工厂，不在活跃路径中调用。

## 验证

`tests/unit/core/agents/backend/ZCodeAdapter.aux.test.ts` 已改为隔离 app-server 接线测试；真实审计在 `.visual-evidence/zcode-continued/zcode-aux-native-audit-2026-09-24.md`。文本补全的独立协议与产品路径见 `ZCodeInlineCompletionSession`。
