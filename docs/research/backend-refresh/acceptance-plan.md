# Backend version and settings refresh — acceptance contract

Status (2026-11-08): **0229 implementation/build/UI evidence recorded; independent finish review SHIP;
subsequent Kimi PASS, original low documentation finding Resolved, open findings 0.** Final OpenCode 2
**2.2.6 native-runtime proof passed 10/10**, matching the actual CLI/server version and exit 0.
Evidence is delivered for the bounded acceptance scope; no item is satisfied by a plan, unit test alone or fixture image alone.

## Scope and implementation direction

All six selectable, implemented backends are in scope: OpenCode 2, Claude Code, Codex, Pi, ZCode and DSH.
Retired OpenCode 1 stays retired. Task worktree:
`/Users/dht/zcode-worktrees/opencodian/backend-settings-refresh`, branch
`zcode/backend-settings-refresh`, baseline `7ba229538`.

Each backend inventory supplies field name, one-sentence behavior, default, allowed values, application
boundary and product risk, plus actual source/scope and supported/external/unsupported status. A
request-side echo or saved value is not runtime confirmation. Kimi's confirmed documentation corrections
align DSH advanced startup/MCP controls and Pi's new-session save path with the implemented surface.

The Operate surface borrows shadcn Field/FieldSet/Tabs/Card/Alert anatomy and Mantine choice patterns in
Obsidian's existing DOM; no React/shadcn/Mantine runtime dependency is claimed. Controls are choice-first
with inherited/recommended defaults; free-form text remains for paths, endpoints, credentials and custom
values. The shared slider helper is **not instantiated** here; numeric limits use presets plus custom
positive entry. Anthropic/Claude references inform warm neutrals, restrained coral emphasis and grouping
inside the host theme. The signature strip states source, application boundary and recovery. High-risk
permissions, sandbox, process and credential controls have distinct task groups; unknown state stays unknown.

## Required evidence and current disposition

All review paths below are under `.impeccable/review/round2/`; research paths are in this directory.

| User requirement / repository gate | Actual evidence | Current disposition / limit |
|---|---|---|
| New task worktree | Tool-created task worktree and baseline above; `repaired/final-state-check.json` records branch/HEAD and a clean original checkout | Recorded; final git/package operations remain parent-owned |
| Every implemented backend updated | `README.md` current before/after matrix; `versions-and-upstream.md` registry snapshot; `api-refresh-implementation-results.md` landed pins | Claude SDK 0.3.319, Codex SDK 0.167.0, OC2 client 2.2.6; Pi 1.5.0 / DSH 0.2.2-rc.1 / desktop ZCode 3.17.2 unchanged at snapshot. **OC2 final CLI/server 2.2.6 real-model proof PASS 10/10** |
| New APIs compatible | Named real-model outcomes in `evidence-index.md` §1: Claude/Codex/Pi/DSH 8/8, ZCode 12/12, OC2 10/10 | Selected-model contract/safety evidence; final OC2 report explicitly observes server 2.2.6 and supersedes the earlier 2.2.5 outcome for version acceptance. No all-option/model guarantee |
| Tables precede UI decisions | Six `backend-fields-*.md`, `coverage-map.md`, `gap-audit.md` | Required columns/source classes present; dynamic/raw families and unknowns explicit. DSH/Pi drift corrected and independently rechecked |
| Subtabs derive from fields | `field-to-task-map.md`; final normal/special captures | Task groups visible on final 0229; native/wildcard inventories are not exhaustive lists of future SDK fields |
| shadcn/Mantine styles | `evidence-index.md` §6b concrete pattern/class mapping + MIT attribution; final individual screenshots | Borrowed anatomy/choice behavior; no runtime integration or visible-slider claim |
| impeccable | Existing context/direction/craft-floor records; initial `detector.json`; independent FIX → SHIP → Kimi PASS reports | Detector ran once: 0 primary / 1 radius advisory accepted. No post-repair detector rerun claimed |
| Anthropic brand reference | Named `my-skills/external/anthropics-skills/brand-guidelines/SKILL.md` reference in design/review provenance | Applied under Obsidian host/theme constraints; reviewer confirmed bounded direction |
| Claude design reference | Named `my-skills/external/awesome-design-md/claude/DESIGN.md` reference in design/review provenance | Applied to the Operate surface; not a separate design-system dependency |
| humanize copy | `copy-review.md`; `.tmp/backend-refresh-ui/copy-original.json`, `copy-before-after.json`, `copy-recovery-before-after.json`, `corpus-*.txt` | Copy review and recorded checks retained; Pi consequence text independently rechecked |
| Choice-first/defaults | Final choice captures; `scenarios/claude-choice-proof.json` + `claude-fixed-budget-choice.png`; Pi repaired DOM/service fixtures | Claude Adaptive → Fixed/4096 persists across fresh plugin; no model-side budget-enforcement claim. Pi inherit/null clear tested in fixtures, not live Pi GUI reload |
| Five-second comprehension | Initial independent eight screenshot-first inferences; Kimi six-backend independent samples; both final verdicts | **Pass within reviewer inspection**, not timed or statistically random participant research |
| Truthful source/scope | Final special-route source labels; Pi inherited-state repair; ZCode shared-API distinction | **Pass in inspected routes**, not exhaustive source/runtime confirmation of every row |
| Honest timing | Timing chips and per-field boundaries; Pi `save_configuration` path documentation corrected | **Pass, sampled UI/source contract**. Saving does not claim current backend confirmation |
| Restore within three actions | `working-default-restored.json` (**0150**), `native-history-oc2.json` (**0158**) | **Pass for demonstrated targets**: common defaults two pointer actions; OC2 history three. Persistence/fresh-plugin hashes match; OC2 empty original overlay, emergency unused, blockers empty. Other native targets/nonempty credentials unproven |
| Physical risk separation | Final permissions/process/MCP/provider routes; independent verdicts | **Pass for inspected routes**; risk uses text/groups rather than color alone |
| Missing CLI/key next step | Six missing-CLI PNGs + `missing-cli-results.json`; `zcode-empty-key.json`, restoration JSON and PNG | **Pass in recorded scenarios**; inline key validation leaves nine providers/revision unchanged. Claude/Codex scrolled banners use DOM proof, not those PNGs alone |
| Test Vault deployment | `repaired/deployment.json`, later `final-deployment-check.json`; initial/restoration identity records | **0229 deployed/reloaded**, four artifacts + 127 assets hash-match, identity present, `ok:true` |
| Final screenshots | `repaired/` and successful `repaired/special/risk-scope-captures.json` | **18 normal + 23 special = 41 individual 0229 images**, plus three galleries; 390px rails 42/42, no clipped tabs or horizontal content overflow, restoration true ×3. Nine-Tab focus sample is not exhaustive |
| Scenario evidence | `scenarios/`: **10 PNG + 6 JSON**, exact list in `final-state-check.json` | Carried-forward 0150/0158 evidence, not new 0229 pixels. OC2 history PNG is context-only; native trace/metadata/hashes prove restoration |
| Custom-subagent review first | Preserved `custom-subagent-review.md` (**FIX**); `custom-subagent-verdict.md` (**SHIP**) | **F1/F2/F3 independently Resolved**, criterion 4 passed in demonstrated scope; bounded re-score did not reopen all 41 final images |
| Kimi Code K3.1 Pro afterward | `kimi-adversarial-review.md`, `kimi-run-record.json`; explicit native `kimi-code/k3.1-pro` / high | **PASS**, zero material UI findings; original low doc finding **Resolved**, open **0** after same-session doc recheck. Confirmed 18+23+10 images; CLI route identity is not server-weight provenance |
| Architecture ownership | Final verify owner manifest/boundaries, module-doc owner impact, dependency/cycle/approval gates | **PASS in recorded 15-gate run**; no new architectural claim or docs-closeout source edit |
| CodeGraph pre-edit checks | Baseline-index checks labeled in `api-refresh-implementation-results.md` | Task index uninitialized, no `init`; baseline checks are not a current task index |
| CodeGraph post-edit affected | Task-index limitation | **Unavailable, not pass**; no fabricated callers, blast radius or CodeGraph risk |
| `npm run verify` | `repaired/verify-summary.json` + its exact raw-log path | **Exit 0; 1041 suites / 11423 tests passed; 2 suites / 6 tests skipped; all 15 gates PASS**. Pre-repair 1040/11416 superseded; no docs-pass rerun |
| Module docs / owners | Coverage 816/816 + diff 28 targets; final module-doc/owner gates | **PASS** in final verify, no longer pending |
| Graph freshness | Source graph refresh/sync and final graphify freshness gate | **PASS**; distinct from unavailable CodeGraph task index |
| Source/deploy consistency | `runtime-source-digest.json`, `final-state-check.json`, `final-deployment-check.json` | 951 runtime files match 0229 with changed/missing empty; four deployed artifacts + 127 assets match. Read-only rechecks, not fresh test/GUI runs |
| Completion audit | `completion-audit.md` | Written with actual review chain, version/model limits and **OC2 2.2.6 proof PASS 10/10**; final evidence is available for user acceptance |

## Reference provenance

- shadcn Field: <https://ui.shadcn.com/docs/components/field>
- Mantine SegmentedControl: <https://mantine.dev/core/segmented-control/>
- Local design/wording references named by the user were read from `my-skills`; their application is documented in the existing design/review/copy records.
- `CONTEXT.md` and ADR 0001 require honest persistence/application/runtime evidence; ADR 0003 governs ZCode official login versus shared personal API scope.

## Evidence boundaries and environment

The initial sync fetched both remotes but hit a `v2.1.4` tag conflict; no tag was rewritten. The worktree
was tool-created, then fast-forwarded to local main baseline `7ba229538`. No release is published by
this documentation task. The parent owns final packaging and git reconciliation.

Initial defective round-2 screenshots and the initial **FIX** report remain historical evidence. The
0229 repaired captures establish the final visual state; earlier functional scenarios keep their original
build identities. The retained special-route timeout artifact is an interrupted earlier attempt, not a
failure of the later successful capture index. Kimi's first two stream-limit interruptions were review
transport events, not product failures; completion and doc recheck came from the same native session.

CodeGraph task `status` was `initialized:false` and sync refused; no init is authorized. Graphify passed
its separate freshness gate. Cross-platform behavior, all keyboard interactions, every native-history
target, nonempty credential-bearing restoration, all dynamic/runtime options and automatic Claude fallback
remain beyond the demonstrated scope. The separate OC2 2.2.6 native-runtime supplement is now **PASS
10/10**; it closes the version gap without extending those coverage limits or changing the reviewed UI.
