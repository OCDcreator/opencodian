# Default backend switching preserves existing conversation runs — 2026-10-08

Version remains 1.1.37. Source changes remain in the isolated codex/opencodian-remaining-acceptance-1006 branch; no push, merge or release.

Both settings entrypoints previously called stop on the former default adapter. Mac and FA880 actual UI switching from ZCode to Pi disconnected the two other running ZCode tabs. The registry was not responsible: it only changed the active selection. Initial failures are retained in {host}-zc9-switched-native.json and switch-failure-read-corrected.json under the evidence root.

The header selector and default-backend dropdown now start the selected adapter while retaining other enabled adapters. Explicitly disabling a backend stops it even when it is no longer the default. Plugin unload still disposes the registry. Previously started enabled runtimes therefore remain allocated until disable/unload; one default change no longer ends another tab's request.

BUILD_ID codex-opencodian-remaining-acceptance-1006.202610081913; main SHA256 848605def1819a937a6571d1f72bd9877ebc9a2a46de41aba394be797e8bcf63; manifest 376121d93d3029900f37c0282a485dc89efa99d346436210d2a770edcb020bec; styles 8ae1d8b896fe1db244c5d19ea28aad4c785084471cbae58f590b360df955cd0d. Ordered build/copy/load and identical hash verification on both private vaults: deployment-202610081913.json, fa880-deploy-202610081913.json, {host}-zc9-load-fixed.json. Full verify rebuilt the same identity and exact hash; sequential copies were repeated after that build. Standard Test Vault is unchanged per the user's isolation requirement.

## Real two-host evidence

Both hosts use official CLI0.16.9; Mac installed official Electron runner and FA880 the owned exact-hash official Electron runner, as identified in the ZC7 record. Three fresh native IDs and real keyboard/mouse sends overlap. B alone is cancelled; A/C continue after a real settings selection of Pi and return their exact separate tokens after foreground Bash sleep180. Each session has one original user message and one final; no adapter stop on default change. B later returns its exact recovery token under the same native ID; A/C native-history SHA values stay unchanged. Actual stopped-tab close and busy-tab close refusal were observed on the previous layout3 source; those chat lifecycle owners did not change.

Mac IDs: sess_0b60f7ca-b70a-49f6-a019-23b3fe4c68df, sess_063be2df-f439-407a-b57e-4c6a4943c331, sess_fc36ed0b-9c6c-4b1a-8c36-8cba59a1a0a8.
FA880 IDs: sess_fa2876cc-26cc-4054-b912-7b1226f166d2, sess_077a7622-6668-4692-80f5-178e2ec5e70c, sess_c46557e9-8687-4ce8-b877-84155b8881b5.

Actual keyboard disabling non-default ZCode stops owned PID40821/23692 (Mac/FA); registry disabled and native transport absent. Re-enabling while Pi remains selected does not start ZCode. Selecting ZCode starts a new owned process and reads all three original IDs/histories. Plugin unload while Pi is selected releases subsequently started ZCode PID44089/27472; asynchronous cleanup is awaited. A temporary connected status in the immediate old object is retained, and exit is verified separately. After reload the same build loads and histories are verified against pre-unload hashes.

Receipts: zc9-native-summary.json, {host}-zc9-fixed-three-native.json, fixed-switch-native.json, fixed-terminal2-native.json, fixed-b-recallread.json, fixed-b-parents-read.json, disable-zcode-native2.json, reenable-native.json, restart-history.json, unload-runtime.json, unload-reenable.json, final-histories-preserved.json. UI snapshots and exact actions are adjacent. Observer wrappers are restored before unload; only owned sessions/workspaces/processes are used.

## Gates and preserved controls

Three regression failures on the original implementation; four focused suites/71 tests pass after repair. Full verify:15 gates PASS,982 suites/10167 tests,lint0 errors/0 warnings,owner/module docs,graph freshness,typecheck and production build pass. zc9-full-verify.log/result.json. CodeGraph sync without init; affected scope saved in zc9-cg-affected.json,1668 traversed dependents (heuristic, not a risk rating). Finite depth1: SettingsTabbedRenderer::switchAgent3 distinct direct function/method callers/5 nodes, SettingsBackendSection::addDefaultBackendSetting1/3, setBackendEnabled1/3. The first includes OpenCode2 caller nodes outside the settings module; the user's prior blanket reviewed-continuation approval applies. Root files were verified, with no same-name ambiguity.

Original main checkout/old multi-backend worktree/ledgers/auth-config pins/standard Test Vault remain unchanged in all32 preservation-zc9.json checks. Initial FA minimax request errors, three-tab limit refusal, early mouse parameter errors, settings-tab/app-global mismatch and mistaken data.json read remain failed controls. Native success is derived only from the corrected named receipts; the old build's disconnects are not relabelled fixed. Source scope is two existing settings files, their two focused tests, mapped docs and generated src graph.

This closes the named three-tab/cancel/backend-switch/disable/unload clauses. It does not promote whole B04/B05/B06/B12 cases or any original full profile/platform to passed; other cancellation timing, interruption, version/profile and original scope conditions remain separate.

Evidence root: /Users/dht/.codex/artifacts/opencodian/remaining-acceptance-2026-10-06.
