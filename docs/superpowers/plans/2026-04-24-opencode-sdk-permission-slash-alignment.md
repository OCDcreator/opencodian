# OpenCode SDK Permission And Slash Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete a queue-driven SDK-first alignment of OpenCodian permission handling and slash-command handling, including settings rationality and UI consistency, while preserving existing fallback behavior and chat UX.

**Architecture:** Treat the two external reference docs as the upstream behavioral contract, then advance one small slice at a time through repo-local autopilot lanes. Each round must draft a slice-specific design, pass an OpenCode CLI plan review before coding, implement the smallest meaningful change, run targeted validation, and pass an OpenCode CLI code review before full verification and commit.

**Tech Stack:** TypeScript, Jest, Obsidian plugin settings/runtime, OpenCode SDK v2 bridge, existing OpenCodian autopilot scaffold, OpenCode CLI review commands

---

## Contract Sources

- `AGENTS.md`
- `docs/modules/entry-point/main.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/features/chat/services/SlashCommandMenuCatalogCache.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-permission-mechanism.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/OpenCode-Slash-Command-Architecture.md`

## Execution Rules

- The lane roadmaps are the live scheduling source of truth for autopilot
- Before changing app code in any round, write the slice design into that round's phase doc and pass `bash automation/opencode-review.sh plan ...`
- After implementing a slice, run targeted tests first, then pass `bash automation/opencode-review.sh code ...` before full verification
- Do not ignore review blockers without revising the code or phase-doc design
- Preserve legacy fallback paths unless the current slice explicitly removes one with proof and tests

## Lane Breakdown

### Lane `s1-permission-sdk`

- **Scope:** permission request transport, pending permission state, permission replies, and security/settings wording that maps to upstream permission schema
- **Primary entrypoints:** `src/core/opencode/OpenCodeService.ts`, `src/core/opencode/OpenCodeQuestionPermissionHub.ts`, `src/features/settings/OpenCodianSettings.ts`, `src/core/config/OpencodeConfigManager.ts`, `src/core/types/settings.ts`, `src/i18n/locales/en.ts`, `src/i18n/locales/zh.ts`
- **Acceptance:** runtime permission request/reply paths are SDK-complete where possible, settings describe the actual upstream contract clearly, and tests cover the touched behavior

### Lane `s2-slash-sdk`

- **Scope:** runtime slash command catalog loading, SDK-backed command visibility/execution alignment, and command/settings UI wording and consistency
- **Primary entrypoints:** `src/core/config/slashCommandCatalog.ts`, `src/features/chat/services/SlashCommandMenuCatalogCache.ts`, `src/features/settings/OpenCodianSettings.ts`, `src/features/chat/services/slashCommandMenuFilter.ts`, `src/i18n/locales/en.ts`, `src/i18n/locales/zh.ts`
- **Acceptance:** slash command runtime/project/skill behavior matches the upstream architecture doc, settings are human-readable, and cache invalidation / restart semantics stay coherent

### Lane `s3-checkpoint`

- **Scope:** final verification, docs sync, UI consistency pass, and any last bounded fix-ups found by the mandatory review loops
- **Primary entrypoints:** only directly affected files from earlier lanes plus matching `docs/modules/**`
- **Acceptance:** no remaining `[NEXT]`/`[QUEUED]` lane items, full verification passes, and the final phase doc explains what is SDK-backed and what still intentionally falls back

## Slice Queue

### Task 1: Permission runtime SDK audit and completion

**Files:**
- Modify: `src/core/opencode/OpenCodeService.ts`
- Modify: `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
- Modify: `src/core/opencode/OpenCodeStreamEventTransformer.ts`
- Modify: `tests/unit/core/opencode/OpenCodeService.*.test.ts`
- Modify: `tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts`

**Acceptance:**
- Pending permission fetch/reply flows are confirmed against SDK-backed surfaces
- Session permission reply and queued permission handling preserve current UX and fallback semantics
- Tests prove the touched behavior

### Task 2: Permission settings and UI contract alignment

**Files:**
- Modify: `src/features/settings/OpenCodianSettings.ts`
- Modify: `src/core/config/OpencodeConfigManager.ts`
- Modify: `src/core/types/settings.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Modify: matching tests and directly related module docs

**Acceptance:**
- Security settings map cleanly to upstream permission concepts such as patterned rules, task allowlists, and external directory access
- Labels, descriptions, and notices read like a human-facing product rather than an internal transport detail dump

### Task 3: Slash command runtime/catalog SDK alignment

**Files:**
- Modify: `src/core/config/slashCommandCatalog.ts`
- Modify: `src/features/chat/services/SlashCommandMenuCatalogCache.ts`
- Modify: `src/features/chat/services/slashCommandMenuFilter.ts`
- Modify: `src/main.ts`
- Modify: targeted tests around command catalog loading and invalidation

**Acceptance:**
- Runtime commands, project commands, skills, and source badges reflect the upstream command architecture
- Cache invalidation or service restart paths do not leave stale slash menus behind

### Task 4: Slash command settings and UI consistency

**Files:**
- Modify: `src/features/settings/OpenCodianSettings.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Modify: directly related settings tests and docs

**Acceptance:**
- Skill-mode wording, project command editor descriptions, hidden generated agent behavior, and catalog copy are internally consistent and understandable
- The settings surface matches what the runtime actually does

### Task 5: Final review-driven checkpoint

**Files:**
- Modify only directly affected files and docs from prior tasks

**Acceptance:**
- `npm run verify` passes
- The last lane phase doc records remaining intentional fallbacks or open follow-ups
- The final OpenCode CLI review loop returns PASS with no blocking issues
