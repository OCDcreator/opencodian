/**
 * Barrel for the Obsidian native tooling runtime composition
 * (`app.obsidian-tooling` owner, R-B4). Constructed by `main.ts`; the chat
 * runtime and the settings surface consume it through the plugin field.
 */

export {
  type ObsidianToolingApprovalChoice,
  ObsidianToolingApprovalModal,
} from './ObsidianToolingApprovalModal';
export {
  ObsidianToolingCoordinator,
} from './ObsidianToolingCoordinator';
