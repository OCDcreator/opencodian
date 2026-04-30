# Repository Autopilot Round — Hotspot Core Packaging

You are running one unattended repository autopilot round inside the `opencodian` repository.

Read these files first, in order:
- `AGENTS.md` if it exists
- `graphify-out/GRAPH_REPORT.md`
- `docs/status/autopilot-master-plan.md`
- `docs/status/autopilot-lane-map.md`
- `{{current_lane_roadmap}}`
- `{{last_phase_doc}}`

Then read the module docs named by the current `[NEXT]` slice before touching source files.

Mission:
- Continue the hotspot core packaging program one active lane at a time.
- Stay inside lane `{{current_lane_id}}` (`{{current_lane_label}}`).
- Execute exactly one queued packaging slice: the first item marked `[NEXT]` in `{{current_lane_roadmap}}`.
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

Mandatory Codex design + code review loop:
1. Use the plan tool before making substantive changes.
2. Read the current `[NEXT]` lane item and restate its lane, goal, constraints, and acceptance criteria in your plan.
3. Create `{{next_phase_doc}}` before editing app code. Start it with:
   - `## Round Design`
   - `## Hotspot Baseline`
   - `## Design Review Result`
4. In `## Round Design`, restate:
   - the exact `[NEXT]` slice
   - targeted hotspot files and adjacent owners
   - the before/after ownership surface you intend to shrink
   - the tests and docs likely to change
   - explicit non-goals
5. In `## Hotspot Baseline`, record the current line-count, import-count, or churn evidence cited by the lane docs before you refactor.
6. Perform a Codex design review before editing code. Record a verdict under `## Design Review Result`. If the design is not ready, revise it until the verdict is `PASS`.
7. Start from the lane roadmap, lane map, graph report, and matching module docs before broad searching.
8. Read only the code and docs needed for this one slice.
9. Make the smallest meaningful packaging refactor that reduces direct ownership, assembly pressure, import surface, or hot-file churn for the current hotspot.
10. Prefer strengthening existing adjacent owners over creating new thin helper, adapter, provider, or factory files. New files are only allowed when they own a durable, multi-call responsibility.
11. Do not push new runtime ownership back into `src/features/chat/OpenCodianView.ts` or `src/core/opencode/OpenCodeService.ts`.
12. If source-module boundaries change, update the matching `docs/modules/**` pages and run `npm run check:module-docs`.
13. If `src/` changes, keep graphify fresh. Run `npm run graphify:update:src` when needed before final validation so `npm run check:graphify` stays truthful.
14. Run targeted tests first when code or tests change and a targeted test command pattern is configured.
15. Run every configured validation command on successful rounds.
16. When a validation command is blank, do not invent a substitute; record the gap in the phase doc instead.
17. After tests and validation are green, review the full diff yourself as Codex against the lane acceptance criteria and project guardrails. Record the result under `## Code Review Result`.
18. If the Codex code review finds blockers, fix them and rerun the relevant tests and review until the final review verdict is `PASS`, or prove a real blocker.
19. If the implementation path uses background tasks or detached sub-work, the main pass exit is not completion. Wait until those background tasks finish, the repo-visible work they own has landed, and the final round artifacts required by this scaffold exist.
20. A clean main pass exit is not enough when background tasks were used. Before moving on, confirm there are no still-running background tasks tied to the implementation pass and that the final round artifacts have actually been written.
21. Update `{{current_lane_roadmap}}` on success: mark the executed `[NEXT]` item as `[DONE]`, promote the next `[QUEUED]` item to `[NEXT]`, and keep later items `[QUEUED]`.
22. Write the round summary to `{{next_phase_doc}}`. Include scope, hotspot deltas, files changed, validation commands, review verdicts, the completed roadmap queue item, and the next recommended slice.
23. Commit successful rounds as `{{commit_prefix}}: round {{round_attempt}} - <short subject>`.
24. If validation fails, attempt one focused repair. If it still fails, revert the round, do not commit, and return `failure`.
25. If the queued objective is already complete, avoid unnecessary edits, update the lane roadmap accordingly, and return `goal_complete`.

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
- Include every command you ran in `commands_run`, and list the validation commands in `tests_run`.
- Report `background_tasks_used`, `background_tasks_completed`, `repo_visible_work_landed`, and `final_artifacts_written` truthfully; `success` is invalid if background work is still running, repo-visible work has not landed, or final artifacts are missing.
