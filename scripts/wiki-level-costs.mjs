// Fills the file of shipped great building level costs (src/content/data/gb-level-costs.json) from the German FoE wiki.
// Not part of the extension. Usage, from the repo root:
//   node scripts/wiki-level-costs.mjs            fetch what is not cached yet, check, write the file
//   node scripts/wiki-level-costs.mjs --dry-run  the same without writing the file
//   node scripts/wiki-level-costs.mjs --refresh  fetch every page again, ignoring the cache
//
// The list "Legendäre Bauwerke" of the wiki names every great building with the picture of the game asset
// (X_SS_<era>_<name>), which gives the game id (X_<era>_<name>); the page of each building must show the same asset.
// The table of a building page has the columns "Stufe" and "Benötigt" (Forge point icon): wiki Stufe n is the cost of
// our level n - 1. A page is taken only when its levels 0 to 9 are linear (k, 2k, ... 10k) and its levels from 10 fit
// the cost model of gb-level-cost.ts (one integer step per segment, 1.05 at level 100); otherwise it is skipped whole.
// The wiki rows of a building replace its rows in the file, thinned like the export (`seedRows`); buildings the wiki
// does not cover keep their rows. Every difference between a wiki value and a row of the file is printed.
//
// Node runs gb-level-cost.ts directly (type stripping), so the check and the thinning are the ones of the extension.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { learnSteps, seedJson, seedRows } from '../src/content/domain/gb-level-cost.ts';

const WIKI = 'https://de.wiki.forgeofempires.com';
const LIST_TITLE = 'Legend%C3%A4re_Bauwerke';
const USER_AGENT = 'Mozilla/5.0 (compatible; wiki-table-reader)';
const DELAY_MS = 1500;
const CACHE = '.cache/wiki-level-costs';
const FILE = 'src/content/data/gb-level-costs.json';

const dryRun = process.argv.includes('--dry-run');
const refresh = process.argv.includes('--refresh');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let fetched = 0;

/** the HTML of a wiki page, from the cache unless asked to refresh; sequential with a pause between fetches */
async function page(title) {
  const path = join(CACHE, `${decodeURIComponent(title).replace(/[^\w.-]/g, '_')}.html`);
  if (!refresh) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      // not cached yet
    }
  }
  if (fetched > 0) await sleep(DELAY_MS);
  fetched++;
  const response = await fetch(`${WIKI}/index.php?title=${title}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${title}: HTTP ${response.status}`);
  const html = await response.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(path, html);
  return html;
}

const text = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const assetId = (html) => html.match(/assets\/city\/buildings\/X_SS_([A-Za-z]+_[A-Za-z0-9]+)-/)?.[1];

/** the great buildings of the wiki list: game id, page title (as linked) and name */
function buildings(html) {
  const start = html.indexOf('id="Liste_der_Legendären_Bauwerke"');
  if (start < 0) throw new Error('list of great buildings not found');
  const table = html.slice(start, html.indexOf('</table>', start));
  const result = [];
  for (const row of table.split('<tr').slice(1)) {
    if (!row.includes('<td')) continue;
    const link = row.match(/<a href="\/index\.php\?title=([^"#&]+)" title="([^"]+)"/);
    const id = assetId(row);
    result.push({ type: id && `X_${id}`, title: link?.[1], name: link?.[2] ?? text(row).slice(0, 40) });
  }
  return result;
}

/** the cells of a table row: [tag, html] with colspan expanded */
function cells(row) {
  const out = [];
  for (const m of row.matchAll(/<(th|td)([^>]*)>([\s\S]*?)(?=<t[hd][\s>]|$)/g)) {
    const span = Number(m[2].match(/colspan="(\d+)"/)?.[1] ?? 1);
    for (let i = 0; i < span; i++) out.push([m[1], m[3]]);
  }
  return out;
}

/** the Forge point cost per wiki Stufe from the table with the columns "Stufe" and "Benötigt" */
function costTable(html) {
  for (const [, table] of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const rows = table.split(/<tr[^>]*>/).slice(1);
    const header = rows.map(cells).find((c) => c.length > 0 && c.every(([tag]) => tag === 'th'));
    if (!header) continue;
    const levelColumn = header.findIndex(([, h]) => text(h) === 'Stufe');
    const costColumn = header.findIndex(([, h]) => text(h).startsWith('Benötigt') && h.includes('strategy_points'));
    if (levelColumn < 0 || costColumn < 0) continue;
    const costs = new Map();
    for (const row of rows) {
      const c = cells(row);
      if (c.length === 0 || c[0][0] !== 'td') continue;
      const stufe = Number(text(c[levelColumn]?.[1] ?? '').replace(/\./g, ''));
      const fp = Number(text(c[costColumn]?.[1] ?? '').replace(/\./g, ''));
      if (!Number.isInteger(stufe) || !Number.isInteger(fp) || stufe < 1 || fp <= 0)
        throw new Error(`unreadable row: ${text(row).slice(0, 60)}`);
      if (costs.has(stufe) && costs.get(stufe) !== fp) throw new Error(`Stufe ${stufe} twice with other costs`);
      costs.set(stufe, fp);
    }
    return costs;
  }
  return undefined;
}

/** our levels (wiki Stufe - 1) if the page fits the cost model, else the reason it does not */
function check(costs) {
  const levels = new Map([...costs].map(([stufe, fp]) => [stufe - 1, fp]).sort((a, b) => a[0] - b[0]));
  const first = Array.from({ length: 10 }, (_, level) => levels.get(level));
  if (first.some((fp) => fp === undefined)) return { reason: 'levels 0 to 9 incomplete' };
  const k = first[0];
  const linear = first.every((fp, level) => fp === k * (level + 1));
  if (!linear) return { reason: `levels 0 to 9 not linear: ${first.join(', ')}`, first };
  const max = Math.max(...levels.keys());
  for (let level = 0; level <= max; level++) if (!levels.has(level)) return { reason: `level ${level} missing` };
  const disabled = learnSteps(first, levels).filter((s) => s.disabled);
  if (disabled.length > 0) {
    const where = disabled.map((s) => `${s.first} to ${s.last === Number.POSITIVE_INFINITY ? 'end' : s.last}`);
    return { reason: `no single integer step in levels ${where.join(', ')}`, first };
  }
  return { levels, k, max };
}

const existing = JSON.parse(await readFile(FILE, 'utf8'));
const list = buildings(await page(LIST_TITLE));
console.log(`wiki list: ${list.length} great buildings`);

const wiki = new Map();
const skipped = [];
const unmapped = [];
for (const b of list) {
  if (!b.type || !b.title) {
    unmapped.push(`${b.name}: ${b.type ? 'no page link' : 'no game asset in the list'}`);
    continue;
  }
  const html = await page(b.title);
  const own = assetId(html);
  if (own && `X_${own}` !== b.type) {
    unmapped.push(`${b.name}: list says ${b.type}, page shows X_${own}`);
    continue;
  }
  const costs = costTable(html);
  if (!costs) {
    skipped.push(`${b.type} ${b.name}: no cost table`);
    continue;
  }
  const result = check(costs);
  if (result.reason) {
    skipped.push(`${b.type} ${b.name}: ${result.reason}`);
    continue;
  }
  console.log(`  ok ${b.type} ${b.name}: levels 0 to ${result.max}, k = ${result.k}`);
  wiki.set(b.type, result.levels);
}

const conflicts = [];
const dropped = [];
for (const r of existing) {
  const levels = wiki.get(r.type);
  if (!levels) continue;
  const fp = levels.get(r.level);
  if (fp === undefined) dropped.push(`${r.type} level ${r.level}: ${r.fp} (beyond the wiki)`);
  else if (fp !== r.fp) conflicts.push(`${r.type} level ${r.level}: file ${r.fp}, wiki ${fp}`);
}

const kept = existing.filter((r) => !wiki.has(r.type));
const byType = (a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.level - b.level);
const rows = [...seedRows(wiki), ...kept].sort(byType);

console.log(`\npages fetched: ${fetched}, buildings accepted: ${wiki.size}, skipped: ${skipped.length}`);
for (const s of skipped) console.log(`  skipped ${s}`);
if (unmapped.length > 0) console.log(`not mapped: ${unmapped.length}`);
for (const u of unmapped) console.log(`  ${u}`);
console.log(`conflicts with the file (the wiki wins): ${conflicts.length}`);
for (const c of conflicts) console.log(`  ${c}`);
if (dropped.length > 0) console.log(`rows of the file the wiki replaces without a value: ${dropped.length}`);
for (const d of dropped) console.log(`  ${d}`);
const notInWiki = [...new Set(kept.map((r) => r.type))];
console.log(`types kept from the file (not in the wiki or skipped): ${notInWiki.join(', ') || 'none'}`);
console.log(`rows: ${existing.length} before, ${rows.length} after`);

if (dryRun) console.log('dry run, file not written');
else {
  await writeFile(FILE, seedJson(rows));
  console.log(`written ${FILE}`);
}
