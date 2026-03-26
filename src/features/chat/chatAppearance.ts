import type { ChatAppearanceSettings } from '../../core/types';
import { isValidChatAppearanceCustomCssDeclarations } from '../../core/types';

export function getChatAppearanceCssVariables(
  appearance: ChatAppearanceSettings,
): Record<string, string> {
  return {
    '--opencodian-messages-pad-top': `${appearance.layout.messagesPaddingTop}px`,
    '--opencodian-messages-pad-x': `${appearance.layout.messagesPaddingX}px`,
    '--opencodian-sticky-header-gap': `${appearance.sticky.headerGap}px`,
    '--opencodian-sticky-mask-height': `${appearance.sticky.maskHeight}px`,
    '--opencodian-sticky-mask-blur': `${appearance.sticky.maskBlur}px`,
    '--opencodian-user-radius': `${appearance.user.radius}px`,
    '--opencodian-user-tail-radius': `${appearance.user.tailRadius}px`,
    '--opencodian-user-blur': `${appearance.user.blur}px`,
    '--opencodian-user-shadow-blur': `${appearance.user.shadowBlur}px`,
    '--opencodian-assistant-radius': `${appearance.assistant.radius}px`,
    '--opencodian-assistant-bg-opacity': `${appearance.assistant.backgroundOpacity}%`,
    '--opencodian-assistant-blur': `${appearance.assistant.blur}px`,
    '--opencodian-assistant-shadow-blur': `${appearance.assistant.shadowBlur}px`,
    '--opencodian-input-radius': `${appearance.input.radius}px`,
    '--opencodian-input-blur': `${appearance.input.blur}px`,
    '--opencodian-input-shadow-blur': `${appearance.input.shadowBlur}px`,
    '--opencodian-scrollbar-width': `${appearance.scrollbar.width}px`,
    '--opencodian-scrollbar-radius': `${appearance.scrollbar.radius}px`,
    '--opencodian-scrollbar-track-opacity': `${appearance.scrollbar.trackOpacity}%`,
    '--opencodian-scrollbar-thumb-opacity': `${appearance.scrollbar.thumbOpacity}%`,
    '--opencodian-scrollbar-thumb-hover-opacity': `${appearance.scrollbar.thumbHoverOpacity}%`,
    '--opencodian-scrollbar-edge-padding': `${appearance.scrollbar.edgePadding}px`,
    '--opencodian-scrollbar-shadow-opacity': `${appearance.scrollbar.shadowOpacity}%`,
  };
}

export function buildChatAppearanceCustomCss(declarations: string): string {
  const trimmedDeclarations = declarations.trim();
  if (!trimmedDeclarations || !isValidChatAppearanceCustomCssDeclarations(trimmedDeclarations)) {
    return '';
  }

  return `.opencodian-container {\n${trimmedDeclarations}\n}`;
}
