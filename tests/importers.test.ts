import { describe, expect, it } from 'vitest';
import { alreadyLogged, inferYear, parseEventText, parseICS } from '../src/lib/importers';
import type { Entry } from '../src/lib/types';

const TODAY = '2026-11-16';

describe('dates', () => {
  it('infers the nearest year', () => {
    expect(inferYear(11, 22, TODAY)).toBe(2026);
    expect(inferYear(1, 10, TODAY)).toBe(2027);
    expect(inferYear(8, 1, TODAY)).toBe(2026);
  });
});

describe('X announcement', () => {
  const post = `【公演決定】
『パレットの向こう側』
2026.11.22(日) 心斎橋 RIVER HALL
OPEN 17:30 / START 18:00
前売 ¥4,000 / 当日 ¥4,500
チケット発売 11/1(土) 12:00〜
#ルミパレ https://t.co/xyz`;
  it('reads one show and ignores the ticket-sale date', () => {
    const r = parseEventText(post, TODAY);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ date: '2026-11-22', title: 'パレットの向こう側', venue: '心斎橋 RIVER HALL', open: '17:30', start: '18:00', amount: 4000 });
  });
});

describe('monthly schedule', () => {
  const sched = `11月のスケジュール
11/22(日) 渋谷NEON BOX「ネオンサーカス vol.4」
11/28(土) 下北沢 STAR GARAGE【定期公演 vol.13】 ワンマン
12/5(土) 新宿 BLAZE 対バン`;
  it('splits one show per dated line', () => {
    const r = parseEventText(sched, TODAY);
    expect(r.map((c) => c.date)).toEqual(['2026-11-22', '2026-11-28', '2026-12-05']);
    expect(r[0]).toMatchObject({ title: 'ネオンサーカス vol.4', venue: '渋谷NEON BOX' });
    expect(r[1]).toMatchObject({ title: '定期公演 vol.13', venue: '下北沢 STAR GARAGE', etype: 'oneman' });
  });
  it('ignores times on ticket-sale lines', () => {
    const r = parseEventText('11/22(日) 心斎橋 RIVER HALL「パレットの向こう側」\nチケット発売 11/1(土) 12:00〜\n11/28(土) 新宿 BLAZE', TODAY);
    expect(r[0].start).toBeUndefined();
  });
});

describe('TimeTree shared text', () => {
  const tt = `ルミパレ 対バン
2026年11月8日(日) 13:00〜15:30
渋谷 NEON BOX
https://timetr.ee/abc`;
  it('reads the date, start time and title', () => {
    const r = parseEventText(tt, TODAY);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ date: '2026-11-08', start: '13:00', title: 'ルミパレ 対バン' });
  });
});

describe('ics', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART:20261122T090000Z',
    'SUMMARY:大阪ワンマン',
    'LOCATION:心斎橋 RIVER HALL',
    'DESCRIPTION:OPEN 17:30 / START 18:00\\n前売 ¥4\\,000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261205',
    'SUMMARY:新宿 対バン',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  it('parses events with times and all-day dates', () => {
    const r = parseICS(ics);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ title: '大阪ワンマン', venue: '心斎橋 RIVER HALL', open: '17:30', start: '18:00', amount: 4000, etype: 'oneman' });
    expect(r[1]).toMatchObject({ date: '2026-12-05', title: '新宿 対バン' });
  });
});

describe('duplicates', () => {
  const e: Entry = { id: 'e', kind: 'event', date: '2026-11-22', ts: 1, updatedAt: 1, venue: '心斎橋 RIVER HALL', title: '大阪ワンマン' };
  it('spots a live already in the log', () => {
    expect(alreadyLogged({ key: 'k', date: '2026-11-22', title: 'パレットの向こう側', venue: '心斎橋RIVER HALL' }, [e])).toBe(true);
    expect(alreadyLogged({ key: 'k', date: '2026-11-23', title: 'x', venue: 'y' }, [e])).toBe(false);
  });
});
