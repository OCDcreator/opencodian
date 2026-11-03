# ZCodeNativeStore

> 源码: src/core/agents/backend/zcode/ZCodeNativeStore.ts

高风险原生文件依赖边界，复用于凭据与个人 API 配置。sidecar 目录锁遵循 ZCode atomicFileLock owner JSON 形状，只删除自己创建的 owner 文件，不回收其他 writer 的锁。竞争有上限，失败可重试。JSON 读取复用 allowlist/no-follow snapshot/revision；缺失文件与损坏内容分开。凭据缺失为退出状态，不回退桌面 store。

验证由 ZCodeAccountService.test.ts 与 ZCodePersonalConfigService.test.ts 的真实文件事务覆盖。
