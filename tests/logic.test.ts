import { describe, expect, it } from 'vitest';
import { cleanTalk, livesStats, loopCost, nextLoop, nextSpeakerPrefix, rangeOf, walletStatus } from '../src/lib/logic';
import type { Entry } from '../src/lib/types';

const base = { ts: 1, updatedAt: 1 };
const ev = (id: string, date: string, extra: Partial<Entry> = {}): Entry => ({ ...base, id, kind: 'event', date, ...extra });
const loop = (id: string, eventId: string, extra: Partial<Entry> = {}): Entry => ({ ...base, id, kind: 'tkk', date: '2026-11-03', eventId, ...extra });

describe('loop cost', () => {
  it('charges paid chekis only', () => expect(loopCost({ n: 3, free: 1, unit: 1000 })).toBe(2000));
  it('is free when paid from the wallet', () => expect(loopCost({ n: 3, unit: 1000, walletId: 'w' })).toBe(0));
});

describe('wallet', () => {
  const w: Entry = { ...base, id: 'w', kind: 'wallet', date: '2026-10-01', qty: 10, amount: 10000, expires: '2026-11-30' };
  const items = [w, loop('a', 'e', { walletId: 'w', n: 3 }), loop('b', 'e', { walletId: 'w', n: 2, free: 1 })];
  it('counts tickets left and days to expiry', () => {
    const s = walletStatus(w, items, '2026-11-15');
    expect(s.used).toBe(4);
    expect(s.left).toBe(6);
    expect(s.daysLeft).toBe(15);
    expect(s.lost).toBe(0);
  });
  it('reports money lost once expired', () => {
    const s = walletStatus(w, items, '2026-12-01');
    expect(s.expired).toBe(true);
    expect(s.lost).toBe(6000);
  });
});

describe('lives stats', () => {
  const items = [
    ev('e1', '2026-11-03', { venue: 'STAR GARAGE', etype: 'oneman', amount: 3000, oshi: 'Lumi' }),
    ev('e2', '2026-12-01', { venue: 'NEON BOX', oshi: 'Lumi' }),
    loop('l1', 'e1', { oshi: 'そら', n: 3, amount: 2000 }),
  ];
  it('splits past and upcoming and totals the day', () => {
    const s = livesStats(items, '2026-11-15');
    expect(s.past.map((e) => e.id)).toEqual(['e1']);
    expect(s.upcoming.map((e) => e.id)).toEqual(['e2']);
    expect(s.chekis).toBe(3);
    expect(s.spent).toBe(5000);
    expect(s.byMember).toEqual([['そら', 3]]);
  });
  it('numbers loops per member and event', () => expect(nextLoop(items, 'e1', 'そら')).toBe(2));
});

describe('periods and talk', () => {
  it('builds quarter ranges', () => {
    const r = rangeOf(new Date(2026, 10, 15), 'quarter');
    expect([r.S, r.E, r.label]).toEqual(['2026-10-01', '2027-01-01', '2026 Q4']);
  });
  it('alternates speakers', () => {
    expect(nextSpeakerPrefix('推：ありがとう')).toBe('私：');
    expect(nextSpeakerPrefix('推：a\n私：b\nplain')).toBe('推：');
  });
  it('drops empty speaker lines', () => expect(cleanTalk('推：hi\n私：\n')).toBe('推：hi'));
});
