import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);

const GENERATED_PATH = path.join(process.cwd(), 'src', 'utils', 'icons', 'lobehubIconManifest.ts');
const packageJsonPath = require.resolve('@lobehub/icons/package.json');
const packageRoot = path.dirname(packageJsonPath);
const tocModulePath = path.join(packageRoot, 'es', 'toc.js');
const getLobeIconCDNModulePath = path.join(packageRoot, 'es', 'features', 'getLobeIconCDN', 'index.js');

const tocModule = await import(pathToFileURL(tocModulePath).href);
const { getLobeIconCDN } = await import(pathToFileURL(getLobeIconCDNModulePath).href);
const toc = Array.isArray(tocModule.default) ? tocModule.default : Array.isArray(tocModule.toc) ? tocModule.toc : [];

const VARIANT_CONFIG = [
  { variant: 'mono', capabilityKey: null, staticSupport: true },
  { variant: 'color', capabilityKey: 'hasColor', staticSupport: true },
  { variant: 'brand', capabilityKey: 'hasBrand', staticSupport: true },
  { variant: 'brand-color', capabilityKey: 'hasBrandColor', staticSupport: true },
  { variant: 'text', capabilityKey: 'hasText', staticSupport: true },
  { variant: 'text-cn', capabilityKey: 'hasTextCn', staticSupport: true },
  { variant: 'text-color', capabilityKey: 'hasTextColor', staticSupport: true },
  { variant: 'combine', capabilityKey: 'hasCombine', staticSupport: false },
  { variant: 'avatar', capabilityKey: 'hasAvatar', staticSupport: true },
];

function buildVariantDefinition(entry, variant) {
  const config = VARIANT_CONFIG.find((item) => item.variant === variant);
  if (!config) {
    return null;
  }

  const supported = config.capabilityKey ? Boolean(entry.param?.[config.capabilityKey]) : true;
  if (!supported) {
    return null;
  }

  if (!config.staticSupport) {
    return {
      supported: true,
      staticSupport: false,
      formats: [],
      urls: {},
    };
  }

  if (variant === 'avatar') {
    return {
      supported: true,
      staticSupport: true,
      formats: ['avatar'],
      urls: {
        avatar: getLobeIconCDN(entry.id, {
          cdn: 'unpkg',
          format: 'avatar',
        }),
      },
    };
  }

  return {
    supported: true,
    staticSupport: true,
    formats: ['svg', 'png', 'webp'],
    urls: {
      svg: getLobeIconCDN(entry.id, {
        cdn: 'unpkg',
        format: 'svg',
        type: variant,
      }),
      png: {
        light: getLobeIconCDN(entry.id, {
          cdn: 'unpkg',
          format: 'png',
          type: variant,
          isDarkMode: false,
        }),
        dark: getLobeIconCDN(entry.id, {
          cdn: 'unpkg',
          format: 'png',
          type: variant,
          isDarkMode: true,
        }),
      },
      webp: {
        light: getLobeIconCDN(entry.id, {
          cdn: 'unpkg',
          format: 'webp',
          type: variant,
          isDarkMode: false,
        }),
        dark: getLobeIconCDN(entry.id, {
          cdn: 'unpkg',
          format: 'webp',
          type: variant,
          isDarkMode: true,
        }),
      },
    },
  };
}

const manifest = toc
  .map((entry) => {
    const iconId = String(entry.id ?? '').trim().toLowerCase();
    if (!iconId) {
      return null;
    }

    const variants = Object.fromEntries(
      VARIANT_CONFIG
        .map((item) => [item.variant, buildVariantDefinition(entry, item.variant)])
        .filter(([, value]) => value !== null),
    );

    return {
      iconId,
      componentId: entry.id,
      docsUrl: entry.docsUrl,
      title: entry.title,
      fullTitle: entry.fullTitle,
      group: entry.group,
      color: entry.color,
      colorGradient: entry.colorGradient,
      capabilities: {
        hasAvatar: Boolean(entry.param?.hasAvatar),
        hasBrand: Boolean(entry.param?.hasBrand),
        hasBrandColor: Boolean(entry.param?.hasBrandColor),
        hasColor: Boolean(entry.param?.hasColor),
        hasCombine: Boolean(entry.param?.hasCombine),
        hasText: Boolean(entry.param?.hasText),
        hasTextCn: Boolean(entry.param?.hasTextCn),
        hasTextColor: Boolean(entry.param?.hasTextColor),
      },
      variants,
    };
  })
  .filter(Boolean)
  .sort((left, right) => left.iconId.localeCompare(right.iconId));

const fileContent = `/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * Run \`npm run sync:lobehub-icons\` to regenerate from @lobehub/icons.
 */

export type LobehubManifestGroup = 'model' | 'provider' | 'application';
export type LobehubManifestStaticVariant = 'mono' | 'color' | 'brand' | 'brand-color' | 'text' | 'text-cn' | 'text-color' | 'avatar';
export type LobehubManifestVariant = LobehubManifestStaticVariant | 'combine';
export type LobehubManifestFormat = 'svg' | 'png' | 'webp' | 'avatar';

export interface LobehubManifestVariantEntry {
  supported: boolean;
  staticSupport: boolean;
  formats: LobehubManifestFormat[];
  urls: {
    svg?: string;
    png?: { light: string; dark: string };
    webp?: { light: string; dark: string };
    avatar?: string;
  };
}

export interface LobehubManifestEntry {
  iconId: string;
  componentId: string;
  docsUrl: string;
  title: string;
  fullTitle: string;
  group: LobehubManifestGroup;
  color: string;
  colorGradient?: string;
  capabilities: {
    hasAvatar: boolean;
    hasBrand: boolean;
    hasBrandColor: boolean;
    hasColor: boolean;
    hasCombine: boolean;
    hasText: boolean;
    hasTextCn: boolean;
    hasTextColor: boolean;
  };
  variants: Partial<Record<LobehubManifestVariant, LobehubManifestVariantEntry>>;
}

export const LOBEHUB_ICON_MANIFEST: LobehubManifestEntry[] = ${JSON.stringify(manifest, null, 2)};
`;

fs.writeFileSync(GENERATED_PATH, fileContent, 'utf8');
console.log(`[sync:lobehub-icons] Generated ${path.relative(process.cwd(), GENERATED_PATH)} with ${manifest.length} icons.`);
