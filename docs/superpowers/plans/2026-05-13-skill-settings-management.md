# Skill Settings Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact Skills settings surface that can create, delete, enable, disable, permission-scope, inspect, render, edit, and validate OpenCode `SKILL.md` files, plus add agent-level skill permission overrides.

**Architecture:** Keep runtime truth in `.opencode/opencode.json`: global and per-skill rules write `permission.skill`, while agent overrides write `agent.<id>.permission.skill` and `agent.<id>.tools.skill`. Keep file CRUD in `SettingsSkillSection` because the feature is a settings surface and should not add a new service until the behavior is reused elsewhere. Use Obsidian markdown rendering for full skill preview and plain text editing for the source.

**Tech Stack:** TypeScript, Obsidian `Setting`/`Modal`, existing `OpencodeConfigManager`, repo-local settings CSS, Jest.

---

### Task 1: Configuration helpers

**Files:**
- Modify: `src/core/config/OpencodeConfigManager.ts`
- Test: `tests/unit/core/config/OpencodeConfigManager.test.ts`

- [ ] Add helpers that read/write patterned skill permissions under `permission.skill`, preserving shorthand permission values by expanding them to `{ "*": action }`.
- [ ] Add helpers that update `agent.<id>.permission.skill` and `agent.<id>.tools.skill`, preserving unrelated agent fields through existing `upsertAgentConfig()`.
- [ ] Verify with Jest that global and agent updates preserve unrelated keys.

### Task 2: Compact skill catalog and editor

**Files:**
- Modify: `src/features/settings/SettingsSkillSection.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Test: `tests/unit/features/settings/SettingsSurfaceSections.test.ts`

- [ ] Replace large content cards with compact rows that show only name, description, source, and direct action controls.
- [ ] Add project-skill creation at `.opencode/skills/<name>/SKILL.md` with a valid frontmatter starter.
- [ ] Add project-local deletion for skill files inside the active vault; keep external/global/plugin skills read-only.
- [ ] Add a detail modal with source editing, rendered markdown preview, validation status, save, and delete actions.
- [ ] Validate frontmatter delimiters, `name`, `description`, official skill-name pattern, and body presence before saving.
- [ ] Add per-skill permission dropdowns that write `permission.skill.<skillName> = allow|ask|deny`.

### Task 3: Agent-level skill overrides

**Files:**
- Modify: `src/features/settings/SettingsProjectAgentEditor.ts`
- Modify: `src/features/settings/projectAgentEditorConfig.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Test: `tests/unit/features/settings/SettingsProjectAgentEditor.test.ts`

- [ ] Add an Advanced group toggle for `agent.<id>.tools.skill=false` so an agent can completely disable skill use.
- [ ] Add an Advanced group dropdown for `agent.<id>.permission.skill`, supporting inherit, allow, ask, and deny.
- [ ] Ensure saving preserves task allowlists and unrelated permission keys.
- [ ] Add Jest coverage for both complete-disable and permission override writes.

### Task 4: Styling, docs, and validation

**Files:**
- Modify: `src/style/components/settings-layout-contract.css`
- Modify: `docs/modules/features/settings/SettingsSkillSection.md`
- Modify: `docs/modules/features/settings/SettingsProjectAgentEditor.md`

- [ ] Style compact skill rows, modal split preview/editor, validation messages, and agent skill override controls with Obsidian-native variables.
- [ ] Update module docs to explain file CRUD, markdown preview/editing, validation, global permissions, per-skill rules, and agent overrides.
- [ ] Run targeted Jest, then build. If `src/` changed, refresh graphify artifacts and run module-doc/graphify gates before full verify.
