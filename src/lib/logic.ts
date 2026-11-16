import type { Entry, Kind } from './types';
import { iso } from './format';

export const KIND_LABEL: Record<Kind, string> = {
  tkk: '特典会',
  event: 'Live / event',
  sign: 'ネットサイン会',
  photo: 'Marche',
  merch: 'Merch',
  travel: 'Travel & food',
  collab: 'Collab',
  wallet: 'Tickets bought',
};
export const PICK_KINDS: Kind[] = ['tkk', 'event', 'sign', 'photo', 'merch', 'wallet', 'travel', 'collab'];
/** The four kinds of event. ワンマン and 対バン both have a live; 大特典会 is 特典会 only; オフ会 is hanging out, no live. */
export const EVENT_TYPES: Record<string, string> = {
  taiban: '対バン',
  oneman: 'ワンマン',
  tokuten: '大特典会',
  offkai: 'オフ会',
};
/** Maps any stored type, including ones from older versions (リリイベ, フェス…), onto the four above. */
export const etypeOf = (t?: string): string => (t && t in EVENT_TYPES ? t : 'taiban');
export const etypeLabel = (t?: string) => EVENT_TYPES[etypeOf(t)];
/** Days a live runs, counting both ends. */
export const daysOf = (e: Pick<Entry, 'date' | 'end'>) => (e.end && e.end > e.date ? Math.round((Date.parse(e.end) - Date.parse(e.date)) / 864e5) + 1 : 1);
export const CHEKI_TYPES: Record<string, string> = {
  cheki: 'チェキ',
  two: '2ショット',
  sign: 'サイン入り',
  shame: '写メ',
  video: '動画',
  online: 'オンライン',
  other: 'Other',
};
export const PERKS = ['新規無料', '遠征特典', '指名特典', '生誕特典'];
export const COLLAB_TYPES: Record<string, string> = {
  restaurant: 'Restaurant / café',
  vending: 'Vending machine',
  radio: 'Radio',
  tv: 'TV',
  store: 'Store / goods',
  other: 'Other',
};

export const amt = (e: Entry) => +(e.amount ?? 0) || 0;
export const sumAmt = (a: Entry[]) => a.reduce((s, e) => s + amt(e), 0);
export const chekisOf = (e: Entry) => (e.kind === 'tkk' ? +(e.n ?? 0) || 0 : 0);
export const isLoop = (e: Entry) => e.kind === 'tkk';

/** Tickets a 特典会 loop takes from a wallet: free chekis don't use tickets. */
export const ticketsUsed = (e: Entry) => Math.max(0, (+(e.n ?? 0) || 0) - (+(e.free ?? 0) || 0));

/** What a 特典会 loop costs on the spot. Zero when paid with wallet tickets bought earlier. */
export function loopCost(e: Pick<Entry, 'n' | 'free' | 'unit' | 'walletId'>): number {
  if (e.walletId) return 0;
  return Math.max(0, (+(e.n ?? 0) || 0) - (+(e.free ?? 0) || 0)) * (+(e.unit ?? 0) || 0);
}

export const linked = (ev: Entry, items: Entry[]) => items.filter((x) => x.eventId === ev.id);
export const eventCost = (ev: Entry, items: Entry[]) => amt(ev) + sumAmt(linked(ev, items));

export interface WalletStatus {
  bought: number;
  used: number;
  left: number;
  unitCost: number;
  expired: boolean;
  /** Days until expiry, negative once past. Undefined when no expiry is set. */
  daysLeft?: number;
  /** Money lost to tickets that expired unused. */
  lost: number;
}

export function walletStatus(w: Entry, items: Entry[], todayStr: string): WalletStatus {
  const bought = Math.max(0, +(w.qty ?? 0) || 0);
  const used = items.filter((x) => x.kind === 'tkk' && x.walletId === w.id).reduce((s, x) => s + ticketsUsed(x), 0);
  const left = Math.max(0, bought - used);
  const unitCost = bought ? amt(w) / bought : 0;
  const daysLeft = w.expires ? Math.round((Date.parse(w.expires) - Date.parse(todayStr)) / 864e5) : undefined;
  const expired = daysLeft !== undefined && daysLeft < 0;
  return { bought, used, left, unitCost, expired, daysLeft, lost: expired ? Math.round(left * unitCost) : 0 };
}

/** Wallet tickets still usable, soonest expiry first. */
export function openWallets(items: Entry[], todayStr: string) {
  return items
    .filter((x) => x.kind === 'wallet')
    .map((w) => ({ w, s: walletStatus(w, items, todayStr) }))
    .filter(({ s }) => s.left > 0 && !s.expired)
    .sort((a, b) => (a.w.expires ?? '9999').localeCompare(b.w.expires ?? '9999'));
}

export type Period = 'month' | 'quarter' | 'year';
export const PERIOD_STEP: Record<Period, number> = { month: 1, quarter: 3, year: 12 };

export function rangeOf(anchor: Date, mode: Period) {
  const y = anchor.getFullYear(),
    m = anchor.getMonth();
  let s: Date, e: Date, label: string;
  if (mode === 'month') {
    s = new Date(y, m, 1);
    e = new Date(y, m + 1, 1);
    label = `${y}年${m + 1}月`;
  } else if (mode === 'quarter') {
    const q = Math.floor(m / 3);
    s = new Date(y, q * 3, 1);
    e = new Date(y, q * 3 + 3, 1);
    label = `${y} Q${q + 1}`;
  } else {
    s = new Date(y, 0, 1);
    e = new Date(y + 1, 0, 1);
    label = `${y}年`;
  }
  return { s, e, S: iso(s), E: iso(e), label };
}

export function periodStats(items: Entry[], todayStr: string) {
  return {
    spent: sumAmt(items),
    lives: items.filter((x) => x.kind === 'event' && x.date <= todayStr).length,
    chekis: items.reduce((s, x) => s + chekisOf(x), 0),
    loops: items.filter(isLoop).length,
    marche: items.filter((x) => x.kind === 'photo').length,
  };
}

export const MILESTONES = [1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000];
export const nextMilestone = (n: number) => MILESTONES.find((m) => m > n);

export function livesStats(items: Entry[], todayStr: string, group = '') {
  const evs = items.filter((e) => e.kind === 'event' && (!group || e.oshi === group));
  const ids = new Set(evs.map((e) => e.id));
  const past = evs.filter((e) => e.date && e.date <= todayStr).sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = evs.filter((e) => e.date > todayStr).sort((a, b) => a.date.localeCompare(b.date));
  const rel = group ? items.filter((e) => e.eventId && ids.has(e.eventId)) : items;
  const first = past.length ? past[past.length - 1].date : '';
  const count = (rows: Entry[], key: (e: Entry) => string | undefined, w: (e: Entry) => number = () => 1) => {
    const m: Record<string, number> = {};
    rows.forEach((e) => {
      const k = key(e);
      if (k) m[k] = (m[k] || 0) + w(e);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  return {
    past,
    upcoming,
    chekis: rel.reduce((s, e) => s + chekisOf(e), 0),
    loops: rel.filter(isLoop).length,
    venues: new Set(past.map((e) => e.venue).filter(Boolean)).size,
    first,
    spent: past.reduce((s, e) => s + eventCost(e, items), 0),
    byType: count(past, (e) => etypeOf(e.etype)),
    byVenue: count(past, (e) => e.venue).slice(0, 5),
    byMember: count(rel, (e) => (chekisOf(e) ? e.oshi : undefined), chekisOf).slice(0, 8),
  };
}

/** Lives per month for the 12 months ending with the month of `todayStr`. */
export function livesPerMonth(past: Entry[], todayStr: string) {
  const [y, m] = todayStr.split('-').map(Number);
  const out: { label: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const p = iso(d).slice(0, 7);
    out.push({ label: `${d.getMonth() + 1}月`, value: past.filter((e) => e.date.startsWith(p)).length });
  }
  return out;
}

/** Next loop number for a member at an event. */
export function nextLoop(items: Entry[], eventId?: string, oshi?: string, exceptId?: string) {
  if (!eventId) return 1;
  return items.filter((x) => isLoop(x) && x.eventId === eventId && (!oshi || x.oshi === oshi) && x.id !== exceptId).length + 1;
}

/** Talk memo line helpers: 推： = oshi, 私： = me. */
export function nextSpeakerPrefix(textBeforeCaret: string): string {
  const lines = textBeforeCaret.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^(推|私)[：:]/);
    if (m) return m[1] === '推' ? '私：' : '推：';
  }
  return '推：';
}
export const cleanTalk = (t: string) =>
  t
    .split('\n')
    .filter((l) => !/^\s*(推|私)[：:]\s*$/.test(l))
    .join('\n')
    .trim();
