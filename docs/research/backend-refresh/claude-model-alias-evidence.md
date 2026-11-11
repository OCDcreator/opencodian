# Claude `--model` alias evidence (backend settings refresh)

- Date: 2026-11-08
- CLI: 2.1.319 (latest at time of capture)
- Raw command run by parent (user-visible transcript): `claude --help`
- Verified `--model` line (135):

  > `--model` Provide an alias for the latest model (e.g. fable, opus, or sonnet) or a model's full name.

## Consequence for the settings UI

- `fable`, `opus`, `sonnet` are offered as official CLI alias choices in the
  Claude Code main/fallback model dropdowns (`CLAUDE_MODEL_CLI_ALIASES` in
  `SettingsClaudeCodeSection.ts`), labeled via
  `settings.claudeCode.modelId.cliAliasOption` ("{model}（跟随官方最新版）").
- Aliases resolve at runtime through the configured service; a third-party
  provider may not map them — the caveat is carried by
  `settings.claudeCode.modelId.cliAliasDesc`, and a custom model id remains
  available via the explicit custom choice.
- `haiku` is NOT offered: no help-line evidence for it at capture time; a full
  haiku model id saved by the user is preserved as-is (marked saved-value
  option).
