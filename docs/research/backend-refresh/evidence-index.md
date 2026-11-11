# Evidence index — backend version and settings refresh (2026-11-08)

This reconciliation maps the acceptance contract to retained artifacts. Worktree root is
`/Users/dht/zcode-worktrees/opencodian/backend-settings-refresh`; paths below are relative to it unless
stated otherwise. Final UI build is **OpenCodian 2.1.5,
`zcode-backend-settings-refresh.202611080229`**. Source/tests are frozen; this closeout edits only the
allowed documentation. The parent-owned `implementation-safety-note.md` remains unchanged.

Independent finish review is **SHIP**, with F1/F2/F3 **Resolved**. The subsequent native Kimi review is
**PASS**, with zero material UI issues; its sole low documentation finding is **Resolved** after
same-reviewer confirmation, with **0 open findings**. **Final OC2 2.2.6 native-runtime proof passed
10/10**, with CLI/server versions both observed as 2.2.6. The earlier server-2.2.5 report remains historical.
This records the delivered evidence, without publication or exhaustive-runtime authorization.
See [completion-audit.md](completion-audit.md) and the
[delivery navigation](../../../.impeccable/review/round2/DELIVERY.md).

## 1. Version and real-model audits

Package pins landed: Claude SDK **0.3.312 → 0.3.319**, Codex SDK **0.165.0 → 0.167.0**, OpenCode client
**2.2.0 → 2.2.6**. Pi CLI **1.5.0**, DSH CLI **0.2.2-rc.1**, and ZCode desktop **3.17.2** required no
package bump at the 2026-11-06/07 research snapshot. OpenCode 1 remains retired with SDK **1.19.5**.
`versions-and-upstream.md` preserves registry/release research; `api-refresh-implementation-results.md`
records landed compatibility fixes and historical runs. Registry research was not repeated. The parent
subsequently ran one bounded OC2 2.2.6 model-audit supplement to close the final-version evidence gap.

All report filenames in the next table are under `.tmp/backend-refresh-api/`.

| Backend | Accepted result and version boundary | Exact report / evidence |
|---|---|---|
| opencode2 | **PASS 10/10 on observed CLI/server 2.2.6**, original exit 0; real text/image turns, exact write control, native deny readback, follow-up, disposal and empty active-directory residue. | `aux-audit-final-opencode2-226.json`; stable copy `repaired/opencode2-226-audit.json` and identity/safe-cleanup proof `repaired/opencode2-226-runtime-proof.json`. Earlier `aux-audit-six-real.json` OC2 outcome observes server 2.2.5; its aggregate top-level failure is not represented as all-green. |
| dsh | **PASS 8/8**, after the `PROFILE_TEMPLATES` relocation fix for CLI 0.2.2-rc.1. Native tool-free/readback, write denial, image, cancellation and residue checks are bounded to this audit. | `aux-audit-dsh-real.json` |
| codex | **PASS 8/8**, zero blocked, CLI/SDK 0.167.0. SDK wrapper bytes unchanged from 0.165.0; CLI acceptance probes independently show `untrusted` rejected. | `aux-audit-final-cpi.json` (Codex outcome), `codex-appserver-catalog.json`; `docs/research/backend-refresh/codex-approval-policy-cli-evidence.md` |
| pi | **PASS 8/8**, zero blocked on official CLI 1.5.0; SDK anchor probes intact. This does not enumerate or exercise every dynamic settings field. | `aux-audit-final-cpi.json` (Pi outcome), `pi-15-schema-anchors.json` |
| claude-code | **PASS 8/8 on explicit local CLI 2.1.319**, selected through `AUDIT_CLAUDE_BIN`, SDK 0.3.319. This complete run supersedes the global-CLI 2.1.312 run; it does not claim the global CLI was upgraded. | `aux-audit-final-claude-319.json` (`passed:true`, `execution:real-model`, captured 2026-11-07T16:18:05Z). Historical `aux-audit-final-cpi.json` Claude outcome and `claude-sdk-319-cli-{312,319}-turn.json` remain provenance. |
| zcode | **PASS 12/12** after the plugin proof-attribution and audit-verifier fixes. Positive control observes `Write`, 27/27 bytes, hook execution/trust accepted; current/follow-up/image auxiliary turns prove empty tools; final residue `[]`. | `aux-audit-final-zcode-verifier-fix.json` (captured 2026-11-07T17:08:00Z). `aux-audit-final-zcode-after-fix.json` is a superseded 8/12 partial. |

Model coverage is a selected-model audit, not certification of every catalog model:

- Final OC2 text model is `magpie/opencode-go-gw/deepseek-v4.1-flash`; its explicit image model is
  `magpie/kimi-code/k3.1-pro`. Executable SHA-256 is
  `90e4d03597b03d2051b65b4d793467764e55bacd8e22bf4824479c7233ea0e15`.
  The unchanged audit/adapter assertions ran inside a task-local wrapper that paused all direct Node
  deletion calls for five explicit `zcode-safe-delete` commands; each directory had realpath verification,
  and the final audit vault was confirmed empty to preserve original rmdir semantics. The bundle/ledger
  remain in the worktree; removed active paths are recoverable quarantines. No verifier gate was replaced.
- DSH native readback records provider `deepseek-official`, model `deepseek-flash`
  (display name DeepSeek-V4.1-Flash), reasoning `off`.
- The API-owner invocation record names Codex `krill/gpt-6.1-sol`, Pi `deepseek/deepseek-flash`,
  and Claude `claude-haiku-4-5`. The final Claude 8/8 JSON does not embed a model ID or CLI path;
  version/resolver provenance comes from the API-owner record, not an invented JSON field.
- ZCode audit selection is `kimi-for-coding/kimi-for-coding-highspeed`, reasoning `enabled`.
  This is separate from the later Kimi Code reviewer route `kimi-code/k3.1-pro`.
- Auxiliary safety/contract results, image checks and sampled real turns do not establish automatic
  fallback, every setting's runtime effect, every provider, or undisclosed server model weights.

The runtime-owned ZCode trust grant is documented in the API-owner audit narrative: one scratch-owned
positive-control grant per run, no hand-editing or broad trust; auxiliary hooks remain false/zero-exec.
Historical pending verifier/full-verify language in the API narrative is superseded by the final reports
above and the 0229 verify summary below, without rewriting that owner's report.

## 2. Final build, deployment and source identity

All paths in this and the next two sections are under `.impeccable/review/round2/` unless stated otherwise.

| Item | Actual evidence and scope |
|---|---|
| Build and loaded UI | `repaired/verify-summary.json` names **0229**. The independent verdict checks all three `repaired/initial-state-*.json` and special-route identity as running **0229**, with restoration true in all three viewport modes and the special-route run. |
| Sequential deployment result | `repaired/deployment.json`: `main.js`, `manifest.json`, `styles.css`, `pdf-engine.js` hashes match; **127 assets**, no mismatch, build identity present, `ok:true`. |
| Later artifact recheck | `repaired/final-deployment-check.json`: the same four main artifacts and 127 assets still match current dist and Test Vault, build identity present, `ok:true`. This is a hash check, not another GUI run. |
| Runtime source fingerprint | `repaired/runtime-source-digest.json`: digest `7e189a6c7597e65b5c56b7ed9ffb376e17e149bf256caf542c472c4de8bc990d`. `repaired/final-state-check.json` checks **951 files**, `productionSourceMatchesRecordedBuild:true`, changed/missing lists empty. This does not rerun tests or certify a new UI observation. |
| Final Git check, parent-owned | `final-state-check.json` was refreshed after documentation closeout: original checkout clean, task changed paths **131**, no tracked deletions/untracked-not-ignored paths, diff check against HEAD passed. Ignored screenshot/archive artifacts are separate from that reviewable-path count. |
| Historical builds | Initial round-2 screenshots identify **0150**; the earlier focus/header records include **0156/0158**. Scenario identities remain as recorded below. Initial 0002/0150 and repair-round-1 103px-pane material do not replace final 0229 UI evidence. |

## 3. Captures and carried-forward scenarios

**Final individual UI images: 18 normal + 23 special = 41 PNGs on 0229.** The three normal galleries are
convenience composites, making 21 top-level repaired PNGs / 44 including special; they are not three
additional independently tested states. The scenario directory separately contains **10 PNGs + 6 JSONs
= 16 files**, as enumerated in `repaired/final-state-check.json`. Do not call that 16 scenarios.

| Set | Evidence and interpretation |
|---|---|
| Normal — `repaired/` | Six backends × desktop-dark / light-light / narrow-dark (390px). `measurements-narrow.json`: both rails `clientHeight = scrollHeight = 42`, `minHeight:42px`, `flexShrink:0`; all six have zero vertically clipped tabs and no horizontal content overflow. `restoration-{desktop,light,narrow}.json`: true. |
| Special — `repaired/special/` | Final `risk-scope-captures.json` is the successful index for **23 PNGs**, covering 12 routes plus keyboard focus. `risk-scope-before.json` / `risk-scope-after.json` provide identity/restoration. Top/bottom segments do not guarantee a middle segment of a page taller than two viewports. DSH MCP is the empty, nonsecret safe state; raw content stays closed. Capture metadata is data-only, not an automatic review verdict. |
| Keyboard sample | `repaired/special/keyboard-focus-probe.json`: nine native Tab presses reach visible focus on Working configuration, 2px outline / 3px offset, no injected focus or value mutation; restoration true. This does not cover all controls or activation paths. |
| Superseded attempts | Original `round2/*.png` / `round2/special/*.png` belong to the preserved initial **FIX** review. `repaired/special/risk-scope-error.json` is an earlier interrupted one-capture attempt (`Input.dispatchMouseEvent` timeout), retained as provenance, not the final successful run's result. The successful final capture index is authoritative. |
| Mechanical detector | `detector.json` ran once on initial round-2: **0 primary / 1 advisory**, 5px radius accepted by the reviewer. It was not rerun after repairs; final visual acceptance comes from the independent reviews, not a claimed 0229 detector pass. |

The scenario proof ledger is deliberately separate from 0229 final pixels:

| Scenario | Build / exact artifacts in `scenarios/` | Proven result and limit |
|---|---|---|
| Missing CLI ×6 | Initial round-2 carry-forward; `missing-cli-results.json` + six `<backend>-missing-cli.png` | Six real persisted negative paths, actionable automatic-discovery recovery in DOM, restoration true. Claude/Codex scrolled images do not themselves show the shared banner; their DOM records do. This is guidance/restoration evidence, not six successful reinstalls. |
| ZCode empty key | Initial round-2 carry-forward; `zcode-empty-key.json`, `zcode-empty-key-restoration.json`, `zcode-empty-key.png` | Inline key error, nine providers unchanged, revision unchanged; original state restored. Validation-without-write proof, not a new authentication test. |
| Common working defaults | **0150**; `working-default-restored.json` + `.png` | **Two native pointer actions**: open Working configuration → Restore working defaults. Marked value restored/persisted and read by a fresh plugin instance; restoration true. Scope is common defaults, not secret-bearing native history. |
| Claude fixed budget choice | **0150**; `claude-choice-proof.json`, **`claude-fixed-budget-choice.png`** | Adaptive → Fixed/4096 shows the budget choice, persists and survives a fresh plugin instance; original adaptive value restored. No new model turn or reasoning-budget enforcement proof. |
| OC2 native history | **0158**; `native-history-oc2.json` + `.png` | `outcome:proof-passed`, equal/persisted/freshPlugin/restored true, emergency restore false, blockers empty. **Three native pointer actions**: open history → Restore selected entry → Confirm. Setup and later screenshot/navigation actions are excluded. Empty original overlay → 43-byte changed overlay → matching original/restored/persisted/reload hashes. |

The OC2 PNG is a secret-free context image and does not display the scrolled history disclosure because
of the documented Electron capture limitation. The native-input trace, DOM metadata and hashes carry
the restoration proof. It certifies this one target/empty original overlay, not every backend history
or a nonempty credential-bearing restore. Earlier interrupted attempts remain historical evidence.

## 4. Source and repository gates

| Gate | Final recorded state |
|---|---|
| Full `npm run verify` | `repaired/verify-summary.json`: **exit 0**, **1041 suites passed / 1043 total (2 skipped)**, **11423 tests passed / 11429 total (6 skipped)**, **15 gates PASS**. Raw output: `/var/folders/kr/gbgh00qn3m70ff_fjsh7d55h0000gn/T/zcode-bash-WXnmEl/sess_249052a9-f04a-4d1d-ba92-a809cfafffcb/call_e5259416aef34c598f1a429a7e9adc98__rk16__FzbChogrGvFNJCZp-stdout.log`. Supersedes pre-repair 1040/11416. |
| Gate coverage | Change scope; owner manifest; owner boundaries; dependency direction; architecture cycles; architecture approvals; module docs; module-doc owner impact; graphify freshness; devlog order; lint; typecheck; full tests; production build; generated styles clean. Owner/graph gates are passed, not pending. |
| Repair-focused checks | Independent verdict inspected **6 suites / 124 tests** including Pi native-card DOM, enum roundtrip and DSH recovery/section tests. Earlier focused 33/33 and real-filesystem store 29/29 remain supporting evidence. Fixtures are not mislabeled live GUI interaction. |
| Module docs / graphify | Prior coverage **816/816**, required-target diff **28/28**, followed by final module-doc/owner/graphify gates PASS. The source graph was refreshed/synced. No additional graph/test/build run is claimed for this docs-only pass. |
| CodeGraph | Task index **not initialized**; no `init` allowed/performed. Task-local post-edit `affected` evidence is unavailable and **not a pass**. Baseline pre-edit caller/impact results are labeled in `api-refresh-implementation-results.md`; no caller counts or risk categories are invented. |

## 5. Independent review sequence and dispositions

| Review / finding | Current state and evidence |
|---|---|
| Initial custom-subagent | `custom-subagent-review.md`: **FIX**, unchanged. It inspected the full initial normal set and named initial special/scenario images; its historical failures are preserved. |
| F1 narrow rails | **Resolved by independent re-score** in `custom-subagent-verdict.md`; six repaired narrow images + 42px geometry and desktop/light comparisons. |
| F2 Pi inheritance/copy | **Resolved by independent re-score**; enabled inherit option, null-clearing, preservation of unknown nonempty values, consequence-first copy; repaired images + DOM and native service fixtures. No live Pi GUI save/reload claim. |
| F3 DSH history containment | **Resolved by independent re-score**; unavailable-history feedback preserves the full MCP page, owned regular-file/symlink fixtures, normal deployed captures. No live credential-store fault injection. |
| Final custom-subagent | `custom-subagent-verdict.md`: **SHIP** within the bounded gate; criterion 4 passes for common-default and OC2 native-history demonstrations. Exact re-opened repair images are listed there; it does not claim to re-open all final 41 images. |
| Kimi Code afterward | `kimi-adversarial-review.md`: **PASS**, **0 material UI issues**, original low documentation finding **Resolved**, **0 open findings**. `kimi-run-record.json`: worker `23cfe265-dbf3-4c5a-ae95-569302146af0`, explicit `kimi-code/k3.1-pro` / `high`, native session `session_e2d6abc0-7eac-49ba-b7f8-5a955b13ac52`. Two media-stream run-limit interruptions produced no verdict; third run `ed01a21d-92a7-470e-a66d-5e81606dc143` completed, then same-session bounded doc recheck `8b93fb9c-c404-4a6a-8080-feb2484e683b` completed. Interruptions are neither product findings nor passes. |
| Low documentation finding | **Resolved by the same reviewer**, `kimi-adversarial-review.md` §文档修正复核. `backend-fields-dsh.md` §A/E and `coverage-map.md` now describe advanced args/env and guided MCP; `backend-fields-pi.md` separates the `save_configuration` / new-session settings path from native RPC hot-mutation capabilities. Original finding remains preserved; no source repair was needed. |
| Reviewer scope | Same-reviewer clarification confirms **18 normal + 23 special + 10 scenario images** successfully viewed: six missing-CLI, working default, empty key, Claude fixed budget and OC2 native history. The last three were successfully read after the interrupted draft. Doc recheck read no new images. OC2 history PNG remains context-only; empty-key validation/history hashes come from JSON, not pixels. CLI route identity is not independent proof of server weights. |

## 6. Remaining boundaries and handoff

The product repair findings and Kimi's documentation finding are closed; both independent UI verdicts
and the same-reviewer image-scope clarification are recorded. **The final OC2 version evidence gap is
closed** by the separate 10/10 real-model run with CLI/server 2.2.6, exit 0 and active auxiliary-directory
residue `[]`. The earlier 2.2.5 outcome stays historical. No additional product source, build or GUI change
was needed for this supplement. The coverage limits below remain explicit.

Parent owns final git status, delivery navigation and packaging; no archive, commit, push or release is
asserted here. `implementation-safety-note.md` is preserved verbatim.

Untested or bounded areas remain: all native-history targets and nonempty secret-bearing restores;
live Pi GUI enum/boolean clear-save-reload; live DSH secret-store fault injection; every dynamic Pi key;
all runtime options/models and Claude automatic fallback; all keyboard paths; cross-platform behavior
and Windows ACLs. Codex narrow capture's model-loading state proves that layout only. Source chips,
metadata and successful persistence are not substituted for backend runtime confirmation.

## 6b. Style provenance mapping

Pattern/anatomy borrowing only — **no React, shadcn or Mantine runtime dependency**; implementation uses
imperative Obsidian DOM, native inputs, Obsidian `Setting` and `src/style/` CSS. Reference attribution is
retained from the earlier verified mapping.

| Reference pattern | Actual source / classes | Attribution |
|---|---|---|
| shadcn Field | Obsidian Setting name/desc/controlEl via `describeBackendSetting`, `BackendSettingsControls.ts` | shadcn/ui, MIT — <https://github.com/shadcn-ui/ui>; <https://ui.shadcn.com/docs/components/field> |
| shadcn FieldSet | Backend task groups, `data-codex-group`, `.opencodian-settings-codex-group` | shadcn/ui, MIT |
| shadcn Tabs | `SettingsTabbedRenderer` / `settings.backend.tabs.*` | shadcn/ui, MIT |
| shadcn Card | Recovery and MCP disclosures, `.opencodian-backend-recovery` | shadcn/ui, MIT |
| shadcn Alert | `.opencodian-backend-choice-error` (`role=status`, `aria-live=polite`), warnings and proof chips | shadcn/ui, MIT |
| Mantine SegmentedControl / Radio.Card | `addBackendChoiceSetting`, native `.opencodian-backend-choice-group`, recommended option, unknown-value preservation and busy/error rollback across six backend sections | Mantine, MIT — <https://github.com/mantinedev/mantine>; <https://mantine.dev/core/segmented-control/> |
| Mantine Slider reference | **Not instantiated on this surface**. Shared slider helper has no caller here; Claude limits use preset dropdowns with explicit custom positive input. Existing general-settings sliders are outside this refresh claim. | Reference only; no visible-slider claim |
| Shared behavior contract | `.tmp/backend-refresh-ui/shared-control-contract.json` | Class names and rollback/error semantics |

## 7. Ownership

This closeout owns README, acceptance-plan, evidence-index, completion-audit, the repair ledger, and the
three bounded field/coverage corrections requested after Kimi's finding. It does not edit either review
report, DELIVERY, run records, the safety note, source, tests, package files, assets, styles or the original
checkout. Runtime/GUI/audit/git/package work remains with the parent and its original owners.
