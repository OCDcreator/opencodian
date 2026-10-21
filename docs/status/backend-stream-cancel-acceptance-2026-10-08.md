# Cancelled predecessor stream and native queue follow-up — 2026-10-08

Version remains1.1.37; independent branch codex/opencodian-remaining-acceptance-1006. No push, merge or release. Evidence root /Users/dht/.codex/artifacts/opencodian/remaining-acceptance-2026-10-06.

## Shared stream repair

On both actual desktops, hold the real adapter's already-produced message_stop, cancel through the UI, start another real send on the same session, then release the predecessor's final. The native replacement run remained current, but the old shared UI callback set streaming=false, cleared the replacement shell and could prevent its reply from being persisted. Mac and FA880 reproduce on BUILD codex-opencodian-remaining-acceptance-1006.202610081913: {host}-zc10-terminal-old-release.json has sameNewRun=true and uiStreaming=false; terminal-final-read still has native status running. The premature subsequent harness repeat-cancel interrupted that new turn; its changed history is retained as a failed control, not a stable post-terminal test.

The existing send runtime now assigns a per-send Symbol token. Chunk routing, delayed pending/idle timers, finalization, edit-capture end and queued follow-up consumption check this ownership. Completed/cancelled controllers are replaced for the next send; a live controller remains. Each old finalizer retains its own DOM references/controller and persists that reply without clearing or stopping the replacement. No new runtime owner/file; OpenCodianView changes only its existing controller selection condition.

Red behavioral regression reproduces old final setting the replacement's isStreaming false. Green regression also checks late text is ignored, both old and new replies are saved with separate native IDs, old shell dataset is isolated and old finalization does not consume a new queue item. Controller behavior regression checks cancelled replacement/live retention. Focused sending/queued-follow-up/agent/transport/structured-output suites29 tests pass; five controller/router/finalizer suites20 tests pass, overlapping rather than summed.

## Actual cancellation matrix

Both hosts on REMAINDER.20261008.zc10 with official CLI0.16.9 use actual mouse/keyboard sends and native readback. The timing observer delays only actual existing subscribe/final delivery; it does not substitute RPC replies or model responses.

| Boundary | Actual result | Evidence suffix, each mac/fa880 |
|---|---|---|
| Before native generation | Hold actual session/subscribe, Stop, release; native history stays at one prior user and no forbidden prompt; same-ID recovery succeeds | zc10-fixed-before-start-{held-read,final-read,recoverread}.json |
| During foreground Bash | Actual sleep90 tool call runs; Stop returns native cancelled error; no completion token; same-ID next short reply succeeds | zc10-fixed-tool-{running-native,cancel-final-read,cancel-recoverread}.json |
| Native terminal before UI final | Hold message_stop, cancel, start next real send/hold subscribe, release old final: same replacement run and UI streaming stay true; release next produces exact reply, both native message IDs persisted | zc10-fixed-terminal-{held-native,old-release,final-read}.json |
| After terminal | UI/native idle and no active runs; repeated cancel twice leaves native history SHA unchanged | zc10-fixed-after-terminal-repeat-cancel.json |
| Unanswered AskUserQuestion | Real request ID/card present; Stop clears native pending list, UI pending list and answerable card; same-ID next request succeeds | zc10-fixed-ask-{native,after-cancel,recoverread}.json |
| Reload | Observer restored; full plugin disable/enable retains same native ID and exact native-history SHA; loaded build confirmed | zc10-observer-restored-final.json |

Mac native sess_d7731d5c-6059-4337-97f6-7a0348342c03; FA880 sess_33e07809-8fdc-4bf5-93c1-e931cb9507b3. zc10-cancel-summary.json retains clause assertions. Older no-race successful native cancellation controls keep their earlier build; the old UI failure is not renamed fixed.

## Supported native queue alternative

Current OpenCodian does not advertise ZCode active steering/queue. The native official0.16.9 v4 command surface does support it, so missing legacy session/queue is not evidence that the backend lacks queuing. Earlier held/deleted queue controls did not demonstrate actual execution. On the preceding1913 build, each host now has an independent private HOME/workspace/storage adapter with two real AskUserQuestion holds. A queues three inputs, reorders TWO before ONE, edits ONE to EDITED, deletes the third, and rejects a stale revision. Auto-drain then executes actual turns TWO followed by EDITED, each with exact native assistant response and canonical input/turn IDs. The deleted text never becomes a native user message. B's held queue/native-history SHA is unchanged by A's controls, and its item is separately deleted without generation; repeat deletion is native queue.itemMissing/noop. Actual processes49500/12700 exit; the immediate Mac pidGone=false is followed by authoritative observedPidGone=true.

Mac queue IDs belong to sess_9a055e02-1e14-4e83-af87-22c401c08087 and sess_6b221136-d613-4971-9832-ed5ecd4debb5; FA880 sess_7a4c997b-06dd-4338-9305-8ab519b2f7ff and sess_1205e46e-9e39-4103-bb1d-e490e72a1d4d. zc10-native-queue-summary.json, {host}-zc10-native-queue-v2-read.json and queue-cleanup.json. Initial idle requestedDelivery=queue is legitimately admitted startNow by this runtime; the first failed test lacked a held B queue and is retained. The v2 correction holds both actual sessions. This establishes a native supported alternative, not new product UI integration or active-guide semantics.

## Gates and scope

BUILD_ID REMAINDER.20261008.zc10; main SHA2560cf302b75bc76ee570cd8618cac6144b239172c5e1c9a422f8105d848d2b04d5; manifest376121d93d3029900f37c0282a485dc89efa99d346436210d2a770edcb020bec; styles8ae1d8b896fe1db244c5d19ea28aad4c785084471cbae58f590b360df955cd0d. Build/copy/load and hashes are ordered on both isolated vaults, then copied again after full verify rebuilt the exact same identity/hash. deployment-zc10.json,fa880-deploy-zc10.json,{host}-zc10-loaded.json. Standard Test Vault untouched.

zc10-full-verify.log/result.json:15 PASS,982 suites/10169 tests,lint0 errors/0 warnings,owner/module docs,graph freshness,typecheck,production build pass. Initial complexity21 warning/import sorting/test outer-block max-lines were repaired without suppressions. CodeGraph sync without init and affected scope stored. zc10-race-cg-before.json contains per-definition callers and finite depth1 blast sizes: sendMessage6/13,createStreamingExecution1/2,router consume1/3,renderable1/2,injectFallback1/2,dispatchDone1/2,error-render1/2,timeout2/3,reset3/5,local constructor0/1,finalize1/3,outcome1/2,retry1/2,shell0/1,post-shell1/2,persist1/2,view controller3/5. Separate pending schedule2/3,startStreamingUi1/2,queued follow-up1/2 captures. No risk rating invented. Existing reviewed-continuation approval applies to the cross-owner graph; responsibilities stay in chat runtime and the existing view forwarding method.

All32 preservation-zc10.json checks unchanged: original checkout, earlier multi-backend worktree/ledgers/auth pins and original Test Vault. No real notes or user sessions modified/deleted. Temporary native queue roots are retained as evidence; owned processes stopped. Timing wrappers restored before reload.

This closes named cancellation/race/queue execution clauses, not any full original case/profile/platform. Further common runtime backend regressions remain separate. A distinct tool-card issue was observed: cancelling a live tool can omit its unfinalized call from local persisted content blocks while native records the cancelled error. That remaining I04 display/persistence defect is retained for the next minimal repair; successful native cancellation does not establish that UI tool-history condition.
