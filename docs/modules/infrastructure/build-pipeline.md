# 构建管线

> **源码**: `esbuild.config.mjs`, `scripts/build.mjs`, `scripts/build-css.mjs`, `scripts/build-utils.mjs`, `scripts/package-plugin-artifact.mjs`
> **状态**: [REVIEW]

## 概述

基于 esbuild 的构建管线，支持开发模式（watch + hot reload）和生产模式（tree-shaking + 产物输出到 dist/）。每次构建生成唯一 `BUILD_ID`（`{branch}.{timestamp}` 格式），注入为全局常量。CSS 由 `scripts/build-css.mjs` 从 `src/style/` 合并生成，生产构建会在打包前自动执行该步骤。

## 导入关系
上游: `esbuild`, `child_process`, `fs`, `path`, `process`, `builtin-modules`
下游: 产出 `dist/main.js`, `dist/manifest.json`, `dist/styles.css`

## 核心类型 / 接口

无 TypeScript 类型。全部为 ESM (.mjs) 脚本。

## 核心逻辑

### CI 门禁 (`.github/workflows/ci.yml`)

仓库现在有两个 CI 门禁 job，都会在 `push` 和 `pull_request` 上运行：

1. `owner-guard`
2. `verify`

`owner-guard` job：

1. `actions/checkout@v4` with `fetch-depth: 0`
2. `npm ci`
3. `npm run check:owner-guard`

该 job 单独存在是为了尽早失败，并确保 owner guard 拿到足够的 git 历史来计算 PR diff range。

`verify` job：

1. `actions/checkout@v4` with `fetch-depth: 0`
2. `npm ci`
3. `npm run check:module-docs`
4. `npm run check:graphify`
5. `npm run check:devlog-order`
6. `npm run lint`
7. `npm run typecheck`
8. `npm run test`
9. `npm run build`
10. `git diff --exit-code -- styles.css`

由于 `npm run verify` 现已内嵌 `check:owner-guard`，`verify` job 也保留完整历史和统一的 owner-guard diff-range 环境变量，避免独立命令与聚合命令的范围判定不一致。

最后一步的意义是：确保提交中的 `src/style/**` 改动已经同步刷新到根目录 `styles.css`，避免 CI 通过但仓库产物滞后。

### 双远端插件打包 (`.github/workflows/plugin-package.yml`, `.gitea/workflows/plugin-package.yml`)

GitHub Actions 与 Gitea Actions 各自使用一份薄 `Plugin Package` workflow，在 `main` push、`v*` tag 和手动触发时执行同一组命令：

1. checkout 完整历史并安装 Node.js 20；
2. `npm ci`；
3. `npm run verify`；
4. `npm run package:plugin`；
5. 上传只含 `main.js`、`manifest.json`、`styles.css` 的 `opencodian-plugin-<commit SHA>` artifact。

GitHub 使用 `actions/upload-artifact@v4`，Gitea 使用与其 artifact service 兼容的 `actions/upload-artifact@v3`。平台差异只存在于上传 action 版本，打包内容由共享仓库脚本在上传前 fail-closed 校验。两端 workflow 都把 `OPENCODIAN_BUILD_ID` 固定为 `ci-<commit SHA>`，避免各 runner 的构建时间和时区进入 `main.js`，从而使同一 commit 的三件套可逐文件复现。

Gitea runner 使用 `ubuntu-latest:docker://node:20-bookworm` 标签，因此 workflow 不依赖 Windows host shell。macmini runner 的 job container 是原生 ARM64；Gitea workflow 安装 Debian ARM64 `chromium` 并通过 `PUPPETEER_EXECUTABLE_PATH` 供 rendered tests 使用，避免执行 Puppeteer 的 x86_64 bundled browser。runner 注册 token 只用于一次性初始化本机 runner state，不进入仓库、workflow 或长期容器环境。

### BUILD_ID 生成 (`scripts/build-utils.mjs`)

```javascript
function generateBuildId() {
  const override = process.env.OPENCODIAN_BUILD_ID;
  if (override !== undefined) {
    if (!/^[a-zA-Z0-9._-]{1,128}$/.test(override)) throw new Error('invalid BUILD_ID');
    return override; // CI: ci-<commit SHA>
  }
  const branch = sanitizeBranchName(getGitBranch());  // git branch → sanitize
  const timestamp = getLocalTimeStamp();               // YYYYMMDDHHmm
  return `${branch}.${timestamp}`;
  // 示例: "fix-revert-model-toggle.202603271430"
}
```

`getGitBranch()` 执行 `git rev-parse --abbrev-ref HEAD`，失败返回 `'unknown'`。
`sanitizeBranchName()` 将 `/` 替换为 `-`，移除非字母数字字符。
`OPENCODIAN_BUILD_ID` 仅接受 1–128 个字母、数字、点、下划线或连字符；未设置时仍使用本地 `{branch}.{timestamp}`，因此普通开发构建行为不变。

### 主构建 (`esbuild.config.mjs` / `scripts/build.mjs`)

esbuild 配置：

| 选项 | 值 |
|------|-----|
| entryPoints | `['src/main.ts']` |
| format | `cjs` |
| target | `es2018` |
| bundle | `true` |
| treeShaking | `true` |
| external | `obsidian`, `electron`, `@codemirror/*`, `lezer`, `@lezer/*`, `node:*`, 所有 Node.js builtin |
| define | `BUILD_ID: JSON.stringify(buildId)` |
| sourcemap | dev: `'inline'`, prod: `false` |
| outfile | dev: `'main.js'`, prod: `'dist/main.js'` |

生产模式额外步骤：
1. 调用 `buildCss()` 读取 `src/style/index.css` 并生成根目录 `styles.css`
2. `fs.copyFileSync('manifest.json', 'dist/manifest.json')`
3. `fs.copyFileSync('styles.css', 'dist/styles.css')`
4. `copyDirectoryIfExists('assets', 'dist/assets')`
5. `pruneClaudeAgentSdkRuntimeArtifacts()` 移除旧的 `dist/node_modules/@anthropic-ai/claude-agent-sdk*` runtime artifact，防止历史 platform binary package 被误当成必需产物
6. `copyCodexRuntime()` 复制 `@openai/codex`（package.json + bin/codex.js）和 `@openai/codex-<platform>-<arch>`（vendor/... 包含 CLI 二进制）到 `dist/node_modules/@openai/`

部署到 Test Vault 时，以下运行时产物必须和 `dist/main.js` 一起复制：
- `dist/node_modules/@openai/codex/` + `dist/node_modules/@openai/codex-<platform>-<arch>/` — Codex backend 运行时（191MB CLI 二进制）

Claude Code backend 不再要求复制 `dist/node_modules/@anthropic-ai/claude-agent-sdk-<platform>/`。生产 runtime 保留 `@anthropic-ai/claude-agent-sdk` TypeScript SDK 主包作为 API facade（随 `main.js` 打包），但 Claude Code 后端进程必须来自用户本机安装的 external `claude` CLI：优先使用 `backendSettings.claudeCode.executablePath`，其次在增强 PATH 中查找 `claude` / `claude.exe` / npm wrapper。找不到 CLI 时设置页 runtime diagnostics 会提示安装 Claude Code CLI 或配置 executable path。

### CSS 构建 (`scripts/build-css.mjs`)

读取 `src/style/index.css` 的 `@import` 顺序，将引用到的 CSS 片段合并到根目录 `styles.css`，每个片段添加注释标记。

### 插件三件套 (`scripts/package-plugin-artifact.mjs`)

`npm run package:plugin` 从生产 `dist/` 读取三份必需的 regular files，校验 `manifest.json` 的 OpenCodian id/version，清理旧输出后写入 `artifacts/opencodian/`。输出目录必须严格只包含：

- `main.js`
- `manifest.json`
- `styles.css`

脚本拒绝缺失文件、symlink/non-regular source、父目录 symlink traversal、相互重叠的 source/output，以及越出仓库根目录的输入输出路径，并在 stdout 返回版本、文件列表和逐文件 SHA-256，供本地及 Actions 留证。

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
    → 清理旧的 Claude Agent SDK runtime artifact
    → 复制 Codex SDK runtime package 到 dist/node_modules/
```

## 与其他模块的交互

- **main.ts**: 使用 `BUILD_ID` 全局常量（构建时注入）
- **package.json**: 定义 npm scripts
- **Obsidian plugin API**: 产出 `main.js` 作为插件入口
- **ClaudeCodeSdkLoader**: 运行时通过 literal dynamic import 加载已打进 `main.js` 的官方 SDK 主包；Claude Code executable 由 `ClaudeCodeProcessResolver` 解析用户配置或增强 PATH 中的外部 CLI，不再由生产构建复制 platform binary package

## 配置项

| npm script | 命令 | 说明 |
|------------|------|------|
| `dev` | `node esbuild.config.mjs` | 开发模式 |
| `build` | `node scripts/build.mjs production` | 生产构建（自动包含 CSS 合并） |
| `build:css` | `node scripts/build-css.mjs` | CSS 构建 |
| `package:plugin` | `node scripts/package-plugin-artifact.mjs` | 校验并生成可上传的 Obsidian 插件三件套 |

## 注意事项

- 开发模式输出到根目录 `main.js`（Obsidian 直接加载）
- 生产模式输出到 `dist/` 目录（需手动部署到 vault）
- `external` 列表确保不打包 Obsidian 和 CodeMirror 运行时依赖；Claude Agent SDK 主包会随 `main.js` 打包，但平台 binary package 不再通过 `dist/node_modules` 随生产产物复制
- BUILD_ID 在构建时硬编码，不会在运行时改变
- `npm run build` 已内置 CSS 合并；若只想刷新根目录样式产物，可单独运行 `npm run build:css`
- CI 会在构建后检查 `styles.css` 是否仍然干净，因此样式修改需要把生成产物一并提交

## 待补充
- [ ] Source map 上传服务集成
- [ ] 增量构建优化
- [ ] 构建缓存策略
