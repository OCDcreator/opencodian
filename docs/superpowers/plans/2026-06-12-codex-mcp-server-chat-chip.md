# Codex MCP Server Name in Chat Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `toolMetadata.server` on Codex `mcp_tool_call` blocks in chat via a small server chip and an expanded `Server: {name}` detail, using only stream metadata already present.

**Architecture:** Extend `ToolCallRenderer` to detect `kind === 'mcp'` and a `server` field in `toolMetadata`. Render a non-interactive server chip in the tool header and a `Server:` field in the expanded content. Keep all schema/auth/management surfaces out of chat; they remain unintegrated.

**Tech Stack:** TypeScript, Obsidian DOM API, existing `ToolCallRenderer` / `StreamController` / `mcpSummaryConfig`, Vitest + JSDOM tests, esbuild.

---

### Task 1: Add MCP server chip styles

**Files:**
- Modify: `src/style/components/streaming-content.css:107-140` (header/status area)
- Create test evidence via later Test Vault only.

- [ ] **Step 1: Add `.streaming-tool-server-chip` rule**

Append after `.streaming-tool-status` block (around line 114):

```css
.streaming-tool-server-chip {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--background-modifier-form-field);
  color: var(--text-muted);
  font-size: 11px;
  font-family: var(--font-monospace);
  line-height: 1.4;
}
```

- [ ] **Step 2: Verify CSS builds**

Run: `npm run build:css`
Expected: no errors.

---

### Task 2: Render MCP server chip in `ToolCallRenderer`

**Files:**
- Modify: `src/utils/streaming/ToolCallRenderer.ts:421-468` (render)
- Modify: `src/utils/streaming/ToolCallRenderer.ts:104-131` (defaultRenderExpandedContent)

- [ ] **Step 1: Add helper to read server name**

Add a private method after `isTaskTool` (around line 135):

```ts
private getMcpServerName(toolCall: Pick<ToolCallInfo, 'kind' | 'toolMetadata'>): string | null {
  if (toolCall.kind !== 'mcp') {
    return null;
  }
  const server = toolCall.toolMetadata?.server;
  if (typeof server === 'string' && server.trim().length > 0) {
    return server.trim();
  }
  return null;
}
```

- [ ] **Step 2: Render server chip in header**

In `render`, after creating `statusEl` (around line 449), insert:

```ts
const serverName = this.getMcpServerName(toolCall);
if (serverName) {
  const serverChip = header.createSpan({ cls: 'streaming-tool-server-chip' });
  serverChip.setText(serverName);
  serverChip.title = `MCP server: ${serverName}`;
}
```

- [ ] **Step 3: Add `Server:` detail in expanded content**

Add a dedicated MCP expanded renderer. After `renderTaskExpandedContent`, add:

```ts
private renderMcpExpandedContent(
  container: HTMLElement,
  toolCall: ToolCallInfo,
): void {
  const detailsEl = container.createDiv({ cls: 'streaming-mcp-details' });
  const serverName = this.getMcpServerName(toolCall);
  if (serverName) {
    detailsEl.createDiv({ cls: 'streaming-mcp-field', text: `Server: ${serverName}` });
  }
}
```

Then in `render`, replace the `else if` branch (around lines 456-457) with:

```ts
} else if (toolCall.kind === 'mcp') {
  this.renderMcpExpandedContent(content, toolCall);
  this.options.renderExpandedContent!(content, toolCall.name, toolCall.result);
} else if (toolCall.status !== 'pending' && toolCall.status !== 'running') {
```

If the tool is pending/running and kind is `mcp`, keep the pending message.

- [ ] **Step 4: Update `updateResult` to refresh MCP details**

In `updateResult`, after emptying `contentEl`, add:

```ts
if (toolCall.kind === 'mcp') {
  this.renderMcpExpandedContent(contentEl, toolCall);
}
```

before calling `renderExpandedContent` for non-task tools.

---

### Task 3: Unit tests for MCP server rendering

**Files:**
- Modify: `tests/unit/utils/streaming/ToolCallRenderer.test.ts`

- [ ] **Step 1: Add test for header server chip**

Append to `describe('ToolCallRenderer', ...)`:

```ts
it('renders MCP server chip in header when toolMetadata.server is present', () => {
  const parentEl = document.createElement('div');
  const renderer = new ToolCallRenderer();

  renderer.render(parentEl, {
    id: 'tool-mcp-server',
    name: 'mcp__filesystem__read_file',
    kind: 'mcp',
    input: { path: '/tmp/demo.md' },
    status: 'running',
    toolMetadata: { server: 'filesystem' },
  });

  const chip = parentEl.querySelector('.streaming-tool-server-chip');
  expect(chip?.textContent).toBe('filesystem');
  expect(chip?.getAttribute('title')).toContain('filesystem');
});

it('does not render MCP server chip for non-MCP tools', () => {
  const parentEl = document.createElement('div');
  const renderer = new ToolCallRenderer();

  renderer.render(parentEl, {
    id: 'tool-read',
    name: 'read',
    kind: 'builtin',
    input: { file_path: 'docs/spec.md' },
    status: 'running',
    toolMetadata: { server: 'ignored' },
  });

  expect(parentEl.querySelector('.streaming-tool-server-chip')).toBeNull();
});
```

- [ ] **Step 2: Add test for expanded Server: detail**

Append:

```ts
it('shows Server: detail when expanding an MCP tool call', () => {
  const parentEl = document.createElement('div');
  const renderer = new ToolCallRenderer();

  renderer.render(parentEl, {
    id: 'tool-mcp-detail',
    name: 'mcp__web__fetch',
    kind: 'mcp',
    input: { url: 'https://example.com' },
    status: 'completed',
    result: 'ok',
    toolMetadata: { server: 'web' },
  });

  parentEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();

  const contentEl = parentEl.querySelector('.streaming-tool-content');
  expect(contentEl?.textContent).toContain('Server: web');
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/utils/streaming/ToolCallRenderer.test.ts`
Expected: all tests pass.

---

### Task 4: Locale updates

**Files:**
- Modify: `src/i18n/locales/en.ts` and `src/i18n/locales/zh.ts` (if a title string is used; the chip uses raw server name, so no new keys required)

No new locale keys are required because the chip displays the raw server name and the detail uses the static prefix `Server:` inline. If desired, add `chat.tool.mcpServer` key later; keep this batch minimal.

---

### Task 5: Docs/devlog/status cleanup

**Files:**
- Modify: `docs/status/codex-sdk-current-state-2026-06-09.md`
- Modify: `docs/archive/maintainability/phases/checkpoint-15m-codex-sdk-0.139.0-upgrade.md`
- Modify: `devlog.md`
- Modify: `docs/modules/utils/streaming/ToolCallRenderer.md` (if exists)

- [ ] **Step 1: Update `codex-sdk-current-state-2026-06-09.md`**

In §1.2 `已 pass`:
- Change "visible `mcp_tool_call` transcript path" to "visible `mcp_tool_call` transcript path with MCP server name chip rendered from `toolMetadata.server`".

In §1.2 `未接入`:
- Keep "richer MCP schema/auth rendering in Codex chat (tool description/schema expansion, auth-status chips inside the transcript)" but remove any wording implying the generic block is unintegrated.

- [ ] **Step 2: Update `checkpoint-15m-codex-sdk-0.139.0-upgrade.md`**

In §5.1, update the `mcp_tool_call` row similarly.

- [ ] **Step 3: Update `devlog.md`**

Add a new top entry (before first `## YYYY-MM-DD`) summarizing this batch, and replace stale `1917`/`1910` references in the Round 2 entry with current build artifacts.

- [ ] **Step 4: Module docs**

If `docs/modules/utils/streaming/ToolCallRenderer.md` exists, add a line documenting the MCP server chip behavior.

---

### Task 6: Build, deploy, and Test Vault verify

- [ ] **Step 1: Run `npm run verify`**
Expected: pass (lint 0 errors; module-docs, graphify, devlog-order green).

- [ ] **Step 2: Build**
Run: `npm run build`
Capture `BUILD_ID`.

- [ ] **Step 3: Deploy**
Copy `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/`, `dist/assets/` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.

- [ ] **Step 4: Reload plugin in Test Vault and trigger an MCP tool call**
Use a Codex chat prompt that exercises an MCP server. Capture:
- Screenshot of MCP tool block with server chip visible.
- DOM snapshot containing `.streaming-tool-server-chip`.
Save to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15o-*`.

---

### Task 7: Truth bucket update

- **Codex MCP settings surface**: `readback` (unchanged).
- **Codex chat MCP transcript seam**: `已 pass` — now surfaces `toolMetadata.server` as a server chip and expanded `Server:` detail.
- **Richer chat MCP schema/auth rendering**: `未接入` — tool descriptions, input schema, auth status chips remain unintegrated.
- **Codex-as-MCP-server**: `未接入` (unchanged).

---

## Self-Review

- Spec coverage: server chip header, expanded detail, tests, build/deploy, docs cleanup all have tasks.
- No placeholders: every step includes exact code or command.
- Type consistency: `toolMetadata.server` is already `unknown` in types; helper checks `typeof === 'string'`.
