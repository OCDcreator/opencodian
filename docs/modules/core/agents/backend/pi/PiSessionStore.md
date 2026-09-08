# Pi 会话元数据

> 源码: `src/core/agents/backend/pi/PiSessionStore.ts`
> Updated: 2026-09-08

## 职责

Pi 自己拥有 JSONL 历史格式，插件只保存 pi-UUID 句柄和标题/时间元数据；默认路径为 vault/.pi/opencodian-sessions。元数据原子替换，单会话删除不影响同目录其他会话。

## 边界与升级

拒绝非法 id 和目录外 clone 路径。分叉通过官方 clone RPC 生成历史后导入，不手动拼接或重写历史记录。

## 验证

定向测试位于 `tests/unit/core/agents/backend/pi/` 和 `tests/unit/features/chat/services/PiModelSelectionBinding.test.ts`；真实协议冒烟为 `node scripts/pi-rpc-smoke.mjs`。完整门禁为 `npm run verify`。
