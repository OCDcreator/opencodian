# Repository Autopilot Round — Thick Owner Thinning (2h Batch)

You are running one unattended repository autopilot round inside the `opencodian` repository.

Subagent mode rules for this round:
- Treat yourself as a non-interactive subagent dispatched by the repo-local autopilot controller.
- Do not emit commentary, status updates, acknowledgements, or any non-JSON response before the final structured result.
- Do not run top-level conversation startup rituals that require pre-tool narration or user approval.
- Skip meta-skills that only apply to interactive top-level conversations, including `using-superpowers`, unless a lane file explicitly requires one for repository work.
- You may call tools immediately without any preamble. The only user-visible output for this round is the final JSON result.

Read these files first, in order:
- `AGENTS.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/requirements/maintenance-development-baseline.md`
- `docs/status/development-maintainability-rules.md`
- `docs/status/autopilot-master-plan.md`
- `docs/status/autopilot-lane-map.md`
- `{{current_lane_roadmap}}`
- `{{last_phase_doc}}`

Then read the matching module docs and the minimum source files needed for the active `[NEXT]` slice.

Mission:
- Continue the thick-owner thinning batch one active lane at a time.
- Stay inside lane `{{current_lane_id}}` (`{{current_lane_label}}`).
- Execute exactly one queued slice: the first item marked `[NEXT]` in `{{current_lane_roadmap}}`.
- Do not freestyle outside the queue.
- Do not start another round.

Execution contract:
- Use repository tools, shell commands, file edits, tests, and commits as needed.
- This is a Codex-only unattended round. Do not invoke OpenCode CLI or repo-external implementation runners.
- The final response must be valid JSON matching the configured schema, but you should do real repo work before producing it.

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

Configured validation commands:
- Lint: `{{lint_command}}`
- Typecheck: `{{typecheck_command}}`
- Full test: `{{full_test_command}}`
- Build: `{{build_command}}`

Mandatory Codex design + review loop:
1. Use the plan tool before making substantive changes.
2. Read the current `[NEXT]` lane item and restate its goal, constraints, acceptance criteria, likely files, and likely tests in your plan.
3. Create `{{next_phase_doc}}` before editing app code. Start it with:
   - `## Round Design`
   - `## Hotspot Baseline`
   - `## Design Review Result`
4. In `## Round Design`, restate:
   - the exact `[NEXT]` slice
   - targeted hotspot files and adjacent owners
   - the before/after ownership surface you intend to shrink
   - tests and docs likely to change
   - explicit non-goals
5. In `## Hotspot Baseline`, record current file metrics or churn evidence relevant to this slice.
6. Perform a Codex design review before editing code. If the design is not ready, revise it until your own verdict is `PASS`.
7. Start from the lane roadmap, lane map, graph report, and matching module docs before broad searching.
8. Make the smallest meaningful refactor that removes durable ownership from the hotspot without creating thin wrapper sprawl.
9. `ServerManager.ts` must remain the lifecycle/state owner. Move only the durable seam named by the roadmap item.
10. Do not touch `src/main.ts`, `src/features/chat/OpenCodianView.ts`, or `src/core/opencode/OpenCodeService.ts` unless the active roadmap item explicitly requires it.
11. If source-module boundaries change, update the matching `docs/modules/**` pages and run `npm run check:module-docs`.
12. If `src/` changes, refresh graphify before final validation so `npm run verify` remains truthful.
13. Run targeted tests first when code or tests change and a targeted test command pattern is configured.
14. Run every configured validation command on successful rounds. If a validation command is blank, record that fact instead of inventing a substitute.
15. After tests and validation are green, review the full diff yourself as Codex against the lane acceptance criteria and maintainability guardrails. Record the result under `## Code Review Result`.
16. If the Codex code review finds blockers, fix them and rerun the relevant tests and review until the final verdict is `PASS`, or prove a real blocker.
17. Update `{{current_lane_roadmap}}` on success: mark the executed `[NEXT]` item as `[DONE]`, promote the next `[QUEUED]` item to `[NEXT]`, and keep later items `[QUEUED]`.
18. Write the round summary to `{{next_phase_doc}}`. Include scope, hotspot deltas, files changed, validation commands, review verdicts, the completed roadmap queue item, and the next recommended slice.
19. Commit successful rounds as `{{commit_prefix}}: round {{round_attempt}} - <short subject>`.
20. If validation fails, attempt one focused repair. If it still fails, revert the round, do not commit, and return `failure`.
21. If the queued objective is already complete, avoid unnecessary edits, update the roadmap accordingly, and return `goal_complete`.

Phase-doc expectations on success:
- `## Round Design`
- `## Hotspot Baseline`
- `## Design Review Result`
- `## Implementation Summary`
- `## Files Changed`
- `## Validation`
- `## Code Review Result`
- `## Outcome`
- `## Next Recommended Slice`

Response contract:
- Your final response must be valid JSON matching the provided output schema.
- Set `lane_id` to `{{current_lane_id}}`.
- Set `plan_review_verdict` and `code_review_verdict` to the final Codex review verdicts.
- Use actual repo-relative paths in `phase_doc_path` and `changed_files`.
- Set `status` to one of `success`, `failure`, or `goal_complete`.
- On `success`, `commit_sha` and `commit_message` must be non-null.
- On `failure`, `blocking_reason` must explain why the round stopped.
- Include every command you ran in `commands_run`, and list validation commands in `tests_run`.
- Report `background_tasks_used`, `background_tasks_completed`, `repo_visible_work_landed`, and `final_artifacts_written` truthfully.
