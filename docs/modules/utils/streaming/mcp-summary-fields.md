# MCP Summary Fields

> **源码**: `src/utils/streaming/mcpSummaryConfig.ts`
> **状态**: [REVIEW]

## 概述

集中维护 MCP 工具摘要的动作词、类别字段、通用回退字段和字段展示类型。`ToolCallRenderer` 会先用工具名动作词判断类别，再按对应字段顺序从顶层 `input` 中提取摘要。

## 匹配顺序

1. 工具名转小写，并按 `__` / `_` / `-` / `:` 拆词。
2. 从后往前找最后一个命中的动作词。
3. 命中类别后按该类别字段顺序取摘要。
4. 类别字段不可用时，走通用字段回退。
5. 通用字段不可用时，取首个顶层非空 `string/number/boolean`。
6. 仍无可用值时摘要为空，UI 隐藏摘要位。

## 类别字段表

| 类别 | 动作词 | 字段优先级 |
|---|---|---|
| Search / query | `search`, `find`, `query`, `lookup`, `match` | `query` → `q` → `keywords` → `term` → `search` → `searchTerm` → `prompt` → `text` |
| Fetch / open / download | `fetch`, `get`, `open`, `request`, `download`, `crawl`, `scrape`, `visit` | `url` → `uri` → `link` → `href` → `resource` → `resourceUrl` → `endpoint` → `path` |
| Read / view / load | `read`, `cat`, `show`, `view`, `load` | `path` → `file_path` → `filePath` → `filename` → `file` → `source` → `url` → `uri` |
| List / enumerate | `list`, `ls`, `glob`, `enumerate`, `browse` | `path` → `dir` → `directory` → `folder` → `cwd` → `root` → `pattern` → `glob` |
| Execute / command | `run`, `exec`, `execute`, `command`, `shell`, `bash`, `spawn` | `command` → `cmd` → `script` → `argv` → `arguments` → `args` → `prompt` |
| Write / create / generate | `write`, `create`, `save`, `export`, `generate`, `emit` | `path` → `file_path` → `filePath` → `target` → `output` → `destination` → `dest` → `name` → `title` |
| Edit / update / patch | `edit`, `update`, `patch`, `modify`, `replace`, `rename` | `path` → `file_path` → `filePath` → `target` → `resource` → `instruction` → `prompt` → `name` |
| Delete / remove | `delete`, `remove`, `unlink`, `clear`, `purge` | `path` → `file_path` → `filePath` → `target` → `resource` → `id` → `name` |
| Navigate / select / locate | `navigate`, `goto`, `select`, `click`, `focus`, `locate` | `url` → `path` → `selector` → `element` → `target` → `id` → `name` |
| Auth / connect / session | `auth`, `login`, `authorize`, `connect`, `callback`, `session` | `url` → `provider` → `server` → `name` → `id` → `clientId` |
| Info / status / metadata | `info`, `status`, `describe`, `metadata`, `inspect` | `name` → `id` → `resource` → `target` → `path` → `url` |

## 通用字段回退

当工具名类别无法提取摘要时，按以下顺序回退：

`query` → `url` → `path` → `file_path` → `filePath` → `command` → `prompt` → `title` → `name` → `id` → `target` → `resource` → `selector` → `arguments` → `args`

## 字段展示类型

| 类型 | 字段 | 展示策略 |
|---|---|---|
| 路径类 | `path`, `file_path`, `filePath`, `filename`, `file`, `source`, `output`, `destination`, `dest`, `folder`, `directory`, `root`, `cwd` | 仅显示末级文件/目录名 |
| URL 类 | `url`, `uri`, `link`, `href`, `resourceUrl`, `endpoint` | 原样截断到 60 字符 |
| 参数类 | `arguments`, `args`, `argv` | 仅当值为字符串时显示，截断到 60 字符 |
| 普通文本 | 其他字符串字段 | 截断到 60 字符 |
| 最终标量回退 | 顶层 `string/number/boolean` | 字符串截断，数字/布尔转字符串 |

## 注意事项

- 只处理顶层 `input` 字段，不解析嵌套对象或数组。
- `custom` 工具不使用这套 MCP 摘要规则。
- 若工具名包含多个动作词，最后一个命中的动作词优先。
