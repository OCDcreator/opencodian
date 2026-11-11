# Backend refresh — requirement-by-requirement completion audit

Recorded 2026-11-08 for task worktree
`/Users/dht/zcode-worktrees/opencodian/backend-settings-refresh`, branch
`zcode/backend-settings-refresh`, baseline `7ba229538`.

**The implementation, 0229 build/deployment and bounded UI review chain are recorded.** Independent
finish review is **SHIP**, F1/F2/F3 **Resolved**. The subsequent native Kimi review is **PASS**; its sole
low documentation finding is **Resolved** after the same-session recheck, with **0 open findings**.
**Final OpenCode 2 2.2.6 native-runtime proof passed 10/10**, with CLI and live server both reporting
2.2.6, exit 0 and active auxiliary-directory residue `[]`. The earlier 2.2.5 result is retained as history.
The evidence is ready for user acceptance; release publication and exhaustive runtime verification are not claimed.

This records the documentation closeout and the explicitly identified OC2 model-audit supplement; it
is not a fresh full-test or GUI run. The original initial **FIX** report,
Kimi's original low finding and the parent-owned safety note remain preserved. Detailed artifact paths
are in [evidence-index.md](evidence-index.md); individual file navigation is in
[DELIVERY.md](../../../.impeccable/review/round2/DELIVERY.md).

## User requirements mapped to actual evidence

Review-relative paths in this table start at `.impeccable/review/round2/`; research links are relative to
this directory. Each disposition describes only the demonstrated scope.

| Requirement | Actual result / evidence | Boundary or remaining item |
|---|---|---|
| Work in an isolated task checkout | Tool-created worktree/branch/baseline above; `repaired/final-state-check.json` records a clean original checkout | Final refreshed record has 131 reviewable changed paths, no tracked deletions/untracked-not-ignored paths and a clean diff check; ignored delivery artifacts are separate |
| Update all six selectable backends against upstream versions | [README version matrix](README.md), [upstream research](versions-and-upstream.md), [API implementation results](api-refresh-implementation-results.md) | Three package bumps landed; Pi/DSH/ZCode already matched the recorded available runtime. OpenCode 1 stays retired. **OC2 2.2.6 runtime proof PASS 10/10** |
| Verify API compatibility on real backends/models | Claude/Codex/Pi/DSH **8/8 each**, ZCode **12/12**; final OC2 **10/10 on observed 2.2.6**, exact JSONs in evidence index §1 | Selected-model aux/contract evidence, not all settings/models; an aggregate historical six-backend report is not all-green merely because its OC2 outcome passed |
| Produce full backend field inventories before navigation decisions | Six [Claude](backend-fields-claude-code.md), [Codex](backend-fields-codex.md), [Pi](backend-fields-pi.md), [ZCode](backend-fields-zcode.md), [DSH](backend-fields-dsh.md), [OpenCode 2](backend-fields-opencode2.md) tables; [coverage map](coverage-map.md), [gap audit](gap-audit.md) | Required name/behavior/default/range/timing/risk columns plus source/support are present; dynamic schemas/raw leaf universes are explicitly not exhaustive |
| Derive backend subtabs from field/task families | [Field-to-task map](field-to-task-map.md); final 0229 normal/special routes | Captured task groups support the mapping; source metadata and readback status do not equal every field's runtime proof |
| Apply impeccable, shadcn/Mantine, Anthropic and Claude direction | Existing context/design/craft records; evidence index §6b pattern/class/license mapping; both independent review verdicts | Obsidian imperative DOM borrows anatomy and native choice patterns. No React/shadcn/Mantine runtime integration; shared slider not instantiated |
| Humanize copy and explain consequences | [Copy review](copy-review.md) and before/after corpora; Pi consequence-first repair and bilingual DOM tests | Reviewer inspection is a bounded copy judgment; not user-comprehension research |
| Prefer choices and usable inherit/default states | Choice groups, preset numeric dropdowns/custom positive input, unknown-value preservation; Claude choice scenario; Pi repaired images/fixtures | Claude real GUI/persistence proof differs from model enforcement; Pi service/DOM fixtures differ from live GUI save/reload |
| Understand control consequences quickly | Independent initial eight screenshot-first inferences; Kimi six-backend samples and final six-criterion matrix | **Pass in sampled review**; no timed participant study or statistical random-sampling claim |
| See global/project/current-vault/shared sources | Source/status strips, final special routes, Pi inherit fix, ZCode shared API versus official account distinction | **Pass on inspected routes**; every native option was not independently activated |
| See honest application timing | Next-turn/new-session/reconnect/reload labels; Pi docs corrected to `save_configuration` → next process / optional reconnect | **Pass, sampled UI/source contract**. Persistence and backend confirmation remain separate |
| Recover a prior working state within three actions | Common defaults **two** native pointer actions on **0150**; OC2 native history **three** on **0158**, persistence/fresh-plugin checks | **Pass for demonstrated targets only**; OC2 original overlay empty, not a nonempty credential restore; other native targets unproven |
| Physically separate dangerous controls | Permissions, sandbox, credentials and advanced process settings in dedicated routes/disclosures; final special images | **Pass for inspected routes**; no cross-platform/OS-policy guarantee |
| Offer next steps for missing CLI/key | Six missing-CLI records/images and actual ZCode empty-key validation; restoration evidence | **Pass for recorded scenarios**. Claude/Codex banner text is in DOM despite scrolled images; no six-backend reinstall/authentication claim |
| Deploy and show the final Test Vault UI | **0229** loaded identity, `repaired/deployment.json`, later `final-deployment-check.json` | Four main artifacts + **127 assets** match, build ID present, `ok:true`; hash recheck is not new GUI observation |
| Supply light/dark/narrow and meaningful state screenshots | **18 normal + 23 special = 41 final individual 0229 PNGs**; **10 scenario PNGs + 6 JSONs**; three optional galleries | 390px rail heights 42/42, no vertical clipping/horizontal content overflow; sampled focus/restoration. Scenario proof retains older build IDs; middle bands of very tall special pages may not be captured |
| Run custom-subagent self-review before Kimi | Preserved `custom-subagent-review.md` **FIX** → `custom-subagent-verdict.md` **SHIP** | F1/F2/F3 independently Resolved. Bounded recheck lists exact reopened repair images and does not claim all 41 were re-opened |
| Run native Kimi Code K3.1 Pro adversarial review | `kimi-adversarial-review.md` **PASS**; explicit model/high and ordering in `kimi-run-record.json` | Same native session confirmed **18+23+10 images** and documentation fix; **0 material UI / 0 open findings**. Route identity does not independently prove server weights |
| Pass source/repository gates | `repaired/verify-summary.json`: **exit 0, 15 PASS gates, 1041 suites / 11423 tests passed**; 2 suites/6 tests skipped | Final repair run supersedes pre-repair 1040/11416. No test/build rerun for this docs pass |
| Keep docs/owner/graph fresh | Final owner manifest/boundaries/impact, module-doc and graphify gates PASS; earlier docs coverage 816/816 and 28 required targets | Graphify freshness passed; **CodeGraph task index unavailable**, not a pass, and no init performed |
| Audit final source/deployed consistency | `runtime-source-digest.json` + `final-state-check.json`: **951 runtime-file fingerprints match 0229**, changed/missing empty; `final-deployment-check.json` matches deployed files | Read-only source/git/hash checks, not new test/GUI proof. Parent updates final git/package artifacts separately |

## Version and model audit scope

| Backend | Final package/runtime target | Retained real-model evidence |
|---|---|---|
| Claude Code | SDK **0.3.319**, explicit local CLI **2.1.319** | `aux-audit-final-claude-319.json` **8/8** supersedes global CLI 2.1.312; owner invocation names `claude-haiku-4-5`. JSON contains no model/CLI path field, so those facts use owner/resolver provenance, not invented fields |
| Codex | SDK/CLI **0.167.0** | `aux-audit-final-cpi.json` Codex **8/8**; recorded selection `krill/gpt-6.1-sol`; CLI approval-policy probes are separate evidence |
| OpenCode 2 | Client/CLI/native server **2.2.6** | `aux-audit-final-opencode2-226.json` **10/10**, text `magpie/opencode-go-gw/deepseek-v4.1-flash`, image `magpie/kimi-code/k3.1-pro`, exit 0, active auxiliary-directory residue `[]`. Earlier server-2.2.5 report remains historical |
| Pi | Official CLI **1.5.0** | `aux-audit-final-cpi.json` Pi **8/8**, recorded selection `deepseek/deepseek-flash`; SDK anchor checks intact |
| ZCode | Desktop **3.17.2**, handshake-based native runtime | `aux-audit-final-zcode-verifier-fix.json` **12/12** after proof/verifier fixes; selection `kimi-for-coding/kimi-for-coding-highspeed`, reasoning enabled; this is not the Kimi review route |
| DSH | CLI **0.2.2-rc.1** | `aux-audit-dsh-real.json` **8/8** after launcher compatibility fix (macOS/POSIX host; Windows managed-profile writes fail closed — see the 2026-11-11 qualification below); native readback `deepseek-official/deepseek-flash`, reasoning off |

All audit JSONs above live in `.tmp/backend-refresh-api/`. Registry currency is the 2026-11-06/07
research snapshot. No blanket claim is made that every later upstream release, every model, all runtime
options, or every gateway behavior has been tested.

## Screenshot and restoration provenance

The final 0229 visual set is six backends × desktop dark/light/390px narrow (**18**), plus final successful
special routes/keyboard (**23**). Three galleries add convenience, not independent states. The successful
`repaired/special/risk-scope-captures.json` and before/after records govern the final set; the retained
one-capture timeout record belongs to an earlier interrupted attempt. Detector ran once on the initial
round: 0 primary, one accepted radius advisory. It was not rerun to claim a final-build detector pass.

The scenario directory has **16 files**, not sixteen scenarios: six missing-CLI PNGs, empty-key PNG,
working-default PNG, **`claude-fixed-budget-choice.png`**, and native-history PNG, plus six JSONs. Kimi
confirmed successful native image reads of all ten; first seven preceded the three successful post-draft
reads. Its documentation recheck did not reopen images or interact with Obsidian.

- **0150 common defaults**: open Working configuration → Restore working defaults; two real pointer
  actions, persisted value and fresh plugin readback match, original state restored.
- **0150 Claude choice**: Adaptive → Fixed/4096 exposes the budget options and persists across fresh
  plugin instance; original adaptive setting restored. No model-side budget enforcement is claimed.
- **0158 OC2 history**: open history → Restore selected entry → Confirm; three pointer actions. Setup
  used a product change handler and one actual Apply click, and is excluded from the restore count.
  Original overlay was empty, changed overlay 43 bytes; original/restored/persisted/reload hashes match,
  all four proof flags true, emergency restore unused, blockers empty. Backend/navigation restored.
- **OC2 image limit**: Electron clipping prevented a view of the scrolled history disclosure. The PNG is
  secret-free context; actual native-input trace, DOM metadata and hashes establish the restore. Empty-key
  validation/no-write likewise relies on JSON, not a claim that all shared-state effects are visible pixels.

These are accepted carried-forward functional scenarios at their recorded builds, not newly exercised
0229 functional flows. Normal/special 0229 images establish repaired final layout. Neither source hashes
nor later image review changes the older scenario build identities.

## Review and finding closure

| Stage | Actual disposition |
|---|---|
| Initial independent finish review | **FIX**, F1 narrow rails, F2 Pi inheritance/consequence copy, F3 DSH history-error containment; original report unchanged |
| Bounded same-reviewer re-score | **SHIP**, **F1/F2/F3 Resolved**, criterion 4 passes for common-default and OC2 native-history demonstrations; exact inspected images/fixtures/logs listed in `custom-subagent-verdict.md` |
| Native Kimi first completion | **PASS**, zero material UI findings, one low documentation finding; two preceding media-stream interruptions produced no verdict |
| Kimi same-session doc recheck | **Resolved**, current open **0**; confirmed DSH args/env/MCP coverage and Pi persisted/new-session timing corrections in three docs; original low finding preserved |

Kimi worker is `23cfe265-dbf3-4c5a-ae95-569302146af0`, explicit `kimi-code/k3.1-pro` / `high`, native
session `session_e2d6abc0-7eac-49ba-b7f8-5a955b13ac52`. Third run
`ed01a21d-92a7-470e-a66d-5e81606dc143` completed the review; follow-up
`8b93fb9c-c404-4a6a-8080-feb2484e683b` completed doc recheck. No transport interruption is counted as a
product issue or pass. Both reviewer verdicts are bounded acceptance, not release/merge authorization.

The three corrected research files are `backend-fields-dsh.md` (§A/E: args/env advanced editable surface,
reconnect/high risk, guided stdio/HTTP MCP with raw/history/save/idle apply), `backend-fields-pi.md`
(steering/follow-up editor uses `save_configuration`, next Pi process/optional reconnect, distinct from
native RPC hot mutation), and `coverage-map.md` (matching DSH controls). Product code stayed frozen.

## Final version supplement and explicit limits

**The parent closed the OC2 2.2.6 version evidence gap with a separate real-model run.** The original
OpenCode 2 audit entry and adapter/assertions were unchanged. The task-local runner paused direct Node
deletion calls, allowing five explicit `zcode-safe-delete` commands and acknowledgements; directory
realpaths and the final vault's emptiness were verified. The runtime returned server **2.2.6**, all
**10/10** checks passed and the process exited **0**. Stable report/proof copies are
`repaired/opencode2-226-audit.json` and `repaired/opencode2-226-runtime-proof.json`. The earlier 2.2.5
outcome remains historical. This supplement changed no product source, tests, build or GUI state.
Bundles, identity and cleanup ledger remain in the worktree; removed active paths are recoverable
quarantines. The script's assertions were not replaced by installation metadata.

Known bounds, rather than unrecorded passes:

- Other native history targets and nonempty credential-bearing restores are not GUI-certified.
- Pi inheritance clear/reopen evidence uses DOM/service fixtures, not a live Pi GUI save/reload session.
- DSH recovery-error containment uses owned filesystem fixtures; no live secret-store fault injection.
- Not every dynamic Pi field, runtime option, backend model, or Claude automatic fallback is exercised.
- Nine-Tab focus and sampled contrast do not establish every keyboard path or full accessibility compliance.
- Codex narrow image shows model loading; it proves that state layout only. Special captures may omit a
  middle band on content exceeding two viewport heights.
- Cross-platform behavior and Windows ACL equivalence were not validated by the macOS/POSIX evidence; a later CI Windows run has since demonstrated this concretely for DSH managed-profile writes (fail-closed, not parity — see the 2026-11-11 qualification below).
- CodeGraph task index is uninitialized; post-edit affected evidence is unavailable, not passed. Graphify
  is a distinct gate and did pass. No caller/blast-radius figures are fabricated.

The documentation owner edited only the authorized research/ledger files. The parent then added the
explicitly recorded OC2 audit supplement, safe cleanup and final packaging checks. Product source,
tests, package files, assets, styles and the original checkout stayed unchanged after 0229. No commit,
push, release, new product build/full-test run, detector run or GUI control accompanied this closeout.
Final git state and archive identity are recorded separately in the delivery artifacts.

## DSH managed-profile platform qualification (2026-11-11)

All findings, verdicts and bounds recorded above stand unchanged; this section only qualifies their
platform coverage after CI Windows exposed actual runtime evidence the macOS/POSIX passes did not cover.
`assets/dsh/control.mjs` `managedProfileProof` (owned() checks, lines 79-102) applies its POSIX-style
mode predicate unconditionally — `(stat.mode & 0o022) === 0`, with no win32 branch — while the uid check
participates only when `process.getuid` exists; Windows `stat.mode` is synthesized, and the currently
supported path — a launcher-created writable managed profile (default permissions, complete marker,
canonical, non-symlink fixture) — reports synthesized writable bits there, so that path's proof fails
closed; manually applied ACL/readonly combinations were not exhaustively verified, and no broader
guarantee is claimed. `assets/dsh/launcher.mjs`
(mode guard in `ownedPath`/`privateFile`, lines 23/41) explicitly exempts win32, producing a
launcher/control asymmetry; no Windows ACL replacement exists or is delivered as part of this work.
Consequences, all intentional fail-closed current behavior: `config/describe` reports
`profile.managed=false`; `profile.writable` is raw native-service metadata (`service.writable === true`,
control.mjs line 518), independent of the proof — it can still read true on Windows and is not permission
to mutate; effective admission stays closed with every form's `writable=false` and
`extensionSettings.mutate=false`; `control/capabilities` disables `extensions.managedProfile`
and every write action (enablePlugin/enableBundle/install/update/remove/cancel/exempt) plus
`extensionSettings.mutate`; the isolated persistent terminal registry binding refuses adoption when the
proof fails (the direct terminal provider is a separate resolution path and stays available); read-only
`config/describe` and extensions `list`/`inspect`/`versions` remain usable; `SettingsDshExtensionSettings`
hides edit controls unless positive capability, writable, managed-profile persistence source and a
revision are all present. DSH managed-profile, extension-write and isolated-terminal claims in this audit
and in [backend-fields-dsh.md](backend-fields-dsh.md) are therefore POSIX-scoped; no Windows parity is
claimed and no ACL-equivalent fix is invented. Tests are being aligned to assert the Windows negative
surface plus POSIX positive cases; production security is not being weakened to green CI.
