# OpenCodian Maintainability Autopilot Round

You are running one unattended maintainability round inside the `opencodian` repository.

Read these files first:
- `AGENTS.md`
- `{{last_phase_doc}}`

Mission:
- Continue the maintainability program toward single-responsibility modules.
- Choose exactly one high-value, low-risk refactor slice that follows from the previous phase doc and the focus hint.
- Do not start another round.

Round metadata:
- Attempt number: `{{round_attempt}}`
- Next phase number: `{{next_phase_number}}`
- New phase doc path: `{{next_phase_doc}}`
- Current branch: `{{current_branch}}`
- Last successful phase doc: `{{last_phase_doc}}`
- Last commit: `{{last_commit_sha}}`
- Previous summary: `{{last_summary}}`
- Focus hint: `{{focus_hint}}`
- Objective: `{{objective}}`
- Platform note: `{{platform_note}}`
- Test Vault plugin dir: `{{test_vault_plugin_dir}}`

Required workflow:
1. Use the plan tool before making substantive changes.
2. Read only the code and docs needed for this one slice.
3. Make the smallest meaningful maintainability refactor that improves single responsibility and preserves behavior.
4. If the module boundary changes materially, update only the directly related docs.
5. Run `{{test_command}}` after the refactor.
6. If this round changes code, style, manifest, or build-pipeline files, also run `{{build_command}}`.
7. If `{{build_command}}` succeeds, deploy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to `{{test_vault_plugin_dir}}`. If bundled assets changed, copy `dist/assets/` too. Verify the deployed `main.js` contains the newest `BUILD_ID`.
8. Write the round summary to `{{next_phase_doc}}`. Include scope, files changed, validation commands, deployment result when applicable, and the next recommended slice.
9. On success, commit all repo changes with message `{{commit_prefix}}: round {{round_attempt}} - <short subject>`.
10. If tests, build, or deployment fail, attempt one focused repair. If still failing, revert this round's changes, do not commit, and return `failure`.
11. If the maintainability objective is already complete, avoid unnecessary edits and return `goal_complete`.

Response contract:
- Your final response must be valid JSON matching the provided output schema.
- Use actual repo-relative paths in `phase_doc_path` and `changed_files`.
- Set `status` to one of `success`, `failure`, or `goal_complete`.
- On `success`, `commit_sha` and `commit_message` must be non-null.
- On `failure`, `blocking_reason` must explain why the round stopped.
- Include every command you ran in `commands_run`, and list the validation commands in `tests_run`.
