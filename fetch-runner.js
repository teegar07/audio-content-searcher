import fs from 'node:fs/promises';

const sourcePath = new URL('./fetch-articles-v3.js', import.meta.url);
const patchedPath = new URL('./.fetch-articles-runtime.js', import.meta.url);

const source = await fs.readFile(sourcePath, 'utf8');
const bad = "const EXCLUDE_RE = /tv|television|laptop|phone|smartphone|camera|mattress|vpn|gaming monitor/i;";
const fixed = "const EXCLUDE_RE = /\\btv\\b|\\btelevision\\b|\\blaptop\\b|\\b(?:smart)?phone\\b|\\bcamera\\b|\\bmattress\\b|\\bvpn\\b|gaming monitor/i;";

if (!source.includes(bad)) {
  throw new Error('Expected EXCLUDE_RE line was not found');
}

await fs.writeFile(patchedPath, source.replace(bad, fixed));
try {
  await import('./.fetch-articles-runtime.js');
} finally {
  await fs.rm(patchedPath, { force: true });
}
