import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const styleDir = path.join(rootDir, 'src', 'style');
const outputFile = path.join(rootDir, 'styles.css');

// Check if style directory exists
if (!fs.existsSync(styleDir)) {
  console.log('No src/style directory found, skipping CSS build');
  process.exit(0);
}

// Read index.css for import order
const indexPath = path.join(styleDir, 'index.css');
if (!fs.existsSync(indexPath)) {
  console.log('No index.css found, skipping CSS build');
  process.exit(0);
}

let combinedCSS = '';
const indexContent = fs.readFileSync(indexPath, 'utf-8');

// Parse @import statements
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

// Write combined CSS
fs.writeFileSync(outputFile, combinedCSS.trim());
console.log(`CSS built successfully: ${outputFile}`);
