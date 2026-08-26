import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';

const DAYS = Number(process.env.DAYS || 30);
const now = dayjs();
const cutoff = now.subtract(DAYS, 'day');

const currentMonth = now.format('YYYY/MM');
const previousMonth = now.subtract(1, 'month').format('YYYY/MM');

const sources = [
  {
    name: 'What Hi-Fi?',
    base: 'https://www.whathifi.com/',
    hosts: ['www.whathifi.com'],
    listingUrls: [
      `https://www.whathifi.com/archive/${currentMonth}`,
      `https://www.whathifi.com/archive/${previousMonth}`,
      'https://www.whathifi.com/news',
      'https://www.whathifi.com/headphones',
      'https://www.whathifi.com/headphones/wireless-earbuds',
      'https://www.whathifi.com/headphones/wireless-headphones',
      'https://www.whathifi.com/hi-fi',
      'https://www.whathifi.com/hi-fi/speakers',
      'https://www.whathifi.com/hi-fi/turntables',
      'https://www.whathifi.com/hi-fi/dacs',
      'https://www.whathifi.com/home-cinema/soundbars'
    ],
    feedUrls: ['https://www.whathifi.com/feeds/all'],
    sitemapUrls: ['https://www.whathifi.com/sitemap.xml']
  },
  {
    name: 'TechRadar',
    base: 'https://www.techradar.com/',
    hosts: ['www.techradar.com'],
    listingUrls: [
      'https://www.techradar.com/audio',
      'https://www.techradar.com/audio/headphones',
      'https://www.techradar.com/audio/earbuds-airpods',
      'https://www.techradar.com/audio/speakers',
      'https://www.techradar.com/audio/hi-fi',
      'https://www.techradar.com/audio/soundbars'
    ],
    feedUrls: ['https://www.techradar.com/feeds/tag/audio'],
    sitemapUrls: ['https://www.techradar.com/sitemap.xml']
  },
  {
    name: 'SoundGuys',
    base: 'https://www.soundguys.com/',
    hosts: ['www.soundguys.com'],
    listingUrls: [
      'https://www.soundguys.com/earbuds-headphones/',
      'https://www.soundguys.com/speakers/',
      'https://www.soundguys.com/news/',
      'https://www.soundguys.com/reviews/'
    ],
    feedUrls: ['https://www.soundguys.com/feed/'],
    sitemapUrls: ['https://www.soundguys.com/sitemap_index.xml', 'https://www.soundguys.com/sitemap.xml'],
    soundguys: true
  },
  {
    name: "Tom's Guide",
    base: 'https://www.tomsguide.com/',
    hosts: ['www.tomsguide.com'],
    listingUrls: [
      'https://www.tomsguide.com/audio',
      'https://www.tomsguide.com/audio/headphones',
      'https://www.tomsguide.com/audio/earbuds',
      'https://www.tomsguide.com/audio/over-ear-headphones',
      'https://www.tomsguide.com/audio/speakers',
      'https://www.tomsguide.com/audio/soundbars'
    ],
    feedUrls: ['https://www.tomsguide.com/feeds/all'],
    sitemapUrls: ['https://www.tomsguide.com/sitemap.xml']
  }
];

const AUDIO_RE = /headphone|headphones|earbud|earbuds|airpods|speaker|speakers|bluetooth|audio|hi-fi|hifi|dac|amplifier|amp\b|turntable|vinyl|soundbar|receiver|streamer|stereo|subwoofer|iems?\b|music/i;
const EXCLUDE_RE = /tv|television|laptop|phone|smartphone|camera|mattress|vpn|gaming monitor/i;
const NON_ARTICLE_PATH_RE = /^\/$|\/author\/|\/category\/|\/tag\/|\/about\/?$|\/contact\/?$|\/audio\/?$|\/hi-fi\/?$|\/headphones\/?$|\/speakers\/?$|\/streaming-entertainment\/?$/i;

function category(text) {
  const s = text.toLowerCase();
  if (/headphone|headphones|earbud|earbuds|airpods|iems?\b/.test(s)) return '耳機';
  if (/soundbar/.test(s)) return 'Soundbar';
  if (/speaker|speakers|subwoofer/.test(s)) return '喇叭';
  if (/turntable|vinyl|phono/.test(s)) return '黑膠／唱盤';
  if (/dac|amplifier|\bamp\b|receiver/.test(s)) return 'DAC／擴大機';
  if (/streamer|streaming/.test(s)) return '串流播放器';
  return '其他音訊';
}

function articleType(title, url, description='') {
  const s = `${title} ${url} ${description}`.toLowerCase();
  if (/\breview\b|\breviews\b|hands-on|hands on|tested|test verdict|our verdict|we test|full review|i tested/.test(s)) return '評測';
  if (/\bnews\b|announc|launch|unveil|release|revealed|new model|new headphones|new earbuds|new speaker|coming soon|preorder|pre-order|leak|confirms|debut/.test(s)) return '新聞';
  return '其他';
}

function parseDate(raw) {
  if (!raw) return null;
  const d = dayjs(raw);
  return d.isValid() ? d : null;
}

function sameHost(link, hosts) {
  try { return hosts.includes(new URL(link).host); } catch { return false; }
}

function looksLikeArticleUrl(link, source) {
  try {
    const u = new URL(link);
    const path = u.pathname.replace(/\/$/, '') || '/';
    if (NON_ARTICLE_PATH_RE.test(`${path}/`) || NON_ARTICLE_PATH_RE.test(path)) return false;
    const parts = path.split('/').filter(Boolean);
    const last = parts.at(-1) || '';
    if (source.soundguys) return /^.+-\d{4,}$/.test(last);
    return parts.length >= 2 && last.length >= 8 && /-/.test(last);
  } catch { return false; }
}

function likelyAudioUrl(url, source) {
  if (source.soundguys) return true;
  return AUDIO_RE.test(url);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; AudioContentSearcher/2.0; +https://github.com/teegar07/audio-content-searcher)',
      'accept-language': 'en-US,en;q=0.9'
    },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

function addCandidate(map, source, url, title='') {
  try {
    const clean = new URL(url, source.base).href.split('#')[0];
    if (!sameHost(clean, source.hosts) || !looksLikeArticleUrl(clean, source)) return;
    if (!likelyAudioUrl(clean, source) && !AUDIO_RE.test(title)) return;
    if (title && EXCLUDE_RE.test(title)) return;
    const previous = map.get(clean);
    if (!previous || (!previous.title && title)) map.set(clean, { url: clean, title });
  } catch {}
}

function extractHtmlCandidates(html, source, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('a[href]').each((_, el) => {
    const a = $(el);
    const title = a.text().replace(/\s+/g, ' ').trim();
    if (title.length < 8) return;
    try { out.push({ url: new URL(a.attr('href'), baseUrl).href, title }); } catch {}
  });
  return out;
}

function extractFeedCandidates(xml, source) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  $('item, entry').each((_, el) => {
    const node = $(el);
    const title = node.find('title').first().text().trim();
    const link = node.find('link').first().attr('href') || node.find('link').first().text().trim();
    const date = node.find('pubDate, published, updated').first().text().trim();
    const d = parseDate(date);
    if (d && d.isBefore(cutoff)) return;
    if (link) out.push({ url: link, title });
  });
  return out;
}

function parseSitemap(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = [];
  $('url').each((_, el) => {
    const node = $(el);
    urls.push({ loc: node.find('loc').first().text().trim(), lastmod: node.find('lastmod').first().text().trim() });
  });
  const sitemaps = [];
  $('sitemap').each((_, el) => {
    const node = $(el);
    sitemaps.push({ loc: node.find('loc').first().text().trim(), lastmod: node.find('lastmod').first().text().trim() });
  });
  return { urls, sitemaps };
}

function usefulSitemap(loc) {
  const s = loc.toLowerCase();
  return /post|article|news|review|content|audio|2026|sitemap/.test(s);
}

async function discoverFromSitemaps(source, candidateMap) {
  const queue = [...source.sitemapUrls];
  const seen = new Set();
  let fetched = 0;
  while (queue.length && fetched < 18) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);
    try {
      const xml = await fetchText(sitemapUrl);
      fetched++;
      const parsed = parseSitemap(xml);
      for (const item of parsed.urls) {
        const d = parseDate(item.lastmod);
        if (d && d.isBefore(cutoff.subtract(3, 'day'))) continue;
        addCandidate(candidateMap, source, item.loc);
      }
      const children = parsed.sitemaps
        .filter(x => usefulSitemap(x.loc))
        .sort((a,b) => String(b.lastmod).localeCompare(String(a.lastmod)))
        .slice(0, 12);
      for (const child of children) if (!seen.has(child.loc)) queue.push(child.loc);
    } catch (e) {
      console.warn(`Sitemap failed ${sitemapUrl}: ${e.message}`);
    }
  }
}

async function discoverSource(source) {
  const candidateMap = new Map();

  for (const feedUrl of source.feedUrls) {
    try {
      const xml = await fetchText(feedUrl);
      for (const c of extractFeedCandidates(xml, source)) addCandidate(candidateMap, source, c.url, c.title);
    } catch (e) {
      console.warn(`Feed failed ${feedUrl}: ${e.message}`);
    }
  }

  await discoverFromSitemaps(source, candidateMap);

  for (const listingUrl of source.listingUrls) {
    try {
      const html = await fetchText(listingUrl);
      for (const c of extractHtmlCandidates(html, source, listingUrl)) addCandidate(candidateMap, source, c.url, c.title);
    } catch (e) {
      console.warn(`Listing failed ${listingUrl}: ${e.message}`);
    }
  }

  return [...candidateMap.values()].slice(0, 500);
}

function extractMeta(html) {
  const $ = cheerio.load(html);
  const get = (...sels) => {
    for (const sel of sels) {
      const v = $(sel).first().attr('content') || $(sel).first().attr('datetime') || $(sel).first().text();
      if (v?.trim()) return v.trim();
    }
    return '';
  };
  let date = get('meta[property="article:published_time"]','meta[name="pub_date"]','meta[name="parsely-pub-date"]','meta[name="date"]','time[datetime]');
  let image = get('meta[property="og:image"]','meta[name="twitter:image"]');
  let description = get('meta[property="og:description"]','meta[name="description"]');
  let author = get('meta[name="author"]');
  let pageType = get('meta[property="og:type"]');
  let headline = get('meta[property="og:title"]');
  let schemaTypes = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).text());
      const nodes = Array.isArray(j) ? j : j['@graph'] || [j];
      for (const n of nodes) {
        const types = Array.isArray(n?.['@type']) ? n['@type'] : [n?.['@type']];
        schemaTypes.push(...types.filter(Boolean));
        if (!date && n?.datePublished) date = n.datePublished;
        if (!headline && n?.headline) headline = n.headline;
        if (!image) image = typeof n?.image === 'string' ? n.image : n?.image?.url || n?.image?.[0]?.url;
        if (!description && n?.description) description = n.description;
        if (!author) author = Array.isArray(n?.author) ? n.author.map(x => x.name).filter(Boolean).join(', ') : n?.author?.name;
      }
    } catch {}
  });
  return { date, image, description, author, pageType, schemaTypes, headline };
}

function hasArticleMetadata(meta, source) {
  const types = meta.schemaTypes.map(String).join(' ').toLowerCase();
  if (meta.pageType.toLowerCase() === 'article' || /article|newsarticle|review|reportage/.test(types)) return true;
  return Boolean(meta.date && (source.soundguys || meta.headline));
}

async function collectSource(source) {
  console.log(`Fetching ${source.name}`);
  const candidates = await discoverSource(source);
  console.log(`${source.name}: ${candidates.length} discovered article URLs`);
  const articles = [];

  for (const c of candidates) {
    try {
      const html = await fetchText(c.url);
      const meta = extractMeta(html);
      if (!hasArticleMetadata(meta, source)) continue;
      const d = parseDate(meta.date);
      if (!d || d.isBefore(cutoff) || d.isAfter(now.add(1, 'day'))) continue;
      const title = (meta.headline || c.title || '').replace(/\s+/g, ' ').trim();
      const combined = `${title} ${c.url} ${meta.description || ''}`;
      if (!AUDIO_RE.test(combined) || EXCLUDE_RE.test(title)) continue;
      articles.push({
        source: source.name,
        title,
        url: c.url,
        publishedAt: d.toISOString(),
        author: meta.author || '',
        description: (meta.description || '').replace(/\s+/g, ' ').trim(),
        image: meta.image || '',
        category: category(combined),
        articleType: articleType(title, c.url, meta.description || '')
      });
    } catch (e) {
      console.warn(`Skip ${c.url}: ${e.message}`);
    }
  }

  console.log(`${source.name}: kept ${articles.length} articles`);
  return articles;
}

const all = [];
for (const source of sources) {
  try { all.push(...await collectSource(source)); }
  catch (e) { console.error(`${source.name} failed: ${e.message}`); }
}

const deduped = [...new Map(all.map(x => [x.url.replace(/\/$/, ''), x])).values()]
  .sort((a,b) => new Date(b.publishedAt) - new Date(a.publishedAt));

await fs.mkdir('data', { recursive: true });
await fs.writeFile('data/articles.json', JSON.stringify({ generatedAt: new Date().toISOString(), days: DAYS, count: deduped.length, articles: deduped }, null, 2));
console.log(`Saved ${deduped.length} articles.`);
