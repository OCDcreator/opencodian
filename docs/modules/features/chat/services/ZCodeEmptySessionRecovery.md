# ZCodeEmptySessionRecovery

> 源码: src/features/chat/services/ZCodeEmptySessionRecovery.ts

## 职责

仅处理 ZCode 的 deferred 空原生会话：官方 app-server 在 `session/resume`
以结构化 `-32004`（`sessionUnavailable`）确认原 id 不存在后，若 OpenCodian 当前会话仍为 ZCode
且本地 `messages.length === 0`，才持久化 adapter 返回的新原生 id。重绑会清除
旧 id 的 context usage 快照，并保留 composer 草稿（草稿不属于本模块）。

有任意本地消息的会话、后端/会话在 await 期间切换的情况，以及 adapter 缺失，
一律不重建、不修改 id。持久化失败会还原内存中的 id、用量和更新时间。替换会话
由 adapter 的 `createSession()` 路径创建，因此会重应用已配置的 ZCode model /
thinkingLevel / mode 默认；没有配置的字段保持原生默认，并由后续原生 readback 显示。

## 验证

`tests/unit/features/chat/ZCodeEmptySessionRecovery.test.ts` 覆盖空会话重绑、
有历史的严格拒绝、await 期间的会话切换、以及存储失败回滚。
