# Autopilot Phase 3 — `a3-formatter-settings`

## Round Design

- **Exact `[NEXT]` slice**: `F3 - Finish formatter editors, advanced JSON, and closeout verification`
- **Active spec file**: `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`
- **External reference file(s)**:
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-formatter-doc.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/config/formatter.ts`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/format/index.ts`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/format/formatter.ts`
- **Targeted files/modules**:
  - `automation/run_opencode_implementation.py`
  - `src/features/settings/SettingsFormatterSection.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - `tests/unit/features/settings/SettingsFormatterSection.test.ts`
  - `tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `docs/modules/features/settings/SettingsFormatterSection.md`
  - `docs/modules/i18n/locales/en.md`
  - `docs/modules/i18n/locales/zh.md`
- **Upstream/runtime contract to confirm**:
  - The required `python3 automation/run_opencode_implementation.py ... --agent build ...` path must keep `build` as the foreground primary agent instead of falling back to the default orchestration agent
  - Builtin formatter editing must map to the verified OpenCode formatter schema: `disabled?: boolean`, `command?: string[]`, `environment?: Record<string, string>`, `extensions?: string[]`
  - Builtin formatter editing must remain available even when runtime status is offline or empty, while runtime detection stays read-only UI truth
  - Advanced JSON must edit only the `formatter` subtree while preserving unknown formatter entry fields and custom formatter keys on save/reload
  - Formatter config remains project-local in `.opencode/opencode.json > formatter`; no plugin-global formatter state is introduced
- **Targeted tests to run**:
  - `npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts`
  - `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `npm run check:module-docs`
  - `npm run verify`
- **Deploy-required paths likely touched**: `Yes` — the slice changes `src/features/settings/` and locale files, so a successful verified build requires Test Vault deployment plus `BUILD_ID` verification
- **Non-goals / boundaries**:
  - Do not add new Formatter subpages beyond `overview` and `config`
  - Do not change OpenCode server / SDK formatter protocols or move formatter config into plugin settings
  - Do not refactor unrelated settings owners or lane-hop into agent / MCP work
  - Do not broaden the JSON editor to the whole `.opencode/opencode.json`; keep it scoped to `formatter`

## Design Review Result

- **Verdict**: `PASS`
- **Checks**:
  - Queue scope stays on roadmap F3 only, plus the minimum wrapper fix required to let the mandated OpenCode `--agent build` pass run in a true foreground primary-agent mode
  - Ownership remains in existing seams: `SettingsFormatterSection` owns formatter UI/edit flows, `OpencodeConfigManager` remains the formatter config writer, and `automation/run_opencode_implementation.py` is the narrow place to enforce a pure foreground OpenCode run
  - Runtime/config separation is preserved: runtime status badges inform the UI but never overwrite or block local formatter config intent
  - Unknown field preservation is explicit for both visual editors and advanced JSON, matching the spec’s forward-compatibility requirement
  - Because `src/features/settings/` and locale files are in scope, deploy verification is correctly planned after a green `npm run verify`

## Implementation Summary

- OpenCode pass 1 landed the main F3 formatter editing surface:
  - expanded `SettingsFormatterSection.ts` with builtin formatter actions, custom formatter CRUD, advanced JSON editing, and offline-aware config mode rendering
  - added the new formatter locale keys, formatter config tests, and synced module docs
  - exposed the OpenCode `build`-agent fallback bug in the required wrapper flow, which Codex fixed by forcing `--pure` inside `automation/run_opencode_implementation.py`
- Codex review found four blockers after the main OpenCode pass:
  - builtin formatter rows disappeared when runtime status was offline or empty
  - custom formatter editing still lacked `environment`
  - builtin override save logic relied on DOM input order and broke once environment rows existed
  - lint warnings remained on touched formatter files
- Codex applied the focused follow-up fixes on top of the landed F3 diff:
  - added an upstream builtin formatter catalog fallback so builtin editors still render without runtime detection
  - added custom formatter environment editing and localized command-required validation
  - switched save paths to stable class-based input lookups plus shared environment-row collection
  - eliminated new touched-file lint warnings by keeping formatter warnings off the changed formatter files while leaving the same pre-existing `max-lines` warnings on the long-lived `OpencodeConfigManager` files only

## Files Changed

- `automation/run_opencode_implementation.py`
- `docs/modules/features/settings/SettingsFormatterSection.md`
- `docs/modules/i18n/locales/en.md`
- `docs/modules/i18n/locales/zh.md`
- `docs/status/lanes/a3-formatter-settings/autopilot-phase-3.md`
- `src/features/settings/SettingsFormatterSection.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/core/config/OpencodeConfigManager.test.ts`
- `tests/unit/features/settings/SettingsFormatterSection.test.ts`

## Validation

- OpenCode pass evidence:
  - `python3 automation/run_opencode_implementation.py --timeout-seconds 3600 --dir . --agent build --message-file "automation/runtime/round-024/opencode-implementation-brief.md" --log-path "automation/runtime/round-024/opencode-implementation.log"`
  - focused formatter tests were driven green inside the pass after an initial failing `SettingsFormatterSection` run
  - `npm run check:module-docs` passed inside the pass
  - `npm run verify` produced build `autopilot-agent-mcp-formatter-review-loop.202604252238`
- Codex rerun validation:
  - `npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts`
  - `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `npm run check:module-docs`
  - `npm run verify`
  - `perl -ne 'if(/BUILD_ID=\$\{"([^"]+)"\}/){print "$1\n"; exit}' dist/main.js`
  - `cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
  - `cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json`
  - `cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css`
  - `rg -n "autopilot-agent-mcp-formatter-review-loop.202604252238" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
  - `git diff --check`
- Result:
  - focused formatter/config tests pass (`70 passed` across the two targeted suites)
  - `npm run check:module-docs` passes
  - `npm run verify` passes and produces build `autopilot-agent-mcp-formatter-review-loop.202604252238`
  - only the same two pre-existing `max-lines` warnings remain on `OpencodeConfigManager.ts` and `OpencodeConfigManager.test.ts`; no formatter-file warnings remain
  - Test Vault deployment succeeded and the deployed `main.js` contains the same `BUILD_ID`

## Code Review Result

- **Verdict**: `PASS`
- **Checks**:
  - Active slice stays within F3: builtin/custom formatter editing, advanced JSON, tests, docs, and closeout validation only
  - Builtin formatter editing no longer depends on runtime detection truth; builtin rows still render when runtime status is offline or empty
  - Custom formatter editing now includes `environment`, and save paths use stable field selection instead of DOM-order assumptions
  - Advanced JSON remains scoped to the formatter subtree and preserves unknown formatter fields through config writes
  - Fresh targeted tests, module-doc checks, full verify, and deploy verification all pass; only the same pre-existing long-file warnings on `OpencodeConfigManager*` remain

## Outcome

- `F3 - Finish formatter editors, advanced JSON, and closeout verification` is complete and ready to mark `[DONE]`.
- The formatter lane now has no remaining queued slices.
- Required deploy verification is complete for the verified build.

## Next Recommended Slice

- None — `a3-formatter-settings` is complete and the formatter lane can close.
