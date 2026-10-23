# ClaudeCodeScopedSessionStore

> **源码**: `src/core/agents/backend/claude/ClaudeCodeScopedSessionStore.ts`
> **状态**: [REVIEW]

## 职责

给配置了绝对 `CLAUDE_CONFIG_DIR` 的 Claude SDK 静态会话目录 API 提供官方 `SessionStore` 接缝。SDK 0.3.283 的静态 helper 读取宿主 process env，没有独立 env/configDir 参数；query 的域 env 因此不能直接影响它们。此模块从指定根中的原生 JSONL 读取 entries，SDK 继续拥有 summary、消息链、分页、fork UUID 重映射和 rename 记录格式。

`scopeClaudeSessionCatalog` 包装 list/get/messages/subagents/fork/rename/import；显式传入的 sessionStore 优先。query 和 startup 函数保持原引用，不增加 transcript mirror，也不更改宿主 process.env。import 先经 SDK 验证 source identity，再将原始 entries 分批 append 到调用方 store，包含可读取的 subagent metadata。

## 文件边界

- 仅使用指定 config 根的 projects/projectKey/native UUID/subpath；缺失返回 null 或空目录，不回退用户全局目录。
- projectKey/subpath 分段和 UUID 校验阻止路径穿越；现有子目录、transcript、metadata 的 symlink 拒绝读取或写入。
- fork/rename 写入由 SDK 生成的 entries，保留已有前缀；文件使用 append/no-follow 和 0600 创建模式。不实现 delete。
- 无效 JSON 或 entry 明确失败，错误不携带原始 transcript 内容。
- 非绝对或显式空 config 根拒绝，不静默回退用户全局根，也不 trim 改写目录名；普通无 override 的 SDK 路径保持原行为。

## 消费与验证

`ClaudeCodeAdapter.getSdk` 在每次调用时按 settings.env、live domain env、显式 processEnv、宿主 env 的既有顺序解析 config 根。文件存储模块隔离高风险 IO，并复用到七种会话 API。

聚焦测试：`tests/unit/core/agents/backend/ClaudeCodeScopedSessionStore.test.ts`。真实 SDK 验证必须同时检查 native ID、父 JSONL 前后哈希、子文件、rename/readback、store import 和宿主 env 未变；mock 测试不替代插件重载/恢复的实机证据。

官方接缝：[SessionStore 文档](https://code.claude.com/docs/en/agent-sdk/session-storage)。

私有 `CLAUDE_CONFIG_DIR` 配合合法 `CLAUDE_CODE_PROJECT_DIR_NAME` 时，静态目录存储沿用 native 的项目别名；合法值为 1–64 个 ASCII 字母/数字/下划线/连字符，Windows 保留设备名无效，非法别名按 SDK 规则回退默认项目 key。宿主环境不变。

目录 facade 使用本文件局部结构接口，禁止引用 adapter 类型形成新的类型 SCC；SDK 和 adapter 的真实结构仍由类型检查验证。

## 目录定位（2026-10-23）

- 源码位置：`src/core/agents/backend/claude/ClaudeCodeScopedSessionStore.ts`。
- 原位置：`src/core/agents/backend/ClaudeCodeScopedSessionStore.ts`；文件名、导出接口与业务职责保持不变。
