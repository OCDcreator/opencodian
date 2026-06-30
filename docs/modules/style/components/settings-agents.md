# Settings Agents Styles

> **源码**: `src/style/components/settings-agents.css`
> **状态**: [REVIEW]

## 职责

定义 Settings > Agents / 智能体管理 的 owner-specific control surface。它复用 `settings-layout-contract.css` 暴露的 `--opencodian-settings-*` token，把 `General > Agent Management` backend 管理、OpenCode default agent、expert mode、agent catalog、project agent editor、Markdown agent workspace 统一成低调、密集、Obsidian-native 的设置表面。

这个文件只负责 Agents settings，不影响聊天里的 agent selector，也不影响 Skills / Tools / ACP。

## Surface contract

- `.opencodian-agent-settings-shell`：布局 shell，只控制四个二级表面的垂直 rhythm，不增加背景、边框或 shadow。
- `.opencodian-backend-agent-surface`：`General > Agent Management` 的 backend 管理 surface，包含默认 backend control row 和 enabled backend list。
- `.opencodian-backend-agent-list` / `.opencodian-backend-agent-row`：backend 管理 compact list。TS 会补 `role="listitem"`、`data-backend-agent-id`、`data-backend-agent-active` 和 `data-backend-agent-enabled`，状态通过 badge 表达。
- `.opencodian-agent-settings-default-surface`：Default tab / classic default 区域的 control stack。
- `.opencodian-agent-settings-control-row`：默认主代理和 expert mode 的 shadcn-style Form/Card row，桌面端 copy/control 两列，窄屏单列。
- `.opencodian-agent-settings-block`：Agents section 子块，重置 legacy plugin block 的多余 padding，让标题、说明、body 跟共享 Settings rhythm 对齐。
- `.opencodian-agent-catalog-list`：bounded ScrollArea-style list，保留 `.opencodian-settings-catalog-scroll` / `.opencodian-agent-catalog-scroll` 以维持滚动位置测试和现有 DOM 证据路径。
- `.opencodian-agent-catalog-row`：agent catalog compact data row。TS 会补 `role="listitem"`、`data-agent-mode` 和 `data-agent-state`。
- `.opencodian-agent-badge*`：mode/source/status/visibility chip。状态只使用低调 tonal border/background，不使用大色块。
- `.opencodian-agent-editor-*`：project agent editor 的 flat groups、two-column rows、textarea rows、advanced disclosure、action footer。
- `.opencodian-agent-workspace-*`：Markdown workspace toolbar、file list、file row、inline editor panel。
- `.opencodian-agent-settings-alert`：catalog load failure、empty catalog、empty workspace 的 Alert/Empty surface。

## shadcn/Radix mapping

- shadcn Card/Form row → `.opencodian-agent-settings-control-row` / `.opencodian-agent-editor-row`
- shadcn Badge → `.opencodian-agent-badge*`
- shadcn ScrollArea/List → `.opencodian-backend-agent-list` / `.opencodian-agent-catalog-list` / `.opencodian-agent-workspace-list`
- Radix Accordion/Disclosure → native `<details>` with `.opencodian-agent-editor-group-summary`
- shadcn Alert/Empty → `.opencodian-agent-settings-alert`

The implementation does not import shadcn, Radix, Tailwind, React, or new icon libraries.

## Responsive rules

Below `720px`, control rows collapse from copy/control columns to one column. Controls align left, long textareas remain full-width, and list rows keep compact spacing so Chinese and English labels do not overflow button/control containers.

## Guardrails

- Do not use this file for Skills, Tools, ACP, or chat agent selector styling.
- Do not add decorative gradients, glass blur, heavy shadow, side-stripe borders, or nested cards.
- Do not turn advanced agent editing into a Sheet/Drawer; inline disclosure is the approved pattern.
- Keep all colors derived from Obsidian variables or existing settings tokens.
- After editing this CSS, run `npm run build:css` and keep root `styles.css` synchronized.
