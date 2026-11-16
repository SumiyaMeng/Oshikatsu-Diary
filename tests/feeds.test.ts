import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guessType, isSignSession, parseICS, titleRange } from '../src/lib/importers';
import { daysOf, etypeOf } from '../src/lib/logic';
import { toCandidates, type Feed } from '../src/lib/feeds';

describe('event types', () => {
  it('sorts titles into the four types', () => {
    expect(guessType('【福岡･イベ】BBQオフ会')).toBe('offkai');
    expect(guessType('【東京】マジスペ大特典会')).toBe('tokuten');
    expect(guessType('【東京】TIF2025出演前日特典会')).toBe('tokuten');
    expect(guessType('【福岡】MAGICAL SPEC ワンマンライブ')).toBe('oneman');
    expect(guessType('【福岡】ANNA生誕祭「Cutie Holic」')).toBe('oneman');
    expect(guessType('【福岡】HelloYouth × MAGICAL SPEC 2MAN LIVE')).toBe('taiban');
    expect(guessType('【東京】TOKYO IDOL FESTIVAL 2025')).toBe('taiban');
  });
  it('maps old types onto the four', () => {
    expect(etypeOf('fes')).toBe('taiban');
    expect(etypeOf('release')).toBe('taiban');
    expect(etypeOf(undefined)).toBe('taiban');
    expect(etypeOf('oneman')).toBe('oneman');
  });
  it('spots online signing sessions', () => {
    expect(isSignSession('【ネットサイン会】ハロウィンネットサイン会')).toBe(true);
    expect(isSignSession('【ネットチェキ会】「私服deネットチェキ会」')).toBe(true);
    expect(isSignSession('【福岡】MAGICAL TIME vol.23')).toBe(false);
  });
});

describe('multi-day lives', () => {
  it('reads a day range at the end of a title', () => {
    expect(titleRange('【福岡】超天神祭2026 (11/22–11/23)', '2026-11-22')).toEqual({ title: '【福岡】超天神祭2026', end: '2026-11-23' });
    expect(titleRange('IDOL HALLOWEEN (10/31–11/1)', '2026-10-31').end).toBe('2026-11-01');
    expect(titleRange('普通のライブ', '2026-11-22')).toEqual({ title: '普通のライブ' });
  });
  it('reads DTEND from a calendar file', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261122', 'DTEND;VALUE=DATE:20261124', 'SUMMARY:超天神祭2026', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(parseICS(ics)[0]).toMatchObject({ date: '2026-11-22', end: '2026-11-23' });
  });
  it('counts the days', () => {
    expect(daysOf({ date: '2026-11-22', end: '2026-11-23' })).toBe(2);
    expect(daysOf({ date: '2026-11-22' })).toBe(1);
  });
});

describe('MAGICAL SPEC feed', () => {
  const feed = JSON.parse(readFileSync('public/feeds/magical-spec.json', 'utf8')) as Feed;
  it('has 超天神祭 as one two-day live', () => {
    const t = feed.events.filter((e) => e.title.includes('超天神祭2026」'));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ date: '2026-11-22', end: '2026-11-23', kind: 'event' });
  });
  it('keeps ネットサイン会 out of the lives', () => {
    const lives = toCandidates(feed, 'event');
    expect(lives.some((c) => /ネットサイン|ネットチェキ/.test(c.title))).toBe(false);
    expect(toCandidates(feed, 'sign').length).toBeGreaterThan(20);
  });
  it('has no birthday or trip markers', () => {
    expect(feed.events.some((e) => /🎂|✨|^.{0,6}遠征$/.test(e.title))).toBe(false);
  });
});
