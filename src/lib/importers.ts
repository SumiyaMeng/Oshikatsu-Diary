/**
 * Turns pasted text (a TimeTree event shared as text, an X announcement, a monthly schedule)
 * or a calendar file (.ics) into candidate lives the user can pick from.
 */
import { iso } from './format';
import type { Entry } from './types';

export interface Candidate {
  key: string;
  date: string;
  title: string;
  venue: string;
  open?: string;
  start?: string;
  amount?: number;
  etype?: string;
  note?: string;
}

/** Full-width digits and punctuation to ASCII, so ２０２６／１１／２２ and １７：３０ parse. */
export function normalize(s: string): string {
  return s
    .replace(/[０-９Ａ-Ｚａ-ｚ：／．－＠（）]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[〜～]/g, '~')
    .replace(/　/g, ' ');
}

/** Picks the year that puts a month/day closest to today (within half a year either way). */
export function inferYear(m: number, d: number, todayStr: string): number {
  const [ty] = todayStr.split('-').map(Number);
  const t = Date.parse(todayStr);
  let best = ty,
    bestDiff = Infinity;
  for (const y of [ty - 1, ty, ty + 1]) {
    const diff = Math.abs(Date.parse(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`) - t);
    if (diff < bestDiff) (best = y), (bestDiff = diff);
  }
  return best;
}

const valid = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
const ymd = (y: number, m: number, d: number) => iso(new Date(y, m - 1, d));

const RE_FULL = /(20\d{2})\s*[/.\-年]\s*(\d{1,2})\s*[/.\-月]\s*(\d{1,2})\s*日?/;
const RE_MD_WEEKDAY = /(?<![\d:])(\d{1,2})\s*[/.月]\s*(\d{1,2})\s*日?\s*[(（]\s*([月火水木金土日祝]|mon|tue|wed|thu|fri|sat|sun)[^)）]{0,4}[)）]/i;
const RE_MD_KANJI = /(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const RE_MD_START = /^\s*(\d{1,2})\s*[/.]\s*(\d{1,2})(?!\s*[\d:])/;
/** Lines that carry a date but aren't the show itself. */
const NOT_SHOW = /(発売|受付|販売|締切|〆切|応募|抽選|当落|入金|先行|予約開始|一般|申込)/;

export function findDate(line: string, todayStr: string): { date: string; rest: string } | null {
  const s = normalize(line);
  let m = s.match(RE_FULL);
  if (m && valid(+m[2], +m[3])) return { date: ymd(+m[1], +m[2], +m[3]), rest: s.replace(m[0], ' ') };
  for (const re of [RE_MD_WEEKDAY, RE_MD_KANJI, RE_MD_START]) {
    m = s.match(re);
    if (m && valid(+m[1], +m[2])) return { date: ymd(inferYear(+m[1], +m[2], todayStr), +m[1], +m[2]), rest: s.replace(m[0], ' ') };
  }
  return null;
}

const hhmm = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

function findTimes(text: string): { open?: string; start?: string } {
  const s = normalize(text);
  let m = s.match(/OPEN\s*\/\s*START\s*:?\s*(\d{1,2}):(\d{2})\s*\/\s*(\d{1,2}):(\d{2})/i) || s.match(/開場\s*\/\s*開演\s*:?\s*(\d{1,2}):(\d{2})\s*\/\s*(\d{1,2}):(\d{2})/);
  if (m) return { open: hhmm(m[1], m[2]), start: hhmm(m[3], m[4]) };
  const o = s.match(/(?:OPEN|開場)\s*:?\s*(\d{1,2}):(\d{2})/i);
  const st = s.match(/(?:START|開演|開始)\s*:?\s*(\d{1,2}):(\d{2})/i);
  if (o || st) return { open: o ? hhmm(o[1], o[2]) : undefined, start: st ? hhmm(st[1], st[2]) : undefined };
  const any = s.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/);
  return any && +any[1] < 30 ? { start: hhmm(any[1], any[2]) } : {};
}

function findPrice(text: string): number | undefined {
  const s = normalize(text);
  const m = s.match(/(?:前売り?|ADV|adv|チケット|前)\s*:?\s*[¥￥]?\s*([\d,]{3,7})\s*円?/) || s.match(/[¥￥]\s*([\d,]{3,7})/);
  return m ? +m[1].replace(/,/g, '') || undefined : undefined;
}

export function guessType(text: string): string | undefined {
  if (/ワンマン|one\s*man/i.test(text)) return 'oneman';
  if (/リリイベ|リリースイベント|release event/i.test(text)) return 'release';
  if (/フェス|FES(?![a-z])|festival/i.test(text)) return 'fes';
  if (/配信|オンライン|online/i.test(text)) return 'online';
  if (/対バン|主催|出演|ライブ|LIVE/i.test(text)) return 'taiban';
  return undefined;
}

const LABELS = /^(公演決定|出演決定|情報解禁|解禁|告知|お知らせ|追加公演|チケット|ticket|info|INFO|NEWS|news|再掲|スケジュール|schedule)$/;
const JUNK = /^(#|https?:\/\/|RT\b|▼|▽|【?チケット|詳細|※)/;

function findTitle(lines: string[], fallbackRest = ''): string {
  for (const l of lines) {
    const m = l.match(/[「『]([^」』]{2,60})[」』]/);
    if (m) return m[1].trim();
  }
  for (const l of lines) {
    const m = l.match(/【([^】]{2,60})】/);
    if (m && !LABELS.test(m[1].trim())) return m[1].trim();
  }
  const r = fallbackRest.replace(/【[^】]*】/g, '').trim();
  if (r.length >= 2 && !/^(@|＠|会場|場所)/.test(r)) return r.slice(0, 60);
  for (const l of lines) {
    const t = l.replace(/【[^】]*】/g, '').trim();
    if (t.length >= 2 && !JUNK.test(t) && !findDate(t, '2000-01-01') && !/^(OPEN|START|開場|開演|会場|場所|前売|当日|@|＠|📍)/i.test(normalize(t))) return t.slice(0, 60);
  }
  return '';
}

function findVenue(lines: string[], rest: string): string {
  for (const l of lines) {
    const s = normalize(l);
    const m = s.match(/(?:会場|場所|venue|📍)\s*[:：]?\s*(.+)/i) || s.match(/(?:^|\s)@\s*(.+)/);
    if (m) {
      const v = m[1].trim();
      if (!/^[A-Za-z0-9_]+$/.test(v)) return v.replace(/\s*(OPEN|START|開場|開演).*$/i, '').slice(0, 60);
    }
  }
  const r = rest
    .replace(/[「『【][^」』】]*[」』】]/g, ' ')
    .replace(/(?:OPEN|START|開場|開演)\s*:?\s*\d{1,2}:\d{2}/gi, ' ')
    .replace(/\d{1,2}:\d{2}\s*[~\-]?\s*(\d{1,2}:\d{2})?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return r.length >= 2 && r.length <= 40 ? r : '';
}

/** Parses free text into one or more candidate lives. */
export function parseEventText(text: string, todayStr: string): Candidate[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const dated = lines.map((l) => (l && !NOT_SHOW.test(l) ? findDate(l, todayStr) : null));
  const idx = dated.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return [];
  const segments: { lines: string[]; date: string; rest: string }[] =
    idx.length === 1
      ? [{ lines: lines.filter(Boolean), date: dated[idx[0]]!.date, rest: dated[idx[0]]!.rest }]
      : idx.map((start, k) => ({ lines: lines.slice(start, k + 1 < idx.length ? idx[k + 1] : lines.length).filter(Boolean), date: dated[start]!.date, rest: dated[start]!.rest }));
  const out: Candidate[] = [];
  for (const seg of segments) {
    const body = seg.lines.join('\n');
    const single = idx.length === 1;
    const title = findTitle(seg.lines, single ? '' : seg.rest);
    const venue = findVenue(seg.lines, single ? '' : seg.rest);
    const times = findTimes(body);
    const note = seg.lines.filter((l) => !/^#|^https?:\/\//.test(l)).join('\n').slice(0, 400);
    out.push({ key: `${seg.date}|${title}|${venue}`, date: seg.date, title, venue, ...times, amount: findPrice(body), etype: guessType(body), note });
  }
  return dedupe(out);
}

const unescapeICS = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** Parses VEVENTs from an iCalendar file. Times in UTC are converted to this device's time zone. */
export function parseICS(text: string): Candidate[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out: Candidate[] = [];
  for (const block of unfolded.split(/BEGIN:VEVENT/).slice(1)) {
    const body = block.split(/END:VEVENT/)[0];
    const props: Record<string, { params: string; value: string }> = {};
    for (const line of body.split(/\r?\n/)) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (m && !props[m[1]]) props[m[1]] = { params: m[2], value: m[3] };
    }
    const dt = props.DTSTART?.value;
    if (!dt) continue;
    const m = dt.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
    if (!m) continue;
    let date: string,
      start: string | undefined;
    if (m[4] && m[7]) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
      date = iso(d);
      start = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } else {
      date = `${m[1]}-${m[2]}-${m[3]}`;
      start = m[4] ? `${m[4]}:${m[5]}` : undefined;
    }
    const title = unescapeICS(props.SUMMARY?.value ?? '').trim();
    const venue = unescapeICS(props.LOCATION?.value ?? '').trim();
    const note = unescapeICS(props.DESCRIPTION?.value ?? '').trim();
    const t = findTimes(note);
    out.push({ key: `${date}|${title}|${venue}`, date, title, venue, open: t.open, start: t.start ?? start, amount: findPrice(note), etype: guessType(`${title}\n${note}`), note: note.slice(0, 400) });
  }
  return dedupe(out).sort((a, b) => a.date.localeCompare(b.date));
}

function dedupe(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

const squash = (s?: string) => normalize(s ?? '').toLowerCase().replace(/[\s「」『』【】・!！?？]/g, '');

/** True when the log already has a live on that date with a matching venue or title. */
export function alreadyLogged(c: Candidate, events: Entry[]): boolean {
  return events.some((e) => {
    if (e.kind !== 'event' || e.date !== c.date) return false;
    const v1 = squash(e.venue),
      v2 = squash(c.venue),
      t1 = squash(e.title),
      t2 = squash(c.title);
    return (!!v1 && !!v2 && (v1.includes(v2) || v2.includes(v1))) || (!!t1 && !!t2 && (t1.includes(t2) || t2.includes(t1))) || (!v2 && !t2);
  });
}
