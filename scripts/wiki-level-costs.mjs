// Fills the file of shipped great building level costs (src/content/data/gb-level-costs.json) from the German FoE wiki.
// Not part of the extension. Usage, from the repo root:
//   node scripts/wiki-level-costs.mjs            fetch what is not cached yet, check, write the file
//   node scripts/wiki-level-costs.mjs --dry-run  the same without writing the file
//   node scripts/wiki-level-costs.mjs --refresh  fetch every page again, ignoring the cache
//
// The list "Legendäre Bauwerke" of the wiki names every great building with the picture of the game asset
// (X_SS_<era>_<name>), which gives the game id (X_<era>_<name>); the page of each building must show the same asset.
// The table of a building page has the columns "Stufe" and "Benötigt" (Forge point icon): wiki Stufe n is the cost of
// our level n - 1. A page is taken, with all its levels, when its levels are gap free and its levels 0 to 9 are linear
// (k, 2k, ... 10k); otherwise it is skipped whole. A taken page whose levels from 10 do not fit the cost model below
// (one integer step per segment, 1.05 at level 100) is only reported: the extension computes nothing, it takes the
// values of the file as they are. The wiki levels of a building replace its levels in the file; buildings the wiki does
// not cover keep theirs. Every difference between a wiki value and a value of the file is printed.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const WIKI = 'https://de.wiki.forgeofempires.com';
const LIST_TITLE = 'Legend%C3%A4re_Bauwerke';
const USER_AGENT = 'Mozilla/5.0 (compatible; wiki-table-reader)';
const DELAY_MS = 1500;
const CACHE = '.cache/wiki-level-costs';
const FILE = 'src/content/data/gb-level-costs.json';

const dryRun = process.argv.includes('--dry-run');
const refresh = process.argv.includes('--refresh');

// The cost model, checked against the game on 2026-11-05 (Arche, Zeusstatue, Galataturm, Die blaue Galaxie), a check of
// the wiki pages only: from level 10 on each level costs the one before plus a step, an integer per type and segment of
// start levels. Level 100 is the exception: it costs level 99 times 1.05, the steps go on from 101. The value stays
// unrounded through the chain and is rounded, halves up, at the end. Values are kept in twentieths, so the 1.05 jump
// stays an exact integer.
const SCALE = 20;
const JUMP_LEVEL = 100;
const JUMP_NUMERATOR = 21;
const round = (scaled) => Math.floor((scaled + SCALE / 2) / SCALE);
/** start levels whose costs grow by one step per level; `base` is the level the steps count from */
const SEGMENTS = [
  { first: 10, last: 39, base: 9 },
  { first: 40, last: 69, base: 39 },
  { first: 70, last: 99, base: 69 },
  { first: JUMP_LEVEL, last: 300, base: JUMP_LEVEL },
  { first: 301, last: 400, base: 300 },
  { first: 401, last: Number.POSITIVE_INFINITY, base: 400 },
];

/**
 * The segments whose levels fit no single integer step; `levels` are gap free from 0. A segment is checked from the
 * exact value the segments before chain to; after a segment that does not fit, from its own first level.
 */
function misfits(levels) {
  const out = [];
  /** the exact value at the end of the segment before, in twentieths */
  let carry = levels.get(9) * SCALE;
  for (const s of SEGMENTS) {
    const rows = [...levels].filter(([level]) => level >= s.first && level <= s.last);
    if (rows.length === 0) break;
    const start = carry === undefined ? undefined : s.first === JUMP_LEVEL ? (carry * JUMP_NUMERATOR) / SCALE : carry;
    const [base, from] = start === undefined ? rows[0] : [s.base, round(start)];
    let step;
    const fits = rows.every(([level, fp]) => {
      const n = level - base;
      if (n === 0) return fp === from;
      // values of a segment share the fraction of its start, so the rounded ones grow by exact steps
      const rise = (fp - from) / n;
      if (!Number.isInteger(rise) || (step !== undefined && rise !== step)) return false;
      step = rise;
      return true;
    });
    if (!fits) out.push(`${s.first} to ${s.last === Number.POSITIVE_INFINITY ? 'end' : s.last}`);
    carry = fits && start !== undefined && step !== undefined ? start + (s.last - s.base) * step * SCALE : undefined;
  }
  return out;
}

/** the file: one line per type without spaces, its levels ascending, the types sorted; the formatter leaves it alone */
function fileJson(seen) {
  const types = [...seen.keys()].filter((type) => seen.get(type).size > 0).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (types.length === 0) return '{}\n';
  const lines = types.map((type) => {
    const levels = [...seen.get(type)].sort((a, b) => a[0] - b[0]);
    return `  ${JSON.stringify(type)}: {${levels.map(([level, fp]) => `"${level}":${fp}`).join(',')}}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

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

/** our levels (wiki Stufe - 1) if the page can be taken, else the reason it cannot; `misfit` names the segments the
 * cost model does not fit */
function check(costs) {
  const levels = new Map([...costs].map(([stufe, fp]) => [stufe - 1, fp]).sort((a, b) => a[0] - b[0]));
  const first = Array.from({ length: 10 }, (_, level) => levels.get(level));
  if (first.some((fp) => fp === undefined)) return { reason: 'levels 0 to 9 incomplete' };
  const k = first[0];
  const linear = first.every((fp, level) => fp === k * (level + 1));
  if (!linear) return { reason: `levels 0 to 9 not linear: ${first.join(', ')}` };
  const max = Math.max(...levels.keys());
  for (let level = 0; level <= max; level++) if (!levels.has(level)) return { reason: `level ${level} missing` };
  return { levels, k, max, misfit: misfits(levels) };
}

const existing = JSON.parse(await readFile(FILE, 'utf8'));
const list = buildings(await page(LIST_TITLE));
console.log(`wiki list: ${list.length} great buildings`);

const wiki = new Map();
const skipped = [];
const whole = [];
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
  if (result.misfit.length > 0)
    whole.push(`${b.type} ${b.name}: no single integer step in levels ${result.misfit.join(', ')}`);
  wiki.set(b.type, result.levels);
}

const conflicts = [];
const dropped = [];
for (const [type, values] of Object.entries(existing)) {
  const levels = wiki.get(type);
  if (!levels) continue;
  for (const [level, fp] of Object.entries(values)) {
    const value = levels.get(Number(level));
    if (value === undefined) dropped.push(`${type} level ${level}: ${fp} (beyond the wiki)`);
    else if (value !== fp) conflicts.push(`${type} level ${level}: file ${fp}, wiki ${value}`);
  }
}

const seen = new Map(wiki);
const kept = Object.keys(existing).filter((type) => !wiki.has(type));
for (const type of kept)
  seen.set(type, new Map(Object.entries(existing[type]).map(([level, fp]) => [Number(level), fp])));
const count = (types) => [...types].reduce((sum, levels) => sum + levels.size, 0);
const before = Object.values(existing).reduce((sum, levels) => sum + Object.keys(levels).length, 0);

console.log(`\npages fetched: ${fetched}, buildings accepted: ${wiki.size}, skipped: ${skipped.length}`);
for (const s of skipped) console.log(`  skipped ${s}`);
console.log(`taken whole, model does not fit: ${whole.length}`);
for (const w of whole) console.log(`  ${w}`);
if (unmapped.length > 0) console.log(`not mapped: ${unmapped.length}`);
for (const u of unmapped) console.log(`  ${u}`);
console.log(`conflicts with the file (the wiki wins): ${conflicts.length}`);
for (const c of conflicts) console.log(`  ${c}`);
if (dropped.length > 0) console.log(`values of the file the wiki replaces without a value: ${dropped.length}`);
for (const d of dropped) console.log(`  ${d}`);
console.log(`types kept from the file (not in the wiki or skipped): ${kept.join(', ') || 'none'}`);
console.log(`values: ${before} before, ${count(seen.values())} after, ${seen.size} types`);

if (dryRun) console.log('dry run, file not written');
else {
  await writeFile(FILE, fileJson(seen));
  console.log(`written ${FILE}`);
}
