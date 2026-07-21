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
- `.opencodian-agent-workspace-*`：Markdown workspace toolbar、file list、file row、inline editor panel；toolbar 内的 create `Setting` 收缩为按钮宽度并固定在右侧，不能继承普通双列 field grid 后停在中间。
- `.opencodian-agent-settings-alert`：catalog load failure、empty catalog、empty workspace 的 Alert/Empty surface。

## Project Agent Editor card contract

2026-07-01 起，Project Agent Editor 使用 shadcn-style Card + Field grammar：不绘制外层大卡片，而是把 `基础信息`、`行为定义`、`模型与采样`、`高级配置` 四个 FieldGroup 各自呈现为一个中性 Card。`高级配置` 仍保留 native `<details>` Accordion 行为，只是 Accordion root 本身也承担 Card chrome。

- `.opencodian-agent-editor-card`：editor root 的 Card 语义锚点；不负责 border/background/radius，避免形成外层大卡片。
- `.opencodian-agent-editor-card-content`：CardContent 语义锚点，包裹所有字段组并控制 group rhythm。
- `.opencodian-agent-editor-field-group`：对应 shadcn Card；group header / summary 映射 CardHeader，字段 body 映射 CardContent。
- `.opencodian-agent-editor-field-group[data-group="advanced"]`：对应 Card + Accordion + FieldGroup，保留折叠行为。
- `.opencodian-agent-editor-field`：Field，附着在旧 `.opencodian-agent-editor-row` 上；在每张 group card 内保持 flat field，不再自己画 row card。
- `.opencodian-agent-editor-footer`：CardFooter 语义锚点，附着在旧 `.opencodian-agent-editor-actions` 上，使用 separator + right-aligned action group。

这套 class 是结构语义，不引入 shadcn/Radix/Tailwind/React runtime。旧 class 不删除，保持现有测试和 DOM 证据路径稳定。

## shadcn/Radix mapping

- shadcn Card/Form row → `.opencodian-agent-settings-control-row` / `.opencodian-agent-editor-row`
- shadcn Card → `.opencodian-agent-editor-field-group`
- shadcn CardHeader → `.opencodian-agent-editor-group-header`
- shadcn CardContent → `.opencodian-agent-editor-card-content`
- shadcn CardFooter → `.opencodian-agent-editor-footer` (semantic only, flat footer)
- shadcn FieldGroup / Field → `.opencodian-agent-editor-field-group` / `.opencodian-agent-editor-field`
- shadcn Badge → `.opencodian-agent-badge*`
- shadcn ScrollArea/List → `.opencodian-backend-agent-list` / `.opencodian-agent-catalog-list` / `.opencodian-agent-workspace-list`
- Radix Accordion/Disclosure → native `<details>` with `.opencodian-agent-editor-group-summary`
- shadcn Alert/Empty → `.opencodian-agent-settings-alert`

The implementation does not import shadcn, Radix, Tailwind, React, or new icon libraries.

## Responsive rules

Below `720px`, control rows collapse from copy/control columns to one column. Controls align left, long textareas remain full-width, and list rows keep compact spacing so Chinese and English labels do not overflow button/control containers.

## Guardrails

- Do not use this file for Skills, Tools, ACP, or chat agent selector styling.
- Do not add decorative gradients, glass blur, heavy shadow, side-stripe borders, nested cards, or a large bordered outer editor card.
- Keep the editor cards neutral; accent color belongs to focus, active tabs, badges, and state text.
- Do not turn advanced agent editing into a Sheet/Drawer; inline disclosure is the approved pattern.
- Keep all colors derived from Obsidian variables or existing settings tokens.
- After editing this CSS, run `npm run build:css` and keep root `styles.css` synchronized.
