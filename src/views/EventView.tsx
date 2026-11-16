import { fmtDate, yen } from '../lib/format';
import { EVENT_TYPES, KIND_LABEL, amt, chekisOf, eventCost, isLoop, linked } from '../lib/logic';
import type { Entry, Kind } from '../lib/types';
import { EntryCard, HBars, Photos, Tile, useColor, useData } from '../components/ui';

export function EventView({ id, onBack, onOpen, onNew, onEdit }: { id: string; onBack: () => void; onOpen: (e: Entry) => void; onNew: (k: Kind, eventId: string) => void; onEdit: (id: string) => void }) {
  const { items, byId, showMoney } = useData();
  const color = useColor();
  const ev = byId[id];
  if (!ev)
    return (
      <button className="back" type="button" onClick={onBack}>
        ← Lives
      </button>
    );
  const l = linked(ev, items).sort((a, b) => (a.loop ?? 0) - (b.loop ?? 0) || a.ts - b.ts);
  const by: Record<string, number> = {};
  if (amt(ev)) by['Ticket / entry'] = amt(ev);
  l.forEach((x) => amt(x) && (by[KIND_LABEL[x.kind]] = (by[KIND_LABEL[x.kind]] ?? 0) + amt(x)));
  return (
    <section>
      <button className="back" type="button" onClick={onBack}>
        ← Lives
      </button>
      <div className="evhead">
        <span className="kind k-event">{EVENT_TYPES[ev.etype ?? ''] ?? 'Live / event'}</span>
        <h2>{ev.title || EVENT_TYPES[ev.etype ?? ''] || 'Live'}</h2>
        <div className="meta">
          {fmtDate(ev.date)}
          {ev.oshi ? (
            <>
              {' · '}
              <span className="who" style={color(ev.oshi)}>
                {ev.oshi}
              </span>
            </>
          ) : null}
          {ev.venue ? ' · ' + ev.venue : ''}
          {ev.open || ev.start ? ' · ' + [ev.open && `OPEN ${ev.open}`, ev.start && `START ${ev.start}`].filter(Boolean).join(' / ') : ''}
        </div>
      </div>
      <div className="tiles">
        <Tile label="Total" value={yen(eventCost(ev, items))} accent hidden={!showMoney} />
        <Tile label="Chekis" value={l.reduce((s, x) => s + chekisOf(x), 0)} />
        <Tile label="Loops" value={l.filter(isLoop).length} />
        <Tile label="入場番号" value={ev.number || '—'} />
      </div>
      <div className="block">
        <div className="addrow">
          <button className="btn primary sm" type="button" onClick={() => onNew('tkk', ev.id)}>
            ＋ 特典会 loop
          </button>
          <button className="chip" type="button" onClick={() => onNew('merch', ev.id)}>
            Merch
          </button>
          <button className="chip" type="button" onClick={() => onNew('travel', ev.id)}>
            Travel & food
          </button>
        </div>
      </div>
      {showMoney && Object.keys(by).length ? (
        <div className="block">
          <h3>Where the money went</h3>
          <HBars rows={Object.entries(by).sort((a, b) => b[1] - a[1])} format={yen} />
        </div>
      ) : null}
      <div className="block">
        <h3>What happened</h3>
        {l.length ? (
          <div className="list">
            {l.map((x) => (
              <EntryCard key={x.id} e={x} inEvent full onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <p className="mut" style={{ margin: 0 }}>
            Nothing attached yet. Add each 特典会 loop right after it happens.
          </p>
        )}
      </div>
      {ev.note || ev.photos?.length ? (
        <div className="block">
          <h3>Notes</h3>
          <div className="panel">
            {ev.note ? <p className="note">{ev.note}</p> : null}
            <Photos e={ev} />
          </div>
        </div>
      ) : null}
      <div className="block">
        <button className="btn ghost" type="button" onClick={() => onEdit(ev.id)}>
          Edit live details
        </button>
      </div>
    </section>
  );
}
