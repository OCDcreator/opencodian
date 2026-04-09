import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

export function buildCss(root = rootDir) {
  const styleDir = path.join(root, 'src', 'style');
  const outputFile = path.join(root, 'styles.css');

  if (!fs.existsSync(styleDir)) {
    console.log('No src/style directory found, skipping CSS build');
    return false;
  }

  const indexPath = path.join(styleDir, 'index.css');
  if (!fs.existsSync(indexPath)) {
    console.log('No index.css found, skipping CSS build');
    return false;
  }

  let combinedCSS = '';
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  const importRegex = /@import\s+['"]([^'"]+)['"];?/g;
  let match;

  while ((match = importRegex.exec(indexContent)) !== null) {
    const importPath = match[1];
    const fullPath = path.join(styleDir, importPath);

    if (fs.existsSync(fullPath)) {
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      combinedCSS += `/* ${importPath} */\n${fileContent}\n\n`;
    } else {
      console.warn(`Warning: Could not find ${importPath}`);
    }
  }

  fs.writeFileSync(outputFile, combinedCSS.trim());
  console.log(`CSS built successfully: ${outputFile}`);
  return true;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  buildCss();
}
