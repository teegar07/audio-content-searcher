import fs from 'node:fs/promises';

const sourcePath = new URL('./fetch-articles-v3.js', import.meta.url);
const patchedPath = new URL('./.fetch-articles-runtime.js', import.meta.url);

const source = await fs.readFile(sourcePath, 'utf8');
const bad = "const EXCLUDE_RE = /tv|television|laptop|phone|smartphone|camera|mattress|vpn|gaming monitor/i;";
const fixed = "const EXCLUDE_RE = /\\btv\\b|\\btelevision\\b|\\blaptop\\b|\\b(?:smart)?phone\\b|\\bcamera\\b|\\bmattress\\b|\\bvpn\\b|gaming monitor/i;";

if (!source.includes(bad)) {
  throw new Error('Expected EXCLUDE_RE line was not found');
}

const marker = 'const sources = [';
if (!source.includes(marker)) {
  throw new Error('Expected sources array was not found');
}

const extraSources = `const sources = [
  {
    name: 'BGR',
    base: 'https://www.bgr.com/',
    hosts: ['www.bgr.com', 'bgr.com'],
    listingUrls: [
      'https://www.bgr.com/sitemap/',
      \`https://www.bgr.com/sitemap/\${now.format('YYYY/MM')}/\`,
      \`https://www.bgr.com/sitemap/\${now.subtract(1, 'month').format('YYYY/MM')}/\`
    ],
    feedUrls: ['https://www.bgr.com/feed/'],
    sitemapUrls: ['https://www.bgr.com/sitemap.xml']
  },
  {
    name: 'Android Authority',
    base: 'https://www.androidauthority.com/',
    hosts: ['www.androidauthority.com', 'androidauthority.com'],
    listingUrls: [
      'https://www.androidauthority.com/audio/',
      'https://www.androidauthority.com/earbuds-headphones/',
      'https://www.androidauthority.com/tag/earbuds/',
      'https://www.androidauthority.com/reviews/'
    ],
    feedUrls: ['https://www.androidauthority.com/feed/'],
    sitemapUrls: ['https://www.androidauthority.com/sitemap_index.xml', 'https://www.androidauthority.com/sitemap.xml']
  },
  {
    name: 'Notebookcheck',
    base: 'https://www.notebookcheck.net/',
    hosts: ['www.notebookcheck.net', 'notebookcheck.net'],
    listingUrls: [
      'https://www.notebookcheck.net/News.152.0.html',
      'https://www.notebookcheck.net/Reviews.55.0.html'
    ],
    feedUrls: ['https://www.notebookcheck.net/RSS-Feed-Notebookcheck.8156.0.html'],
    sitemapUrls: ['https://www.notebookcheck.net/sitemap.xml']
  },
  {
    name: 'The Verge',
    base: 'https://www.theverge.com/',
    hosts: ['www.theverge.com', 'theverge.com'],
    listingUrls: [
      'https://www.theverge.com/audio',
      'https://www.theverge.com/tech'
    ],
    feedUrls: ['https://www.theverge.com/rss/index.xml'],
    sitemapUrls: ['https://www.theverge.com/sitemaps/sitemap.xml', 'https://www.theverge.com/sitemap.xml']
  },
  {
    name: 'Android Headlines',
    base: 'https://www.androidheadlines.com/',
    hosts: ['www.androidheadlines.com', 'androidheadlines.com'],
    listingUrls: [
      'https://www.androidheadlines.com/category/audio',
      'https://www.androidheadlines.com/category/reviews'
    ],
    feedUrls: ['https://www.androidheadlines.com/feed'],
    sitemapUrls: ['https://www.androidheadlines.com/sitemap_index.xml', 'https://www.androidheadlines.com/sitemap.xml']
  },
  {
    name: 'Engadget',
    base: 'https://www.engadget.com/',
    hosts: ['www.engadget.com', 'engadget.com'],
    listingUrls: [
      'https://www.engadget.com/audio/',
      'https://www.engadget.com/audio/headphones/',
      'https://www.engadget.com/audio/speakers/',
      'https://www.engadget.com/category/headphones-reviews/',
      \`https://www.engadget.com/sitemap/\${now.format('YYYY/MM')}/\`,
      \`https://www.engadget.com/sitemap/\${now.subtract(1, 'month').format('YYYY/MM')}/\`
    ],
    feedUrls: ['https://www.engadget.com/rss.xml'],
    sitemapUrls: ['https://www.engadget.com/sitemap.xml']
  },`;

const patched = source
  .replace(bad, fixed)
  .replace(marker, extraSources);

await fs.writeFile(patchedPath, patched);
try {
  await import('./.fetch-articles-runtime.js');
} finally {
  await fs.rm(patchedPath, { force: true });
}
