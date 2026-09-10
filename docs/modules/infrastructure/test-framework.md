# 测试框架

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
