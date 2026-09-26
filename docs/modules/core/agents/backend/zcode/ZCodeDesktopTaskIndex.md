# ZCodeDesktopTaskIndex

> 源码: src/core/agents/backend/zcode/ZCodeDesktopTaskIndex.ts

## 职责

仅加载用户已安装的官方 ZCode 桌面包中的 `TaskIndexRepo` 类，按官方软删除语义调用 `seedTaskMetaIfMissing`、`updateTaskState({deleted:true})` 和 `listDeletedTaskIds`。入口须是 `glm/zcode.cjs`，包名须为 `@zcode/desktop`，索引类和方法必须精确存在；不自行拼 SQL、不操作 ZCode 桌面窗口、不从 V4 `deleteSession` ACK 推断持久历史已删除。哈希 chunk 名动态发现，且只允许唯一的官方类定义。官方包变更或缺失时安全拒绝。

该索引只隐藏桌面任务列表项；原生 session store 仍保留数据。适配器在删除前以 native session ID、workspacePath、sessionKind 校验目标，读回 tombstone 集并检查新增项只有目标 ID。OpenCodian 会话本地删除须等待该读回。

当 app-server 使用独立源码 CLI 覆盖时，索引桥仍接收另行定位的已安装官方桌面包路径；不能将源码 CLI 路径误传给这里的包身份检查。官方桌面包缺失时保持安全拒绝。

## 验证

`tests/unit/core/agents/backend/ZCodeAdapter.sessions.test.ts` 覆盖目标、相邻会话与读回失败；Test Vault 实机证据见 `.visual-evidence/zcode-continued/official-session-lifecycle-2026-09-25.md`。
