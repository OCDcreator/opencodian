# 构建 & 工具脚本

> **源码**: `scripts/`
> **状态**: [DRAFT]

## 概述

项目辅助脚本集合，涵盖生产构建、CSS 合并、BUILD_ID 生成、esbuild 平台检查、版本发布和 devlog 排序验证。所有脚本为 ESM (.mjs) 格式，通过 npm scripts 调用。

## 导入关系
上游: `esbuild`, `child_process`, `fs`, `path`, `process`
下游: `package.json` (npm scripts)

## 核心类型 / 接口

无 TypeScript 类型。全部为 ESM 脚本。

## 核心逻辑

### build.mjs — 生产构建

入口脚本，使用 esbuild 打包：
1. 确保 `dist/` 目录存在
2. 调用 `generateBuildId()` 生成构建 ID
3. esbuild context 配置（entry: `src/main.ts`, format: `cjs`, target: `es2018`）
4. `context.rebuild()` 执行构建
5. 复制 `manifest.json`, `styles.css`, `assets/` 到 `dist/`

esbuild 平台不匹配时输出友好错误提示，引导运行 `npm run doctor:esbuild:fix`。

### build-css.mjs — CSS 合并

扫描 `src/style/` 目录下所有 CSS 文件，合并到根目录 `styles.css`。每个文件添加 `/* filename */` 注释标记。

### build-utils.mjs — 共享工具

三个导出函数：
- `getGitBranch()` — `git rev-parse --abbrev-ref HEAD`
- `sanitizeBranchName(branch)` — `/` → `-`，移除非字母数字字符
- `generateBuildId()` — `{sanitizedBranch}.{YYYYMMDDHHmm}`

### doctor-esbuild.mjs — 平台检查

检测当前平台（`process.platform-process.arch`）对应的 `@esbuild/*` 包是否已安装：
- `--fix` 参数：运行 `npm ci` 或 `npm install` 重装
- 无参数：仅检查并报告状态
- 支持 12 个平台（darwin/linux/win × arm64/x64/ia32 等）

### release.mjs — 版本发布

根据 bump 类型更新版本号：
- `patch`: 0.1.0 → 0.1.1
- `minor`: 0.1.0 → 0.2.0
- `major`: 0.1.0 → 1.0.0

同时更新 `package.json`, `package-lock.json` 和 `manifest.json`。

### check-devlog-order.mjs — Devlog 排序验证

检查 `devlog.md` 中 `## YYYY-MM-DD ...` 标题是否按降序排列。新条目必须插入到第一个日期标题之前，不能追加到文件末尾。

### run-jest.js — Jest 启动器

Node.js 脚本形式的 Jest 启动包装器。

### sync-version.js — 版本同步

确保 `manifest.json` 的 `version` 字段与 `package.json` 保持一致。

## 关键方法

| 脚本 | npm 命令 | 说明 |
|------|----------|------|
| `build.mjs` | `npm run build` | 生产构建 |
| `build-css.mjs` | `npm run build:css` | CSS 合并 |
| `build-utils.mjs` | — | 共享工具（被其他脚本 import） |
| `doctor-esbuild.mjs` | `npm run doctor:esbuild` / `doctor:esbuild:fix` | esbuild 平台检查/修复 |
| `release.mjs` | `npm run release:patch/minor/major` | 版本发布 |
| `check-devlog-order.mjs` | `npm run check:devlog-order` | Devlog 排序验证 |
| `run-jest.js` | `npm run test` | Jest 启动 |
| `sync-version.js` | — | 版本同步 |

## 数据流

```
npm run build
  → scripts/build.mjs production
    → build-utils.mjs (generateBuildId)
    → esbuild build
    → 复制产物到 dist/

npm run release:patch
  → scripts/release.mjs patch
    → 更新 package.json version
    → npm install --package-lock-only
    → 更新 manifest.json version

npm run doctor:esbuild:fix
  → scripts/doctor-esbuild.mjs --fix
    → 检测平台
    → npm ci
    → 验证 esbuild 可运行

npm run check:devlog-order
  → scripts/check-devlog-order.mjs
    → 读取 devlog.md
    → 提取 ## YYYY-MM-DD 标题
    → 验证降序排列
```

## 与其他模块的交互

- **package.json**: 定义所有 npm scripts
- **esbuild.config.mjs**: 开发模式使用相同的 build-utils.mjs
- **devlog.md**: 被 check-devlog-order.mjs 验证

## 配置项

所有脚本通过 npm scripts 配置，无独立配置文件。

## 注意事项

- `build.mjs` 和 `esbuild.config.mjs` 有重叠逻辑（esbuild 配置），修改时需同步
- `doctor-esbuild.mjs` 的平台映射表需要随 esbuild 更新而维护
- `release.mjs` 使用 `npm install --package-lock-only` 更新 lockfile
- `check-devlog-order.mjs` 在 CI/handoff 前应运行
- `sync-version.js` 应在 release 后自动运行

## 待补充
- [ ] 脚本间的依赖关系图
- [ ] CI 集成脚本
- [ ] 自动 changelog 生成
