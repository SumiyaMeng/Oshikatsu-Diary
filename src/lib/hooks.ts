import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from './db';
import { getSorted, loadFeed, loadIndex, type Feed, type FeedInfo } from './feeds';
import { fetchRemotePhoto, getSyncState, subscribeSync, type SyncState } from './sync';
import type { Entry, Member, Settings } from './types';

const byDateDesc = (a: Entry, b: Entry) => b.date.localeCompare(a.date) || b.ts - a.ts;

export function useEntries(): Entry[] | undefined {
  return useLiveQuery(async () => (await db.entries.filter((e) => !e.deleted).toArray()).sort(byDateDesc), []);
}

export function useMembers(): Member[] | undefined {
  return useLiveQuery(
    async () => (await db.members.filter((m) => !m.deleted).toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => getSettings(), []);
}

export function useSync(): SyncState {
  const [s, setS] = useState(getSyncState());
  useEffect(() => subscribeSync(setS), []);
  return s;
}

const urlCache = new Map<string, string>();

/** Object URL for a stored photo or video, downloading it from the cloud if this device doesn't have it. */
export function usePhotoURL(id: string | undefined): { url?: string; type?: string } {
  const [res, setRes] = useState<{ url?: string; type?: string }>(() => (id && urlCache.has(id) ? { url: urlCache.get(id) } : {}));
  useEffect(() => {
    let alive = true;
    if (!id) return;
    (async () => {
      const p = await db.photos.get(id);
      let blob = p?.blob ?? null;
      if (!blob) blob = await fetchRemotePhoto(id);
      if (!blob || !alive) return;
      let url = urlCache.get(id);
      if (!url) {
        url = URL.createObjectURL(blob);
        urlCache.set(id, url);
      }
      setRes({ url, type: blob.type });
    })();
    return () => {
      alive = false;
    };
  }, [id]);
  return res;
}

/** Calendars that ship with the app, the ones the user follows, and which events they already sorted. */
export function useFeeds(followed: string[] | undefined) {
  const [index, setIndex] = useState<FeedInfo[] | null>(null);
  const [feeds, setFeeds] = useState<Record<string, Feed>>({});
  const [error, setError] = useState(false);
  const sorted = useLiveQuery(() => getSorted(), []);
  const ids = (followed ?? []).join(',');
  useEffect(() => {
    let alive = true;
    loadIndex()
      .then((x) => alive && setIndex(x))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    for (const id of ids ? ids.split(',') : [])
      loadFeed(id)
        .then((f) => alive && setFeeds((cur) => ({ ...cur, [id]: f })))
        .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [ids]);
  return { index, feeds: Object.fromEntries(Object.entries(feeds).filter(([id]) => (followed ?? []).includes(id))), sorted: sorted ?? new Set<string>(), error };
}
