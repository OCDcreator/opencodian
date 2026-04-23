# Phase 0 — Permission SDK Lane Baseline

- **Lane**: `s1-permission-sdk`
- **Status**: ready
- **Objective**: close SDK-backed permission runtime gaps first, then align the security settings surface with the upstream permission model
- **Seed plan**: `docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md`
- **Upstream docs**:
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-permission-mechanism.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/OpenCode-Slash-Command-Architecture.md`
- **Entry modules**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - `src/core/types/settings.ts`

## Notes

- The first round in this lane must not touch slash command code except where permission-related runtime ownership truly overlaps.
- Every round in this lane must pass the scripted plan review and code review helpers.
