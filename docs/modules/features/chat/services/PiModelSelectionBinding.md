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

## 2026-10-02 T07 产品消费

`bindPiModelSelection(host, getAdapter, getSessionId?: () => string | null | undefined)` 第三回调读取当前 Pi conversation 的 plugin-local store handle（不是 SDK UUID）。目录读取复用 typed readonly facade；levels 不再由 reasoning 布尔值推导固定枚举，max 和未来字符串按 SDK 返回保留。相同 local session 的前后 get_state 模型身份一致时，仅匹配的 provider/model 获得动态 variants；其他目录模型不宣称支持。旧 SDK unavailable/读取失败保留模型目录、显示 Notice、不猜测档位；非 Pi 分支仍保留原 Promise identity。

聚焦回归：PiModelSelectionBinding.test.ts 包含当前会话绑定、max/future level、其他模型不扩散、unsupported/failure、读期间模型变化。此 owner 不拥有模型切换后的目录刷新；宿主必须在选择/会话变化后触发既有 catalog reload。
## 2026-10-05 pending model and session persistence

目录优先使用 SDK 已提供的每模型 `thinkingLevels`，因此尚未发送的聊天选择不依赖当前 native 模型，设置返回/catalog reload 不再把该模型 variants 清空。没有该字段时保留原 current-session 前后身份校验的读取路径，空集合与 unavailable 不冒充支持。

同文件 `savePiConversationSelection` 只保存调用时捕获的 Pi conversation 的 composer override；保存失败在该 snapshot 仍有效时恢复旧选择并显示 Notice。View 的 Pi 分支以 `sessionSettings.piModelOverride/piEffortOverrides` 为真值，不写 plugin/default/native。新测试覆盖 pending model reload、两个会话失去 view/tab cache 后恢复、继承/off 和 save failure；native effective 单独验收。
