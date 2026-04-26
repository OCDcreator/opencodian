# 构建 & 工具脚本

> **源码**: `scripts/`
> **状态**: [REVIEW]

## 概述

项目辅助脚本集合，涵盖生产构建、CSS 合并、BUILD_ID 生成、esbuild 平台检查、版本发布、graphify 刷新/新鲜度检查、devlog 排序验证和模块文档硬约束。脚本主要为 ESM (.mjs) 格式，通过 npm scripts 调用。

## 导入关系
上游: `esbuild`, `child_process`, `fs`, `path`, `process`
下游: `package.json` (npm scripts)

## 核心类型 / 接口

无 TypeScript 类型。全部为 ESM 脚本。

## 核心逻辑

### build.mjs — 生产构建

入口脚本，使用 esbuild 打包：
1. 确保 `dist/` 目录存在
2. 调用 `buildCss()` 先从 `src/style/index.css` 生成根目录 `styles.css`
3. 调用 `generateBuildId()` 生成构建 ID
4. esbuild context 配置（entry: `src/main.ts`, format: `cjs`, target: `es2018`）
5. `context.rebuild()` 执行构建
6. 复制 `manifest.json`, `styles.css`, `assets/` 到 `dist/`

esbuild 平台不匹配时输出友好错误提示，引导运行 `npm run doctor:esbuild:fix`。

### build-css.mjs — CSS 合并

读取 `src/style/index.css` 的 `@import` 列表，按声明顺序合并 CSS 到根目录 `styles.css`。每个片段添加 `/* filename */` 注释标记。

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

### update-graphify-src.mjs — src-scoped graphify 刷新

运行当前平台可用的 Python graphify 入口，对 `src/` 做增量 code graph 更新；Windows 使用 `py -m graphify update src`。刷新完成后，把 `src/graphify-out/GRAPH_REPORT.md` 和 `src/graphify-out/graph.json` 同步回根目录 `graphify-out/`，再删除临时的 `src/graphify-out/`。

### check-graphify-freshness.mjs — graphify 新鲜度检查

验证根目录 `graphify-out/GRAPH_REPORT.md` 和 `graphify-out/graph.json` 是否跟上 `src/`：
- 对已提交历史，比较最近 `src/` commit 与最近 graphify artifact commit。
- 对本地未提交 `src/` 改动，比较源码文件 mtime 与 graphify artifact mtime；已刷新但尚未提交的 `graphify-out/` 改动会被接受。

检查失败时提示运行 `npm run graphify:update:src`。该脚本不自动运行 graphify，避免常规验证时触发昂贵或会改动工作区的生成流程。

### module-doc-guard-lib.mjs — 模块文档 guard 共享库

读取 `module-docs.config.json`，统一处理路径归一化、glob 匹配、源码到文档映射、git diff name-status 解析，以及新增 / 删除 / rename 时需要检查的聚合文档推导。

### check-module-doc-coverage.mjs — 模块文档覆盖检查

对当前工作区文件树做最终态检查：
- 源码存在但映射文档不存在时失败
- 文档存在但映射源码已删除时失败
- 非源码文档必须通过 `docIgnore` 显式列入例外

### check-module-doc-diff.mjs — 模块文档 diff 同步检查

对指定 git diff 范围做责任检查。默认 npm 脚本使用 `--range HEAD`，因此本地修改源码但没有同步触碰映射文档会失败；分支 / CI 可显式使用 `--range origin/main...HEAD`。

### list-module-doc-targets-from-diff.mjs — 文档同步目标列表

非失败型辅助脚本，输出某个 diff 范围内必须更新的直接模块文档，以及新增 / 删除 / `index.ts` 变更时建议检查的父级 `index.md` 或 `docs/modules/README.md`。

### run-jest.js — Jest 启动器

Node.js 脚本形式的 Jest 启动包装器。

### sync-version.js — 版本同步

确保 `manifest.json` 的 `version` 字段与 `package.json` 保持一致。

### sync-lobehub-icons.mjs — LobeHub 图标清单同步

从 `@lobehub/icons` 包读取 provider icon 目录（toc），按 variant（mono/color/brand/brand-color/text/text-cn/text-color/combine/avatar）生成 TypeScript manifest 文件 `src/utils/icons/lobehubIconManifest.ts`。每个 provider entry 包含可用 variant 列表、静态 SVG CDN URL 和 CDN base URL。生成的 manifest 供 `ProviderIconService` 和 `lobehubIconManifest.ts` 消费，避免运行时动态 import 整个 LobeHub 图标包。

## 关键方法

| 脚本 | npm 命令 | 说明 |
|------|----------|------|
| `build.mjs` | `npm run build` | 生产构建 |
| `build-css.mjs` | `npm run build:css` | CSS 合并 |
| `build-utils.mjs` | — | 共享工具（被其他脚本 import） |
| `doctor-esbuild.mjs` | `npm run doctor:esbuild` / `doctor:esbuild:fix` | esbuild 平台检查/修复 |
| `release.mjs` | `npm run release:patch/minor/major` | 版本发布 |
| `update-graphify-src.mjs` | `npm run graphify:update:src` | 刷新 `src` 范围 graphify artifacts |
| `check-graphify-freshness.mjs` | `npm run check:graphify` | 检查 graphify artifacts 是否跟上 `src` |
| `check-devlog-order.mjs` | `npm run check:devlog-order` | Devlog 排序验证 |
| `check-module-doc-coverage.mjs` | `npm run check:module-docs:coverage` | 模块文档覆盖 / orphan 检查 |
| `check-module-doc-diff.mjs` | `npm run check:module-docs:diff` | 源码 diff 必须同步触碰映射文档 |
| `list-module-doc-targets-from-diff.mjs` | `npm run list:module-docs` | 输出本次 diff 的文档同步目标 |
| `run-jest.js` | `npm run test` | Jest 启动 |
| `sync-version.js` | — | 版本同步 |
| `sync-lobehub-icons.mjs` | `npm run sync:lobehub-icons` | 从 `@lobehub/icons` 生成 provider icon manifest |

## 数据流

```
npm run build
  → scripts/build.mjs production
    → buildCss()
    → 生成根目录 styles.css
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

npm run graphify:update:src
  → scripts/update-graphify-src.mjs
  → py/python -m graphify update src
  → 同步 src/graphify-out/{GRAPH_REPORT.md,graph.json}
  → 清理 src/graphify-out/

npm run check:graphify
  → scripts/check-graphify-freshness.mjs
  → 比较 src commit/mtime 与 graphify artifacts commit/mtime
  → graphify stale 时失败并提示刷新命令

npm run check:module-docs
  → scripts/check-module-doc-coverage.mjs
  → module-docs.config.json 映射源码与 docs/modules
  → 验证缺失文档与 orphan 文档
  → scripts/check-module-doc-diff.mjs --range HEAD
  → 验证源码 diff 已同步触碰映射文档

npm run list:module-docs -- --range origin/main...HEAD
  → scripts/list-module-doc-targets-from-diff.mjs
  → 输出 Required module docs
  → 输出 Aggregate docs to inspect
```

## 与其他模块的交互

- **package.json**: 定义所有 npm scripts
- **esbuild.config.mjs**: 开发模式使用相同的 build-utils.mjs
- **devlog.md**: 被 check-devlog-order.mjs 验证
- **graphify-out/**: 被 update-graphify-src.mjs 刷新，被 check-graphify-freshness.mjs 验证
- **module-docs.config.json**: 被模块文档 guard 脚本读取，定义源码根、文档根、例外和特殊映射
- **docs/modules/**: 被模块文档 coverage / diff gate 强制和 `src/` 保持同步

## 配置项

- 构建、release、devlog 等脚本主要通过 npm scripts 配置。
- graphify graph 固定为 `src/` 范围；不要把 `npm run graphify:update:src` 替换成 whole-repo `graphify update .`。
- 模块文档 guard 通过 `module-docs.config.json` 配置；新增源码根、样式根、特殊入口或非源码文档例外时必须同步更新该文件。
- `check-module-doc-diff.mjs` 支持 `--range <range>` 或 `MODULE_DOC_DIFF_RANGE`，本地 verify 默认使用 `HEAD`，分支审核建议使用 `origin/main...HEAD`。

## 注意事项

- `build.mjs` 和 `esbuild.config.mjs` 有重叠逻辑（esbuild 配置），修改时需同步
- `src/style/index.css` 的导入顺序就是生产产物中的样式顺序，调整覆盖关系时优先改这里
- `doctor-esbuild.mjs` 的平台映射表需要随 esbuild 更新而维护
- `release.mjs` 使用 `npm install --package-lock-only` 更新 lockfile
- `check-devlog-order.mjs` 在 CI/handoff 前应运行
- `check:graphify` 已接入 `npm run verify`；如果修改了 `src/`，通常需要先运行 `npm run graphify:update:src`
- `check-module-docs` 已接入 `npm run verify`，源码模块新增、修改、删除时不能跳过对应文档
- `sync-version.js` 应在 release 后自动运行

## 待补充
- [ ] 脚本间的依赖关系图
- [ ] CI 集成脚本
- [ ] 自动 changelog 生成
