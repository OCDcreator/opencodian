# Conversation Compaction Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-setting help buttons for the conversation compaction settings group, with plain-language modal explanations and OpenCode default-behavior notes.

**Architecture:** Reuse the existing settings help-button pattern instead of inventing a new UI. Wire `SettingsConversationSection` to receive the shared help-button seam, then open a new topic-driven compaction-help modal whose content is fully driven by i18n.

**Tech Stack:** TypeScript, Obsidian `Setting`/`Modal`, Jest, repo module-doc workflow

---

### Task 1: Add failing coverage for compaction help entrypoints

**Files:**
- Modify: `tests/unit/features/settings/SettingsConversationSection.test.ts`
- Create: `tests/unit/features/settings/ConversationCompactionHelpModal.test.ts`

- [ ] Add a failing test that expects help buttons on the five compaction settings.
- [ ] Run the targeted settings-section test and verify it fails because no help buttons are wired yet.
- [ ] Add a failing modal test that expects one compaction help topic to render title + default explanation.
- [ ] Run the modal test and verify it fails because the modal does not exist yet.

### Task 2: Implement the compaction help modal and wiring

**Files:**
- Create: `src/features/settings/ConversationCompactionHelpModal.ts`
- Modify: `src/features/settings/SettingsConversationSection.ts`
- Modify: `src/features/settings/OpenCodianSettings.ts`

- [ ] Create a topic-driven compaction help modal with shared sections for meaning/default/effect/tips.
- [ ] Pass the shared `addSettingHelpButton` seam from `OpenCodianSettings` into `SettingsConversationSection`.
- [ ] Attach help buttons to `auto`, `prune`, `tail_turns`, `preserve_recent_tokens`, and `reserved`.
- [ ] Run the targeted tests and verify the new modal wiring passes.

### Task 3: Add localized help copy

**Files:**
- Modify: `src/i18n/locales/zh.ts`
- Modify: `src/i18n/locales/en.ts`

- [ ] Add shared compaction-help headings and button tooltip strings.
- [ ] Add per-topic help copy that explains OpenCode defaults and tuning impact in plain language.
- [ ] Re-run the modal test and confirm the rendered text now matches the intended topic content.

### Task 4: Sync docs and final verification

**Files:**
- Modify: `docs/modules/features/settings/SettingsConversationSection.md`
- Create: `docs/modules/features/settings/ConversationCompactionHelpModal.md`
- Modify: `docs/modules/features/settings/OpenCodianSettings.md`

- [ ] Update module docs to describe the new compaction help-button flow and modal responsibility.
- [ ] Run targeted Jest for the new/updated tests.
- [ ] Run `npm run verify`.
