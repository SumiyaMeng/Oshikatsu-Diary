#!/usr/bin/env node
/**
 * Merges freshly read calendar rows into a group feed in public/feeds/.
 *
 *   node scripts/update-feed.mjs <feed id> <rows.json> [--from YYYY-MM-DD --to YYYY-MM-DD]
 *
 * rows.json is an array of { date, end?, title, venue?, open?, start?, kind?, source? }.
 * Rows from the calendar replace what the feed had for the same day and title; venue and times
 * already in the feed are kept when the new row leaves them out. With --from/--to, calendar events
 * in that window that are missing from rows.json are dropped (they were deleted or moved).
 * Birthday markers, trip markers (遠征), cancellations and other non-events are filtered out here,
 * so the reader can pass everything it sees.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'feeds');
const [id, rowsPath, ...rest] = process.argv.slice(2);
if (!id || !rowsPath) {
  console.error('usage: update-feed.mjs <feed id> <rows.json> [--from D --to D]');
  process.exit(1);
}
const opt = (k) => {
  const i = rest.indexOf(k);
  return i >= 0 ? rest[i + 1] : undefined;
};
const from = opt('--from'),
  to = opt('--to');

const file = join(dir, `${id}.json`);
const feed = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { id, group: id, events: [], skip: [] };
const nfkc = (s) => (s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const squash = (s) => nfkc(s).replace(/\s/g, '');
const key = (e) => `${e.date}|${squash(e.title)}`;

/** Things on the calendar that aren't events you go to. */
function skip(title) {
  const t = nfkc(title);
  if ((feed.skip ?? []).some((s) => squash(t) === squash(s))) return true;
  if (/誕生日/.test(t) && !/生誕|サイン|チェキ/.test(t)) return true;
  if (/🎂/.test(t) && !/生誕/.test(t)) return true;
  if (/✨/.test(t)) return true;
  if (/^.{0,8}遠征$/.test(t.replace(/[【】\[\]]/g, ''))) return true;
  if (/休演|中止|延期|結成日|見学|ラジオ|radio|お礼配信/i.test(t)) return true;
  return false;
}

/** "(11/22–11/23)" at the end of a title becomes the end date. */
function range(row) {
  const t = nfkc(row.title);
  const m = t.match(/\s*[(（]\s*(\d{1,2})\/(\d{1,2})\s*[–\-~〜]\s*(?:(\d{1,2})\/)?(\d{1,2})\s*[)）]\s*$/);
  if (!m) return row;
  const y = +row.date.slice(0, 4);
  const sm = +m[1],
    em = m[3] ? +m[3] : sm;
  const end = `${em < sm ? y + 1 : y}-${String(em).padStart(2, '0')}-${String(+m[4]).padStart(2, '0')}`;
  return { ...row, title: t.slice(0, t.length - m[0].length).trim(), end: row.end ?? (end > row.date ? end : undefined) };
}

const sign = (t) => /ネットサイン|ネットチェキ|オンラインサイン|オンラインチェキ|サイン会/.test(nfkc(t));

const rows = JSON.parse(readFileSync(rowsPath, 'utf8'))
  .map((r) => range({ ...r, title: nfkc(r.title) }))
  .filter((r) => r.date && r.title && !skip(r.title));

const byKey = new Map(feed.events.map((e) => [key(e), e]));
const seen = new Set();
let added = 0,
  changed = 0;
for (const r of rows) {
  const k = key(r);
  if (seen.has(k)) continue;
  seen.add(k);
  const old = byKey.get(k);
  const next = {
    date: r.date,
    ...(r.end && r.end > r.date ? { end: r.end } : {}),
    title: r.title,
    ...((r.venue || old?.venue) ? { venue: nfkc(r.venue || old.venue) } : {}),
    ...((r.open || old?.open) ? { open: r.open || old.open } : {}),
    ...((r.start || old?.start) ? { start: r.start || old.start } : {}),
    kind: r.kind ?? old?.kind ?? (sign(r.title) ? 'sign' : 'event'),
    ...((r.etype || old?.etype) ? { etype: r.etype || old.etype } : {}),
    source: r.source ?? old?.source ?? 'timetree',
  };
  if (!old) added++;
  else if (JSON.stringify(old) !== JSON.stringify(next)) changed++;
  byKey.set(k, next);
}
let removed = 0;
if (from && to)
  for (const [k, e] of byKey)
    if (e.source === 'timetree' && e.date >= from && e.date <= to && !seen.has(k)) {
      byKey.delete(k);
      removed++;
    }

feed.events = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
feed.updated = new Date().toISOString();
writeFileSync(file, JSON.stringify(feed, null, 1) + '\n');

const indexFile = join(dir, 'index.json');
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : { calendars: [] };
const entry = index.calendars.find((c) => c.id === id);
const meta = { id, group: feed.group, source: feed.source, url: feed.url, updated: feed.updated, count: feed.events.length };
if (entry) Object.assign(entry, meta);
else index.calendars.push(meta);
writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
console.log(`${id}: ${feed.events.length} events (+${added} new, ${changed} changed, -${removed} removed)`);
