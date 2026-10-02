# 测试框架

## Chat diagnostics 完整方法契约提取（2026-10-02）

`ChatDiagnosticsContract.test.ts` 的删除路径源码契约改用现有 TypeScript compiler AST，按 class + method 唯一定位完整方法，替代固定 600/400 字符切片与缩进结束标记。StorageService、ConversationMetadataCache、OpenCodianPlugin 的无 trace/diagnostic 不变量和存储/metadata 委托断言保留；生产源码未变。回归覆盖长方法末尾清理、类型/default 参数与嵌套花括号、相邻/其他类同名方法隔离、600 字符后禁止的 trace 调用可见，以及缺失/歧义时 fail closed。verify attempt03 原始 13 失败日志与 test-only 962-path production 哈希证明保存在专属 evidence。

## 隐藏目录工作树发现回归（2026-10-02）

三个项目的 `testMatch` 改为 checkout-relative suffix pattern（`**/tests/...`），避免 `<rootDir>` 展开为含 `.codex` 的绝对 glob 时漏掉全部测试。`roots`、unit/integration/scripts 边界与 reference-projects 排除规则保持原约束。`jest-worktree-discovery.test.mjs` 使用 Jest 自身 matcher 验证 Windows/macOS 隐藏祖先、普通目录以及错误项目/源码路径；基线证据契约也通过 infrastructure wrapper 纳入默认 verify。

## 并发负载抖动修复（2026-09-17）

- `scripts/run-jest.js` 现在默认追加 `--maxWorkers=50%`（用户已显式传 `--maxWorkers` 时不覆盖）：20 核开发机上 jest 默认开 19 个 worker，puppeteer Chrome 启动、真实 CLI spawn 与临时目录 I/O 在全量并发下互相挤压，超时套件每轮漂移；砍半峰值并发后小核数 CI runner 不受影响（2 核 → 1 个 worker，与原默认一致）。
- 三个 puppeteer 渲染套件（model-popover-viewport-render / model-popover-provider-hierarchy / capability-lab-tab-rail-render）的 `jest.setTimeout` 从 30s 提到 60s，并给每个 `puppeteer.launch` 显式 `timeout: 60000`：负载下真正超时的是 puppeteer 自身等待 DevTools 端点的 30s 启动预算，单独提高 jest 超时救不了它。

## Windows 与异步价格回归（2026-09-10）

- CI 增加 Windows/macOS、Node 24 全量测试矩阵；Ubuntu 原有验证链保留。远端执行结果须以实际 CI run 为准。
- 模拟平台的 CLI resolver 测试同时选择对应的 path API；原生路径断言使用 `path.join`，进程边界以 mock 提供 Node/Pi 路径与 taskkill 完成事件。
- 权限失败通过文件系统调用注入 EACCES/EPERM，避免依赖 Windows 不支持的 POSIX chmod 行为或 root 权限差异。配置测试使用隔离临时 vault/home。
- Windows runner 的 `RUNNER~1` 短路径必须通过 `fs.realpathSync.native` 生成与异步生产 I/O 一致的 canonical fixture；工作流文本断言先统一 LF，CLI 夹具按平台选择 `.cmd`，不依赖已安装 CLI。
- 归档身份回归使用超过 2^53 的 bigint inode，并验证相邻大整数不会混同。
- 价格回归覆盖共享刷新 Promise、失败后重试、保存失败后的内存通知、草稿和焦点保留、所有 live tab 的缺失金额补算、迟到订阅、恢复快照、固定会话详情以及关闭清理。

> **源码**: `jest.config.js`, `tests/setup.ts`, `tests/__mocks__/`
> **状态**: [REVIEW]

## 概述

基于 Jest 30.2+ 的测试框架，支持 unit、integration 和 scripts 三个项目。Unit 测试使用 jsdom 环境，集成 Obsidian API mock。Integration 测试使用 node 环境。Scripts 测试使用 node 环境且不做 transform，用于测试 ESM (.mjs) 工具脚本的纯逻辑函数。路径别名 `@/*` 映射到 `src/*`，Obsidian SDK 模块通过 mock 文件替换。

## 导入关系
上游: `jest`, `ts-jest`, `jest.config.js`
下游: `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts`

## 核心类型 / 接口

配置文件类型：`import('@jest').Config`

## 核心逻辑

### Jest 项目结构

| 项目 | 环境 | 文件匹配 |
|------|------|----------|
| unit | jsdom | `tests/unit/**/*.test.ts` |
| integration | node | `tests/integration/**/*.test.ts` |
| scripts | node | `tests/unit/infrastructure/**/*.test.mjs` |

### 模块映射

| 模式 | 映射目标 |
|------|----------|
| `^@/(.*)$` | `<rootDir>/src/$1` |
| `^obsidian$` | `<rootDir>/tests/__mocks__/obsidian.ts` |
| `^@opencode-ai/sdk$` | `<rootDir>/tests/__mocks__/opencode-sdk.ts` |

### 路径忽略

所有配置均排除：
- `<rootDir>/reference-projects/`
- `<rootDir>/coverage/`
- `<rootDir>/dist/`

### Transform 配置

```javascript
transform: {
  '^.+\\.tsx?$': ['ts-jest', {
    tsconfig: 'tsconfig.jest.json',
  }],
}
```

### 覆盖率

```javascript
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.d.ts',
  '!src/**/index.ts',
]
coverageReporters: ['text', 'lcov', 'html']
```

## 关键方法

| 命令 | 说明 |
|------|------|
| `npm run test` | 运行所有测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |

## 数据流

```
npm run test
  → jest --config jest.config.js
    → unit 项目:
      → jsdom 环境
      → ts-jest transform
      → 模块映射 (obsidian → mock)
      → tests/unit/**/*.test.ts
    → integration 项目:
      → node 环境
      → ts-jest transform
      → tests/integration/**/*.test.ts
    → scripts 项目:
      → node 环境
      → 无 transform（原生 ESM）
      → tests/unit/infrastructure/**/*.test.mjs
    → 覆盖率收集 → coverage/
```

## 与其他模块的交互

- **tests/__mocks__/obsidian.ts**: 模拟 Obsidian API（App, Workspace, Vault 等）
- **tests/__mocks__/opencode-sdk.ts**: 模拟 OpenCode SDK
- **tests/setup.ts**: 测试环境初始化
- **tsconfig.jest.json**: Jest 专用 TypeScript 配置

## 配置项

| npm script | 命令 |
|------------|------|
| `test` | `jest` |
| `test:watch` | `jest --watch` |
| `test:coverage` | `jest --coverage` |

## 注意事项

- Unit 测试必须使用 `tests/__mocks__/obsidian.ts`，不能直接 import `obsidian`
- Integration 测试不 mock `obsidian`，适用于测试纯逻辑模块
- `reference-projects/` 目录被全局排除
- `tsconfig.jest.json` 可能与主 `tsconfig.json` 有差异（如 module resolution）
- 覆盖率排除 `index.ts` barrel 文件和 `.d.ts` 类型声明
- Scripts 测试项目不使用 ts-jest，不 mock 模块，仅测试 `.mjs` 脚本的纯逻辑导出函数

## 待补充
- [ ] Obsidian API mock 的覆盖范围和限制
- [ ] 测试覆盖率目标和各模块当前状态
- [ ] E2E 测试方案

2026-10-02 T07/T08 产品消费回归：PiClaudeSessionControlsUI.test.ts 覆盖现有 Pi 工作台动态档位/原生entries/回退及 Claude 单会话 controls 的成功、无会话、unsupported/failure、迟到响应和不持久标有效；PiAdapter.uiReads.test.ts 覆盖 typed只读facade/ID/结构/max normalization；PiThinkingAndConfiguration.test.ts 外包 Node test 直接加载真实 Pi asset handlers并使用隔离文件fixture，验证 max validator/schema与未知字段roundtrip，不访问用户global配置、不运行付费模型。既有 PiModelSelectionBinding/WorkbenchActions/SettingsClaudeCodeSection 回归随消费更新。冻结聚焦 12 suites/336 tests，命令和日志位于 final-expansion/pi-claude-ui；全量门禁由父代理统一执行。

2026-10-02 PC1：新增正式 PiConfigurationEnumRoundtrip.test.ts 包装 Node .mjs 回归，真实 createConfigurationService + 内存 FileSettingsStorage，backup 仅写隔离 owned fixture 路径。9 条 Node tests 包含 reviewer exact repro、全部 6 enums × project/global × patch/document 的 unchanged preserve、新/改未知值拒绝、允许 supported replacement、类型/unsafe-key/revision及跨scope防豁免。修前 7 pass/2 fail，修后 9/9；聚焦含既有配置/UI为4 suites/38 tests。证据 final-expansion/pi-claude-ui/review-fixes/。

PC1 最终 freeze 补跑受影响 PiBoundaryContract 后：5 suites/41 tests 通过，独立 Node enum 策略回归9/9通过；聚焦测试lint0errors/0warnings。精确命令、生产最小diff和基线记录见 pi-claude-ui/review-fixes/。
