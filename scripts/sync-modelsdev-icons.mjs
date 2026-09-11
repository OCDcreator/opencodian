import fs from 'fs';
import https from 'https';
import path from 'path';

/**
 * Snapshots the models.dev provider id vocabulary so icon resolution and fuzzy
 * matching stay offline-deterministic. The logos themselves are hot-linked from
 * https://models.dev/logos/<id>.svg at runtime.
 */
const CATALOG_URL = 'https://models.dev/api.json';
const GENERATED_PATH = path.join(process.cwd(), 'src', 'utils', 'icons', 'modelsDevIconManifest.ts');

function fetchJson(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const { statusCode = 0, headers } = response;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume();
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects while fetching ${url}`));
            return;
          }
          resolve(fetchJson(new URL(headers.location, url).href, redirectsLeft - 1));
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`Request for ${url} failed with status ${statusCode}`));
          return;
        }

        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

const catalog = await fetchJson(CATALOG_URL);
if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
  throw new Error('models.dev catalogue is not a provider map; refusing to regenerate.');
}

const providers = Object.entries(catalog)
  .map(([rawId, value]) => {
    const id = String(rawId).trim().toLowerCase();
    const rawName = value && typeof value === 'object' ? value.name : null;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id;
    return { id, name };
  })
  .filter((provider) => provider.id.length > 0)
  .sort((left, right) => left.id.localeCompare(right.id));

if (providers.length === 0) {
  throw new Error('models.dev catalogue returned no providers; refusing to regenerate.');
}

const fileContent = `/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * Run \`npm run sync:modelsdev-icons\` to regenerate from models.dev.
 */

export interface ModelsDevProviderIcon {
  id: string;
  name: string;
}

/** Provider ids published by models.dev; each logo lives at MODELS_DEV_LOGO_URL/<id>.svg. */
export const MODELS_DEV_PROVIDER_ICONS: ModelsDevProviderIcon[] = ${JSON.stringify(providers, null, 2)};
`;

fs.writeFileSync(GENERATED_PATH, fileContent, 'utf8');
console.log(
  `[sync:modelsdev-icons] Generated ${path.relative(process.cwd(), GENERATED_PATH)} with ${providers.length} providers.`,
);
