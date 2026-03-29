import fs from 'fs';
import path from 'path';
import process from 'process';

const devlogPath = path.resolve(process.cwd(), 'devlog.md');
const content = fs.readFileSync(devlogPath, 'utf8');
const lines = content.split(/\r?\n/);
const dateHeadingPattern = /^## (\d{4}-\d{2}-\d{2}) /;

const headings = lines
  .map((line, index) => {
    const match = line.match(dateHeadingPattern);
    if (!match) {
      return null;
    }

    return {
      lineNumber: index + 1,
      dateText: match[1],
      timestamp: Date.parse(`${match[1]}T00:00:00Z`),
      text: line.trim(),
    };
  })
  .filter(Boolean);

const violations = [];
let latestAllowedTimestamp = Number.POSITIVE_INFINITY;

for (const heading of headings) {
  if (heading.timestamp > latestAllowedTimestamp) {
    violations.push(heading);
  }

  if (heading.timestamp < latestAllowedTimestamp) {
    latestAllowedTimestamp = heading.timestamp;
  }
}

if (violations.length > 0) {
  console.error('[check:devlog-order] devlog.md date headings are out of descending order.');
  console.error('[check:devlog-order] New dated entries must be inserted before the first dated section, not appended to the end.');
  for (const violation of violations) {
    console.error(`  Line ${violation.lineNumber}: ${violation.text}`);
  }
  process.exit(1);
}

console.log(`[check:devlog-order] OK (${headings.length} dated sections in descending order)`);
