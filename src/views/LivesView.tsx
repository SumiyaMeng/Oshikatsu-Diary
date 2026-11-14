import { useMemo, useState } from 'react';
import { daysBetween, fmtDate, today, yen } from '../lib/format';
import { EVENT_TYPES, livesPerMonth, livesStats, nextMilestone } from '../lib/logic';
import type { Entry } from '../lib/types';
import { Columns, EntryCard, Empty, HBars, Tile, useColor, useData } from '../components/ui';

export function LivesView({ onOpen, onNewEvent }: { onOpen: (e: Entry) => void; onNewEvent: () => void }) {
  const { items, showMoney } = useData();
  const color = useColor();
  const [group, setGroup] = useState('');
  const groups = useMemo(() => [...new Set(items.filter((e) => e.kind === 'event').map((e) => e.oshi).filter(Boolean) as string[])].sort(), [items]);
  const t = today();
  const s = useMemo(() => livesStats(items, t, groups.includes(group) ? group : ''), [items, t, group, groups]);
  if (!items.some((e) => e.kind === 'event'))
    return (
      <Empty title="No lives logged yet" actions={<button className="chip" type="button" onClick={onNewEvent}>Live / event</button>}>
        Every ワンマン, 対バン, リリイベ or fes becomes a page with its 入場番号, chekis, 特典会 memos and costs. Your stats build up here.
      </Empty>
    );
  const next = nextMilestone(s.past.length);
  return (
    <section>
      {groups.length > 1 ? (
        <div className="chips" style={{ marginTop: 4 }}>
          <button type="button" className={`chip${!group ? ' on' : ''}`} onClick={() => setGroup('')}>
            All groups
          </button>
          {groups.map((g) => (
            <button key={g} type="button" className={`chip${group === g ? ' on' : ''}`} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      ) : null}
      <div className="hero" style={{ marginTop: 8 }}>
        <span className="eyebrow">Lives you've been to{group ? ' · ' + group : ''}</span>
        <div className="big">
          {s.past.length}
          <small>lives</small>
        </div>
        <p>
          {s.first ? `Since your first logged live on ${fmtDate(s.first)}, ${daysBetween(s.first, t)} days ago.` : 'Your first live will show up here.'}
          {next ? ` ${next - s.past.length} more to your ${next === 1 ? 'first' : next + 'th'}.` : ''}
        </p>
      </div>
      <div className="tiles" style={{ marginTop: 10 }}>
        <Tile label="Chekis" value={s.chekis} />
        <Tile label="特典会 loops" value={s.loops} />
        <Tile label="Venues" value={s.venues} />
        <Tile label="Upcoming" value={s.upcoming.length} />
        <Tile label="Spent on lives" value={yen(s.spent)} accent hidden={!showMoney} />
      </div>
      <div className="block">
        <h3>Lives per month</h3>
        <Columns data={livesPerMonth(s.past, t)} />
      </div>
      {s.byType.length ? (
        <div className="block">
          <h3>By type</h3>
          <HBars rows={s.byType} labelOf={(k) => EVENT_TYPES[k] ?? k} />
        </div>
      ) : null}
      {s.byVenue.length ? (
        <div className="block">
          <h3>Venues you go to most</h3>
          <HBars rows={s.byVenue} />
        </div>
      ) : null}
      {s.byMember.length ? (
        <div className="block">
          <h3>Chekis by member</h3>
          <HBars rows={s.byMember} style={color} labelOf={(k) => <span className="who" style={color(k)}>{k}</span>} />
        </div>
      ) : null}
      {s.upcoming.length ? (
        <>
          <div className="mh">
            <span>Upcoming</span>
            <span className="num">{s.upcoming.length}</span>
          </div>
          <div className="list">
            {s.upcoming.map((e) => (
              <EntryCard key={e.id} e={e} onOpen={onOpen} />
            ))}
          </div>
        </>
      ) : null}
      {s.past.length ? (
        <>
          <div className="mh">
            <span>Been there</span>
            <span className="num">{s.past.length}</span>
          </div>
          <div className="list">
            {s.past.map((e) => (
              <EntryCard key={e.id} e={e} onOpen={onOpen} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
