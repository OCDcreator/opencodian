# Autopilot Round Roadmap — `a3-formatter-settings`

## Queue

### [DONE] F1 - Add formatter config types and runtime/config helpers

- **Lane**: Formatter data foundation
- **Goal**: Make formatter config a typed, first-class part of the OpenCodian config model and add the minimum `OpencodeConfigManager` helpers needed for the settings UI.
- **Priority entrypoints**:
  - `src/core/types/opencodeConfig.ts`
  - `src/core/types/index.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - matching tests/docs
- **References**:
  - `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`
- **Constraints**:
  - Preserve unknown formatter entry fields when writing config back.
  - Confirm the runtime `formatter.status()` shape before locking UI assumptions.
- **Acceptance**:
  - Formatter config is explicitly typed and helper methods can read/update just the formatter subtree.
  - Tests cover formatter config read/write behavior.

### [DONE] F2 - Add the Formatter top-level settings UI

- **Lane**: Formatter settings surface
- **Goal**: Add the top-level `Formatter` settings page with `overview` and `config` secondary views, including runtime status presentation and mode switching.
- **Priority entrypoints**:
  - `src/features/settings/SettingsFormatterSection.ts`
  - `src/features/settings/settingsLayoutRegistry.ts`
  - `src/features/settings/SettingsTabbedRenderer.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - locale files and matching docs/tests
- **References**:
  - `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`
- **Constraints**:
  - Keep runtime status read-only and separate from project config intent.
  - Do not introduce extra formatter subpages beyond `overview` and `config`.
- **Acceptance**:
  - The new top-level Formatter page renders in both classic and tabbed settings layouts.
  - Users can switch between default / disabled / custom formatter modes.
  - Tests cover render state and mode-switch behavior.

### [DONE] F3 - Finish formatter editors, advanced JSON, and closeout verification

- **Lane**: Formatter editing and final closeout
- **Goal**: Finish builtin/custom formatter editing, advanced JSON editing, runtime status failure handling, docs sync, and final queue closeout verification.
- **Priority entrypoints**:
  - `src/features/settings/SettingsFormatterSection.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - locale files, tests, and matching docs
- **References**:
  - `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`
- **Constraints**:
  - Preserve unknown formatter fields in the advanced JSON editor.
  - Keep formatter config local to `.opencode/opencode.json`.
  - If deploy-relevant settings/runtime paths change, complete Test Vault deployment verification in this round.
- **Acceptance**:
  - Builtin/custom formatter editing and advanced JSON save/reload flows work as specified.
  - Runtime status failures do not block local config editing.
  - The lane ends with docs synced, final verification green, and deploy verified where required.

## Lane state

- When this roadmap has no remaining `[NEXT]` or `[QUEUED]` items, the controller may mark the overall objective complete.
