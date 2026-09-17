/**
 * InlineEditHost — the seam between inline edit and the plugin runtime.
 *
 * `editorCallback` only hands out an `Editor` and a `MarkdownView`, so the
 * command cannot reach the chat view or the agent registry on its own. The
 * plugin main class implements this contract, and `InlineEditController` depends
 * on nothing else, which keeps the controller testable and free of plugin
 * imports.
 *
 * See docs/requirements/inline-edit.md §5.2 and §9.
 */

import type { InlineEditPresetPrompt } from '../../core/types';
import type {
  InlineEditChoice,
  InlineEditContextFile,
  InlineEditHostAdapter,
  InlineEditModelSelectionLabel,
} from './InlineEditTypes';

export type {
  InlineEditChoice,
  InlineEditContextFile,
  InlineEditHostAdapter,
  InlineEditModelSelectionLabel,
};

/**
 * Host services required by inline edit.
 *
 * `resolveModel` follows the documented precedence: the user's
 * `inlineEditModelOverrides` entry for the backend first, then the active chat
 * tab's model, then `null` (let the backend pick its default). An explicitly
 * configured but unusable model must surface as `{ error }` rather than silently
 * falling back.
 */
export interface InlineEditHost {
  /** Absolute path the auxiliary session may read; normally the vault root. */
  getWorkingDirectory(): string;
  /** Current UI locale, used to pick the system prompt language. */
  getLocale(): 'en' | 'zh';
  /**
   * Backend for this inline edit: the active chat tab's backend, or the
   * registry's active adapter when no chat view is open.
   */
  resolveAdapter(): InlineEditHostAdapter | null;
  /**
   * Resolve a provider icon element for the model chip / menu rows, rendered
   * the same way as the main composer model selector. Absent or `null` falls
   * back to a generic lucide glyph.
   */
  createProviderIcon?(providerId: string, size: number): HTMLElement | null;
  /**
   * Vault notes offered by the "add context" picker. Absent or `null` hides the
   * affordance entirely, so a host without a vault keeps the bar unchanged.
   */
  listContextFiles?(): readonly InlineEditContextFile[] | null;
  /**
   * Effective `#` preset list for the input bar's preset menu (R-A2): the
   * builtin catalog plus the user-defined entries, already merged and
   * filtered. Absent yields an empty list (menu shows a no-match row only
   * when the trigger itself can produce one).
   */
  listPresetPrompts?(): readonly InlineEditPresetPrompt[];
}
