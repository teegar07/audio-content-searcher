import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';

const DAYS = Number(process.env.DAYS || 30);
const now = dayjs();
const cutoff = now.subtract(DAYS, 'day');

const sources = [
  { name: 'What Hi-Fi?', url: 'https://www.whathifi.com/', hosts: ['www.whathifi.com'] },
  { name: 'TechRadar', url: 'https://www.techradar.com/audio', hosts: ['www.techradar.com'] },
  { name: 'SoundGuys', url: 'https://www.soundguys.com/', hosts: ['www.soundguys.com'] },
  { name: "Tom's Guide", url: 'https://www.tomsguide.com/audio', hosts: ['www.tomsguide.com'] }
];

const AUDIO_RE = /headphone|headphones|earbud|earbuds|airpods|speaker|speakers|bluetooth|audio|hi-fi|hifi|dac|amplifier|amp\b|turntable|vinyl|soundbar|receiver|streamer|stereo|subwoofer|iems?\b|music/i;
const EXCLUDE_RE = /tv|television|laptop|phone|smartphone|camera|mattress|vpn|gaming monitor/i;

function category(text) {
  const s = text.toLowerCase();
  if (/earbud|earbuds|airpods|iems?\b/.test(s)) return '耳塞／真無線';
  if (/headphone|headphones/.test(s)) return '耳機';
  if (/soundbar/.test(s)) return 'Soundbar';
  if (/speaker|speakers|subwoofer/.test(s)) return '喇叭';
  if (/turntable|vinyl|phono/.test(s)) return '黑膠／唱盤';
  if (/dac|amplifier|\bamp\b|receiver/.test(s)) return 'DAC／擴大機';
  if (/streamer|streaming/.test(s)) return '串流播放器';
  return '其他音訊';
}

function parseDate(raw) {
  if (!raw) return null;
  const d = dayjs(raw);
  return d.isValid() ? d : null;
}

function sameHost(link, hosts) {
  try { return hosts.includes(new URL(link).host); } catch { return false; }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; AudioContentSearcher/1.0; +https://github.com/)',
      'accept-language': 'en-US,en;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

function extractCandidates(html, source) {
  const $ = cheerio.load(html);
  const out = new Map();
  $('a[href]').each((_, el) => {
    const a = $(el);
    const title = a.text().replace(/\s+/g, ' ').trim();
    if (title.length < 25) return;
    let href;
    try { href = new URL(a.attr('href'), source.url).href.split('#')[0]; } catch { return; }
    if (!sameHost(href, source.hosts)) return;
    const text = `${title} ${href}`;
    if (!AUDIO_RE.test(text) || EXCLUDE_RE.test(title)) return;
    if (!out.has(href)) out.set(href, { title, url: href });
  });
  return [...out.values()].slice(0, 120);
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
  let date = get('meta[property="article:published_time"]','meta[name="pub_date"]','meta[name="parsely-pub-date"]','time[datetime]');
  let image = get('meta[property="og:image"]','meta[name="twitter:image"]');
  let description = get('meta[property="og:description"]','meta[name="description"]');
  let author = get('meta[name="author"]');

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).text());
      const nodes = Array.isArray(j) ? j : j['@graph'] || [j];
      for (const n of nodes) {
        if (!date && n?.datePublished) date = n.datePublished;
        if (!image) image = typeof n?.image === 'string' ? n.image : n?.image?.url || n?.image?.[0]?.url;
        if (!description && n?.description) description = n.description;
        if (!author) author = Array.isArray(n?.author) ? n.author.map(x => x.name).filter(Boolean).join(', ') : n?.author?.name;
      }
    } catch {}
  });
  return { date, image, description, author };
}

async function collectSource(source) {
  console.log(`Fetching ${source.name}: ${source.url}`);
  const listing = await fetchText(source.url);
  const candidates = extractCandidates(listing, source);
  const articles = [];
  for (const c of candidates) {
    try {
      const html = await fetchText(c.url);
      const meta = extractMeta(html);
      const d = parseDate(meta.date);
      if (!d || d.isBefore(cutoff) || d.isAfter(now.add(1, 'day'))) continue;
      const combined = `${c.title} ${meta.description || ''}`;
      if (!AUDIO_RE.test(combined)) continue;
      articles.push({
        source: source.name,
        title: c.title,
        url: c.url,
        publishedAt: d.toISOString(),
        author: meta.author || '',
        description: (meta.description || '').replace(/\s+/g, ' ').trim(),
        image: meta.image || '',
        category: category(combined)
      });
    } catch (e) {
      console.warn(`Skip ${c.url}: ${e.message}`);
    }
  }
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
