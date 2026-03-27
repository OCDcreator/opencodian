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

### 1. Logger 新增 info 方法

**位置**：`src/shared/logger.ts`

**原因**：
- 现有 `logger` 只有 `debug`/`warn`/`error` 方法
- ESLint 限制只能使用 `console.warn` 和 `console.error`
- 启动日志应放进统一 logger 以符合仓库现有模式

**改动**：

```typescript
// src/shared/logger.ts

export interface Logger {
  info: (...args: unknown[]) => void;  // 新增
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// 在 emit 函数中添加 'info' 类型
type LogMethod = 'log' | 'info' | 'warn' | 'error';  // 添加 'info'

// createLogger 返回的对象中添加 info 方法
export function createLogger(scope: string): Logger {
  return {
    info: (...args: unknown[]) => {
      emit('log', scope, args);  // info 使用 console.log 输出，不受 debug 开关控制
    },
    debug: (...args: unknown[]) => {
      if (!isDebugEnabled()) {
        return;
      }
      emit('log', scope, args);
    },
    // ... warn, error 保持不变
  };
}
```

### 2. 构建时 BUILD_ID 注入

**涉及文件**：`scripts/build.mjs` 和 `esbuild.config.mjs`

**重要**：BUILD_ID 必须在**生产构建**和**开发模式**中都注入，否则 `src/main.ts` 引用 `BUILD_ID` 时会在 dev 模式报错。

**方案**：抽取公共的 `scripts/build-utils.mjs`，供两个构建脚本复用。

#### 2.1 公共工具模块

**位置**：`scripts/build-utils.mjs`（新建）

```javascript
import { execSync } from 'child_process';

// 获取 git 分支名
export function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// 规范化分支名
export function sanitizeBranchName(branch) {
  return branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9\-_.]/g, '');
}

// 生成本地时间戳
export function getLocalTimeStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

// 生成 BUILD_ID
export function generateBuildId() {
  const branch = sanitizeBranchName(getGitBranch());
  const timestamp = getLocalTimeStamp();
  return `${branch}.${timestamp}`;
}
```

#### 2.2 生产构建改动

**位置**：`scripts/build.mjs`

```javascript
import { generateBuildId } from './build-utils.mjs';

const buildId = generateBuildId();
console.log(`[build] BUILD_ID: ${buildId}`);

context = await esbuild.context({
  define: {
    BUILD_ID: JSON.stringify(buildId),
  },
  // ... 其他现有配置
});
```

#### 2.3 开发模式改动

**位置**：`esbuild.config.mjs`

```javascript
import { generateBuildId } from './scripts/build-utils.mjs';

const buildId = generateBuildId();
console.log(`[dev] BUILD_ID: ${buildId}`);

const context = await esbuild.context({
  define: {
    BUILD_ID: JSON.stringify(buildId),
  },
  // ... 其他现有配置
});
```

**流程**：
1. 获取当前 git 分支名（使用 `git rev-parse --abbrev-ref HEAD`）
2. 规范化分支名（`/` → `-`）
3. 生成本地时间戳（格式：`YYYYMMDDHHmm`）
4. 组装 `BUILD_ID`：`{sanitizedBranch}.{timestamp}`
5. 使用 esbuild 的 `define` 将 `BUILD_ID` 常量注入代码
6. **不修改** `package.json` 或 `manifest.json`

### 3. 版本发布脚本

**位置**：`scripts/release.mjs`（新建）

**功能**：递增语义化版本并同步更新 `package.json`、`package-lock.json` 和 `manifest.json`

#### 与现有脚本的关系

仓库已有版本同步机制：

- **package.json** 中的 `"version"` 脚本：`node scripts/sync-version.js && git add manifest.json`
- 这是 npm 生命周期钩子，在 `npm version` 执行后自动运行
- `sync-version.js` 负责将版本号从 `package.json` 同步到 `manifest.json`

**设计决策**：复用现有机制，`release.mjs` 只需调用 `npm version`，manifest.json 同步由生命周期钩子自动处理。

#### 使用方式

```bash
npm run release:patch  # 0.1.0 → 0.1.1
npm run release:minor  # 0.1.0 → 0.2.0
npm run release:major  # 0.1.0 → 1.0.0
```

#### package.json scripts 添加

```json
{
  "scripts": {
    "release:patch": "node scripts/release.mjs patch",
    "release:minor": "node scripts/release.mjs minor",
    "release:major": "node scripts/release.mjs major"
  }
}
```

**注意**：保留现有的 `"version"` 脚本，不要删除。

#### release.mjs 实现

```javascript
import { execSync } from 'child_process';

const bumpType = process.argv[2] || 'patch';

// 使用 npm version 命令更新 package.json 和 package-lock.json
// --no-git-tag-version 表示不创建 git tag
// 现有的 "version" 生命周期钩子会自动同步 manifest.json
execSync(`npm version ${bumpType} --no-git-tag-version`, { stdio: 'inherit' });

// 版本同步由 npm 生命周期钩子自动处理，无需手动更新 manifest.json
```

### 4. 运行时版本输出

**位置**：`src/main.ts`

**实现**：

```typescript
// 文件顶部添加声明
declare const BUILD_ID: string;

// onload() 开头
async onload() {
  // 使用 logger.info 输出（始终可见，不受 debug 开关影响）
  logger.info(`OpenCodian BUILD_ID: ${BUILD_ID}`);

  // ... 其余代码
}
```

**说明**：
- 使用 `logger.info` 而非 `console.log`，符合仓库现有模式
- `logger.info` 始终输出，不受 debug 开关影响
- 同时会被记录到 recent log，方便诊断

### 5. 打包规则文档

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
| `src/shared/logger.ts` | 修改 | 新增 `info` 方法 |
| `scripts/build-utils.mjs` | 新建 | 公共构建工具（BUILD_ID 生成） |
| `scripts/build.mjs` | 修改 | 导入 build-utils，添加 BUILD_ID 注入 |
| `esbuild.config.mjs` | 修改 | 导入 build-utils，添加 BUILD_ID 注入（dev 模式） |
| `scripts/release.mjs` | 新建 | 版本发布脚本（包装 npm version） |
| `scripts/sync-version.js` | 保留 | 无需修改，继续由 npm 生命周期调用 |
| `src/main.ts` | 修改 | 添加 BUILD_ID 运行时输出 |
| `package.json` | 修改 | 添加 `release:*` 脚本（保留现有 `version` 脚本） |
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
2. 验证 `npm run dev` 正确注入 BUILD_ID（开发模式）
3. 验证 BUILD_ID 格式正确（分支名规范化、本地时间戳）
4. 验证 `npm run release:patch/minor/major` 正确递增版本号
5. 验证 `release` 命令同步更新 `package.json`、`package-lock.json` 和 `manifest.json`
6. 验证 `logger.info` 方法正常工作
7. 验证运行时 BUILD_ID 正确输出到控制台
