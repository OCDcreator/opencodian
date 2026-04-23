# Repository Autopilot Round — SDK Permission And Slash Alignment

You are running one unattended repository autopilot round inside the `opencodian` repository.

Read these files first, in order:
- `AGENTS.md`
- `docs/status/autopilot-sdk-permission-slash-master-plan.md`
- `docs/status/autopilot-sdk-permission-slash-lane-map.md`
- `docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-permission-mechanism.md`
- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/OpenCode-Slash-Command-Architecture.md`
- `{{current_lane_roadmap}}`
- `{{last_phase_doc}}`

Mission:
- Continue the SDK permission/slash alignment program one active lane at a time.
- Stay inside lane `{{current_lane_id}}` (`{{current_lane_label}}`).
- Execute exactly one queued slice: the first item marked `[NEXT]` in `{{current_lane_roadmap}}`.
- Do not freestyle outside the queue.
- Do not start another round.

Round metadata:
- Active lane id: `{{current_lane_id}}`
- Active lane label: `{{current_lane_label}}`
- Active lane roadmap: `{{current_lane_roadmap}}`
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
- Runner kind: `{{runner_kind}}`
- Runner model: `{{runner_model}}`

Configured validation commands:
- Lint: `{{lint_command}}`
- Typecheck: `{{typecheck_command}}`
- Full test: `{{full_test_command}}`
- Build: `{{build_command}}`
- Vulture: `{{vulture_command}}`

Mandatory review loop:
1. Use the plan tool before making substantive changes.
2. Create `{{next_phase_doc}}` before changing app code. Start it with a `## Round Design` section that restates:
   - the exact `[NEXT]` slice
   - targeted files/modules
   - the upstream SDK/command contract to confirm
   - tests to run
   - non-goals / boundaries
3. Run this exact pre-implementation review command:
   - `bash automation/opencode-review.sh plan "{{next_phase_doc}}" "docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md" "{{current_lane_roadmap}}" "/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-permission-mechanism.md" "/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/OpenCode-Slash-Command-Architecture.md"`
4. If the plan review returns FAIL, revise `{{next_phase_doc}}` and rerun it until it passes. Do not edit app code before it passes.
5. After implementation, run targeted tests first when code changes.
6. Then run this exact post-change review command:
   - `bash automation/opencode-review.sh code "{{current_lane_roadmap}}" "{{next_phase_doc}}" "docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md"`
7. If the code review returns FAIL, fix the issues, rerun targeted tests, and rerun the code review until it passes.
8. Only after the post-change review passes may you run the full validation command, update the roadmap, and commit.

Required workflow:
1. Start from the queue entrypoints and direct module docs before broad searching.
2. Keep the slice minimal and behavior-preserving.
3. Preserve existing fallback behavior unless the queued slice explicitly replaces it with proof and tests.
4. For permission work, confirm the implementation matches upstream rule semantics such as patterned rules, `ask/allow/deny`, and `external_directory`.
5. For slash command work, confirm the implementation matches upstream distinctions between backend prompt commands and frontend/TUI commands.
6. For settings work, ensure labels and descriptions are understandable to humans and match runtime truth.
7. Update only directly related docs when module boundaries or user-visible semantics materially change.
8. When a validation command is blank, do not invent one; record the gap in the phase doc.
9. Update `{{current_lane_roadmap}}` on success: mark the executed `[NEXT]` item as `[DONE]`, promote the next `[QUEUED]` item to `[NEXT]`, and keep later items `[QUEUED]`.
10. Write the final round summary to `{{next_phase_doc}}`. Include the design review result, the code review result, changed files, tests run, and the next recommended slice.
11. Commit successful rounds as `{{commit_prefix}}: round {{round_attempt}} - <short subject>`.
12. If validation fails after one focused repair, revert the round, do not commit, and return `failure`.
13. If the queued objective is already complete, avoid unnecessary edits, update the roadmap accordingly, and return `goal_complete`.

Response contract:
- Your final response must be valid JSON matching the provided output schema.
- Set `lane_id` to `{{current_lane_id}}`.
- Use actual repo-relative paths in `phase_doc_path` and `changed_files`.
- Set `status` to one of `success`, `failure`, or `goal_complete`.
- On `success`, `commit_sha` and `commit_message` must be non-null.
- On `failure`, `blocking_reason` must explain why the round stopped.
- Include every command you ran in `commands_run`, and list the validation commands in `tests_run`.
