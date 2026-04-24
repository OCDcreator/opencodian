# Phase 2 — Command settings wording and human-facing semantics

## Round Design

- **Exact `[NEXT]` slice**: `C2 - Align command settings wording and human-facing semantics` from `docs/status/lanes/s2-slash-sdk/autopilot-round-roadmap.md`.
- **Targeted files/modules**:
  - `src/features/settings/SettingsCommandsSection.ts` — tighten the Commands catalog copy so skill mode, project-only entries, and current runtime availability read correctly to humans.
  - `src/features/settings/SettingsProjectCommandEditor.ts` — tighten editor-facing wording/labels around project command overrides and command-local sampling so the hidden generated-agent implementation detail is explained accurately.
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - `tests/unit/features/settings/SettingsCommandsSection.test.ts`
  - `tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
  - matching module docs for `SettingsCommandsSection` / `SettingsProjectCommandEditor` / `OpenCodianSettings` if the documented user-facing semantics change
- **Current gaps this slice will fix**:
  - the Commands settings copy still reads like every listed slash command is equally chat-visible, even though `C1` made chat/runtime truth depend on the runtime catalog and kept project-only entries in settings for editing only.
  - the skill mode copy is accurate but too thin: it should make clear this only changes how skills are exposed in the slash UI, not whether the runtime has the skill.
  - the editor copy still exposes the generated command-local agent behavior as a low-level implementation detail instead of plain-language command semantics.
- **Upstream SDK/command contract to confirm**:
  - OpenCode slash commands in this settings surface are backend prompt commands, not frontend/TUI slash actions.
  - runtime prompt command availability still comes from `sdk.command.list()`; project `command.<id>` entries can exist ahead of runtime registration and remain editable here without claiming they are currently runnable from chat.
  - `slashCommandSkillMode` only changes whether skills are reached as direct `/skill` entries or via `/skills <skill>`; it does not change the runtime skill catalog itself.
  - command-local `temperature` / `top_p` patches are implemented by OpenCodian through a hidden generated agent, but the settings surface should describe the human-facing effect first and avoid leaking internal agent ids.
- **Tests to run**:
  - `npm test -- --runTestsByPath tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
  - `npm run verify`
  - configured gaps to record, not invent: lint / typecheck / build / vulture commands are blank in the round metadata, so this phase relies on the targeted tests plus `npm run verify` as the only controller-provided validation commands.
- **Non-goals / boundaries**:
  - do not change slash runtime execution/catalog logic from `C1` unless a wording fix requires a tiny matching presentation hook in the settings owner.
  - do not touch permission behavior or lane `s1-permission-sdk`.
  - do not redesign unrelated settings sections or broader chat/composer UX.
  - do not add new deploy/build commands outside the controller-provided validation flow.

## Review Log

- Plan review: **PASS** — `automation/opencode-review.sh plan` produced a PASS review in `automation/runtime/opencode-reviews/20260424-124631-plan.txt`; the wrapper still printed “verdict missing” because the reviewer emitted markdown `**VERDICT: PASS**` instead of the shell helper’s exact sentinel line.
- Code review: **PASS** — `automation/opencode-review.sh code` produced a PASS review in `automation/runtime/opencode-reviews/20260424-125622-code.txt`; like the plan review helper, the wrapper ended with “verdict missing” after a markdown-style PASS line, but the saved log contains a clean PASS with no blockers or minors.

## Validation

- Targeted tests:
  - `npm test -- --runTestsByPath tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
  - rerun after the focused import-sort lint repair: `npm test -- --runTestsByPath tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
- Full validation:
  - `npm run verify`
- Build/deploy notes:
  - configured gaps remained unchanged: lint / typecheck / build / vulture were blank in the round metadata, so the controller-provided full gate stayed `npm run verify`
  - `npm run verify` passed and produced `BUILD_ID=autopilot-sdk-permission-slash-sdk.202604241259`
  - because the round touched `src/features/settings/**`, the built `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` were copied sequentially to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`
  - deployed `main.js` was verified with `rg -n "autopilot-sdk-permission-slash-sdk\\.202604241259" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## Round Summary

- **Status**: success
- **Changed files**:
  - `src/features/settings/SettingsCommandsSection.ts`
  - `src/features/settings/SettingsProjectCommandEditor.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - `tests/unit/features/settings/SettingsCommandsSection.test.ts`
  - `tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
  - `docs/modules/features/settings/SettingsCommandsSection.md`
  - `docs/modules/features/settings/SettingsProjectCommandEditor.md`
  - `docs/modules/i18n/locales/en.md`
  - `docs/modules/i18n/locales/zh.md`
  - `docs/status/lanes/s2-slash-sdk/autopilot-round-roadmap.md`
  - `docs/status/lanes/s2-slash-sdk/autopilot-phase-2.md`
- **Behavior outcome**: Commands settings now describe project-only entries as saved config waiting on runtime exposure, skill entries switch to `/skills <skill>` wording when prefix mode is active, and command-local sampling explains the hidden helper-agent flow without leaking internal agent IDs.
- **Design review result**: PASS
- **Code review result**: PASS
- **Tests run**:
  - `npm test -- --runTestsByPath tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
  - `npm test -- --runTestsByPath tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts` (rerun after import-sort repair)
  - `npx eslint --fix src/features/settings/SettingsCommandsSection.ts src/features/settings/SettingsProjectCommandEditor.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
  - `npm run verify`
  - `cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
  - `cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json`
  - `cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css`
  - `rg -n "autopilot-sdk-permission-slash-sdk\\.202604241259" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
- **Next recommended slice**: `s3-checkpoint`
