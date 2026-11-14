import { useState } from 'react';
import { setSettings } from '../lib/db';
import { fmtDate, iso, today, yen, yenShort } from '../lib/format';
import { KIND_LABEL, PERIOD_STEP, amt, chekisOf, eventCost, isLoop, periodStats, rangeOf, sumAmt, type Period } from '../lib/logic';
import type { Entry } from '../lib/types';
import { Bubbles, Columns, DataCtx, EntryCard, HBars, Tile, useColor, useData } from '../components/ui';

export function RecapView({ onOpen, revealed, onReveal }: { onOpen: (e: Entry) => void; revealed: Set<string>; onReveal: (key: string) => void }) {
  const data = useData();
  const { items, byId, settings } = data;
  const color = useColor();
  const [mode, setMode] = useState<Period>('month');
  const [anchor, setAnchor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const r = rangeOf(anchor, mode);
  const key = `${mode}:${r.S}`;
  const showMoney = !settings.hideMoney || revealed.has(key);
  const pr = rangeOf(new Date(r.s.getFullYear(), r.s.getMonth() - PERIOD_STEP[mode], 1), mode);
  const t = today();
  const P = items.filter((e) => e.date >= r.S && e.date < r.E);
  const PP = items.filter((e) => e.date >= pr.S && e.date < pr.E);
  const st = periodStats(P, t),
    pst = periodStats(PP, t);

  const parts: string[] = [];
  if (st.lives) parts.push(`went to ${st.lives} live${st.lives > 1 ? 's' : ''}`);
  if (st.chekis) parts.push(`took ${st.chekis} cheki${st.chekis > 1 ? 's' : ''}`);
  if (st.loops) parts.push(`kept ${st.loops} 特典会 memo${st.loops > 1 ? 's' : ''}`);
  let sentence: string;
  if (!P.length) sentence = 'Nothing logged in this period yet.';
  else if (showMoney) sentence = `You ${parts.length ? parts.join(', ') + ' and ' : ''}spent ${yen(st.spent)}.`;
  else sentence = parts.length ? `You ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : 'You logged some purchases.';
  let delta = '';
  if (showMoney && P.length) {
    if (pst.spent) {
      const d = Math.round(((st.spent - pst.spent) / pst.spent) * 100);
      delta = `${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}% spending vs ${pr.label}`;
    } else delta = `Nothing spent in ${pr.label}`;
  }

  const buckets: { label: string; value: number }[] = [];
  if (mode === 'month') {
    const last = new Date(r.s.getFullYear(), r.s.getMonth() + 1, 0).getDate();
    [[1, 7], [8, 14], [15, 21], [22, 28], [29, last]]
      .filter(([a]) => a <= last)
      .forEach(([a, b]) => buckets.push({ label: `${a}–${b}`, value: sumAmt(P.filter((e) => +e.date.slice(8, 10) >= a && +e.date.slice(8, 10) <= b)) }));
  } else
    for (let d = new Date(r.s); d < r.e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const p = iso(d).slice(0, 7);
      buckets.push({ label: `${d.getMonth() + 1}月`, value: sumAmt(P.filter((e) => e.date.startsWith(p))) });
    }
  const byK: Record<string, number> = {};
  P.forEach((e) => amt(e) && (byK[KIND_LABEL[e.kind]] = (byK[KIND_LABEL[e.kind]] ?? 0) + amt(e)));
  const byO: Record<string, number> = {},
    chO: Record<string, number> = {};
  P.forEach((e) => {
    if (!e.oshi) return;
    byO[e.oshi] = (byO[e.oshi] ?? 0) + amt(e);
    const c = chekisOf(e);
    if (c) chO[e.oshi] = (chO[e.oshi] ?? 0) + c;
  });
  const topO = Object.entries(byO).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topCh = Object.entries(chO).sort((a, b) => b[1] - a[1])[0];
  const evs = P.filter((e) => e.kind === 'event').sort((a, b) => eventCost(b, items) - eventCost(a, items));
  const talk = P.filter((e) => isLoop(e) && e.talk).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts)[0];
  const step = (n: number) => setAnchor(new Date(r.s.getFullYear(), r.s.getMonth() + n * PERIOD_STEP[mode], 1));

  return (
    <DataCtx.Provider value={{ ...data, showMoney }}>
    <section>
      <div className="period">
        <div className="seg">
          {(['month', 'quarter', 'year'] as Period[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div className="nav">
          <button type="button" aria-label="Previous period" onClick={() => step(-1)}>
            ‹
          </button>
          <button type="button" aria-label="Next period" onClick={() => step(1)}>
            ›
          </button>
        </div>
      </div>
      <div className="recap">
        <span className="eyebrow">{mode === 'month' ? 'Monthly' : mode === 'quarter' ? 'Quarterly' : 'Yearly'} recap</span>
        <h2>{r.label}</h2>
        <p>{sentence}</p>
        {delta ? <span className="delta">{delta}</span> : null}
        {!showMoney && P.length ? (
          <button className="btn sm" type="button" onClick={() => onReveal(key)}>
            Reveal what you spent
          </button>
        ) : null}
      </div>
      <div className="tiles" style={{ marginTop: 10 }}>
        <Tile label="Spent" value={yen(st.spent)} accent hidden={!showMoney} />
        <Tile label="Lives" value={st.lives} />
        <Tile label="Chekis" value={st.chekis} />
        <Tile label="Loops" value={st.loops} />
        <Tile label="Marche" value={st.marche} />
      </div>
      {P.length && showMoney ? (
        <>
          <div className="block">
            <h3>Spending over {mode === 'month' ? 'the month' : mode === 'quarter' ? 'the quarter' : 'the year'}</h3>
            <Columns data={buckets} money />
          </div>
          {Object.keys(byK).length ? (
            <div className="block">
              <h3>By type</h3>
              <HBars rows={Object.entries(byK).sort((a, b) => b[1] - a[1])} format={yen} />
            </div>
          ) : null}
          {topO.length ? (
            <div className="block">
              <h3>By oshi</h3>
              <HBars rows={topO} format={yenShort} style={color} labelOf={(k) => <span className="who" style={color(k)}>{k}</span>} />
            </div>
          ) : null}
        </>
      ) : null}
      {topCh ? (
        <div className="block">
          <h3>Most chekis</h3>
          <div className="panel">
            <span>
              <span className="who" style={color(topCh[0])}>
                {topCh[0]}
              </span>{' '}
              · <b className="num">{topCh[1]}</b> cheki{topCh[1] > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      ) : null}
      {evs.length ? (
        <div className="block">
          <h3>{showMoney ? 'Biggest live' : 'Lives this period'}</h3>
          <div className="list">
            {(showMoney ? evs.slice(0, 1) : evs.slice(0, 4)).map((e) => (
              <EntryCard key={e.id} e={e} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ) : null}
      {talk ? (
        <div className="block">
          <h3>Words to keep</h3>
          <div className="panel">
            <span className="meta">
              {fmtDate(talk.date)}
              {talk.oshi ? ' · ' + talk.oshi : ''}
              {talk.eventId && byId[talk.eventId] ? ' · ' + (byId[talk.eventId].title ?? '') : ''}
            </span>
            <Bubbles text={talk.talk} oshi={talk.oshi} limit={6} />
          </div>
        </div>
      ) : null}
      <div className="block">
        <h3>Spending privacy</h3>
        <div className="panel">
          <label className="switch">
            <input type="checkbox" checked={settings.hideMoney} onChange={(e) => setSettings({ hideMoney: e.target.checked })} /> Hide spending until my recap
          </label>
          <p className="hint">Amounts stay off the log, lives and wallet. You can still type them in. Reveal them per month, quarter or year here.</p>
        </div>
      </div>
    </section>
    </DataCtx.Provider>
  );
}
