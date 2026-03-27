# 内置版本号功能设计

## 概述

为 OpenCodian 插件添加自动版本号管理功能，每次打包时自动生成由 git 分支名、日期时间（精确到分钟）和语义化版本号构成的完整版本号。

## 版本号格式

```
{分支名}.{YYYYMMDDHHmm}.{major}.{minor}.{patch}
```

**示例**：`fix/revert-model-toggle.202603271430.0.1.0`

| 组成部分 | 说明 | 示例 |
|---------|------|------|
| 分支名 | 当前 git 分支名 | `fix/revert-model-toggle` |
| 日期时间 | 精确到分钟 | `202603271430` |
| 语义化版本 | major.minor.patch | `0.1.0` |

## 功能需求

### 1. 构建时版本号生成

**位置**：`scripts/build.mjs`

**流程**：
1. 获取当前 git 分支名（使用 `git rev-parse --abbrev-ref HEAD`）
2. 读取当前语义化版本（从 `package.json` 的 `version` 字段）
3. 解析命令行参数：
   - `--patch`：递增 patch（0.1.0 → 0.1.1）
   - `--minor`：递增 minor（0.1.0 → 0.2.0）
   - `--major`：递增 major（0.1.0 → 1.0.0）
   - 无参数：默认 `--patch`
4. 生成日期时间戳（格式：YYYYMMDDHHmm）
5. 组装完整版本号
6. 更新 `package.json` 和 `manifest.json` 的 version 字段
7. 使用 esbuild 的 `define` 将 `VERSION` 常量注入代码

### 2. 运行时版本输出

**位置**：`src/main.ts`

**实现**：
- 在插件 `onload()` 方法最开始，使用 logger 输出版本号
- 版本号通过 esbuild `define` 在编译时内联

```typescript
// 编译时注入
declare const VERSION: string;

// onload() 开头
logger.info(`OpenCodian v${VERSION} loaded`);
```

### 3. 打包规则文档

**位置**：`CLAUDE.md`

**规则**：
- **patch（小改动）**：bugfix、文本修改、配置调整
- **minor（中等改动）**：新功能、重构、API 扩展
- **major（大幅改动）**：架构变更、breaking change、大版本发布

## 技术实现

### 构建脚本改动

```javascript
// scripts/build.mjs 新增逻辑

import { execSync } from 'child_process';

// 获取 git 分支名
function getGitBranch() {
  return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
}

// 生成日期时间戳
function getDateTimeStamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

// 解析版本参数
function parseVersionBump(args) {
  if (args.includes('--major')) return 'major';
  if (args.includes('--minor')) return 'minor';
  return 'patch'; // 默认
}

// 递增版本号
function bumpVersion(version, bumpType) {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (bumpType) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
  }
}

// 生成完整版本号
function generateFullVersion(branch, dateTime, semver) {
  return `${branch}.${dateTime}.${semver}`;
}

// 更新 package.json 和 manifest.json
function updateVersionFiles(fullVersion, semver) {
  // 更新 package.json（语义化版本）
  // 更新 manifest.json（完整版本号）
}
```

### esbuild 配置改动

```javascript
// esbuild.context() 添加 define
{
  define: {
    VERSION: JSON.stringify(fullVersion),
  },
  // ... 其他配置
}
```

### 运行时改动

```typescript
// src/main.ts 顶部添加
declare const VERSION: string;

// onload() 开头添加
async onload() {
  logger.info(`OpenCodian v${VERSION} loaded`);
  // ... 其余代码
}
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `scripts/build.mjs` | 修改 | 添加版本号生成逻辑 |
| `src/main.ts` | 修改 | 添加运行时版本输出 |
| `CLAUDE.md` | 修改 | 添加打包规则文档 |
| `package.json` | 修改 | 添加 `VERSION` 类型声明（可选） |

## 使用示例

```bash
# 小改动（默认）
npm run build

# 明确指定 patch
npm run build -- --patch

# 中等改动
npm run build -- --minor

# 大幅改动
npm run build -- --major
```

## 日志输出示例

**构建时（终端）**：
```
[build] Version: fix/revert-model-toggle.202603271430.0.1.0
[build] Production build complete!
```

**运行时（Obsidian 控制台）**：
```
[OpenCodian] OpenCodian vfix/revert-model-toggle.202603271430.0.1.0 loaded
```

## 边界情况处理

1. **非 git 仓库**：分支名使用 `unknown`
2. **脏工作区**：日期时间戳确保唯一性，不影响版本号
3. **CI/CD 环境**：支持通过参数直接指定，无需交互

## 测试计划

1. 验证 `--patch` / `--minor` / `--major` 参数正确递增版本号
2. 验证无参数时默认 patch 递增
3. 验证 package.json 和 manifest.json 同步更新
4. 验证运行时版本号正确输出到控制台
