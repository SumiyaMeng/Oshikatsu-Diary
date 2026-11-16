/**
 * Group calendars that ship with the app (public/feeds/). Following one is a one-time switch:
 * from then on new lives and ネットサイン会 from that calendar show up by themselves, and the
 * user only ticks which ones they went to or ordered.
 */
import { db, getSettings, setSettings } from './db';
import { guessType, type Candidate } from './importers';

export interface FeedEvent {
  date: string;
  end?: string;
  title: string;
  venue?: string;
  open?: string;
  start?: string;
  kind: 'event' | 'sign';
  etype?: string;
  source?: string;
}
export interface Feed {
  id: string;
  group: string;
  source?: string;
  url?: string;
  updated?: string;
  events: FeedEvent[];
}
export interface FeedInfo {
  id: string;
  group: string;
  source?: string;
  url?: string;
  updated?: string;
  count?: number;
}

const base = () => (import.meta.env?.BASE_URL ?? '/') + 'feeds/';

export async function loadIndex(): Promise<FeedInfo[]> {
  const r = await fetch(base() + 'index.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('index ' + r.status);
  return ((await r.json()) as { calendars: FeedInfo[] }).calendars ?? [];
}

export async function loadFeed(id: string): Promise<Feed> {
  const r = await fetch(base() + encodeURIComponent(id) + '.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(id + ' ' + r.status);
  return (await r.json()) as Feed;
}

/** Stable key for one calendar event, used to remember which ones the user already sorted. */
export const feedKey = (feedId: string, e: Pick<FeedEvent, 'date' | 'title'>) => `${feedId}|${e.date}|${e.title}`;

export function toCandidates(feed: Feed, kind: 'event' | 'sign'): Candidate[] {
  return feed.events
    .filter((e) => e.kind === kind)
    .map((e) => ({
      key: feedKey(feed.id, e),
      date: e.date,
      end: e.end,
      title: e.title,
      venue: e.venue ?? '',
      open: e.open,
      start: e.start,
      etype: e.etype ?? guessType(e.title),
      kind,
      note: e.source === 'x' ? 'From MAGICAL SPEC posts on X' : undefined,
    }));
}

/* ---- which calendar events the user has already dealt with (added or skipped) ---- */

export async function getSorted(): Promise<Set<string>> {
  const row = await db.kv.get('feedSorted');
  return new Set((row?.value as string[]) ?? []);
}
export async function markSorted(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const cur = await getSorted();
  keys.forEach((k) => cur.add(k));
  await db.kv.put({ key: 'feedSorted', value: [...cur] });
}

export async function setFollow(id: string, on: boolean): Promise<void> {
  const s = await getSettings();
  const list = new Set(s.feeds ?? []);
  if (on) list.add(id);
  else list.delete(id);
  await setSettings({ feeds: [...list] });
}
