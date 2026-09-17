/**
 * InlineEditPresets — the `#` preset prompt catalog for inline edit (R-A2).
 *
 * Two layers, composed by `listEffectiveInlineEditPresets`:
 *
 * - the builtin catalog, defined here and localized through i18n (`t()`), so
 *   its labels and prompt bodies follow the UI locale and are always present
 *   (`inlineEditPresetPrompts` empty means "builtins only");
 * - the user-defined list from settings (`core.types` `InlineEditPresetPrompt`),
 *   appended after the builtins in settings order.
 *
 * Presets are form-agnostic by design: the same list serves selection, cursor
 * and (later) document modes — no shape filtering (docs/requirements/
 * flowtext-parity.md R-A2). A user entry whose id collides with a builtin id
 * is skipped at composition time, so hand-edited settings can never shadow or
 * duplicate a builtin row.
 */

import type { InlineEditPresetPrompt } from '../../core/types';
import { t } from '../../i18n';

/** Reserved ids of the builtin catalog; user entries with these ids are skipped. */
export const INLINE_EDIT_BUILTIN_PRESET_IDS = [
  'expand',
  'condense',
  'translate',
  'summarize-table',
  'polish-tone',
  'fix-typos',
] as const;

/** The six builtin presets, localized for the current locale. */
export function listBuiltinInlineEditPresets(): InlineEditPresetPrompt[] {
  return INLINE_EDIT_BUILTIN_PRESET_IDS.map((id) => ({
    id,
    label: t(`inlineEdit.presets.${id}.label`),
    prompt: t(`inlineEdit.presets.${id}.prompt`),
  }));
}

/**
 * The effective menu list: builtins first, then user presets with usable
 * content and non-reserved ids, in settings order. Entries missing a label or
 * prompt never reach the menu, so a half-edited settings row renders nothing.
 */
export function listEffectiveInlineEditPresets(
  userPresets: readonly InlineEditPresetPrompt[],
): InlineEditPresetPrompt[] {
  const builtins = listBuiltinInlineEditPresets();
  const reserved = new Set<string>(INLINE_EDIT_BUILTIN_PRESET_IDS);
  return [
    ...builtins,
    ...userPresets.filter((preset) =>
      preset.label.trim().length > 0
      && preset.prompt.trim().length > 0
      && !reserved.has(preset.id),
    ),
  ];
}
