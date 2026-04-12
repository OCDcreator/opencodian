# OpenCodian Maintainability Autopilot Round

You are running one unattended maintainability round inside the `opencodian` repository.

Read these files first, in order:
- `AGENTS.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-lane-map.md`
- `{{last_phase_doc}}`

Mission:
- Continue the maintainability program toward single-responsibility modules.
- Choose exactly one high-value, low-risk refactor slice that follows the master plan first, lane map second, previous phase doc third, and focus hint last.
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
2. Start from the lane map's first-check entrypoints for the chosen lane before doing broad `rg` searches.
3. Read only the code and docs needed for this one slice. In successful rounds, do one initial exploration pass and avoid repeatedly rescanning the same large `OpenCodianView` context.
4. `docs/modules/**` should only be read or edited when the module boundary actually changes.
5. Make the smallest meaningful maintainability refactor that improves single responsibility and preserves behavior.
6. If the module boundary changes materially, update only the directly related docs.
7. If this round changes code or tests, run targeted tests first (for example `npm test -- <focused suites>`).
8. Run full `npm test` only when either:
   - the changed files hit a high-risk path such as `src/main.ts`, `src/core/`, `automation/`, `package.json`, `package-lock.json`, `manifest.json`, `styles.css`, or `esbuild.config.mjs`, or
   - this attempt number is divisible by 5.
9. If this round changes code, style, manifest, or build-pipeline files, also run `{{build_command}}`.
10. Deploy to `{{test_vault_plugin_dir}}` only when the changed files hit deploy-relevant paths such as `src/main.ts`, `manifest.json`, `styles.css`, `assets/`, `src/style/`, `src/core/theme/`, or `src/features/settings/`, or when the user explicitly asked to deploy. If deployment runs, copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css`, copy `dist/assets/` when bundled assets changed, and verify deployed `main.js` contains the newest `BUILD_ID`.
11. In successful rounds, keep `git status --short` to at most 2 invocations and `git diff --stat` to at most 1 invocation. Only exceed those budgets during a focused repair after a failed validation step.
12. Write the round summary to `{{next_phase_doc}}`. Include scope, files changed, validation commands, deployment result when applicable, the lane advanced, and the next recommended slice.
13. On success, commit all repo changes with message `{{commit_prefix}}: round {{round_attempt}} - <short subject>`.
14. If tests, build, or deployment fail, attempt one focused repair. If still failing, revert this round's changes, do not commit, and return `failure`.
15. If the maintainability objective is already complete, avoid unnecessary edits and return `goal_complete`.

Response contract:
- Your final response must be valid JSON matching the provided output schema.
- Use actual repo-relative paths in `phase_doc_path` and `changed_files`.
- Set `status` to one of `success`, `failure`, or `goal_complete`.
- On `success`, `commit_sha` and `commit_message` must be non-null.
- On `failure`, `blocking_reason` must explain why the round stopped.
- Include every command you ran in `commands_run`, and list the validation commands in `tests_run`.
