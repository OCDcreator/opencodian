# OpenCode 完整文档

> **文档来源**: https://opencode.ai/docs/zh-cn/  
> **整理日期**: 2026-03-25

---

## 目录

1. [配置 (Config)](#1-配置-config)
2. [工具 (Tools)](#2-工具-tools)
3. [规则 (Rules)](#3-规则-rules)
4. [代理 (Agents)](#4-代理-agents)
5. [模型 (Models)](#5-模型-models)
6. [命令 (Commands)](#6-命令-commands)
7. [格式化程序 (Formatters)](#7-格式化程序-formatters)
8. [权限 (Permissions)](#8-权限-permissions)
9. [LSP 支持](#9-lsp-支持)
10. [MCP 服务器](#10-mcp-服务器)
11. [技能 (Skills)](#11-技能-skills)
12. [自定义工具](#12-自定义工具)
13. [SDK](#13-sdk)
14. [服务器](#14-服务器)
15. [插件 (Plugins)](#15-插件-plugins)
- [附录：自定义提供商配置](#附录自定义提供商配置)

---

## 1. 配置 (Config)

**来源**: https://opencode.ai/docs/zh-cn/config/

您可以使用 JSON 配置文件来配置 OpenCode。

### 1.1 格式

OpenCode 支持 **JSON** 和 **JSONC**（带注释的 JSON）格式。

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "autoupdate": true,
  "server": {
    "port": 4096
  }
}
```

### 1.2 配置位置与优先级

配置文件是合并在一起的，而不是被替换。后面的配置仅在键冲突时覆盖前面的配置。

**优先级顺序**（后面的源覆盖前面的源）：

1. **远程配置**（来自 `.well-known/opencode`）- 组织默认值
2. **全局配置**（`~/.config/opencode/opencode.json`）- 用户偏好
3. **自定义配置**（`OPENCODE_CONFIG` 环境变量）- 自定义覆盖
4. **项目配置**（项目中的 `opencode.json`）- 项目特定设置
5. **`.opencode` 目录** - 代理、命令、插件
6. **内联配置**（`OPENCODE_CONFIG_CONTENT` 环境变量）- 运行时覆盖

### 1.3 配置选项详解

#### TUI 配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "tui": {
    "scroll_speed": 3,
    "scroll_acceleration": {
      "enabled": true
    },
    "diff_style": "auto"
  }
}
```

- `scroll_acceleration.enabled` - 启用 macOS 风格的滚动加速（优先于 `scroll_speed`）
- `scroll_speed` - 自定义滚动速度倍率（默认：3，最小值：1）
- `diff_style` - 控制差异渲染方式：`"auto"` 或 `"stacked"`

#### 服务器配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "server": {
    "port": 4096,
    "hostname": "0.0.0.0",
    "mdns": true,
    "mdnsDomain": "myproject.local",
    "cors": ["http://localhost:5173"]
  }
}
```

- `port` - 监听端口
- `hostname` - 监听主机名
- `mdns` - 启用 mDNS 服务发现
- `mdnsDomain` - mDNS 服务的自定义域名（默认：`opencode.local`）
- `cors` - 允许 CORS 的额外来源

#### 工具配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "tools": {
    "write": false,
    "bash": false
  }
}
```

#### 模型配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {},
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5"
}
```

提供商特定选项：

- `timeout` - 请求超时时间（毫秒，默认：300000）
- `setCacheKey` - 确保始终为指定提供商设置缓存键

**Amazon Bedrock 特殊配置**：

```json
{
  "provider": {
    "amazon-bedrock": {
      "options": {
        "region": "us-east-1",
        "profile": "my-aws-profile",
        "endpoint": "https://bedrock-runtime.us-east-1.vpce-xxxxx.amazonaws.com"
      }
    }
  }
}
```

#### 代理配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "code-reviewer": {
      "description": "Reviews code for best practices",
      "model": "anthropic/claude-sonnet-4-5",
      "prompt": "You are a code reviewer...",
      "tools": {
        "write": false,
        "edit": false
      }
    }
  }
}
```

#### 默认代理

```json
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "plan"
}
```

#### 分享配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "share": "manual"
}
```

选项：`"manual"`（默认）、`"auto"`、`"disabled"`

#### 自定义命令

```json
{
  "$schema": "https://opencode.ai/config.json",
  "command": {
    "test": {
      "template": "Run the full test suite...",
      "description": "Run tests with coverage",
      "agent": "build",
      "model": "anthropic/claude-haiku-4-5"
    }
  }
}
```

#### 自动更新

```json
{
  "$schema": "https://opencode.ai/config.json",
  "autoupdate": false
}
```

选项：`true`、`false`、`"notify"`

#### 格式化程序

```json
{
  "$schema": "https://opencode.ai/config.json",
  "formatter": {
    "prettier": {
      "disabled": true
    },
    "custom-prettier": {
      "command": ["npx", "prettier", "--write", "$FILE"],
      "environment": {
        "NODE_ENV": "development"
      },
      "extensions": [".js", ".ts", ".jsx", ".tsx"]
    }
  }
}
```

#### 权限配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "ask",
    "bash": "ask"
  }
}
```

#### 压缩配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  }
}
```

#### 文件监视器

```json
{
  "$schema": "https://opencode.ai/config.json",
  "watcher": {
    "ignore": ["node_modules/**", "dist/**", ".git/**"]
  }
}
```

#### MCP 服务器

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {}
}
```

#### 插件

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-helicone-session", "@my-org/custom-plugin"]
}
```

#### 指令

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "CONTRIBUTING.md",
    "docs/guidelines.md",
    ".cursor/rules/*.md"
  ]
}
```

#### 提供商白名单/黑名单

```json
{
  "$schema": "https://opencode.ai/config.json",
  "disabled_providers": ["openai", "gemini"],
  "enabled_providers": ["anthropic", "openai"]
}
```

### 1.4 变量替换

#### 环境变量

使用 `{env:VARIABLE_NAME}` 来引用环境变量：

```json
{
  "model": "{env:OPENCODE_MODEL}",
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

#### 文件内容

使用 `{file:path/to/file}` 来替换文件内容：

```json
{
  "instructions": ["./custom-instructions.md"],
  "provider": {
    "openai": {
      "options": {
        "apiKey": "{file:~/.secrets/openai-key}"
      }
    }
  }
}
```

---

## 2. 工具 (Tools)

**来源**: https://opencode.ai/docs/zh-cn/tools/

工具允许 LLM 在您的代码库中执行操作。OpenCode 自带一组内置工具，您也可以通过自定义工具或 MCP 服务器来扩展它。

### 2.1 权限控制

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "deny",
    "bash": "ask",
    "webfetch": "allow"
  }
}
```

支持通配符：

```json
{
  "permission": {
    "mymcp_*": "ask"
  }
}
```

### 2.2 内置工具列表

| 工具        | 描述                                |
| ----------- | ----------------------------------- |
| `bash`      | 在项目环境中执行 shell 命令         |
| `edit`      | 通过精确的字符串替换来修改现有文件  |
| `write`     | 创建新文件或覆盖现有文件            |
| `read`      | 读取代码库中的文件内容              |
| `grep`      | 使用正则表达式搜索文件内容          |
| `glob`      | 通过模式匹配查找文件                |
| `list`      | 列出指定路径下的文件和目录          |
| `lsp`       | 与已配置的 LSP 服务器交互（实验性） |
| `patch`     | 对文件应用补丁                      |
| `skill`     | 加载技能（即 `SKILL.md` 文件）      |
| `todowrite` | 在编码会话中管理待办事项列表        |
| `todoread`  | 读取现有的待办事项列表              |
| `webfetch`  | 获取网页内容                        |
| `websearch` | 在网络上搜索信息                    |
| `question`  | 在执行过程中向用户提问              |

### 2.3 内部机制

`grep`、`glob` 和 `list` 等工具底层使用 ripgrep。默认情况下，ripgrep 遵循 `.gitignore` 中的模式。

要包含通常会被忽略的文件，在项目根目录下创建一个 `.ignore` 文件：

```
!node_modules/
!dist/
!build/
```

---

## 3. 规则 (Rules)

**来源**: https://opencode.ai/docs/zh-cn/rules/

您可以通过创建 `AGENTS.md` 文件来为 OpenCode 提供自定义指令。

### 3.1 初始化

运行 `/init` 命令扫描项目并生成 `AGENTS.md` 文件。

### 3.2 示例

```markdown
# SST v3 Monorepo Project

This is an SST v3 monorepo with TypeScript. The project uses bun workspaces.

## Project Structure

- `packages/` - Contains all workspace packages
- `infra/` - Infrastructure definitions split by service
- `sst.config.ts` - Main SST configuration

## Code Standards

- Use TypeScript with strict mode enabled
- Shared code goes in `packages/core/`
- Functions go in `packages/functions/`

## Monorepo Conventions

- Import shared modules using workspace names: `@my-app/core/example`
```

### 3.3 规则文件类型

| 类型   | 位置                           | 用途         |
| ------ | ------------------------------ | ------------ |
| 项目级 | 项目根目录 `AGENTS.md`         | 项目特定规则 |
| 全局级 | `~/.config/opencode/AGENTS.md` | 个人规则     |

### 3.4 Claude Code 兼容性

OpenCode 支持 Claude Code 的文件约定作为回退：

- **项目规则**：项目目录中的 `CLAUDE.md`（在没有 `AGENTS.md` 时使用）
- **全局规则**：`~/.claude/CLAUDE.md`（在没有 `~/.config/opencode/AGENTS.md` 时使用）
- **技能**：`~/.claude/skills/`

禁用兼容性：

```bash
export OPENCODE_DISABLE_CLAUDE_CODE=1        # 禁用所有 .claude 支持
export OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1 # 仅禁用 ~/.claude/CLAUDE.md
export OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1 # 仅禁用 .claude/skills
```

### 3.5 优先级

1. 本地文件，从当前目录向上遍历（`AGENTS.md`、`CLAUDE.md`）
2. 全局文件，位于 `~/.config/opencode/AGENTS.md`
3. Claude Code 文件，位于 `~/.claude/CLAUDE.md`

### 3.6 自定义指令

在 `opencode.json` 中指定：

```json
{
  "instructions": [
    "CONTRIBUTING.md",
    "docs/guidelines.md",
    ".cursor/rules/*.md"
  ]
}
```

支持远程 URL：

```json
{
  "instructions": [
    "https://raw.githubusercontent.com/my-org/shared-rules/main/style.md"
  ]
}
```

---

## 4. 代理 (Agents)

**来源**: https://opencode.ai/docs/zh-cn/agents/

代理是专门的 AI 助手，可以针对特定任务和工作流程进行配置。

### 4.1 代理类型

| 类型       | 描述                   | 切换方式                       |
| ---------- | ---------------------- | ------------------------------ |
| **主代理** | 主要助手，处理主要对话 | Tab 键或 `switch_agent` 快捷键 |
| **子代理** | 专业助手，执行特定任务 | @ 提及或由主代理自动调用       |

### 4.2 内置代理

| 代理           | 模式     | 描述                               |
| -------------- | -------- | ---------------------------------- |
| **Build**      | primary  | 默认主代理，启用所有工具           |
| **Plan**       | primary  | 受限代理，规划和分析，默认需要审批 |
| **General**    | subagent | 通用代理，完整工具访问权限         |
| **Explore**    | subagent | 只读代理，快速探索代码库           |
| **Compaction** | primary  | 系统代理，压缩长上下文             |
| **Title**      | primary  | 系统代理，生成会话标题             |
| **Summary**    | primary  | 系统代理，创建会话摘要             |

### 4.3 配置方式

#### JSON 配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "build": {
      "mode": "primary",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./prompts/build.txt}",
      "tools": {
        "write": true,
        "edit": true,
        "bash": true
      }
    },
    "code-reviewer": {
      "description": "Reviews code for best practices",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "You are a code reviewer...",
      "tools": {
        "write": false,
        "edit": false
      }
    }
  }
}
```

#### Markdown 配置

放在 `~/.config/opencode/agents/` 或 `.opencode/agents/`：

```markdown
---
description: Reviews code for quality and best practices
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
tools:
  write: false
  edit: false
  bash: false
---

You are in code review mode. Focus on:

- Code quality and best practices
- Potential bugs and edge cases
- Security considerations
```

文件名即为代理名称（如 `review.md` 创建 `review` 代理）。

### 4.4 配置选项

| 选项          | 类型    | 描述                              |
| ------------- | ------- | --------------------------------- |
| `description` | string  | **必需**，代理功能描述            |
| `mode`        | string  | `primary`、`subagent` 或 `all`    |
| `model`       | string  | 代理使用的模型                    |
| `prompt`      | string  | 自定义系统提示词文件路径          |
| `temperature` | number  | 0.0-1.0，控制响应随机性           |
| `steps`       | number  | 最大迭代次数                      |
| `tools`       | object  | 工具启用/禁用配置                 |
| `permission`  | object  | 权限覆盖                          |
| `color`       | string  | UI 显示颜色（十六进制或主题颜色） |
| `top_p`       | number  | 响应多样性控制                    |
| `hidden`      | boolean | 是否在 @ 自动补全中隐藏           |
| `disable`     | boolean | 是否禁用代理                      |

### 4.5 会话导航

- **<Leader>+Right** 或 `session_child_cycle`：父会话 → 子会话1 → 子会话2 → ...
- **<Leader>+Left** 或 `session_child_cycle_reverse`：反向导航

### 4.6 示例代理

**文档代理**：

```markdown
---
description: Writes and maintains project documentation
mode: subagent
tools:
  bash: false
---

You are a technical writer. Create clear, comprehensive documentation.
```

**安全审计代理**：

```markdown
---
description: Performs security audits
mode: subagent
tools:
  write: false
  edit: false
---

You are a security expert. Focus on identifying security issues.
```

---

## 5. 模型 (Models)

**来源**: https://opencode.ai/docs/zh-cn/models/

OpenCode 使用 AI SDK 和 Models.dev 支持 **75+ LLM 提供商**，并支持运行本地模型。

### 5.1 推荐模型

- GPT 5.2
- GPT 5.1 Codex
- Claude Opus 4.5
- Claude Sonnet 4.5
- Minimax M2.1
- Gemini 3 Pro

### 5.2 设置默认模型

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "lmstudio/google/gemma-3n-e4b"
}
```

完整 ID 格式为 `provider_id/model_id`。

### 5.3 配置模型选项

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openai": {
      "models": {
        "gpt-5": {
          "options": {
            "reasoningEffort": "high",
            "textVerbosity": "low",
            "reasoningSummary": "auto"
          }
        }
      }
    },
    "anthropic": {
      "models": {
        "claude-sonnet-4-5-20250929": {
          "options": {
            "thinking": {
              "type": "enabled",
              "budgetTokens": 16000
            }
          }
        }
      }
    }
  }
}
```

### 5.4 变体

#### 内置变体

**Anthropic**：

- `high` - 高思考预算（默认）
- `max` - 最大思考预算

**OpenAI**：

- `none`、`minimal`、`low`、`medium`、`high`、`xhigh`

**Google**：

- `low`、`high`

#### 自定义变体

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "opencode": {
      "models": {
        "gpt-5": {
          "variants": {
            "high": {
              "reasoningEffort": "high",
              "textVerbosity": "low"
            },
            "low": {
              "reasoningEffort": "low"
            }
          }
        }
      }
    }
  }
}
```

使用 `variant_cycle` 快捷键在变体之间切换。

### 5.5 加载模型优先级

1. `--model` 或 `-m` 命令行标志
2. OpenCode 配置中的 `model` 字段
3. 上次使用的模型
4. 按内部优先级排列的第一个可用模型

---

## 6. 命令 (Commands)

**来源**: https://opencode.ai/docs/zh-cn/commands/

自定义命令允许你指定一个提示词，当在 TUI 中执行该命令时会运行这个提示词。

### 6.1 创建命令文件

在 `commands/` 目录中创建 markdown 文件：

```markdown
---
description: Run tests with coverage
agent: build
model: anthropic/claude-3-5-sonnet-20241022
---

Run the full test suite with coverage report and show any failures.
Focus on the failing tests and suggest fixes.
```

通过输入 `/` 后跟命令名称来使用该命令。

### 6.2 配置方式

#### JSON 配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "command": {
    "test": {
      "template": "Run the full test suite...",
      "description": "Run tests with coverage",
      "agent": "build",
      "model": "anthropic/claude-3-5-sonnet-20241022"
    }
  }
}
```

#### Markdown 配置

放在 `~/.config/opencode/commands/` 或 `.opencode/commands/`。

### 6.3 提示词占位符

#### 参数

使用 `$ARGUMENTS` 占位符：

```markdown
---
description: Create a new component
---

Create a new React component named $ARGUMENTS with TypeScript support.
```

位置参数：

- `$1` - 第一个参数
- `$2` - 第二个参数
- 以此类推...

#### Shell 输出

使用 `!`command`` 注入 bash 命令输出：

```markdown
---
description: Analyze test coverage
---

Here are the current test results:
!`npm test`
Based on these results, suggest improvements.
```

#### 文件引用

使用 `@` 后跟文件名：

```markdown
---
description: Review component
---

Review the component in @src/components/Button.tsx.
```

### 6.4 配置选项

| 选项          | 描述                          |
| ------------- | ----------------------------- |
| `template`    | **必需**，发送给 LLM 的提示词 |
| `description` | 命令功能描述                  |
| `agent`       | 执行命令的代理                |
| `subtask`     | 强制作为子代理运行            |
| `model`       | 覆盖默认模型                  |

### 6.5 内置命令

内置命令：`/init`、`/undo`、`/redo`、`/share`、`/help` 等。自定义命令可以覆盖内置命令。

---

## 7. 格式化程序 (Formatters)

**来源**: https://opencode.ai/docs/zh-cn/formatters/

OpenCode 会在文件写入或编辑后，自动使用特定语言的格式化工具对其进行格式化。

### 7.1 内置格式化工具

| 格式化工具     | 扩展名                                               | 要求                                |
| -------------- | ---------------------------------------------------- | ----------------------------------- |
| air            | .R                                                   | `air` 命令可用                      |
| biome          | .js, .jsx, .ts, .tsx, .html, .css, .md, .json, .yaml | `biome.json(c)` 配置文件            |
| cargofmt       | .rs                                                  | `cargo fmt` 命令可用                |
| clang-format   | .c, .cpp, .h, .hpp                                   | `.clang-format` 配置文件            |
| cljfmt         | .clj, .cljs, .cljc, .edn                             | `cljfmt` 命令可用                   |
| dart           | .dart                                                | `dart` 命令可用                     |
| dfmt           | .d                                                   | `dfmt` 命令可用                     |
| gleam          | .gleam                                               | `gleam` 命令可用                    |
| gofmt          | .go                                                  | `gofmt` 命令可用                    |
| htmlbeautifier | .erb, .html.erb                                      | `htmlbeautifier` 命令可用           |
| ktlint         | .kt, .kts                                            | `ktlint` 命令可用                   |
| mix            | .ex, .exs, .eex, .heex                               | `mix` 命令可用                      |
| nixfmt         | .nix                                                 | `nixfmt` 命令可用                   |
| ocamlformat    | .ml, .mli                                            | `.ocamlformat` 配置文件             |
| ormolu         | .hs                                                  | `ormolu` 命令可用                   |
| oxfmt          | .js, .jsx, .ts, .tsx                                 | `package.json` 中有 `oxfmt` 依赖    |
| pint           | .php                                                 | `composer.json` 中有 `laravel/pint` |
| prettier       | .js, .jsx, .ts, .tsx, .html, .css, .md, .json, .yaml | `package.json` 中有 `prettier`      |
| rubocop        | .rb, .rake, .gemspec                                 | `rubocop` 命令可用                  |
| ruff           | .py, .pyi                                            | `ruff` 命令可用                     |
| rustfmt        | .rs                                                  | `rustfmt` 命令可用                  |
| shfmt          | .sh, .bash                                           | `shfmt` 命令可用                    |
| standardrb     | .rb, .rake                                           | `standardrb` 命令可用               |
| terraform      | .tf, .tfvars                                         | `terraform` 命令可用                |
| uv             | .py, .pyi                                            | `uv` 命令可用                       |
| zig            | .zig, .zon                                           | `zig` 命令可用                      |

### 7.2 配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "formatter": {}
}
```

每个格式化工具支持：

- `disabled` - 禁用该格式化工具
- `command` - 执行格式化的命令（使用 `$FILE` 占位符）
- `environment` - 环境变量
- `extensions` - 处理的文件扩展名

### 7.3 示例

禁用所有格式化工具：

```json
{
  "formatter": false
}
```

禁用特定格式化工具：

```json
{
  "formatter": {
    "prettier": {
      "disabled": true
    }
  }
}
```

自定义格式化工具：

```json
{
  "formatter": {
    "prettier": {
      "command": ["npx", "prettier", "--write", "$FILE"],
      "environment": {
        "NODE_ENV": "development"
      },
      "extensions": [".js", ".ts", ".jsx", ".tsx"]
    },
    "custom-markdown-formatter": {
      "command": ["deno", "fmt", "$FILE"],
      "extensions": [".md"]
    }
  }
}
```

---

## 8. 权限 (Permissions)

**来源**: https://opencode.ai/docs/zh-cn/permissions/

OpenCode 使用 `permission` 配置来决定某个操作是否应自动运行、提示你审批，还是被阻止。

### 8.1 操作类型

- `"allow"` — 无需审批直接运行
- `"ask"` — 提示审批
- `"deny"` — 阻止该操作

### 8.2 基本配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "*": "ask",
    "bash": "allow",
    "edit": "deny"
  }
}
```

一次性设置所有权限：

```json
{
  "permission": "allow"
}
```

### 8.3 细粒度规则

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "*": "ask",
      "git *": "allow",
      "npm *": "allow",
      "rm *": "deny",
      "grep *": "allow"
    },
    "edit": {
      "*": "deny",
      "packages/web/src/content/docs/*.mdx": "allow"
    }
  }
}
```

### 8.4 通配符规则

- `*` 匹配零个或多个任意字符
- `?` 精确匹配一个字符

### 8.5 外部目录

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "external_directory": {
      "~/projects/personal/**": "allow"
    },
    "edit": {
      "~/projects/personal/**": "deny"
    }
  }
}
```

### 8.6 可用权限

| 权限                      | 描述                                          |
| ------------------------- | --------------------------------------------- |
| `read`                    | 读取文件（匹配文件路径）                      |
| `edit`                    | 所有文件修改（edit、write、patch、multiedit） |
| `glob`                    | 文件通配（匹配通配模式）                      |
| `grep`                    | 内容搜索（匹配正则表达式）                    |
| `list`                    | 列出目录中的文件                              |
| `bash`                    | 运行 shell 命令                               |
| `task`                    | 启动子代理                                    |
| `skill`                   | 加载技能                                      |
| `lsp`                     | 运行 LSP 查询                                 |
| `todoread`、`todowrite`   | 读取/更新待办事项列表                         |
| `webfetch`                | 获取 URL                                      |
| `websearch`、`codesearch` | 网页/代码搜索                                 |
| `external_directory`      | 访问工作目录之外的路径                        |
| `doom_loop`               | 同一工具调用重复 3 次时触发                   |

### 8.7 默认值

```json
{
  "permission": {
    "read": {
      "*": "allow",
      "*.env": "deny",
      "*.env.*": "deny",
      "*.env.example": "allow"
    }
  }
}
```

### 8.8 代理权限覆盖

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "*": "ask"
    }
  },
  "agent": {
    "build": {
      "permission": {
        "bash": {
          "*": "allow"
        }
      }
    }
  }
}
```

Markdown 代理配置：

```yaml
---
permission:
  edit: deny
  bash: ask
  webfetch: deny
---
```

---

## 9. LSP 支持

**来源**: https://opencode.ai/docs/zh-cn/lsp/

OpenCode 与语言服务器协议（LSP）集成，帮助 LLM 与代码库进行交互。

### 9.1 内置 LSP 服务器

| LSP 服务器       | 扩展名               | 要求                          |
| ---------------- | -------------------- | ----------------------------- |
| astro            | .astro               | 自动安装                      |
| bash             | .sh, .bash, .zsh     | 自动安装 bash-language-server |
| clangd           | .c, .cpp, .h, .hpp   | 自动安装                      |
| csharp           | .cs                  | 需要 .NET SDK                 |
| clojure-lsp      | .clj, .cljs          | 需要 clojure-lsp              |
| dart             | .dart                | 需要 dart                     |
| deno             | .ts, .tsx, .js, .jsx | 需要 deno（自动检测）         |
| elixir-ls        | .ex, .exs            | 需要 elixir                   |
| eslint           | .ts, .tsx, .js, .jsx | 需要 eslint 依赖              |
| fsharp           | .fs, .fsi            | 需要 .NET SDK                 |
| gleam            | .gleam               | 需要 gleam                    |
| gopls            | .go                  | 需要 go                       |
| hls              | .hs, .lhs            | 需要 haskell-language-server  |
| jdtls            | .java                | 需要 Java SDK 21+             |
| julials          | .jl                  | 需要 julia                    |
| kotlin-ls        | .kt, .kts            | 自动安装                      |
| lua-ls           | .lua                 | 自动安装                      |
| nixd             | .nix                 | 需要 nixd                     |
| ocaml-lsp        | .ml, .mli            | 需要 ocamllsp                 |
| oxlint           | .ts, .tsx, .js       | 需要 oxlint 依赖              |
| php intelephense | .php                 | 自动安装                      |
| prisma           | .prisma              | 需要 prisma                   |
| pyright          | .py, .pyi            | 需要 pyright                  |
| ruby-lsp         | .rb, .rake           | 需要 ruby                     |
| rust             | .rs                  | 需要 rust-analyzer            |
| sourcekit-lsp    | .swift               | 需要 swift/xcode              |
| svelte           | .svelte              | 自动安装                      |
| terraform        | .tf, .tfvars         | 自动安装                      |
| tinymist         | .typ, .typc          | 自动安装                      |
| typescript       | .ts, .tsx            | 需要 typescript               |
| vue              | .vue                 | 自动安装                      |
| yaml-ls          | .yaml, .yml          | 自动安装                      |
| zls              | .zig, .zon           | 需要 zig                      |

### 9.2 配置

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {}
}
```

每个 LSP 服务器支持：

- `disabled` - 禁用该服务器
- `command` - 启动命令
- `extensions` - 处理的文件扩展名
- `env` - 环境变量
- `initialization` - 初始化选项

### 9.3 示例

环境变量：

```json
{
  "lsp": {
    "rust": {
      "env": {
        "RUST_LOG": "debug"
      }
    }
  }
}
```

初始化选项：

```json
{
  "lsp": {
    "typescript": {
      "initialization": {
        "preferences": {
          "importModuleSpecifierPreference": "relative"
        }
      }
    }
  }
}
```

禁用所有 LSP：

```json
{
  "lsp": false
}
```

禁用特定 LSP：

```json
{
  "lsp": {
    "typescript": {
      "disabled": true
    }
  }
}
```

自定义 LSP：

```json
{
  "lsp": {
    "custom-lsp": {
      "command": ["custom-lsp-server", "--stdio"],
      "extensions": [".custom"]
    }
  }
}
```

### 9.4 PHP Intelephense 许可证

将许可证密钥放在：

- macOS/Linux：`$HOME/intelephense/license.txt`
- Windows：`%USERPROFILE%/intelephense/license.txt`

---

## 10. MCP 服务器

**来源**: https://opencode.ai/docs/zh-cn/mcp-servers/

通过 Model Context Protocol (MCP) 为 OpenCode 添加外部工具。支持本地和远程服务器。

### 10.1 启用 MCP

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "name-of-mcp-server": {
      "enabled": true
    }
  }
}
```

### 10.2 本地 MCP 服务器

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-local-mcp-server": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"],
      "enabled": true,
      "environment": {
        "MY_ENV_VAR": "my_env_var_value"
      }
    }
  }
}
```

示例（测试服务器）：

```json
{
  "mcp": {
    "mcp_everything": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

**本地 MCP 选项**：
| 选项 | 类型 | 必填 | 描述 |
| ------------- | ------- | ---- | ------------------------------- |
| `type` | string | 是 | 必须为 `"local"` |
| `command` | array | 是 | 运行命令及参数 |
| `environment` | object | 否 | 环境变量 |
| `enabled` | boolean | 否 | 启动时启用 |
| `timeout` | number | 否 | 获取工具超时（毫秒，默认 5000） |

### 10.3 远程 MCP 服务器

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-remote-mcp": {
      "type": "remote",
      "url": "https://my-mcp-server.com",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer MY_API_KEY"
      }
    }
  }
}
```

**远程 MCP 选项**：
| 选项 | 类型 | 必填 | 描述 |
| --------- | ------- | ---- | ------------------------------- |
| `type` | string | 是 | 必须为 `"remote"` |
| `url` | string | 是 | 服务器 URL |
| `enabled` | boolean | 否 | 启动时启用 |
| `headers` | object | 否 | 请求头 |
| `oauth` | object | 否 | OAuth 配置 |
| `timeout` | number | 否 | 获取工具超时（毫秒，默认 5000） |

### 10.4 OAuth 认证

自动认证：

```json
{
  "mcp": {
    "my-oauth-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

预注册客户端：

```json
{
  "mcp": {
    "my-oauth-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "clientId": "{env:MY_MCP_CLIENT_ID}",
        "clientSecret": "{env:MY_MCP_CLIENT_SECRET}",
        "scope": "tools:read tools:execute"
      }
    }
  }
}
```

禁用 OAuth：

```json
{
  "mcp": {
    "my-api-key-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer {env:MY_API_KEY}"
      }
    }
  }
}
```

**OAuth 选项**：
| 选项 | 类型 | 描述 |
| -------------- | --------------- | ---------------- |
| `oauth` | object \| false | OAuth 配置或禁用 |
| `clientId` | string | OAuth 客户端 ID |
| `clientSecret` | string | OAuth 客户端密钥 |
| `scope` | string | OAuth 作用域 |

**认证命令**：

```bash
opencode mcp auth my-oauth-server    # 认证
opencode mcp auth list               # 列出认证状态
opencode mcp logout my-oauth-server  # 删除凭据
opencode mcp debug my-oauth-server   # 调试连接
```

### 10.5 管理 MCP 工具

全局禁用 MCP：

```json
{
  "tools": {
    "my-mcp-foo": false
  }
}
```

使用通配符：

```json
{
  "tools": {
    "my-mcp*": false
  }
}
```

按代理启用：

```json
{
  "tools": {
    "my-mcp*": false
  },
  "agent": {
    "my-agent": {
      "tools": {
        "my-mcp*": true
      }
    }
  }
}
```

### 10.6 配置示例

**Sentry**：

```json
{
  "mcp": {
    "sentry": {
      "type": "remote",
      "url": "https://mcp.sentry.dev/mcp",
      "oauth": {}
    }
  }
}
```

**Context7**（文档搜索）：

```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}"
      }
    }
  }
}
```

**Grep by Vercel**：

```json
{
  "mcp": {
    "gh_grep": {
      "type": "remote",
      "url": "https://mcp.grep.app"
    }
  }
}
```

---

## 11. 技能 (Skills)

**来源**: https://opencode.ai/docs/zh-cn/skills/

代理技能让 OpenCode 能够从仓库或主目录中发现可复用的指令。

### 11.1 文件位置

为每个技能名称创建一个文件夹，并在其中放入 `SKILL.md`：

| 位置                | 路径                                        |
| ------------------- | ------------------------------------------- |
| 项目配置            | `.opencode/skills/<name>/SKILL.md`          |
| 全局配置            | `~/.config/opencode/skills/<name>/SKILL.md` |
| Claude 兼容（项目） | `.claude/skills/<name>/SKILL.md`            |
| Claude 兼容（全局） | `~/.claude/skills/<name>/SKILL.md`          |
| Agents 兼容（项目） | `.agents/skills/<name>/SKILL.md`            |
| Agents 兼容（全局） | `~/.agents/skills/<name>/SKILL.md`          |

### 11.2 Frontmatter 格式

```yaml
---
name: git-release
description: Create consistent releases and changelogs
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: github
---
```

**字段说明**：

- `name`（必填）- 技能名称，1-64 字符，小写字母和数字，可用连字符分隔
- `description`（必填）- 1-1024 字符
- `license`（可选）
- `compatibility`（可选）
- `metadata`（可选）- 字符串到字符串的映射

### 11.3 名称规则

- 长度为 1–64 个字符
- 仅包含小写字母和数字，可用单个连字符分隔
- 不以 `-` 开头或结尾
- 不包含连续的 `--`
- 与目录名称一致

### 11.4 示例技能

```markdown
---
name: git-release
description: Create consistent releases and changelogs
---

## What I do

- Draft release notes from merged PRs
- Propose a version bump
- Provide a copy-pasteable `gh release create` command

## When to use me

Use this when you are preparing a tagged release.
```

### 11.5 权限配置

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "pr-review": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

按代理覆盖：

```json
{
  "agent": {
    "plan": {
      "permission": {
        "skill": {
          "internal-*": "allow"
        }
      }
    }
  }
}
```

禁用技能工具：

```json
{
  "agent": {
    "plan": {
      "tools": {
        "skill": false
      }
    }
  }
}
```

---

## 12. 自定义工具

**来源**: https://opencode.ai/docs/zh-cn/custom-tools/

创建 LLM 可在 OpenCode 中调用的工具。

### 12.1 工具位置

- 本地定义：`.opencode/tools/`
- 全局定义：`~/.config/opencode/tools/`

### 12.2 工具结构

使用 `tool()` 辅助函数：

```typescript
import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Query the project database",
  args: {
    query: tool.schema.string().describe("SQL query to execute"),
  },
  async execute(args) {
    return `Executed query: ${args.query}`;
  },
});
```

**文件名即为工具名称**。

### 12.3 多工具导出

```typescript
import { tool } from "@opencode-ai/plugin";

export const add = tool({
  description: "Add two numbers",
  args: {
    a: tool.schema.number().describe("First number"),
    b: tool.schema.number().describe("Second number"),
  },
  async execute(args) {
    return args.a + args.b;
  },
});

export const multiply = tool({
  description: "Multiply two numbers",
  args: {
    a: tool.schema.number(),
    b: tool.schema.number(),
  },
  async execute(args) {
    return args.a * args.b;
  },
});
```

创建两个工具：`math_add` 和 `math_multiply`。

### 12.4 参数定义

使用 `tool.schema`（Zod）：

```typescript
args: {
  query: tool.schema.string().describe("SQL query");
}
```

或直接导入 Zod：

```typescript
import { z } from "zod";

export default {
  description: "Tool description",
  args: {
    param: z.string().describe("Parameter description"),
  },
  async execute(args, context) {
    return "result";
  },
};
```

### 12.5 上下文信息

```typescript
import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Get project information",
  args: {},
  async execute(args, context) {
    const { agent, sessionID, messageID, directory, worktree } = context;
    return `Agent: ${agent}, Session: ${sessionID}, Directory: ${directory}`;
  },
});
```

上下文字段：

- `directory` - 会话工作目录
- `worktree` - git worktree 根目录
- `agent` - 当前代理
- `sessionID` - 会话 ID
- `messageID` - 消息 ID

### 12.6 Python 工具示例

Python 脚本（`add.py`）：

```python
import sys
a = int(sys.argv[1])
b = int(sys.argv[2])
print(a + b)
```

工具定义：

```typescript
import { tool } from "@opencode-ai/plugin";
import path from "path";

export default tool({
  description: "Add two numbers using Python",
  args: {
    a: tool.schema.number(),
    b: tool.schema.number(),
  },
  async execute(args, context) {
    const script = path.join(context.worktree, ".opencode/tools/add.py");
    const result = await Bun.$`python3 ${script} ${args.a} ${args.b}`.text();
    return result.trim();
  },
});
```

---

## 13. SDK

**来源**: https://opencode.ai/docs/zh-cn/sdk/

OpenCode 服务器的类型安全 JS 客户端。

### 13.1 安装

```bash
npm install @opencode-ai/sdk
```

### 13.2 创建客户端

创建服务器和客户端：

```typescript
import { createOpencode } from "@opencode-ai/sdk";

const { client } = await createOpencode();
```

**选项**：
| 选项 | 类型 | 描述 | 默认值 |
| ---------- | ----------- | ---------------- | ----------- |
| `hostname` | string | 服务器主机名 | `127.0.0.1` |
| `port` | number | 服务器端口 | `4096` |
| `signal` | AbortSignal | 中止信号 | `undefined` |
| `timeout` | number | 启动超时（毫秒） | `5000` |
| `config` | Config | 配置对象 | `{}` |

自定义配置：

```typescript
const opencode = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  config: {
    model: "anthropic/claude-3-5-sonnet-20241022",
  },
});

console.log(`Server running at ${opencode.server.url}`);
opencode.server.close();
```

### 13.3 仅客户端模式

连接现有服务器：

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk";

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
});
```

**选项**：
| 选项 | 类型 | 描述 | 默认值 |
| --------------- | -------- | ------------ | ----------------------- |
| `baseUrl` | string | 服务器 URL | `http://localhost:4096` |
| `fetch` | function | 自定义 fetch | `globalThis.fetch` |
| `parseAs` | string | 响应解析方式 | `auto` |
| `responseStyle` | string | 返回风格 | `fields` |
| `throwOnError` | boolean | 抛出错误 | `false` |

### 13.4 类型定义

```typescript
import type { Session, Message, Part } from "@opencode-ai/sdk";
```

### 13.5 错误处理

```typescript
try {
  await client.session.get({ path: { id: "invalid-id" } });
} catch (error) {
  console.error("Failed:", (error as Error).message);
}
```

### 13.6 结构化输出

```typescript
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Research Anthropic" }],
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          company: { type: "string" },
          founded: { type: "number" },
          products: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["company", "founded"],
      },
    },
  },
});

console.log(result.data.info.structured_output);
```

**输出格式类型**：
| 类型 | 描述 |
| ------------- | ------------------- |
| `text` | 标准文本响应 |
| `json_schema` | 返回经过验证的 JSON |

**JSON Schema 字段**：
| 字段 | 类型 | 描述 |
| ------------ | --------------- | ----------------------- |
| `type` | `'json_schema'` | 必填 |
| `schema` | object | JSON Schema 对象 |
| `retryCount` | number | 验证重试次数（默认：2） |

### 13.7 API 方法

#### Global

| 方法              | 描述         | 响应                                 |
| ----------------- | ------------ | ------------------------------------ |
| `global.health()` | 检查健康状态 | `{ healthy: true, version: string }` |

#### App

| 方法           | 描述     |
| -------------- | -------- |
| `app.log()`    | 写入日志 |
| `app.agents()` | 列出代理 |

#### Project

| 方法                | 描述         |
| ------------------- | ------------ |
| `project.list()`    | 列出项目     |
| `project.current()` | 获取当前项目 |

#### Path

| 方法         | 描述         |
| ------------ | ------------ |
| `path.get()` | 获取当前路径 |

#### Config

| 方法                 | 描述       |
| -------------------- | ---------- |
| `config.get()`       | 获取配置   |
| `config.providers()` | 列出提供商 |

#### Sessions

| 方法                  | 描述       |
| --------------------- | ---------- |
| `session.list()`      | 列出会话   |
| `session.get()`       | 获取会话   |
| `session.create()`    | 创建会话   |
| `session.delete()`    | 删除会话   |
| `session.update()`    | 更新会话   |
| `session.prompt()`    | 发送消息   |
| `session.command()`   | 执行命令   |
| `session.shell()`     | 执行 shell |
| `session.revert()`    | 撤回消息   |
| `session.unrevert()`  | 恢复消息   |
| `session.abort()`     | 中止会话   |
| `session.share()`     | 分享会话   |
| `session.summarize()` | 总结会话   |

#### Files

| 方法             | 描述         |
| ---------------- | ------------ |
| `find.text()`    | 搜索文本     |
| `find.files()`   | 查找文件     |
| `find.symbols()` | 查找符号     |
| `file.read()`    | 读取文件     |
| `file.status()`  | 获取文件状态 |

#### TUI

| 方法                 | 描述           |
| -------------------- | -------------- |
| `tui.appendPrompt()` | 追加提示词     |
| `tui.openHelp()`     | 打开帮助       |
| `tui.openSessions()` | 打开会话选择器 |
| `tui.openModels()`   | 打开模型选择器 |
| `tui.submitPrompt()` | 提交提示词     |
| `tui.clearPrompt()`  | 清除提示词     |
| `tui.showToast()`    | 显示通知       |

#### Events

| 方法                | 描述       |
| ------------------- | ---------- |
| `event.subscribe()` | 订阅事件流 |

---

## 14. 服务器

**来源**: https://opencode.ai/docs/zh-cn/server/

`opencode serve` 命令运行一个无界面的 HTTP 服务器，暴露 OpenAPI 端点。

### 14.1 用法

```bash
opencode serve [--port <number>] [--hostname <string>] [--cors <origin>]
```

**选项**：
| 标志 | 描述 | 默认值 |
| --------------- | -------------------- | ---------------- |
| `--port` | 监听端口 | `4096` |
| `--hostname` | 监听主机名 | `127.0.0.1` |
| `--mdns` | 启用 mDNS 发现 | `false` |
| `--mdns-domain` | mDNS 自定义域名 | `opencode.local` |
| `--cors` | 额外允许的浏览器来源 | `[]` |

多个 CORS 来源：

```bash
opencode serve --cors http://localhost:5173 --cors https://app.example.com
```

### 14.2 认证

使用 HTTP 基本认证：

```bash
OPENCODE_SERVER_PASSWORD=your-password opencode serve
```

环境变量：

- `OPENCODE_SERVER_USERNAME` - 用户名（默认：`opencode`）
- `OPENCODE_SERVER_PASSWORD` - 密码

### 14.3 架构

- TUI 是与服务器通信的客户端
- 服务器暴露 OpenAPI 3.1 规范端点
- 支持多个客户端同时连接

### 14.4 OpenAPI 规范

```
http://<hostname>:<port>/doc
```

例如：`http://localhost:4096/doc`

### 14.5 API 端点

#### 全局

| 方法 | 路径             | 描述       |
| ---- | ---------------- | ---------- |
| GET  | `/global/health` | 健康状态   |
| GET  | `/global/event`  | 全局事件流 |

#### 项目

| 方法 | 路径               | 描述     |
| ---- | ------------------ | -------- |
| GET  | `/project`         | 列出项目 |
| GET  | `/project/current` | 当前项目 |

#### 路径和 VCS

| 方法 | 路径    | 描述     |
| ---- | ------- | -------- |
| GET  | `/path` | 当前路径 |
| GET  | `/vcs`  | VCS 信息 |

#### 实例

| 方法 | 路径                | 描述     |
| ---- | ------------------- | -------- |
| POST | `/instance/dispose` | 销毁实例 |

#### 配置

| 方法  | 路径                | 描述       |
| ----- | ------------------- | ---------- |
| GET   | `/config`           | 获取配置   |
| PATCH | `/config`           | 更新配置   |
| GET   | `/config/providers` | 列出提供商 |

#### 提供商

| 方法 | 路径                             | 描述       |
| ---- | -------------------------------- | ---------- |
| GET  | `/provider`                      | 列出提供商 |
| GET  | `/provider/auth`                 | 认证方式   |
| POST | `/provider/{id}/oauth/authorize` | OAuth 授权 |
| POST | `/provider/{id}/oauth/callback`  | OAuth 回调 |

#### 会话

| 方法   | 路径                                     | 描述             |
| ------ | ---------------------------------------- | ---------------- |
| GET    | `/session`                               | 列出会话         |
| POST   | `/session`                               | 创建会话         |
| GET    | `/session/status`                        | 会话状态         |
| GET    | `/session/:id`                           | 获取会话         |
| DELETE | `/session/:id`                           | 删除会话         |
| PATCH  | `/session/:id`                           | 更新会话         |
| GET    | `/session/:id/children`                  | 子会话           |
| GET    | `/session/:id/todo`                      | 待办事项         |
| POST   | `/session/:id/init`                      | 初始化 AGENTS.md |
| POST   | `/session/:id/fork`                      | 分叉会话         |
| POST   | `/session/:id/abort`                     | 中止会话         |
| POST   | `/session/:id/share`                     | 分享会话         |
| DELETE | `/session/:id/share`                     | 取消分享         |
| GET    | `/session/:id/diff`                      | 获取差异         |
| POST   | `/session/:id/summarize`                 | 总结会话         |
| POST   | `/session/:id/revert`                    | 回退消息         |
| POST   | `/session/:id/unrevert`                  | 恢复消息         |
| POST   | `/session/:id/permissions/:permissionID` | 响应权限         |

#### 消息

| 方法 | 路径                              | 描述       |
| ---- | --------------------------------- | ---------- |
| GET  | `/session/:id/message`            | 列出消息   |
| POST | `/session/:id/message`            | 发送消息   |
| GET  | `/session/:id/message/:messageID` | 获取消息   |
| POST | `/session/:id/prompt_async`       | 异步发送   |
| POST | `/session/:id/command`            | 执行命令   |
| POST | `/session/:id/shell`              | 运行 shell |

#### 命令

| 方法 | 路径       | 描述     |
| ---- | ---------- | -------- |
| GET  | `/command` | 列出命令 |

#### 文件

| 方法 | 路径                     | 描述     |
| ---- | ------------------------ | -------- |
| GET  | `/find?pattern=<pat>`    | 搜索文本 |
| GET  | `/find/file?query=<q>`   | 查找文件 |
| GET  | `/find/symbol?query=<q>` | 查找符号 |
| GET  | `/file?path=<path>`      | 列出文件 |
| GET  | `/file/content?path=<p>` | 读取文件 |
| GET  | `/file/status`           | 文件状态 |

#### 工具（实验性）

| 方法 | 路径                     | 描述     |
| ---- | ------------------------ | -------- |
| GET  | `/experimental/tool/ids` | 工具 ID  |
| GET  | `/experimental/tool`     | 工具列表 |

#### LSP、格式化器和 MCP

| 方法 | 路径         | 描述         |
| ---- | ------------ | ------------ |
| GET  | `/lsp`       | LSP 状态     |
| GET  | `/formatter` | 格式化器状态 |
| GET  | `/mcp`       | MCP 状态     |
| POST | `/mcp`       | 添加 MCP     |

#### 代理

| 方法 | 路径     | 描述     |
| ---- | -------- | -------- |
| GET  | `/agent` | 列出代理 |

#### 日志

| 方法 | 路径   | 描述     |
| ---- | ------ | -------- |
| POST | `/log` | 写入日志 |

#### TUI

| 方法 | 路径                    | 描述           |
| ---- | ----------------------- | -------------- |
| POST | `/tui/append-prompt`    | 追加提示词     |
| POST | `/tui/open-help`        | 打开帮助       |
| POST | `/tui/open-sessions`    | 打开会话选择器 |
| POST | `/tui/open-themes`      | 打开主题选择器 |
| POST | `/tui/open-models`      | 打开模型选择器 |
| POST | `/tui/submit-prompt`    | 提交提示词     |
| POST | `/tui/clear-prompt`     | 清除提示词     |
| POST | `/tui/execute-command`  | 执行命令       |
| POST | `/tui/show-toast`       | 显示提示       |
| GET  | `/tui/control/next`     | 等待控制请求   |
| POST | `/tui/control/response` | 响应控制请求   |

#### 认证

| 方法 | 路径        | 描述     |
| ---- | ----------- | -------- |
| PUT  | `/auth/:id` | 设置认证 |

#### 事件

| 方法 | 路径     | 描述   |
| ---- | -------- | ------ |
| GET  | `/event` | 事件流 |

#### 文档

| 方法 | 路径   | 描述         |
| ---- | ------ | ------------ |
| GET  | `/doc` | OpenAPI 规范 |

## 15. 插件 (Plugins)

**来源**: https://opencode.ai/docs/plugins/

编写自己的插件来扩展 OpenCode。插件允许你通过 hook 各种事件和自定义行为来扩展 OpenCode。

### 15.1 使用插件

有两种加载插件的方式。

#### 本地文件

将 JavaScript 或 TypeScript 文件放在插件目录：
- `.opencode/plugins/` - 项目级插件
- `~/.config/opencode/plugins/` - 全局插件

这些目录中的文件会在启动时自动加载。

#### 从 npm

在配置文件中指定 npm 包：
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-helicone-session", "opencode-wakatime", "@my-org/custom-plugin"]
}
```

支持普通和带作用域的 npm 包。

### 15.2 插件安装方式

**npm 插件**使用 Bun 在启动时自动安装，包及其依赖被缓存在 `~/.cache/opencode/node_modules/`。

**本地插件**直接从插件目录加载。要使用外部包，必须在配置目录中创建 `package.json`。

### 15.3 加载顺序

插件从所有来源加载，所有 hook 按顺序运行：
1. 全局配置（`~/.config/opencode/opencode.json`）
2. 项目配置（`opencode.json`）
3. 全局插件目录（`~/.config/opencode/plugins/`）
4. 项目插件目录（`.opencode/plugins/`）

相同名称和版本的 npm 包只加载一次，但本地插件和 npm 插件即使名称相似也会分别加载。

### 15.4 创建插件

插件是一个导出一个或多个插件函数的 **JavaScript/TypeScript 模块**。每个函数接收上下文对象并返回 hooks 对象。

#### 依赖管理

本地插件和自定义工具可以使用外部 npm 包。在配置目录添加 `package.json`：
```json
{
  "dependencies": {
    "shescape": "^2.1.0"
  }
}
```

OpenCode 在启动时运行 `bun install` 安装这些依赖。

```typescript
import { escape } from "shescape"

export const MyPlugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        output.args.command = escape(output.args.command)
      }
    },
  }
}
```

#### 基本结构

```typescript
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  console.log("Plugin initialized!")
  return {
    // Hook 实现放在这里
  }
}
```

插件函数接收：
- `project`：当前项目信息
- `directory`：当前工作目录
- `worktree`：git worktree 路径
- `client`：opencode SDK 客户端，用于与 AI 交互
- `$`：Bun 的 shell API，用于执行命令

#### TypeScript 支持

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // 类型安全的 hook 实现
  }
}
```

### 15.5 事件列表

插件可以订阅以下事件：

#### 命令事件
- `command.executed`

#### 文件事件
- `file.edited`
- `file.watcher.updated`

#### 安装事件
- `installation.updated`

#### LSP 事件
- `lsp.client.diagnostics`
- `lsp.updated`

#### 消息事件
- `message.part.removed`
- `message.part.updated`
- `message.removed`
- `message.updated`

#### 权限事件
- `permission.asked`
- `permission.replied`

#### 服务器事件
- `server.connected`

#### 会话事件
- `session.created`
- `session.compacted`
- `session.deleted`
- `session.diff`
- `session.error`
- `session.idle`
- `session.status`
- `session.updated`

#### 待办事件
- `todo.updated`

#### Shell 事件
- `shell.env`

#### 工具事件
- `tool.execute.after`
- `tool.execute.before`

#### TUI 事件
- `tui.prompt.append`
- `tui.command.execute`
- `tui.toast.show`

### 15.6 示例

#### 发送通知

会话完成时发送通知：
```typescript
export const NotificationPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`osascript -e 'display notification "Session completed!" with title "opencode"'`
      }
    },
  }
}
```

#### .env 文件保护

防止 opencode 读取 `.env` 文件：
```typescript
export const EnvProtection = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        throw new Error("Do not read .env files")
      }
    },
  }
}
```

#### 注入环境变量

向所有 shell 执行注入环境变量：
```typescript
export const InjectEnvPlugin = async () => {
  return {
    "shell.env": async (input, output) => {
      output.env.MY_API_KEY = "secret"
      output.env.PROJECT_ROOT = input.cwd
    },
  }
}
```

#### 自定义工具

插件可以添加自定义工具：
```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string(),
        },
        async execute(args, context) {
          const { directory, worktree } = context
          return `Hello ${args.foo} from ${directory} (worktree: ${worktree})`
        },
      }),
    },
  }
}
```

`tool` 辅助函数创建 opencode 可调用的自定义工具，包含：
- `description`：工具描述
- `args`：Zod schema 定义参数
- `execute`：工具调用时执行的函数

#### 结构化日志

使用 `client.app.log()` 代替 `console.log`：
```typescript
export const MyPlugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: "my-plugin",
      level: "info",
      message: "Plugin initialized",
      extra: { foo: "bar" },
    },
  })
}
```

日志级别：`debug`、`info`、`warn`、`error`

#### 压缩钩子

自定义会话压缩时包含的上下文：
```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const CompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push(`
## Custom Context
Include any state that should persist across compaction:
- Current task status
- Important decisions made
- Files being actively worked on
`)
    },
  }
}
```

完全替换压缩提示词：
```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const CustomCompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.prompt = `
You are generating a continuation prompt for a multi-agent swarm session.
Summarize:
1. The current task and its status
2. Which files are being modified and by whom
3. Any blockers or dependencies between agents
4. The next steps to complete the work
Format as a structured prompt that a new agent can use to resume work.
`
    },
  }
}
```

当设置 `output.prompt` 时，它会完全替换默认压缩提示词，此时 `output.context` 数组被忽略。

---

## 附录：自定义提供商配置

**来源**: https://opencode.ai/docs/zh-cn/config/

在项目目录中创建或更新 `opencode.json` 文件：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "myprovider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "My AI Provider Display Name",
      "options": {
        "baseURL": "https://api.myprovider.com/v1"
      },
      "models": {
        "my-model-name": {
          "name": "My Model Display Name"
        }
      }
    }
  }
}
```

### 配置选项说明

| 字段              | 说明                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm`             | AI SDK 包，OpenAI 兼容使用 `@ai-sdk/openai-compatible`（适用于 /v1/chat/completions），/v1/responses 使用 `@ai-sdk/openai` |
| `name`            | UI 中显示的名称                                                                                                            |
| `models`          | 可用模型                                                                                                                   |
| `options.baseURL` | API 端点 URL                                                                                                               |
| `options.apiKey`  | API 密钥（可选，可使用 `{env:VAR_NAME}`）                                                                                  |
| `options.headers` | 自定义请求头                                                                                                               |
| `limit.context`   | 最大输入 Token 数                                                                                                          |
| `limit.output`    | 最大输出 Token 数                                                                                                          |

### 高级示例

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "myprovider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "My AI Provider",
      "options": {
        "baseURL": "https://api.myprovider.com/v1",
        "apiKey": "{env:ANTHROPIC_API_KEY}",
        "headers": {
          "Authorization": "Bearer custom-token"
        }
      },
      "models": {
        "my-model-name": {
          "name": "My Model",
          "limit": {
            "context": 200000,
            "output": 65536
          }
        }
      }
    }
  }
}
```

执行 `/models` 命令，自定义的提供商和模型将出现在选择列表中。

---

*文档结束*
