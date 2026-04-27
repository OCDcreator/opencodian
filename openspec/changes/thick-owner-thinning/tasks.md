## 1. Pipeline Setup

- [ ] 1.1 Finalize the OpenSpec artifacts for `thick-owner-thinning`, including the anti-fragmentation and alternating-lane contract.
- [ ] 1.2 Initialize Task Master in the repo and parse `openspec/changes/thick-owner-thinning/proposal.md` into structured tasks.
- [ ] 1.3 Import the Task Master tasks into `.opencode-loop/queue.json` for execute mode without overwriting unrelated queue state accidentally.

## 2. Queue Enrichment

- [ ] 2.1 Add repo-specific verification commands to each imported task, including `npm run verify` and any focused checks needed for the touched owner.
- [ ] 2.2 Add acceptance checks that enforce single-slice ownership moves, updated module docs, and no thin helper fragmentation.
- [ ] 2.3 Order and promote the queue into alternating `OpenCodeService.ts` and `OpenCodianView.ts` lanes.

## 3. Service Lane

- [ ] 3.1 Move one complete `OpenCodeService.ts` behavior slice into existing adjacent owners, starting with the lowest-risk stable slice.
- [ ] 3.2 Verify the service-lane round with focused tests, module docs updates, graphify freshness, and full `npm run verify`.
- [ ] 3.3 Record the next service-lane ownership slice only after the current one lands cleanly.

## 4. View Lane

- [ ] 4.1 Move one complete `OpenCodianView.ts` behavior slice into existing adjacent owners, starting with the lowest-risk stable slice.
- [ ] 4.2 Verify the view-lane round with focused tests, module docs updates, graphify freshness, and full `npm run verify`.
- [ ] 4.3 Record the next view-lane ownership slice only after the current one lands cleanly.

## 5. Execute-Mode Hardening

- [ ] 5.1 Validate the queue and confirm every promoted task is independently resumable and verifiable.
- [ ] 5.2 Optionally add a `gate-review` hook once the first execute-mode round proves stable.
- [ ] 5.3 Switch future unattended thick-file thinning for this program from broad `dev` mode to queue-gated `execute` mode.
