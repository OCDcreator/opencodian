import type {
  ChatAppearanceBackgroundFitMode,
  ChatAppearanceSettings,
  InputPanelGlassRefractionSettings,
} from '../../core/types';
import { isValidChatAppearanceCustomCssDeclarations } from '../../core/types';
import { InputFontLoader, resolveComposerFontFamily } from '../settings/InputFontRegistry';

const fontLoader = new InputFontLoader();

export function getChatAppearanceBackgroundSizeValue(
  fitMode: ChatAppearanceBackgroundFitMode,
): string {
  switch (fitMode) {
    case 'contain':
      return 'contain';
    case 'fit-width':
      return '100% auto';
    case 'fit-height':
      return 'auto 100%';
    case 'cover':
    default:
      return 'cover';
  }
}

export function getChatAppearanceCssVariables(
  appearance: ChatAppearanceSettings,
): Record<string, string> {
  // Ensure selected fonts are loaded from CDN before CSS variables reference them.
  fontLoader.ensureBothLoaded(appearance.input.enFontFamily, appearance.input.cnFontFamily);

  const backgroundScale = 1 + (appearance.background.depth / 100);
  const backgroundBleed = Math.max(
    28,
    Math.round(
      (appearance.background.blur * 4.5)
      + (appearance.background.edgeFade * 1.15)
      + (appearance.background.depth * 0.4),
    ),
  );
  const backgroundOverlayOpacity = Math.min(68, Math.round((appearance.background.dim * 0.55) + 6));
  const backgroundOverlayStrongOpacity = Math.min(78, Math.round((appearance.background.dim * 0.72) + 10));
  const backgroundMaskOpacity = Math.min(84, Math.round((appearance.background.dim * 0.68) + 14));
  const backgroundHighlightOpacity = Math.min(18, Math.round((appearance.background.dim * 0.22) + 4));

  return {
    '--opencodian-messages-pad-top': `${appearance.layout.messagesPaddingTop}px`,
    '--opencodian-messages-pad-x': `${appearance.layout.messagesPaddingX}px`,
    '--opencodian-sticky-header-gap': `${appearance.sticky.headerGap}px`,
    '--opencodian-sticky-mask-height': `${appearance.sticky.maskHeight}px`,
    '--opencodian-sticky-mask-blur': `${appearance.sticky.maskBlur}px`,
    '--opencodian-theme-bg-opacity': `${appearance.background.opacity / 100}`,
    '--opencodian-theme-bg-blur': `${appearance.background.blur}px`,
    '--opencodian-theme-bg-scale': backgroundScale.toFixed(3),
    '--opencodian-theme-bg-bleed': `${backgroundBleed}px`,
    '--opencodian-theme-bg-dim': `${appearance.background.dim}%`,
    '--opencodian-theme-bg-edge-fade': `${appearance.background.edgeFade}px`,
    '--opencodian-theme-bg-overlay-opacity': `${backgroundOverlayOpacity}%`,
    '--opencodian-theme-bg-overlay-opacity-strong': `${backgroundOverlayStrongOpacity}%`,
    '--opencodian-theme-bg-mask-opacity': `${backgroundMaskOpacity}%`,
    '--opencodian-theme-bg-highlight-opacity': `${backgroundHighlightOpacity}%`,
    '--opencodian-theme-bg-saturation': `${appearance.background.saturation}%`,
    '--opencodian-theme-bg-brightness': `${appearance.background.brightness}%`,
    '--opencodian-theme-bg-size': getChatAppearanceBackgroundSizeValue(appearance.background.fitMode),
    '--opencodian-theme-bg-focus-x': `${appearance.background.focusX}%`,
    '--opencodian-theme-bg-focus-y': `${appearance.background.focusY}%`,
    '--opencodian-user-radius': `${appearance.user.radius}px`,
    '--opencodian-user-tail-radius': `${appearance.user.tailRadius}px`,
    '--opencodian-user-blur': `${appearance.user.blur}px`,
    '--opencodian-user-shadow-blur': `${appearance.user.shadowBlur}px`,
    '--opencodian-user-time-font-size': `${appearance.user.timeFontSize}px`,
    '--opencodian-user-time-font-weight': String(appearance.user.timeFontWeight),
    '--opencodian-user-time-color': appearance.user.timeColor,
    '--opencodian-assistant-radius': `${appearance.assistant.radius}px`,
    '--opencodian-assistant-bg-opacity': `${appearance.assistant.backgroundOpacity}%`,
    '--opencodian-assistant-blur': `${appearance.assistant.blur}px`,
    '--opencodian-assistant-shadow-blur': `${appearance.assistant.shadowBlur}px`,
    '--opencodian-assistant-meta-font-size': `${appearance.assistant.metaFontSize}px`,
    '--opencodian-assistant-meta-color': appearance.assistant.metaColor,
    '--opencodian-assistant-time-font-size': `${appearance.assistant.timeFontSize}px`,
    '--opencodian-assistant-time-font-weight': String(appearance.assistant.timeFontWeight),
    '--opencodian-assistant-time-color': appearance.assistant.timeColor,
    '--opencodian-assistant-model-id-font-size': `${appearance.assistant.modelIdFontSize}px`,
    '--opencodian-assistant-model-id-font-weight': String(appearance.assistant.modelIdFontWeight),
    '--opencodian-assistant-model-id-color': appearance.assistant.modelIdColor,
    '--opencodian-input-radius': `${appearance.input.radius}px`,
    '--opencodian-input-bg-opacity': `${appearance.input.backgroundOpacity}%`,
    '--opencodian-input-blur': `${appearance.input.blur}px`,
    '--opencodian-input-shadow-blur': `${appearance.input.shadowBlur}px`,
    '--opencodian-composer-font-family': resolveComposerFontFamily(
      appearance.input.enFontFamily,
      appearance.input.cnFontFamily,
    ),
    '--opencodian-scrollbar-width': `${appearance.scrollbar.width}px`,
    '--opencodian-scrollbar-radius': `${appearance.scrollbar.radius}px`,
    '--opencodian-scrollbar-track-opacity': `${appearance.scrollbar.trackOpacity}%`,
    '--opencodian-scrollbar-thumb-opacity': `${appearance.scrollbar.thumbOpacity}%`,
    '--opencodian-scrollbar-thumb-hover-opacity': `${appearance.scrollbar.thumbHoverOpacity}%`,
    '--opencodian-scrollbar-edge-padding': `${appearance.scrollbar.edgePadding}px`,
    '--opencodian-scrollbar-shadow-opacity': `${appearance.scrollbar.shadowOpacity}%`,
  };
}

export function getInputPanelGlassRefractionCssVariables(
  settings: InputPanelGlassRefractionSettings,
): Record<string, string> {
  return {
    '--opencodian-gr-glass-bg-alpha': `${settings.glass.backgroundOpacity / 100}`,
    '--opencodian-gr-glass-blur': `${settings.glass.blur}px`,
    '--opencodian-gr-glass-saturation': `${settings.glass.saturation}%`,
    '--opencodian-gr-glass-brightness': `${settings.glass.brightness}%`,
    '--opencodian-gr-card-bg-alpha': `${settings.card.backgroundOpacity / 100}`,
    '--opencodian-gr-card-blur': `${settings.card.blur}px`,
    '--opencodian-gr-card-saturation': `${settings.card.saturation}%`,
    '--opencodian-gr-card-brightness': `${settings.card.brightness}%`,
    '--opencodian-gr-pill-bg-alpha': `${settings.pill.backgroundOpacity / 100}`,
    '--opencodian-gr-pill-blur': `${settings.pill.blur}px`,
    '--opencodian-gr-pill-saturation': `${settings.pill.saturation}%`,
    '--opencodian-gr-pill-brightness': `${settings.pill.brightness}%`,
  };
}

export function buildChatAppearanceCustomCss(declarations: string): string {
  const trimmedDeclarations = declarations.trim();
  if (!trimmedDeclarations || !isValidChatAppearanceCustomCssDeclarations(trimmedDeclarations)) {
    return '';
  }

  return `.opencodian-container {\n${trimmedDeclarations}\n}`;
}
