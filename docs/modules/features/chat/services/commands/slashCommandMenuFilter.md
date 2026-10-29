# slashCommandMenuFilter

> 2026-10-29：新增显式前端 trigger 分支：`/` 混合命令/技能，`$` 仅技能，兼容手输 `/skills query`。原生目录项保持自己的 insertText，legacy prefixed 模式只在序列化阶段写 `/skills name`。Codex 仅展示技能以及已有 API 承接的 new/compact，隐藏 OpenCode 专属合成命令。

> **源码**: `src/features/chat/services/commands/slashCommandMenuFilter.ts`
> **状态**: [REVIEW]

> **新增（Codex mode）**: `SlashCommandMenuFilterOptions` 增加可选运行时 `codexSkillMode`。启用时:
- **始终包含 `/skills` capability 入口**(即使 `skills/list` 返回空),确保菜单永不空白;
- `/skills <x>` 展开匹配 codex skills(无匹配仍保留 `/skills` 入口);
- 空 `/` 或 `$x` 触发:匹配 codex skills 直接插入 `$name ` + `/skills` 入口;
- 永不持久化或改动 `slashCommandSkillMode`,不入 OpenCode session-command。

## 概述

`slashCommandMenuFilter.ts` 是聊天输入区 slash autocomplete 的纯过滤 helper。它把命令 ID 和描述的 fuzzy scoring 从 `ComposerInputShellCoordinator` 中移出，避免输入区 DOM/layout owner 继续膨胀。

## 公开接口

```typescript
export function filterSlashCommandMenuItems(
  items: SlashCommandMenuItem[],
  query: string,
  options?: SlashCommandMenuFilterOptions,
): SlashCommandMenuItem[];
```

## 行为

- 空查询时按原始顺序返回命令
- 非空查询时同时匹配 command ID 与 description
- ID 前缀匹配拥有最高权重，非连续字符匹配用于支持轻量 fuzzy 搜索
- 返回结果按分数降序排列
- direct skill mode 下，runtime `source: 'skill'` 与普通 runtime/project command 一样参与顶层过滤
- `skills-command` mode 下，顶层过滤隐藏单个 skill 并追加合成 `/skills` 入口（`isBuiltin: false`，非 OpenCode 内置）
- `/skills <query>` nested 查询只过滤 skill items，并把显示/插入文本改成 `/skills <id> `
- 调用方传入 `isMidText` 时，过滤结果会强制限定为 skill-only：direct mode 直接返回 skill entries，`skills-command` mode 则返回 `/skills <id> ` 形式的 prefixed skill entries；普通 command 不会出现在句中 slash 弹框里

## 边界

- 不读取 OpenCode runtime、项目 `.opencode` 配置或插件 settings；调用方通过 options 传入已解析的 skill mode
- 不渲染 DOM，也不处理键盘/鼠标事件
- catalog merge、hidden command 过滤仍属于 `src/core/config/slashCommandCatalog.ts`

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/commands/slashCommandMenuFilter.ts`。
- 原位置：`src/features/chat/services/slashCommandMenuFilter.ts`；文件名、导出接口与业务职责保持不变。

## 2026-10-28：原生命令与技能弹框

/skills 继续统一浏览，但 nativeSkill 项保留原生 insertText：OpenCode 2、Claude、ZCode、DSH 使用 /name，Pi 使用 /skill:name，Codex 继续 。旧 OpenCode 的展开语法保留为 /skills name。
