/**
 * Barrel for the batch note organizing runtime (`app.batch-organize` owner,
 * R-B5). Constructed by `main.ts`; the modal drives the coordinator through
 * the preview → confirm → execute handshake with forced R-B3 snapshots.
 */

export {
  type BatchExecuteOutcome,
  BatchOrganizeCoordinator,
  type BatchPreview,
  type BatchPreviewOutcome,
} from './BatchOrganizeCoordinator';
export { BatchOrganizeModal, BatchRevertConfirmModal } from './BatchOrganizeModal';
