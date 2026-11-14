import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { db, onLocalChange } from './db';
import type { Entry, Member } from './types';

/**
 * Local-first sync with Supabase.
 * Every write lands in IndexedDB first (works offline in a basement live house),
 * then dirty rows are pushed and newer rows pulled whenever the app is online and signed in.
 */

const CFG_KEY = 'oshi-log-sync';
export interface SyncConfig {
  url: string;
  key: string;
}
export type SyncStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncState {
  status: SyncStatus;
  message?: string;
  last?: number;
  email?: string;
}

let client: SupabaseClient | null = null;
let session: Session | null = null;
let state: SyncState = { status: 'off' };
const listeners = new Set<(s: SyncState) => void>();

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f(state));
}
export const getSyncState = () => state;
export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function loadConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    const c = raw ? (JSON.parse(raw) as SyncConfig) : null;
    return c && c.url && c.key ? c : null;
  } catch {
    return null;
  }
}

export async function configure(cfg: SyncConfig | null): Promise<void> {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    /* storage blocked: sync stays off */
  }
  await init();
}

export async function init(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) {
    client = null;
    session = null;
    set({ status: 'off', message: undefined, email: undefined });
    return;
  }
  client = createClient(cfg.url.trim(), cfg.key.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'oshi-log-auth' },
  });
  const { data } = await client.auth.getSession();
  session = data.session;
  client.auth.onAuthStateChange((_e, s) => {
    session = s;
    set({ status: s ? 'idle' : 'signed-out', email: s?.user.email ?? undefined });
    if (s) requestSync(0);
  });
  set({ status: session ? 'idle' : 'signed-out', email: session?.user.email ?? undefined });
  if (session) requestSync(0);
}

export async function signIn(email: string, password: string, create: boolean): Promise<string | null> {
  if (!client) return 'Add your Supabase project first.';
  const res = create
    ? await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
    : await client.auth.signInWithPassword({ email, password });
  if (res.error) return res.error.message;
  if (create && !res.data.session) return 'Check your email to confirm the account, then sign in.';
  return null;
}

export async function signOut(): Promise<void> {
  await client?.auth.signOut();
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function requestSync(delay = 1500): void {
  if (!client || !session) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

const strip = <T extends { dirty?: unknown }>(r: T) => {
  const { dirty: _d, ...rest } = r;
  return rest;
};

async function pushTable(table: 'entries' | 'members', uidStr: string) {
  const local = db[table] as unknown as import('dexie').Table<Entry | Member, string>;
  const rows = await local.where('dirty').equals(1).toArray();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await client!
      .from(table)
      .upsert(chunk.map((r) => ({ id: r.id, user_id: uidStr, data: strip(r), deleted: !!r.deleted })));
    if (error) throw error;
    for (const r of chunk) {
      await local
        .where('id')
        .equals(r.id)
        .modify((x) => {
          if (x.updatedAt === r.updatedAt) x.dirty = 0;
        });
    }
  }
}

async function pullTable(table: 'entries' | 'members') {
  const local = db[table] as unknown as import('dexie').Table<Entry | Member, string>;
  const markKey = `pull:${table}`;
  const since = ((await db.kv.get(markKey))?.value as string | undefined) ?? '1970-01-01T00:00:00Z';
  let newest = since;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await client!
      .from(table)
      .select('id,data,deleted,updated_at')
      .gte('updated_at', newest)
      .order('updated_at', { ascending: true })
      .limit(1000);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const remote = { ...(row.data as Entry | Member), id: row.id, deleted: row.deleted, dirty: 0 as const };
      const mine = await local.get(row.id);
      if (mine && mine.dirty && mine.updatedAt > (remote.updatedAt ?? 0)) continue;
      await local.put(remote);
    }
    const last = data[data.length - 1].updated_at as string;
    if (last === newest || data.length < 1000) {
      newest = last;
      break;
    }
    newest = last;
  }
  await db.kv.put({ key: markKey, value: newest });
}

async function pushPhotos(uidStr: string) {
  const pending = await db.photos.where('uploaded').equals(0).toArray();
  for (const p of pending) {
    if (!p.blob) continue;
    const { error } = await client!.storage
      .from('photos')
      .upload(`${uidStr}/${p.id}`, p.blob, { upsert: true, contentType: p.type || p.blob.type || 'image/jpeg' });
    if (error) throw error;
    await db.photos.update(p.id, { uploaded: 1 });
  }
}

let running = false;
export async function syncNow(): Promise<void> {
  if (!client || !session || running) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    set({ status: 'offline' });
    return;
  }
  running = true;
  set({ status: 'syncing', message: undefined });
  try {
    const me = session.user.id;
    await pushTable('entries', me);
    await pushTable('members', me);
    await pushPhotos(me);
    await pullTable('entries');
    await pullTable('members');
    set({ status: 'idle', last: Date.now() });
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
  } finally {
    running = false;
  }
}

/** Downloads a photo that was added on another device and caches it locally. */
export async function fetchRemotePhoto(id: string): Promise<Blob | null> {
  if (!client || !session) return null;
  const { data, error } = await client.storage.from('photos').download(`${session.user.id}/${id}`);
  if (error || !data) return null;
  await db.photos.put({ id, blob: data, type: data.type, createdAt: Date.now(), uploaded: 1 });
  return data;
}

if (typeof window !== 'undefined') {
  onLocalChange(() => requestSync());
  window.addEventListener('online', () => requestSync(0));
  window.addEventListener('offline', () => client && session && set({ status: 'offline' }));
  setInterval(() => requestSync(0), 5 * 60 * 1000);
}
