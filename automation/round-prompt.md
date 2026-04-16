# OpenCodian Maintainability Autopilot Round

You are running one unattended maintainability round inside the `opencodian` repository.

Read these files first, in order:
- `AGENTS.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `{{last_phase_doc}}`

Mission:
- Continue the maintainability program toward single-responsibility modules.
- Execute exactly one queued refactor slice: the first item marked `[NEXT]` in `docs/status/maintainability-round-roadmap.md`.
- Do not freestyle. The roadmap queue overrides `focus_hint` whenever they conflict.
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
2. Read the current `[NEXT]` queue item and restate its lane, goal, constraints, and acceptance criteria in your plan.
3. Start from the roadmap and lane map entrypoints for that queue item before doing broad `rg` searches.
4. Read only the code and docs needed for this one slice. In successful rounds, do one initial exploration pass and avoid repeatedly rescanning the same large `OpenCodianView` context.
5. `docs/modules/**` should only be read or edited when the module boundary actually changes.
6. Make the smallest meaningful maintainability refactor that satisfies the current queue item's acceptance criteria and preserves behavior.
7. Prefer merging thin provider / factory / adapter files back into an adjacent owner over creating new files. If a new module would stay under roughly 100 lines and under 3 exports, do not keep it separate unless it isolates a high-risk dependency or is reused in 3+ places.
8. If the module boundary changes materially, update only the directly related docs.
9. If this round changes code or tests, run targeted tests first (for example `npm test -- <focused suites>`).
10. Every successful queue round must also run full `npm run lint`, full `npm run typecheck`, and full `npm test`.
11. If this round changes code, style, manifest, or build-pipeline files, also run `{{build_command}}`.
12. Do not deploy during this maintainability batch unless the user explicitly asked to deploy. If deployment is explicitly requested later, copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css`, copy `dist/assets/` when bundled assets changed, and verify deployed `main.js` contains the newest `BUILD_ID`.
13. In successful rounds, keep `git status --short` to at most 2 invocations and `git diff --stat` to at most 1 invocation. Only exceed those budgets during a focused repair after a failed validation step.
14. On success, update `docs/status/maintainability-round-roadmap.md`: mark the executed `[NEXT]` item as `[DONE]`, promote the next `[QUEUED]` item to `[NEXT]`, and keep all later items as `[QUEUED]`.
15. Write the round summary to `{{next_phase_doc}}`. Include scope, files changed, validation commands, deployment result when applicable, the lane advanced, the completed roadmap queue item, and the next recommended slice.
16. On success, commit all repo changes with message `{{commit_prefix}}: round {{round_attempt}} - <short subject>`.
17. If tests, build, or deployment fail, attempt one focused repair. If still failing, revert this round's changes, do not commit, and return `failure`.
18. If the maintainability objective is already complete, avoid unnecessary edits, mark the roadmap accordingly, and return `goal_complete`.

Response contract:
- Your final response must be valid JSON matching the provided output schema.
- Use actual repo-relative paths in `phase_doc_path` and `changed_files`.
- Set `status` to one of `success`, `failure`, or `goal_complete`.
- On `success`, `commit_sha` and `commit_message` must be non-null.
- On `failure`, `blocking_reason` must explain why the round stopped.
- Include every command you ran in `commands_run`, and list the validation commands in `tests_run`.
