# 内置版本号功能设计

## 概述

为 OpenCodian 插件添加构建标识功能，将"发布版本"与"构建标识"分离：

- **发布版本**：`package.json` 和 `manifest.json` 的 `version` 字段，保持纯语义化版本（semver）
- **构建标识**：编译时注入的 `BUILD_ID`，包含分支名和时间戳，仅用于日志/诊断

## 核心设计原则

### 职责分离

| 职责 | 触发方式 | 影响文件 |
|------|---------|---------|
| **版本发布 (release)** | `npm run release:patch/minor/major` | 修改 `package.json`、`manifest.json` |
| **构建打包 (build)** | `npm run build` | 不修改版本号，仅注入 `BUILD_ID` |

**重要**：`npm run build` **不会**自动递增版本号或修改仓库文件，避免日常本地构建制造无意义版本号和脏工作区。

### 版本字段分离

| 字段 | 存储位置 | 格式 | 示例 |
|------|---------|------|------|
| **version** | `package.json`, `manifest.json` | 纯 semver | `0.1.0` |
| **BUILD_ID** | 编译时常量（内存） | 分支名.时间戳 | `fix-revert-model-toggle.202603271430` |

## BUILD_ID 格式

```
{sanitizedBranchName}.{YYYYMMDDHHmm}
```

**示例**：`fix-revert-model-toggle.202603271430`

| 组成部分 | 说明 | 规范化规则 |
|---------|------|----------|
| 分支名 | 当前 git 分支名 | `/` 替换为 `-`，移除非法字符 |
| 时间戳 | 本地时间，精确到分钟 | `YYYYMMDDHHmm` 格式 |

### 分支名规范化

分支名中的 `/` 会导致版本字符串解析问题，需要规范化：

| 原始分支名 | 规范化后 |
|-----------|---------|
| `fix/revert-model-toggle` | `fix-revert-model-toggle` |
| `feature/new-thing` | `feature-new-thing` |
| `main` | `main` |

**实现**：`branchName.replace(/\//g, '-')`

### 时间戳时区

使用**本地时间**（非 UTC），方便人工排查：

```javascript
const now = new Date();
const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
// 结果示例：202603271430（本地时间）
```

## 功能需求

### 1. 构建时 BUILD_ID 注入

**位置**：`scripts/build.mjs`

**流程**：
1. 获取当前 git 分支名（使用 `git rev-parse --abbrev-ref HEAD`）
2. 规范化分支名（`/` → `-`）
3. 生成本地时间戳（格式：`YYYYMMDDHHmm`）
4. 组装 `BUILD_ID`：`{sanitizedBranch}.{timestamp}`
5. 使用 esbuild 的 `define` 将 `BUILD_ID` 常量注入代码
6. **不修改** `package.json` 或 `manifest.json`

**构建脚本改动**：

```javascript
// scripts/build.mjs 新增逻辑

import { execSync } from 'child_process';

// 获取 git 分支名
function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// 规范化分支名
function sanitizeBranchName(branch) {
  return branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9\-_.]/g, '');
}

// 生成本地时间戳
function getLocalTimeStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

// 生成 BUILD_ID
function generateBuildId() {
  const branch = sanitizeBranchName(getGitBranch());
  const timestamp = getLocalTimeStamp();
  return `${branch}.${timestamp}`;
}

// 在 esbuild.context() 中添加 define
const buildId = generateBuildId();
console.log(`[build] BUILD_ID: ${buildId}`);

context = await esbuild.context({
  define: {
    BUILD_ID: JSON.stringify(buildId),
  },
  // ... 其他现有配置
});
```

### 2. 版本发布脚本

**位置**：`scripts/release.mjs`（新建）

**功能**：递增语义化版本并同步更新 `package.json` 和 `manifest.json`

**使用方式**：
```bash
npm run release:patch  # 0.1.0 → 0.1.1
npm run release:minor  # 0.1.0 → 0.2.0
npm run release:major  # 0.1.0 → 1.0.0
```

**package.json scripts 添加**：
```json
{
  "scripts": {
    "release:patch": "node scripts/release.mjs patch",
    "release:minor": "node scripts/release.mjs minor",
    "release:major": "node scripts/release.mjs major"
  }
}
```

**release.mjs 实现**：

```javascript
import fs from 'fs';
import path from 'path';

const bumpType = process.argv[2] || 'patch';

// 读取当前版本
const pkgPath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

// 计算新版本
let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// 更新 package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 更新 manifest.json
const manifestPath = path.join(process.cwd(), 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
manifest.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Version bumped: ${pkg.version} → ${newVersion}`);
```

### 3. 运行时版本输出

**位置**：`src/main.ts`

**实现**：

```typescript
// 文件顶部添加声明
declare const BUILD_ID: string;

// onload() 开头
async onload() {
  // 使用现有 logger 的 debug 方法（debug 模式下可见）
  logger.debug(`OpenCodian BUILD_ID: ${BUILD_ID}`);

  // 强制输出到控制台（不受 debug 开关影响）
  console.log(`[OpenCodian] BUILD_ID: ${BUILD_ID}`);

  // ... 其余代码
}
```

**说明**：
- 现有 `logger` 只有 `debug`/`warn`/`error` 方法，没有 `info`
- 使用 `console.log` 确保版本号始终输出到控制台最上方
- 同时保留 `logger.debug` 用于调试日志记录

### 4. 打包规则文档

**位置**：`AGENTS.md`（在 "Build and Development Commands" 章节后新增）

**内容**：

```markdown
## Release and Build ID

### 版本发布规则

发布新版本时使用以下命令递增语义化版本：

| 命令 | 版本变化 | 适用场景 |
|------|---------|---------|
| `npm run release:patch` | 0.1.0 → 0.1.1 | bugfix、文本修改、配置调整 |
| `npm run release:minor` | 0.1.0 → 0.2.0 | 新功能、重构、API 扩展 |
| `npm run release:major` | 0.1.0 → 1.0.0 | 架构变更、breaking change |

### BUILD_ID 说明

每次 `npm run build` 会自动生成 `BUILD_ID`，格式为 `{分支名}.{时间戳}`。

- **分支名**：当前 git 分支，`/` 替换为 `-`
- **时间戳**：本地时间，格式 `YYYYMMDDHHmm`
- **示例**：`fix-revert-model-toggle.202603271430`

BUILD_ID 在插件加载时输出到 Obsidian 开发者控制台，用于问题排查。
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `scripts/build.mjs` | 修改 | 添加 BUILD_ID 生成和注入逻辑 |
| `scripts/release.mjs` | 新建 | 版本发布脚本 |
| `src/main.ts` | 修改 | 添加 BUILD_ID 运行时输出 |
| `package.json` | 修改 | 添加 `release:*` 脚本 |
| `AGENTS.md` | 修改 | 添加版本发布规则文档 |

## 使用示例

### 日常开发构建

```bash
# 构建不改变版本号
npm run build
# 输出：[build] BUILD_ID: fix-revert-model-toggle.202603271430
```

### 发布新版本

```bash
# 递增版本号
npm run release:patch

# 然后构建
npm run build
```

## 日志输出示例

**构建时（终端）**：
```
[build] BUILD_ID: fix-revert-model-toggle.202603271430
[build] Production build complete!
```

**运行时（Obsidian 控制台）**：
```
[OpenCodian] BUILD_ID: fix-revert-model-toggle.202603271430
```

## 边界情况处理

1. **非 git 仓库**：分支名使用 `unknown`
2. **git 命令失败**：分支名使用 `unknown`
3. **脏工作区**：时间戳确保唯一性，不影响 BUILD_ID 生成
4. **CI/CD 环境**：BUILD_ID 自动生成，无需额外配置

## 测试计划

1. 验证 `npm run build` 不修改 `package.json` 和 `manifest.json`
2. 验证 BUILD_ID 格式正确（分支名规范化、本地时间戳）
3. 验证 `npm run release:patch/minor/major` 正确递增版本号
4. 验证 `release` 命令同步更新 `package.json` 和 `manifest.json`
5. 验证运行时 BUILD_ID 正确输出到控制台
