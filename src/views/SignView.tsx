import { useMemo, useState } from 'react';
import { CalendarPanel, FeedRow, pending, type FeedState } from '../components/Calendars';
import { EntryCard, HBars, Tile, useColor, useData } from '../components/ui';
import { today, yen } from '../lib/format';
import { markSorted } from '../lib/feeds';
import { amt } from '../lib/logic';
import type { Entry } from '../lib/types';

/** ネットサイン会: photos signed on stream with your name and a message, then posted to you. */
export function SignView({ feeds, onOpen, onNew }: { feeds: FeedState; onOpen: (e: Entry) => void; onNew: (preset?: Partial<Entry>) => void }) {
  const { items, showMoney } = useData();
  const color = useColor();
  const [showOld, setShowOld] = useState(false);
  const t = today();
  const signs = useMemo(() => items.filter((e) => e.kind === 'sign').sort((a, b) => b.date.localeCompare(a.date)), [items]);
  const photos = signs.reduce((s, e) => s + (+(e.qty ?? 0) || 0), 0);
  const waiting = signs.filter((e) => !e.arrived);
  const byMember = useMemo(() => {
    const m: Record<string, number> = {};
    signs.forEach((e) => e.oshi && (m[e.oshi] = (m[e.oshi] ?? 0) + (+(e.qty ?? 0) || 1)));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [signs]);

  // Sessions from followed calendars: recent and upcoming first, older ones folded away.
  const cutoff = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  const fromCal = Object.values(feeds.feeds).flatMap((f) => pending(f, 'sign', items, feeds.sorted).map((c) => ({ c, group: f.group })));
  const recent = fromCal.filter(({ c }) => c.date >= cutoff).sort((a, b) => a.c.date.localeCompare(b.c.date));
  const older = fromCal.filter(({ c }) => c.date < cutoff).sort((a, b) => b.c.date.localeCompare(a.c.date));
  const order = (c: (typeof fromCal)[number]) => () => onNew({ date: c.c.date, title: c.c.title, oshi: '', note: '' });

  return (
    <section>
      <div className="hero" style={{ marginTop: 8 }}>
        <span className="eyebrow">ネットサイン会</span>
        <div className="big">
          {photos}
          <small>signed photo{photos === 1 ? '' : 's'}</small>
        </div>
        <p>Photos signed on stream with your name and a message. Log what you ordered, then tick it off when it arrives.</p>
      </div>
      <div className="tiles" style={{ marginTop: 10 }}>
        <Tile label="Sessions" value={signs.length} />
        <Tile label="Waiting to arrive" value={waiting.length} />
        <Tile label="Spent" value={yen(signs.reduce((s, e) => s + amt(e), 0))} accent hidden={!showMoney} />
      </div>
      <CalendarPanel state={feeds} kind="sign" />
      {recent.length ? (
        <>
          <div className="mh">
            <span>From the calendar</span>
            <span className="num">{recent.length}</span>
          </div>
          <div className="feedlist">
            {recent.map((x) => (
              <FeedRow key={x.c.key} c={x.c} group={x.group} onAdd={order(x)} addLabel={x.c.date > t ? 'I’m ordering' : 'I ordered'} />
            ))}
          </div>
        </>
      ) : null}
      {older.length ? (
        <div className="addrow" style={{ marginTop: 8 }}>
          <button className="btn ghost sm" type="button" onClick={() => setShowOld(!showOld)}>
            {showOld ? 'Hide' : 'Show'} {older.length} earlier session{older.length > 1 ? 's' : ''}
          </button>
          {showOld ? (
            <button className="btn ghost sm" type="button" onClick={() => markSorted(older.map((x) => x.c.key))}>
              Skip all earlier ones
            </button>
          ) : null}
        </div>
      ) : null}
      {showOld && older.length ? (
        <div className="feedlist" style={{ marginTop: 6 }}>
          {older.map((x) => (
            <FeedRow key={x.c.key} c={x.c} group={x.group} onAdd={order(x)} addLabel="I ordered" />
          ))}
        </div>
      ) : null}
      <div className="addrow" style={{ marginTop: 10 }}>
        <button className="btn sec sm" type="button" onClick={() => onNew()}>
          ＋ Log a ネットサイン会 order
        </button>
      </div>
      {byMember.length ? (
        <div className="block">
          <h3>Photos by member</h3>
          <HBars rows={byMember} style={color} labelOf={(k) => <span className="who" style={color(k)}>{k}</span>} />
        </div>
      ) : null}
      {signs.length ? (
        <>
          <div className="mh">
            <span>Your orders</span>
            <span className="num">{signs.length}</span>
          </div>
          <div className="list">
            {signs.map((e) => (
              <EntryCard key={e.id} e={e} onOpen={onOpen} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
