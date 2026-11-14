import Dexie, { type Table } from 'dexie';
import type { Entry, Member, Photo, Settings } from './types';

class OshiDB extends Dexie {
  entries!: Table<Entry, string>;
  photos!: Table<Photo, string>;
  members!: Table<Member, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('oshi-log');
    this.version(1).stores({
      entries: 'id, kind, date, eventId, dirty, updatedAt',
      photos: 'id, uploaded',
      members: 'id, name, dirty',
      kv: 'key',
    });
  }
}

export const db = new OshiDB();

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

type Listener = () => void;
const changeListeners = new Set<Listener>();
/** Called after every local write; the sync module subscribes to this. */
export function onLocalChange(fn: Listener): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
const changed = () => changeListeners.forEach((f) => f());

export async function saveEntry(e: Partial<Entry> & Pick<Entry, 'kind'>): Promise<Entry> {
  const now = Date.now();
  const rec: Entry = { date: '', ...e, id: e.id ?? uid(), ts: e.ts ?? now, updatedAt: now, dirty: 1 } as Entry;
  await db.entries.put(rec);
  changed();
  return rec;
}

export async function deleteEntry(id: string): Promise<void> {
  const e = await db.entries.get(id);
  if (!e) return;
  await db.entries.put({ ...e, deleted: true, updatedAt: Date.now(), dirty: 1 });
  changed();
}

export async function saveMember(m: Partial<Member> & Pick<Member, 'name'>): Promise<Member> {
  const rec: Member = { ...m, id: m.id ?? uid(), updatedAt: Date.now(), dirty: 1 } as Member;
  await db.members.put(rec);
  changed();
  return rec;
}

export async function deleteMember(id: string): Promise<void> {
  const m = await db.members.get(id);
  if (!m) return;
  await db.members.put({ ...m, deleted: true, updatedAt: Date.now(), dirty: 1 });
  changed();
}

export async function savePhoto(blob: Blob): Promise<string> {
  const id = uid();
  await db.photos.put({ id, blob, type: blob.type, createdAt: Date.now(), uploaded: 0 });
  changed();
  return id;
}

const DEFAULT_SETTINGS: Settings = { hideMoney: false };

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.kv.put({ key: 'settings', value: { ...cur, ...patch } });
}

/** Everything the user has logged, as one JSON object (photos excluded). */
export async function exportAll() {
  const [entries, members, settings] = await Promise.all([
    db.entries.filter((e) => !e.deleted).toArray(),
    db.members.filter((m) => !m.deleted).toArray(),
    getSettings(),
  ]);
  return { app: 'oshi-log', version: 1, exported: new Date().toISOString(), settings, entries, members };
}
