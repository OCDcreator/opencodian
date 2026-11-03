# ZCodePersonalConfigService

> 源码: src/core/agents/backend/zcode/ZCodePersonalConfigService.ts

编辑 ZCode 实际使用的个人 API 配置，官方登录保持独立。schemaVersion 1 下只编辑 standard-personal/api-key、受支持协议的服务；account provider 和其他原生定义只读。表单字段为名称、协议、URL、密钥、模型 ID。读快照只含 hasApiKey，编辑留空保留已有密钥，不把 secret 回传 UI。

事务：原生 sidecar 锁 → allowlist/no-follow 读取 → 完整 FileRevision 冲突检查 → 保留未编辑字段 → 归档 → 原子写 → 新 revision。外部修改返回 conflict，不覆盖。删除模型仅移除该 provider 对应 model rules 和失效默认，不影响其他服务。保存只证明 persistence；目录刷新和会话 application 必须另读。

验证：ZCodePersonalConfigService.test.ts 覆盖 schema、新建/编辑/删除、密钥遮蔽/保留、未知字段保留、冲突、账户/URL/密钥校验与 symlink 拒绝。
