# Settings button layout repair — 2026-10-08

User screenshot reproduced on native Mac Obsidian 1.14.4: a 319px control track contained about 618px of four non-wrapping diagnostic buttons; the first button painted left over the label and was clipped. The full window was900px but the Settings pane675px and nested row501px, so viewport-only720px collapse did not apply. Raw geometry and screenshot: settings-layout-before-visible-geometry.json / settings-layout-before-visible.png.

## Change

Version remains1.1.37. Shared settings contract now gives ordinary Field rows and the pane named inline-size containers, switches narrow labeled forms to copy-above-controls in original DOM order, wraps all native Setting control groups, limits children to the row, and lets long action labels wrap. Dropdown triggers retain existing truncation. ACP actions wrap; Formatter260px becomes min(260px,100%). Compact action-only Settings explicitly retain owner sizing. Header brand/backend rail also wraps in narrow containers. No handlers, setting schemas, native permissions or backend requests changed.

CSS isn't in architecture-owners.config.json's TS/TSX sourceScopes; exact CSS owner lookup returned no match. Related feature.settings-shell owner and mapped style module docs read/updated; no function/class/method changed, so no fabricated callers/impact counts. CodeGraph1.5.0 complete,pendingChanges0; affected reports0dependents/tests for actual changed files. Graphify input freshness refreshed after final CSS source change.

## Native coverage

Both isolated Mac and FA880 Obsidian1.14.4 loaded BUILD_ID REMAINDER.20261008.layout3 with matching three-file hashes. Two batched assessments plus confirmation of the revealed header boundary: Debug/path/actions at1180/900/720px windows and150% zoom, actual English/Chinese selector, Server status, Agents,Skills,Tools built-in/custom toolbar,ACP,Formatter,MCP,Claude runtime controls and Codex inspector groups. All final relevant row/toolbar measurements show no button-text overlap, no control outside own row, no root horizontal overflow. Skills/MCP action-only surfaces are checked by real toolbar button counts/rectangles, not a zero-row result. settings-layout-native-matrix.json; {host}-layout3-*-scan.json and tool/header screenshots. Model/native runtime acceptance isn't inferred from layout.

First attempt exposed action-only shrink-wrap caused by inline-size containment: corrected explicit exclusions; layout1 failed screenshot retained. layout2 zoom showed six Mac backend icons extending outside pane; targeted header wrap then layout3 exact geometry is clean. No open-ended visual polishing. Native invisible select/measuring probes are excluded only when computed opacity0/hidden; real buttons remain checked.

## Gates, deployment and preservation

Focused4suites39tests passed. Final verify layout3-full-verify-retry.log/result.json:15gates,982suites10,166tests,lint0errors/0warnings,typecheck,module-doc/owner/graph/build/generated-style checks pass. First layout1 generated-style gate failed because generated styles weren't staged; layout2 graph freshness correctly failed after its CSS correction; final layout3 first run had an unchanged ZCodeProviderConfigDiscovery Jest worker SIGSEGV. That exact suite passed12/12alone; full retry passed. No source changes after full retry. Failed raw logs retained.

main SHA256 af7e409b8f78c894a0c09066078cd228a3a4f38da77cbd5d33234f6489981858
manifest SHA256376121d93d3029900f37c0282a485dc89efa99d346436210d2a770edcb020bec
styles SHA2568ae1d8b896fe1db244c5d19ea28aad4c785084471cbae58f590b360df955cd0d

Sequential build/copy/load receipts:deployment-layout3.json,fa880-deploy-layout3.json,{host}-layout3-loaded.json. Fullverify rebuild hashes identical:layout3-after-verify-hashes.json. Native tests restore previous window zoom/bounds, locale en, active backend zcode and original same-native conversations Mac sess_ba65846f-9925-4ef5-86d3-8234abfe451b /FA sess_535e54d1-5436-471e-93c5-96453a71cfb0. Source histories retained. Preservation-layout3.json:32checks unchanged for primary synced checkout,oldworktree/ledgers,originalauth/config and standard TestVaultmain. Work stays in isolated nonsynced branch; no push,merge,release.

Evidence root:/Users/dht/.codex/artifacts/opencodian/remaining-acceptance-2026-10-06
