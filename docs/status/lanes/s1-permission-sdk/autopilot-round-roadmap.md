# Autopilot Round Roadmap — `s1-permission-sdk`

## Queue

### [DONE] P1 - Complete SDK-backed permission runtime wiring

- **Lane**: Permission runtime
- **Goal**: Confirm and complete SDK-backed pending-permission fetch/reply/runtime event handling without breaking legacy fallback or current inline permission UX.
- **Priority entrypoints**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `tests/unit/core/opencode/`
- **Constraints**:
  - Preserve the current permission card UX and fallback semantics
  - Confirm behavior against the upstream permission contract before changing code
  - Keep the slice bounded to permission runtime ownership
- **Acceptance**:
  - The touched permission paths are SDK-complete or intentionally documented as fallback
  - Targeted tests cover the touched behavior
  - The post-change OpenCode CLI review passes

### [DONE] P2 - Align security settings wording and config semantics

- **Lane**: Permission settings
- **Goal**: Make the security/settings surface describe the real upstream permission model in a human-readable way.
- **Priority entrypoints**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - `src/core/types/settings.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
- **Constraints**:
  - Keep behavior and copy aligned
  - Avoid unrelated settings cleanup
- **Acceptance**:
  - The settings UI and locale strings match actual runtime semantics
  - Related tests/docs are updated
  - The post-change OpenCode CLI review passes

## Lane state

- When this roadmap has no remaining `[NEXT]` or `[QUEUED]` items, the controller switches to `s2-slash-sdk`.
