# Claude Code Phase 1 Runtime Validation — 2026-05-20

## Summary

Phase 1 runtime wiring is implemented behind explicit backend enablement. OpenCode remains the default backend. Claude Code is now registered at startup when a vault path exists, can be selected in Backend Management, lazy-loads the official `@anthropic-ai/claude-agent-sdk`, and is packaged for `dist/` deployment with the SDK bundled into `main.js` plus the current platform Claude Code binary copied beside the plugin.

## Verified

- Official SDK package installed: `@anthropic-ai/claude-agent-sdk@0.3.145`.
- Bundled Claude Code version reported by SDK smoke: `2.1.145`.
- SDK exports include `query`, `startup`, `listSessions`, `forkSession`, `InMemorySessionStore`, `createSdkMcpServer`, and session helpers.
- Production builds `feature-phase0-capability.202605201700`, `feature-phase0-capability.202605201718`, `feature-phase0-capability.202605201909`, and `feature-phase0-capability.202605201940` completed.
- Final verified production build `feature-phase0-capability.202605201940` completed through `npm run verify` and was deployed to the local Test Vault plugin directory.
- The SDK main package is bundled into `dist/main.js`; `import.meta.url` is rewritten to `require("url").pathToFileURL(__filename).href` so the bundled SDK's `createRequire(import.meta.url)` path works inside Obsidian's CommonJS plugin runtime.
- `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` was copied for the current macOS arm64 runtime.
- Test Vault deployment copied `main.js`, `manifest.json`, `styles.css`, and `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/`; deployed `main.js` contains `BUILD_ID=feature-phase0-capability.202605201940`.
- Test Vault bundled binary reports `2.1.145 (Claude Code)`.
- `ClaudeCodeAdapter` lazy-loads the SDK on first send, so plugin startup is not blocked by SDK import or local Claude auth state.
- Startup bootstrap registers both OpenCode and Claude Code and restores `activeBackend: "claude-code"` when saved settings request it.
- Assistant-level SDK errors such as `authentication_failed` are normalized to OpenCodian error chunks instead of plain assistant text.
- Obsidian/Electron renderer `AbortSignal` incompatibility was resolved by passing a custom `abortController` and `spawnClaudeCodeProcess`; the custom spawn omits `signal` from `child_process.spawn()` options and manually terminates on abort.
- OpenCodian persisted Claude conversations can restore their local backend session handle after Obsidian reload instead of failing with `Claude Code session not found`.
- OpenCode-only model catalog validation and OpenCode server/session sync paths are skipped for Claude conversations.
- Header action buttons are real `button[type="button"]` elements with stable `data-action`, tooltip, and `aria-label` values; the final acceptance test clicked `[data-action="new-current-tab"]` instead of falling back to a command.
- Loaded/streaming Claude conversations no longer pass `claude-code-*` session ids into OpenCode-only question/todo activation refresh paths.

## Real User Simulation Evidence

Artifacts are local `.obsidian-debug/` evidence and are not intended as committed product assets:

- Settings click simulation: `.obsidian-debug/claude-user-sim/settings-click-sim-latest.json`
- Settings screenshot: `.obsidian-debug/claude-user-sim/settings-claude-latest.png`
- Chat send simulation: `.obsidian-debug/claude-user-sim/chat-send-latest.json`
- Chat screenshot: `.obsidian-debug/claude-user-sim/chat-after-claude-latest.png`
- Final header click + send validation: `.obsidian-debug/claude-acceptance-20260520/header-click-no-opencode-todo-final-verify-result.json`
- Final UI screenshot: `.obsidian-debug/claude-acceptance-20260520/header-click-no-opencode-todo-final-verify.png`

Observed from the 19:15 Test Vault simulation:

- User path opened OpenCodian settings, navigated to General -> Agents, enabled Claude Code, selected `claude-code` in the default backend dropdown, opened the Claude Code tab, and ran runtime diagnostics.
- Settings rows reported no geometry overlaps; the runtime diagnostics result displayed `SDK bundled 进程解析`.
- The chat path configured Claude as the only enabled backend, opened a new conversation, kept the composer enabled, sent `请只回复 OK。AFTER_FIX_CLAUDE_1779275725493`, and restored the original settings in `finally`.
- Claude Code returned a real assistant response with a thinking block and final `OK`; finalization persisted the assistant message with `modelId: "glm-5-turbo"`.
- The DOM/result checks reported `authLike: false`, `sessionNotFound: false`, and `openCodeNoiseInDom: false`.
- `obsidian dev:errors vault=testvault` reported `No errors captured.`

UI review from the latest screenshots:

- Claude Code primary/secondary settings navigation is discoverable and fits the wide editor pane without text/control collision.
- Claude-specific setting rows remain compact and Obsidian-native; labels and controls do not overlap.
- Chat shows the Claude user message, thinking disclosure, final `OK`, and model metadata without an error notice.
- The reported composer geometry overlap is a parent-container/child-control intersection, not a visible occlusion in the screenshot.

Final 19:42 Test Vault acceptance on build `feature-phase0-capability.202605201940`:

- `headerButtons` contained `BUTTON` entries with stable `data-action` values (`new-current-tab`, `history`, `session-settings`, `settings`), `type="button"`, matching tooltip text, and matching `aria-label`.
- Clicking `[data-action="new-current-tab"]` created a new `backend: "claude-code"` conversation with `backendSessionId: "claude-code-..."` and `openCodeSessionId: null`.
- Sending `请只回复 OK。HEADER_AFTERFIX_1779277346872` produced a persisted assistant message `OK`.
- Runtime checks reported `sawSessionNotFound: false`, `sawModelBlock: false`, and `sawOpenCodeTodoNoiseInDom: false`.
- `obsidian dev:errors vault=testvault` reported `No errors captured.`

Repository verification:

- `npm run verify` passed with owner-guard approval, module-doc coverage/diff, graphify freshness, devlog order, lint, typecheck, 419 Jest suites / 2747 tests, and production build `feature-phase0-capability.202605201940`.

## Runtime Smoke Evidence

Smoke artifact: `.obsidian-debug/claude-code-phase1/smoke-result.json` (local evidence, not intended as a committed product artifact).

Observed from the SDK smoke:

- SDK import: ok.
- Default bundled executable resolution: ok.
- `system/init` event was emitted with cwd set to the Phase 0 worktree.
- Claude Code tools list included built-ins such as `Task`, `AskUserQuestion`, `Bash`, `Edit`, `Read`, `Write`, `WebFetch`, and `WebSearch`.
- MCP config was accepted; the smoke MCP server appeared as `opencodian_smoke` with status `pending`.
- The SDK reported `apiKeySource: "none"` and returned `authentication_failed` with `Not logged in · Please run /login`.

## Not Fully Runtime-Verified

The current machine can now return a real Claude Code assistant response through the SDK path. The following remain unverified because they require dedicated prompts, tool permission exercises, or later full-capability UI phases:

- `canUseTool` approval callbacks were not exercised by a live tool call.
- MCP tool execution was not exercised beyond config acceptance.
- Long-lived resume/fork/history persistence remains a later full-capability phase.
- Hooks, skills authoring, subagents, and full official session history import remain later phases.

## Implementation Boundary

This status is enough to expose Claude Code as an explicit, opt-in Phase 1 backend that can complete a real SDK chat turn inside Obsidian/Test Vault. It is not a claim that every Claude Code capability has runtime UI parity. Full capability rollout remains phased: persistent official session mapping, fork/resume/history, hooks, skills authoring, subagents, live tool approval UX, and richer permission UI should advance behind dedicated tests and authenticated runtime smoke.
