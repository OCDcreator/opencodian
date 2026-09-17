# Owner: feature.inline-edit

Inline edit (2026-09-15): the feature is backend-agnostic UI plus orchestration. It never writes through the model: the only write path is a single `editor.replaceRange` in `InlineEditController`, taken after a dirty check against the snapshot the request was built from.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/inline-edit/**`

## Responsibilities

- inline edit CM6 controller, widget layer and word-level diff preview
- backend-neutral auxiliary query orchestration, prompt contract and response parsing
- inline edit host resolution for backend, model and working directory

## Canonical state (truth home)

- inline edit controller singleton

The singleton is the ownership truth for "at most one inline edit exists". The plugin main class holds the reference and replaces it on unload; nothing else may create a controller.

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints

- `src/features/inline-edit/InlineEditController.ts`

The controller is reached from two places only, both in `app.composition`: the `inline-edit` editor command and the `editor-menu` context-menu item.

## Non-obvious invariants

- **The feature is not a security boundary.** Read-only enforcement lives in the backend aux-query session (`core.backend`, `core.backend-pi`); this owner may only *audit and discard*. `InlineEditService` drops any turn whose observed tool calls include a write-class tool, but it cannot prevent one.
- **One write, one transaction.** Accepting an edit goes through exactly one `editor.replaceRange`, so Obsidian's undo stack treats the whole inline edit as a single step.
- **Snapshot equality, not offset arithmetic.** The accept path re-reads the live text of the decoration's *mapped* range and compares it with the snapshot taken at request time. Any divergence aborts instead of writing at stale offsets.
- **`editor.cm` is an undocumented internal.** When it is missing the feature disables itself with a notice; it must never guess an alternative path.
- **IME safety.** Every keyboard decision checks `event.isComposing`, so a Chinese IME candidate window cannot accept or reject an edit.

## Dependency surface

- **Allowed owner dependencies:** `shared.foundation`, `shared.i18n`, `shared.utils-misc`, `core.types`, `core.agents`, `core.backend`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.backend`, `feature.chat-shell`, `feature.settings-shell`

Note the deliberate absence of `core.opencode`: inline edit talks to backends only through `AgentAuxQueryCapability`, never to a concrete OpenCode service.

## Focused tests

- `tests/unit/features/inline-edit/**`

The pure layers (prompt construction/parsing, tokeniser and diff, service orchestration, model-override parsing) carry the unit coverage; the CM6 widget layer and the real backend sessions are covered by the M1 security audit (`scripts/audit/run-aux-query-audit.mjs`) and the manual acceptance checklist.

## Required gates

Run before merge: `npm run typecheck`, `npm run check:module-docs`.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。
- 2026-09-17: 行内编辑 UI 第三轮：输入行改为「字段框体 + 内嵌品牌标记 + 无边框输入框」，字段框体归本 owner 的样式所有（裸 input 的盒属性以 `!important` 钉死，抵抗宿主主题/片段注入边框与内边距）；sparkles 换为插件 app 标记（id 常量移到 `shared.brandingWordmark`）。职责与边界未变。
- 2026-09-17（第四轮）: 指令输入从单行 `input` 改为自增高 `textarea`（上限 120px 后内部滚动，Enter 提交 / Shift+Enter 换行），条子新增"下方放不下时翻到锚点上方"的定位规则；品牌标记移出字段框、作为条子头像钉在首行。职责与边界未变。
- 2026-09-17（第五轮）: 新增附加上下文：页脚"添加上下文"入口 + 面板内选择器（搜索/键盘）+ 已附加 chip（独立上一行），提示词新增 `<attached_context>` 块（只列路径，§6.1 不注入 vault 正文），宿主新增可选 `listContextFiles()`。UI 拆出 `InlineEditContextUi`（页脚 chip + 选择器主体），overlay 保持骨架体量。职责与边界未变。
- 2026-09-17（第五轮布局修正）: 提交/关闭按钮改为与字段框体垂直居中；附加上下文选择器改为 `left: 0` + `width: 100%`，左右边框与卡片边框对齐（原先内缩 10px 且比卡片宽，视觉上错位）。职责与边界未变。
