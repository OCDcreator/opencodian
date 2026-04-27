# 测试框架

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
