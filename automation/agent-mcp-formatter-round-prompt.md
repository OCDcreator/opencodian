# Repository Autopilot Round — Agent Surface, MCP, Formatter

You are running one unattended repository autopilot round inside the `opencodian` repository.

Read these files first, in order:
- `AGENTS.md`
- `docs/status/autopilot-agent-mcp-formatter-master-plan.md`
- `docs/status/autopilot-agent-mcp-formatter-lane-map.md`
- `{{current_lane_roadmap}}`
- `{{last_phase_doc}}`

Then read the spec and reference files named by the active `[NEXT]` slice in `{{current_lane_roadmap}}`.

Mission:
- Continue the committed three-stage program one active lane at a time: agent surface first, MCP second, formatter third.
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
- Current round directory: `{{current_round_directory}}`
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

Mandatory design -> OpenCode -> Codex review loop:
1. Use the plan tool before making substantive changes.
2. Create `{{next_phase_doc}}` before changing app code. Start it with a `## Round Design` section that restates:
   - the exact `[NEXT]` slice
   - the active spec file and external reference file(s)
   - targeted files/modules
   - the upstream/runtime contract to confirm
   - targeted tests to run
   - whether deploy-required paths are likely to be touched
   - non-goals / boundaries
3. Perform a Codex design review against the active roadmap/spec/reference docs before editing app code. Record the result in `{{next_phase_doc}}` under `## Design Review Result`. If the design is not ready, revise it until your own verdict is `PASS`.
4. Create `{{current_round_directory}}/opencode-implementation-brief.md` for OpenCode. That brief must:
   - name the exact `[NEXT]` slice and active acceptance criteria
   - point OpenCode to the active spec doc, external reference doc(s), roadmap, and phase doc
   - tell OpenCode to edit the repo directly and stay within the queued slice
   - forbid unrelated refactors, lane hopping, or fake success reporting
   - require targeted tests for touched code and module-doc sync where needed
   - remind OpenCode that the implementation subprocess is allowed to run for up to `3600` seconds
5. Run OpenCode for implementation with this exact wrapper pattern, adjusting only the brief/log paths and optional attachments:
   - `python3 automation/run_opencode_implementation.py --timeout-seconds 3600 --dir . --agent build --message-file "{{current_round_directory}}/opencode-implementation-brief.md" --log-path "{{current_round_directory}}/opencode-implementation.log"`
6. Once the OpenCode wrapper starts, do not kill it early just because the repo diff is still empty or the pass is still reading files. Discovery, reference-reading, and long planning inside the child run are expected for this program.
7. Treat a still-growing `{{current_round_directory}}/opencode-implementation.log` or a still-live wrapper/opencode PID as proof that the pass is still working, even if no repo edits have landed yet.
8. Only interrupt or retry an OpenCode implementation pass early when there is a hard failure signal: the wrapper exits non-zero, the log proves a concrete blocker, or the operator explicitly asks to stop. Lack of edits alone is not a blocker.
9. If the OpenCode wrapper exits with `124`, treat it as a timeout rather than an automatic round failure. Inspect the partial diff and the implementation log, tighten the brief if needed, and run another OpenCode pass unless a real blocker is proven.
10. After every OpenCode pass, review the full diff yourself as Codex against the active roadmap/spec/reference docs. Record the result in `{{next_phase_doc}}` under `## Code Review Result`.
11. If the Codex code review finds blockers, update the OpenCode brief and run another OpenCode pass. Keep iterating until the review result is `PASS` or you can prove a real blocker.
9. Run targeted tests first for changed code. If targeted tests fail, fix the smallest justified issue (prefer another OpenCode pass for substantive changes), rerun the Codex review, and rerun the targeted tests.
10. Run the configured full validation command: `{{full_test_command}}`.
11. If the changed files touch any deploy-required path (`src/main.ts`, `manifest.json`, `styles.css`, `assets/`, `src/style/`, `src/core/theme/`, `src/features/settings/`), immediately deploy the built artifacts produced by the successful validation build:
    - extract `BUILD_ID` from `dist/main.js`
    - copy `dist/main.js` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
    - copy `dist/manifest.json` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json`
    - copy `dist/styles.css` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css`
    - if bundled assets changed, replace `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/assets/` with `dist/assets/`
    - verify the deployed `main.js` contains the same `BUILD_ID`
12. Keep build and copy as separate sequential steps. Do not chain them with `&&`. Do not parallelize deployment. Do not verify deployment before the copy finishes.
13. Only after the design review is `PASS`, the Codex code review is `PASS`, targeted tests are green, `{{full_test_command}}` is green, and required deploy verification is green may you update the roadmap and commit.

Required workflow:
1. Start from the queue entrypoints and matching module docs before broad searching.
2. Keep the slice minimal and behavior-preserving unless the spec explicitly changes user-visible behavior.
3. OpenCode performs implementation work; Codex is the final review gate for every round.
4. Do not use the OpenCode review wrapper for this program. The required reviewer is Codex inside this round.
5. If a validation or review blocker needs further code edits, prefer another OpenCode implementation pass unless the fix is tiny, mechanical, and lower-risk to apply directly.
6. When the queued slice touches module boundaries or user-visible semantics, update the matching `docs/modules/**` page in the same round.
7. Preserve current architecture guardrails: no new thin helpers unless reused 3+ times or isolating high risk, no gratuitous bloat in `OpenCodianView.ts` or `OpenCodeService.ts`, and no plugin-private agent semantics.
8. For the agent lane, keep strict native mapping to OpenCode and keep runtime/config/file truth states visibly separate.
9. For the MCP lane, keep the settings ownership in the existing Server domain and make MCP tool identity consistent across history and streaming.
10. For the formatter lane, keep project config state separate from runtime detection state and preserve unknown formatter fields in advanced JSON flows.
11. Use `npm run check:module-docs` whenever touched files require module doc sync, even if the active slice already runs `npm run verify`.
12. If the queued objective is already complete, avoid unnecessary edits, update the roadmap accordingly, and return `goal_complete`.
13. If you hit a true blocker after at least one narrowed OpenCode retry, revert incomplete changes, keep the worktree clean, and return `failure` with the blocker explained plainly.

Useful deployment commands when deploy-required paths changed:
- Extract `BUILD_ID`: `perl -ne 'if(/BUILD_ID=\\$\\{\"([^\"]+)\"\\}/){print \"$1\\n\"; exit}' dist/main.js`
- Verify deployed artifact: `rg -n "<BUILD_ID>" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

Phase-doc expectations on success:
- `## Round Design`
- `## Design Review Result`
- `## Implementation Summary`
- `## Files Changed`
- `## Validation`
- `## Code Review Result`
- `## Outcome`
- `## Next Recommended Slice`

Roadmap update rules:
- On success, mark the executed `[NEXT]` item as `[DONE]`.
- Promote the next `[QUEUED]` item to `[NEXT]`.
- Keep later items `[QUEUED]`.
- If the roadmap becomes empty, do not invent new work.

Commit rule:
- Commit successful rounds as `{{commit_prefix}}: round {{round_attempt}} - <short subject>`.

Response contract:
- Your final response must be valid JSON matching the provided output schema.
- Set `lane_id` to `{{current_lane_id}}`.
- Set `plan_review_verdict` and `code_review_verdict` to your final Codex review verdicts (for example `PASS`).
- Use actual repo-relative paths in `phase_doc_path` and `changed_files`.
- Set `status` to one of `success`, `failure`, or `goal_complete`.
- On `success`, `commit_sha` and `commit_message` must be non-null.
- On `failure`, `blocking_reason` must explain why the round stopped.
- Include every command you ran in `commands_run`, including each OpenCode wrapper invocation, targeted tests, `{{full_test_command}}`, and any deploy copy/verification commands.
- List validation commands in `tests_run`.
- Report a non-empty `build_id` whenever the round relied on the built `dist/` output.
