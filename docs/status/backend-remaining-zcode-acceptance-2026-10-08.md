# ZCode follow-up: session selection and FA880 — 2026-10-08

Version remains 1.1.37. BUILD_ID REMAINDER.20261008.zc7; main SHA256 13f1e1d87cbd0fbe485d1e920f0a685e1cfd70ed2f63901075fa5e15c1e4cb65, manifest 376121d93d3029900f37c0282a485dc89efa99d346436210d2a770edcb020bec, styles 71ff85c30a6cb148dc192a2879fbf28af62bdaa7f1cd409edec564e128cab99c. Mac/FA880 isolated Obsidian 1.14.4 loaded identical artifacts after sequential build/copy. Older Windows receipts identify the old host; none are renamed to FA880.

## Source repair and gates

The approved patch stores ZCode model and per-model reasoning overrides in conversation sessionSettings, through existing save/normalization owners; failed save restores only the originating conversation. Pi and ZCode use the same rule loop inside the existing normalizer to stay below complexity limits. No new runtime owner/file. CodeGraph depth 1: normalizer 4 direct function/method callers, 11 nodes; view host methods 0/1 each in current index, override getter 2/3, effort getter 2/3. Exact files and affected scope are retained. Earlier human reviewed continuation and blanket follow-up approval apply.

Focused red: two behavior failures; green: four suites / 32 tests. Initial full verify failed on two import order errors and one complexity warning; repaired. Retry failed only on an unchanged real Chrome render-test 60-second timeout. That exact test passed alone (2/2); final full verify zc7-full-verify-final.log/result.json passes all 15 gates, 982 suites / 10,166 tests, zero lint errors/warnings. Module/owner docs, graph freshness, typecheck and production build pass. Existing Jest worker force-exit diagnostic is retained in the full raw log, not hidden.

## Three-axis selection and lifecycle

| Host / session | Persisted choice | Native application and readback | Actual result |
| --- | --- | --- | --- |
| Mac A sess_8341271f-8cb5-4862-853d-4a7de081546e | opencode-go/gpt-5.6-luna Low | session/setModel low; session/read model.options.reasoningLevel low; mode build | Same native ID after full plugin reload, OC_ZC7_RELOAD_A|OC_ZC7_A_PEBBLE641 |
| Mac B sess_ba65846f-9925-4ef5-86d3-8234abfe451b | opencode-go/deepseek-flash High, separate stored choices | real setModel high and setMode edit, current native model/high/edit | Same native ID reload and OC_ZC7_RELOAD_B|OC_ZC7_B_COPPER782. Model reply added explanatory parenthesis in the earlier switch prompt; not an exact-output pass |
| FA880 A sess_7096bf3f-ab52-4e43-9c93-f31a84043a93 | opencode-go/deepseek-flash Low | native request/readback low/build | Same ID reload, first token recall, Low preserved |
| FA880 B sess_0a4a7ce4-f0ba-449a-b107-2ce0ed473d47 | opencode-go/gpt-5.6-luna High | native request/readback high/edit | Same ID reload, B token recall; private official Electron runner restart later recalls B again |

Evidence: {host}-zc7-a-final.json, b-final.json, reload-capture.json, a-after-reload-final.json, b-reload-final.json, two-session-locators.json, load-a.json, load-b.json. Model selections and native user/assistant model identities are recorded separately from claims about physical upstream serving. Model default is a deliberate inheritance choice: null persisted, send variant omitted, native actual max on both hosts; toolbar explicitly says Model default. Evidence {host}-zc7-default-final.json. This is distinct from the fixed defect where an explicit Low vanished after reload. Native reasoningTokens=0 is not evidence of an internal hidden budget.

## Environment and FA880 UI / native acceptance

Mac inherited long temp path from the prior owned OpenCode stage and exited before handshake. Restoring the existing owned /tmp/oc-zr-1007 temp root produced a real official handshake. FA880 installed official ZCode 3.14.4.7912 bundle SHA fad4c35c4c36ec210d8a06d3fa0e77de23c8545e2eb6ff90aea1eb38d1e6275f, CLI 0.16.9. Original installed Electron runner spawn from Obsidian returned EACCES; ACL is permissive and existing user processes are untouched. The exact same runner SHA 2cd9f0672841f9a09d00aced4223114c3c7c37cfa8a308e7e79641d617497b0f at an owned path launched; missing ICU data initially failed, then copying exact installed ICU/DLL/bin/pak dependencies gave --version 0.16.9 and real app-server handshake. No assertion about the unidentified OS cause of original-path EACCES.

Supported exact-hash Node profile completed A/B model/effort/new/reload/follow-up UI above. Owned same-version official Electron profile restored B, generated OC_ZC7_OFFICIAL_B|OC_ZC7_B_COPPER782 and retained DB/native identity. Evidence fa880-zc7-node-copy-start.json, runner-probe.json, runner-acl.json, official-runner-copy.json, official-owned-start.json, official-final2.json. Private storage/session DB aliases and provider config copy/source SHA were verified. No credential reset or user ZCode service takeover.

FA880 required real-model aux audit 12/12: strict 27-byte OC_ZCODE_AUX_WRITE_CONTROL LF positive and real hook execution, induced tool/write refusal, current/follow-up/image native tools {}, native tool events/count zero, unchanged bytes, scope/process cleanup. Uses current source bundle, actual owned official CLI and explicit opencode-go/deepseek-flash Disabled. fa880-zc7-required-aux-audit.json, required-aux-audit-job.json.

FA880 real editor UI: native gpt-5.6-luna aux generates dog; Accept exactly one controller replaceRange. Reject a second generated preview keeps that count. Third preview plus manual in-range fox change rejects dirty accept, strict final LF bytes match, all three aux scopes gone and disposed. fa880-zc7-inline-preview.json, inline-accepted.json, inline-rejected.json, inline-dirty-rejected.json, inline-final-proof.json. No real note edited.

FA880 sessionless completion actual Alt -> mat. ghost -> Tab one input.complete transaction -> one Undo; second Alt -> longer valid continuation ghost -> Escape no write. Two workspace/generateText calls have tools [], Disabled model options, distinct operation IDs; no new session/native main history change. Runtime optional toolCalls omitted: no authoritative session tool readback exists for this sessionless interface, so absence is not promoted to effective-tool proof. fa880-zc7-completion-final.json plus completion-{ghost,after-tab,after-undo,after-escape}.json. Cleanup reload disposes warm pool (0), restores observers and keeps native history on both hosts.

## Scope accounting

Original 57 case IDs / four ZCode profiles / two platforms remain the start list. These results add clauses; no complete original profile/platform is inferred. Earlier zc4/zc5/zc6 official/Node/patched/TaskIndex results retain their build/host identities. Broader config-layer/revision/redaction/auth/queue-drain/background/version/multitab clauses still need exact original-clause conclusions in the final ledger. Missing hooks/list and mcp/setEnabled supported config/session alternatives retain earlier native execution proof; current host rechecks remain separate from ACK. Successful live OAuth was explicitly excluded by later user instruction; no authentication success is claimed.

Evidence root: /Users/dht/.codex/artifacts/opencodian/remaining-acceptance-2026-10-06. {host}=mac or fa880. Failed parameter/control/automation attempts remain raw: off-viewport model items, non-handling option focus/Enter, unsupported session/list workspacePath, wrong getter and startup-timing input reset. Successful calls/readbacks are listed separately.
