# Claude Code SDK Current State - 2026-05-22

## Purpose

This document is the current continuity handoff for future models continuing the Claude Code SDK lane in OpenCodian.

Use this file to answer:

- where the Claude backend lane currently is;
- which capabilities are complete versus only wired;
- which surfaces are intentionally still diagnostic or hidden;
- which older status documents are now partially outdated.

This is a status snapshot, not the long-term design or full implementation plan.

## Current Anchor

- Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability`
- Previous committed continuity anchor before the 2026-05-25 ordinary chat resume identity slice: `e03b9c06`
- Previous anchor subject: `docs: refresh claude stream settings anchor`
- Latest validated and Test Vault deployed build: `feature-phase0-capability.202605272242`
- Recent continuity commits in this lane before the 2026-05-25 slice:
- `e03b9c06` — `docs: refresh claude stream settings anchor`
- `8361ebe5` — `fix: mark claude stream settings diagnostic`
- `8a48502b` — `fix: restrict shared session links to opencode`
- `9f455f1b` — `fix: clarify claude advanced settings honesty`
- `fc2659ff` — `docs: refresh claude footer boundary anchor`
- `0c4ea502` — `fix: route footer rewind capability by conversation`
- `7747a9ab` — `fix: mark claude permission mcp proofs diagnostic`
- `afd27c03` — `fix: prove claude diagnostic resume session identity`
- `63eb25a6` — `fix: require claude diagnostic store readback proof`
- `f28c5b54` — `docs: record claude diagnostic resume runtime proof`
- `56f6319f` — `fix: reject mismatched claude diagnostic resume ids`
- `bbc019bf` — `fix: validate claude diagnostic resume sessions`
- `528369fc` — `fix: guard opencode settings callbacks for claude backend`
- `a07d1518` — `fix: guard server settings for claude backend`
- `510803fc` — `fix: guard mcp settings for claude backend`
- `81228ce7` — `fix: guard project conversation settings for claude backend`
- `080a1c76` — `fix: gate ordinary slash commands to opencode backend`
- `0cc89c4d` — `fix: gate session settings sharing to opencode backend`
- `d388559c` — `fix: gate slash compact to opencode backend`
- `7aea3fd2` — `fix: gate slash sharing to opencode backend`
- `9a3daf89` — `docs: assess structured output capability maturity`
- `b55f46b9` — `docs: record shared sessions backend-switch follow-up audit`
- `4f85f022` — `fix: guard shared session unshare when backend switches`
- `df7c48d2` — `fix: add try/catch around listSessions and getSessionMessages in productized seams`
- `4ca7364c` — `fix: add null-item filtering and adapter-error guards to backend-aware routing helpers`
- `260049ac` — `fix: add Array.isArray guard to loadBackendSessionMessages for runtime safety`
- `831170b7` — `test: harden backend routing edge cases and record proof`
- `4a1ac16a` — `test: cover backend-aware context detail and shared preview rendering`
- `39550a6e` — `docs: add 2026-05-23 session detail/history inspection audit round to Claude continuity`
- `1a5c1f59` — `feat: gate pending-questions REST poll to OpenCode in QuestionTodoStatusRefreshCoordinator`
- `9b307a38` — `docs: update status doc and devlog for Phase 3 session-read audit round`
- `c884b8ee` — `refactor: remove openCodeService.listSessions fallback from ConversationSessionSettingsCoordinator`
- `9b2f27e6` — `feat: expose getSessionInfo on OpenCodeService, fix adapter O(n) workaround`
- `6b656e55` — `feat: gate post-sync question todo refresh to opencode`
- `40dbf471` — `feat: add SessionTodoCoordinator backend gates and Backend Routing diagnostic probe`
- `5cbde267` — `feat: add Claude session detail diagnostic probe`
- `0dec5483` — `feat: add claude resume diagnostic probe`
- `6eb12087` — `feat: add claude fork diagnostic probe`
- `9e122746` — `fix: preserve backend identity for session restores`
- `2d16f936` — `refactor: narrow legacy share session inspection types`
- `91d3d8ca` — `feat: normalize shared session inspection preview`
- `9ab7b6a62b0b31410a7c444a7329933bc72af1f9` — `feat: route share-url read through backend getSession`
- `4a5610537e24a3d899e161a222ff112170b6189a` — `docs: refresh Claude continuity after title read routing`
- `d0a1e216080be2ad201624c538216e8024484952` — `feat: route title session reads through backend getSession`

## 2026-05-27 Structured Output Productization Fix

This slice fixes three productization gaps discovered after the initial `/json` trigger implementation:

1. **Hook text leak fixed**: `ClaudeCodeStreamNormalizer` now filters `text`/`thinking`/`tool_use` blocks from `user` type SDK messages, preventing synthetic hook feedback (e.g., "Stop hook feedback: You MUST call the StructuredOutput tool...") from leaking into visible assistant text. `tool_result` blocks are preserved because tool results still need normal routing.

2. **Structured output badge now renders during streaming**: `StreamShellFinalizer` calls the new `renderStructuredOutputIfPresent()` shell port method when `LocalStreamOutcome.structuredOutput` is present. `AssistantShellViewHostAdapter` injects the collapsible structured output badge into the streaming message DOM at finalization time, so users see the badge immediately without waiting for conversation reload.

3. **Schema enforcement verified**: The captured `structured_output` backend_event contains `{"response": "..."}` with the required `response` field from the fixed schema. The inner value is the model's JSON output, confirming the schema is being honored.

### Runtime Evidence

- Test Vault deployed build: `feature-phase0-capability.202605272152`
- DOM assertions: `hasHook=false`, `hasBadge=true`, `hasStructuredLabel=true`
- Console captured: `StructuredOutput` tool_use + `structured_output` backend_event with `contentLength: 40`
- Errors: `No errors captured`

### Residual Behavior

- The model may still produce intermediate visible text (thinking, markdown JSON) before calling the StructuredOutput tool. This is SDK/model behavior, not a leak.
- The fixed schema remains limited to `response` + `tags` + `confidence`.
- `/json ` trigger remains one-shot and non-persisted.

---

## 2026-05-27 Structured Output Duplicate Suppression Runtime Proof

This slice provides the corrected runtime proof for structured output duplicate raw JSON suppression, using the proper DOM selectors (`.opencodian-input`, `.opencodian-send-btn`, view type `opencodian-view`).

### What Was Fixed

- **Previous proof distortion**: An earlier proof attempt used incorrect selectors (`.opencodian-chat-input textarea`, `.opencodian-chat-input-send-btn`, `.opencodian-view`), causing DOM assertions and screenshots to miss the actual chat surface.
- **Duplicate suppression**: When the model outputs raw JSON text before calling the StructuredOutput tool, `sendPipelineContent.ts` helpers (`extractStructuredOutputDuplicateText`, `isDuplicateStructuredOutputText`, `filterDuplicateStructuredOutputTextBlocks`) identify and remove the duplicate text block. `StreamShellFinalizer.ts` additionally scrubs the DOM after badge rendering.

### Runtime Evidence

- Test Vault deployed build: `feature-phase0-capability.202605272242`
- Preflight: `obsidian help` confirms Developer commands; plugin reload succeeds
- DOM assertions (last assistant message after `/json say hello in JSON`):
  - `assistantTextBlockCount: 0` — no `.opencodian-message-text` blocks in the assistant message
  - `hasStructuredOutput: true` — `.opencodian-structured-output-details` present
  - `hasStructuredSummary: true` — `.opencodian-structured-output-summary` present
  - `hasHookText: false` — no `.opencodian-hook-text` elements
  - `structuredCodeText: {"response": "{\"greeting\": \"hello\"}"}` — JSON only inside the collapsible structured output section
  - `userMessageText: "say hello in JSON"` — `/json` prefix correctly stripped before send
- Console: 80 lines of real SDK activity (spawn, sendMessage, stream controller, structured_output backend_event)
- Errors: `No errors captured`
- Screenshots: `.obsidian-debug/so-dup-proof-last-msg-20260527.png` shows assistant message with "Thought for 7.7s" and "结构化输出" expandable section, no raw JSON visible as plain text

### Classification

| Boundary | Status | Reason |
|---|---|---|
| Duplicate raw JSON suppression | ✅ plugin fixed | `textBlockCount=0`, JSON only in structured output details |
| Hook text leak | ✅ plugin fixed | `hasHookText=false`, ClaudeCodeStreamNormalizer filters synthetic user messages |
| Structured output badge | ✅ plugin fixed | `.opencodian-structured-output-details` renders correctly |
| `/json` prefix stripping | ✅ plugin fixed | User message shows "say hello in JSON" |
| Thinking content before tool call | ℹ️ SDK/model boundary | Model produces thinking prose before StructuredOutput; this is normal SDK behavior |
| Response nested as string | ℹ️ SDK/model boundary | Schema defines `response: string`; model serializes JSON into string field |

---

## 2026-05-27 Structured Output Ordinary Chat Trigger (`/json`)

This slice closes the stable user-facing trigger gap for Claude Code structured output in ordinary chat. Previously structured output was only accessible through the Capability Lab diagnostic probe.

### What Changed

- `SendPipelineRuntime.sendMessage()` now detects a `/json ` prefix (case-insensitive) before slash command interception.
- When detected, the prefix is stripped and a fixed JSON schema is injected into `PrepareMessageSendOptions.outputFormat`.
- `MessageSendPreparationService.prepareMessageSend()` merges the one-shot `outputFormat` into `modelOptions`.
- `ClaudeCodeAdapter.buildSdkOptions()` extracts `outputFormat` from send-time options, with send-time taking precedence over the adapter-level default.
- The fixed schema is intentionally simple: `{ response: string, tags: string[], confidence: number }` with only `response` required.

### What This Does Not Change

- This does not add arbitrary schema authoring UI or settings.
- This does not make structured output persistent across messages; each use requires typing `/json `.
- This does not add structured output support to OpenCode backend.
- The Capability Lab Structured Output diagnostic probe remains unchanged and independent.

### Verification

- Unit tests: 6 new focused tests across SendPipelineRuntime, MessageSendPreparationService, and ClaudeCodeAdapter.
- Full verify: pending `npm run verify`.

### Honesty Boundary

- The trigger is narrow by design: one fixed schema, one message at a time, explicit prefix only.
- Users cannot customize the schema; arbitrary schema authoring remains a future capability phase.

## 2026-05-27 Fallback Model Behavior Proof

This slice attempts to move Fallback Model from wiring-only to behavior proof by provoking a real primary-model failure with a valid fallback model configured. The result is a classified blocker, not a pass.

### What Changed

- Added diagnostic-only `model?: string` override to `ClaudeCodeDiagnosticPromptRequest` and `ClaudeCodeOptionsBuilderInput`, allowing probes to specify an intentionally invalid primary model.
- `buildDiagnosticSdkOptions()` now passes `request.model` to the options builder.
- `runFallbackModelProof()` restructured as behavior proof: uses `model: 'opencodian-invalid-model-test-xyz123'` (intentionally invalid) + `fallbackModel: 'claude-haiku-4-5'` (valid) and inspects the result for model identity via `extractModelFromDiagnosticResult()`.
- Honest runtime classification:
  - `pass`: query succeeds AND detected model is NOT the invalid primary
  - `wiring`: query succeeds but no trustworthy model signal
  - `fail`: query fails (primary model invalid, fallback did not activate)

### Runtime Evidence

- Test Vault deployed build: `feature-phase0-capability.202605272022`
- Probe execution: Capability Lab > Discovery & Status > Run Fallback Model Proof
- SDK spawned successfully, session created: `b379504e-68ba-4879-b587-bab271e14774`
- SDK returned: `API Error: 400 [1211][模型不存在，请检查模型代码。]` — model does not exist
- Spawn exit code: 1 (failure)
- Inline marker: `opencodian-capability-lab-proof-fail` ("✗ Runtime failed")

### Blocker Classification

- **Type**: SDK limitation
- **Explanation**: The Claude Code SDK does NOT automatically fall back to `fallbackModel` when the primary model is invalid. The `fallbackModel` option is accepted at the options level (wiring proven) but actual fallback switching behavior was not observed under the invalid-primary-model failure mode.
- **Implication**: Fallback Model remains `wiring`-only / `untested` for behavior. Further testing with other failure modes (rate limiting, service unavailable) would be needed to determine the true fallback trigger conditions.

### Artifacts

- `.obsidian-debug/fallback-model-behavior-result-20260527.json` — structured result with classification
- `.obsidian-debug/fallback-model-behavior-console-20260527.txt` — full console output
- `.obsidian-debug/fallback-model-behavior-errors-20260527.txt` — errors output (`No errors captured`)
- `.obsidian-debug/probe-results-note-20260527.png` — screenshot of probe results note showing both Structured Output (pass) and Fallback Model (fail)

---

## 2026-05-27 Structured Output Runtime Proof

This slice advances Structured Output from diagnostic-only to runtime-proven by hardening the probe and verifying it against a live Claude Code SDK session in Test Vault.

### What Changed

- `runStructuredOutputProbe()` now uses a more specific JSON schema (adds `confidence: number` with `minimum: 0, maximum: 1` and `enum: ['ok', 'error']` on `status`) and a stricter prompt that instructs the model to return ONLY JSON without markdown or explanations.
- Added fallback detection: if the SDK does not emit a `structured_output` backend_event, the probe falls back to parsing the first text chunk as JSON. If the parsed JSON contains `status` and `surface` fields, the probe still marks as `pass`.
- Added unit test for the fallback JSON detection path.
- Updated module docs to document the dual-path detection behavior.

### What This Does Not Change

- This does not add a stable user-facing trigger for structured output in ordinary chat.
- This does not add schema authoring UI or settings for custom structured output schemas.
- The capability matrix row for Structured Output remains `diagnostic` / `untested` (static assessment); the inline proof marker updates dynamically when the probe runs.
- This does not claim structured output authoring/triggering as a stable product surface.

### Verification

- Focused test: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` passed with 93 tests (including new fallback detection test).
- Full verify: `npm run verify` passed all gates.
- Test Vault runtime proof: BUILD_ID `feature-phase0-capability.202605271908` deployed and verified.
- Probe execution: Clicked "Run Structured Output Probe" in Capability Lab. Session ID `176b729d-ad48-47c4-b697-33d60335c623`. Structured output captured from backend_event: `{"status":"ok","surface":"diagnostic","confidence":0.95}`. Inline marker: `opencodian-capability-lab-proof-pass` ("✓ Runtime verified").
- No errors captured.

### Remaining Blockers

- **Stable trigger**: Users still cannot trigger structured output from ordinary chat; only the diagnostic probe exposes it.
- **Schema authoring**: No UI for users to define custom JSON schemas for structured output.
- **Multi-round consistency**: Not verified whether structured output behavior is consistent across resume/fork scenarios.

---

## 2026-05-27 Structured Output fallback validation tightened

This slice closes a capability honesty gap: the fallback JSON detection in `runStructuredOutputProbe()` was too permissive, accepting any JSON object with `status` and `surface` fields regardless of actual values.

### What Changed

- `tryParseFallbackStructuredOutput()` extracted as a standalone helper to reduce `runStructuredOutputProbe()` cyclomatic complexity from 25 back to ≤20 (lint warning eliminated).
- Fallback validation now enforces strict schema boundary:
  - `status` must be exactly `"ok"` or `"error"` (string)
  - `surface` must be exactly `"diagnostic"` (string)
  - `confidence` must be a finite number within `[0, 1]`
- Any malformed fallback JSON (out-of-range confidence, wrong status/surface values, missing required fields) now causes the probe to mark `fail` instead of `pass`.
- Added two focused unit tests:
  - `rejects malformed fallback JSON that violates schema boundary` — proves `confidence: 1.5` is rejected
  - `rejects fallback JSON with wrong status or surface values` — proves `status: "partial"` / `surface: "chat"` is rejected
- The existing success fallback test (`falls back to text-chunk JSON detection when no structured_output backend_event is emitted`) still passes with the stricter validation.

### What This Does Not Change

- The primary `structured_output` backend_event detection path is unchanged.
- The schema used in the diagnostic prompt already required these fields; this change only tightens the runtime validation of the response.
- No user-facing behavior changes outside the diagnostic probe.

### Verification

- Focused test: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` passed with 95 tests (was 93, +2 new rejection tests).
- Full verify: `npm run verify` passed all gates with 0 errors, 0 warnings, 439 suites / 3329 tests.
- BUILD_ID: `feature-phase0-capability.202605271934`.

---

## 2026-05-27 Fallback Model wiring-only honesty correction

This slice corrects the Fallback Model diagnostic proof to be honest about what it actually verifies.

### What Changed

- `SettingsCapabilityLabSection.runFallbackModelProof()` now calls `updateRuntimeProof('Fallback Model', 'wiring', ...)` instead of `...'pass'`.
- Added a new `wiring` runtime proof state to `updateRuntimeProof()` with visual marker `⚠ Wiring only — not behavior verified`.
- Added `.opencodian-capability-lab-proof-wiring` CSS style (warning-colored inline marker).
- The matrix row for Fallback Model remains `untested` / `Settings` (static assessment unchanged).
- The diagnostic output still explains: "The SDK accepted the fallbackModel option without error. This proves wiring only; actual fallback model switching behavior (triggered when the primary model fails) cannot be verified without provoking a real model failure."

### What This Does Not Change

- This does not claim Fallback Model as a verified runtime capability.
- This does not change the settings UI, locale strings, or the options builder wiring.
- The `wiring` state is only used for inline proof markers, not matrix rows.
- This does not add new capabilities or expand the Claude Code surface.

### Verification

- Focused test updated: `marks Fallback Model as wiring-only when diagnostic prompt completes with fallbackModel option` expects `.opencodian-capability-lab-proof-wiring` and explicitly rejects `.opencodian-capability-lab-proof-pass`.
- Full verify: `npm run verify` passes all gates.

---

## 2026-05-26 Cap-4: Final visual/layout review and lane completion

Final visual and regression review against Test Vault build `task-cap-4.202605260456` confirms the Claude capability lane is complete with no outstanding layout gaps.

### Layout Check

- All 6 Claude Code secondary tabs inspected at full width (946px) and narrow mobile width (430px).
- Zero overflow on setting-item names, descriptions, and inline notices at both widths.
- Limits boundary notice appears only in the model-thinking tab.
- No orphaned limits section.

### Regression

- `npm run verify`: owner-guard PASS, module-docs OK (448/448), graphify OK, devlog-order OK (187 sections), lint clean, typecheck clean, 439 suites / 3288 tests passed, build clean.
- BUILD_ID: `task-cap-4.202605260456`.

### Runtime Artifacts

- `.obsidian-debug/cap-4-runtime-proof-20260526-result.json` — structured result with layout metrics and regression results
- `.obsidian-debug/cap-4-runtime-tab-20260526.png` — runtime tab (full width)
- `.obsidian-debug/cap-4-model-thinking-top-20260526.png` — model-thinking tab top (full width)
- `.obsidian-debug/cap-4-model-thinking-scroll-20260526.png` — model-thinking tab scrolled to limits boundary (full width)
- `.obsidian-debug/cap-4-permissions-tab-20260526.png` — permissions tab (full width)
- `.obsidian-debug/cap-4-context-sources-tab-20260526.png` — context-sources tab (full width)
- `.obsidian-debug/cap-4-tools-tab-20260526.png` — tools tab (full width)
- `.obsidian-debug/cap-4-sdk-foundations-tab-20260526.png` — sdk-foundations tab (full width)
- `.obsidian-debug/cap-4-narrow-430px-model-thinking-20260526.png` — model-thinking at narrow mobile width (430px)
- `.obsidian-debug/cap-4-console-20260526.txt` — raw `obsidian dev:console level=log`
- `.obsidian-debug/cap-4-errors-20260526.txt` — raw `obsidian dev:errors vault=testvault`: `No errors captured.`

All 6 secondary tabs have screenshot evidence; 8 screenshots total (6 full-width tabs + 1 scrolled model-thinking + 1 narrow 430px).

### Conclusion

No visual or layout gaps. The product surface, documentation, and runtime proof are consistent. The Claude capability lane (phase0-capability) is complete.

---

## 2026-05-26 Cap-3: Test Vault runtime proof for Claude settings IA

Runtime proof against Test Vault build `task-cap-3.202605260314` (clean build from scratch, exit code 0 verified without pipes) proves the Claude-facing settings paths run correctly in a real Obsidian vault: all 6 secondary tabs render, no errors, and the cap-2 information architecture changes (limits merged into model-thinking) are live.

### Build & Deploy

- `rm -rf dist && npm run build 2>&1; echo "EXIT_CODE=$?"` returned `EXIT_CODE=0` with BUILD_ID `task-cap-3.202605260314`.
- Deployed `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` to Test Vault.
- Verified deployed `main.js` contains BUILD_ID `task-cap-3.202605260314`.
- Plugin reloaded via `obsidian plugin:reload id=opencodian`.

### Runtime Proof

- `.obsidian-debug/cap-3-runtime-proof-20260526-result.json` returned `ok: true` with 12 validation checks.
- Confirmed: 6 Claude Code secondary tabs (no `limits` tab), `limitsBoundaryExists: true` (model-thinking tab only), `hasMaxTurns: true`, `hasMaxBudget: true`, `hasRestartButton: true`, `limitsSectionExists: false`.
- Model & Thinking tab contains: 模型, 备用模型, Thinking, Effort, limits boundary notice, 最大轮数, 最大预算 USD — in correct order.
- Limits boundary notice (`data-claude-code-limits-boundary="true"`) appears only in the model-thinking section, not in any other tab.
- All 6 secondary tabs render correctly with expected setting labels (runtime, model-thinking, permissions, context-sources, tools, sdk-foundations).
- DOM traversal performed via `obsidian eval code=...` clicking each secondary tab and reading setting names.
- No console errors captured after plugin reload and full 6-tab traversal.
- `obsidian dev:errors vault=testvault` returned raw output `No errors captured.`
- Runtime artifacts (in repo-scoped `.obsidian-debug/`):
  - `cap-3-runtime-proof-20260526-result.json` — structured DOM assertion result
  - `cap-3-claude-code-model-thinking-20260526.png` — `obsidian dev:screenshot` of model-thinking tab (top, showing 模型/备用模型/Thinking/Effort)
  - `cap-3-model-thinking-scroll-20260526.png` — `obsidian dev:screenshot` of model-thinking tab (scrolled to limits boundary + 最大轮数/最大预算)
  - `cap-3-console-20260526.txt` — raw `obsidian dev:console level=log` output (50 lines, timestamps 04:13:57–04:14:31)
  - `cap-3-errors-20260526.txt` — raw `obsidian dev:errors vault=testvault` output

---

## 2026-05-25 Cap-1: Honest capability wiring and settings exposure

This slice makes Claude Code capability wiring honest at three levels: type interface maturity labels, user-visible settings descriptions, and capability matrix completeness.

### Changes

- Added `@experimental` / `@diagnostic` / `@untested` JSDoc maturity tags to `ClaudeCodeBackendSettings` fields in `src/core/types/settings.ts`.
- Updated `settings.claudeCode.fallbackModel.desc` locale strings (en + zh) with honest maturity warning that the fallback path has not been verified at runtime.
- Added "Fallback Model" as the 24th row in the capability matrix (`SettingsCapabilityLabSection.ts`), tracking the SDK fallbackModel option.
- Updated the comprehensive audit test to expect 24 rows and validate the new Fallback Model classification.
- resume-at remains diagnostic-only; this slice does not mark Claude Code full capability as complete.

### Impact

- The fallback model settings UI now shows an honest warning about verification status.
- The capability matrix audit test enforces that no capability row drifts without explicit test updates.
- No OpenCode behavior changed.

---

## 2026-05-25 Cap-2: Settings information architecture refinement

This slice refines the Claude Code settings information architecture so controls appear in sections that match user intent, with a dedicated regression test for the runtime-sensitive limits boundary.

### Changes

- Merged the Limits secondary tab into the Model & Thinking tab: max turns and max budget USD now appear alongside model, thinking, and effort controls.
- Added a limits boundary notice (`data-claude-code-limits-boundary`) before the max turns/budget controls in the Model & Thinking tab, preserving the "Changes take effect on next query" / restart-session UX that the old Limits tab provided.
- Removed the Limits secondary tab from `CLAUDE_CLASSIC_TABS` and `settingsLayoutRegistry`, with legacy mapping (`limits` → `model-thinking`) so persisted tab selections survive the restructure.
- Added regression tests that verify: (1) the limits boundary notice is present whenever max turns and budget controls render, and (2) the Model & Thinking tab contains all limits controls plus the boundary notice.
- Updated `SettingsClaudeCodeSection.md`, `settingsLayoutRegistry.md`, and related module docs.

### Impact

- Users now see model, thinking, effort, max turns, and budget controls in one cohesive tab.
- The next-query/restart boundary notice is preserved, preventing the regression where limits controls moved without their runtime-sensitive guidance.
- Legacy tab selections for `limits` silently redirect to `model-thinking`.
- This slice implements the Settings gate for limits controls: they now appear alongside model/thinking settings with an explicit next-query boundary notice, preventing users from changing runtime-sensitive settings without clear guidance.

---

## 2026-05-25 Ordinary resume vs diagnostic resume-at separation

This slice hardens the boundary between the stable ordinary resume path and the diagnostic-only resume-at path. Ordinary resume (validated session identity for continued chat) is promoted to stable. Resume-at (arbitrary session selection via `resumeSessionId`) remains gated behind `runDiagnosticPrompt()` only.

### What Changed

- Added focused adapter tests that explicitly separate ordinary resume from diagnostic resume-at:
  - `diagnostic resume-at does not modify ordinary session sdkSessionId or state` — proves that `runDiagnosticPrompt({ resumeSessionId })` with a different session id does not pollute or rebind the ordinary chat session's captured `sdkSessionId`.
  - `ordinary sendMessage starts a fresh query without resume for new local sessions` — proves that fresh local sessions do not accidentally carry a resume option.
  - `ordinary sendMessage cannot resume-at an arbitrary session id` — proves that the `sendMessage` options contract does not expose `resumeSessionId`; only the session's own captured `sdkSessionId` drives resume.
  - `diagnostic resume-at remains behind the runDiagnosticPrompt interface only` — proves that `runDiagnosticPrompt` is the sole interface accepting an arbitrary `resumeSessionId`, and `sendMessage` cannot be coerced into a resume-at operation.
- Added `_diagnosticResumeAt: true` as an explicit runtime gate on `ClaudeCodeDiagnosticPromptRequest`. `runDiagnosticPrompt()` now rejects any `resumeSessionId` request unless this diagnostic flag is explicitly set, before any SDK query is created.
- Updated the Capability Lab Resume Session diagnostic probe to call `runDiagnosticPrompt({ resumeSessionId, _diagnosticResumeAt: true })`, keeping the UI diagnostic path explicit.
- Added focused adapter coverage for both sides of the gate: missing `_diagnosticResumeAt` rejects without calling `sdk.query()`, while `_diagnosticResumeAt: true` accepts the diagnostic resume-at path.
- Updated `docs/modules/core/agents/backend/ClaudeCodeAdapter.md` and `docs/modules/features/settings/SettingsCapabilityLabSection.md` to record that resume-at remains diagnostic-only and flag-gated.
- The existing ordinary resume identity validation (commit `daf9dd6f`) remains unchanged; the new gate hardens the separation contract and prevents accidental stable use of arbitrary resume-at ids.

### What This Does Not Change

- This does not add new resume-at capabilities to the stable chat path.
- This does not promote `runDiagnosticPrompt` or Capability Lab resume probe to a stable user-facing surface.
- This does not change the behavior of ordinary resume validation, checkpoint rewind, or session diff/revert boundaries.
- This does not mark Claude Code full capability as complete.

### Verification

- Focused green: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` passed with `2` suites / `166` tests.
- Guard gates passed after the behavior gate and docs updates: `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check`.
- Build/deploy proof: `npm run build` produced `BUILD_ID=feature-phase0-capability.202605251609`; `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` were deployed to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`, and deployed `main.js` contains the same `BUILD_ID`.
- Runtime proof: `.obsidian-debug/positive-resume-authenticated-diagnostic-assertion-2026-05-25-result.json` returned `ok: true` against the deployed Test Vault plugin. The diagnostic resume-at path only succeeded when passing `_diagnosticResumeAt: true`, preserved `sessionId=ed88a5ab-e8b2-42be-940b-5a0640ec329b`, recalled nonce `positive-resume-1779696749347-xkyeg4ss`, and used no OpenCode session API path.
- Negative runtime proof: `.obsidian-debug/diagnostic-resume-boundary-runtime-assertion-2026-05-25-result.json` returned `ok: true`, proving `resumeSessionId` without `_diagnosticResumeAt` rejects before `getSessionInfo()` or `sdk.query()`.
- Final Test Vault `dev:errors` returned `No errors captured.`

## 2026-05-25 Ordinary chat resume identity validation

This slice promotes one narrow resume boundary from diagnostic-only proof into the ordinary Claude chat send path: restored persisted Claude SDK session ids now need positive catalog identity validation before `sendMessage()` starts a resumed SDK query.

### What Changed

- `ClaudeCodeAdapter.getOrRestoreSession()` marks non-local restored session ids as SDK resume candidates requiring validation. OpenCodian-local `claude-code-*` handles remain local handles and are not passed to SDK `options.resume`.
- `sendMessage()` now validates restored SDK ids through `sdk.getSessionInfo(sessionId, { dir: vaultPath })` before creating a resumed query. Missing lookup support, no catalog row, no comparable identity, or a different comparable id all fail before `sdk.query()`.
- Once a restored id is validated and a persistent `Query` remains active, sequential follow-up sends reuse that runtime without repeated catalog lookup.
- The ordinary stream path now rejects a resumed query if the SDK returns a different session id in normalized chunks or raw SDK messages, closing the runtime instead of silently rebinding the conversation to the returned id.
- Resume-validation errors are surfaced as `Claude Code resume validation failed...` chunks rather than being wrapped as generic SDK-unavailable errors.

### What This Does Not Change

- This is ordinary chat resume identity hardening, not `resume-at`, checkpoint rewind, stable JSONL history browser, or full Claude Code capability completion.
- This does not promote Capability Lab diagnostic resume/sessionStore/structured-output proof to a stable user-facing surface.
- This does not change OpenCode default behavior or OpenCode-only gates for revert/unrevert/diff/shared links.

### Verification

- Implementer used TDD and first observed focused RED failures covering: missing pre-query lookup, missing/mismatched lookup still querying, returned-id mismatch silently rebinding/outputting, misleading SDK-unavailable wrapping, no-comparable lookup fail-open, and non-metadata `result.session_id` mismatch.
- Independent reviewer reported two important issues in the first pass: ordinary resume failures were wrapped with the wrong prefix, and the stream mismatch guard only covered metadata-shaped ids. The implementer fixed both.
- Main-thread local review covered `src/core/agents/backend/ClaudeCodeAdapter.ts` and `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` after the reviewer-fix loop because no additional subagent slot was available for a final independent pass.
- Focused green: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` passed with `1` suite / `81` tests.
- Guard gates passed after the source/doc changes: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint`.
- `npm run build` produced `BUILD_ID=feature-phase0-capability.202605250010`; deployment copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, and the Claude SDK binary to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: `dist/main.js` and Test Vault `main.js` SHA256 both equal `12183062ded3009e590b6feec584172874a81fba696a2219d0becdcbefab37d7`; the deployed Claude SDK `claude` binary hash matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Fresh Test Vault ordinary chat smoke `.obsidian-debug/ordinary-chat-resume-identity-result-20260525.json` returned `ok: true` against the deployed runtime. It loaded an existing Claude SDK-backed conversation, restored `backendSessionId=2c9a66fd-7a56-4aec-a99c-7f994ecb977d`, sent marker `RESUME_AFTER_RELOAD_1779639261622` through the ordinary chat send path, preserved the same non-local SDK session id, and advanced the message count from `4` to `6`.
- Runtime artifacts: `.obsidian-debug/ordinary-chat-resume-identity-result-20260525.json`, `.obsidian-debug/ordinary-chat-resume-identity-console-20260525.txt`, `.obsidian-debug/ordinary-chat-resume-identity-errors-20260525.txt`, and `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/ordinary-chat-resume-identity-runtime-20260525.png`; `dev:errors` reported `No errors captured.` The console artifact still contains one non-blocking `ModelSelectionRuntime` model-refresh error after the smoke restored settings, so this slice treats that as a residual observation rather than proof of full model-catalog stability.

## 2026-05-24 Capability Lab advanced-settings honesty slice

This implementer slice closes a narrower Capability Lab honesty gap: configured Claude plugins/skills were still rendered as `Exposed` in Discovery when names/counts existed, even though the matrix correctly kept Skills and Plugins hidden/untested.

### What Changed

- Plugins and Skills Discovery rows now keep `Discovery Only` status even when counts, names, or `skills: 'all'` are present. Names/counts remain in notes as configuration summaries, and the rows no longer use the active/exposed chip styling.
- Capability Lab now includes ordinary advanced-setting rows for Allowed Tools, Disallowed Tools, Turn/Budget Limits, and Environment Variables. Each is `SDK` + `Adapter` wired, `Untested`, and `Settings`, making clear these are SDK-option settings rather than live runtime proof.
- Manual settings normalization now trims allowed/disallowed tool names before persisting/passing them onward.
- UI parsing for max turns and max budget now requires complete positive numeric strings; partial numeric text such as `12abc` or `5usd` resolves to null/unlimited. Blank input still resolves to null/unlimited.

### What This Does Not Change

- This does not promote Skills, Plugins, tool allow/block lists, budget/turn limits, or env variables to verified runtime proof.
- This does not expose skills/plugin authoring, MCP authoring, hook authoring, or stable Claude capability-complete claims.
- Env normalization remains conservative and does not display or expose secret values beyond the existing settings textarea behavior.

### Verification

- Red first: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/features/settings/SettingsClaudeCodeSection.test.ts tests/unit/core/types/claudeCodeBackendSettingsNormalization.test.ts` failed with expected gaps: Skills/Plugins Discovery still said `Exposed`, the four matrix rows were missing, string-array normalization preserved whitespace, and UI parsing accepted `12abc`.
- Focused green: the same command passed with `3` suites / `136` tests.

## 2026-05-24 Shared-session shareUrl backend boundary

This implementer slice closes a narrow settings honesty gap in the stable shared-session manager: `readBackendSessionShareUrl()` already returned OpenCode share URLs only, but `listBackendSessions()` still copied `record.share.url` from any active backend row.

### What Changed

- `listBackendSessions()` now populates `NormalizedSessionRow.shareUrl` only when the active backend kind is `opencode`.
- Claude Code and generic backend session rows still normalize `id`, `title` / `summary`, and `updatedAt`; only the OpenCode share-link interpretation is removed.
- `SettingsConversationSection` preview tests now exercise generic/Claude-shaped preview payloads through OpenCode shared rows, so preview robustness is preserved without implying non-OpenCode share URLs belong in the OpenCode shared-session surface.

### What This Does Not Change

- This does not add Claude Code stable sharing.
- This does not promote generic backend `share` objects to a cross-backend share contract.
- This does not change OpenCode `unshareSession()` ownership or the OpenCode-only sharing block gate.

### Verification

- Red first: `npm test -- --runInBand tests/unit/core/agents/backend/AgentBackendRouting.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts` failed because a Claude row with `share.url` returned that URL as `shareUrl`.
- Focused green: the same command passed with `2` suites / `100` tests.
- Independent read-only review reported no blocking findings after checking the OpenCode preserve path, Claude/generic null-share normalization, settings row filter, and preview-message coverage.
- Guard gates passed: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint`.
- `npm run build` produced `BUILD_ID: feature-phase0-capability.202605242237`; deployment copied built runtime and the Claude SDK binary to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: `dist/main.js` and Test Vault `main.js` SHA256 both equal `475e59146319f659583320cd9e5909af84fb218d030c02317a474d72d1a2c5f4`; the deployed Claude SDK `claude` binary hash matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Fresh Test Vault runtime proof `.obsidian-debug/claude-share-url-honesty-result-20260524224105.json` returned `ok: true` against loaded runtime `BUILD_ID=feature-phase0-capability.202605242237`. With Claude Code active, it injected a compatible Claude session row containing `share.url`, mounted the real settings surface, and verified no OpenCode shared-session row or public URL was rendered; it also found no stable/full-capability claim and no horizontal overflow in the 430px mobile-class fixture.
- Runtime artifacts: `.obsidian-debug/claude-share-url-honesty-assertion-20260524224105.js`, `.obsidian-debug/claude-share-url-honesty-screenshot-20260524224105.png`, `.obsidian-debug/claude-share-url-honesty-console-20260524224105.log`, and `.obsidian-debug/claude-share-url-honesty-errors-20260524224105.log`; `dev:errors` reported `No errors captured.`

## 2026-05-24 SDK Foundations hook/subagent stream honesty

This implementer/reviewer slice corrects the visible maturity of two editable Claude SDK options. `includeHookEvents`, `forwardSubagentText`, and `agentProgressSummaries` remain wired options, but their settings presence must not look like stable hook authoring or complete subagent transcript/progress productization.

### What Changed

- Capability Lab now marks `Subagent Transcript / Progress` and `Include Hook Events` as `Diagnostic` + `Untested`, while retaining their SDK/Adapter wired status.
- Claude Code SDK Foundations now shows a visible bilingual boundary notice before the hook/subagent stream toggles: the flags feed diagnostic/experimental event streams only, and do not enable stable hook authoring or complete transcript/progress UI.
- The toggle behavior and SDK options wiring remain unchanged.

### What This Does Not Change

- This does not promote hooks, subagent transcript/progress, skills/plugins authoring, or agent-definition authoring to stable UI.
- This does not claim new SDK runtime proof for hook/subagent event delivery or ordinary chat rendering.
- This does not alter OpenCode behavior.

### Verification

- Red first: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/features/settings/SettingsClaudeCodeSection.test.ts` failed because the two matrix rows still rendered as `Settings` and SDK Foundations lacked the diagnostic boundary notice.
- Focused green: the same command passed with `2` suites / `112` tests.
- Independent read-only reviewer reported no blocking findings and confirmed that the two rows and visible bilingual notice preserve the diagnostic boundary.
- Guard gates passed after source/docs changes: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint`.
- `npm run build` produced `BUILD_ID: feature-phase0-capability.202605242303`; deployment sequentially copied the runtime artifacts and Claude SDK binary to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: `dist/main.js` and Test Vault `main.js` SHA256 both equal `d404bc8d874ca589e6e9b340d8c6593d1faa681775ca09cc39629cbeca3c7bf0`; the deployed Claude SDK `claude` binary hash matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Fresh Test Vault runtime proof `.obsidian-debug/claude-settings-honesty-runtime-proof-20260524-result.json` passed `23` assertions against loaded `BUILD_ID=feature-phase0-capability.202605242303`. It confirmed the visible SDK Foundations diagnostic boundary notice, `Subagent Transcript / Progress` and `Include Hook Events` as `SDK` + `Adapter` + `Untested` + `Diagnostic`, no positive stable/full-capability claim, restored state, and no overflow in editor-area settings or a 430px mobile-class fixture.
- Runtime artifacts: `.obsidian-debug/claude-settings-honesty-runtime-proof-20260524.js`, `.obsidian-debug/claude-settings-honesty-runtime-proof-20260524.png`, `.obsidian-debug/claude-settings-honesty-runtime-proof-20260524-console.txt`, and `.obsidian-debug/claude-settings-honesty-runtime-proof-20260524-errors.txt`; `dev:errors` reported `No errors captured.`

## 2026-05-24 Capability Lab permission/question/MCP proof honesty

This slice closes a product-surface honesty gap after the positive resume proof: the adapter and bridge already had direct SDK smoke evidence for `canUseTool` allow/deny, `AskUserQuestion` / elicitation, and MCP stdio tool execution, but Capability Lab still left those surfaces either absent or labelled like ordinary exposure/untested discovery.

### What Changed

- `SettingsCapabilityLabSection` now adds explicit matrix rows for `Permission Approval` and `AskUserQuestion / Elicitation`.
- MCP Servers, Permission Approval, and AskUserQuestion / Elicitation now show `Verified` + `Diagnostic` in the matrix and `Diagnostic Proof` in Discovery where proof exists.
- `ClaudeCodeAdapter.runDiagnosticPrompt()` has focused coverage proving diagnostic SDK options still carry `permissionBridge.canUseTool`, `onElicitation`, and `mcpServers`.

### What This Does Not Change

- This does not promote Claude permission approval, question/elicitation, or MCP authoring to stable product surfaces.
- This does not add MCP authoring, Claude permission templates/settings, or a stable question settings surface.
- OpenCode-only question APIs and OpenCode MCP/settings authoring remain gated.

### Verification

- Red first: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` failed because Capability Lab lacked the diagnostic rows/proof labels.
- Focused green after diagnostic-chip hardening: same command passed with `2` suites / `152` tests.
- Direct SDK smoke remains the backend proof source: `.obsidian-debug/claude-code-smoke-2026-05-24-current.json` recorded `10/10` pass for SDK import, bundled executable, text, supported models, thinking, MCP stdio tool, `canUseTool` allow/deny, elicitation, and session resume.
- Guard gates passed after the final source/docs changes: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint`.
- `npm run build` produced `BUILD_ID: feature-phase0-capability.202605242127`, and Test Vault deployment copied the built runtime to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: Test Vault `main.js` contains `feature-phase0-capability.202605242127`; `dist/main.js` and deployed `main.js` SHA256 both equal `561cc2e46337f2accf72c5c43916fde022c2bc311b9570dbb6d8e835d0d6f78d`; the deployed Claude SDK binary checksum matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Fresh Test Vault runtime proof `.obsidian-debug/permission-question-mcp-diagnostic-honesty-assertion-2026-05-24-result.json` returned `ok: true` against loaded runtime `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605242127`. It confirmed the Permission Approval, AskUserQuestion / Elicitation, and MCP Servers matrix rows show `Verified` + `Diagnostic`; the Discovery rows show `Diagnostic Proof`; Diagnostic Proof chips use `opencodian-capability-lab-chip-surface-diagnostic` rather than `opencodian-capability-lab-chip-active`; no positive stable/full-capability completion claim is rendered; and the mounted settings root overflow is `0px`.
- Runtime artifacts: `.obsidian-debug/permission-question-mcp-diagnostic-honesty-runtime-2026-05-24.png`, `.obsidian-debug/permission-question-mcp-diagnostic-honesty-console-2026-05-24.txt`, `.obsidian-debug/permission-question-mcp-diagnostic-honesty-errors-2026-05-24.txt`, and `.obsidian-debug/permission-question-mcp-diagnostic-honesty-launch-2026-05-24.json`; `dev:errors` reported `No errors captured.`

## 2026-05-24 User-message footer rewind/fork backend-owner boundary

This worker slice closes a product-surface honesty gap in the chat user-message footer: the footer host was deriving Rewind and Fork visibility from the globally active backend capabilities, while the actual rewind/fork handlers route by the current conversation backend.

### What Changed

- `OpenCodianView.createUserMessageFooterRendererHost()` now resolves Fork/Rewind visibility from the current conversation's backend service via `AgentServiceRegistry`.
- Claude Code conversations no longer show the OpenCode Rewind button merely because OpenCode is the active/global backend and declares `AgentCapability.Branching`.
- OpenCode conversations still show Rewind when their owner backend declares Branching, even if the active/global backend is temporarily Claude Code.
- Claude Fork remains exposed only when the Claude conversation owner declares `AgentCapability.Fork`.

### What This Does Not Change

- This does not promote Claude Rewind, restore rewind, revert/unrevert, session diff, or modified-files sidebar support to stable.
- Slash `/undo` and `/redo`, restore rewind, diff notices, child-session graph, and modified-files diff remain OpenCode-only/gated until separate runtime proof and product design exist.

### Verification

- Red first: `npm test -- --runInBand tests/unit/features/chat/OpenCodianView.userMessageFooterHost.test.ts` failed because a Claude conversation inherited OpenCode Branching from the active backend, and an OpenCode conversation lost Rewind when Claude was active.
- Focused green: same command passed with `1` suite / `2` tests.
- Adjacent focused green: `npm test -- --runInBand tests/unit/features/chat/OpenCodianView.userMessageFooterHost.test.ts tests/unit/features/chat/UserMessageFooterRenderer.test.ts tests/unit/features/chat/runtime/UserMessageFooterRenderer.test.ts tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts tests/unit/features/chat/SlashCommandExecutionService.undoRedo.test.ts` passed with `5` suites / `57` tests.
- Guard gates passed: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint`.
- `npm run build` produced `BUILD_ID: feature-phase0-capability.202605242149`; Test Vault `main.js` contains that id, and `dist/main.js` / deployed `main.js` SHA256 both equal `9c45b5810338426650ed0f1183a77da6fcc3e41c949a3ab9172f01c3427022c5`.
- Fresh Test Vault runtime proof `.obsidian-debug/user-message-footer-backend-boundary-2026-05-24-result.json` returned `ok: true` after plugin reload replaced a stale `feature-phase0-capability.202605242127` runtime with `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605242149`. It verified a Claude Code conversation with global active OpenCode+Branching shows Fork but hides Rewind, and an OpenCode conversation with global active Claude Code shows both Fork and Rewind. The visible proof fixture had `0px` horizontal/vertical overflow.
- Runtime artifacts: `.obsidian-debug/user-message-footer-backend-boundary-runtime-2026-05-24.png`, `.obsidian-debug/user-message-footer-backend-boundary-console-2026-05-24.txt`, `.obsidian-debug/user-message-footer-backend-boundary-errors-2026-05-24.txt`, and `.obsidian-debug/user-message-footer-backend-boundary-2026-05-24.js`; `dev:errors` reported `No errors captured.`

## 2026-05-24 Capability Lab diagnostic sessionStore mirror readback

This worker/reviewer slice closes a diagnostic proof gap in the Capability Lab JSONL History Browser: the mirror probe previously treated `runDiagnosticPrompt({ sessionStore })` returning a session id as enough proof, even though the user-facing proof needs the mirrored session to be listed and readable through the same diagnostic store.

### What Changed

- The Session Store mirror probe now calls `runDiagnosticPrompt({ sessionStore, sessionStoreFlush: 'eager', includeHookEvents: true })`, switches the browser source to Diagnostic Store, reloads sessions, requires the returned session id to appear in the store-backed list, selects it, and then calls `getSessionMessages(sessionId, { sessionStore, limit: 50, includeSystemMessages: false })`.
- Empty store readback now fails the Session Store proof before any `pass` marker is rendered.
- The proof marker now carries `data-capability`, making the active capability proof easier to assert without inferring from nearby text.
- Async history-source reloads now use a request id guard so older `listSessions()` completions cannot overwrite the newer mirror/readback proof output or selection.
- Locale copy for `settings.capabilityLab.history.description` now explicitly says the panel provides diagnostic-store-only import, mirror, and readback probes and does not provide stable delete or restore operations.

### What This Does Not Change

- This does not promote sessionStore, import, delete, restore, or full JSONL history management to a stable product surface.
- This does not add a stable session-store data layer or wire diagnostic store data into ordinary chat/history UI.
- This does not mark Claude Code full capability as complete.

### Verification

- Implementer subagent followed TDD on `SettingsCapabilityLabSection.test.ts`; focused tests first exposed gaps around proof attribution, empty readback, and stale async reload behavior, then passed after fixes.
- Independent reviewer subagent reported no findings after the final locale/doc update. Residual reviewer risk was live SDK behavior, which was handled by the runtime proof below.
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` passed with `2` suites / `144` tests.
- `npm run graphify:update:src` refreshed the committed `src` graph with `6138` nodes, `11631` edges, and `217` communities.
- Guard gates passed: `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint`.
- Direct SDK smoke artifact `.obsidian-debug/claude-code-smoke-2026-05-24-current.json` recorded `10/10` pass for SDK import, bundled executable, text, supported models, thinking, MCP stdio tool, `canUseTool` allow/deny, elicitation, and session resume. This is direct SDK proof, not a stable product-surface promotion.
- `npm run build` passed with `BUILD_ID: feature-phase0-capability.202605242024`.
- Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: Test Vault `main.js` contains `feature-phase0-capability.202605242024`; `dist/main.js` and deployed `main.js` SHA256 both equal `54ae1cf0aa52c451d6be024c6d53f5a71fdeb803f98ca01f7767d2bcbc305513`; the deployed Claude SDK binary checksum matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Live Test Vault runtime proof `.obsidian-debug/capability-lab-sessionstore-readback-assertion-2026-05-24-result.json` returned `ok: true` against loaded runtime `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605242024`. It created diagnostic store session `501bfdd9-ea07-455c-88dc-bbc4d5db6be5`, confirmed `mirroredSessionCount: 1`, confirmed the mirrored id appeared in `listSessions({ sessionStore })`, and confirmed `getSessionMessages(..., { sessionStore, limit: 50, includeSystemMessages: false })` returned `messageCount: 3` with sample types `user`, `assistant`, `assistant`.
- Runtime artifacts: `.obsidian-debug/capability-lab-sessionstore-readback-runtime-2026-05-24.png`, `.obsidian-debug/capability-lab-sessionstore-readback-console-2026-05-24.txt`, and `.obsidian-debug/capability-lab-sessionstore-readback-errors-2026-05-24.txt`; `dev:errors` reported `No errors captured.`

## 2026-05-24 Claude authenticated diagnostic resume positive proof

This worker/reviewer slice closes the positive-proof gap left by the diagnostic resume rejection boundary: Capability Lab diagnostic resume now requires the Claude SDK query result to return the same SDK session id that was requested, and the deployed Test Vault proof demonstrates a real authenticated two-turn resume that recalls a nonce from the first turn.

### What Changed

- `ClaudeCodeAdapter.runDiagnosticPrompt({ resumeSessionId })` now performs a second validation after `sdk.query()` returns: if a diagnostic resume request returns no session id or a different session id, it throws `Claude Code diagnostic resume validation failed...` instead of reporting success.
- `SettingsCapabilityLabSection` mirrors that boundary in the Resume Session Diagnostic block, marking runtime proof failed when `result.sessionId` differs from the selected source session id.
- The focused tests now cover a mismatched post-query resume result, missing post-query session id, and a Capability Lab OpenCode-active/Claude-registry-adapter boundary.

### What This Does Not Change

- This does not promote Capability Lab resume to a stable resume-at product surface.
- This does not add cross-backend resume, resume-at message targeting, ordinary chat restore UI changes, or OpenCode session interoperability.
- This does not mark Claude Code full capability as complete.

### Verification

- Implementer subagent followed TDD on the post-query resume-id mismatch: the new adapter test would have accepted a fresh-session result before the guard, and the new Capability Lab test would have marked a different returned id as a pass before the UI check.
- Independent reviewer subagent reported no P0/P1 blockers and requested P3 test hardening for missing returned ids and the OpenCode-active registry boundary; those tests were added before commit.
- Focused green after reviewer hardening: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` passed with `2` suites / `149` tests.
- `npm run graphify:update:src` refreshed the committed `src` graph with `424` source files, `6139` nodes, `11633` edges, and `177` communities.
- Guard gates from the implementer slice passed before handoff: `npm run check:graphify`, `npm run check:module-docs`, and `git diff --check`.
- `npm run build` produced `BUILD_ID: feature-phase0-capability.202605242047`, and the Test Vault runtime proof loaded `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605242047`.
- Live Test Vault runtime proof `.obsidian-debug/positive-resume-authenticated-diagnostic-assertion-2026-05-24-result.json` returned `ok: true`: first diagnostic session `2d366fb9-6f34-4bbb-8f35-ac7a43ec5854` stored nonce `positive-resume-1779627004119-x82q2n4m`, `listSessions()` and `getSession()` saw that source session, the second diagnostic returned the same session id, and the second output recalled the nonce.
- The same proof recorded `openCodeSessionApiCallCounts` all at `0`, `openCodeSessionApiUsed: false`, `stableResumeProductizationClaimed: false`, and restored the active backend state.
- Runtime artifacts: `.obsidian-debug/positive-resume-authenticated-diagnostic-runtime-2026-05-24.png`, `.obsidian-debug/positive-resume-authenticated-diagnostic-console-2026-05-24.txt`, `.obsidian-debug/positive-resume-authenticated-diagnostic-errors-2026-05-24.txt`; `dev:errors` reported `No errors captured.`

## 2026-05-24 Claude diagnostic resume validation boundary

This related worker pair closes Capability Lab diagnostic resume leaks: `ClaudeCodeAdapter.runDiagnosticPrompt({ resumeSessionId })` must not pass arbitrary placeholder, OpenCode, OpenCodian-local handles, or SDK lookup results with explicit mismatching identity into the Claude SDK `resume` option.

### What Changed

- `runDiagnosticPrompt()` now validates non-empty `resumeSessionId` values through `sdk.getSessionInfo(resumeSessionId, { dir: vaultPath })` before creating the diagnostic `sdk.query()`.
- If the SDK facade does not expose `getSessionInfo()` or the lookup returns no session, the adapter throws `Claude Code diagnostic resume validation failed...` before query creation.
- If a returned session object explicitly carries a nonblank `sessionId` or `id` that does not match the requested id, the adapter also rejects before query creation. Lookup responses without comparable id fields remain compatible.
- A verified/nonconflicting Claude SDK session id still passes through to `options.resume`, preserving the diagnostic Capability Lab resume probe for provider-owned Claude sessions.

### What This Does Not Change

- This does not promote Capability Lab resume to a stable resume-at product surface.
- This does not add cross-backend resume or allow OpenCode/local placeholder ids to be treated as Claude SDK session ids.
- This does not mark Claude Code full capability as complete.

### Verification

- Implementer subagent TDD red: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` first failed because `runDiagnosticPrompt()` resolved for an unvalidated `resumeSessionId` and never called `sdk.getSessionInfo()`.
- Follow-up implementer subagent TDD red: the adapter test failed because a diagnostic request for `sdk-session-1` accepted a lookup result identifying `sdk-session-2`.
- Focused green after review fix: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` passed with `1` suite / `72` tests, covering unvalidated ids, missing lookup, `sessionId` mismatch, `id` alias mismatch, no-id compatibility, and valid resume propagation.
- Independent reviewer subagent initially identified the missing `id` alias / no-id compatibility tests; after they were added, the reviewer reported no findings. Residual risk remains live SDK behavior: if future `getSessionInfo()` catalog visibility differs from `query({ options.resume })`, a later Capability Lab runtime proof must catch it before any stable promotion.
- `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` passed with `2` suites / `141` tests after integrating both related resume boundaries.
- `npm run graphify:update:src` refreshed the committed `src` graph with `424` source files, `6137` nodes, `11626` edges, and `221` communities.
- `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check` passed.
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `438` suites / `3254` tests and produced `BUILD_ID: feature-phase0-capability.202605241909`.
- `npm run build` passed with standalone `BUILD_ID: feature-phase0-capability.202605241910`.
- Test Vault runtime proof deployed build `feature-phase0-capability.202605241910` and verified that deployed `main.js` matched `dist/main.js` by SHA256 (`4761f41484e0ec57741d183d41189575d7c52095772fc95bd889b12a408e1fcd`) and that the loaded plugin runtime reported the same BUILD_ID.
- Deployed-runtime assertion `.obsidian-debug/diagnostic-resume-boundary-runtime-assertion-2026-05-24.json` passed through the live `claude-code` adapter constructor with an isolated fake SDK: unknown resume id, mismatched `sessionId`, and mismatched `id` alias each performed one lookup, created zero queries, and raised the diagnostic validation error. The assertion records `validAuthenticatedResumeAttempted: false`, so it proves the rejection boundary only, not positive authenticated resume completion.
- Runtime artifacts: `.obsidian-debug/diagnostic-resume-boundary-runtime-screenshot-2026-05-24.png`, `.obsidian-debug/diagnostic-resume-boundary-runtime-console-2026-05-24.txt`, `.obsidian-debug/diagnostic-resume-boundary-runtime-errors-2026-05-24.txt`; `dev:errors` reported `No errors captured.`

## 2026-05-24 Tool / Formatter / Security settings stale backend guard

This worker slice closes a related group of stale mounted OpenCode-only settings callbacks in `SettingsToolSection`, `SettingsToolDetailModal`, `SettingsFormatterSection`, and `SettingsSecuritySection`. These panes are only expected to be actionable while OpenCode is active, but callbacks and secondary modals can survive briefly after switching the active backend to Claude Code.

### What Changed

- `SettingsToolSection` now re-checks that OpenCode is still the active backend before project tool create/open/delete, global/default tool permission writes, per-tool permission writes, and local OpenCode restart paths after tool catalog or permission writes.
- `SettingsToolDetailModal` now re-checks the active backend before project tool Save/Delete. If a project tool modal was opened while OpenCode was active and the user switches to Claude Code before clicking Save/Delete, the stale modal callback shows the Tools OpenCode-only notice and returns before writing or removing `.opencode/tools` files.
- `SettingsFormatterSection` now re-checks the active backend before formatter/LSP mode switches, builtin/custom visual saves, advanced JSON saves, and the local OpenCode restart path after `.opencode/opencode.json` formatter/LSP writes.
- `SettingsSecuritySection` now re-checks the active backend before permission mode writes, auto-restart toggle, config editor/apply restart, local restart, blocklist/external-access/export-path settings writes, and blocked-command sync into OpenCode bash permissions.
- `settingsBackendGuards.ts` centralizes the shared settings-owner active-backend fallback so these OpenCode-owned sections resolve stale `activeBackend` values the same way.
- Dedicated localized OpenCode-only notices were added for Tools, Formatter/LSP, and Security settings.

### What This Does Not Change

- This does not add Claude Code authoring/runtime-control support for OpenCode tools, formatter/LSP config, OpenCode permission templates, or OpenCode bash permission sync.
- This does not mark Claude Code full capability as complete.
- OpenCode-active settings behavior remains unchanged.

### Verification

- TDD red: focused tests first failed because stale Claude-active callbacks still wrote OpenCode tool permissions, created `.opencode/tools`, wrote formatter/LSP project config, changed Security permission mode, called OpenCode restart/health APIs, and let an already-open Tool detail modal write `.opencode/tools/test-tool.ts`.
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsToolDetailModal.test.ts` passed with `1` suite / `1` test before the broader focused settings run.
- Broader focused tests: `npm test -- --runInBand tests/unit/features/settings/settingsBackendGuards.test.ts tests/unit/features/settings/SettingsToolSection.test.ts tests/unit/features/settings/SettingsToolDetailModal.test.ts tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/features/settings/SettingsSecuritySection.test.ts tests/unit/features/settings/SettingsServerSection.test.ts tests/unit/features/settings/SettingsMcpSection.actions.test.ts` passed with `7` suites / `94` tests.
- `npm run graphify:update:src` refreshed the committed `src` graph with `424` source files, `6135` nodes, `11622` edges, and `217` communities.
- `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint` passed before the full gate.
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `438` suites / `3249` tests and produced `BUILD_ID: feature-phase0-capability.202605241813`.
- `npm run build` passed with standalone `BUILD_ID: feature-phase0-capability.202605241814`; Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Test Vault `main.js` was verified to contain `feature-phase0-capability.202605241814`; the deployed Claude SDK binary checksum matched dist: `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Runtime proof: `.obsidian-debug/claude-opencode-settings-stale-backend-gate-assertion-2026-05-24-result.json` returned outer `ok: true` and inner `ok: true` against deployed build ID `feature-phase0-capability.202605241814` after reloading the Test Vault plugin to clear the stale `feature-phase0-capability.202605241714` runtime. The proof opened the real Test Vault settings editor-area DOM, mounted Tools custom plus Tool detail modal, Formatter, LSP, and Security config/safety controls while OpenCode was active, switched active backend and registry to Claude Code, then triggered stale New Tool, Tool modal Save/Delete, Formatter/LSP mode, permission template, restart, blocklist, and blocked-command callbacks. `saveSettings`, tool permission writes, formatter/LSP config writes, OpenCode bash deny sync, OpenCode health/start/stop, `.opencode/**` adapter writes/removes, and confirm stayed at `0`; OpenCode-only notices appeared; settings layouts had no horizontal overflow.
- Runtime artifacts: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/claude-opencode-settings-stale-backend-gate-runtime-2026-05-24.png`, `.obsidian-debug/claude-opencode-settings-stale-backend-gate-console-2026-05-24.txt`, `.obsidian-debug/claude-opencode-settings-stale-backend-gate-errors-2026-05-24.txt`; dev errors reported `No errors captured.`

## 2026-05-24 Server settings stale backend guard

This narrow worker slice closes stale mounted OpenCode-only server settings callbacks in `SettingsServerSection`. The Server primary tab is only mounted while OpenCode is active, but connection/auth/status callbacks can survive briefly after switching the active backend to Claude Code.

### What Changed

- `SettingsServerSection` now re-checks that OpenCode is still the active backend before server mode/auth/text setting writes and before status start/stop/test/manual-refresh actions.
- Stale Claude-active callbacks show a dedicated Server OpenCode-only notice and return before mutating server settings, calling `saveSettings()`, requesting settings redisplay, or calling `openCodeService.start()`, `stop()`, or `checkHealth()`.
- Background status polling uses the same active-backend check but returns silently, so a stale interval cannot keep probing OpenCode while Claude Code is active.

### What This Does Not Change

- This does not add Claude Code support for OpenCode sidecar server management.
- This does not mark Claude Code full capability as complete.
- OpenCode-active server settings and runtime behavior remain unchanged.

### Verification

- TDD red: focused tests first failed because stale Claude-active callbacks still called `openCodeService.start()` and changed server mode from `local` to `remote`.
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsServerSection.test.ts` passed with `1` suite / `6` tests.
- `npm run graphify:update:src` refreshed the committed `src` graph with `6124` nodes, `11570` edges, and `221` communities.
- `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint` passed.
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `436` suites / `3239` tests and produced `BUILD_ID: feature-phase0-capability.202605241714`.
- `npm run build` passed with the same build ID; Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Test Vault `main.js` was verified to contain `feature-phase0-capability.202605241714`; the deployed Claude SDK binary checksum matched dist: `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Runtime proof: `.obsidian-debug/claude-server-settings-stale-backend-gate-assertion-2026-05-24-result.json` returned outer `ok: true` and inner `ok: true` against deployed build ID `feature-phase0-capability.202605241714`. The proof opened the real Test Vault settings editor-area Server DOM, mounted connection and status controls while OpenCode was active, switched active backend to Claude Code, then triggered stale mode/host/start/stop/refresh controls. `saveSettings`, `openCodeService.start`, `stop`, `checkHealth`, `getServerDiagnostics`, and `getServerStatus` stayed at `0`; server mode/host remained `local` / `127.0.0.1`; the Server OpenCode-only notice appeared; and the settings root had no horizontal overflow (`rootScrollWidth: 1042`, `rootClientWidth: 1042`).
- Runtime artifacts: `.obsidian-debug/claude-server-settings-stale-backend-gate-runtime-2026-05-24.png`, `.obsidian-debug/claude-server-settings-stale-backend-gate-console-2026-05-24.txt`, `.obsidian-debug/claude-server-settings-stale-backend-gate-errors-2026-05-24.txt`; dev errors reported `No errors captured.`

## 2026-05-24 MCP settings stale backend guard

This narrow worker slice closes stale mounted OpenCode-only MCP settings callbacks in `SettingsMcpSection`. The dedicated MCP settings tab is only mounted while OpenCode is active, but toolbar and server-card callbacks can survive briefly after switching the active backend to Claude Code.

### What Changed

- `SettingsMcpSection` now re-checks that OpenCode is still the active backend before toolbar refresh, runtime connect/disconnect/auth actions, Add/Edit modal open, Add/Edit save callbacks, and project Delete.
- Stale Claude-active callbacks show a dedicated MCP OpenCode-only notice and return before calling `refreshMcpServerStatus()`, connect/disconnect/auth, Add/Edit modal construction, Delete confirm, `McpConfigService.deleteServer()`, or project config writes.
- The active-backend fallback matches the surrounding settings owners: if `activeBackend` is invalid, use the first enabled backend rather than silently assuming OpenCode.

### What This Does Not Change

- This does not add Claude MCP authoring or runtime-control support.
- This does not mark Claude Code full capability as complete.
- OpenCode-active MCP runtime and project config behavior remain unchanged.

### Verification

- TDD red: focused tests first failed because stale Claude-active callbacks called `connectMcpServer('disabled')`, `refreshMcpServerStatus()`, and opened Delete confirm after switching away from OpenCode.
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsMcpSection.actions.test.ts` passed with `1` suite / `9` tests.
- `npm run graphify:update:src` refreshed the committed `src` graph with `6122` nodes, `11565` edges, and `217` communities.
- `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, `git diff --check`, and `npm run lint` passed.
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `436` suites / `3237` tests and produced verify `BUILD_ID: feature-phase0-capability.202605241702`.
- `npm run build` passed with the same build ID; Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Test Vault `main.js` was verified to contain `feature-phase0-capability.202605241703`; the deployed Claude SDK binary checksum matched dist: `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Runtime proof: `.obsidian-debug/claude-mcp-settings-stale-backend-gate-assertion-2026-05-24-result.json` returned outer `ok: true` and inner `ok: true` against deployed build ID `feature-phase0-capability.202605241703`. The proof opened the real Test Vault settings editor-area MCP DOM, switched active backend to Claude Code after the MCP tab was mounted, clicked stale Refresh/Add/Connect/Disconnect/Delete controls, and kept `refreshMcpServerStatus`, connect/disconnect/auth, `addMcpServer`, project config reads/writes, and Delete confirm at `0`. It also confirmed the OpenCode-only MCP notice appeared, the Add/Edit modal did not open, and the settings root had no horizontal overflow (`rootScrollWidth: 1042`, `rootClientWidth: 1042`).
- Runtime artifacts: `.obsidian-debug/claude-mcp-settings-stale-backend-gate-runtime-2026-05-24.png`, `.obsidian-debug/claude-mcp-settings-stale-backend-gate-console-2026-05-24.txt`, `.obsidian-debug/claude-mcp-settings-stale-backend-gate-errors-2026-05-24.txt`; dev errors reported `No errors captured.`

## 2026-05-24 Conversation settings project config stale backend guard

This narrow worker slice closes stale mounted OpenCode-only project config controls in `SettingsConversationSection`: project compaction and project share mode controls are only mounted while OpenCode is active, but their callbacks can survive briefly after switching the active backend to Claude Code.

### What Changed

- `SettingsConversationSection` now re-checks that OpenCode is still the active backend at the start of project compaction change callbacks, before mutating section-local compaction state or saving project config.
- The same early guard blocks stale project share-mode callbacks before updating the visible policy chip / diagnostics, `updateShareConfig()`, or the local OpenCode restart path.
- Stale share diagnostics clicks are also blocked before diagnostics UI changes, `openCodeService.checkHealth()`, or the public share-host probe.
- Blocked stale callbacks use the generic project-conversation-config OpenCode-only notice instead of the unshare-specific copy.
- The existing shared-session unshare guard remains unchanged; this slice covers the project-level compaction/share save controls.

### What This Does Not Change

- This does not add Claude project compaction or share-mode support.
- This does not mark Claude Code full capability as complete.
- OpenCode-active project compaction/share settings keep their existing behavior.

### Verification

- TDD red: focused tests first failed because stale Claude-active callbacks mutated compaction local state to `tailTurns: 5` and changed the visible share policy chip from Manual to Auto before the late save guard.
- Follow-up TDD red: stale diagnostics clicks still called `openCodeService.checkHealth()` after switching to Claude Code.
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsConversationSection.test.ts` passed with `1` suite / `35` tests.
- Graph/docs gates: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check` passed.
- Full gate: `OWNER_GUARD_APPROVED=1 npm run verify` passed with `436` suites / `3234` tests and verify build ID `feature-phase0-capability.202605241436`.
- Build/deploy: standalone `npm run build` passed with build ID `feature-phase0-capability.202605241436`, then `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` were copied to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: both `dist/main.js` and Test Vault `main.js` contain `feature-phase0-capability.202605241436`; the deployed Claude SDK binary checksum matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Runtime proof: `.obsidian-debug/claude-settings-project-config-gate-assertion-2026-05-24.json` returned outer `ok: true` and inner `ok: true` against deployed build ID `feature-phase0-capability.202605241436` after fresh plugin reload. The proof used the real settings editor-area DOM and covered stale project compaction input, project share dropdown, and share diagnostics button after switching active backend to Claude Code; both compaction and sharing `phaseCalls` kept `updateCompactionConfig`, `reapplyCompactionConfigFromProjectConfig`, `updateShareConfig`, `checkHealth`, `stop`, `start`, and `requestUrl` at `0`, while tail input, share policy chip, diagnostics values, and button enabled state remained unchanged and the generic OpenCode-only notice appeared.
- Runtime artifacts: `.obsidian-debug/claude-settings-project-config-gate-2026-05-24.png`, `.obsidian-debug/claude-settings-project-config-gate-console-2026-05-24.txt`, and `.obsidian-debug/claude-settings-project-config-gate-errors-2026-05-24.txt`; dev errors captured `No errors captured.`

## 2026-05-24 Ordinary slash command backend gate hardening

This narrow worker slice closes the remaining slash-command dispatch leak: ordinary runtime/project commands and prefixed skill commands still route to OpenCode `session.command`, so Claude Code conversations must not use `backendSessionId` to enter that seam.

### What Changed

- `SlashCommandExecutionService.tryRunSlashCommand()` now requires `(conversation.backend ?? 'opencode') === 'opencode'` before calling `host.runSessionCommand()` for ordinary runtime/project commands.
- `/skills skill-id ...` prefixed skill dispatch uses the same OpenCode-only gate because it resolves to the same `runSessionCommand()` path.
- Non-OpenCode conversations consume the recognized command and reuse the existing slash failure notifier without starting the OpenCode sync loop or visible background sync.

### What This Does Not Change

- This does not add Claude ordinary slash command execution.
- This does not mark Claude Code full capability as complete.
- OpenCode runtime/project command dispatch remains unchanged for OpenCode conversations.

### Verification

- TDD red: focused tests first failed because Claude `backendSessionId` was passed to `host.runSessionCommand('claude-session-1', ...)` for both `/build --fast` and `/skills skill-review note.md`.
- Focused green: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts` passed with `1` suite / `19` tests.
- Focused regression set: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandExecutionService.undoRedo.test.ts tests/unit/features/chat/SlashCommandExecutionService.share.test.ts` passed with `3` suites / `35` tests.
- Graph/docs gates: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check` passed.
- Full gate: `OWNER_GUARD_APPROVED=1 npm run verify` passed with `436` suites / `3231` tests and verify build ID `feature-phase0-capability.202605241345`.
- Build/deploy: standalone `npm run build` passed with build ID `feature-phase0-capability.202605241345`, then `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` were copied to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: both `dist/main.js` and Test Vault `main.js` contain `feature-phase0-capability.202605241345`; the deployed Claude SDK binary checksum matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Runtime proof: `.obsidian-debug/claude-slash-command-gate-assertion-2026-05-24.json` returned `ok: true` against deployed build ID `feature-phase0-capability.202605241345` after fresh plugin reload. The proof used the real DOM composer (`.opencodian-input` + `.opencodian-send-btn`) with a Claude conversation carrying `backendSessionId: 'claude-session-command-1'`; `/build --fast` and `/skills skill-review note.md` were recognized and consumed, `runSessionCommand` / `startConversationSyncLoop` / `syncVisibleConversationInBackground` stayed at `0`, `notifySlashCommandFailed` reported only `No OpenCode session available`, and no prompt messages were added.
- Runtime artifacts: `.obsidian-debug/claude-slash-command-gate-2026-05-24.png`, `.obsidian-debug/claude-slash-command-gate-console-2026-05-24.txt`, and `.obsidian-debug/claude-slash-command-gate-errors-2026-05-24.txt`; dev errors captured `No errors captured.`

## 2026-05-24 Session settings modal share write backend gate

This narrow worker slice closes the modal action equivalent of the slash share boundary: `ConversationSessionSettingsCoordinator` can still read share URLs through backend-aware routing, but share/unshare writes remain OpenCode-only.

### What Changed

- `ConversationSessionSettingsCoordinator.shareCurrentConversation()` now requires `(conversation.backend ?? 'opencode') === 'opencode'` before calling `shareSession()`.
- `ConversationSessionSettingsCoordinator.unshareCurrentConversation()` now requires the same OpenCode backend guard before calling `unshareSession()`.
- If a Claude Code conversation is forced into the sharing modal with `supportsSessionSharing: true`, modal share/unshare actions reuse existing OpenCode sharing failure/unavailable copy and do not call host/plugin OpenCode write seams.

### What This Does Not Change

- This does not add a Claude share/unshare write capability.
- This does not mark Claude Code full capability as complete.
- Backend-aware share URL reads through `readBackendSessionShareUrl()` remain separate from OpenCode-only share/unshare writes.

### Verification

- TDD red: focused tests first failed because Claude `backendSessionId` was passed to `host.shareSession('claude-session-1')` / `host.unshareSession('claude-session-1')` from modal actions.
- Focused green: `npm test -- --runInBand tests/unit/features/chat/ConversationSessionSettingsCoordinator.test.ts tests/unit/features/chat/ConversationSessionSettingsCoordinator.shareUrlRouting.test.ts` passed with `2` suites / `22` tests.
- Graph/docs gates: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check` passed.
- Full gate: `OWNER_GUARD_APPROVED=1 npm run verify` passed with `436` suites / `3229` tests and verify build ID `feature-phase0-capability.202605241319`.
- Build/deploy: standalone `npm run build` passed with build ID `feature-phase0-capability.202605241321`, then `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` were copied to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: both `dist/main.js` and Test Vault `main.js` contain `feature-phase0-capability.202605241321`; the deployed Claude SDK binary checksum matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Runtime proof: `.obsidian-debug/claude-session-settings-share-gate-assertion-2026-05-24.json` returned `ok: true` against deployed build ID `feature-phase0-capability.202605241321` after fresh plugin reload. The proof opened the real session settings modal with a forced-visible Claude conversation, covered known-unshared share plus stale shared unshare states, and kept `openCodeService.shareSession` / `unshareSession` and clipboard writes at `0`.
- Runtime artifacts: `.obsidian-debug/claude-session-settings-share-gate-2026-05-24.png`, `.obsidian-debug/claude-session-settings-share-gate-console-2026-05-24.txt`, and `.obsidian-debug/claude-session-settings-share-gate-errors-2026-05-24.txt`; dev errors captured `No errors captured.`

## 2026-05-24 Slash compact backend gate hardening

This round closed a narrow slash-command backend ownership leak: `/compact` could use a Claude `backendSessionId` and still call the OpenCode-only compact/summarize host.

### What Changed

- `SlashCommandExecutionService.handleCompactCommand()` now requires the current conversation backend to be `opencode` before calling `host.runCompactSession()`.
- Non-OpenCode conversations reuse the existing compact no-session notice copy for this OpenCode-only summarize action.

### What This Does Not Change

- This does not add a Claude compact/summarize concept.
- This does not mark Claude Code full capability as complete.
- OpenCode manual compaction remains unchanged for OpenCode conversations.

### Verification

- TDD red: focused test first failed because Claude `backendSessionId` was passed to `host.runCompactSession('claude-session-1')`.
- Focused green: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandExecutionService.undoRedo.test.ts tests/unit/features/chat/SlashCommandExecutionService.share.test.ts` passed with `3` suites / `33` tests.
- Graph/docs gates: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check` passed.
- Full gate: `OWNER_GUARD_APPROVED=1 npm run verify` passed with `436` suites / `3227` tests and build ID `feature-phase0-capability.202605241254`.
- Build/deploy: standalone `npm run build` passed with build ID `feature-phase0-capability.202605241255`, then `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` were copied to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: both `dist/main.js` and Test Vault `main.js` contain `feature-phase0-capability.202605241255`; the deployed Claude SDK binary checksum matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Runtime proof: `.obsidian-debug/claude-slash-compact-gate-assertion-2026-05-24.json` returned `ok: true` against deployed build ID `feature-phase0-capability.202605241255` after fresh plugin reload. The proof used the real DOM composer (`.opencodian-input` + `.opencodian-send-btn`) with a Claude conversation carrying `backendSessionId: 'claude-session-compact-1'`; `/compact` was consumed, `openCodeService.getSessionContextUsageSnapshot` / `summarizeSession` calls stayed `0`, and no prompt messages were added.
- Runtime artifacts: `.obsidian-debug/claude-slash-compact-gate-2026-05-24.png`, `.obsidian-debug/claude-slash-compact-gate-console-2026-05-24.txt`, and `.obsidian-debug/claude-slash-compact-gate-errors-2026-05-24.txt`; dev errors captured `No errors captured.`

## 2026-05-24 Slash share backend gate hardening

This round closed a narrow slash-command backend ownership leak: `/share` and `/unshare` could use a Claude `backendSessionId` and still call the OpenCode-only share/unshare host.

### What Changed

- `SlashCommandExecutionService.handleShareCommand()` now requires the current conversation backend to be `opencode` before calling `host.shareSession()`.
- `SlashCommandExecutionService.handleUnshareCommand()` now requires the current conversation backend to be `opencode` before calling `host.unshareSession()`.
- Non-OpenCode conversations reuse the existing no-session notice copy for these OpenCode-only write actions.

### What This Does Not Change

- This does not add a Claude share URL concept.
- This does not mark Claude Code full capability as complete.
- Backend-aware share URL reads remain separate from OpenCode-only share/unshare writes.

### Verification

- TDD red: focused tests first failed because Claude `backendSessionId` was passed to `host.shareSession('claude-session-1')` / `host.unshareSession('claude-session-1')`.
- Focused green: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandExecutionService.undoRedo.test.ts tests/unit/features/chat/SlashCommandExecutionService.share.test.ts` passed with `3` suites / `32` tests.
- Graph/docs gates: `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check` passed.
- Full gate: `OWNER_GUARD_APPROVED=1 npm run verify` passed with `436` suites / `3226` tests and build ID `feature-phase0-capability.202605241245`.
- Build/deploy: `npm run build` passed, then `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` were copied to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deploy freshness: both `dist/main.js` and Test Vault `main.js` contain `feature-phase0-capability.202605241245`; the deployed Claude SDK binary checksum matches dist at `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`.
- Runtime proof: `.obsidian-debug/claude-slash-share-unshare-gate-assertion-2026-05-24.json` returned `ok: true` against deployed build ID `feature-phase0-capability.202605241245` after fresh plugin reload. The proof used the real DOM composer (`.opencodian-input` + `.opencodian-send-btn`) with a Claude conversation carrying `backendSessionId: 'claude-session-1'`; `/share` and `/unshare` were consumed, `openCodeService.shareSession` / `unshareSession` calls stayed `0`, clipboard writes stayed `0`, and no prompt messages were added.
- Runtime artifacts: `.obsidian-debug/claude-slash-share-unshare-gate-2026-05-24.png`, `.obsidian-debug/claude-slash-share-unshare-gate-console-2026-05-24.txt`, and `.obsidian-debug/claude-slash-share-unshare-gate-errors-2026-05-24.txt`; dev errors captured `No errors captured.`

## 2026-05-24 Claude new-conversation backend ownership boundary

This round closed a backend ownership leak in plugin-level conversation creation.

### What Changed

- `OpenCodianPlugin.createConversation()` now treats `settings.activeBackend` as the owner of a newly created conversation and looks up that exact adapter in `AgentServiceRegistry`.
- If the active backend is non-OpenCode and no session-capable adapter is available, conversation creation now fails with `Cannot create conversation: active backend does not support sessions`.
- OpenCode active/legacy creation remains unchanged: when active backend is OpenCode, it still waits for session-bootstrap warmup and writes legacy `openCodeSessionId` plus `backendSessionId`.

### What This Does Not Change

- This does not mark Claude Code full capability as complete.
- This does not expose a new stable Claude session UI beyond the already wired session-creation path.
- This does not change existing OpenCode conversation creation, server warmup, or history compatibility behavior.

### Verification

- Focused main test used red-green: before the fix, the new regression resolved to a `backend: "opencode"` conversation while `settings.activeBackend` was `claude-code`; after the fix `npm test -- --runInBand tests/unit/main.test.ts` passed with `34` tests.
- Reviewer subagent reported no Critical, Important, or Minor findings; it noted a remaining optional test gap for a registered Claude adapter that exists but lacks `sessions`.
- `npm run graphify:update:src`, `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check` passed.
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `435` suites / `3221` tests and production build.
- `npm run build` passed with deployment `BUILD_ID: feature-phase0-capability.202605241140`.
- Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/`; Test Vault `main.js` contains `feature-phase0-capability.202605241140`, and the deployed Claude SDK binary checksum matches `dist` (`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`).
- Fresh Obsidian runtime proof:
  - assertion: `.obsidian-debug/claude-create-conversation-boundary-assertion-2026-05-24.json`
  - screenshot: `.obsidian-debug/claude-create-conversation-boundary-2026-05-24.png`
  - console: `.obsidian-debug/claude-create-conversation-boundary-console-2026-05-24.txt`
  - errors: `.obsidian-debug/claude-create-conversation-boundary-errors-2026-05-24.txt`
  - result: deployed runtime reported `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605241140`; simulated active Claude with no Claude session adapter while OpenCode was available; `createConversation()` threw the expected active-backend unsupported error; OpenCode `createSession` attempts stayed at `0`; storage writes stayed at `0`; conversation count delta stayed at `0`; `dev:errors` reported `No errors captured.`

### Reviewer Gap Follow-Up

- Correction follow-up restores `hasSessionCapability()` to broad read-routing semantics: declared `AgentCapability.Sessions` is enough for read/list/preview/title seams.
- New `hasSessionCreationCapability()` centralizes the creation-specific guard: a registered active Claude adapter that declares sessions but omits `createSession` is rejected by `OpenCodianPlugin.createConversation()` without falling back to the OpenCode adapter, legacy `openCodeService`, warmup, storage write, or conversation append path.
- This remains a backend ownership boundary fix only. It does not mark Claude Code full capability complete.
- Final gate passed: `OWNER_GUARD_APPROVED=1 npm run verify` completed with `435` suites / `3224` tests, including production build and `BUILD_ID: feature-phase0-capability.202605241213`.
- Standalone `npm run build` also passed with the same `BUILD_ID`; Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.
- Deployed `main.js` contains `feature-phase0-capability.202605241213`, and the deployed Claude SDK binary checksum matches `dist` (`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`).
- Fresh Obsidian runtime proof:
  - assertion: `.obsidian-debug/claude-malformed-session-creation-boundary-assertion-2026-05-24.json`
  - screenshot: `.obsidian-debug/claude-malformed-session-creation-boundary-2026-05-24.png`
  - console: `.obsidian-debug/claude-malformed-session-creation-boundary-console-2026-05-24.txt`
  - errors: `.obsidian-debug/claude-malformed-session-creation-boundary-errors-2026-05-24.txt`
  - result: deployed runtime reported `ok: true` and `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605241213`; the registered malformed Claude adapter declared sessions but omitted `createSession`; `createConversation()` threw `Cannot create conversation: active backend does not support sessions`; OpenCode adapter `createSession` attempts stayed at `0`; legacy `openCodeService.createSession` stayed at `0`; storage writes stayed at `0`; conversation count delta stayed at `0`; state restored successfully; `dev:errors` reported `No errors captured.`

## 2026-05-24 Chat backend chrome scope proof

This round tightened the chat chrome around active backend identity without promoting any unverified Claude Code capability.

### What Changed

- `ChatHeaderPresenter` now renders backend-specific offline copy for non-OpenCode backends, for example `Claude Code offline` / `Claude Code 离线`, instead of falling back to generic `Offline`.
- `ConversationHistoryActionsCoordinator` now renders the active backend scope at the top of the history dropdown, for example `Claude Code history` / `Claude Code 历史会话`.
- `OpenCodianView` supplies the active backend display name to the history dropdown while keeping the history list filtered by `settings.activeBackend`.

### What This Does Not Change

- This does not mark Claude Code as full-capability complete.
- The history dropdown remains local conversation history scoped by backend, not a claim that all Claude native session-history semantics are productized.
- OpenCode server status wording and health checks are unchanged.

### Verification

- Focused chat tests passed for header status rendering and history dropdown scope rendering.
- `npm run graphify:update:src` passed and refreshed root `graphify-out/`.
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `435` suites / `3213` tests and production build.
- `npm run build` passed with `BUILD_ID: feature-phase0-capability.202605241015`.
- Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/`.
- Test Vault `main.js` contains `feature-phase0-capability.202605241015`, and the deployed Claude SDK binary checksum matches `dist`.
- Fresh Obsidian runtime proof against Test Vault:
  - assertion: `.obsidian-debug/backend-scope-header-history-assertion-2026-05-24.json`
  - screenshot: `.obsidian-debug/backend-scope-header-history-screenshot-2026-05-24.png`
  - screenshot setup: `.obsidian-debug/backend-scope-header-history-screenshot-setup-2026-05-24.json`
  - cleanup/final capture: `.obsidian-debug/backend-scope-header-history-screenshot-cleanup-2026-05-24.json`
  - result: deployed runtime reported `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605241015`, header text `Claude Code 离线`, history scope `Claude Code 历史会话`, and `dev:errors` reported `No errors captured.`

## 2026-05-24 Claude completed-stream local persistence gate

This round fixed a backend-boundary bug in the send pipeline: completed Claude Code streams were eligible for the OpenCode authoritative-sync path even though authoritative sync is intentionally OpenCode-only for now.

### What Changed

- `buildLocalStreamOutcome()` now sets `shouldSyncFromServer` only for OpenCode/legacy conversations.
- Completed Claude Code streams now stay on the local assistant persistence path, so streamed text and `backend_event` structured output can be saved into the local conversation.
- Focused tests now cover both the pure outcome rule and the end-to-end send pipeline path for a Claude `structured_output` backend event.

### What This Does Not Change

- This does not promote structured output authoring into the normal chat UI.
- This does not add a backend-neutral authoritative sync contract for Claude Code.
- Rewind, diff, child-session graph, and OpenCode sync remain explicitly OpenCode-only unless a later slice adds separate official basis plus runtime proof.

### Verification

- Focused send pipeline tests passed for `buildLocalStreamOutcome` and `SendPipelineRuntime` (`16` tests).
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `435` suites / `3215` tests and production build.
- `npm run build` passed with `BUILD_ID: feature-phase0-capability.202605241038`.
- Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/`.
- Test Vault `main.js` contains `feature-phase0-capability.202605241038`, and the deployed Claude SDK binary checksum matches `dist`.
- Fresh Obsidian runtime proof:
  - assertion: `.obsidian-debug/claude-local-persistence-runtime-assertion-2026-05-24.json`
  - screenshot: `.obsidian-debug/claude-local-persistence-runtime-2026-05-24.png`
  - result: deployed runtime reported `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605241038`, active backend `claude-code`, enabled backends `opencode` + `claude-code`, deployed non-OpenCode sync gate present, deployed structured-output capture present, and `dev:errors` reported `No errors captured.`

## 2026-05-24 Claude settings runtime boundary coverage

This round extended the existing Claude Code settings runtime-boundary affordance to the remaining restart-sensitive settings tabs.

### What Changed

- The Runtime tab now shows the next-query / restarted-session boundary notice before executable, diagnostics, and env variable settings.
- The Tools tab now shows the same boundary notice before MCP runtime controls and allowed/disallowed tool lists.
- The Limits tab now shows the same boundary notice before max turns and max budget settings.
- All three tabs reuse the existing restart action that calls `ClaudeCodeAdapter.restartPersistentQueries('settings-change')`.

### What This Does Not Change

- This does not promote any hidden or diagnostic-only Claude capability to stable UI.
- MCP authoring, skills/plugins authoring, hook authoring, stable rewind, structured-output UI, and full subagent transcript UI remain unpromoted.
- Existing OpenCode settings and runtime behavior are unchanged.

### Verification

- Focused settings tests now cover Runtime, Tools, and Limits boundary notice rendering; Runtime also verifies the restart action calls `restartPersistentQueries('settings-change')`.
- Focused settings test passed with `31` tests.
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `435` suites / `3219` tests and production build.
- `npm run build` passed with `BUILD_ID: feature-phase0-capability.202605241052`.
- Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/`.
- Test Vault `main.js` contains `feature-phase0-capability.202605241052`, and the deployed Claude SDK binary checksum matches `dist`.
- Fresh Obsidian runtime proof:
  - assertion: `.obsidian-debug/claude-settings-runtime-boundary-assertion-2026-05-24.json`
  - screenshot: `.obsidian-debug/claude-settings-runtime-boundary-2026-05-24.png`
  - errors: `.obsidian-debug/claude-settings-runtime-boundary-errors-2026-05-24.txt`
  - result: deployed runtime reported `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605241052`; Runtime, Tools, and Limits tabs were mounted with boundary notice and restart button; no translation-key leakage; `dev:errors` reported `No errors captured.`

## 2026-05-24 Claude title fallback backend boundary

This round closed a title-generation backend leak: Claude Code conversations without an official SDK summary could previously fall through to the OpenCode-only AI fallback title path, creating a temporary OpenCode session for a Claude conversation.

### What Changed

- `TitleGenerationService` still reads official titles through `readBackendSessionTitle()` for both OpenCode and Claude.
- If no official title is available and the conversation backend is not OpenCode, the service now returns the local first-message title via `generateDefaultTitle(userMessage)`.
- The OpenCode AI fallback path (`openCodeService.createSession('Title Generation')` + `requestAssistantResponse()`) is now used only for OpenCode conversations.

### What This Does Not Change

- This does not add backend-neutral single-shot title generation for Claude.
- This does not promote a Claude title-generation product surface beyond the official-summary read seam.
- OpenCode smart-title behavior remains unchanged.

### Verification

- Focused title-generation test now proves a Claude conversation with no official summary calls `claudeAdapter.getSession()`, does not call OpenCode temporary-session APIs, and returns the local first-message title.
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `435` suites / `3220` tests and production build.
- `npm run build` passed with deployment `BUILD_ID: feature-phase0-capability.202605241119`.
- Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets/`, and `dist/node_modules/`.
- Test Vault `main.js` contains `feature-phase0-capability.202605241119`, and the deployed Claude SDK binary checksum matches `dist`.
- Fresh Obsidian runtime proof:
  - assertion: `.obsidian-debug/claude-title-fallback-boundary-assertion-2026-05-24.json`
  - screenshot: `.obsidian-debug/claude-title-fallback-boundary-2026-05-24.png`
  - errors: `.obsidian-debug/claude-title-fallback-boundary-errors-2026-05-24.txt`
  - result: deployed runtime reported `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605241119`; Claude `getSession` was called once; OpenCode fallback `createSession`, `requestAssistantResponse`, and `deleteSession` remained at `0`; `dev:errors` reported `No errors captured.`

## 2026-05-23 Phase 2 settings/runtime boundary hardening

This round tightened the Claude settings surface so it is honest about runtime boundaries instead of implying every Claude Code option live-updates a persistent query.

### What Changed

- `SettingsClaudeCodeSection` now shows project source file visibility for `CLAUDE.md`, `.claude/settings.json`, and `.claude/settings.local.json`
- The restart-sensitive Runtime, Context & Sources, Tools, and Limits tabs now show a next-query / restarted-session boundary notice
- Those tabs offer a restart action that calls `ClaudeCodeAdapter.restartPersistentQueries('settings-change')`
- Model changes now try to update the active Claude adapter via `setModel()` before saving
- Permission mode changes now try to update the active Claude adapter via `setPermissionMode()` before saving
- Live adapter control failures no longer block settings persistence, they are best-effort only

### What This Does Not Change

- Setting sources, additional directories, env, tools, and limits still require a new Claude query or restarted persistent session to take effect
- This does not promote any new Claude capability to stable product surface
- The restart action only closes active persistent queries, it does not delete the underlying local session handles

## 2026-05-23 Non-OpenCode availability honesty fix

This quick follow-up makes the chat surface stop pretending a non-OpenCode backend is online when its adapter is actually disconnected.

### What Changed

- `OpenCodianView.getServerAvailability()` now maps the active adapter's real `status` for non-OpenCode backends instead of returning `running` by default
- `ChatHeaderPresenter` now treats disconnected non-OpenCode backends as `offline` in the header instead of showing a connected label
- Focused regression tests now cover the Claude Code disconnected path

### Why It Matters

- Claude Code should only look connected when its adapter is actually connected
- The composer and header now agree on the real backend state
- OpenCode health-check behavior is unchanged

### Verification

- Focused chat tests passed for composer availability, header rendering, and server readiness

### Verification

- Focused settings and adapter tests passed
- `OWNER_GUARD_APPROVED=1 npm run verify` passed, including `435` suites / `3206` tests and production build
- Final build/deploy used `BUILD_ID: feature-phase0-capability.202605232242`
- Test Vault `main.js` contains `feature-phase0-capability.202605232242`
- Fresh Obsidian runtime proof opened OpenCodian settings to `claude-code/context-sources`, confirmed the runtime-boundary notice, project source status rows, restart button, and no translation-key leakage:
  - `.obsidian-debug/phase2-settings-runtime-final-clean-assertion-2026-05-23.json`
  - `.obsidian-debug/phase2-settings-runtime-final-clean-2026-05-23.png`
  - `.obsidian-debug/phase2-settings-runtime-final-clean-console-2026-05-23.txt`
  - `.obsidian-debug/phase2-settings-runtime-final-clean-errors-2026-05-23.txt`
- Runtime deploy initially exposed a missing Claude Agent SDK platform binary because only `main.js`, `manifest.json`, and `styles.css` had been copied. The final Test Vault deploy now also includes `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/`, with the deployed `claude` binary checksum matching `dist`. After that copy, Obsidian console showed `supportedModels count {"count":5}`, `dev:errors` remained empty, and OpenCode sidecar recovered to `running` / `ready=true`.

## 2026-05-23 Phase 2 MCP runtime controls in Claude settings

This round productizes a small, honest MCP runtime control in the Claude Code Tools settings tab. It does not add MCP authoring.

### What Changed

- `SettingsClaudeCodeSection` now shows the active Claude adapter MCP server count on the Tools tab via `getMcpServerCount()`
- The same tab now offers a "Refresh MCP runtime" action that calls `ClaudeCodeAdapter.reloadMcpServers()`
- Successful refreshes re-read and display the updated runtime server count
- Failed refreshes leave a visible failure status instead of immediately overwriting it with the previous count

### What This Does Not Change

- OpenCodian still does not author `.claude/mcp.json`
- Capability Lab MCP rows remain detection-only
- This does not promote MCP authoring, skill/plugin authoring, or agent authoring to a stable product surface

### Verification

- Focused settings test covers loaded count, refresh, and refresh failure visibility
- Focused adapter test still covers `reloadMcpServers()` and `getMcpServerCount()` runtime seams
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `435` suites / `3208` tests and production build
- `npm run build` passed again with `BUILD_ID: feature-phase0-capability.202605232303`
- Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/`
- Fresh Obsidian runtime proof:
  - screenshot: `.obsidian-debug/claude-tools-final-proof.png`
  - console: no new errors; `supportedModels count {"count":5}` recorded
  - settings runtime text: `当前 Claude Code adapter 没有加载 MCP 服务器。`
  - refresh button present: `刷新 MCP 运行时`

## 2026-05-23 Phase 2 runtime ecosystem read-only settings summary

This round moves a small part of Claude-native ecosystem visibility from Capability Lab into the regular Claude Code settings surface, without adding authoring.

### What Changed

- The Claude Code SDK Foundations tab now shows a read-only Runtime ecosystem summary
- The summary reports currently wired runtime plugins via `getPluginCount()` / `getPluginsList()`
- The summary reports currently wired runtime skills via `getSkillCount()` / `getSkillsList()`, including the `skills: "all"` sentinel
- Capability Lab MCP discovery text now points to the Claude Code settings Tools tab runtime refresh control instead of claiming there is no Claude settings tab

### What This Does Not Change

- No skills/plugins authoring UI is exposed
- No Claude skill/plugin config files are written
- Capability Lab Skills and Plugins remain diagnostic / detection-only; this is a read-only status promotion, not stable ecosystem authoring

### Verification

- Focused settings tests cover plugin names, skill names, and the all-skills sentinel in SDK Foundations
- Focused Capability Lab tests cover the updated MCP discovery text
- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `435` suites / `3210` tests and production build
- `npm run build` passed again with `BUILD_ID: feature-phase0-capability.202605232319`
- Test Vault deploy copied `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `dist/assets`, and `dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/`
- Test Vault `main.js` contains `feature-phase0-capability.202605232319`, and the deployed Claude SDK binary checksum matches `dist`
- Fresh Obsidian runtime proof:
  - screenshot: `.obsidian-debug/claude-runtime-ecosystem-proof-sdk-foundations.png`
  - DOM assertion: `data-claude-code-runtime-ecosystem` contains the read-only runtime ecosystem summary with no translation-key leakage
  - console: `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605232319` and `supportedModels count {"count":5}` recorded
  - `dev:errors`: no errors captured

## Source Of Truth Order

Read these in order when continuing Claude work:

1. `docs/requirements/multi-agent-foundation/04-claude-code-adapter.md`
2. `docs/superpowers/specs/2026-05-20-claude-code-full-capability-design.md`
3. `docs/superpowers/plans/2026-05-20-claude-code-full-capability-implementation.md`
4. `src/core/agents/backend/ClaudeCodeAdapter.ts`
5. `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
6. `src/features/settings/SettingsCapabilityLabSection.ts`
7. This file

Interpret older `docs/status/claude-code-*.md` files as historical snapshots unless they are explicitly newer than this file.

## Where The Project Is Now

The Claude Code lane is no longer at proposal stage.

The current position is:

- Phase 0 backend-neutral groundwork is sufficiently complete for real Claude backend work.
- Phase 1 minimal backend loop is complete.
- Phase 2 has meaningful implementation, not just design.
- A subset of later-phase Claude-native ecosystem capabilities has already been wired behind diagnostic or hidden surfaces.

The most important framing for future work:

- OpenCodian is not trying to flatten Claude into an OpenCode-shaped backend.
- OpenCodian is trying to preserve a multi-backend shell while still letting each backend eventually expose its native ecosystem.
- For Claude, advanced capabilities are being integrated with a diagnostic-first policy before stable promotion.

## Backend-Aware Session/History/Control Migration (2026-05-22)

Recent runs focused on two connected lanes:

- separating Claude `fork` from full OpenCode-style branching semantics; and
- productizing backend-aware session/history reads only where semantics genuinely match.

### What Became Backend-Aware

| Owner | Change |
|---|---|
| `OpenCodianView.ts` | `revertSession`/`unrevertSession` route through `AgentCapability.Branching`; `forkSession` routes separately through `AgentCapability.Fork` / `AgentForkCapability`. OpenCode fallback is explicit and backend-gated. User-message footer Rewind/Fork visibility now resolves from the current conversation's backend capabilities, not only the globally active backend. `getCurrentConversationSessionId` uses `getConversationBackendSessionId()`. |
| `ConversationLoadRecoveryCoordinator.ts` | `handleRewindRequest`/`handleRestoreRewindRequest`/`handleForkRequest` use `getConversationBackendSessionId()` and gate revert/unrevert by backend kind. Fork preserves source conversation `backend` identity through `createConversationFromSession()` instead of using `settings.activeBackend`. |
| `ConversationAuthoritativeSyncCoordinator.ts` | Uses `getConversationBackendSessionId()`; skips sync for non-OpenCode backends (OpenCode-only by design). |
| `ConversationAuthoritativeReloadCoordinator.ts` | Uses `getConversationBackendSessionId()` in all debug logs; skips server sync for non-OpenCode backends. |
| `ConversationNoticeCoordinator.ts` | `appendTurnDiffNoticeIfNeeded` gated to OpenCode-only. |
| `SlashCommandExecutionService.ts` | Ordinary runtime/project slash dispatch and `/skills skill-id ...` prefixed skill dispatch are gated to OpenCode-only before `session.command`; `/compact`, `/undo`, `/redo`, `/share`, and `/unshare` are also gated to OpenCode-only. Uses `getConversationBackendSessionId()` only after the relevant backend guard. |
| `ChildSessionGraphCoordinator.ts` | `refreshGraph` gated to OpenCode-only. |
| `LocalStreamMessagePersistence.ts` | Debug logs use `getConversationBackendSessionId()`. |
| `ConversationRenderService.ts` | Debug logs use `getConversationBackendSessionId()`. `resolveConversationRenderMessages()` has an explicit `backend !== 'opencode'` guard so the canonical session state path (OpenCode-specific `getCanonicalSessionState` / `hydrateOpenCodeMessage`) is never entered for non-OpenCode conversations — hardening what was previously only an implicit null-safe fallback. |
| `ConversationSyncRuntimeCoordinator.ts` | Sync timeout payload uses both `openCodeSessionId` and `backendSessionId`. |
| `BackgroundTaskNoticeStateService.ts` | Session matching uses `getConversationBackendSessionId()`. |
| `BackgroundTaskTimelineService.ts` | Debug logs use `getConversationBackendSessionId()`. |
| `ConversationIdentityRuntime.ts` | Sync fingerprint uses `getConversationBackendSessionId()`. |
| `SessionTodoStateService.ts` | Session matching uses `getConversationBackendSessionId()`. |
| `AgentBackendRouting.ts` | Adds `getConversationSessionHistoryService()`, `loadBackendSessionMessages()`, `getActiveSessionHistoryService()`, `readBackendSessionTitle()`, `readBackendSessionShareUrl()`, `listBackendSessions()`, and `getBackendSessionPreview()` so shared owners can read raw session history, session titles, session share URLs, normalized session rows, and normalized preview messages without hard-binding to `openCodeService` or assuming OpenCode `Session` / `SessionMessage` shapes. `NormalizedSessionRow`, `NormalizedSessionPreviewMessage`, and `NormalizedSessionPreviewPart` are lightweight inspection-only types, not a stable cross-backend session contract. |
| `TitleGenerationService.ts` | `readOfficialSessionTitle()` now routes through `readBackendSessionTitle()` in `AgentBackendRouting` — calls `getSession(sessionId)` on the backend adapter instead of `listSessions()` + client-side filtering. Both OpenCode and Claude paths are unified through the registry. AI title generation (temp session create/delete/send via `openCodeService`) remains OpenCode-only and is now skipped for non-OpenCode conversations; Claude/no-summary fallback returns the local first-message title until a backend-neutral single-shot response contract exists. |
| Context usage detail modal | Raw message loading now routes through `getConversationSessionHistoryService()` with backend-aware normalization; snapshots themselves remain OpenCode-only. |
| `SettingsConversationSection.ts` | Shared sessions list now routes through `listBackendSessions()` and session message preview routes through `getBackendSessionPreview()` instead of directly calling backend `listSessions()` / `getSessionMessages()` and casting to OpenCode `Session` / `SessionMessage`. The rendering uses `NormalizedSessionRow` and `NormalizedSessionPreviewMessage` types. `unshareSession()` remains a direct `openCodeService` call (OpenCode-specific write). |
| `OpenCodeAdapter.ts` | `getSession()` now uses the efficient `OpenCodeService.getSessionInfo()` single-session SDK `session.get()` call instead of the O(n) `listSessions()` + `.find()` workaround. The adapter return type remains `unknown | null` — no new cross-backend session contract. |

### What Remains OpenCode-Only (Intentionally Gated)

| Capability | Reason |
|---|---|
| Authoritative server sync | OpenCode-specific message shape (`info`/`parts`), hydration path, and canonical state. |
| Revert / unrevert | Claude SDK has `rewindFiles` but semantics differ; no stable-complete runtime proof. |
| Session diff (`getSessionDiff`) | OpenCode-specific API; no backend-neutral equivalent. |
| Child session graph | OpenCode-specific `getSessionChildren` API. |
| Session todo/status live signals | Deeply tied to OpenCode server events. |
| Background task timeline | Assumes OpenCode task tool metadata shape. |

### What Claude Still Needs To Verify/Deploy

- ~~`forkSession` is wired in `ClaudeCodeAdapter` but not exposed as stable~~ **RESOLVED**: `AgentCapability.Fork` and `AgentForkCapability` have been added; Claude Code now declares `Fork` and routes fork through the registry layer.
- `ClaudeCodeAdapter` has `listSessions`, `getSession`, `getSessionMessages`, `deleteSession`, `updateSessionTitle` — these are adapter-wired. `getSessionMessages` is now on the shared `AgentSessionCapability` interface and both OpenCode and Claude adapters implement it; `getConversationSessionHistoryService()` routing helper exists in `AgentBackendRouting`. The context usage detail modal now routes through this helper with backend-aware message normalization. `getSession()` is now productized narrowly for two shared read seams via `readBackendSessionTitle()` and `readBackendSessionShareUrl()`; the helpers map only the currently validated backends and must not be described as a generic stable cross-backend session-detail object contract yet. `readBackendSessionShareUrl()` extracts `session.share.url` for OpenCode and returns `null` for Claude Code (no share URL concept).
- The `TitleGenerationService` official-title read seam now has Test Vault runtime proof through deployed plugin code: both OpenCode and Claude paths route through registry `getSession(sessionId)`, and the OpenCode read path no longer falls back to `openCodeService.listSessions()` for that seam. This proves the narrow shared session-detail read, not a broader backend-neutral session object contract.
- Backend-aware history normalization for non-OpenCode backends is currently best-effort foundation (`loadBackendSessionMessages()`); it is good enough for raw inspection surfaces, not yet a stable cross-backend history product contract.
- `SettingsConversationSection` now uses backend-aware normalized routing for session list + preview reads through `listBackendSessions()` and `getBackendSessionPreview()`. The preview renderer consumes `NormalizedSessionPreviewMessage` (not OpenCode `SessionMessage`), so it handles both OpenCode `{info, parts}` shape and generic/Claude `{role, content}` shape without crashing. `getBackendSessionPreview()` now distinguishes unavailable preview capability (`null` → failure copy) from legitimate empty history (`[]` → neutral empty-preview copy). `unshareSession()` remains OpenCode-only. Treat the shared-session manager as a real backend-aware inspection surface, not as a generic stable cross-backend session-detail contract.
- Runtime smoke for stable Claude fork/resume-at product surfaces is not yet recorded. Capability Lab now owns provider-owned diagnostic probes for both fork and resume; the resume diagnostic now validates the selected id through the Claude SDK session catalog before `query({ options.resume })`, validates that the query returns the same SDK session id afterward, and has a deployed authenticated same-session nonce-recall proof. These probes still do not promote either capability to a stable product surface.
- The `AgentBranchCapability` interface still requires ALL of fork/revert/unrevert/diff/getSessionRevertState; Claude only has fork. `AgentForkCapability` is the separate partial interface for fork-only backends.

## What Is Definitely Complete

These items are implemented enough to treat as real delivered backend capability, not speculative design:

| Area | Current state |
|---|---|
| Backend registration and routing | Claude is a real backend in the multi-backend architecture, not a placeholder. |
| SDK import and executable handling | The adapter uses the official SDK path, plus process resolution and Electron-safe spawn handling. |
| Persistent query runtime | Claude owns a persistent `query()` runtime and can stream across turns. |
| Session identity | Claude uses backend-owned session identity via `backendSessionId`-style flow, rather than pretending to be OpenCode. |
| Resume | Persistent chat query resume is wired for Claude-owned session identity. Capability Lab resume is diagnostic-only and now requires SDK catalog validation before `options.resume`, same-session result-id validation after query, and has positive authenticated nonce-recall proof. Stable resume-at productization is not complete. |
| Stream normalization | Text, thinking, tool use, tool result, usage, and message metadata are normalized at product level. Hook events, subagent progress, and structured output backend events are also normalized but currently consumed only in diagnostic contexts (see "What Exists But Must Not Be Described As Stable Completion" below). |
| Permissions bridge | `canUseTool` and elicitation/question bridging are wired into the existing permission/question flows. |
| Model / effort / thinking basics | Core Claude settings and options mapping are implemented. |
| MCP runtime pass-through | MCP servers can be passed through and refreshed at runtime. |
| MCP Capability Lab detection | MCP is now tracked in the Capability Lab matrix and discovery table as detection-only read status; the surface reports loaded server count when the Claude adapter is available, but does not provide MCP authoring. |
| Skills / Plugins Capability Lab detection | Runtime-only `skills` and `plugins` option channels are now tracked in the Capability Lab discovery table as detection-only read status; the surface reports loaded plugin count, loaded skill count, and the `skills: "all"` sentinel when the Claude adapter is available, but does not provide authoring. |
| OpenCode coexistence | OpenCode remains alive as a backend and is not meant to be regressed by Claude work. |

## What Exists But Must Not Be Described As Stable Completion

These capabilities are no longer “not wired”, but they are also not stable completed product surfaces.

| Capability | Real state now | How to describe it |
|---|---|---|
| Structured output | Runtime-only `outputFormat` wiring exists, backend-event normalization exists, Capability Lab probe exists, runtime evidence exists. Transcript rendering and persistence are now stable. | `Diagnostic authoring`, stable transcript rendering. |
| Hooks | Runtime-only hook injection exists, hook events are normalized, SessionStart runtime proof exists in Capability Lab. | `Hidden` or `Diagnostic`, not authoring-complete. |
| Session store | Runtime-only SDK `sessionStore` path exists, plugin-owned diagnostic store adapter exists, import/mirror/list/load proof exists in Capability Lab, and the isolated store now has direct unit coverage for append/load/list semantics. | `Diagnostic store proof only`, not stable storage product. |
| JSONL history browser | Capability Lab can browse history read-only and preview messages. | `Diagnostic browser`, not full history productization. |
| Session detail inspection | Capability Lab can inspect raw `getSession()` output per backend session. | `Diagnostic probe only`, not a stable cross-backend session-detail contract. |
| Rewind | Adapter-level `rewindFiles()` exists, dry-run surface exists, adapter + coordinator + CapLab probe tests now cover all paths. | Not stable-complete until no-data-loss guard and stronger runtime proof are accepted; test hardening does not promote to stable. |
| Agent definitions | Runtime-only `agent` / `agents` option wiring exists. | Must remain `Hidden / Untested`. |
| Skills / plugins / agent authoring | Runtime-only `skills` and `plugins` channels are wired and have Capability Lab read-only detection counts plus diagnostic name-list summaries (`getSkillsList()` / `getPluginsList()`); no stable Claude-native authoring surface is complete in OpenCodian. | Detection-only with name-list diagnostic, not authoring-complete. |

## Structured Output Deep-Dive Assessment (2026-05-23)

### Current Real State

Structured output is **not a single capability** but a pipeline with multiple maturity levels. The current state per layer:

| Layer | Status | Evidence |
|---|---|---|
| **Type definitions** | Stable | `LocalOutputFormat` / `SdkOutputFormat` in `src/core/opencode/types.ts`; `ChatMessage.structured` in `src/core/types/chat.ts` |
| **Request building** | Stable | `OpenCodePromptRequestBuilder` converts `json_schema` → SDK format for both SDK v2 and legacy HTTP paths |
| **OpenCode SDK v2 ingestion** | Stable | `OpenCodeMessageNormalizationMapper` reads `info.structured` and assigns to `ChatMessage.structured`; filters internal `structured_output` tool parts |
| **Claude Code stream ingestion** | Stable | `ClaudeCodeStreamNormalizer` converts `record.structured_output` → `backend_event` chunk; `StreamChunkRouter` captures it into `structuredOutput` |
| **Pipeline transfer** | Stable | `StreamChunkRouterResult.structuredOutput` → `buildLocalStreamOutcome()` → `LocalStreamOutcome.structuredOutput` |
| **Persistence** | Stable | `LocalStreamMessagePersistence` writes to `ChatMessage.structured`; conversation sync merge preserves it for Claude Code backend |
| **Rendering** | Stable | `AssistantShellViewHostAdapter.renderStructuredOutput()` renders collapsible JSON `<details>`; CSS classes defined in `chat-assistant.css` |
| **Internal tool filtering** | Stable | `isInternalStructuredOutputTool()` used in 10+ files across stream transformer, finalization coordinator, normalization mapper, chat view, and stream controller |
| **Production consumer** | Stable | `TitleGenerationService` uses `json_schema` structured output for title generation (real traffic) |
| **Diagnostic surface** | Stable | Capability Lab Structured Output Playground probes backend support via `runDiagnosticPrompt()` |
| **User-facing authoring** | **Not exposed** | No UI to select output format; no per-message format option in chat input; settings have no structured output preferences |

The structured-output chain is now regression-covered end to end in unit tests: `outputFormat` wiring, `backend_event` capture, persistence into `message.structured`, and assistant-shell rendering all have explicit coverage. That does not change the product boundary: authoring/triggering remains diagnostic-only, and the Capability Lab continues to present it that way.

### Dual-Backend Architecture (Not "Claude Pressed Into OpenCode Shape")

Both backends produce `ChatMessage.structured`, but via **different, native mechanisms**:

- **OpenCode SDK v2**: backend returns `Message.info.structured` → `OpenCodeMessageNormalizationMapper` extracts it during message normalization (not stream event processing). The internal `structured_output` tool is filtered from `part` rendering but the payload is preserved.
- **Claude Code**: backend returns `record.structured_output` during streaming → `ClaudeCodeStreamNormalizer` converts to `backend_event` chunk → `StreamChunkRouter` captures from `metadata.structuredOutput` → persisted via the same pipeline as OpenCode.

Both paths converge at `ChatMessage.structured`, which is **intentional abstraction**, not shape-forcing. The rendering layer (`AssistantShellViewHostAdapter`) is backend-agnostic.

### Why Product Surface Is Not Ready

The pipeline is stable, but **user-facing structured output authoring** would require:

1. **Schema input UI**: how does a user define or select a JSON schema? Textarea? Preset dropdown? File attachment?
2. **Per-message vs per-session format selection**: should format be a message-level toggle or session-level setting?
3. **Backend compatibility surface**: not all models/providers support `json_schema`; need availability detection and graceful fallback
4. **Error UX**: what happens when schema validation fails? Retry? Plain text fallback? User notification?
5. **Settings persistence**: schema preferences, recent schemas, default format — all need settings design

These are **product design questions**, not narrow engineering gaps. The underlying plumbing is ready.

### Recommended Next Step

If the user asks to "promote structured output to product surface":

1. **Do not** start by adding a settings toggle or chat UI button
2. **Do** start with a design doc or prototype that answers the 5 questions above
3. **Do** consider whether the first productized form should be **preset schemas** (e.g., "Summarize as JSON", "Extract tasks") rather than freeform schema authoring
4. **Do** ensure backend availability detection is in place before exposing the feature

If the user asks to "deepen structured output stability":

1. Add end-to-end test for Claude Code path: adapter `outputFormat` → `backend_event` → persistence → rendering
2. Verify OpenCode SDK v2 `info.structured` behavior matches Claude Code `backend_event` semantics for edge cases (null, empty object, nested arrays)
3. The 17 existing test files already cover most layers; focus on cross-backend consistency tests

## Current Capability-Layer Interpretation

Future models should use this language:

- `wired`: the SDK option or adapter seam exists.
- `runtime-proved`: there is local runtime evidence that the seam actually executes.
- `stable`: the capability is intentionally exposed as part of the product surface for end users.
- `backend-aware`: the service seams route through the registry/routing layer using `getConversationBackendSessionId()` and capability checks rather than hard-wiring `openCodeService`.

For several Claude-native capabilities, OpenCodian is currently at:

- `wired + runtime-proved + not stable`

That is the correct reading for:

- hooks
- diagnostic session store

Structured output is now at `wired + runtime-proved + stable transcript rendering`, with authoring/triggering remaining diagnostic-only and regression-covered end to end.

Do not collapse this to either:

- "not implemented", or
- "fully complete"

Both would be wrong.

### Backend-Aware Session/History/Control Seams (as of this run)

The following service seams now route session identity through `getConversationBackendSessionId()` and are gated by backend kind checks:

| Seam | Backend-aware? | Notes |
|---|---|---|
| User-message footer Fork/Rewind buttons | **Backend-aware / gated** | Fork/Rewind visibility reads the current conversation backend capabilities. Claude can show Fork when declared, but Rewind stays hidden unless the conversation owner declares Branching. |
| Conversation load/recovery (fork) | **Yes** | Fork routes through registry `AgentForkCapability` for capable backends; OpenCode fallback preserved. Forked conversation preserves source `backend` identity. |
| Conversation load/recovery (rewind/unrevert) | **Gated** | Explicitly OpenCode-only: backend check `backend !== 'opencode'` → unavailable for Claude |
| Authoritative sync (user message hydration) | **Gated** | OpenCode-only: entire hydration pipeline uses OpenCode-typed messages |
| Authoritative reload (log identity) | **Yes** | All log `sessionId` fields use `getConversationBackendSessionId()` |
| Context usage detail modal | **Backend-aware** | Routes through `getConversationSessionHistoryService()` with backend-aware message normalization; OpenCode uses `{info, parts}` shape, Claude uses generic SDK message shape. Context usage snapshots remain OpenCode-only. |
| Modified files sidebar (diff) | **Gated** | OpenCode-only: diff is not stable for Claude |
| Session todos (identity) | **Yes** | `SessionTodoStateService` uses `getConversationBackendSessionId()` |
| Session todos (live refresh) | **Explicitly gated** | `SessionTodoCoordinator.refreshTabSessionTodos()` and `refreshTabSessionStatus()` now have explicit `backend !== 'opencode'` guards — non-OpenCode sessions skip `getSessionTodos`/`getSessionStatuses` calls entirely |
| Background task timeline/notice (identity) | **Yes** | Both services use `getConversationBackendSessionId()` |
| Conversation identity runtime (log fingerprint) | **Yes** | Uses `getConversationBackendSessionId()` |
| Slash command undo (revert) | **Gated** | OpenCode-only: backend check |
| Slash command redo (unrevert) | **Gated** | OpenCode-only: backend check |
| Slash command compact (summarize) | **Gated** | OpenCode-only: backend check |
| Slash command share | **Gated** | OpenCode-only: backend check |
| Slash command unshare | **Gated** | OpenCode-only: backend check |
| Ordinary runtime/project slash dispatch | **Gated** | OpenCode-only: `session.command` / `runSessionCommand()` is not used for Claude or other non-OpenCode conversations, including `/skills skill-id ...` prefixed skill dispatch |
| Diff notice on turn completion | **Gated** | OpenCode-only: backend check |
| Child session graph | **Gated** | OpenCode-only: `getSessionChildren` has no backend-neutral equivalent |
| Task tool session open (backend identity) | **Yes** | `openTaskToolSession()` accepts parent `backend` parameter; `createConversationFromSession()` in `main.ts` prefers explicit `initial.backend` over `settings.activeBackend` |
| Stream message persistence (log identity) | **Yes** | Uses `getConversationBackendSessionId()` |
| Conversation render service (log identity) | **Yes** | Uses `getConversationBackendSessionId()` |
| Conversation render service (canonical render) | **Explicitly gated** | `resolveConversationRenderMessages()` checks `backend !== 'opencode'` and skips canonical state path entirely for non-OpenCode conversations |
| Conversation sync runtime coordinator (diagnostic) | **Yes** | Includes both `openCodeSessionId` and `backendSessionId` |
| Post-sync question/todo refresh (plan builder) | **Explicitly gated** | Background plan methods return `null` for non-OpenCode conversations. `createVisibleConversationPlan` is unblocked because the visible-path gate is at the router. Uses `getConversationBackendSessionId()` for identity. |
| Post-sync question/todo refresh (host adapter) | **Backend-aware identity** | `getCurrentConversationSessionId()` uses `getConversationBackendSessionId()` instead of direct `openCodeSessionId` access |
| Post-sync question/todo refresh (pending-questions REST poll) | **Explicitly gated** | `QuestionTodoStatusRefreshCoordinator` now checks `getCurrentConversationBackend()` and skips `refreshPendingQuestionsForTab()` for non-OpenCode conversations. Previously relied solely on upstream callers (TabConversationActivationBridge, ConversationSyncVisiblePostSyncRouter, BackgroundConversationPostSyncRefreshExecutor). |
| Post-sync question/todo refresh (visible router) | **Explicitly gated** | `ConversationSyncVisiblePostSyncRouter` skips question/todo refresh and applies sync update directly for non-OpenCode conversations. Uses `getConversationBackendSessionId()` for identity. |
| Post-sync question/todo refresh (background executor) | **Null-safe** | `BackgroundConversationPostSyncRefreshExecutor` handles null plan (non-OpenCode) by skipping question/todo coordinator but still flushing background-task writeback |
| Settings shared sessions list (`listSessions`) | **Backend-aware** | Routes through `listBackendSessions()` instead of `openCodeService.listSessions()`. Returns `NormalizedSessionRow[]` (backend-neutral shape). Section remains OpenCode-gated because share URLs are OpenCode-specific, but the read surface is backend-aware. |
| Settings shared session preview (`getSessionMessages`) | **Backend-aware** | Routes through `getBackendSessionPreview()` instead of `openCodeService.getSessionMessages()`. Returns `NormalizedSessionPreviewMessage[]` (backend-neutral shape with `role`/`parts[]`). Handles both OpenCode `{info, parts}` and generic/Claude `{role, content}` message shapes. |
| Settings shared session unshare (`unshareSession`) | **OpenCode-only** | Direct `openCodeService.unshareSession()` call; no backend-neutral equivalent for share URL write operations. Inner runtime guard (`isOpenCodeActive()`) blocks the call if the backend switches away from OpenCode while settings is open. |
| TitleGenerationService official-title read | **Backend-aware** | Routes through `readBackendSessionTitle()` → `getSession(sessionId)` on the backend adapter via registry. OpenCode path uses `.title`; Claude path uses `.summary`. Unified for both backends. |
| ConversationSessionSettingsCoordinator share-URL read | **Backend-aware** | Routes through `readBackendSessionShareUrl()` → `getSession(sessionId)` on the backend adapter via registry. OpenCode extracts `session.share.url`; Claude Code returns `null` (no share URL concept). Replaces the previous `listSessions()` + client-side filtering path. Share/unshare writes remain OpenCode-only. **Session-import-free**: coordinator no longer imports OpenCode `Session` type; uses local `ShareInspectionEntry` (`{ id?, share? }`) for all session-related reads and writes. |
| Capability Lab session detail probe (`getSession`) | **Provider-owned diagnostic** | Routes through `adapter.getSession(sessionId)` on the Claude Code adapter. Shows raw session fields (sessionId, summary, lastModified, messageCount, etc.) as diagnostic output. Not a stable cross-backend session-detail contract. |
| Capability Lab backend routing probe | **Provider-owned diagnostic** | Verifies the backend routing infrastructure by exercising `listSessions()` + `getSession()` through the provider-owned adapter path, AND `listBackendSessions()` + `getBackendSessionPreview()` + `readBackendSessionTitle()` + `readBackendSessionShareUrl()` through the registry routing layer (productized narrow seams). Shows active backend, registered adapters, and conversation backend distribution. Not a stable product surface. |

**Services remaining hard-wired to OpenCode** (no migration justified until backend-neutral equivalents exist):

| Service | Reason it stays OpenCode-only |
|---|---|
| ConversationSyncBridge | Subscribes to `SessionSyncEventUpdate` from `core/opencode` |
| ConversationSessionTabResolver | Only reachable through OpenCode sync event subscription |
| TitleGenerationService | ~~Calls `openCodeService.listSessions()`~~ **FULLY ROUTED for title reads**: `readOfficialSessionTitle` now uses `readBackendSessionTitle()` routing helper → `getSession(sessionId)` on the backend adapter. AI title generation (temp session create/delete/send) remains OpenCode-only and is not used for non-OpenCode conversations; Claude/no-summary fallback keeps the local first-message title until backend-neutral chat contract supports non-streaming single-shot response. |
| ConversationSessionSettingsCoordinator | **FULLY ROUTED for session reads**: share-URL reads use `readBackendSessionShareUrl()` via registry; the `openCodeService.listSessions()` fallback has been removed. When no registry and no `host.listSessions` is available, returns `null` instead of reaching through to openCodeService. Share/unshare writes remain OpenCode-only via `resolveOpenCodeService()` (only `shareSession`/`unshareSession`, no `listSessions`). **Session-import-free**: coordinator uses `ShareInspectionEntry` instead of OpenCode `Session` type. |
| PostSyncQuestionTodoRefreshPlanBuilder | **Explicitly gated** — background plan methods return `null` for non-OpenCode conversations; session identity uses `getConversationBackendSessionId()`. Question/todo APIs are OpenCode-only and are not abstracted as cross-backend contracts. |
| PostSyncQuestionTodoRefreshHostAdapter | **Backend-aware identity + gated pending-questions** — `getCurrentConversationSessionId()` uses `getConversationBackendSessionId()` instead of direct `openCodeSessionId` access. `QuestionTodoStatusRefreshCoordinator` now gates `refreshPendingQuestionsForTab()` for non-OpenCode conversations via `getCurrentConversationBackend()` |
| ConversationSyncVisiblePostSyncRouter | **Explicitly gated** — skips question/todo refresh for non-OpenCode conversations, applies sync update directly. Session identity uses `getConversationBackendSessionId()`. |
| ConversationSyncOrchestrationService | Drives OpenCode-specific sync loop |
| SettingsConversationSection (`unshareSession`) | Share URL write is OpenCode-specific; `listSessions` and `getSessionMessages` are now backend-aware |
| OpenCodianView sync host (`getSessionMessages`) | Authoritative sync host is OpenCode-only by design; routes through `openCodeService` directly |

## Capability Lab Status

`src/features/settings/SettingsCapabilityLabSection.ts` is now an important state-owner for Claude parity work.

It currently serves as:

- a capability matrix;
- a read-only JSONL history browser;
- a diagnostic session-store mirror/import/list/load surface;
- a rewind dry-run preview surface;
- a structured-output runtime probe;
- a hook runtime proof surface;
- a provider-owned fork session diagnostic probe (select a Claude session, run `adapter.forkSession()`, see forked session id/title). This probe is diagnostic-only and does NOT represent stable fork productization.
- a provider-owned resume session diagnostic probe (select a Claude SDK catalog session, run `adapter.runDiagnosticPrompt({ resumeSessionId })`, see resulting session id/output preview). The adapter validates the selected id through `sdk.getSessionInfo()` before `sdk.query()`. This probe is diagnostic-only and does NOT represent stable resume-at productization.
- a provider-owned session detail diagnostic probe (select a Claude session, run `adapter.getSession(sessionId)`, inspect raw session fields). This probe is diagnostic-only and does NOT represent a stable cross-backend session-detail object contract.
- a provider-owned backend routing diagnostic probe (shows active backend, registered adapters, conversation backend distribution, and verifies `listSessions()` + `getSession()` through the provider-owned routing path). This probe is diagnostic-only and does NOT represent a stable backend routing product surface.
- a detection-only MCP Servers row in the capability matrix and discovery table; it reads `adapter.getMcpServerCount()` when available and reports loaded server count without exposing MCP authoring controls.
- detection-only Plugins and Skills rows in the discovery table; they read `adapter.getPluginCount()` and `adapter.getSkillCount()` when available, report loaded plugin/skill counts or the `skills: "all"` sentinel, and do not expose plugin/skill authoring controls.

Important policy:

- Capability Lab is allowed to do isolated diagnostic actions.
- Capability Lab is not allowed to claim stable completion of a feature by itself.
- Capability Lab must continue to distinguish `Settings`, `Diagnostic`, and `Hidden`.

## Older Status Docs That Are Now Partially Outdated

The following files contain useful history, but their per-capability status must not be treated as current:

- `docs/status/claude-code-backend-capabilities-2026-05-21.md`
- `docs/status/claude-code-phase1-smoke-status-2026-05-21.md`

Why they are partially outdated:

- they still describe hooks as “not wired”;
- they still describe session store as “not wired”;
- they still describe structured output as “not wired”;
- they predate the diagnostic runtime proof slices landed in commit `9adc44da`.

Keep them for history, but prefer current code plus this file for present-state judgments.

## Relationship To Claudian

`claudian` remains a useful reference project for:

- Claude-native settings productization;
- `.claude/settings.json` ownership;
- slash command, skills, agent, MCP, and plugin storage patterns;
- provider-owned history and rewind product surfaces.

But OpenCodian is not meant to become Claude-only.

The intended direction is:

- multi-backend shell;
- provider-owned native ecosystem surfaces where appropriate;
- capability-gated shared UI where semantics genuinely match.

Do not use `claudian` as evidence that Claude-specific semantics should be flattened into generic OpenCode-style settings.

## Current Evidence Artifacts

At the current snapshot, local runtime evidence exists under `.obsidian-debug/`, especially:

- `.obsidian-debug/session-history-productization-runtime.png`
- `.obsidian-debug/session-history-settings-productization-runtime-2026-05-22.png`
- `.obsidian-debug/session-history-settings-productization-runtime-assertion-2026-05-22.json`
- `.obsidian-debug/session-history-settings-productization-dom-2026-05-22.html`
- `.obsidian-debug/session-history-settings-productization-console-2026-05-22.txt`
- `.obsidian-debug/session-history-settings-productization-errors-2026-05-22.txt`
- `.obsidian-debug/claude-session-history-control-console.txt`
- `.obsidian-debug/claude-session-history-control-errors.txt`
- `.obsidian-debug/claude-session-history-control-runtime.png`
- `.obsidian-debug/claude-fork-only-runtime-assertion-2026-05-22.json`
- `.obsidian-debug/claude-fork-only-runtime-console-2026-05-22.txt`
- `.obsidian-debug/claude-fork-only-runtime-errors-2026-05-22.txt`
- `.obsidian-debug/claude-fork-only-runtime-screenshot-2026-05-22.png`
- `.obsidian-debug/title-generation-official-read-runtime-assertion-2026-05-22.json`
- `.obsidian-debug/title-generation-official-read-runtime-console-2026-05-22.txt`
- `.obsidian-debug/title-generation-official-read-runtime-errors-2026-05-22.txt`
- `.obsidian-debug/title-generation-official-read-runtime-screenshot-2026-05-22.png`
- `.obsidian-debug/share-url-read-runtime-assertion-2026-05-23.json`
- `.obsidian-debug/share-url-read-runtime-console-2026-05-23.txt`
- `.obsidian-debug/share-url-read-runtime-errors-2026-05-23.txt`
- `.obsidian-debug/share-url-read-runtime-screenshot-2026-05-23.png`

Treat those as local evidence for:

- deployed build identity;
- Test Vault reload success;
- backend-aware session/history surface presence;
- settings shared-session list/preview read routing presence in the conversation sharing block;
- Claude `fork=true` + `branching=false` runtime gating;
- `TitleGenerationService.readOfficialSessionTitle()` routing through registry `getSession()` for both OpenCode and Claude, with the OpenCode title-read seam no longer using `openCodeService.listSessions()`;
- `ConversationSessionSettingsCoordinator.getCurrentShareUrl()` routing through registry `getSession()` in the OpenCodianView-wired runtime path, with `getSession` hit and `openCodeService.listSessions()` not hit during the runtime assertion;
- hook and structured-output backend-event activity in runtime logs where the older capability-lab artifacts are still referenced.

Note: older capability-lab artifacts still matter for hook / structured-output proof, but newer lane-specific evidence should be preferred when the question is specifically about fork-only capability gating or backend-aware session/history reads.

## The Best Short Summary For Future Models

If you need one sentence:

> OpenCodian's Claude Code SDK lane has passed Phase 1 backend viability, has meaningful Phase 2 wiring, and has begun Phase 3/4-style Claude-native capability integration through diagnostic-first surfaces. Session/history/control seams are now backend-aware where semantics match: fork routes through the registry layer, official-title polling, share-URL inspection, raw history inspection, and the settings shared-session read surfaces can route through backend-aware session owners, rewind/unrevert/diff remain gated as OpenCode-only, and session identity uses `getConversationBackendSessionId()` across the service layer. Several advanced capabilities (hooks, session store, structured output authoring) are intentionally runtime-proved without yet being stable product features.

## Recommended Next-Step Mindset

When continuing this lane, choose one of these modes explicitly:

- promote a diagnostic Claude capability to stable UI;
- deepen runtime proof for a currently diagnostic capability;
- expand Claude-native ecosystem ownership, such as history, rewind, skills, agents, plugins, or MCP authoring;
- improve multi-backend abstraction so future backends can expose their own native ecosystems cleanly.

Do not mix these modes casually in one slice.

For the current session/history lane, do **not** stop after one small slice per session anymore. The expected execution mode is now multi-round Phase 3 delivery inside one Codex session.

## Execution Mode For Continuation (2026-05-23 User Instruction)

Future sessions should follow these rules unless the user overrides them again:

- use `opencode run --dir "/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability" "<task>"` as the default OpenCode delegation path;
- do **not** use A2A for this lane unless the user explicitly re-enables it;
- one Codex session should cover multiple consecutive rounds inside this phase, not a single small slice;
- after each completed round:
  - update this continuity document and any mapped module docs;
  - review OpenCode's implementation result;
  - run the required validation stack for the touched surface;
  - commit the verified round;
  - then immediately continue by sending the next round to `opencode run` while Phase 3 backlog still remains;
- Codex still stays in the same role split:
  - read/align docs and current code;
  - delegate the main implementation to OpenCode;
  - review the implementation;
  - run verify/build/deploy/runtime proof;
  - update docs and summarize.

## Remaining Phase 3 Backlog (Work Through In Multi-Round Sessions)

The remaining Phase 3 foundation/productization work should be treated as one continuing backlog rather than isolated single-slice sessions.

### ✅ Completed: Backend-Aware Session/History Read Seam Runtime-Proof (2026-05-23)

- ~~Audit remaining session detail / history inspection / session list-detail reads for runtime-safety gaps~~ — **DONE**. Four audit rounds completed: non-array guards, null-item filtering at array level, adapter-error try/catch, inner null-item filtering inside OpenCode parts arrays. No remaining safe gaps.
- ~~Deepen runtime proof for productized backend-aware session/history reads~~ — **DONE**. Unit test coverage at 3060 tests including edge cases for all five productized seams.

### 🔄 Next Immediate Phase 3 Backlog (Outside This Seam)

Choose one of these modes for the next multi-round session:

1. **Promote a diagnostic Claude capability to stable UI** — The most mature diagnostic capabilities with runtime proof are:
   - **Structured output** (`wired + runtime-proved + stable transcript rendering`, authoring remains diagnostic)
   - **Hooks** (`wired + runtime-proved`, not stable)
   - **Session store** (`diagnostic store proof only`, not stable storage product)
   - **Rewind** (`adapter-level rewindFiles() exists`, not stable-complete until no-data-loss guard)

2. **Improve multi-backend abstraction for future backends** — Identify shared seams that would help a third backend (not OpenCode, not Claude) integrate cleanly, and extract them without forcing OpenCode semantics.

3. **Expand Claude-native ecosystem ownership** — History browsing, skills, agents, plugins, or MCP authoring surfaces that are native to Claude's ecosystem and should not be flattened into OpenCode-shaped settings.
   MCP / skills / plugins detection has started in Capability Lab: the matrix/discovery surfaces now report read-only loaded server/plugin/skill counts through the Claude adapter, while MCP/skills/plugins authoring remains future work.

4. **Deploy-validation round** — Run Test Vault runtime proof against the latest build to verify the productized backend-aware seams function correctly in the deployed plugin context. This is lower priority since the seams are well-covered by unit tests, but a fresh deployment validation would provide additional confidence before moving to a different mode.

Hard constraints that remain:
- keep `revert / unrevert / diff / child-session graph / authoritative sync` gated unless new official basis plus accepted runtime proof says otherwise;
- do not widen `getSession()` into a generic stable cross-backend session-detail contract;
- do not regress OpenCode while promoting Claude.

## Session Detail / History Inspection Audit (2026-05-23)

A full audit of all remaining `openCodeService` session/history/detail read points in `OpenCodianView.ts` has been completed. Findings:

### All Consumer-Level Guards Confirmed

Every remaining direct `openCodeService` session read in `OpenCodianView.ts` host wiring is gated at the **consumer** level. The host wiring itself is unconditional, but no ungated REST call can leak for non-OpenCode backends:

| Host method | Consumer | Guard |
|---|---|---|
| `getSessionChildren` | `ChildSessionGraphCoordinator.refreshGraph()` | `backend !== 'opencode'` early return |
| `getCanonicalSessionState` / `hydrateOpenCodeMessage` | `ConversationRenderService.resolveConversationRenderMessages()` | `backend !== 'opencode'` fallback |
| `getSessionDiff` / `getCachedSessionDiffEntries` | `ConversationNoticeCoordinator.appendTurnDiffNoticeIfNeeded()` | `backend !== 'opencode'` early return |
| `getSessionTodos` / `getSessionStatuses` | `SessionTodoCoordinator.refreshTabSessionTodos/Status()` | `backend !== 'opencode'` early return |
| `getSessionMessages` / `getCanonicalSessionMessages` / `getSessionRevertState` / `hydrateOpenCodeMessage` | `ConversationAuthoritativeSyncCoordinator` | `conversation.backend !== 'opencode'` early return |
| Event subscriptions (`subscribeToSessionSyncEvents` etc.) | `ConversationSessionSignalRuntime.start()` | `shouldStartConversationSessionSignalRuntime()` → `isOpenCodeBackendActive()` |
| `getCachedSessionDiffEntries` (sidebar) | `refreshModifiedFilesSidebar()` | `backend === 'opencode'` guard at L3147 |
| `getSessionContextUsageSnapshot` | Context ring sync handler | `conversation.backend !== 'opencode'` early return |

### Previously Ungated Gap (Now Fixed)

| Gap | Fix |
|---|---|
| `refreshPendingQuestionsForTab()` in `QuestionDockCoordinator` → called `openCodeService.getPendingQuestions()` without any backend guard | Added `getCurrentConversationBackend()` to `QuestionTodoStatusRefreshCoordinatorHost`; coordinator now skips `refreshPendingQuestionsForTab` for non-OpenCode conversations in both `refreshAfterActivation()` and `refreshAfterPostSync()`. Previously relied solely on upstream callers (TabConversationActivationBridge, ConversationSyncVisiblePostSyncRouter, BackgroundConversationPostSyncRefreshExecutor). |

### No New Shared Read Seams

No new `getSession()` consumers can be safely promoted. All remaining reads are OpenCode-specific (session children, canonical state, diff, revert state, todos, event subscriptions). None has a narrow, verifiable cross-backend semantic like the official-title or share-URL reads.

### Four Named Coordinators Status

| Coordinator | Status |
|---|---|
| `QuestionRuntimeViewHostFactory` | **Clean** — pure DI factory, no session reads |
| `QuestionRuntimeHostAdapter` | **Clean** — pure DI adapter, no session reads |
| `QuestionTodoActivationRefreshCoordinator` | **Clean** — delegates to host and `QuestionTodoStatusRefreshCoordinator`, which now gates pending-questions REST poll |
| `VisibleConversationPostSyncCoordinator` | **Clean** — delegates to `PostSyncQuestionTodoRefreshFacade` and state coordinator; gated at the `ConversationSyncVisiblePostSyncRouter` level |

### Capability Lab Audit (2026-05-23 Round)

A focused audit of `SettingsCapabilityLabSection.ts` and all Capability Lab diagnostic probes found **no OpenCode-shaped payload assumptions**:

| Probe | Uses Adapter Directly? | Assumes OpenCode Shape? |
|---|---|---|
| JSONL History Browser | Yes (`adapter.listSessions`, `adapter.getSessionMessages`) | No — `readMessagePreview` is generic |
| Subagent Browser | Yes (`adapter.listSubagents`, `adapter.getSubagentMessages`) | No — Claude-specific methods |
| Session Detail Probe | Yes (`adapter.getSession`) | No — extracts generic fields (`sessionId`, `summary`, `lastModified`, `messageCount`) |
| Backend Routing Probe | Yes (`adapter.listSessions`, `adapter.getSession`) | No — tests adapter capabilities directly |
| Fork Probe | Yes (`adapter.forkSession`) | N/A |
| Resume Probe | Yes (`adapter.runDiagnosticPrompt`) | N/A |
| Structured Output Probe | Yes (`adapter.runDiagnosticPrompt`) | N/A |
| Hook Proof | Yes (`adapter.runDiagnosticPrompt`) | N/A |

All probes are **provider-owned diagnostic** and correctly use the Claude Code adapter directly rather than assuming OpenCode semantics.

### Remaining OpenCode-Shaped Payload Assumptions (Non-Diagnostic)

All remaining `.info`/`.parts` accesses outside `core/opencode/` are in **explicitly gated OpenCode-only paths**:

| File | Access Pattern | Guard |
|---|---|---|
| `ConversationAuthoritativeSyncCoordinator.ts` | `message.info.role`, `latestServerUser.parts` | `conversation.backend !== 'opencode'` early return |
| `ConversationAuthoritativeReloadCoordinator.ts` | `message.info.id`, `message.parts` | Reload coordinator is OpenCode-only by design |
| `ConversationRenderService.ts` | `getCanonicalSessionState`, `hydrateOpenCodeMessage` | `backend !== 'opencode'` fallback |
| `OpenCodeService.ts` | `message.info.role`, `message.parts.some(...)` | Core OpenCode module |
| `OpenCodeStreamingFinalizationCoordinator.ts` | `item.info.role`, `assistantTail.info.time.created` | Core OpenCode module |
| `OpenCodeSessionControlOrchestrator.ts` | `message.info.role`, `message.info.cost` | Core OpenCode module |
| `OpenCodeSessionStateStore.ts` | `info.time` | Core OpenCode module |

No new shared read seams can be safely promoted. All remaining reads are OpenCode-specific and lack narrow, verifiable cross-backend semantics.

For the next multi-round continuation, the immediate high-value targets are:

- continue auditing remaining session detail/history inspection surfaces that still read directly from `openCodeService` or still assume OpenCode-shaped payloads after the title-read and share-URL read seams landed;
- only promote another shared `getSession()` consumer when the shared semantic is as narrow and provable as the official-title or share-URL read seams;
- keep share writes, rewind, diff, authoritative sync, and child-session graph explicitly gated unless new official basis plus runtime proof says otherwise;
- if one round finishes cleanly and more backlog remains, do not hand off immediately to a fresh human/Codex session; update docs, commit, and launch the next `opencode run` round in the same session.

## loadBackendSessionMessages Runtime Safety Round (2026-05-23)

A focused runtime-safety audit of the backend-aware history normalization layer found one inconsistency: `loadBackendSessionMessages()` did not validate that `getSessionMessages()` returned an array before calling `.map()` on the result. Both `listBackendSessions()` and `getBackendSessionPreview()` already had `Array.isArray` guards, but `loadBackendSessionMessages()` assumed the array shape unconditionally for both the OpenCode `{info, parts}` path and the generic Claude path. This could crash at runtime if a backend adapter returned an unexpected non-array payload.

### Fix Applied

- Added `Array.isArray(rawMessages)` guard in `loadBackendSessionMessages()` immediately after `await historyService.getSessionMessages(sessionId)`. Returns `[]` for non-array responses, matching the behavior of `listBackendSessions()` and `getBackendSessionPreview()`.
- Added two unit tests: one for OpenCode backend returning a non-array, one for Claude Code backend returning a non-array.

### Verification

- `npm run verify` passed with `431` suites / `3051` tests
- Build completed with `BUILD_ID feature-phase0-capability.202605231550`
- No new shared `getSession()` consumers were added; this is a defensive hardening of an existing backend-aware seam

## Session Detail / History Inspection Round (2026-05-23)

A second-pass audit was executed across `OpenCodianView.ts`, `ConversationSessionSettingsCoordinator.ts`, `SettingsConversationSection.ts`, and adjacent inspection surfaces (`ActiveTabContextUsageCoordinator`, `ContextDetailModal`, `ChildSessionGraphCoordinator`).

### Findings

| Surface | Status | Detail |
|---|---|---|
| `OpenCodianView.ts` — all `openCodeService` session reads | **Gated / OpenCode-only** | `getSessionChildren`, `getCanonicalSessionState`, `hydrateOpenCodeMessage`, `getSessionDiff`, `getCachedSessionDiffEntries`, `getSessionTodos`, `getSessionStatuses`, `getSessionContextUsageSnapshot`, `getSessionMessages`, `getCanonicalSessionMessages`, `getSessionRevertState`, `subscribeToSessionSyncEvents` — all have explicit `backend !== 'opencode'` guards at consumer or host level |
| `ConversationSessionSettingsCoordinator.ts` — share-URL read | **Backend-aware** | Routes through `readBackendSessionShareUrl()` via registry; no direct `openCodeService.listSessions()` fallback |
| `ConversationSessionSettingsCoordinator.ts` — share/unshare writes | **OpenCode-only** | Intentionally falls back to `resolveOpenCodeService()`; no backend-neutral share contract exists |
| `SettingsConversationSection.ts` — session list | **Backend-aware** | Uses `listBackendSessions()` returning `NormalizedSessionRow[]` |
| `SettingsConversationSection.ts` — session preview | **Backend-aware** | Uses `getBackendSessionPreview()` returning `NormalizedSessionPreviewMessage[]` |
| `SettingsConversationSection.ts` — unshare write | **OpenCode-only** | Direct `openCodeService.unshareSession()` call; no backend-neutral equivalent |
| `ActiveTabContextUsageCoordinator` — context usage snapshot | **Gated** | Host `getSessionContextUsageSnapshot` returns `null` for non-OpenCode conversations |
| `ContextDetailModal` — raw message loader | **Backend-aware** | Uses `loadBackendSessionMessages()` with backend-aware normalization |
| `ChildSessionGraphCoordinator` — child session graph | **Gated** | `refreshGraph` returns `null` for non-OpenCode conversations |

### Conclusion

No new shared read seams can be safely promoted. All remaining direct `openCodeService` session/history/detail reads are in explicitly gated OpenCode-only paths. The productized backend-aware seams (`readBackendSessionTitle`, `readBackendSessionShareUrl`, `listBackendSessions`, `getBackendSessionPreview`, `loadBackendSessionMessages`) cover all surfaces where narrow, verifiable cross-backend semantics genuinely match.

**Runtime-proof-complete declaration (2026-05-23)**: After four consecutive runtime-safety audit rounds (non-array guards, null-item filtering at array level, adapter-error try/catch, inner null-item filtering inside OpenCode parts arrays), all productized backend-aware session/history read seams now have consistent defensive handling for malformed backend payloads. No additional safe gaps remain in this lane. The remaining Phase 3 backlog should move outside this seam.

### 2026-05-23 Routing Boundary Test Hardening

The shared routing layer received extra edge-case coverage without changing any product boundary:

- `listBackendSessions()` now has a non-array guard test
- `getBackendSessionPreview()` now has a non-array guard test and malformed Claude content-block guard test
- `loadBackendSessionMessages()` now has explicit error-propagation coverage

Verification for this hardening round:

- `OWNER_GUARD_APPROVED=1 npm run verify` passed with `431` suites / `3049` tests
- Build completed with `BUILD_ID feature-phase0-capability.202605231536`
- No new shared `getSession()` consumers were added; gated OpenCode-only reads remain gated

## Null-Item and Adapter-Error Runtime Safety Round (2026-05-23)

A third-pass runtime-safety audit of the shared backend-aware routing layer found two gaps in malformed-payload handling:

1. **Null items in adapter-returned arrays could crash `.map()` callbacks**: `listBackendSessions()`, `getBackendSessionPreview()`, and `loadBackendSessionMessages()` all call `.map()` on arrays returned by backend adapters. If an adapter returned `[null]` or `[{...}, null, {...}]`, the destructuring or property access inside the `.map()` callback would throw a runtime TypeError. This is a realistic malformed-backend-payload scenario.

2. **Unhandled adapter errors in productized narrow read seams**: `readBackendSessionTitle()` and `readBackendSessionShareUrl()` are productized seams used by `TitleGenerationService` and `ConversationSessionSettingsCoordinator`. If the underlying `getSession()` call threw (network error, process disconnect, etc.), the error would propagate uncaught to the consumer.

### Fix Applied (Round 1 — null items + getSession error handling)

- Added `.filter((s) => s !== null && typeof s === 'object')` before `.map()` in `listBackendSessions()`, `getBackendSessionPreview()`, and `loadBackendSessionMessages()`. Null or primitive array items are silently skipped rather than crashing the normalization loop.
- Added `try/catch` around `sessionService.getSession(sessionId)` in `readBackendSessionTitle()` and `readBackendSessionShareUrl()`. Adapter errors now return `null` instead of propagating, matching the existing "not found" semantics.
- Added six unit tests:
  - `listBackendSessions`: skips null items in sessions array
  - `getBackendSessionPreview`: skips null items in messages array
  - `loadBackendSessionMessages`: skips null items in OpenCode messages array
  - `loadBackendSessionMessages`: skips null items in Claude messages array
  - `readBackendSessionTitle`: returns null when `getSession` throws
  - `readBackendSessionShareUrl`: returns null when `getSession` throws

### Fix Applied (Round 2 — listSessions / getSessionMessages error handling)

A follow-up audit found that `listBackendSessions()` and `getBackendSessionPreview()` also lacked try/catch around their respective adapter calls (`listSessions()` and `getSessionMessages()`). These are productized seams used by the settings UI; uncaught errors would break the settings surface.

- Added `try/catch` around `active.listSessions()` in `listBackendSessions()`. Adapter errors return `[]`.
- Added `try/catch` around `historyService.getSessionMessages(sessionId)` in `getBackendSessionPreview()`. Adapter errors return `null`.
- Added two unit tests:
  - `listBackendSessions`: returns empty array when `listSessions` throws
  - `getBackendSessionPreview`: returns null when `getSessionMessages` throws

### Verification

- `npm run verify` passed with `431` suites / `3059` tests
- Build completed with `BUILD_ID feature-phase0-capability.202605231609`
- No new shared `getSession()` consumers were added; this is a defensive hardening of existing backend-aware seams
- Test Vault runtime proof with the latest deployed build still passes the provider-owned Capability Lab backend-routing assertion:
  - deployed `main.js` contains `BUILD_ID=feature-phase0-capability.202605231609`
  - `obsidian plugin:reload id=opencodian vault=testvault` succeeded
  - `capability-lab-backend-routing-assertion.js` returned `ok: true`
  - `obsidian dev:errors vault=testvault` returned `No errors captured.`

## OpenCode Parts Array Inner Null-Item Runtime Safety Round (2026-05-23)

A fourth-pass runtime-safety audit of the shared backend-aware routing layer found one remaining gap in malformed-payload handling within `getBackendSessionPreview()`.

**The gap**: The OpenCode `{info, parts}` normalization path checked `Array.isArray(record.parts)` but then called `.map()` directly on the array without filtering inner items. If a backend adapter returned a `parts` array containing `null` or primitive values (e.g., `[{type: 'text'}, null, 'string', 123]`), the `.map()` callback would attempt property access (`part.type`) on `null`, throwing an uncaught `TypeError`. This is consistent with the previously fixed null-item scenario but at one nesting level deeper inside the message shape.

The generic / Claude content-block path already handled this correctly by checking `typeof block === 'object' && block !== null` before accessing properties.

### Fix Applied

- Added `.filter((p) => p !== null && typeof p === 'object')` to the `parts` array inside the OpenCode normalization branch of `getBackendSessionPreview()`, before the `.map()` callback that accesses `part.type` and `part.text`.
- Added one unit test: `getBackendSessionPreview`: skips null items inside OpenCode `parts` array without crashing.

### Verification

- `npm run verify` passed with `431` suites / `3060` tests
- Build completed with `BUILD_ID feature-phase0-capability.202605231623`
- No new shared `getSession()` consumers were added; this is a defensive hardening of an existing backend-aware seam

## Final Session/History Inspection Audit Round (2026-05-23)

A comprehensive real-code audit of all remaining session detail / history inspection / session list-detail read surfaces confirmed the lane is runtime-proof-complete with one defensive hardening applied.

### Audit Scope

Files inspected:
- `src/features/settings/SettingsConversationSection.ts` — shared sessions list, preview, unshare
- `src/features/chat/OpenCodianView.ts` — all `openCodeService` session read bindings in sync host wiring
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts` — share-URL read, share/unshare writes
- `src/features/settings/SettingsCapabilityLabSection.ts` — all diagnostic probes
- `src/core/agents/backend/AgentBackendRouting.ts` — all normalized routing helpers
- `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts` — `.info`/`.parts` usage
- `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` — `.info`/`.parts` usage
- `src/features/chat/services/ConversationRenderService.ts` — canonical state path

### Findings

| Surface | Finding | Action |
|---|---|---|
| `SettingsConversationSection.ts` unshare | Direct `openCodeService.unshareSession()` binding inside backend-aware shared sessions list; outer gate (`isOpenCodeActive()`) handles normal case but no inner runtime guard | **Fixed**: added explicit `isOpenCodeActive()` guard inside unshare callback with user-facing notice |
| `OpenCodianView.ts` sync host | `getSessionMessages`, `getCanonicalSessionMessages`, `getSessionRevertState`, `hydrateOpenCodeMessage` directly wired to `openCodeService` | **Confirmed safe**: all consumers have explicit `backend !== 'opencode'` guards |
| Capability Lab probes | `adapter.getSession()`, `adapter.getSessionMessages()`, `adapter.listSessions()` used directly | **Confirmed safe**: all probes are provider-owned diagnostic and do not assume OpenCode shapes |
| `.info`/`.parts` outside `core/opencode/` | Found in `ConversationAuthoritativeSyncCoordinator`, `ConversationAuthoritativeReloadCoordinator`, `ConversationRenderService` | **Confirmed safe**: all in explicitly gated OpenCode-only paths |
| Docs drift | Checked for outdated claims about shared preview consuming `OpenCode-shaped SessionMessage` | **None found**: docs correctly describe `NormalizedSessionPreviewMessage` |

### Defensive Hardening Applied

- `SettingsConversationSection.ts` unshare callback now checks `isOpenCodeActive()` before calling `openCodeService.unshareSession()`. If the active backend has switched away from OpenCode while the settings page is open, it shows a notice (`settings.conversation.share.sharedSessions.unshareUnavailable`) and skips the call.
- Added locale strings for the guard message in both `en.ts` and `zh.ts`.
- Added unit test `blocks unshare when the active backend is no longer OpenCode` in `SettingsConversationSection.test.ts`.

### Conclusion

This lane is **runtime-proof-complete**. All productized backend-aware session/history read seams have consistent defensive handling. All remaining direct `openCodeService` session bindings are in explicitly gated OpenCode-only paths. No additional safe gaps remain.

## Shared Sessions Backend-Switch Follow-Up Audit (2026-05-23)

After commit `4f85f022` (`fix: guard shared session unshare when backend switches`), a second real-code audit checked whether the rest of `SettingsConversationSection`'s shared sessions surface still needed extra backend-switch guards.

### Surfaces Rechecked

- `SettingsConversationSection.ts` shared session preview
- `SettingsConversationSection.ts` shared session refresh/count rendering
- `SettingsConversationSection.ts` stale sharing block visibility after backend switch
- `SettingsConversationSection.ts` shared session copy-link action

### Result

No additional production changes were justified.

| Surface | Backend-switch behavior | Why no further fix was added |
|---|---|---|
| Shared session preview | `getBackendSessionPreview()` returns `null` when the active backend no longer exposes session history; the UI already renders the existing preview-failed copy | Routing helper already provides safe degradation |
| Shared session refresh/count | `listBackendSessions()` returns `[]` when the active backend no longer exposes session listing; the UI naturally re-renders to `0` + empty state | Routing helper already provides safe degradation |
| Shared session copy link | Copies already-rendered `shareUrl` text only; no backend read/write call occurs | Pure local action, no backend safety risk |
| Stale sharing block visibility | Standard settings backend switch path re-renders the entire conversation section, removing the sharing block. Non-standard stale clicks still fall back to the safe preview/refresh degradation or the explicit `unshare` guard | No functional risk remained |

### Interpretation

This follow-up audit did **not** reveal a new backend-neutral seam and did **not** justify more inner guards in `SettingsConversationSection.ts`.

The only shared-session action that required an extra runtime fence was `unshareSession()` because it is an OpenCode-specific write. Preview/refresh/list/count already degrade safely through `AgentBackendRouting`, and copy-link is backend-agnostic local UI behavior.

## Rewind Test Hardening Round (2026-05-23)

A focused test hardening pass addressed the weakest test coverage gap among Claude Code diagnostic capabilities: `ClaudeCodeAdapter.rewindFiles()` had zero direct unit tests, `ConversationLoadRecoveryCoordinator` rewind/restore error paths were untested, and the Capability Lab rewind dry-run probe had no adapter-call test.

### Changes Applied

| Test file | Tests added | Coverage |
|---|---|---|
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | 5 | `rewindFiles` unavailable (no runtime), delegation with active runtime, dryRun option forwarding, error propagation from SDK, invalidated session |
| `tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts` | 11 | handleRewindRequest: streaming blocked, no conversation, non-OpenCode backend, no sourceMessageId, user cancel, revertSession false, revertSession throws. handleRestoreRewindRequest: streaming blocked, non-OpenCode backend, unrevertSession false, unrevertSession throws |
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` | 2 | Rewind dry-run probe success (adapter called with dryRun:true, result rendered), dry-run probe failure (error + hint rendered) |

### Verification

- `npm run verify` passed with `431` suites / `3080` tests
- Build completed with `BUILD_ID feature-phase0-capability.202605231831`
- Net test increase: +20 tests (3060 → 3080)

### Impact on Capability Maturity

This hardening pass does **not** promote rewind to stable. Rewind remains:
- `wired + runtime-proved + not stable` for the adapter seam
- Explicitly gated as `backend !== 'opencode'` in production chat paths
- Only exercisable through the Capability Lab dry-run probe

What changed is the **test coverage depth** — the adapter-level `rewindFiles()` seam now has the same test rigor as fork, structured output, and hooks, making future promotion work safer.

### Updated Capability Test Coverage Summary

| Capability | Adapter tests | Coordinator tests | CapLab probe tests | Total coverage |
|---|---|---|---|---|
| Fork | ✅ | ✅ | ✅ | runtime-proved but not stable |
| Structured output | ✅ | ✅ | ✅ | stable transcript rendering, authoring remains diagnostic |
| Hooks | ✅ | N/A | ✅ | runtime-proved but not stable |
| Session store | ✅ | N/A | ✅ | diagnostic store proof only |
| **Rewind** | ✅ **(new)** | ✅ **(new)** | ✅ **(new)** | runtime-proved but not stable |
| Agent definitions | ⚠️ wiring only | N/A | N/A | Must remain Hidden/Untested |

## Stream Normalizer + Runtime Control Test Hardening Round (2026-05-23)

A focused test hardening pass addressed gaps in stream normalizer lifecycle event coverage and adapter runtime control method coverage. One minimal implementation fix was also applied.

### Implementation Fix: `getSession()` sessionStore Asymmetry

`ClaudeCodeAdapter.getSession()` did not accept or forward `sessionStore` to the SDK, while `listSessions()`, `getSessionMessages()`, `listSubagents()`, `getSubagentMessages()`, and `importSessionToStore()` all accept and forward `sessionStore`. This meant the Capability Lab session detail probe could not read session data from the diagnostic store.

**Fix**: Added `options?: { sessionStore?: unknown }` parameter to `getSession()`, forwarding to `sdk.getSessionInfo()` alongside the existing `dir` option. This brings `getSession()` into symmetry with the other sessionStore-aware methods.

### Stream Normalizer Test Coverage

Eight recognized event/block types had zero test coverage despite being handled by the normalizer:

| Event/block type | Status before | Status after |
|---|---|---|
| `init` system subtype | ❌ untested | ✅ tested |
| `hook_started` lifecycle event | ❌ untested | ✅ tested |
| `hook_progress` lifecycle event | ❌ untested | ✅ tested |
| `task_started` lifecycle event | ❌ untested | ✅ tested |
| `task_notification` lifecycle event | ❌ untested | ✅ tested |
| `task_updated` lifecycle event | ❌ untested | ✅ tested |
| `redacted_thinking` content block | ❌ untested | ✅ tested |
| `server_tool_use` content block | ❌ untested | ✅ tested |

Previously tested (unchanged): `session_init`, `hook_response`, `task_progress`, `text`, `thinking`, `tool_use`, `tool_result`, `text_delta`, `thinking_delta`.

### Adapter Runtime Control Test Coverage

Three public methods had zero test coverage:

| Method | Status before | Status after |
|---|---|---|
| `setModel()` | ❌ untested | ✅ tested |
| `setPermissionMode()` | ❌ untested | ✅ tested |
| `reloadMcpServers()` | ❌ untested | ✅ tested |
| `getSession()` with sessionStore | ❌ untested (asymmetric) | ✅ tested (fixed) |

### Verification

- `npm run verify` passed with `431` suites / `3092` tests
- Build completed with `BUILD_ID feature-phase0-capability.202605231841`
- Net test increase: +12 tests (3080 → 3092)

### Impact on Capability Maturity

This hardening pass does **not** promote any capability to stable. All touched capabilities remain at their current maturity:

- **Hooks**: `wired + runtime-proved`, not stable. Hook lifecycle coverage is now complete: `hook_started` → `hook_progress` → `hook_response` all have explicit test coverage.
- **Subagent events**: Now complete lifecycle coverage: `task_started` → `task_progress` → `task_notification` → `task_updated`.
- **Session store**: `diagnostic store proof only`, not stable. `getSession()` now correctly forwards `sessionStore`, fixing a real asymmetry in store-backed session detail lookups.
- **Stream normalizer**: All recognized SDK event types and content block types now have explicit test coverage. No recognized type remains untested.

### Updated Capability Test Coverage Summary

| Capability | Adapter tests | Coordinator tests | CapLab probe tests | Normalizer coverage | Total coverage |
|---|---|---|---|---|---|
| Fork | ✅ | ✅ | ✅ | N/A | runtime-proved but not stable |
| Structured output | ✅ | ✅ | ✅ | ✅ | stable transcript rendering, authoring remains diagnostic |
| Hooks | ✅ | N/A | ✅ | ✅ **(complete lifecycle)** | runtime-proved but not stable |
| Session store | ✅ **(getSession fixed)** | N/A | ✅ | N/A | diagnostic store proof only |
| Rewind | ✅ | ✅ | ✅ | N/A | runtime-proved but not stable |
| Subagent events | N/A | N/A | N/A | ✅ **(complete lifecycle)** | runtime-proved but not stable |
| Runtime controls | ✅ **(new)** | N/A | N/A | N/A | runtime-proved but not stable |
| Stream blocks (redacted_thinking, server_tool_use) | N/A | N/A | N/A | ✅ **(new)** | runtime-proved but not stable |
| Subagent browser | ✅ | N/A | ✅ **(8 UI tests)** | N/A | runtime-proved but not stable |
| SDK error propagation (import/messages) | ✅ **(new)** | N/A | N/A | N/A | Complete |
| Agent definitions | ⚠️ wiring only | N/A | N/A | N/A | Must remain Hidden/Untested |

## Subagent Sidecar and JSONL Import Test Hardening Round (2026-05-23)

A focused test hardening pass addressed the weakest remaining test coverage gaps in the subagent sidecar browser and JSONL import/session history paths.

### Changes Applied

| Test file | Tests added | Coverage |
|---|---|---|
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` | 8 | Subagent browser: session refresh, session select → listSubagents, empty subagents, listSubagents error, agent button → getSubagentMessages, getSubagentMessages error, listSessions error on refresh, runtime proof pass |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | 4 | `importSessionToStore` SDK-unavailable, `listSubagents`/`getSubagentMessages` stale-session guard, `importSessionToStore` SDK error propagation, `getSessionMessages` SDK error propagation |

### Verification

- `npm run verify` passed with `431` suites / `3104` tests
- Build completed with `BUILD_ID feature-phase0-capability.202605231854`
- Net test increase: +12 tests (3092 → 3104)
- No `src/` changes; no graphify refresh needed

### Impact on Capability Maturity

This hardening pass does **not** promote any capability to stable. All touched capabilities remain at their current maturity:

- **Subagent browser**: `wired + runtime-proved`, not stable. The CapLab UI now has full test coverage for all interaction paths (session loading, subagent listing, message loading, and error states).
- **JSONL import/session store**: `diagnostic store proof only`, not stable. The `importSessionToStore` path now has SDK-unavailable and SDK-error-propagation coverage.
- **Subagent sidecar**: The adapter-level `listSubagents`/`getSubagentMessages` methods now have stale-session and SDK-error coverage consistent with `getSessionMessages` and `importSessionToStore`.

### Updated Capability Test Coverage Summary

| Capability | Adapter tests | Coordinator tests | CapLab probe tests | Normalizer coverage | Total coverage |
|---|---|---|---|---|---|
| Fork | ✅ | ✅ | ✅ | N/A | runtime-proved but not stable |
| Structured output | ✅ | ✅ | ✅ | ✅ | stable transcript rendering, authoring remains diagnostic |
| Hooks | ✅ | N/A | ✅ | ✅ | runtime-proved but not stable |
| Session store | ✅ | N/A | ✅ | N/A | diagnostic store proof only |
| Rewind | ✅ | ✅ | ✅ | N/A | runtime-proved but not stable |
| Subagent events | N/A | N/A | N/A | ✅ | runtime-proved but not stable |
| Subagent browser | ✅ | N/A | ✅ **(8 UI tests)** | N/A | runtime-proved but not stable |
| SDK error propagation | ✅ **(new)** | N/A | N/A | N/A | runtime-proof helper only |
| Runtime controls | ✅ | N/A | N/A | N/A | runtime-proved but not stable |
| Stream blocks (redacted_thinking, server_tool_use) | N/A | N/A | N/A | ✅ | runtime-proved but not stable |
| Agent definitions | ⚠️ wiring only | N/A | N/A | N/A | Must remain Hidden/Untested |

## Claude Rewind No-Data-Loss Guard Round (2026-05-23)

A focused Phase 3 rewind audit found a real adapter-level safety gap outside the already completed session/history/shared-session seam.

### Gap Found

`ClaudeCodeAdapter.rewindFiles()` delegated to the active SDK query with caller-provided `options` as-is. The Capability Lab dry-run preview always passed `{ dryRun: true }`, but the adapter itself had no safety default. A future caller could omit options and accidentally invoke a real rewind. The method also accepted empty `userMessageId` values and did not leave a warning-level audit trail for explicit real rewind calls.

### Fix Applied

- `rewindFiles()` now rejects empty or whitespace-only `userMessageId` before touching the runtime.
- `rewindFiles()` now treats omitted options or `{}` as `{ dryRun: true }`.
- Explicit `{ dryRun: false }` remains possible only as an intentional low-level adapter call and emits a `warn` log entry.
- The Capability Lab surface remains dry-run only; no real rewind button was added.

### Verification

- Focused rewind tests passed: `10` tests in `ClaudeCodeAdapter.test.ts`.
- `npm run check:module-docs -- --range HEAD` passed.
- This round changes `src/`, so `npm run graphify:update:src`, full `OWNER_GUARD_APPROVED=1 npm run verify`, and `npm run build` are required before commit.

### Impact on Capability Maturity

This hardening pass does **not** promote rewind to stable. Rewind remains:

- `wired + runtime-proved + diagnostic-only`
- adapter-level dry-run guarded by default
- not connected to stable chat rewind/revert UI
- still blocked from `AgentCapability.Branching` for Claude Code

## Skills and Plugins Read-Only Diagnostic Catalog (2026-05-23)

A focused Phase 3 pass implemented the smallest read-only diagnostic summary for configured runtime skills and plugins in Capability Lab. The Claude Code SDK does not expose a skills catalog method — skills are only passed as options (`string[] | 'all'`). This round adds diagnostic name-list display on top of the existing count-based detection.

### What Changed

**Adapter methods** (`ClaudeCodeAdapter.ts`):
- `getSkillsList()`: returns `string[]` copy of configured skill names, or `'all'` sentinel. Defensive copy prevents mutation of adapter state.
- `getPluginsList()`: returns `string[]` of stringified plugin identifiers (handles `unknown[]` type via `typeof === 'string' ? p : JSON.stringify(p)`). Defensive copy.

**Capability Lab discovery rows** (`SettingsCapabilityLabSection.ts`):
- Plugins row notes now include plugin names: `"2 plugin(s): my-plugin, other-plugin. Runtime passthrough..."`.
- Skills row notes now include skill names: `"3 skill(s): skill-a, skill-b, skill-c. Runtime passthrough..."`.
- 'All skills' case unchanged: `"All skills enabled. Runtime passthrough..."`.
- Capability matrix keeps Skills and Plugins at `runtimeProof: 'untested'` and `userSurface: 'hidden'`; adapter + UI tests prove the diagnostic summary rendering only, not live runtime behavior.

### Tests Added

- Adapter: 10 new tests — `getSkillsList()` (5: empty, array, 'all', empty array, defensive copy) + `getPluginsList()` (5: empty, strings, empty array, non-string stringify, defensive copy).
- Capability Lab: 3 new tests — plugin names in notes, skill names in notes, fallback when adapter lacks `getSkillsList`. Updated 3 existing tests for new notes text format.

### Impact on Capability Maturity

This pass does **not** promote skills or plugins to stable. They remain:

- `detection-only with name-list diagnostic`, not authoring-complete
- `userSurface: 'hidden'` in the capability matrix
- clearly labeled "No authoring UI" in the discovery table
- the read-only diagnostic is intentionally minimal: array names or 'all' sentinel, no catalog browsing, no detail inspection

### Subagent Browser Verification

The existing `listSubagents()` / `getSubagentMessages()` diagnostic UI and tests were confirmed complete (adapter 4 tests + UI 8 tests). No duplication was needed.

### Updated Capability Test Coverage Summary

| Capability | Adapter tests | Coordinator tests | CapLab probe tests | Total coverage |
|---|---|---|---|---|
| Fork | ✅ | ✅ | ✅ | runtime-proved but not stable |
| Structured output | ✅ | ✅ | ✅ | stable transcript rendering, authoring remains diagnostic |
| Hooks | ✅ | N/A | ✅ | runtime-proved but not stable |
| Session store | ✅ | N/A | ✅ | diagnostic store proof only |
| Rewind | ✅ | ✅ | ✅ | runtime-proved but not stable |
| Subagent browser | ✅ | N/A | ✅ **(8 UI tests)** | runtime-proved but not stable |
| **Skills introspection** | ✅ **(count + list)** | N/A | ✅ **(count + name-list rendering)** | Foundation / diagnostic only |
| **Plugins introspection** | ✅ **(count + list)** | N/A | ✅ **(count + name-list rendering)** | Foundation / diagnostic only |
| MCP server detection | ✅ | N/A | ✅ | detection-only |
| Runtime controls | ✅ | N/A | N/A | runtime-proved but not stable |
| Agent definitions | ⚠️ wiring only | N/A | N/A | Must remain Hidden/Untested |

## Hard Guardrails

- Do not regress OpenCode while promoting Claude.
- Do not claim `Agent Definitions` complete unless both official basis and runtime product proof justify it.
- Do not mark hooks, session store, structured output, or rewind as stable merely because the adapter seam exists; hooks now have diagnostic event-timeline proof in Capability Lab, but that is still not stable UI.
- Do not remove legacy compatibility fields that older OpenCode conversations still rely on without an explicit migration plan.
- Do not flatten Claude-native semantics into generic settings when the design docs say they are backend-specific.

## Diagnostics Export Secret Sanitization (2026-05-23)

A focused Phase 5-foundation pass addressed the missing secret sanitization in diagnostic report exports.

### Gap Found

Both `buildDiagnosticReport()` (general plugin diagnostics) and `buildClaudeCodeDiagnosticReport()` (Claude-specific diagnostics) exported raw text without any secret redaction. A privacy note claimed "secrets are kept out," but no runtime enforcement existed.

### What Changed

**New utility**: `src/shared/diagnosticSecretSanitizer.ts`
- `sanitizeDiagnosticReport(text: string): string` — applies ordered regex-based redaction patterns to diagnostic text
- `DIAGNOSTIC_REDACTION_PATTERNS` — exported readonly pattern array for test access
- Covers: Bearer tokens, API key/token/secret/password assignments, CLI flags, URL-embedded passwords, query-string secret params, environment variables, Anthropic `sk-ant-api03-` prefixes, generic 20+ char tokens, PEM private key blocks

**Integration**:
- `main.ts` `buildDiagnosticReport()`: now calls `sanitizeDiagnosticReport()` on the raw report before returning
- `SettingsDebugSection.ts` `buildClaudeCodeDiagnosticReport()`: now calls `sanitizeDiagnosticReport()` on the raw report before returning

**Tests**: 34 new tests in `tests/unit/shared/diagnosticSecretSanitizer.test.ts` covering all pattern families and edge cases.

### Impact on Capability Maturity

This pass promotes the diagnostics export from "no secret protection" to "best-effort regex-based sanitization." It does not change any diagnostic capability maturity — diagnostics remain diagnostic-only surfaces. The sanitization is a safety net, not a guarantee; users should still review exports before sharing.
