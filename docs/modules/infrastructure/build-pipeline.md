# 构建管线

> **源码**: `esbuild.config.mjs`, `scripts/build.mjs`, `scripts/build-css.mjs`, `scripts/build-utils.mjs`
> **状态**: [DRAFT]

## 概述

基于 esbuild 的构建管线，支持开发模式（watch + hot reload）和生产模式（tree-shaking + 产物输出到 dist/）。每次构建生成唯一 `BUILD_ID`（`{branch}.{timestamp}` 格式），注入为全局常量。CSS 由 `scripts/build-css.mjs` 从 `src/style/` 合并生成，生产构建会在打包前自动执行该步骤。

## 导入关系
上游: `esbuild`, `child_process`, `fs`, `path`, `process`, `builtin-modules`
下游: 产出 `dist/main.js`, `dist/manifest.json`, `dist/styles.css`

## 核心类型 / 接口

无 TypeScript 类型。全部为 ESM (.mjs) 脚本。

## 核心逻辑

### CI 门禁 (`.github/workflows/ci.yml`)

仓库现在有一个最小质量门禁工作流，在 `push` 和 `pull_request` 上顺序执行：

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build`
6. `git diff --exit-code -- styles.css`

最后一步的意义是：确保提交中的 `src/style/**` 改动已经同步刷新到根目录 `styles.css`，避免 CI 通过但仓库产物滞后。

### BUILD_ID 生成 (`scripts/build-utils.mjs`)

```javascript
function generateBuildId() {
  const branch = sanitizeBranchName(getGitBranch());  // git branch → sanitize
  const timestamp = getLocalTimeStamp();               // YYYYMMDDHHmm
  return `${branch}.${timestamp}`;
  // 示例: "fix-revert-model-toggle.202603271430"
}
```

`getGitBranch()` 执行 `git rev-parse --abbrev-ref HEAD`，失败返回 `'unknown'`。
`sanitizeBranchName()` 将 `/` 替换为 `-`，移除非字母数字字符。

### 主构建 (`esbuild.config.mjs` / `scripts/build.mjs`)

esbuild 配置：

| 选项 | 值 |
|------|-----|
| entryPoints | `['src/main.ts']` |
| format | `cjs` |
| target | `es2018` |
| bundle | `true` |
| treeShaking | `true` |
| external | `obsidian`, `electron`, `@codemirror/*`, `lezer`, `@lezer/*`, 所有 Node.js builtin |
| define | `BUILD_ID: JSON.stringify(buildId)` |
| sourcemap | dev: `'inline'`, prod: `false` |
| outfile | dev: `'main.js'`, prod: `'dist/main.js'` |

生产模式额外步骤：
1. 调用 `buildCss()` 读取 `src/style/index.css` 并生成根目录 `styles.css`
2. `fs.copyFileSync('manifest.json', 'dist/manifest.json')`
3. `fs.copyFileSync('styles.css', 'dist/styles.css')`
4. `copyDirectoryIfExists('assets', 'dist/assets')`

### CSS 构建 (`scripts/build-css.mjs`)

读取 `src/style/index.css` 的 `@import` 顺序，将引用到的 CSS 片段合并到根目录 `styles.css`，每个片段添加注释标记。

## 关键方法

| 脚本 | npm 命令 | 说明 |
|------|----------|------|
| `esbuild.config.mjs` | `npm run dev` | 开发模式（watch） |
| `scripts/build.mjs` | `npm run build` | 生产构建 |
| `scripts/build-css.mjs` | `npm run build:css` | CSS 合并 |
| `scripts/build-utils.mjs` | — | 共享工具函数 |

## 数据流

```
npm run dev
  → esbuild.config.mjs
    → generateBuildId()
    → esbuild.context({ ... })
    → context.watch()  // 监听变更自动重构建
    → 输出 main.js (带 inline sourcemap)

npm run build
  → scripts/build.mjs production
    → buildCss()
      → 读取 src/style/index.css
      → 生成根目录 styles.css
    → generateBuildId()
    → esbuild.context({ ... outfile: 'dist/main.js' })
    → context.rebuild()
    → 复制 manifest.json, styles.css, assets/ 到 dist/
```

## 与其他模块的交互

- **main.ts**: 使用 `BUILD_ID` 全局常量（构建时注入）
- **package.json**: 定义 npm scripts
- **Obsidian plugin API**: 产出 `main.js` 作为插件入口

## 配置项

| npm script | 命令 | 说明 |
|------------|------|------|
| `dev` | `node esbuild.config.mjs` | 开发模式 |
| `build` | `node scripts/build.mjs production` | 生产构建（自动包含 CSS 合并） |
| `build:css` | `node scripts/build-css.mjs` | CSS 构建 |

## 注意事项

- 开发模式输出到根目录 `main.js`（Obsidian 直接加载）
- 生产模式输出到 `dist/` 目录（需手动部署到 vault）
- `external` 列表确保不打包 Obsidian 和 CodeMirror 运行时依赖
- BUILD_ID 在构建时硬编码，不会在运行时改变
- `npm run build` 已内置 CSS 合并；若只想刷新根目录样式产物，可单独运行 `npm run build:css`
- CI 会在构建后检查 `styles.css` 是否仍然干净，因此样式修改需要把生成产物一并提交

## 待补充
- [ ] Source map 上传服务集成
- [ ] 增量构建优化
- [ ] 构建缓存策略
