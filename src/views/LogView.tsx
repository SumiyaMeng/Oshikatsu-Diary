import { useMemo, useState } from 'react';
import { fmtDate, today, yen } from '../lib/format';
import { KIND_LABEL, openWallets, sumAmt } from '../lib/logic';
import type { Entry, Kind } from '../lib/types';
import { EntryCard, Empty, useData } from '../components/ui';

const FILTERS: ('all' | Kind)[] = ['all', 'tkk', 'event', 'photo', 'merch', 'wallet', 'travel', 'collab'];

export function LogView({ onOpen, onNew, onWallet }: { onOpen: (e: Entry) => void; onNew: (k: Kind) => void; onWallet: () => void }) {
  const { items, showMoney } = useData();
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [oshi, setOshi] = useState('');
  const [q, setQ] = useState('');
  const oshis = useMemo(() => [...new Set(items.map((e) => e.oshi).filter(Boolean) as string[])].sort(), [items]);
  const soon = useMemo(() => openWallets(items, today()).filter(({ s }) => s.daysLeft !== undefined && s.daysLeft <= 7), [items]);

  const qq = q.trim().toLowerCase();
  const list = items.filter(
    (e) =>
      (kind === 'all' || e.kind === kind) &&
      (!oshi || e.oshi === oshi) &&
      (!qq || [e.title, e.note, e.talk, e.venue, e.oshi, e.perk, e.number, e.label].join(' ').toLowerCase().includes(qq)),
  );
  const groups: Record<string, Entry[]> = {};
  list.forEach((e) => (groups[(e.date || '').slice(0, 7) || 'No date'] ??= []).push(e));

  return (
    <section>
      {soon.length ? (
        <div className="panel" style={{ marginBottom: 10, borderColor: 'var(--bad)' }}>
          <b>Tickets about to expire</b>
          {soon.map(({ w, s }) => (
            <div key={w.id} className="row-sp">
              <span>
                {w.label || 'チェキ券'} · {w.oshi || 'any'} · <b className="num">{s.left}</b> left
              </span>
              <span className="pill warn">{s.daysLeft === 0 ? 'Today' : `${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left`}</span>
            </div>
          ))}
          <button className="btn ghost sm" type="button" onClick={onWallet}>
            Open wallet
          </button>
        </div>
      ) : null}
      <div className="chips">
        {FILTERS.map((k) => (
          <button key={k} type="button" className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
            {k === 'all' ? 'All' : KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="filters">
        <input type="search" id="search" placeholder="Search memos, venues, names…" aria-label="Search your log" value={q} onChange={(e) => setQ(e.target.value)} />
        {oshis.length ? (
          <select aria-label="Filter by oshi" value={oshi} onChange={(e) => setOshi(e.target.value)}>
            <option value="">All oshi</option>
            {oshis.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : null}
      </div>
      {!items.length ? (
        <Empty
          title="Your log is empty"
          actions={
            <>
              <button className="chip" type="button" onClick={() => onNew('event')}>
                Live / event
              </button>
              <button className="chip" type="button" onClick={() => onNew('tkk')}>
                特典会
              </button>
              <button className="chip" type="button" onClick={() => onNew('wallet')}>
                Tickets bought
              </button>
            </>
          }
        >
          Start with the last live you went to, then add a 特典会 loop with what you talked about.
        </Empty>
      ) : !list.length ? (
        <Empty title="Nothing matches">Try another word, type or oshi.</Empty>
      ) : (
        Object.keys(groups)
          .sort()
          .reverse()
          .map((m) => {
            const [y, mm] = m.split('-');
            return (
              <div key={m}>
                <div className="mh">
                  <span>{mm ? `${y}年${+mm}月` : m}</span>
                  <span className="num">{showMoney ? yen(sumAmt(groups[m])) : ''}</span>
                </div>
                <div className="list">
                  {groups[m].map((e) => (
                    <EntryCard key={e.id} e={e} onOpen={onOpen} />
                  ))}
                </div>
              </div>
            );
          })
      )}
      {list.length ? <p className="hint" style={{ marginTop: 16 }}>Last entry {fmtDate(list[0].date)}</p> : null}
    </section>
  );
}
