# Tasks

## 1. Pipeline Contract

- [ ] 1.1 Confirm `docs/requirements/maintenance-development-baseline.md` is the controlling baseline.
- [ ] 1.2 Import this OpenSpec proposal into Task Master without replacing the runtime truth source; `.opencode-loop/queue.json` remains canonical after import.
- [ ] 1.3 Reject task wording that describes generic cleanup, net-new feature work, or line-count-only splitting.

## 2. Owner-First Selection

- [ ] 2.1 Inspect the current thick-owner candidates and choose one primary owner for the first execute task.
- [ ] 2.2 Name the owner type before implementation: facade, domain runtime, domain UI, state, config, storage, test, or documentation.
- [ ] 2.3 Prefer an existing adjacent owner before creating any new module.

## 3. First Maintenance Slice

- [ ] 3.1 Move or consolidate one complete behavior slice so ownership clarity improves or is explicitly preserved.
- [ ] 3.2 Avoid creating thin helper, adapter, provider, factory, or bridge files unless the new module owns a complete behavior slice or isolates a real protocol boundary.
- [ ] 3.3 Keep the primary task scope narrow and behavior-preserving.

## 4. Documentation And Verification

- [ ] 4.1 Update matching `docs/modules/**` documentation when a module boundary changes.
- [ ] 4.2 Run focused checks for the touched owner when available.
- [ ] 4.3 Run `npm run verify`.

## 5. Completion Bar

- [ ] 5.1 Mark the task complete only when verification is green and ownership shape is improved or explicitly preserved.
- [ ] 5.2 If the result only moves complexity sideways into more files, treat the task as failed even if tests pass.
- [ ] 5.3 Record any blocker in queue state instead of broadening the task ad hoc.
