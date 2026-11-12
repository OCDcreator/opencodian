import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('.', import.meta.url).pathname, '..');
const templatePath = resolve(root, 'docs/prototypes/backend-settings-four.html');
const appPath = resolve(root, '.prototype-work/app.js');
const inventoryPaths = [
  resolve(root, '.prototype-work/claude-codex.json'),
  resolve(root, '.prototype-work/pi-zcode.json'),
];
const template = readFileSync(templatePath, 'utf8');
const app = readFileSync(appPath, 'utf8');
const inventories = inventoryPaths.flatMap((file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
});
if (inventories.length !== 4) throw new Error(`Expected four backend inventories, found ${inventories.length}`);
const ids = new Set();
let fieldCount = 0;
for (const backend of inventories) {
  if (!backend.id || ids.has(backend.id)) throw new Error(`Duplicate or missing backend id: ${backend.id}`);
  ids.add(backend.id);
  for (const tab of backend.tabs || []) for (const group of tab.groups || []) {
    const keys = new Set();
    for (const field of group.fields || []) {
      fieldCount += 1;
      if (!field.key || keys.has(field.key)) throw new Error(`Duplicate or missing field key in ${backend.id}/${tab.id}/${group.title}: ${field.key}`);
      keys.add(field.key);
      if (field.type === 'select' || field.type === 'segment') {
        if (!Array.isArray(field.options) || field.options.length === 0) throw new Error(`Missing options for ${field.key}`);
      }
    }
  }
}
const embeddedData = JSON.stringify(inventories).replace(/</g, '\\u003c');
const withData = template.replace(new RegExp('<script id="prototype-data" type="application/json">[\\s\\S]*?<\\/script>'), () => `<script id="prototype-data" type="application/json">${embeddedData}</script>`);
const output = withData.includes('/*__APP_SCRIPT__*/')
  ? withData.replace('/*__APP_SCRIPT__*/', () => app)
  : withData.replace(new RegExp('<script>\\n[\\s\\S]*?<\\/script>\\n<\\/body>'), () => `<script>\n${app}\n</script>\n</body>`);
writeFileSync(templatePath, output);
console.log(`Built ${templatePath} with ${inventories.length} backends and ${fieldCount} fields.`);
