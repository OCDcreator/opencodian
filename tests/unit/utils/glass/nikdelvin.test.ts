import { adapter } from '../../../../src/utils/glass/adapters/nikdelvin';
import type { GlassMountContext, GlassAdapterSettingsValue } from '../../../../src/utils/glass/types';

function createMountContext(resolveAssetUrl?: (relativePath: string) => string | null): GlassMountContext {
  const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
  shellEl.style.width = '320px';
  shellEl.style.height = '88px';
  shellEl.style.borderRadius = '20px';

  const contentEl = shellEl.createDiv({ cls: 'opencodian-input-wrapper' });
  const filterLayerEl = shellEl.createDiv({ cls: 'opencodian-composer-svg-filter-layer' });
  const svgRootEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svgRootEl);

  return {
    shellEl,
    contentEl,
    filterLayerEl,
    svgRootEl,
    resolveAssetUrl,
  };
}

function createSettings(
  overrides: Record<string, GlassAdapterSettingsValue> = {},
): Record<string, GlassAdapterSettingsValue> {
  return {
    depth: 10,
    strength: 100,
    chromaticAberration: 0,
    blur: 0,
    backgroundPreset: 'background',
    color: 'transparent',
    background: '',
    freeze: false,
    noMorph: false,
    button: false,
    inline: false,
    customEffects: false,
    ...overrides,
  };
}

function getOverlayElement(ctx: GlassMountContext): HTMLElement {
  const overlayEl = ctx.filterLayerEl.querySelector<HTMLElement>('[data-opencodian-lg-nikdelvin-role="overlay"]');
  if (!overlayEl) {
    throw new Error('Nikdelvin overlay element was not mounted');
  }

  return overlayEl;
}

describe('nikdelvin liquid glass adapter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses a light overlay when no preset or custom background is active', () => {
    const ctx = createMountContext();

    adapter.mount(
      ctx,
      createSettings({
        backgroundPreset: 'none',
        background: '',
      }),
    );

    expect(getOverlayElement(ctx).style.background).toBe('rgba(255, 255, 255, 0.08)');

    adapter.unmount(ctx);
  });

  it('keeps the dark upstream overlay when a background preset is active', () => {
    const ctx = createMountContext(() => 'app://nikdelvin/background');

    adapter.mount(ctx, createSettings());

    expect(getOverlayElement(ctx).style.background).toBe('rgba(0, 0, 0, 0.3)');

    adapter.unmount(ctx);
  });
});
