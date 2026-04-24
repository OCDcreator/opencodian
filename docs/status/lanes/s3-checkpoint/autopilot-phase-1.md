## Round Design

- **Exact `[NEXT]` slice**: `F1 - Final verification and review-driven checkpoint` from `docs/status/lanes/s3-checkpoint/autopilot-round-roadmap.md`.
- **Targeted files/modules**:
  - Directly affected runtime/settings owners from earlier lanes, only if the review loop or verification finds a bounded follow-up fix:
    - `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
    - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
    - `src/core/config/OpencodeConfigManager.ts`
    - `src/core/config/slashCommandCatalog.ts`
    - `src/features/chat/services/SlashCommandExecutionService.ts`
    - `src/features/chat/services/SlashCommandMenuCatalogCache.ts`
    - `src/features/settings/SettingsSecuritySection.ts`
    - `src/features/settings/SettingsCommandsSection.ts`
    - `src/features/settings/SettingsProjectCommandEditor.ts`
  - Matching direct module docs, only where the checkpoint changes user-visible semantics or fallback notes:
    - `docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md`
    - `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
    - `docs/modules/core/config/OpencodeConfigManager.md`
    - `docs/modules/core/config/slashCommandCatalog.md`
    - `docs/modules/features/chat/services/SlashCommandExecutionService.md`
    - `docs/modules/features/chat/services/SlashCommandMenuCatalogCache.md`
    - `docs/modules/features/settings/SettingsSecuritySection.md`
    - `docs/modules/features/settings/SettingsCommandsSection.md`
    - `docs/modules/features/settings/SettingsProjectCommandEditor.md`
    - `docs/modules/features/settings/OpenCodianSettings.md`
  - Lane artifacts:
    - `docs/status/lanes/s3-checkpoint/autopilot-phase-1.md`
    - `docs/status/lanes/s3-checkpoint/autopilot-round-roadmap.md`
- **Upstream SDK / command contract to confirm**:
  - Permission handling still matches the upstream rule model: patterned `allow` / `ask` / `deny`, `external_directory` directory-glob semantics, and SDK-first session permission replies without inventing new rule shortcuts.
  - OpenCodian still keeps the intended fallback boundary: session permission replies are SDK-only, while question and permission CRUD may still fall back to legacy HTTP when the SDK surface fails or is unavailable.
  - Slash command behavior still matches the upstream two-layer architecture: `sdk.command.list()` remains the runtime truth for backend prompt commands, frontend/TUI slash commands stay out of this settings/runtime catalog, and `slashCommandSkillMode` only changes direct `/skill` versus `/skills <skill>` exposure.
  - Project command entries may remain editable ahead of runtime registration, but the checkpoint must confirm they are not advertised or executed as runtime-available chat commands until the runtime catalog exposes them.
- **Tests to run**:
  - Pre/post-fix targeted regression bundle when code changes are needed: `npm test -- --runTestsByPath tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/core/config/OpencodeConfigManager.permissionSummary.test.ts tests/unit/core/config/slashCommandCatalog.test.ts tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandMenuCatalogCache.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts tests/unit/features/settings/SettingsSecuritySection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
  - Full validation gate: `npm run verify`
  - Configured validation gaps to record, not invent: separate lint, typecheck, build, and vulture commands are blank in the controller metadata for this round.
- **Non-goals / boundaries**:
  - No new permission or slash feature work outside review-driven, directly related follow-up fixes.
  - No queue expansion, no lane hopping, and no deploy step unless a direct checkpoint fix unexpectedly touches deploy-required runtime files and the existing repo rules make it mandatory.
  - Preserve existing fallback behavior unless the review loop or failing verification proves a bounded correction is required.
  - If the checkpoint finds no code/docs drift beyond lane artifacts, keep the slice docs-only and close the queue without gratuitous app edits.

## Design Review Result

- `PASS` — `automation/opencode-review.sh plan` saved a PASS review to `automation/runtime/opencode-reviews/20260424-130711-plan.txt`.
- The helper still exited with `verdict missing` because the reviewer emitted markdown `**VERDICT: PASS**` instead of the wrapper's exact sentinel line, so this round used the saved review log as the source of truth.
- The reviewer confirmed the slice stayed faithful to `F1`, named the required SDK/command contracts, and correctly allowed a docs-only close if no checkpoint drift appeared.

## Checkpoint Audit

- Audited the directly affected module docs from `s1-permission-sdk` and `s2-slash-sdk`; the existing docs already capture the intended SDK-backed behavior, the remaining permission fallback boundary, and the runtime-vs-settings slash-command distinction, so no app-code or module-doc follow-up fix was required.
- Kept the round scoped to lane artifacts only: this checkpoint closes the queue, records the final boundary statement, and leaves earlier lane implementations unchanged because targeted tests and verification found no regressions.

## Final SDK / Fallback Boundaries

- **SDK-backed now**:
  - permission polling and streaming normalization preserve `patterns`, `always`, and optional `tool` linkage across the SDK-first question/permission paths
  - session permission replies stay on the SDK responder path
  - permission template/status wording reflects the upstream rule model instead of heuristic mode guesses
  - chat slash visibility and manual slash execution treat `sdk.command.list()` as runtime truth for backend prompt commands
  - settings wording distinguishes runtime-visible commands from project-only config and explains `/skill` versus `/skills <skill>` exposure truthfully
- **Still intentionally falling back**:
  - question and permission CRUD may still fall back to legacy HTTP when the SDK surface is unavailable or fails
  - project-only commands remain editable in settings ahead of runtime registration, but they stay out of chat autocomplete/execution until the runtime catalog exposes them
  - slash menu cache semantics remain the existing runtime+TTL model; this checkpoint confirmed no extra invalidation fix was needed

## Files Changed

- `docs/status/lanes/s3-checkpoint/autopilot-phase-1.md`
- `docs/status/lanes/s3-checkpoint/autopilot-round-roadmap.md`

## Validation

- Targeted regression bundle: `npm test -- --runTestsByPath tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/core/config/OpencodeConfigManager.permissionSummary.test.ts tests/unit/core/config/slashCommandCatalog.test.ts tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandMenuCatalogCache.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts tests/unit/features/settings/SettingsSecuritySection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
- Full validation: `npm run verify`
- `npm run verify` passed and produced `BUILD_ID=autopilot-sdk-permission-slash-sdk.202604241312`
- No deploy step was required because this round stayed within lane status docs and did not touch deploy-relevant runtime files.

## Code Review Result

- `PASS` — `automation/opencode-review.sh code` saved a PASS review to `automation/runtime/opencode-reviews/20260424-131021-code.txt`.
- The helper again ended with `verdict missing` because the reviewer emitted markdown `**VERDICT: PASS**`; the saved review log contains the clean PASS verdict with no blockers.
- The only non-blocking note was that the phase doc could say more explicitly that the checkpoint intended no code changes; the completed summary now makes that docs-only scope explicit.

## Outcome

- `F1 - Final verification and review-driven checkpoint` completed successfully as a docs-only closeout round.
- The `s3-checkpoint` roadmap now has no remaining `[NEXT]` or `[QUEUED]` items, so the queue is closed and the controller can mark the overall objective complete after this round commit.

## Next Recommended Slice

- None — `s3-checkpoint` is empty after this round.
